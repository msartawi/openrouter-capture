# Changelog

All notable changes will be documented here.

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
- Session warm-up and redaction hardening for saved exchanges.
