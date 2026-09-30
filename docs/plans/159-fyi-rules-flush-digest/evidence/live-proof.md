# Plan 159 live proof (production daemon, after #461 merged as a2013e86)

Ran on the canonical checkout at a2013e86, after `just bounce-rs`, on 2026-09-30. The first ping after the bounce timed out on store health (machine load average 114); a re-ping 10 s later was healthy. The new `/v1/fyi/read` route answered, so the new build was live. Two throwaway proof seats were spawned for this and closed afterwards: `pij-frantic-cormac` (Claude, Sonnet 5.5) and `pij-convenient-deathwing` (OMP, github-copilot/claude-opus-5.5). Every FYI was sent with `pij-rs send --fyi` from `pij-yelling-trout`.

## 1. Five FYIs to a warm seat ⇒ one flush turn
`pij-frantic-cormac` had a one-hour cache TTL and its last call was 48 s earlier (cache `warm`). After 4 FYIs: pending 4, no turn. The 5th hold flushed:
```
pij send: held (fyi) — 01a0f001-24c5-7742-a64c-95dcf448690e
pij send: held (fyi) — 01a0f001-24f2-7801-b015-8c205d5514f3
pij send: held (fyi) — 01a0f001-2529-7e23-99d7-29d2bd53e836
pij send: held (fyi) — 01a0f001-255e-7d10-8dfc-ad3578d615b1
after 4: pending 4 state idle
pij send: held (fyi) — 01a0f001-25e1-7c80-8dfb-12c72212105c
after 5: pending 0 state idle
› Message from @pij-bg: [pij-rs from pij-bg] (ctrl+o to expand)
⏺ I see 5 FYIs. The first line of the block is "5 FYIs were queued for you:".
✻ Cooked for 2s · done 11:50 am
─────────────────────────────────────────────────────�
❯ 
─────────────────────────────────────────────────────�
  5% pij ⎇ main rs ⛓ pij-frantic-cormac • Sonnet 5.5 • medium • 50k/1.0M • 23% ↻13:20
  ⏵⏵ bypass permissions on (shift+tab to cycle) · ← 1 agent
93787|11:50:02|fyi.delivered|{"ids":["01a0f001-24c5-7742-a64c-95dcf448690e","01a0f001-24f2-7801-b015-8c205d5514f3","01a0f001-2529-7e23-99d7-29d2bd53e836","01a0f001-255e-7d10-8dfc-ad3578d615
93786|11:50:02|fyi.held|{"held_at_ms":1790733002209,"id":"01a0f001-25e1-7c80-8dfb-12c72212105c","sender":"pij-yelling-trout"}
93785|11:50:02|fyi.held|{"held_at_ms":1790733002078,"id":"01a0f001-255e-7d10-8dfc-ad3578d615b1","sender":"pij-yelling-trout"}
93784|11:50:02|fyi.held|{"held_at_ms":1790733002025,"id":"01a0f001-2529-7e23-99d7-29d2bd53e836","sender":"pij-yelling-trout"}
93783|11:50:01|fyi.held|{"held_at_ms":1790733001970,"id":"01a0f001-24f2-7801-b015-8c205d5514f3","sender":"pij-yelling-trout"}
93782|11:50:01|fyi.held|{"held_at_ms":1790733001925,"id":"01a0f001-24c5-7742-a64c-95dcf448690e","sender":"pij-yelling-trout"}
message:fyi-flush-pij-frantic-cormac-1790733002211
```
The seat took exactly one turn, for the single `pij-bg` message, and read "5 FYIs were queued for you:" as the first line.

## 2. Five FYIs to a cold seat ⇒ no turn
`pij-convenient-deathwing` (OMP) had a five-minute cache TTL, from OMP's native split. We waited until it was cold (`expiredForMs: 21513`) before sending:
```
idle cache {'value': {'state': 'cold', 'expiredForMs': 21513}, 'basis': 'derived'}
pij send: held (fyi) — 01a0f007-1495-7df0-9bab-b7a4b81457a7
pij send: held (fyi) — 01a0f007-14db-7ec3-a375-6854594e6b85
pij send: held (fyi) — 01a0f007-1513-7963-a587-53b85701b0ab
pij send: held (fyi) — 01a0f007-1547-7f53-8150-c6553e6e4149
pij send: held (fyi) — 01a0f007-1581-7303-a785-05b0d759a410
after 5 (cold): pending 5 state idle
fyi.held|5
```
The spine shows only `fyi.held` ×5 in that minute. There was no delivery and no turn; the status line showed `✉5`.

## 3. Eight pending ⇒ a digest on the next typed turn
Three more FYIs made 8 pending. A typed prompt then went into the OMP pane, and its `hook:omp` claim delivered the digest:
```
pij send: held (fyi) — 01a0f007-8790-7931-8966-d11f515c0609
pij send: held (fyi) — 01a0f007-88b3-7e42-99aa-2bcc34fff8f9
pij send: held (fyi) — 01a0f007-896a-7a02-825c-8cfdaa0a2244
pending 8 state idle
after typed turn: pending 0 state idle
93836|11:57:01|hook:omp|8|1790733421991
│ 📦 pij
│ You are a throwaway seat for a pij FYI live proof (plan 159). Reply with the single word: ready. Use no tools. For every later prompt: reply with one short line saying how many FYIs you were given
│ of the FYI block, and use no tools.
```
The digest's own command (`pij-rs fyi-read … --claimed-at 1790733421991`) printed all 8 in full, above. The typed turn carried the pile: no separate turn opened.

## 4. `--fyi "can you check X?"` ⇒ the warning
```
pij send: held (fyi) — 01a0f003-4495-7c52-bad4-9b9a81dce8a4
this looks like a question; if you need an answer, resend without --fyi
{"outcome": {"outcome": "held", "reason": "fyi"}, "warning": "this looks like a question; if you need an answer, resend without --fyi"}
pending 2 state idle
pij send: held (fyi) — b354878b6695a09b-0000000000000001
this looks like a question; if you need an answer, resend without --fyi
```
The FYI is still held (pending rose to 2), and the warning follows the receipt on the native CLI (`pij-rs`), in `--json`, and on the shim (`pij send`).

## Which harnesses can flush today
A flush needs a known last call AND a known cache TTL (review ruling 1).
| harness | session facts | TTL | can flush |
|---|---|---|---|
| Claude | readable | derived from the cache-write split (one hour on this seat) | yes (proof 1) |
| OMP, Claude models | readable (#460) | five minutes, from OMP's native `cttl` split | yes, within 5 min of its last call |
| OMP, GPT models | readable | none recorded (Unisphere invents no TTL) | no: held until the next turn |
| Codex | readable (#460) | not recorded | no |
| Copilot, Pi | unsupported | — | no |

## Finding: an old OMP session silently drops `fyi`
My own long-running OMP session loaded the `pij_send` tool before plan 158, so its schema has no `fyi`. Four `pij_send({…, fyi: true})` calls were accepted and **delivered as normal messages** (receipt `queued`, four turns on the proof seat) instead of being held. The tool ignores an unknown property instead of refusing it. Any session started before 158 has the same hazard until it reloads. The CLI was used for the proof.
