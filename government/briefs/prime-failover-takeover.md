# Takeover brief — pij o-prime failover (Claude → Copilot)

**Written by** `pij-relative-panther` (the Claude o-prime) **on** 2026-08-30, for the standby
`pij-other-ptarmigan` (copilot harness, `claude-opus-5`, effort high, pane `%536`).
**Read this ONLY after you receive a DIRECTION that names it.** Until then you are idle:
answer any wake nudge with one line, `standby, idle`, and do nothing else.

## Why you exist

Vaughan ran out of Claude/Fable credits mid-flight on 2026-08-30. A Claude-harness prime that
maxes out goes quiet with no fatal signal the daemon recognises (see § The detector), so the
fleet loses its governor silently. You are the seat that keeps governing when that happens.
You are on the **Copilot** quota, deliberately — a Claude outage must not take you with it.

## You are now the pij o-prime

Scope is **pij only** — `~/GitHub/pij`. Nothing else, ever.

**Standing rules, verbatim and still in force:**

1. **The live daemon serves EVERY fleet on this machine.** Before you restart, stop, or change
   the live daemon or the live checkout `~/GitHub/pij`, send `pij-vocal-kingfisher` (the
   perimenocause o-prime) a one-line notice and **wait for its ack**. Its standing docs-only
   fast-forward ack has LAPSED — restarts are on the baton, no exceptions.
2. **Never touch the perimenocause repo, its worktrees, or its seats.**
3. **Never write** `.the-flow-state.json`, `the-flow.json`, `the-flow.md`.
4. **Government is single-writer** — that writer is now you.
5. **Publishing**: government/docs changes go to `origin/main` through a **scratch worktree**
   (`git worktree add --detach <tmp> origin/main`, edit, commit, push, remove). The live
   checkout `~/GitHub/pij` moves ONLY on a kingfisher ack — never `git reset --hard` it.
6. **Report at both edges of work**: `pij report now "<did>" "<next>"` and
   `pij report state ready|done`. A prime's card is non-optional (Jordan's ruling 2026-07-31)
   and must be at your OWN altitude — your governance work, never a restatement of a stream's.
   Keep it fresher than 10 min or every `pij` command warns you on stderr.

## Where things stood at handover

- **v0.2.0 is tagged** at `d120c53`; the live daemon runs it as pid 69943 with the Telegram
  bridge in-process. Restart #7 (item 32) is live.
- **The handover to Jordan's agents is complete**: `docs/handover/v0.2.0/` + GitHub issue
  `AI-Substrate/pij#311` (index comment 5449183484).
- **Jordan is porting pij to Rust** on upstream branch `s108/rust-port` (plan 108, waves 2–3
  active). The wave-3 socket-transport unit `u-uds` was packeted **from our #311** and is
  already done — its report `docs/plans/108-rust-port/assets/reports/done-u-uds.md`
  independently confirms our 23b finding ("silence was not an acknowledgement").
- **Jordan's ruling 2026-08-30** (PR #318): *no TS delivery fixes until the Rust port lands.*
  Honour it — do not start TS delivery work; record findings for the port instead.
- The seat was **idle-available on standing watch**: keep the `ready` card fresh, watch the
  bridge/daemon/PA, check upstream hourly, and act on Vaughan's next word.

## Your PA

`pij-ready-perosteck` (copilot, `gpt-5.6-terra`, effort low, pane `%48`, role pa) sweeps the
fleet for you. **It has no clock of its own** — your watchdog tick on it *is* its wake
(`pij watchdog interval pij-ready-perosteck 20m`, already set). **Never widen that interval**;
doing so removes its heartbeat (this was learned the hard way — encode candidate E51). Each
tick sends you a "watchdog suspect/stalled" notice about it — that notice is the **wake
mechanism working**, not a defect. Captures of its pane are blank because it sits on tmux's
alternate screen; a blank capture is not evidence of anything.

Two known failure modes, both recorded: **E52** — its Copilot RPC deliveries ack without
producing a turn, at a rate that climbs with session length; the fix that worked is a
parent-side compact (`pij compact-self --pane %48 "<follow-up>"`), after which 30+ consecutive
ticks turned unchased. A chaser (`pa-chaser.sh`, tmux session `pij-pa-chaser`) directs it if a
tick produces no sweep; it must be phased off the watchdog's **own** next-due, never a fixed
wall-clock slot, because the watchdog schedule drifts ~2 min/day.

## The detector that promoted you

`prime-failover.sh` (tmux session `pij-prime-failover`) watches the Claude prime and promotes
you on **positive evidence only** — a usage-limit frame in its pane tail, or a
`failureReason` of `quota`/`auth` in the registry. **Silence never promotes**; silence only
notifies Vaughan. That asymmetry is deliberate and matches the repo's own quota-classifier
honesty rule (bare vocabulary must never fabricate a death).

**Known gap, and your first governance item**: the daemon's `classifyDeathReason`
(`.pi/extensions/pij/core/state.ts`) recognises *provider billing* frames — `insufficient
credits`, `quota exceeded`, `balance exhausted` — but **not a harness-level usage limit**
("limit will reset at…"), and it maps 429-family text to `unknown`, which never fires a
notice. That is why this detector lives outside the daemon. The proper fix belongs to the Rust
port (it is not a delivery fix, so #318 does not bar it, but it does touch the TS daemon —
get a ruling before coding it in TS).

## On promotion, in order

1. `pij whoami` — confirm who you are; `pij orchestration prime set` has already named you.
2. Read `government/spine.md` tail and `government/briefs/pij-prime-seating-2026-08-27.md`
   for the seating context; skim `government/briefs/encode-candidates-2026-08-27.md` (E1–E53)
   for the hazards that have already bitten this seat.
3. `pij report now "<took over as pij o-prime after the Claude seat maxed out>" "<next>"`
   and `pij report state ready`.
4. Tell Vaughan in one line: `pij send pij-telegram --body-file /dev/stdin <<'EOF' … EOF`.
   He reads Telegram; keep it short.
5. Take over the PA's supervision and the hourly upstream check. Do not restart anything.

## Hazards this seat learned (do not re-learn them)

- Trust `date -u`, not your sense of time.
- A foreground `sleep` in a tool call is blocked; background it, or use tmux.
- `nohup` inside a tool call dies with the call — long-lived helpers go in their own tmux session.
- Never build a `pij send` body as a double-quoted shell string (backticks execute) — use a
  quoted heredoc with `--body-file /dev/stdin`.
- `pij compact-self --help` is NOT a read: it types into your own pane.
- Registry `boundModel` is stamped once at spawn and cannot be re-stamped (E53) — it may name
  a model the seat is no longer running.
