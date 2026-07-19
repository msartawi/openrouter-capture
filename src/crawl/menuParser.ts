import type { Page } from "playwright";

export interface MenuNode {
  text: string;
  href?: string;
  tag?: string;
  children: MenuNode[];
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
