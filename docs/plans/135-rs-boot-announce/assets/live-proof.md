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

## Daemon bounce — 2026-09-05 10:13, under a window granted by prime

Prime's window carried a trap worth recording: `~/.npm-global/bin/pij-rs` is a
symlink to **main's** `target/release/pij-rs`, so `just bounce-rs` from a worktree
builds the worktree binary and then restarts main's stale one — fix not live,
gates honest, live proof meaningless (or accidentally green). The worktree binary
was therefore started by explicit path.

```
$ ~/.cargo/bin/cargo build --release -p pij-cli     # in the worktree
    Finished `release` profile [optimized] target(s) in 1m 12s

$ old=$(lsof -nP -iTCP:7461 -sTCP:LISTEN -t); echo $old
48871
$ ps -o command= -p 48871
/Users/jordanknight/.npm-global/bin/pij-rs daemon                 # main's binary

$ kill 48871
$ (PIJ_TELEGRAM_ENV="$HOME/.pij/telegram.env" nohup \
    /Users/jordanknight/pi-hacking/fs3-rs-boot-announce/target/release/pij-rs daemon \
    >> "$HOME/.pij-rs/daemon.log" 2>&1 &)

$ new=$(lsof -nP -iTCP:7461 -sTCP:LISTEN -t); echo $new
9633                                                              # pid changed
$ ps -o command= -p 9633
/Users/jordanknight/pi-hacking/fs3-rs-boot-announce/target/release/pij-rs daemon   # WORKTREE

$ pij-rs ping
pij ping: ok — {"build":"pij-rs 0.1.0","machine":"JordansacStudio.localdomain","offline":false,"status":"healthy"}
```

**Telegram env**: `ps eww` and `ps -Eww` show no environment on this macOS even
for one's own processes, so the env was proven by behaviour instead —
`~/.pij-rs/daemon.log` shows the telegram sidecar live and polling
`api.telegram.org/bot<token>/getUpdates`, which it can only do having read
`telegram.env`.

**The decisive check — `binding` is on the wire.** The field existing at all is
the proof the NEW daemon is serving:

```
$ curl -s -X POST http://127.0.0.1:7461/v1/register -H "Authorization: Bearer $KEY" \
   -d '{"id":"pij-fixture-135b","harness":"omp","folder":"…","pid":18774,"proc_start":20260905101451}'
   → .data.binding == "created"      (no row existed)
$ # byte-identical repeat, same process
   → .data.binding == "same"
```

**Daemon half of this plan: LIVE and CORRECT.**

## Extension-link repoint — bounded window, prime-ruled (option (a))

```
readlink ~/.omp/agent/extensions/pij
  before: /Users/jordanknight/pi-hacking/pij/.pi/extensions/pij
  during: /Users/jordanknight/pi-hacking/fs3-rs-boot-announce/.pi/extensions/pij
  after:  /Users/jordanknight/pi-hacking/pij/.pi/extensions/pij
```

Window 10:22–10:42 granted (spawns frozen in plans 136/137); **closed at 10:21**,
21 minutes early. Link verified to carry the fix while repointed
(`grep -c input.fresh core/session.ts` → 1, `grep -c binding
adapters/rust-runtime.ts` → 2). All scratch seats torn down with
`tmux kill-window`.

## AC1 — spawned omp seat announces — **PROVEN**

```
$ pij-rs spawn --harness omp --bin omp
{"id":"pij-used-tarsier","session":"01a06eee-3434-7000-87d9-9f72460f91b7","pane":"%3510",
 "proc":{"pid":31101,"proc_start":20260905101818},"bound":true}

$ tmux capture-pane -p -t %3510 | grep -i 'you are pij session'
 You are pij session pij-used-tarsier (PEER). This is context only — no action is required.

$ grep -c 'You are pij session pij-used-tarsier' \
    ~/.omp/agent/sessions/-pi-hacking-pij/2026-09-05T00-18-19-828Z_01a06eee-3434-7000-87d9-9f72460f91b7.jsonl
1
```

The transcript filename carries **the exact session id the spawn returned**, and
contains **exactly one** announce. Against the control four hours earlier on the
identical gesture: no announce, and no session jsonl written at all.

## AC2 — hand-started seat, reused id, new process — **PROVEN**

The plan's highest-risk case (impl-guide r3): a spawned or reused row is always
`rebound`, never `created`, so a fix that only announced on `created` would leave
the headline gesture broken with every gate green.

```
# row exists, its stored process is dead
seat pij-troubled-wildebeest  pid=66036 start=20260905092040   → ps: DEAD

$ tmux new-window -d -n ac2-handstart -c … "PIJ_SESSION_ID=pij-troubled-wildebeest omp"

$ tmux capture-pane -p -t %3511 | grep -i 'you are pij session'
 You are pij session pij-troubled-wildebeest (PEER). This is context only — no action is required.

# the row re-bound to the NEW process
seat pij-troubled-wildebeest  pid=62414 start=20260905101917

$ grep -c 'You are pij session pij-troubled-wildebeest' <new session jsonl>
1
```

## AC3 — no double announce — **SATISFIED** (claim amended to the observation)

**The claim, as proven** (prime-ruled amendment 2026-09-05): *`/new` and `/reload`
on a live omp seat cause **no re-registration** — one `seat.put`, same id, same
process — and therefore no second announce. `binding=same` is proven at the wire
(byte-identical repeat register) and by u2's unit witnesses against the golden
fixture.*

The plan's original wording, "register returns `binding=same` for the reload",
over-claimed the mechanism. The property AC3 exists to protect — no double
announce — is proven live; the `same` derivation is proven mechanically. Both
halves are real; they are simply proven in different places.

Driven live: `/new` then `/reload` on the AC2 seat; both landed (`✔ New session
started`, `Plugins reloaded.`). **No second announce appeared.**

**The mechanism, recorded because it is the useful row.** The spine shows only ONE
`seat.put` for that seat across both gestures:

```
$ sqlite3 ~/.pij-rs/pij.sqlite \
   "SELECT seq, kind, seat FROM spine_events WHERE seat='pij-troubled-wildebeest' ORDER BY seq DESC LIMIT 8;"
7811|seat.put|pij-troubled-wildebeest     ← the AC2 hand-start
6662|spawn.bound|pij-troubled-wildebeest
6661|seat.put|pij-troubled-wildebeest
6660|seat.put|pij-troubled-wildebeest
```

The row kept the same id **and** the same process, and omp did not re-register on
either gesture — so `binding=same` on a reload was never requested, because no
reload registration occurred. The `same` path is nevertheless proven twice
mechanically: by u2's unit witnesses against the golden fixture, and by the direct
wire check on the rebuilt daemon where a byte-identical repeat register returned
`"same"`.

Recorded honestly rather than marked green: the PM's earlier prediction that
`/new` mints a new seat id and re-announces did **not** hold in this omp flow —
the extension reused the existing identity by pane/process. No test asserts that
prediction, because the ruling to u2 was per-id semantics rather than per-gesture.

## Load artifact recorded (prime-ruled)

`pij-sidecars::direct_child_failure_survives_a_lingering_grandchild` failed inside
a full `cargo test --workspace` run and then passed **10/10 on a quiet
single-package re-run of the same tree**. Untouched crate, timing-sensitive around
real process exit. Third such artifact of the day, all downstream of a
concurrency cap (`VITEST_MAX_THREADS`) that is inert on Vitest 4.
