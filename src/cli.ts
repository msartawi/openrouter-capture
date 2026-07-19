#!/usr/bin/env node
import path from "node:path";
import { runDiscover } from "./crawl/discover.js";
import { loadDotEnv } from "./loadEnv.js";
import { DEFAULTS, type CrawlMode, type CrawlOptions } from "./types.js";

loadDotEnv();

function printHelp(): void {
  console.log(`openrouter-capture — local router API discovery (not part of OpenRouterDesk)

Usage:
  npm run capture -- crawl --router <url> --output <dir> --mode discover [options]

Options:
  --router <url>       Router base URL (default http://192.168.1.1)
  --output <dir>       Output directory (default ./captures/zte-f6600p)
  --mode <mode>        discover | simulate | verify (default discover)
  --username <name>    Auto-login username (or ROUTER_USERNAME env)
  --password <pass>    Auto-login password (or ROUTER_PASSWORD env)
  --delay-ms <n>       Delay between probes (default ${DEFAULTS.delayMs})
  --max-requests <n>   Max probe requests (default ${DEFAULTS.maxRequests})
  --read-only          Force discover constraints (blocks verify)

When --username and --password are both set, discover fills #Frm_Username /
#Frm_Password and clicks #LoginId, then crawls without pressing Enter.
Otherwise log in manually and press Enter once in the terminal.

Never commit passwords. Prefer env vars over shell history when possible.

Examples:
  npm run capture -- crawl --router http://192.168.1.1 --output ./captures/zte-f6600p --mode discover --username admin --password "secret"
`);
}

function parseArgs(argv: string[]): {
  command: string;
  options: CrawlOptions;
} {
  const args = [...argv];
  const command = args.shift() ?? "help";

  let routerUrl = process.env.ROUTER_URL?.trim() || "http://192.168.1.1";
  let outputDir = "./captures/zte-f6600p";
  let mode: CrawlMode = "discover";
  let delayMs = DEFAULTS.delayMs;
  let maxRequests = DEFAULTS.maxRequests;
  let readOnly = false;
  let username = process.env.ROUTER_USERNAME?.trim() || undefined;
  let password = process.env.ROUTER_PASSWORD || undefined;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const next = args[i + 1];
    switch (a) {
      case "--router":
        routerUrl = next ?? routerUrl;
        i += 1;
        break;
      case "--output":
        outputDir = next ?? outputDir;
        i += 1;
        break;
      case "--mode":
        mode = (next as CrawlMode) ?? mode;
        i += 1;
        break;
      case "--username":
        username = next ?? username;
        i += 1;
        break;
      case "--password":
        password = next ?? password;
        i += 1;
        break;
      case "--delay-ms":
        delayMs = Number(next ?? delayMs);
        i += 1;
        break;
      case "--max-requests":
        maxRequests = Number(next ?? maxRequests);
        i += 1;
        break;
      case "--read-only":
        readOnly = true;
        break;
      case "--help":
      case "-h":
        return { command: "help", options: emptyOptions() };
      default:
        break;
    }
  }

  if (readOnly) {
    mode = "discover";
  }

  return {
    command,
    options: {
      routerUrl,
      outputDir: path.resolve(outputDir),
      mode,
      delayMs,
      maxRequests,
      readOnly,
      username,
      password,
    },
  };
}

function emptyOptions(): CrawlOptions {
  return {
    routerUrl: "http://192.168.1.1",
    outputDir: path.resolve("./captures/zte-f6600p"),
    mode: "discover",
    delayMs: DEFAULTS.delayMs,
    maxRequests: DEFAULTS.maxRequests,
    readOnly: true,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help") {
    printHelp();
    return;
  }

  const { command, options } = parseArgs(argv);

  if (command === "help") {
    printHelp();
    return;
  }

  if (command !== "crawl" && command !== "scenario") {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (command === "scenario" || options.mode === "verify") {
    console.error(
      "Stage 3 verify / scenario is not implemented yet. Use --mode discover.",
    );
    process.exitCode = 1;
    return;
  }

  if (options.mode === "simulate") {
    console.error(
      "Stage 2 simulate is not implemented yet. Use --mode discover.",
    );
    process.exitCode = 1;
    return;
  }

  if (options.mode === "discover") {
    await runDiscover(options);
    return;
  }

  console.error(`Unsupported mode: ${options.mode}`);
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
