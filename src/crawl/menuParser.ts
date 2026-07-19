import type { Page } from "playwright";

export interface MenuNode {
  text: string;
  href?: string;
  tag?: string;
  children: MenuNode[];
}

/** Best-effort menu extraction from common ZTE GUI link patterns. */
export async function extractMenuTree(page: Page): Promise<MenuNode[]> {
  return page.evaluate(() => {
    const nodes: MenuNode[] = [];
    const seen = new Set<string>();

    const anchors = Array.from(document.querySelectorAll("a[href], [onclick]"));
    for (const el of anchors) {
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
      if (!text || text.length > 80) continue;

      let href =
        el instanceof HTMLAnchorElement ? el.getAttribute("href") ?? "" : "";
      const onclick = el.getAttribute("onclick") ?? "";
      const blob = `${href} ${onclick}`;
      const tagMatch = blob.match(/_tag=([A-Za-z0-9_./-]+)/);
      const tag = tagMatch?.[1];

      const key = `${text}|${tag ?? href}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (!tag && !/_type=|menu/i.test(blob) && !href.includes("?")) {
        continue;
      }

      nodes.push({
        text,
        href: href || undefined,
        tag,
        children: [],
      });
    }

    return nodes;
  });
}
