import type { Page } from "playwright";

export interface MenuNode {
  text: string;
  href?: string;
  tag?: string;
  children: MenuNode[];
}

export interface EmbeddedMenuHarvest {
  tree: MenuNode[];
  /** Menu ids + area page tags (`.lp` / `.lua`) from menuTreeJSON. */
  tags: string[];
}

/**
 * Best-effort menu extraction for ZTE-style GUIs.
 * Uses a string evaluate body so tsx/esbuild cannot inject __name into the browser.
 */
export async function extractMenuTree(page: Page): Promise<MenuNode[]> {
  // String source avoids Playwright+tsx "__name is not defined" in page.evaluate.
  return page.evaluate(`(() => {
    const nodes = [];
    const seen = new Set();

    const push = (text, href, tag) => {
      const t = String(text || "").trim().replace(/\\s+/g, " ");
      if (!t || t.length > 80) return;
      const key = t + "|" + (tag || href || "");
      if (seen.has(key)) return;
      seen.add(key);
      nodes.push({
        text: t,
        href: href || undefined,
        tag: tag || undefined,
        children: [],
      });
    };

    const tagFromBlob = (blob) => {
      const patterns = [
        /_tag=([A-Za-z0-9_./-]+)/i,
        /Transfer_Meaning\\s*\\(\\s*['"][^'"]+['"]\\s*,\\s*['"]([^'"]+)['"]/i,
        /(?:menuView|menuData|MenuClick|getMenu)\\s*\\(\\s*['"]([^'"]+)['"]/i,
        /['"]([A-Za-z0-9_]+(?:_lua\\.lua|\\.lp|\\.gch))['"]/i,
      ];
      for (const re of patterns) {
        const m = blob.match(re);
        if (m && m[1]) return m[1];
      }
      return undefined;
    };

    const els = Array.from(
      document.querySelectorAll(
        "a[href], [onclick], [data-tag], [data-menuid], li[id], span[onclick], div[onclick]",
      ),
    );

    for (const el of els) {
      const text = (el.textContent || "").trim().replace(/\\s+/g, " ");
      let href = el.tagName === "A" ? el.getAttribute("href") || "" : "";
      const onclick = el.getAttribute("onclick") || "";
      const dataTag =
        el.getAttribute("data-tag") ||
        el.getAttribute("data-menuid") ||
        el.getAttribute("id") ||
        "";
      const blob = href + " " + onclick + " " + dataTag;
      let tag = tagFromBlob(blob);
      if (!tag && dataTag.includes("_")) tag = dataTag;

      if (!tag && !/_type=|menu|Transfer_Meaning/i.test(blob) && href.indexOf("?") === -1) {
        continue;
      }
      push(text || tag || "menu", href || undefined, tag);
    }

    for (const script of Array.from(document.querySelectorAll("script:not([src])"))) {
      const src = script.textContent || "";
      const re =
        /Transfer_Meaning\\s*\\(\\s*['"][^'"]+['"]\\s*,\\s*['"]([^'"]+)['"]\\s*\\)|_tag=([A-Za-z0-9_./-]+)/gi;
      let m;
      while ((m = re.exec(src)) !== null) {
        const tag = (m[1] || m[2] || "").trim();
        if (tag) push(tag, undefined, tag);
      }
    }

    return nodes;
  })()`) as Promise<MenuNode[]>;
}

type RawMenuJson = {
  id?: string;
  name?: string;
  children?: RawMenuJson[];
  area?: Array<{ area?: string } | string>;
};

/**
 * Parse ZTE `var menuTreeJSON = [...]` from home HTML (authoritative menu catalog).
 */
export function harvestMenuTreeJson(html: string): EmbeddedMenuHarvest {
  const match = html.match(/var\s+menuTreeJSON\s*=\s*(\[\{[\s\S]*?\}\]);/);
  if (!match?.[1]) {
    return { tree: [], tags: [] };
  }

  let raw: RawMenuJson[];
  try {
    raw = JSON.parse(match[1]) as RawMenuJson[];
  } catch {
    return { tree: [], tags: [] };
  }

  const tags = new Set<string>();

  const convert = (nodes: RawMenuJson[]): MenuNode[] =>
    nodes.map((n) => {
      const id = String(n.id ?? "").trim();
      const name = String(n.name ?? id).trim() || id;
      if (id) tags.add(id);

      const areas: string[] = [];
      for (const a of n.area ?? []) {
        const area =
          typeof a === "string" ? a.trim() : String(a?.area ?? "").trim();
        if (area) {
          areas.push(area);
          tags.add(area);
        }
      }

      return {
        text: name,
        tag: id || undefined,
        href: areas[0],
        children: convert(n.children ?? []),
      };
    });

  const tree = convert(Array.isArray(raw) ? raw : []);
  return { tree, tags: [...tags].sort() };
}

/** Prefer probing page/data tags over bare section stubs. */
export function isLikelyDataTag(tag: string): boolean {
  return (
    /\.(lua|gch)$/i.test(tag) ||
    /_data$/i.test(tag) ||
    /_homepage_/i.test(tag) ||
    /_m\.lua$/i.test(tag)
  );
}

/**
 * `.lp` entries in menuTreeJSON are template paths, not ajax `_tag` values.
 * Probing them as `_tag` yields SessionTimeout noise on F6600P-class GUIs.
 */
export function isTemplatePathTag(tag: string): boolean {
  return /\.lp$/i.test(tag);
}

/**
 * Map template area names to likely ajax `_tag` values used by ZTE GUIs.
 * Prefer a single high-signal guess per area to avoid probe-budget exhaustion.
 * Example: `firewall_config_t.lp` → `firewall_config_lua.lua`
 */
export function deriveAjaxTagsFromTemplate(tag: string): string[] {
  if (!/\.(lp|lua|gch)$/i.test(tag)) return [];
  const out = new Set<string>();
  if (/\.lua$/i.test(tag)) {
    out.add(tag);
    return [...out];
  }

  const base = tag.replace(/\.(lp|gch)$/i, "");
  if (/_t$/i.test(base)) {
    const stem = base.replace(/_t$/i, "");
    out.add(`${stem}_lua.lua`);
    // Common non-lua data tags seen on F6600P-class GUIs.
    if (/^(sntp|accessdev)$/i.test(stem)) {
      out.add(`${stem}_data`);
    }
  } else if (/_m$/i.test(base)) {
    out.add(`${base}.lua`);
  } else {
    out.add(`${base}_lua.lua`);
  }

  return [...out];
}

export function isSectionStubTag(tag: string): boolean {
  if (isLikelyDataTag(tag) || isTemplatePathTag(tag)) return false;
  if (/_entry$/i.test(tag)) return false;
  return /^[A-Za-z][A-Za-z0-9]*$/.test(tag);
}
