# Start Here — openrouter-capture

Internal Playwright helper for discovering router APIs used by [OpenRouterDesk](https://github.com/msartawi/openrouterdesk).

**Repo:** https://github.com/msartawi/openrouter-capture  
**Local path:** `c:\Projects\openrouter-capture`  
**Not** the Electron desktop app — keep repositories separate.

## Agent / maintainer handoff

Read **[HANDOVER.md](HANDOVER.md)** first (current state, safety rules, GitHub parity, next stages).

## Quick start

```powershell
cd c:\Projects\openrouter-capture
npm install
npm run capture -- crawl --router http://192.168.1.1 --output ./captures/zte-f6600p --mode discover
```

Log in manually in Chromium, then press Enter in the terminal.

## Modes

| Mode | Status |
|---|---|
| `discover` | Stage 1 — implemented |
| `simulate` | Stage 2 — not implemented |
| `verify` | Stage 3 — not implemented |

## Never commit

Raw `captures/`, HARs, cookies, passwords, or live router dumps. See `.gitignore` and `SECURITY.md`.

## Related product docs

- https://github.com/msartawi/openrouterdesk/blob/main/docs/OPENROUTER_CAPTURE.md  
- https://github.com/msartawi/openrouterdesk/blob/main/docs/decisions/0007-standalone-capture-tool.md  
