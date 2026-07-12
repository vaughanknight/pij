# Temporary o-prime window - cli.integration.test.ts
**Opened by**: pij-3vetx8 · **Date**: 2026-07-12

## Scope

- `.pi/extensions/pij/cli.integration.test.ts`
- One s038 prime integration-test timeout repair only.
- Vitest 4 explicit per-test timeout; no product behavior change.

## s040 posture

- Coder is complete.
- Review patch is frozen at
  `5750000067f3f94e381f211972fb6cddd17bd067c85cf9c77d89adcbc3b956d5`.
- s040 makes no edit to this file until the o-prime sends window-closed notice.
- The timeout line is outside the reviewed product behavior and will be included in
  post-review/full-gate verification.
