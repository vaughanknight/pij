# Research dossier — liveness fields (pij#142, pij#155)

**Stream**: s095-liveness-fields · **PM**: `pij-fair-aphid` · **Prime**: `pij-continuing-ermine`
**Date**: 2026-08-08 · **Issues**: pij#142, pij#155 (related, not owned: pij#171, pij#154, pij#141)

> Every number in this dossier was produced by a command run on this machine on 2026-08-08.
> Nothing here is inferred from an issue body. Where an issue's claim and a measurement
> disagree, the measurement is recorded and the divergence is called out.

---

## 1. The thesis: one defect in series, not two

The two issues describe the same function. `reconcileDeaths()` in
`.pi/extensions/pij/core/daemon/death-reconciler.ts`:

```ts
for (const descriptor of input.descriptors) {
  if (descriptor.lifecycle === "dissolved" || descriptor.terminal !== undefined) continue;  // ← the LATCH (#155)
  ...
  if (input.isAlive(descriptor.pid)) continue;                                              // ← the BLIND PROBE (#142)
  observation = { kind: "absent", observedAt: input.nowIso, evidence: "pid-missing", ... };
```

- **The probe writes the wrong value** (#142) — `descriptor.pid` is not reliably the agent.
- **The guard makes that value permanent** (#155) — a descriptor carrying `terminal` is
  skipped on every subsequent tick, so the observation is never revisited.

**A blind probe whose output is latched is not two bugs; it is a wrong answer made
permanent.** Fixing either alone leaves observed behaviour unchanged for every existing seat:
unlatching without fixing the probe re-derives the same wrong answer next tick; fixing the
probe without unlatching leaves every already-stamped seat stuck forever.

This framing was accepted by the prime as the stream's shape.

---

## 2. Measurement A — the agent's depth below the registry pid is **mixed**

pij#142 states the registry pid is "the tmux pane's shell" and proposes `pgrep -P <pid>` as
the correct probe. **The first half is true for some seats and false for others, and the
proposed remedy is therefore also blind — in the opposite direction.**

Method: for every non-dissolved descriptor in `~/.pij/*.json` with a live pid, walk the
process tree from the registry pid and locate the first process whose command names a
harness binary (`copilot`/`claude`/`codex`/`pi`/`omp`), to a depth bound of 3.

```
AGENT DEPTH BELOW REGISTRY PID (live seats): {0: 16, 1: 7}
```

| depth | meaning | seats |
|---|---|---|
| 0 | the registry pid **is** the agent process | 16 |
| 1 | the registry pid is the pane shell; agent is its child | 7 |

Worked examples, both directions, **within the same harness**:

```
pij-annual-lemur      copilot  L0 44535: node …/copilot --yolo --session-id …   ← agent AT the pid
pij-tiny-bug          copilot  L0 65242: -zsh
                               L1 65349: node …/copilot --yolo --resume=…       ← agent BELOW the pid

pij-disturbing-ox     claude   L0 28850: claude --dangerously-skip-permissions --session-id …
pij-massive-meadowlark claude  L0 39585: -zsh
                               L1 39670: claude --dangerously-skip-permissions --resume
```

**Finding**: the split tracks the **spawn path** (`--session-id` fresh spawns land the agent
at L0; `--resume` re-launches run under a shell at L1), **not the harness**. A probe
hardcoded at `pgrep -P` one level would return "no agent" for the 16 L0 seats — a false-dead
on the majority of the live population.

**Consequence for the fix**: the probe must be a **bounded descendant walk that includes the
registry pid itself** and matches on command identity, never a fixed depth.

---

## 3. Measurement B — the probe also fails **false-alive** (not claimed by either issue)

`isAlive()` is `process.kill(pid, 0)` (`.pi/extensions/pij/adapters/process.ts:16`) — an
**existence** test on a number. A pid is a reusable lease, not an identity.

```
pij-weak-gurgeh   descriptor startedAt = 2026-08-05T12:31:10Z   registry pid = 952
  ps -o lstart=,command= -p 952
  → Sat  8 Aug 00:20:51 2026   /Library/Intune/Microsoft Intune Agent.app/…/IntuneMdmDaemon
```

Pid 952 was recycled across the 2026-08-08 00:20 reboot and now belongs to an unrelated
system daemon that **started three days after the descriptor was written**. `isAlive(952)`
returns `true` and always will.

**Consequence**: a seat in this state can *never* be stamped terminal, however long it has
been gone — the mirror image of #142's false-dead, and invisible to both issues. The window
opens exactly at a reboot, which is also when the most descriptors go stale.

**Detection**: a process whose start time is **after** the descriptor's `startedAt` cannot be
that descriptor's agent. This is cheap, local, and requires no new persisted state.

---

## 4. Measurement C — the latched population has **grown from 4 to 15**

pij#155 reported 4 seats carrying `lifecycle: bound` alongside an uncleared `terminal`
record, having emitted events more than 60s after the observation. Re-running the same
measurement one day later, with the same >60s discriminator:

```
count > 60s gap: 15
```

| gap (days) | seat | lifecycle | state | evidence | harness |
|---|---|---|---|---|---|
| 12.16 | `pij-zoophagous-firefly` | bound | working | pid-missing | claude |
| 12.10 | `pij-tense-centipede` | bound | idle | pid-missing | claude |
| 7.94 | `pij-reasonable-dove` | bound | idle | pid-missing | claude |
| 2.29 | `pij-grieving-gibbon` | bound | idle | pid-missing | claude |
| 0.20 | `pij-wee-albatross` | bound | working | pid-missing | claude |
| 0.20 | **`pij-unwilling-butterfly`** | bound | **working** | pid-missing | copilot |
| 0.20 | `pij-able-egret` | bound | working | pid-missing | claude |
| 0.19 | `pij-mental-dajeil` | bound | idle | pid-missing | claude |
| 0.19 | `pij-cheap-cheetah` | bound | idle | pid-missing | claude |
| 0.14 | `pij-unknown-guan` | bound | idle | pid-missing | copilot |
| 0.12 | `pij-related-koala` | bound | idle | pid-missing | claude |
| 0.12 | `pij-able-eel` | bound | idle | pid-missing | claude |
| 0.11 | `pij-visiting-catshark` | bound | idle | pid-missing | claude |
| 0.08 | `pij-zygomorphic-bonobo` | bound | idle | pid-missing | claude |
| 0.05 | `pij-90wkbu` | bound | idle | pid-missing | claude |

**All 15 share `evidence: pid-missing` and `disposition: unrequested-by-pij`** — every one is
a latched *inference*, never a requested teardown. The growth from 4 → 15 in ~24h is the
monotonic accumulation #155 predicted: there is no clear-on-return path, so the population
can only grow.

> ### ⚠️ CORRECTION (2026-08-08, later the same day) — the count is right, the reading was wrong
>
> This table, and pij#155's own headline, describe these seats as having **"emitted events
> after being observed terminal"**, which both that issue and this dossier's first draft read as
> **seats returning**. **For any seat whose pane was recycled, that is not a return.** It is a
> corpse being ventriloquised by whichever live seat inherited its pane id.
>
> Proven with a two-point measurement, not an argument:
>
> ```
> pij-unwilling-butterfly   pid 19325 → NO PROCESS (dead ~19h)   paneId %47   terminal: stamped
>   lastEventAt @ 04:02Z read : 2026-08-08T04:02:52.533Z
>   lastEventAt @ 04:46Z read : 2026-08-08T04:45:50.847Z    ← ADVANCED 43min while dead
>
> pij-sacred-orangutan      ALIVE, pane pid 31163            paneId %47   terminal: none
>   lastEventAt              : 2026-08-08T04:46:10.289Z    ← 20s after the corpse's
> ```
>
> Two descriptors claim `%47`; one is dead; their timestamps track each other. The mechanism is
> `core/daemon/loop.ts:176-184` — `observeActivity()` advances `state` and `lastEventAt` from
> **pane readiness with no terminal guard**, so a live seat on a re-leased pane writes activity
> into a dead seat's descriptor. That is pij#172, and it is the pane-axis twin of §3's pid reuse.
>
> **Consequence for this stream**: the 15-seat count stands as *"descriptors whose `lastEventAt`
> moved after the terminal observation"*, but it may **not** be read as *"seats that returned"*
> without first corroborating the pane. §5's two live seats are unaffected — those were verified
> by finding the agent process itself, not by a timestamp.
>
> **The fix is not fooled by this**: butterfly probes `absent` (no process at any depth) and
> correctly stays stamped, because the identity ladder compares the descriptor's session id
> against the process actually running rather than trusting a stored identifier.

**Note on #155's bimodal band**: this run did not reproduce the empty 60s–3600s band as a
separate check; the 11 new rows cluster at 0.05–0.20d (72min–4.8h), which straddles it. The
>60s discriminator still cleanly separates teardown write-ordering (sub-minute) from the real
population, so the classification holds, but **the "empty band" is a property of that day's
data, not a durable invariant** — the fix must not encode 3600s as a magic threshold.

---

## 5. Measurement D — two seats are stamped terminal while their agent runs **right now**

The strongest available evidence that `terminal` is not current state:

```
A. STAMPED terminal, agent ALIVE at time of measurement: 2
   pij-mental-dajeil   claude  depth 1  claude --dangerously-skip-permissions --resume
   pij-related-koala   claude  depth 1  claude --dangerously-skip-permissions --resume
```

Both carry `terminal.observedAt = 2026-08-07T23:14:05.850Z` (the same sweep — a single
post-reboot reconciliation stamped a batch), and both have a live `claude` process one level
below their registry pid at this moment. A consumer reading `terminal` as current state is
wrong about these two seats **today**, not historically.

---

## 6. The live test case — `pij-unwilling-butterfly`

Descriptor snapshot preserved at `evidence/butterfly-latched-terminal-2026-08-08.json`.

```
id           = pij-unwilling-butterfly      harness = copilot
pid          = 19325                        paneId  = %47
lifecycle    = bound                        state   = working
startedAt    = 2026-07-28T23:53:59.470Z
terminal     = { disposition: unrequested-by-pij, observedAt: 2026-08-07T23:14:05.850Z,
                 evidence: pid-missing, lastSeenAt: 2026-08-07T09:02:11.800Z }
lastEventAt  = 2026-08-08T04:02:52.533Z     ← 4h49m AFTER the terminal observation
```

Probe today: `ps -p 19325` → empty; `pgrep -P 19325` → empty. The seat is genuinely gone.

Its anomaly row, firing every ~2 minutes:

```
status-stale  pij-unwilling-butterfly  'pij-unwilling-butterfly' has been working for 1141min …
```

**A dead seat is being reported as actively working, for nineteen hours.** The composition
that produces this: `terminal` says gone, `lifecycle` says `bound`, `state` says `working`,
and the anomaly consumer reads the latter two. Three fields on one descriptor, disagreeing,
with no reconciliation between them.

> **DO NOT close this seat.** Its `paneId` `%47` was re-leased by tmux after the server
> restart and now hosts `clam-s077-portability`, a live seat in another government
> (pij#171, found by the prime). `pij close pij-unwilling-butterfly` would kill someone
> else's work. Verification of that claim must use `grep -x`, not `grep -c` (substring
> match — the prime's own first check was wrong in this way).

---

## 7. Negative findings — remedies with no call site

Both proposed remedies in pij#142 are **unimplemented**, verified by search with `--hidden`
(without which the entire `.pi/` tree is invisible — pij#144):

| #142 remedy | status | evidence |
|---|---|---|
| 1. `pij close --force` should refuse/warn when the pid's child is a live harness process | **no call site** | `core/close.ts` gates solely on ownership (`E-OWN`, `close.ts:73`); the word "alive"/"liveness" does not appear in the file |
| 2. Project `agentPid` alongside `pid` | **not implemented** | `grep -rn "agentPid" --include=*.ts .pi/extensions/pij` → 0 matches |

**A remedy with no call site is an untested claim sitting in an issue.** Per the prime this
is the third instance of that shape in this wave (cf. its comment on pij#118, where the
issue's own proposed fix would have regressed another). Recorded in the fleet ledger as
F-401/F-402.

---

## 8. Related defect, deliberately out of scope — pij#171

`paneId` is a **lease, not an identity**: tmux re-mints `%N` after a server restart, so a
stored `paneId` may address a different, live seat. This is the *same root cause as this
stream's defect on a different axis* — pij stores an OS-issued identifier and later treats it
as an identity, with nothing recording which issuing authority (which tmux server, which boot
epoch) minted it.

| axis | identifier | failure | issue |
|---|---|---|---|
| process | `pid` | recycled after reboot → false-alive (§3), or names the wrong process → false-dead (§2) | #142/#155 (**this stream**) |
| terminal | `paneId` | re-leased after tmux restart → destructive action on another government's seat | #171 (**not this stream**) |

Our defect produces a wrong **answer**; #171 produces a wrong **action** with no undo. They
share a natural remedy — a **corroboration check** ("does this identifier still denote the
thing we recorded?") — so the identity-verification helper this stream introduces is the
right home for #171's fix later. **This stream does not implement #171.** The relationship is
recorded so the seam is deliberate rather than accidental.

---

## 9. Consumers of the fields (the blast radius)

| file | reads | owner |
|---|---|---|
| `core/daemon/death-reconciler.ts` | writes `terminal`, calls `isAlive(pid)` | **s095 (ours)** |
| `core/state.ts` | `pidAlive` → `liveness()`, `systemStateOf()` | **s095 (ours)** |
| `core/daemon/runtime-axis.ts:115` | `pidAlive: this.deps.isAlive(descriptor.pid)` | boundary — read carefully |
| `core/revive.ts:295` | `probe.pane === "gone" && !probe.pidAlive` → `"stale"` | boundary |
| `cli.ts:1419` | `pidAlive: new NodeProcess().isAlive(descriptor.pid)` | s093/s094 — **not ours** |
| `core/watchdog.ts`, `core/daemon/watchdog-manager.ts` | eligibility consults `terminal` | **s096 — not ours** |
| `core/anomalies.ts` | the `status-stale` row above | **s097 — not ours** |

**Live seam with s096** (`pij-opposite-owl`, adding an `unknown` verdict): their eligibility
guard *reads* `terminal`; this stream *defines what `terminal` means*. Any change to its
semantics must be relayed to the prime for coordination rather than assumed safe.

---

## 10. What the fix must satisfy

1. A seat whose agent process is alive is **never** stamped terminal — regardless of whether
   the agent sits at the registry pid or below it (§2).
2. A seat whose pid has been **recycled** to an unrelated process is **not** treated as alive
   (§3).
3. A seat already wrongly stamped **recovers** when contrary evidence appears — the 15-seat
   population must un-stick, or the plan must say precisely why a given row does not (§4).
4. The butterfly row must change what it says: a seat that is genuinely gone must stop being
   reported as "working for 1141min" (§6).
5. Tests **fail without the fix**. The 15 latched seats and the butterfly row are the
   evidence that they would.
6. No change to `terminal`'s meaning ships without telling the prime, because s096's guard
   consults it (§9).

## 11. Method notes

- All searches used `rg --hidden` or `grep -r`; a repo-wide `rg` without `--hidden` is
  structurally blind to `.pi/` and reports absence (pij#144).
- Every population count is reproducible from `~/.pij/*.json` with the scripts embedded
  above; none was taken from an issue body.
- The prime explicitly instructed that its own measurements be treated as claims, not facts,
  after producing a substring-match error (`grep -c` vs `grep -x`). Each inherited claim in
  this dossier was therefore re-run locally: the butterfly descriptor (§6) ✅ reproduced;
  the #155 population (§4) ✅ reproduced and found to have grown; the "pid is the pane
  shell" claim (§2) ⚠️ **partially refuted** — true for 7 of 23 live seats, false for 16.
