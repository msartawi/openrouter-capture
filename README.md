# openrouter-capture

Local-only Playwright helper to discover router web APIs (ZTE F6600P first) for [OpenRouterDesk](https://github.com/msartawi/openrouterdesk).

**Not** part of the OpenRouterDesk Electron app. Keep this repository separate; do not copy the crawler or raw captures into the app tree.

**Start here:** [START_HERE.md](START_HERE.md) · **Agent handoff:** [HANDOVER.md](HANDOVER.md)

Methodology: OpenRouterDesk [`docs/OPENROUTER_CAPTURE.md`](https://github.com/msartawi/openrouterdesk/blob/main/docs/OPENROUTER_CAPTURE.md) and [ADR 0007](https://github.com/msartawi/openrouterdesk/blob/main/docs/decisions/0007-standalone-capture-tool.md).

## Setup

```powershell
git clone https://github.com/msartawi/openrouter-capture.git
cd openrouter-capture
npm install
```

Requires Node.js 24+ (see `.nvmrc`). Chromium is installed via `postinstall` unless `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.

## Stage 1 — discover (read-only)

```powershell
npm run capture -- crawl --router http://192.168.1.1 --output ./captures/zte-f6600p --mode discover --username admin --password "YOUR_PASSWORD"
```

Or set `ROUTER_USERNAME` / `ROUTER_PASSWORD` in a local `.env` (never commit it).

Score a finished capture (exit 0 = pass Stage 1 bar):

```powershell
npm run score:capture -- ./captures/zte-f6600p-v016
npm run score:capture -- ./captures/zte-f6600p-v016 --raised
```

### Manual login (no credentials)

```powershell
npm run capture -- crawl --router http://192.168.1.1 --output ./captures/zte-f6600p --mode discover
```

1. Chromium opens headed on the router URL.
2. With credentials: tool fills `#Frm_Username` / `#Frm_Password` and clicks `#LoginId`, then crawls.
3. Without credentials: log in manually, wait for the **main home GUI**, press **Enter once**.
4. The tool records traffic, saves pages/scripts, extracts `_tag` / `OBJ_*` patterns, and writes a catalog under `--output`.
5. After login handoff, write-like POSTs are blocked; ZTE read-style `menuData`/`menuView` POSTs are still allowed.

### Modes

| Mode | Status |
|---|---|
| `discover` | Implemented (Stage 1) |
| `simulate` | Stub — coming Stage 2 |
| `verify` | Stub — coming Stage 3 |

## Safety

- Authorized routers only.
- Denylist blocks auto-navigation to reboot/reset/firmware/WAN/password-class tags when possible.
- Rate-limited (`--delay-ms`, `--max-requests`, concurrency 1).
- Raw captures stay under `./captures/` (gitignored). Hand-curate sanitized fixtures before copying anything into OpenRouterDesk.

## Development

```powershell
npm run check
```

## Releases

Production channel: GitHub Releases (`v*`). Process: [docs/RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md).

## Related

- Product app: [msartawi/openrouterdesk](https://github.com/msartawi/openrouterdesk)
- Security: `SECURITY.md`
- Contributing: `CONTRIBUTING.md`
