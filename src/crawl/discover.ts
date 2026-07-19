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
  console.log(">>> Log in to the router in the Chromium window.");
  console.log(">>> When the GUI is fully loaded, return here and press Enter.");
  console.log("");
  await rl.question("Press Enter to start discover crawl… ");
  rl.close();
}

function previewBody(body: string, max = 4000): string {
  const redacted = redactSecrets(body);
  if (redacted.length <= max) return redacted;
  return `${redacted.slice(0, max)}\n…[truncated ${redacted.length - max} chars]`;
}

/** Warm authenticated session with menuView-first GETs (no POST). */
async function warmSession(page: Page, routerUrl: string): Promise<boolean> {
  const base = baseUrl(routerUrl);
  const warmTags = [
    "home",
    "status",
    "devmgr",
    "localnet",
    "internet",
    "wlan_homepage_lua.lua",
    "accessdev_homepage_lua.lua",
  ];

  for (const tag of warmTags) {
    try {
      const url = `${base}/?_type=menuView&_tag=${encodeURIComponent(tag)}`;
      const res = await page.request.get(url);
      const body = await res.text();
      if (classifySessionState(body) === "valid") {
        console.log(`[discover] session warm via menuView _tag=${tag}`);
        return true;
      }
    } catch {
      // try next
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

  // Discover mode: never let the crawler issue POSTs after login handoff.
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      console.warn(`[discover] blocked POST: ${req.url()}`);
      await route.abort();
      return;
    }
    await route.continue();
  });

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

  // Allow login POSTs: remove abort route during manual login, then re-apply.
  await page.unroute("**/*");
  await waitForManualLogin();

  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      console.warn(`[discover] blocked POST: ${req.url()}`);
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
  console.log(`Menu candidates: ${menuTree.length}`);
  for (const node of menuTree) {
    if (node.tag) allTags.add(node.tag);
  }

  // Collect script URLs and download text for pattern mining.
  const scriptUrls = await page.$$eval("script[src]", (els) =>
    els
      .map((e) => (e as HTMLScriptElement).src)
      .filter((s) => Boolean(s)),
  );

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
      for (const action of extractActions(text)) {
        void action;
      }
      await sleep(options.delayMs);
    } catch (err) {
      console.warn(`Script fetch failed: ${scriptUrl}`, err);
    }
  }

  // Prefer menuView before menuData (warm-up order) for discovered tags.
  const tagsToProbe = [...allTags].filter((t) => !isDeniedTag(t)).slice(
    0,
    Math.max(0, options.maxRequests - requestCount),
  );

  console.log(`Probing ${tagsToProbe.length} tags (read-only GETs)…`);

  for (const tag of tagsToProbe) {
    if (requestCount >= options.maxRequests) break;

    const candidates = [
      `${baseUrl(options.routerUrl)}/?_type=menuView&_tag=${encodeURIComponent(tag)}`,
      `${baseUrl(options.routerUrl)}/?_type=menuData&_tag=${encodeURIComponent(tag)}`,
      `${baseUrl(options.routerUrl)}/?_type=hiddenData&_tag=${encodeURIComponent(tag)}`,
    ];

    const objectNames = new Set<string>();
    const fields = new Set<string>();
    const actions = new Set<string>();
    let lastStatus = 0;
    let sampleBody = "";
    let sawTimeout = false;

    for (const probeUrl of candidates) {
      if (requestCount >= options.maxRequests) break;
      requestCount += 1;
      try {
        const res = await page.request.get(probeUrl);
        lastStatus = res.status();
        const body = await res.text();
        sampleBody = body;
        const sessionState = classifySessionState(body);

        if (sessionState === "timeout") {
          sawTimeout = true;
          console.warn(`[discover] SessionTimeout for ${tag} — re-warming`);
          warmed = (await warmSession(page, options.routerUrl)) || warmed;
          if (requestCount >= options.maxRequests) break;
          requestCount += 1;
          const retry = await page.request.get(probeUrl);
          lastStatus = retry.status();
          sampleBody = await retry.text();
          if (classifySessionState(sampleBody) === "timeout") {
            break;
          }
        }

        for (const o of extractObjectNames(sampleBody)) objectNames.add(o);
        for (const f of extractParaNames(sampleBody)) {
          fields.add(f);
          allFields.add(f);
        }
        for (const a of extractActions(sampleBody)) actions.add(a);

        for (const o of objectNames) {
          objects[o] ??= [];
          if (sampleBody.includes(o) && objects[o].length < 3) {
            objects[o].push({
              tag,
              status: lastStatus,
              preview: previewBody(sampleBody, 1500),
            });
          }
        }
      } catch (err) {
        console.warn(`Probe failed ${probeUrl}`, err);
      }
      await sleep(options.delayMs);
    }

    endpoints.push({
      id: tag.replace(/[^\w.-]+/g, "_"),
      dataTag: tag,
      fields: [...fields],
      actionsDetected: [...actions],
      writeTested: false,
      risk: riskForTag(tag),
      status: lastStatus || undefined,
      objectNames: [...objectNames],
    });

    if (sampleBody && objectNames.size > 0 && !sawTimeout) {
      await writeText(
        path.join(
          options.outputDir,
          "responses",
          `${tag.replace(/[^\w.-]+/g, "_")}.txt`,
        ),
        redactSecrets(sampleBody),
      );
    }
  }

  await softNavigateMenus(page, menuTree, options);

  await writeDiscoverReport({
    outputDir: options.outputDir,
    routerUrl: options.routerUrl,
    menuTree,
    endpoints,
    objects,
    fields: [...allFields].sort(),
    exchanges,
    tags: [...allTags].sort(),
    version: "0.1.1",
  });

  console.log("");
  console.log(`Done. Output: ${path.resolve(options.outputDir)}`);
  console.log(`Open ${path.join(options.outputDir, "report.html")} in a browser.`);
  console.log("Leave Chromium open for inspection, or close it. Press Ctrl+C if needed.");

  await sleep(2000);
  await browser.close();
}

async function softNavigateMenus(
  page: Page,
  menuTree: { text: string; href?: string; tag?: string }[],
  options: CrawlOptions,
): Promise<void> {
  let navigated = 0;
  for (const item of menuTree) {
    if (navigated >= 30) break;
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
        const url = `${baseUrl(options.routerUrl)}/?_type=menuView&_tag=${encodeURIComponent(tag)}`;
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 15_000,
        });
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
      await sleep(options.delayMs);
    } catch {
      // Skip fragile menu nodes.
    }
  }
}
