# Contributing

Thank you for helping make router API discovery safer and more transparent.

## Before opening a pull request

- Read `SECURITY.md` and this file.
- Open or reference an issue for non-trivial work.
- Keep `discover` read-only unless write-safety requirements for `simulate` / `verify` are fully met and documented.
- Use sanitized fixtures rather than live credentials, cookies, or complete private captures.
- Run `npm run check`.

## Pull requests

A PR must state:

- What changed and why.
- Security impact (especially anything that enables POSTs or weakens the denylist).
- Test evidence.
- Router models and firmware versions involved.
- Whether behavior is observed, inferred, or unverified.
- Rollback or compatibility considerations.

## Reverse-engineering contributions

Only submit information collected from devices you own or are authorized to administer. Do not submit credentials, authentication bypasses, proprietary firmware images, raw capture trees, or personal network inventories.

## Relationship to OpenRouterDesk

This helper stays **outside** the [OpenRouterDesk](https://github.com/msartawi/openrouterdesk) app tree. Do not propose merging crawler source or raw captures into that repository. Sanitized fixtures for adapters belong in OpenRouterDesk after hand curation.
