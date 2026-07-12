# Backpressure Coverage — pij inbox without tmux

**Spec**: [pij-inbox-no-tmux-plan.md](./pij-inbox-no-tmux-plan.md)
**Generated**: 2026-07-12
**Certainty**: Partial

> Advisory only. Never blocks, never gates, no scores.

## Existing Sensors

| Sensor | Command | Dimension | Found in |
|--------|---------|-----------|----------|
| TypeScript compile | `just typecheck` | maintainability / contract | `justfile`, `package.json` |
| Biome | `just lint` | maintainability | `justfile`, `package.json` |
| Vitest | `just test` | behaviour / architecture | `vitest.config.ts`, 93 pij+harness test files |
| Pij targeted suite | `just test .pi/extensions/pij` | behaviour / contract | `.pi/extensions/pij/**/*.test.ts` |
| CLI subprocess integration | `just test .pi/extensions/pij/cli.integration.test.ts` | integration | `.pi/extensions/pij/cli.integration.test.ts` |
| Tmux Driver smoke | `just smoke` | runtime behaviour | `harness/scripts/smoke.ts`, Driver SDK |
| Pij skill structural check | `just pij-skill-check` | contract / agent guidance | `harness/scripts/pij-skill-check.sh` |
| Full signal inventory | `harness checks` | ship/done aggregate | `.harness/extensions/checks/extension.ts` |
| Linux CI | GitHub Actions `ci/check` | integration / rollout | `.github/workflows/ci.yml` |
| Mutation proof pattern | targeted RED → restore → GREEN | test quality | existing flow-pair mutation recipe; plan task 3.4 |

## Coverage Matrix

| Criterion / failure mode | Deterministic sensor | Status | Tier | Probe trail |
|--------------------------|----------------------|--------|------|-------------|
| AC-01 grouped inbox grammar, auto-registration, ordered human/JSON output | New `core/inbox.test.ts` + portable CLI integration | BUILDABLE | computational | — |
| AC-02 exclusive marker claim prevents replay and concurrent double-read | Real-filesystem channel concurrency tests + mutation | BUILDABLE | computational | — |
| AC-03 legacy messages and malformed marker metadata remain compatible | Channel fixture tests | BUILDABLE | computational | — |
| AC-04 indefinite and finite wait semantics | Fake-clock/core tests + two-process integration | BUILDABLE | computational | — |
| AC-05 hidden receipts and daemon-free sender wait | Receipt parser regressions + two-process exclusive-claim integration | BUILDABLE | computational | — |
| AC-06 tmux marks read only after confirmed/unverified outcome | Existing daemon/loop fake-port tests extended + live smoke | BUILDABLE | computational | — |
| AC-07 pi marks read after `onInbound`, reload does not replay | Existing `index.test.ts`/`session.test.ts` extended | BUILDABLE | computational | — |
| AC-08 ambient-native auto-registration and alias idempotency | Existing identity suites (86 green) + new current-session tests | BUILDABLE | computational | — |
| AC-09 fresh subprocess resolves exact ambient identity for self verbs | Core self-resolution tests + portable subprocess integration | BUILDABLE | computational | — |
| AC-10 dead pull target accepts durable send; dead push/dissolved rejects | `core/cli.test.ts` preflight matrix + two-shell integration | BUILDABLE | computational | — |
| AC-11 descriptors without delivery mode preserve current behavior | Existing transport/router/daemon regression suites extended | BUILDABLE | computational | — |
| AC-12 Windows portable lane passes on a real Windows host | Windows GitHub Actions job | BUILDABLE | computational | — |
| AC-13 Windows compatibility is a named done/ship sensor | New `just windows-compat` + `harness checks` result assertion | BUILDABLE | computational | — |
| AC-14 `/pij` selects pull guidance outside tmux and preserves push guidance | `just pij-skill-check` extended with mode/verb assertions | BUILDABLE | computational | — |
| Old daemon drains bound external pull descriptors before CLI exposure | Phase 2 targeted daemon test + mandatory restart/canary ordering | BUILDABLE | computational | — |
| Windows CLI integration accidentally executes POSIX shell/tmux setup | Portable test entrypoint scanned/run on `windows-latest` | BUILDABLE | computational | — |
| Immutable inbox history grows without bound | No v1 retention requirement | ABSENT | human-judgement | Searched plan ACs/non-goals and current harness/scripts; retention is explicitly deferred. |

## Certainty: Partial

Current typecheck, lint, unit, integration, smoke, skill, and aggregate gates exist,
but the feature-specific read-state, pull, receipt, and Windows sensors are planned
rather than present. Every material behaviour/architecture gap is buildable in
the declared phases; the only absent row is the deliberately deferred retention
policy.

## Recommended Phase 0: Establish Backpressure

The plan already makes this its Phase 1.

| Sensor to build | Proves | Suggested form |
|-----------------|--------|----------------|
| `windows-compat` | Portable inbox/identity code and tests run without POSIX/tmux assumptions | npm/just command + `harness checks` sensor + Windows CI job |
| Atomic inbox claim fixture | Exactly-once read under concurrent CLI processes | real-filesystem Vitest |
| Portable two-shell inbox scenario | Auto-register → wait → send → read → receipt, with no daemon | subprocess integration test |
| Pull ownership regression | A running daemon never drains/buffers pull descriptors | fake-port daemon/router unit test + live canary |
| Receipt dual-source wait regression | `send --wait` resolves event or inbox receipt exactly once | fake event log + real inbox fixture |

## Suggested Done-When Lines

| For criterion | Suggested line | Backed by |
|---------------|----------------|-----------|
| Windows portability | done when `just windows-compat` passes locally, appears green in `harness checks`, and the `windows-latest` CI job is green | BUILDABLE |
| Pull delivery | done when the portable two-shell scenario passes with no tmux and no daemon | BUILDABLE |
| Read atomicity | done when two concurrent claimers collectively return each message exactly once | BUILDABLE |
| Push compatibility | done when the existing pij suite plus tmux smoke remain green and the post-restart pull canary retains its inbox file | BUILDABLE |
