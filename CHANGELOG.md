# Changelog

All notable changes will be documented here.

## [0.1.2] — 2026-07-20

### Fixed

- Login POSTs (`login_entry`) were blocked before the Enter handoff. POST abort now starts only after you confirm login in the terminal.

## [0.1.1] — 2026-07-20

### Added

- Session warm-up after login (`menuView` first, then reload fallback).
- Stronger menu extraction (`Transfer_Meaning`, data-tag / onclick, inline script mining).
- Secret redaction for SID / token / password-like values in saved exchanges, responses, pages, and scripts.

### Changed

- Tag probes use `menuView` → `menuData` → `hiddenData` order.
- Re-warm and limited retry on `SessionTimeout` during probes.

## [0.1.0] — 2026-07-19

### Added

- Stage 1 `crawl --mode discover`: headed Chromium login handoff, read-only GET crawl, denylist, rate limits.
- Local capture output layout (`router.json`, catalogs, pages/scripts, HTML report).
- Public repository baseline aligned with OpenRouterDesk practices (MIT, CI, Dependabot, community docs).
- Tag-triggered GitHub **Release** workflow and `docs/RELEASE_PROCESS.md`.

### Notes

- `simulate` and `verify` remain stubs (Stage 2 / 3).
- Package stays `private: true` (clone + `npm install`; not on npm registry).

## [Unreleased]

### Planned

- Stage 2 `simulate` (abort POST).
- Stage 3 guided `verify` / `scenario`.
- Export sanitized fixture pack for OpenRouterDesk.
