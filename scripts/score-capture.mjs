#!/usr/bin/env node
/**
 * Score a discover capture folder against Stage 1 quality gates.
 *
 * Usage:
 *   node scripts/score-capture.mjs ./captures/zte-f6600p-v016
 *   node scripts/score-capture.mjs ./captures/zte-f6600p-v016 --raised
 *
 * Exit 0 = pass bar, Exit 1 = hard fail or below bar.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function usage() {
  console.error(
    "Usage: node scripts/score-capture.mjs <capture-dir> [--raised]",
  );
  process.exit(2);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function dirNonEmpty(dirPath) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return false;
  return readdirSync(dirPath).length > 0;
}

function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const raised = args.includes("--raised") || process.env.SCORE_RAISED === "1";
  const dirArg = args.find((a) => !a.startsWith("-"));
  if (!dirArg) usage();

  const captureDir = path.resolve(dirArg);
  const requiredFiles = [
    "router.json",
    "endpoints.json",
    "menu-tree.json",
    "requests/exchanges.json",
    "report.html",
  ];
  const hardFails = [];

  for (const rel of requiredFiles) {
    const p = path.join(captureDir, rel);
    if (!existsSync(p)) hardFails.push(`missing ${rel}`);
  }
  if (!dirNonEmpty(path.join(captureDir, "pages"))) {
    hardFails.push("empty or missing pages/");
  }
  if (!dirNonEmpty(path.join(captureDir, "scripts"))) {
    hardFails.push("empty or missing scripts/");
  }

  if (hardFails.length > 0) {
    const out = {
      captureDir,
      raised,
      pass: false,
      hardFails,
    };
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const endpoints = readJson(path.join(captureDir, "endpoints.json"));
  const menuTree = readJson(path.join(captureDir, "menu-tree.json"));
  const tagsDoc = readJson(path.join(captureDir, "tags.json"));
  const fieldsDoc = readJson(path.join(captureDir, "fields.json"));
  const objectsDoc = readJson(path.join(captureDir, "objects.json"));
  const exchangesDoc = readJson(path.join(captureDir, "requests/exchanges.json"));
  const exchanges = Array.isArray(exchangesDoc)
    ? exchangesDoc
    : (exchangesDoc.exchanges ?? []);

  const tags = Array.isArray(tagsDoc) ? tagsDoc : (tagsDoc.tags ?? []);
  const paraNames = Array.isArray(fieldsDoc)
    ? fieldsDoc
    : (fieldsDoc.paraNames ?? []);
  const objectNames = Array.isArray(objectsDoc)
    ? objectsDoc
    : Object.keys(objectsDoc ?? {});
  const menuRoot = Array.isArray(menuTree) ? menuTree : (menuTree.nodes ?? []);
  const menuNodes = countMenuNodes(menuRoot);

  const endpointList = Array.isArray(endpoints) ? endpoints : [];
  const withPayload = endpointList.filter(
    (e) =>
      (Array.isArray(e.fields) && e.fields.length > 0) ||
      (Array.isArray(e.objectNames) && e.objectNames.length > 0),
  );
  const withStatus = endpointList.filter(
    (e) => typeof e.status === "number" && e.status > 0,
  );
  const with2xx = withStatus.filter(
    (e) => e.status >= 200 && e.status < 300,
  );

  const exchangeList = Array.isArray(exchanges) ? exchanges : [];
  const statusHistogram = {};
  let timeoutCount = 0;
  for (const ex of exchangeList) {
    const s = String(ex.status ?? "unknown");
    statusHistogram[s] = (statusHistogram[s] ?? 0) + 1;
    if (ex.sessionState === "timeout") timeoutCount += 1;
  }

  const endpointCount = endpointList.length;
  const richCount = withPayload.length;
  const richRatio = endpointCount === 0 ? 0 : richCount / endpointCount;
  const probed2xxRatio =
    withStatus.length === 0 ? 0 : with2xx.length / withStatus.length;

  const richRatioBar = raised ? 0.6 : 0.4;
  const gates = {
    menuNodes: { value: menuNodes, min: 8, pass: menuNodes >= 8 },
    tags: { value: tags.length, min: 25, pass: tags.length >= 25 },
    richRatio: {
      value: Number(richRatio.toFixed(4)),
      min: richRatioBar,
      pass: richRatio >= richRatioBar,
    },
    probed2xxRatio: {
      value: Number(probed2xxRatio.toFixed(4)),
      min: 0.7,
      pass: withStatus.length === 0 ? false : probed2xxRatio >= 0.7,
    },
    richAbsolute: {
      value: richCount,
      min: 12,
      pass: richCount >= 12,
    },
  };

  const gateFails = Object.entries(gates)
    .filter(([, g]) => !g.pass)
    .map(([name, g]) => `${name}: ${g.value} (need >= ${g.min})`);

  const pass = gateFails.length === 0;
  const out = {
    captureDir,
    raised,
    pass,
    metrics: {
      menuNodes,
      tags: tags.length,
      endpoints: endpointCount,
      richEndpoints: richCount,
      richRatio: Number(richRatio.toFixed(4)),
      probedEndpoints: withStatus.length,
      probed2xx: with2xx.length,
      probed2xxRatio: Number(probed2xxRatio.toFixed(4)),
      paraNames: paraNames.length,
      objects: objectNames.length,
      exchanges: exchangeList.length,
      sessionTimeouts: timeoutCount,
      statusHistogram,
    },
    gates,
    gateFails,
  };

  console.log(JSON.stringify(out, null, 2));
  process.exit(pass ? 0 : 1);
}

function countMenuNodes(nodes) {
  let n = 0;
  const walk = (list) => {
    if (!Array.isArray(list)) return;
    for (const node of list) {
      n += 1;
      if (node?.children) walk(node.children);
    }
  };
  walk(nodes);
  return n;
}

main();
