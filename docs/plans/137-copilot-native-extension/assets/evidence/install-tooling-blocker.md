# Installation unit validation blocker

After the PM dependency-drift notice, the worktree's reused `node_modules/.bin` disappeared. No dependency/global repair or lock changes attempted.

Observed commands:

- `node_modules/.bin/biome check --write harness/scripts/link-global.ts harness/scripts/link-global.test.ts harness/scripts/copilot-native-fixture.ts harness/scripts/copilot-native-smoke.ts harness/scripts/copilot-native-smoke.test.ts .harness/extensions/checks/extension.ts` → exit127, `command not found: node_modules/.bin/biome`.
- `just test harness/scripts/link-global.test.ts harness/scripts/copilot-native-smoke.test.ts` → exit127, `sh: vitest: command not found`.
- Read of this worktree's `node_modules/.bin` → path not found.
- `which biome tsc vitest tsx` finds only global tsc, not the project's formatter/test runner.

Prior proof remains valid only for its exercised revision: 27 scoped tests passed before the v3 degraded-startup predicate and empty-COPILOT_HOME case were added. Actual Copilot1.0.84-0/local-provider protocol exited0 with public user and assistant IDs (install-provider-client.json). Final new tests and formatting still need execution after dependency restoration; not claiming a final green gate.

V3 degraded startup driver is implemented: direct CLI before isolated daemon/key creation; ordinary user/assistant same interaction; terminal `[pij native] unavailable:` exactly once; private acceptance and undocumented log layouts not read. Real composed native/manual/spawned/consent/reconnect/real-model proof remains a PM composition dependency. No missing-native-test skip or stub was added.

## Resolved by owner

PM/prime restored main dependencies from the exact lockfile with the governed recipe; PM cancelled the private snapshot copy before repointing. This seat performed no install/repair. After PM RESUME: scoped Biome check passed (5 source/test files), strict scoped TypeScript check exited0, and `just test harness/scripts/link-global.test.ts harness/scripts/copilot-native-smoke.test.ts` passed29 tests (22 installer +7 fixture/witness), including the final v3 and empty-home additions.
