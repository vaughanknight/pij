# Plan 133 — live proof

## Isolation and production invariants

- Dev daemon: `target/debug/pij-rs daemon --bind 127.0.0.1:17461 --state-dir /tmp/pij-plan133-ferret-20260902`, supervised as `plan133-dev-daemon` with `CLAUDE_CONFIG_DIR=/tmp/pij-plan133-ferret-20260902/claude`.
- Dev health: `{"ok":true,"command":"pij ping","v":2,"data":{"build":"pij-rs 0.1.0","machine":"JordansacStudio.localdomain","offline":false,"status":"healthy"}}`.
- Production rs runtime before and after: `{"process":{"pid":46147,"proc_start":20260902144720},"addr":"127.0.0.1:7461","machine":"JordansacStudio.localdomain","offline":false}`. Production rs was not restarted.
- Production legacy daemon remained running. Its initial pipe for the hand-started pane was observed as PID `59681` matching `pane-signals/_3169.raw`.

## AC1 — legacy tap superseded; full body reaches a real client

Hand-started real client:

```text
$ tmux new-window -d -P -F '#{pane_id} #{window_id}' -t pij: -n p133-live-ferret -c <worktree> 'copilot --yolo'
%3169 @3102
$ tmux display-message -p -t %3169 '#{pane_pipe}|#{@pij-tap-sink}'
1|
$ pgrep -af 'pane-signals/_3169.raw'
59681
```

After `pij-rs adopt %3169 --harness copilot` against the dev daemon:

```json
{"ok":true,"command":"pij adopt","v":2,"data":{"id":"pij-underground-fowl","harness":"copilot","pane":"%3169","proc":{"pid":59472,"proc_start":20260902151158},"folder":"/Users/jordanknight/pi-hacking/fs3-rs-tap-supersedes-legacy","state":"idle","relay":false}}
```

The observer replaced the unmarked legacy pipe with its owned sink:

```text
$ tmux display-message -p -t %3169 '#{pane_pipe}|#{@pij-tap-sink}'
1|/tmp/pij-plan133-ferret-20260902/pane-signals/_3169.raw
```

One send returned typed delivery:

```json
{"ok":true,"command":"pij send","v":2,"data":{"msg_id":"plan133-live-full-body-1","outcome":{"outcome":"delivered","origin":"typed-to-pane"},"at":1788325983487}}
```

Real Copilot pane capture:

```text
❯ [pij-rs from pij-payable-ferret] 15:13
  Plan 133 full-body live proof. Reply exactly LIVE133-SEEN. This sentence proves the complete body reached your composer.
  [/pij]
● LIVE133-SEEN
```

## AC2/AC3/AC4 — controls and narrow ownership

- Pre-fix legacy takeover RED: `artifact://64` — `attach_pane_tap` refused the unmarked legacy pipe as foreign.
- Pre-fix repeated-refusal RED: `artifact://70` — the second observer tick returned the identical refusal.
- Post-fix focused proofs: pij-tmux adapter 33/33 (`artifact://68`); focused legacy supersede (`artifact://73`); daemon lib 153/153 (`artifact://79`).
- Exact no-second-send tap transition: `tap_unowned_body_delivers_on_the_next_tick_after_tap_claim` queued/retried the original job, attached the tap, delivered on the next tick, then observed an empty third tick (`artifact://93`).
- Live foreign pipe: after `%3169` was temporarily piped to `/tmp/pij-plan133-foreign.raw` under a foreign marker, the dev daemon emitted exactly one refusal. First log follow advanced cursor `5098 → 5216`; a second 3-second follow returned no new bytes (`cursor=5216`, timed out). The foreign pipe/file survived. Unit coverage pins the stricter unmarked/no-legacy-file case.

## AC6 — queued reason, next retry, and delivery without a second send

`tmux copy-mode -t %3169` supplied a real human-typing veto while the dev daemon owned the tap. One send returned:

```json
{"ok":true,"command":"pij send","v":2,"data":{"msg_id":"plan133-live-human-retry-1","outcome":{"outcome":"queued","reason":"human-typing","next_retry_at":1788326101106},"at":1788326096106}}
```

After only `tmux send-keys -t %3169 -X cancel` (no second send), the next drain tick delivered. Capture seven seconds later:

```text
❯ [pij-rs from pij-payable-ferret] 15:15
  Plan 133 human-typing retry proof. Reply exactly LIVE133-VETO-RETRIED. No second send will occur.
  [/pij]
● LIVE133-VETO-RETRIED
```

Focused contract proof for the same transition: `artifact://96`. The configured receipt delay is 5,000 ms and the drain loop uses the same `delivery_interval_secs`.

Measured 12-hour-witness distinction: production destination row 926 (`55C220EB-E97C-4F6C-8232-6953F9489215`) had `enqueued_at=1788323412`, `claimed_at=acked_at=1788323581`, `attempt=34`: 169 seconds in the destination queue. The sender-reported ~02:50Z to destination ~14:30 local gap therefore preceded admission—sender side, or a send that never reached this daemon—and is not chased in plan 133.

## Deterministic receipts

- Focused core/tmux/daemon contracts: 7 + 33 + 154 passed (`artifact://100`).
- Final `~/.cargo/bin/cargo test --workspace`: 587 passed, 6 ignored; `cargo clippy --workspace -- -D warnings` and `cargo fmt --check` both passed (`artifact://142`).
- `.pi/extensions` diff: empty. Change-surface receipt: `artifact://134`.
- Operator state directory mtimes after proof: `~/.pij|1788326354|2026-09-02 15:19:14 +1000`; `~/.pij-rs|1788324440|2026-09-02 14:47:20 +1000`. The dev daemon wrote only `/tmp/pij-plan133-ferret-20260902`, then that owned temporary state was removed.
- Final `harness checks`: PASS at `2026-09-02T05:41:22.062Z`; all eight sensors ran and passed (`local-paths`, `typecheck`, `lint`, `test`, `windows-compat`, `smoke`, `pkg-audit`, `snapshots`). Two prior all-sensor runs exposed transient smoke/test failures; each failing sensor passed alone, and the final full gate is green (`harness observe` DL-006/DL-007).
