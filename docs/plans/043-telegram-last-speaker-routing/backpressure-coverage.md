# Backpressure Coverage — Telegram Last-Speaker Routing

**Spec**: [telegram-last-speaker-routing-plan.md](./telegram-last-speaker-routing-plan.md)
**Generated**: 2026-07-12
**Certainty**: Partial

> Advisory only. Never blocks, never gates, no scores.

## Existing Sensors

| Sensor | Command | Dimension | Found in |
|--------|---------|-----------|----------|
| Targeted Vitest | `just test .pi/extensions/pij/telegram/bridge.test.ts .pi/extensions/pij/telegram/index.test.ts .pi/extensions/pij/telegram/match.test.ts` | behaviour | `justfile:80-82`, `vitest.config.ts:54-63` |
| Full unit/integration suite | `just test` | behaviour | `justfile:80-82`, `.github/workflows/ci.yml:20-26` |
| TypeScript typecheck | `just typecheck` | maintainability | `justfile:70-71` |
| Biome lint | `just lint` | maintainability | `justfile:73-74` |
| Driver smoke | `just smoke` | behaviour | `justfile:91-93`, `harness/scripts/smoke.ts` |
| Full signal inventory | `harness checks` | behaviour + maintainability | `.harness/extensions/checks/extension.ts:25-54` |

## Coverage Matrix

| Criterion / failure mode | Deterministic sensor | Status | Tier | Probe trail |
|--------------------------|----------------------|--------|------|-------------|
| AC-01 reply-to precedence | Existing `routeMessage` + bot reply tests | EXISTS | computational | — |
| AC-02 explicit memorable-name precedence | Existing matcher and routing tests | EXISTS | computational | — |
| AC-03 bare text follows most recent successful speaker | T001 pure/bot + `startBridge` regression | BUILDABLE | computational | — |
| AC-04 captionless media follows last speaker | T001 media update regression | BUILDABLE | computational | — |
| AC-05 threaded reply counts as speech | T001 forwarder callback with pending `replyTo` | BUILDABLE | computational | — |
| AC-06 silent B does not replace prior speaker A | T001 strict A/B state regression | BUILDABLE | computational | — |
| AC-07 receipts/all-fail excluded; partial success included | T001 injected send/sendMedia failure matrix | BUILDABLE | computational | — |
| AC-08 string/numeric chat ids compose and chats isolate | T001 production `startBridge` wiring regression | BUILDABLE | computational | — |
| AC-09 missing recorded speaker never falls back to selected | T001 route/bot no-delivery regression | BUILDABLE | computational | — |
| AC-10 `/tail` follows selected/routed recipient | Existing `/tail` bot tests plus T001 post-fallback case | BUILDABLE | computational | — |
| AC-11 restart starts with no assumed speaker | Fresh `startBridge`/`createBot` regression | BUILDABLE | computational | — |
| AC-12 operator docs match the contract | Reviewer diff inspection | ABSENT | inferential | Searched repo test/config signatures and existing Telegram tests; no documentation assertion sensor exists. |
| DI boundary remains local; no global state/new dependency | Typecheck, lint, plan fence diff, reviewer | EXISTS | computational + inferential | — |
| Full repo remains healthy | `harness checks` | EXISTS | computational | — |

## Certainty: Partial

The repo already has the required test and gate infrastructure, but AC-03 through AC-11 need the new T001 regressions before the changed behavior is deterministically provable. AC-12 is appropriately review-based.

## Recommended Phase 0: Establish Backpressure

The Simple plan already places this work first as T001; no additional phase is needed.

| Sensor to build | Proves | Suggested form |
|-----------------|--------|----------------|
| Last-speaker routing matrix | AC-03, AC-05, AC-06, AC-09 | Pure and fake-bot Vitest cases |
| Forwarder success/failure callback matrix | AC-04, AC-05, AC-07 | Injected `send`/`sendMedia` Vitest cases |
| Production chat-key composition test | AC-08, AC-10, AC-11 | `startBridge` + real temp `FsChannel`, mocked Bot API |

## Suggested done-when lines

| For criterion | Suggested line | Backed by |
|---------------|----------------|-----------|
| AC-03 through AC-11 | Done when T001 is green under targeted Vitest and `harness checks` is green. | BUILDABLE + EXISTS |
| AC-12 | Done when README/how/domain diffs agree with R1-R6 and reviewer finds no routing contradiction. | inferential |
