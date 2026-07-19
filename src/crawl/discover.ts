import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { chromium, type Page, type Response } from "playwright";
import { isDeniedTag, isDeniedUrl } from "../denylist.js";
import { redactQuery, redactSecrets } from "../redact.js";
import type { CapturedExchange, CrawlOptions, EndpointRecord } from "../types.js";
import { extractMenuTree } from "./menuParser.js";
import {
  classifySessionState,
  extractActions,
  extractObjectNames,
  extractParaNames,
  extractTagsFromText,
  parseQuery,
  probeTypesForTag,
} from "./patternExtract.js";
import {
  ensureOutputDirs,
  writeDiscoverReport,
  writeText,
} from "../report/writeOutput.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function riskForTag(tag: string): EndpointRecord["risk"] {
  if (isDeniedTag(tag)) return "critical";
  if (/firewall|dmz|port.?forward|nat/i.test(tag)) return "high";
  if (/vlan|wifi|wlan|dhcp|lan/i.test(tag)) return "medium";
  return "low";
}

function baseUrl(routerUrl: string): string {
  return routerUrl.replace(/\/$/, "");
}

async function waitForManualLogin(): Promise<void> {
  const rl = createInterface({ input, output });
  console.log("");
  console.log(">>> CORRECT FLOW (do this once):");
  console.log(">>>   1) Log in in Chromium");
  console.log(">>>   2) Wait until the main home/dashboard GUI is visible");
  console.log(">>>   3) Press Enter here — the crawler visits menus itself");
  console.log(">>> Do NOT press Enter after each Internet/Local/WLAN tab.");
  console.log(">>> Optional: click a few menus before Enter to seed tags; still press Enter only once.");
  console.log("");
  await rl.question("Press Enter to start discover crawl… ");
  rl.close();
}

function previewBody(body: string, max = 4000): string {
  const redacted = redactSecrets(body);
  if (redacted.length <= max) return redacted;
  return `${redacted.slice(0, max)}\n…[truncated ${redacted.length - max} chars]`;
}

type ProbeResult = { status: number; body: string; method: string };

/**
 * Fetch from the page JS context so cookies/session match the GUI.
 * String evaluate avoids tsx __name injection into Playwright.
 */
async function sessionFetch(
  page: Page,
  pathAndQuery: string,
  method: "GET" | "POST",
): Promise<ProbeResult> {
  const payload = JSON.stringify({ pathAndQuery, method });
  return page.evaluate(`(async () => {
    const { pathAndQuery, method } = ${payload};
    /** @type {RequestInit} */
    const init = {
      method: method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    };
    if (method === "POST") {
      init.headers["Content-Type"] = "application/x-www-form-urlencoded";
      init.body = "";
    }
    const res = await fetch(pathAndQuery, init);
    return { status: res.status, body: await res.text(), method: method };
  })()`) as Promise<ProbeResult>;
}

async function probeReadTag(
  page: Page,
  type: string,
  tag: string,
): Promise<ProbeResult> {
  const pathAndQuery = `/?_type=${encodeURIComponent(type)}&_tag=${encodeURIComponent(tag)}&_=${Date.now()}`;
  // Home GUI uses dataTransfer(..., "GET", ...); try GET first, then read-style POST.
  let result = await sessionFetch(page, pathAndQuery, "GET");
  if (result.status === 404 || result.status === 405 || result.status === 0) {
    result = await sessionFetch(page, pathAndQuery, "POST");
  }
  return result;
}

/** Warm authenticated session with menuView/menuData via in-page fetch. */
async function warmSession(page: Page, _routerUrl: string): Promise<boolean> {
  const warmTags = [
    "firewall_homepage_lua.lua",
    "wlan_homepage_lua.lua",
    "accessdev_homepage_lua.lua",
    "sntp_data",
    "home",
    "status",
  ];

  for (const tag of warmTags) {
    for (const type of probeTypesForTag(tag)) {
      try {
        const result = await probeReadTag(page, type, tag);
        if (
          result.status >= 200 &&
          result.status < 300 &&
          classifySessionState(result.body) === "valid"
        ) {
          console.log(
            `[discover] session warm via ${result.method} ${type} _tag=${tag}`,
          );
          return true;
        }
      } catch {
        // try next
      }
    }
  }

  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    console.log("[discover] session warm via page reload");
  } catch {
    console.warn("[discover] session warm-up could not confirm a valid session");
  }
  return false;
}

export async function runDiscover(options: CrawlOptions): Promise<void> {
  if (options.mode !== "discover") {
    throw new Error(`runDiscover called with mode=${options.mode}`);
  }

  await ensureOutputDirs(options.outputDir);

  const exchanges: CapturedExchange[] = [];
  const allTags = new Set<string>();
  const allFields = new Set<string>();
  const objects: Record<string, unknown[]> = {};
  const endpoints: EndpointRecord[] = [];
  let requestCount = 0;
  let warmed = false;

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // Deep menu clicks sometimes open target=_blank / window.open — keep one tab.
  context.on("page", (extra) => {
    if (extra === page) return;
    void (async () => {
      try {
        const url = extra.url();
        console.warn(`[discover] closing extra tab/window: ${url || "(loading)"}`);
        await extra.close();
      } catch {
        // already closed
      }
    })();
  });

  // Do NOT block POSTs yet — operator login must be able to POST login_entry.
  // POST abort is installed only after the Enter handoff below.

  page.on("response", async (response: Response) => {
    try {
      await onResponse(response);
    } catch {
      // Ignore body read races for navigations.
    }
  });

  async function onResponse(response: Response): Promise<void> {
    const req = response.request();
    const url = response.url();
    if (!url.startsWith("http")) return;

    const method = req.method();
    const status = response.status();
    let contentType = "";
    try {
      contentType = response.headers()["content-type"] ?? "";
    } catch {
      contentType = "";
    }

    let body = "";
    try {
      if (
        /xml|text|javascript|json|html/i.test(contentType) ||
        url.includes("_type=")
      ) {
        body = await response.text();
      }
    } catch {
      return;
    }

    if (body) {
      for (const tag of extractTagsFromText(body)) allTags.add(tag);
      for (const name of extractParaNames(body)) allFields.add(name);
      for (const obj of extractObjectNames(body)) {
        objects[obj] ??= [];
      }
    }

    const u = new URL(url);
    exchanges.push({
      timestamp: new Date().toISOString(),
      method,
      path: u.pathname,
      query: redactQuery(parseQuery(url)),
      status,
      contentType: contentType || undefined,
      responseBodyPreview: previewBody(body),
      sessionState: classifySessionState(body),
    });

    if (body && /xml|OBJ_/i.test(body)) {
      const safeName = `resp-${exchanges.length}.xml`;
      await writeText(
        path.join(options.outputDir, "responses", safeName),
        redactSecrets(body),
      );
    }
  }

  console.log(`Opening ${options.routerUrl} …`);
  await page.goto(options.routerUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  await waitForManualLogin();

  // After handoff: allow ZTE read-style POSTs (menuData/menuView/hiddenData).
  // Block write-like POSTs (Apply / IF_ACTION / denied tags / unknown).
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const url = req.url();
      let type = "";
      let tag = "";
      try {
        const u = new URL(url);
        type = u.searchParams.get("_type") ?? "";
        tag = u.searchParams.get("_tag") ?? "";
      } catch {
        type = "";
      }
      const postData = req.postData() ?? "";
      const readType = /^(menuData|menuView|hiddenData)$/i.test(type);
      const looksWrite =
        /IF_ACTION|Apply|Save|Delete|Add|Modify|Upload|Upgrade/i.test(
          postData,
        ) || isDeniedTag(tag);

      if (readType && !looksWrite) {
        await route.continue();
        return;
      }

      console.warn(`[discover] blocked POST (post-login crawl): ${url}`);
      await route.abort();
      return;
    }
    await route.continue();
  });

  warmed = await warmSession(page, options.routerUrl);

  const html = await page.content();
  await writeText(
    path.join(options.outputDir, "pages", "index.html"),
    redactSecrets(html),
  );
  for (const tag of extractTagsFromText(html)) allTags.add(tag);

  const menuTree = await extractMenuTree(page);
  console.log(`Menu candidates (initial): ${menuTree.length}`);
  for (const node of menuTree) {
    if (node.tag) allTags.add(node.tag);
  }

  // Collect script URLs and download text for pattern mining.
  const scriptUrls = (await page.evaluate(`(() => {
    return Array.from(document.querySelectorAll("script[src]"))
      .map((e) => e.src)
      .filter((s) => Boolean(s));
  })()`)) as string[];

  let scriptIndex = 0;
  for (const scriptUrl of scriptUrls.slice(0, 40)) {
    if (isDeniedUrl(scriptUrl)) continue;
    try {
      const res = await page.request.get(scriptUrl);
      const text = await res.text();
      scriptIndex += 1;
      await writeText(
        path.join(options.outputDir, "scripts", `script-${scriptIndex}.js`),
        redactSecrets(text),
      );
      for (const tag of extractTagsFromText(text)) allTags.add(tag);
      await sleep(options.delayMs);
    } catch (err) {
      console.warn(`Script fetch failed: ${scriptUrl}`, err);
    }
  }

  // Walk menus BEFORE probing so Internet/Local/diag tags are discovered.
  const walkedMenu = await deepWalkMenus(page, menuTree, options, allTags);
  console.log(
    `Menu candidates (after walk): ${walkedMenu.length}; tags so far: ${allTags.size}`,
  );

  // Probe via in-page fetch; lua/_data tags prefer menuData first.
  const skipProbe = /^(login_entry|login_token|logout_entry)$/i;
  const tagsToProbe = [...allTags]
    .filter((t) => !isDeniedTag(t) && !skipProbe.test(t))
    .slice(0, Math.max(0, options.maxRequests - requestCount));

  console.log(
    `Probing ${tagsToProbe.length} tags (in-page GET, then read-style POST)…`,
  );

  for (const tag of tagsToProbe) {
    if (requestCount >= options.maxRequests) break;

    const types = probeTypesForTag(tag);
    const objectNames = new Set<string>();
    const fields = new Set<string>();
    const actions = new Set<string>();
    let bestStatus = 0;
    let bestBody = "";
    let sawTimeout = false;
    let viewTag: string | undefined;
    let dataTag: string | undefined;

    for (const type of types) {
      if (requestCount >= options.maxRequests) break;
      requestCount += 1;
      try {
        let result = await probeReadTag(page, type, tag);
        if (result.method === "POST") requestCount += 1;

        if (type === "menuView") viewTag = tag;
        if (type === "menuData") dataTag = tag;

        const sessionState = classifySessionState(result.body);
        exchanges.push({
          timestamp: new Date().toISOString(),
          method: result.method,
          path: "/",
          query: redactQuery({
            _type: type,
            _tag: tag,
          }),
          status: result.status,
          contentType: undefined,
          responseBodyPreview: previewBody(result.body),
          sessionState,
        });

        if (sessionState === "timeout") {
          sawTimeout = true;
          console.warn(`[discover] SessionTimeout for ${tag} — re-warming`);
          warmed = (await warmSession(page, options.routerUrl)) || warmed;
          if (requestCount >= options.maxRequests) break;
          requestCount += 1;
          result = await probeReadTag(page, type, tag);
          if (result.method === "POST") requestCount += 1;
          if (classifySessionState(result.body) === "timeout") {
            continue;
          }
        }

        if (result.status === 404) {
          continue;
        }

        const useful =
          result.status >= 200 &&
          result.status < 300 &&
          (classifySessionState(result.body) === "valid" ||
            extractObjectNames(result.body).length > 0 ||
            extractParaNames(result.body).length > 0);

        if (useful || bestStatus === 0) {
          bestStatus = result.status;
          bestBody = result.body;
        }

        for (const o of extractObjectNames(result.body)) objectNames.add(o);
        for (const f of extractParaNames(result.body)) {
          fields.add(f);
          allFields.add(f);
        }
        for (const a of extractActions(result.body)) actions.add(a);
        for (const t of extractTagsFromText(result.body)) allTags.add(t);

        for (const o of objectNames) {
          objects[o] ??= [];
          if (result.body.includes(o) && objects[o].length < 3) {
            objects[o].push({
              tag,
              type,
              method: result.method,
              status: result.status,
              preview: previewBody(result.body, 1500),
            });
          }
        }
      } catch (err) {
        console.warn(`Probe failed ${type}/${tag}`, err);
      }
      await sleep(options.delayMs);
    }

    endpoints.push({
      id: tag.replace(/[^\w.-]+/g, "_"),
      viewTag,
      dataTag: dataTag ?? tag,
      fields: [...fields],
      actionsDetected: [...actions],
      writeTested: false,
      risk: riskForTag(tag),
      status: bestStatus || undefined,
      objectNames: [...objectNames],
    });

    if (bestBody && objectNames.size > 0 && !sawTimeout) {
      await writeText(
        path.join(
          options.outputDir,
          "responses",
          `${tag.replace(/[^\w.-]+/g, "_")}.txt`,
        ),
        redactSecrets(bestBody),
      );
    }
  }

  enrichEndpointsFromExchanges(endpoints, exchanges);

  await writeDiscoverReport({
    outputDir: options.outputDir,
    routerUrl: options.routerUrl,
    menuTree: walkedMenu,
    endpoints,
    objects,
    fields: [...allFields].sort(),
    exchanges,
    tags: [...allTags].sort(),
    version: "0.1.7",
  });

  console.log("");
  console.log(`Done. Output: ${path.resolve(options.outputDir)}`);
  console.log(`Open ${path.join(options.outputDir, "report.html")} in a browser.`);
  console.log("Leave Chromium open for inspection, or close it. Press Ctrl+C if needed.");

  await sleep(2000);
  await browser.close();
}

async function deepWalkMenus(
  page: Page,
  initialMenu: { text: string; href?: string; tag?: string }[],
  options: CrawlOptions,
  allTags: Set<string>,
): Promise<{ text: string; href?: string; tag?: string; children: unknown[] }[]> {
  const merged = new Map<string, { text: string; href?: string; tag?: string; children: unknown[] }>();
  const remember = (nodes: { text: string; href?: string; tag?: string }[]) => {
    for (const n of nodes) {
      if (n.tag) allTags.add(n.tag);
      const key = `${n.text}|${n.tag ?? n.href ?? ""}`;
      if (!merged.has(key)) {
        merged.set(key, { ...n, children: [] });
      }
    }
  };
  remember(initialMenu);

  // Click common top-level labels to reveal Internet / Local / diag submenus.
  const topLabels = [
    "Internet",
    "Local Network",
    "Local",
    "WLAN",
    "Wi-Fi",
    "VoIP",
    "Voice",
    "Management",
    "Application",
    "Security",
    "Firewall",
    "Diagnosis",
    "Diagnostics",
    "Status",
    "USB",
  ];

  let clicked = 0;
  for (const label of topLabels) {
    if (clicked >= 12) break;
    try {
      const did = (await page.evaluate(`(() => {
        const want = ${JSON.stringify(label)}.toLowerCase();
        const els = Array.from(document.querySelectorAll("a, span, li, div, td"));
        const el = els.find((e) => {
          const t = (e.textContent || "").trim().replace(/\\s+/g, " ");
          return t && t.length < 40 && t.toLowerCase() === want;
        });
        if (!el) return false;
        // Stay in the same tab: neutralize target=_blank before click.
        if (el.tagName === "A") {
          el.setAttribute("target", "_self");
          el.removeAttribute("rel");
        }
        const opener = el.closest("a");
        if (opener) {
          opener.setAttribute("target", "_self");
        }
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        return true;
      })()`)) as boolean;
      if (!did) continue;
      clicked += 1;
      await sleep(options.delayMs);
      const html = await page.content();
      await writeText(
        path.join(
          options.outputDir,
          "pages",
          `top-${clicked}-${label.replace(/[^\w.-]+/g, "_")}.html`,
        ),
        redactSecrets(html),
      );
      for (const t of extractTagsFromText(html)) allTags.add(t);
      remember(await extractMenuTree(page));
    } catch {
      // skip missing labels / locales
    }
  }

  // Seed short view tags often used by Transfer_Meaning on F6600P-class GUIs.
  const seedViews = [
    "internet",
    "localnet",
    "localNet",
    "wlan",
    "voip",
    "usb",
    "firewall",
    "security",
    "mgmt",
    "management",
    "app",
    "diagnosis",
    "status",
    "devmgr",
    "ponopticalinfo",
  ];
  for (const tag of seedViews) {
    if (isDeniedTag(tag)) continue;
    allTags.add(tag);
    try {
      const result = await probeReadTag(page, "menuView", tag);
      if (result.status >= 200 && result.status < 300) {
        for (const t of extractTagsFromText(result.body)) allTags.add(t);
      }
      await sleep(Math.min(options.delayMs, 500));
    } catch {
      // ignore
    }
  }

  // Soft-navigate discovered menu nodes (menuData for lua tags).
  let navigated = 0;
  for (const item of [...merged.values()]) {
    if (navigated >= 40) break;
    const tag = item.tag ?? "";
    if (tag && isDeniedTag(tag)) continue;
    if (item.href && isDeniedUrl(item.href)) continue;

    try {
      if (item.href && item.href.startsWith("http")) {
        await page.goto(item.href, {
          waitUntil: "domcontentloaded",
          timeout: 15_000,
        });
      } else if (tag) {
        const type = /\.(lua|lp|gch)$/i.test(tag) ? "menuData" : "menuView";
        const result = await probeReadTag(page, type, tag);
        if (result.status === 404) continue;
        for (const t of extractTagsFromText(result.body)) allTags.add(t);
        // Prefer in-page fetch over full navigation (avoids new tabs / full reloads).
        if (type === "menuView") {
          const next = `/?_type=menuView&_tag=${encodeURIComponent(tag)}`;
          await page.evaluate(`(() => {
            window.location.assign(${JSON.stringify(next)});
          })()`).catch(() => undefined);
          await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
        }
      } else {
        continue;
      }
      navigated += 1;
      const html = await page.content();
      await writeText(
        path.join(
          options.outputDir,
          "pages",
          `menu-${navigated}-${(item.text || "page").slice(0, 40).replace(/[^\w.-]+/g, "_")}.html`,
        ),
        redactSecrets(html),
      );
      for (const t of extractTagsFromText(html)) allTags.add(t);
      remember(await extractMenuTree(page));
      await sleep(options.delayMs);
    } catch {
      // Skip fragile menu nodes.
    }
  }

  console.log(
    `[discover] deep walk: clicked=${clicked} softNav=${navigated} menuNodes=${merged.size}`,
  );
  return [...merged.values()];
}

/** Fill empty endpoint field/object lists from passive exchange previews. */
function enrichEndpointsFromExchanges(
  endpoints: EndpointRecord[],
  exchanges: CapturedExchange[],
): void {
  const byTag = new Map<string, CapturedExchange[]>();
  for (const ex of exchanges) {
    const tag = ex.query?._tag;
    if (!tag) continue;
    if (ex.status < 200 || ex.status >= 300) continue;
    if (ex.sessionState === "timeout") continue;
    const list = byTag.get(tag) ?? [];
    list.push(ex);
    byTag.set(tag, list);
  }

  for (const ep of endpoints) {
    const tag = ep.dataTag ?? ep.viewTag ?? ep.id;
    const samples = byTag.get(tag) ?? [];
    if (samples.length === 0) continue;

    const fields = new Set(ep.fields);
    const objects = new Set(ep.objectNames);
    const actions = new Set(ep.actionsDetected);
    let bestStatus = ep.status ?? 0;

    for (const sample of samples) {
      const body = sample.responseBodyPreview ?? "";
      for (const f of extractParaNames(body)) fields.add(f);
      for (const o of extractObjectNames(body)) objects.add(o);
      for (const a of extractActions(body)) actions.add(a);
      if (
        sample.status >= 200 &&
        sample.status < 300 &&
        (bestStatus === 0 || bestStatus === 404)
      ) {
        bestStatus = sample.status;
      }
    }

    ep.fields = [...fields].sort();
    ep.objectNames = [...objects].sort();
    ep.actionsDetected = [...actions].sort();
    if (bestStatus) ep.status = bestStatus;
  }
}
