import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CapturedExchange, EndpointRecord } from "../types.js";

export async function ensureOutputDirs(outputDir: string): Promise<void> {
  for (const sub of [
    "",
    "pages",
    "scripts",
    "requests",
    "responses",
  ]) {
    await mkdir(path.join(outputDir, sub), { recursive: true });
  }
}

export async function writeJson(
  filePath: string,
  data: unknown,
): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function writeText(filePath: string, text: string): Promise<void> {
  await writeFile(filePath, text, "utf8");
}

export async function writeDiscoverReport(args: {
  outputDir: string;
  routerUrl: string;
  menuTree: unknown;
  endpoints: EndpointRecord[];
  objects: Record<string, unknown[]>;
  fields: string[];
  exchanges: CapturedExchange[];
  tags: string[];
  version?: string;
}): Promise<void> {
  const { outputDir } = args;

  await writeJson(path.join(outputDir, "router.json"), {
    url: args.routerUrl,
    capturedAt: new Date().toISOString(),
    mode: "discover",
    tool: "openrouter-capture",
    version: args.version ?? "0.1.12",
  });

  await writeJson(path.join(outputDir, "menu-tree.json"), args.menuTree);
  await writeJson(path.join(outputDir, "endpoints.json"), args.endpoints);
  await writeJson(path.join(outputDir, "objects.json"), args.objects);
  await writeJson(path.join(outputDir, "fields.json"), {
    paraNames: args.fields,
  });
  await writeJson(path.join(outputDir, "tags.json"), { tags: args.tags });
  await writeJson(path.join(outputDir, "requests", "exchanges.json"), {
    exchanges: args.exchanges,
  });

  const rows = args.endpoints
    .map(
      (e) =>
        `<tr><td>${escapeHtml(e.id)}</td><td>${escapeHtml(e.dataTag ?? e.viewTag ?? "")}</td><td>${e.risk}</td><td>${(e.objectNames ?? []).join(", ")}</td></tr>`,
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>openrouter-capture report</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; background: #0b0e14; color: #f4f7fb; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #333; padding: 0.5rem; text-align: left; }
    th { background: #111620; }
    a { color: #63d5ff; }
  </style>
</head>
<body>
  <h1>openrouter-capture — discover report</h1>
  <p>Router: ${escapeHtml(args.routerUrl)}</p>
  <p>Tags: ${args.tags.length} · Endpoints: ${args.endpoints.length} · Fields: ${args.fields.length}</p>
  <table>
    <thead><tr><th>Id</th><th>Tag</th><th>Risk</th><th>Objects</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
</body>
</html>
`;

  await writeText(path.join(outputDir, "report.html"), html);
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
