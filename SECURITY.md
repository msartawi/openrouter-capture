# Security Policy

## Reporting a vulnerability

Do not open a public issue for vulnerabilities that could expose router credentials, bypass authentication, enable unsafe automatic writes, or leak capture artifacts containing secrets.

Until a dedicated security mailbox is published, use GitHub private vulnerability reporting for the repository.

Include:

- Affected version or commit.
- Impact and realistic attack scenario.
- Reproduction steps using sanitized data.
- Suggested mitigation, if known.
- Whether credentials, session cookies, or raw captures may be exposed.

## Supported versions

During pre-1.0 development, only the latest tagged release and `main` receive security fixes.

## Security boundaries

This repository is a **local** Playwright helper for authorized API discovery. It is not the OpenRouterDesk product app.

- Use only on routers you own or are authorized to administer.
- Prefer `discover` (read-only). Do not enable `verify` writes without understanding restore risk.
- Never commit `captures/`, HARs, cookies, storage state, or `.env` files.
- Denylist and rate limits reduce accidental damage; they do not replace operator judgment.

Methodology and mode safety are documented in the sibling OpenRouterDesk docs: `docs/OPENROUTER_CAPTURE.md` and ADR 0007 in [msartawi/openrouterdesk](https://github.com/msartawi/openrouterdesk).
