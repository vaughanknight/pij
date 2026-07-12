# s040 commit manifest
**Commit intent**: `feat(pij): add memorable session ids`
**Index policy**: explicit pathspecs only

## Product and tests

- `package.json`
- `package-lock.json`
- `.pi/extensions/pij/core/memorable-id.ts`
- `.pi/extensions/pij/core/memorable-id.test.ts`
- `.pi/extensions/pij/core/discovery.ts`
- `.pi/extensions/pij/core/discovery.test.ts`
- `.pi/extensions/pij/core/binding.ts`
- `.pi/extensions/pij/core/binding.test.ts`
- `.pi/extensions/pij/core/harness/copilot.ts`
- `.pi/extensions/pij/core/harness/copilot.test.ts`
- `.pi/extensions/pij/core/cli.ts`
- `.pi/extensions/pij/core/cli.test.ts`
- `.pi/extensions/pij/core/spawn.ts`
- `.pi/extensions/pij/core/spawn.test.ts`
- `.pi/extensions/pij/adapters/fs-registry.ts`
- `.pi/extensions/pij/adapters/fs-registry.test.ts`
- `.pi/extensions/pij/index.ts`
- `.pi/extensions/pij/index.test.ts`
- `.pi/extensions/pij/cli.ts`
- `.pi/extensions/pij/cli.integration.test.ts`
- `.pi/extensions/pij/telegram/match.test.ts`

## Product documentation

- `docs/how/pij.md`
- `docs/domains/pij-messaging/domain.md`
- `docs/domains/pij-control-plane/domain.md`

## Plan evidence

- `docs/plans/040-memorable-pij-session-ids/`

## Explicit exclusions

- `government/**`
- `.harness/records/**`
- `docs/PRD/**`
- sibling plans `041/**`, `042/**`
- `.pi/packages.yaml`
- `.flow-pair/**`

## Proof

- Final review: APPROVE, F001-F004 resolved.
- T009 reviewed live proof: PASS.
- `harness checks`: all six sensors PASS.
- Package delta: one exact `unique-names-generator@4.7.1` dependency plus npm lock closure.
