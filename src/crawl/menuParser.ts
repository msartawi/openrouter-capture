import type { Page } from "playwright";

export interface MenuNode {
  text: string;
  href?: string;
  tag?: string;
  children: MenuNode[];
}

/**
 * Best-effort menu extraction for ZTE-style GUIs.
 * Looks for anchors, onclick Transfer_Meaning / menu helpers, and script blobs.
 */
export async function extractMenuTree(page: Page): Promise<MenuNode[]> {
  return page.evaluate(() => {
    const nodes: MenuNode[] = [];
    const seen = new Set<string>();

    const push = (text: string, href?: string, tag?: string) => {
      const t = text.trim().replace(/\s+/g, " ");
      if (!t || t.length > 80) return;
      const key = `${t}|${tag ?? href ?? ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      nodes.push({
        text: t,
        href: href || undefined,
        tag: tag || undefined,
        children: [],
      });
    };

    const tagFromBlob = (blob: string): string | undefined => {
      const patterns = [
        /_tag=([A-Za-z0-9_./-]+)/i,
        /Transfer_Meaning\s*\(\s*['"][^'"]+['"]\s*,\s*['"]([^'"]+)['"]/i,
        /(?:menuView|menuData|MenuClick|getMenu)\s*\(\s*['"]([^'"]+)['"]/i,
        /['"]([A-Za-z0-9_]+(?:_lua\.lua|\.lp|\.gch))['"]/i,
      ];
      for (const re of patterns) {
        const m = blob.match(re);
        if (m?.[1]) return m[1];
      }
      return undefined;
    };

    const els = Array.from(
      document.querySelectorAll(
        "a[href], [onclick], [data-tag], [data-menuid], li[id], span[onclick], div[onclick]",
      ),
    );

    for (const el of els) {
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
      let href =
        el instanceof HTMLAnchorElement ? el.getAttribute("href") ?? "" : "";
      const onclick = el.getAttribute("onclick") ?? "";
      const dataTag =
        el.getAttribute("data-tag") ??
        el.getAttribute("data-menuid") ??
        el.getAttribute("id") ??
        "";
      const blob = `${href} ${onclick} ${dataTag}`;
      const tag = tagFromBlob(blob) ?? (dataTag.includes("_") ? dataTag : undefined);

      if (!tag && !/_type=|menu|Transfer_Meaning/i.test(blob) && !href.includes("?")) {
        continue;
      }
      push(text || tag || "menu", href || undefined, tag);
    }

    // Mine inline scripts for Transfer_Meaning / _tag= menu entries.
    for (const script of Array.from(document.querySelectorAll("script:not([src])"))) {
      const src = script.textContent ?? "";
      const re =
        /Transfer_Meaning\s*\(\s*['"][^'"]+['"]\s*,\s*['"]([^'"]+)['"]\s*\)|_tag=([A-Za-z0-9_./-]+)/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const tag = (m[1] ?? m[2] ?? "").trim();
        if (tag) push(tag, undefined, tag);
      }
    }

    return nodes;
  });
}
