# Validation — pij-peer-file-watch-plan

**Validated**: 2026-07-06 · **Verdict**: ✅ VALIDATED WITH FIXES (2 findings folded into the plan)
**Target**: `docs/plans/033-pij-peer-file-watch/pij-peer-file-watch-plan.md`
**Topology**: lead + 1 independent critic (nontrivial); deterministic source proof on every load-bearing claim.

## Proof (deterministic)

Every cited anchor resolves and every load-bearing claim was proven **sound** against current source:
- **Self-serve resolution (AC-07) — SOUND (initial concern refuted).** The daemon injects `PIJ_SESSION_ID=<pij-id>` into the peer pane at spawn (`core/spawn.ts:291` → `adapters/tmux.ts:59-61,100-102` `tmux -e`); `resolveSelf` reads it first (`core/discovery.ts:82`) with a `$TMUX_PANE`→`byPane` fallback (`discovery.ts:89-93`). Same env-injection `pij phonehome` self-bind already relies on. A daemon-spawned peer *does* know its own id.
- **Delivery (finding 01) — SOUND.** `DeliveryPort.deliver(message): Result<{messageId}>` (`core/ports.ts:47`); daemon already emits internal notices via `channel.deliver({from,to,body})` (`daemon.ts:203,220,266`); `channel.deliver` keys only on `message.to` (`channel.ts:43-55`); injection framing `[pij from <sender>] <body>` (`router.ts:27-44`). `SessionId = string`, so `from:"pij-watch"` needs no cast.
- **Reuse (finding 02) — SOUND.** `compileWatch` (`file-watch-notify/store.ts:162`), `WatchReconciler` (`store.ts:206`), `FolderWatcher` (`watcher.ts:28`), `nodeWatchDeps` (`watcher.ts:105`) all present and pi-free; single root tsconfig, no package boundary.
- **Other ACs — SOUND.** Baseline-prime prevents pre-existing-file floods on subscribe/restart (`watcher.ts:44-45`, AC-04/05); the 600ms synchronous tick is not blocked (fire-and-forget async `FolderWatcher.start()` + event-loop timers); all 8 ACs map to tasks with measurable done-whens; single Simple phase appropriate (one domain, linear types→core→store→cli→daemon chain).

## Findings (both CONFIRMED at source, both folded into the plan)

| Severity | Finding | Evidence | Impact | Fix folded in |
|---|---|---|---|---|
| HIGH | A dead **resident** peer's descriptor lingers with `lifecycle:"bound"` — the dead branch persists `failureReason` but never `registry.remove`s it. A reconcile keyed only on "descriptor gone" never disposes the watcher. | `daemon.ts:189-206` (no `remove`, lifecycle unchanged); `owns` stays true `daemon.ts:118`; `registry.remove` only at `daemon.ts:106`/`cli.ts:907`/`session.ts:298,398` — none for a dead resident peer | Leaked `FolderWatcher` (fs.watch handle + timers) + endless inbox writes to a dead pane — the exact leak AC-08 forbids | Key Finding 09; T007/T009 done-when now dispose on `!ports.isAlive(pid)` (`ports.ts:142`); T008 adds a pid-dead disposal test |
| MEDIUM | Delivering with synthetic `from:"pij-watch"` triggers a phantom receipt leak — the daemon emits a receipt back to the sender after injecting; `~/.pij/pij-watch/inbox/` is never drained (not a registered session) → unbounded file/inode growth. `kind:"receipt"` can't dodge it (dropped un-injected). | `daemon.ts:310-312` → `emitSendReceipt` `daemon.ts:324-329`; receipt-drop `daemon.ts:287-289` | Silent unbounded disk/inode accumulation for machine lifetime | Key Finding 10; T009 done-when guards `emitSendReceipt` to skip senders with no registry descriptor; T008 asserts no `pij-watch` inbox file after a delivery |

## Thesis
Advanced. The plan's purpose — give non-pi peers self-served, debounced, tmux-delivered file-change notices by reusing the pi-free watch core over the existing inbox transport — is sound and buildable. The two findings were correctness gaps in *how the tasks satisfy AC-08 / avoid a leak*, not flaws in the approach; both are now specified. Target proof (a buildable Simple plan) = actual proof.

## Consumers
1/1 satisfied — the sole downstream consumer is the build phase (T001–T012), whose task specs now cover the confirmed gaps. The `/pij` skill `watch`-route stub is updated at ship (T011).
