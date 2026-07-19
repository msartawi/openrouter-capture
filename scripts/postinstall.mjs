import { execSync } from "node:child_process";

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === "1") {
  process.exit(0);
}

execSync("npx playwright install chromium", { stdio: "inherit" });
