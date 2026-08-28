# Item 23-FX — claude-socket fake close-race flake (tail, after 12-FX)

**Symptom**: `adapters/claude-socket.test.ts:113` "sendClaudeFrame > reports sent after bytes flush but 'the socket closes'" expects 1 received line, intermittently gets 0. Red once at main 5ef1220 (log: o-prime scratchpad suite-5ef1220.txt); green at 3e10a7d and all prior runs.
**Root cause (o-prime dx)**: fake-socket CLOSE-RACE — the fake's close fires vs the byte-flush/received-line non-deterministically, so occasionally the "sent" line isn't observed before close.
**Fix (E22)**: make the FAKE socket's close ordering deterministic (flush/emit the received line before the close resolves, or sequence close after the flush callback). Reproduce first, KEEP the failing log under this plan folder; fix the race, never retry into green. No mutant gate (flake fix); gate = deterministic over N runs, log kept.
**Sequence**: after 12-FX; low priority.
