# Release Process

This repository ships a **local CLI helper**, not a signed desktop installer. Production distribution is a **GitHub Release** on tag `v*`.

## Channels

| Channel | Meaning |
|---|---|
| `stable` | Annotated tag `vX.Y.Z` on `main` + published GitHub Release |
| `prerelease` | Optional `vX.Y.Z-rc.N` tags marked as prerelease |

There is no Microsoft Store channel and no Authenticode signing for this tool.

## First production bar (v0.1.x)

Stage 1 **`discover`** (read-only crawl after manual login) is the first production capability. `simulate` and `verify` are later majors/minors and must not block v0.1.0.

## Steps

1. Confirm CI (`npm run check`) is green on `main`.
2. Update `package.json` version and `CHANGELOG.md`.
3. Push to `main`, then create an annotated tag: `git tag -a v0.1.0 -m "v0.1.0"`.
4. Push the tag: `git push origin v0.1.0`.
5. The **Release** workflow runs `npm run check` on Windows and publishes / verifies the GitHub Release.
6. Confirm the release page lists notes and that no `captures/`, secrets, or HARs were attached.

## What never ships in a release

- Raw `captures/` trees, HARs, cookies, storage state, or `.env` files
- Live router credentials or private network inventories
- Agent operating files (`.cursor/`, `AGENTS.md`)

## Operator install from a release

```powershell
git clone https://github.com/msartawi/openrouter-capture.git
cd openrouter-capture
git checkout v0.1.0
npm install
npm run capture -- crawl --router http://192.168.1.1 --output ./captures/zte-f6600p --mode discover
```

The package is `private: true` — not published to the npm registry.
