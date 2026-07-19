import type { Page } from "playwright";

/** ZTE F6600P-class login form selectors (operator-provided). */
export const LOGIN_SELECTORS = {
  username: "#Frm_Username",
  password: "#Frm_Password",
  submit: "#LoginId",
} as const;

export async function autoLogin(
  page: Page,
  credentials: { username: string; password: string },
): Promise<void> {
  const { username, password } = credentials;
  if (!username || !password) {
    throw new Error("autoLogin requires both username and password");
  }

  console.log("[discover] auto-login: waiting for login form…");
  await page.waitForSelector(LOGIN_SELECTORS.username, {
    state: "visible",
    timeout: 60_000,
  });
  await page.waitForSelector(LOGIN_SELECTORS.password, {
    state: "visible",
    timeout: 30_000,
  });
  await page.waitForSelector(LOGIN_SELECTORS.submit, {
    state: "visible",
    timeout: 30_000,
  });

  await page.fill(LOGIN_SELECTORS.username, username);
  await page.fill(LOGIN_SELECTORS.password, password);
  console.log(`[discover] auto-login: submitting as ${username} (password not logged)`);

  await Promise.all([
    page.click(LOGIN_SELECTORS.submit),
    // Login may navigate or swap DOM in place.
    page
      .waitForSelector(LOGIN_SELECTORS.username, {
        state: "hidden",
        timeout: 60_000,
      })
      .catch(() => undefined),
  ]);

  // Extra settle: home GUI often loads after login XML/JSON.
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await new Promise((r) => setTimeout(r, 1500));

  const stillOnLogin = await page.$(LOGIN_SELECTORS.username);
  if (stillOnLogin && (await stillOnLogin.isVisible().catch(() => false))) {
    throw new Error(
      "auto-login failed: login form still visible (check username/password)",
    );
  }

  console.log("[discover] auto-login: succeeded; starting crawl");
}
