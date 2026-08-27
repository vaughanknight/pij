# pij comms benchmarks — poc/comms-sqlite-socket

**Method** (applies to every row; harness: `harness/scripts/comms-bench.py` on the branch): an isolated daemon (`PIJ_HOME=<scratch>`, `PIJ_QUEUE_BACKEND=sqlite`, private `tmux -L pijpoc` server, `PIJ_BENCH_KEYLOG` set) with scratch seats spawned by the isolated `pij spawn` (claude haiku; copilot gpt-5.6-sol with `--ui-server`; a second copilot demoted to legacy by removing `rpcPort`). **send→acked ms** = `receipts.acked.at − receipts.queued.at` in `<PIJ_HOME>/queue/pij.sqlite` (`injected` for pointer rows). **keystrokes** = `send-keys`/`paste-buffer` calls the daemon made during the scenario (from the keylog). **verified** = the framed body found byte-exact in the recipient harness's own transcript (claude `~/.claude/projects/…/<session>.jsonl` user turns + `queued_command` attachments; copilot `~/.copilot/session-state/<id>/events.jsonl` `user.message`) — rows are written only when verified or explicitly marked NOT VERIFIED. **LOAD** = 50 bodies (~600 B) from 3 sender ids in a burst to one claude seat; loss = sent − acked in 120 s; p50/p95 latency. **RESTART** = SIGTERM the daemon, enqueue 5 bodies while down, restart; acked, duplicates (transcript occurrences − 1), loss. Bodies are 31-line / ~3 KB unless stated. Hardware: Mac Studio, macOS Darwin 25.6, Node 26.3.1, Claude Code 2.1.247, Copilot CLI 1.0.81, tmux 3.6a.

Pre-PoC reference (status quo `send-keys -l` body typing, measured in the review on 2026-08-27): 3 KB multi-line bodies to a claude seat **clipped 8/8** to the last ~350 B (head lost), 1 keystroke burst + up to 3 Enters per message; `unverified` 321/500 receipts; delivery = 600 ms tick.

| label | scenario | body | send→acked ms | keystrokes | verified | note |
|---|---|---|---|---|---|---|
| baseline b24d01f | C1 claude idle 3KB | 3177 B | 1091 | 0 | transcript ×1 | state=acked |
| baseline b24d01f | C2 claude mid-turn 3KB | 3177 B | 360 | 0 | transcript ×1 | state=acked; sent 0s into a 40s tool call |
| baseline b24d01f | P1 copilot idle 3KB (rpc) | 3177 B | 9003 | 5 | NOT VERIFIED (×2) | state=acked |
| baseline b24d01f | L1 legacy seat pointer | 3177 B | 1883 | 4 | pointer line only (body not in events.jsonl by design) | state=injected (pointer) |
| baseline b24d01f | LOAD 50 msgs/3 senders → claude | 26000 B | p50 321 / p95 470 | n/a | transcript ×14/50 | acked 50/50, loss 0 |
| baseline b24d01f | RESTART 5 queued while daemon down | 1505 B | — | n/a | transcript ×[1, 1, 1, 1, 1] | acked 5/5, dup 0, loss 0 |
| after item 1 async 8065e19 | C1 claude idle 3KB | 3177 B | 423 | 0 | transcript ×1 | state=acked |
| after item 1 async 8065e19 | C2 claude mid-turn 3KB | 3177 B | 229 | 0 | transcript ×1 | state=acked; sent 0s into a 40s tool call |
| after item 1 async 8065e19 | P1 copilot idle 3KB (rpc) | 3177 B | 2416 | 5 | events.jsonl ×1 | state=acked |
| after item 1 async 8065e19 | L1 legacy seat pointer | 3177 B | 12019 | 4 | pointer line only (body not in events.jsonl by design) | state=injected (pointer) |
| after item 1 async 8065e19 | LOAD 50 msgs/3 senders → claude | 26000 B | p50 271 / p95 368 | n/a | transcript ×14/50 | acked 50/50, loss 0 |
| after item 1 async 8065e19 | RESTART 5 queued while daemon down | 1505 B | — | n/a | transcript ×[1, 1, 1, 1, 1] | acked 5/5, dup 0, loss 0 |
| after all items ea9633c | C1 claude idle 3KB | 3177 B | 226 | 0 | transcript ×1 | state=acked |
| after all items ea9633c | C2 claude mid-turn 3KB | 3177 B | 206 | 0 | transcript ×1 | state=acked; sent 0s into a 40s tool call |
| after all items ea9633c | P1 copilot idle 3KB (rpc) | 3177 B | 1916 | 5 | events.jsonl ×1 | state=acked |
| after all items ea9633c | L1 legacy seat pointer | 3177 B | 1555 | 4 | pointer line only (body not in events.jsonl by design) | state=injected (pointer) |
| after all items ea9633c | LOAD 50 msgs/3 senders → claude | 26000 B | p50 272 / p95 418 | n/a | transcript ×14/50 | acked 50/50, loss 0 |
| after all items ea9633c | RESTART 5 queued while daemon down | 1505 B | — | n/a | transcript ×[1, 1, 1, 1, 1] | acked 5/5, dup 0, loss 0 |
