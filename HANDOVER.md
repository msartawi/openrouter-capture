# Handover — openrouter-capture

**Audience:** coding agents and maintainers opening `c:\Projects\openrouter-capture` (separate Cursor window from OpenRouterDesk).

**Public repo (already exists):** https://github.com/msartawi/openrouter-capture  
**Owner:** `msartawi` (personal account — not an org)  
**Product sibling:** https://github.com/msartawi/openrouterdesk  

This file is the agent handoff. Human entry: [START_HERE.md](START_HERE.md). Local agent contract (gitignored): `AGENTS.md`.

---

## What this project is

Standalone **Playwright** CLI to discover ZTE home-gateway web APIs (F6600P first) so OpenRouterDesk adapters can be completed.

```text
openrouter-capture  →  sanitized fixtures/catalogs  →  openrouterdesk adapters
```

It is **not** the Electron app. Never merge this crawler into `openrouterdesk` as `apps/inspector` or ship raw captures there. Methodology for the product repo: [OPENROUTER_CAPTURE.md](https://github.com/msartawi/openrouterdesk/blob/main/docs/OPENROUTER_CAPTURE.md) · [ADR 0007](https://github.com/msartawi/openrouterdesk/blob/main/docs/decisions/0007-standalone-capture-tool.md).

---

## Current state (as of handover)

| Item | Status |
|---|---|
| Local path | `c:\Projects\openrouter-capture` |
| Git | Initialized; `origin` → `msartawi/openrouter-capture` |
| GitHub | **Public** repo exists (MIT, Issues on, Wiki off) |
| Default branch | `main` only (no `develop` / `beta` yet — optional parity with openrouterdesk) |
| Topics | `playwright`, `typescript`, `router`, `zte`, `api-discovery`, `openrouterdesk` |
| CODEOWNERS | `@msartawi` |
| CI | `.github/workflows/ci.yml` present; Dependabot open |
| Stage 1 `discover` | Implemented — **first production** (`v0.1.0`) |
| Stage 2 `simulate` | Stub (CLI exits with not implemented) |
| Stage 3 `verify` / `scenario` | Stub |
| Stable release | GitHub Release on tag `v*` (see `docs/RELEASE_PROCESS.md`) |
| Raw captures | `./captures/` gitignored — never commit |
| Agent files | `.cursor/`, `AGENT.md`, `AGENTS.md` gitignored |

### Run Stage 1

```powershell
cd c:\Projects\openrouter-capture
npm install
npm run capture -- crawl --router http://192.168.1.1 --output ./captures/zte-f6600p --mode discover
```

1. Headed Chromium opens → operator logs in manually.  
2. Press Enter in the terminal.  
3. Tool GETs only; POSTs aborted after login handoff.  
4. Output: `router.json`, `menu-tree.json`, `endpoints.json`, `objects.json`, `fields.json`, `pages/`, `scripts/`, `requests/`, `responses/`, `report.html`.

### Key source map

```text
src/cli.ts                 CLI parse + mode gate
src/denylist.ts            Auto-submit / risky-tag denylist
src/types.ts               CrawlOptions, EndpointRecord, CapturedExchange
src/crawl/discover.ts      Stage 1 crawl
src/crawl/menuParser.ts    Menu candidates from DOM
src/crawl/patternExtract.ts  _tag / OBJ_* / ParaName / SessionTimeout
src/report/writeOutput.ts  JSON + HTML report writers
scripts/postinstall.mjs    Playwright Chromium install helper
```

---

## Safety rules (non-negotiable)

- Authorized routers only. No credential guessing / exploit PoCs.  
- `discover`: no crawler POSTs after login.  
- Denylist: reboot/reset/firmware/WAN/password/PON/DMZ-class tags.  
- Never commit: `captures/`, `*.har`, cookies, `storage-state.json`, `.env`.  
- Hand-curate **sanitized** fixtures before copying anything into `openrouterdesk`.  
- Do not auto-enable `simulate`/`verify` without explicit denylist + approval UX.

---

## GitHub parity with openrouterdesk — done vs remaining

### Already in place

- Public `msartawi/openrouter-capture`  
- MIT, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, SUPPORT, TRADEMARKS, CHANGELOG  
- CODEOWNERS `@msartawi`  
- CI workflow + Dependabot  
- `.npmrc` / `.nvmrc` (Node 24)  
- Agent paths gitignored  

### Still worth doing (when asked)

1. Optional long-lived branches: `develop`, `beta` (match openrouterdesk).  
2. Ruleset on `main`: require PR, 1 review, conversation resolution, no force-push/delete; admin bypass for solo owner.  
3. Enable private vulnerability reporting, secret scanning, push protection (if not already).  
4. Close or fix failing Dependabot PRs (e.g. TypeScript 7 bump failed CI earlier).  
5. Pin Actions versions / keep CI green on `main`.  
6. First Issues: Stage 2 simulate, Stage 3 verify, F6600P auth warm-up, redaction audit.  
7. Do **not** publish signing secrets or live router dumps.

Suggested About (already close):

> Local Playwright helper to discover router web APIs for OpenRouterDesk (ZTE F6600P first). Not part of the desktop app.

---

## Relationship to OpenRouterDesk agent window

| Window | Path | Repo |
|---|---|---|
| Product app | `c:\Projects\openrouterdesk-starter` | `msartawi/openrouterdesk` |
| Capture helper | `c:\Projects\openrouter-capture` | `msartawi/openrouter-capture` |

- Product UI / Electron / adapters → **openrouterdesk** only.  
- Crawl / simulate / verify / raw captures → **openrouter-capture** only.  
- Publish as owner **`msartawi`**; do not invent a contributor persona.  
- Do not push/PR/merge unless the user asks in that turn.  
- Skip builds when user says docs/review only.

---

## Recommended next implementation (Stage 2+)

1. Harden `discover`: session warm-up (`menuView` before `menuData`), better menu tree, redaction of SID/token in saved exchanges.  
2. Implement `simulate`: form interact + `route.abort()` on POST; save proposed bodies.  
3. Implement guided `scenario` + `verify` with restore — never auto-run denylisted actions.  
4. Export a “sanitized fixture pack” command for copying into openrouterdesk `fixtures/`.  

---

## Agent operating notes

- Read this file + [START_HERE.md](START_HERE.md) + [README.md](README.md) before coding.  
- Keep `AGENTS.md` / `.cursor/` local (gitignored).  
- Prefer small PRs; one concern per PR.  
- Live router tests: opt-in only; never in default CI against a real CPE.
