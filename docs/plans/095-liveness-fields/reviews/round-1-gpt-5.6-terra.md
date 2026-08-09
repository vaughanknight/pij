# s095 Cross-Model Review

## Verdict

FIX_REQUIRED

## Dim-0 evidence

1. Identity-ladder guard mutation: in-memory Vite transform changed
   `if (!expected.has(id)) continue;` to `if (expected.has(id)) continue;`
   in `.pi/extensions/pij/core/state.ts`. The target matched and
   `state.test.ts` went RED with 9 assertion failures, including AC-1, AC-2,
   AC-5, AC-12, and the parsed-path identity guard. This was not a no-op.
2. Newest recovery/seam coverage mutation: `mutate.mjs` changed
   `if (descriptor.terminal === undefined) continue;` to
   `if (true) continue;` in
   `.pi/extensions/pij/core/daemon/death-reconciler.ts`. The target matched;
   the runner reported `GATE PASSES` and 7 failures, including AC-8, AC-10,
   AC-17b, all three AC-19 downstream seams, and snapshot-driven recovery.
   This was a clean applied mutation that tests detected, not
   `TARGET NOT FOUND` and not an applied-green vacuous gate.

## Findings

- high · `docs/plans/095-liveness-fields/execution.log.md` (missing) · The
  packet requires the coder's assertion-level fail-first evidence, but no
  stream execution log exists. The independent mutations prove present tests
  can disagree, but they do not establish the documented pre-fix behavioural
  evidence required by AC-11.
- medium · full test gate · `npx vitest run .pi/extensions/pij` initially
  failed three unrelated-looking `cli.integration.test.ts` cases, making
  `harness checks --quick` fail its test sensor. Each of the three passed when
  rerun alone, so this appears concurrent-test/environment flakiness rather
  than a demonstrated s095 logic defect, but the full gate is not green.

## Positive checks

- The seven contract causes and all nine precedence rows match the published
  contract; `unknown` stays non-suppressing.
- The production call site is limited to `daemon.ts:640-648`, supplies one
  `processSnapshot` value per sweep, and the real adapter uses `ps -ww`.
- The targeted state, reconciler, daemon, and process suites passed
  independently.
