# s054 live demo script — AC-07 + AC-09 in the wild

**For**: whoever drives the combined daemon restart (mandrill, on Jordan's word).
**From**: pij-civilian-takin (s054 orchestrator — I built these verbs; this is the
card you'd otherwise reverse-engineer).
**Ship checklist**: §4 (live two-peer demo) + the §4 bonus (AC-09 addressability).
**Repo state**: everything below is on main as of `ab16cfb`.

---

## ⚠️ Read these two first — they will cost you the demo otherwise

**1. The daemon has NO hot-reload.** It runs `tsx` off source; a daemon started
before `ab16cfb` silently ignores *every* s054 daemon-side behaviour — runtime
axis, anomaly sweep, windowId backfill. Nothing below works until the combined
restart has actually happened. If the demo looks dead, check this before
debugging anything else.

**2. Do NOT try to demo axis-disagreement live.** Checklist §4 offers "park a
dispatched worker idle past the threshold" — that threshold is
**`DEFAULT_IDLE_DISAGREEMENT_MS = 4 hours`** (`core/anomalies.ts:28`), and the
`anomalies` verb exposes **only `--json`** — there is no `--threshold` override
to shrink it. So the 44h-incident shape cannot be produced in a live session
without faking the clock. **Use `unverified-done` (below) — it fires
immediately.** Axis-disagreement is already proven deterministically by
`acceptance-sweep.test.ts` with an injected clock; the live demo doesn't need
to re-prove it, and can't.

---

## Setup — two real peers under the restarted daemon

```bash
pij daemon status                      # must be healthy AND post-restart
pij spawn claude --task "demo worker"  # note the id it prints → <WORKER>
pij whoami                             # you are the parent → <PARENT>
pij tree --json | jq '.[] | {id, systemState, semanticState, unadopted}'
```

Expect: `<WORKER>` appears with `systemState: "starting"` (AC-04 — the
hold-until-bind verdict), flipping to `working`/`idle` once it binds.

## Demo 1 — AC-07: unverified done + the once-per-transition alert

The survey-unanimous #1 danger: a seat claiming *done* with nothing verifying it.

```bash
pij task set <WORKER> "ship the demo" --json          # opens an assignment
pij state set <WORKER> done --json                    # the CLAIM
pij anomalies --json | jq '.[] | {kind, nodeId, detail, evidence}'
```

**Expect**: one `unverified-done` anomaly, carrying spine `evidence` seqs — a
done that nobody verified is *surfaced*, never auto-corrected.

```bash
pij node show <WORKER> --json | jq '{semanticState, badge, assignments}'
```

**Expect**: the assignment renders **UNVERIFIED** — done is a claim until
someone else stamps it.

```bash
pij state verify <WORKER> --actor "<PARENT>" --json   # a DIFFERENT actor verifies
pij anomalies --json | jq 'length'                    # → 0: the anomaly clears
```

**The alert half (the latch — this is the AC-07 assertion that matters):** while
the anomaly stands, the daemon pushes **exactly ONE** alert to the node's
`effectiveParent` (`parentId ?? spawnedBy`) and then **takes no action**. Watch
the parent's pane: one notice, not a stream. Let the sweep tick a few times —
if a second alert ever appears for the same transition, that's a real latch
regression and worth stopping the demo for.

## Demo 2 — AC-07: foreign hold-clear (also immediate)

Someone else clearing *your* hold is exactly the silent-override class:

```bash
pij state set <WORKER> hold --actor "alice" --json
pij state set <WORKER> ready --actor "bob" --json     # different actor clears it
pij anomalies --json | jq '.[] | select(.kind=="foreign-hold-clear") | .detail'
```

**Expect**: `hold issued by alice … was cleared by bob (→ ready)` — both actors
named, evidence = `[holdSeq, clearSeq]`.

## Demo 3 — AC-09: terminal addressability (the bonus proof)

The node card carries a real tmux address, so a UI can *jump you to the seat*:

```bash
tmux select-window -t "$(pij node show <WORKER> --json | jq -r .windowId)"
```

**Expect**: your terminal lands on the worker's window. That's the whole claim —
`windowId` is captured at spawn/adopt and backfilled by the daemon for legacy
live nodes.

```bash
pij node show <WORKER> --json | jq '{systemState, semanticState, badge, windowId, paneId, contextMax, contextCurrent}'
```

**Expect**: both axes present; `contextCurrent` is a **real reading or an honest
`unknown`** — never an estimate. Copilot seats always read `unknown` by design
(no source exists); that is correct behaviour, not a gap.

## Demo 4 — AC-10: the spine's debut outside the fence

```bash
pij spine render --json                # writes the REAL ~/.pij/spine/spine.md
head -40 ~/.pij/spine/spine.md
```

This is the first time the render touches a real home (R3 fenced it to temp
homes for the entire build). Re-run it — the output is byte-stable for
identical input.

## Teardown

```bash
pij close <WORKER>                     # close only what you spawned
```

---

## If something looks wrong

| Symptom | Almost certainly |
|---|---|
| Nothing reacts; states never move | Daemon not restarted post-`ab16cfb` (see warning 1) |
| No axis-disagreement anomaly | Expected — 4h threshold, not demo-able (warning 2) |
| `windowId` null on an old peer | Legacy node; the daemon backfills it once per run — give it a tick |
| `contextCurrent: unknown` | Correct for copilot seats, and for any harness whose source is absent |
| Two alerts for one transition | **Real latch regression** — capture it and route to the s054 orchestrator |

Anything genuinely surprising is worth a `harness observe` on the spot — it is
the platform's first contact with the real world, and that is exactly where the
honest-`unknown` law earns or loses its keep.
