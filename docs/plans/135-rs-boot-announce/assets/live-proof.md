# Live proof — plan 135 rs-boot-announce

## CONTROL (premise falsification) — 2026-09-05 09:20, branch `135-rs-boot-announce` @ `06b45464`, product code identical to main `46c9314c`

PM (`pij-verbal-silverfish`) re-ran the diagnosis gesture before dispatching anyone
(packet i0: "verify it yourself first — if you observe an announce, the premise is
dead").

```
$ pij-rs ping
pij ping: ok — {"build":"pij-rs 0.1.0","machine":"JordansacStudio.localdomain","offline":false,"status":"healthy"}

$ pij-rs spawn --harness omp --bin omp
pij spawn: ok — {"id":"pij-troubled-wildebeest","harness":"omp",
  "session":"01a06eb9-7062-7000-9fc7-f07531a51c31","pane":"%3478",
  "proc":{"pid":66036,"proc_start":20260905092040},
  "folder":"/Users/jordanknight/pi-hacking/pij","state":"idle",
  "spawn_id":"s-d89b357d13f256e89e7ebc90b9435b1a",
  "model":"github-copilot/gpt-6-astra-1m","dispatched":true,"bound":true,"pid":66036}
```

**Pane** (`tmux capture-pane -p -t %3478`, 40s after spawn) — bound, booted,
transcript EMPTY; the only pij evidence is the status line:

```
 ◫ 2.7%/1M ⟲ · rs·pij-troubled-wildebeest · ⬢ GPT-6 Astra (1M) · ◒ high · ⑂ main *2 ?6 · (sub)
rs pij-troubled-wildebeest
```

**Session transcript**: the seat wrote **no session jsonl at all** — no turn was
ever injected, so omp had nothing to persist.

```
$ ls ~/.omp/agent/sessions/-pi-hacking-pij | grep -c 7062      # spawn's session id
0
$ find ~/.omp/agent/sessions/-pi-hacking-pij -newermt '2026-09-05 09:20:35' -name '*.jsonl'
# only pre-existing seats' files, all created 09:18–09:20:21, i.e. BEFORE the spawn
```

**Verdict: premise CONFIRMED.** A spawned omp seat registers, binds, shows its
`rs·<id>` status line, and receives **zero** `You are pij session <id>` turns.

Scratch window torn down with `tmux kill-window -t @3405` (`pij close` is
legacy-routed and returns `E-NOID` for rs seats — prime's ruling 2026-09-05).

## Contract capture (u0, wave 0)

Three REAL `/v1/register` bodies captured from the live daemon; see
`assets/contracts/README.md` § Provenance. The material finding: the `rebound`
and `same` responses are **indistinguishable on today's wire** — the client is
structurally unable to know a boot is fresh, which is the fact this plan moves.

## AC1 — spawned omp seat announces (post-fix)

_pending compose + daemon bounce_

## AC2 — hand-started seat, reused id, new process (`binding=rebound`)

_pending_

## AC3 — `/new` then `/reload` → `binding=same`, no second announce

_pending_

## Daemon bounce evidence (pid change + ping)

_pending — bounce is gated on prime's window (135/136/137 + Jordan's live seats
share this daemon)_
