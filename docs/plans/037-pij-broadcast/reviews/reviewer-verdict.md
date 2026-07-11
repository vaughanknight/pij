# s037 Reviewer Verdict

**Verdict: APPROVE**

No material correctness, compatibility, type-safety, error-semantics, wait-state, test-quality, documentation, or scope findings.

## Evidence

- The live scoped diff is byte-identical to the decompressed `coder-diff.patch.gz` (sha256 `f3f03d3b5695bccdf3548be1108b801d2981f605a4dcac7fb97a9f86947818ff`).
- Repeatable parsing is isolated to `--to`; scalar flags keep the existing channel, while broadcast requires two ordered unique targets and rejects mixed, missing-text, command, file, and caption forms (`.pi/extensions/pij/core/cli.ts:169-219`, `.pi/extensions/pij/core/cli.ts:238-307`).
- All targets are preflighted before dispatch; fan-out preserves target order and raw body, records independent successes/errors, continues after delivery failure, and carries the non-zero result into `--wait` (`.pi/extensions/pij/core/cli.ts:465-553`, `.pi/extensions/pij/core/cli.ts:686-735`).
- The positional single-target branch retains its prior delivery and human/JSON rendering; only the internal wait hint is widened to a one-element target list (`.pi/extensions/pij/core/cli.ts:738-839`).
- Wait correlation removes only terminal `delivered`/`unverified` message ids, retains `queued`, reports unresolved targets, waits for the full pending set, and exits with the dispatch result (`.pi/extensions/pij/core/cli.ts:109-145`, `.pi/extensions/pij/cli.ts:292-327`, `.pi/extensions/pij/cli.ts:1968-1987`).
- Pure and real-filesystem tests cover parser rejection, all-target no-write preflight, ordered unique-id fan-out, partial failure, terminal-set waiting, broadcast timeout labels, and exact legacy timeout text (`.pi/extensions/pij/core/cli.test.ts:165-193`, `.pi/extensions/pij/core/cli.test.ts:432-635`, `.pi/extensions/pij/cli.integration.test.ts:110-175`).
- Operator, domain, and peer-route contracts describe ordered text broadcast and all-successful-recipient waiting (`docs/how/pij.md:61-66`, `docs/how/pij.md:106-129`, `docs/domains/pij-messaging/domain.md:46-68`, `skills/pij/references/routes/peer.md:33-43`).
- No daemon/session transport file is in the sealed patch. Concurrent orchestration-baton CLI and guide surfaces remain present (`.pi/extensions/pij/cli.ts:139-240`, `docs/how/pij.md:9-15`, `docs/how/pij.md:69-72`).

## Dim-0 Mutation Proof

- **Mutation:** temporarily changed `.pi/extensions/pij/core/cli.ts:127` so `delivered`, rather than `queued`, retained a target in `applyWaitReceipt`.
- **RED:** `npx vitest run .pi/extensions/pij/core/cli.test.ts -t "keeps waiting until every correlated message reaches a terminal receipt" --reporter=dot` produced 1 failed / 34 skipped; the assertion at `.pi/extensions/pij/core/cli.test.ts:609` showed the queued target was incorrectly removed.
- **Restore:** restored the guard; file sha256 returned byte-identically to `71f22b1fd70e5b92f1ba10a4182627bcffb0dbf51146bd13633cb8a0a6cbf2d2`.
- **GREEN:** the same targeted command produced 1 passed / 34 skipped.

## Review Checks

- `npx vitest run .pi/extensions/pij/core/cli.test.ts .pi/extensions/pij/cli.integration.test.ts --reporter=dot` — 52 passed.
- `just typecheck` — passed.
- `just pij-skill-check` — passed.
- `harness checks` — all six sensors passed.
