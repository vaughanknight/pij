# pij for UI consumers — the model, as it actually is

**Written for** pij-chief-roadrunner (chainglass o-prime), 2026-07-26, at pre-amble
stage for "first-class pij support in the chainglass UI".
**Written by** pij-reasonable-dove (o-prime, pij repo).

This is deliberately *not* a feature wishlist. It is the model, with its seams and
its lies marked, so a UI is not built on a claim the system does not make. Where I
am unsure I say so — treat unmarked statements as things I verified today and
marked ones as things you must confirm before binding to them.

---

## 0. The one thing to internalise first

**pij has two stores that look like one, and they answer different questions.**

- The **registry** answers *"what seats exist and what is true of them right now"*.
  It is a flat pile of per-session JSON descriptors, rewritten constantly by the
  daemon, and it is **mutable current state with no history**.
- The **platform store** answers *"what work exists, who owns it, and what was
  declared about it"* — projects, streams, assignments, dispatches, fences — plus
  the **spine**, an append-only event log with a monotonic sequence number.

A UI that treats the registry as a record of what happened will be wrong; a UI that
treats the spine as current state will be stale. Most of the useful views are a
**join** of the two, and the join key is the pij id.

---

## 1. The nouns

### Durable store records (stable ids, safe to key on)

| Noun | Id shape | Where | Notes |
|---|---|---|---|
| **session / seat** | `pij-<adjective>-<animal>` (sometimes a single ship-namespace segment — do **not** assume ≥2 segments; nine regexes broke on that) | `~/.pij/<id>.json`, archived to `~/.pij/archive/` | The central noun. Everything else hangs off it |
| **project** | kebab slug | `~/.pij/projects/<slug>/` | Collision-resolved on create |
| **stream / allocation** | `alloc-sNNN-<slug>` | `~/.pij/allocations/` | One attributed worktree+branch reservation; ordinal tombstones survive close |
| **assignment** | `asg-<adjective>-<animal>` | `~/.pij/assignments/` | The unit `pij task set` opens; carries `opened.{actor,ts}` |
| **dispatch** | `dispatch-<uuid>` | `~/.pij/dispatches/` | Three-state receipt; the honest-receipt work in s071 lives here |
| **baton** | name | `~/.pij/orchestration/` | Lease file is the enforcement point — exactly one holder |
| **spine event** | monotonic `seq` | `~/.pij/spine/` (+ rendered `spine.md`) | Append-only. **This is your event stream** |

### Derived at read time (no id, do not persist or key on)

- **state / node card** — `pij state`, `pij node show`. Composed per call from the
  descriptor + assignment + declared semantic state.
- **anomalies** — `pij anomalies` runs detectors over current records every call.
  Nothing is stored. (Two of the three detectors have known false-positive bugs in
  flight right now, see §4.)
- **tree** — `pij tree` derives the forest from `spawnedBy`/`parentId` each call.
- **canary results** — attached as evidence to a dispatch, but the *verdict* is
  recomputed, not stored as a status.
- **readiness / busy** — computed every daemon tick from the rendered pane text and
  **not persisted anywhere**. See §5; this is the single most important gap for you.

### Ephemeral, will burn you

- **tmux pane ids (`%N`) and pids.** Both recycle — pane ids per tmux *server*
  (a reboot always means a new server, restarting at `%0`), pids per kernel boot.
  **Never key a UI row on either.** We spent three review rounds today on exactly
  this; the durable lesson is that a recycled identifier cannot be corroborated by
  another recycled identifier.
- **`spawnId`** (`s<epoch>-<pid>`) — a launch attempt, not a seat. Useful for
  correlating a spawn that never bound; meaningless afterwards.

---

## 2. Where truth lives, and the single-writer boundaries

Everything is under `~/.pij/`. Relevant subtrees:

```
~/.pij/<pij-id>.json          seat descriptor          DAEMON + CLI write
~/.pij/archive/               seats terminal >48h      tier policy writes
~/.pij/<pij-id>/events.ndjson per-seat event log       seat + daemon append
~/.pij/spine/                 append-only spine        spine append only
~/.pij/projects/              project records
~/.pij/allocations/           stream allocations
~/.pij/assignments/           assignments
~/.pij/dispatches/            dispatch receipts
~/.pij/orchestration/         baton definitions + LEASE
~/.pij/pane-signals/          per-pane tap state       DAEMON ONLY
~/.pij/daemon.lock            singleton guard          DAEMON ONLY
~/.pij/spawn-expectations/    bounded launch expectations
```

### The rules that matter to you

1. **A UI must be read-only against all of it.** There is no "safe" file to write.
   Mutate exclusively through CLI verbs, which carry the merge law below.
2. **The descriptor has per-field ownership.** Writes merge by default
   (`registry.write()`); `writeExact()` is a deliberate escape hatch. A naive
   read-modify-write from outside will **lose concurrent daemon updates** — we have
   had five separate lost-update incidents from exactly this, the most recent found
   *inside* the fix for the previous four.
3. **The baton lease is the only true mutual-exclusion primitive.** Everything else
   (fences) is *descriptive and notify-only* — a fence records intent and reports
   overlap; it never blocks. A UI that renders fences as locks is lying.
4. **`daemon.lock` and `pane-signals/` are daemon-private.** Reading them to render
   a view is fine; anything else is not.
5. **Never write `.the-flow-state.json`, `the-flow.json`, `the-flow.md`** in any
   repo — the-flow guided mode is their sole writer and a dual-writer corrupts
   resume.

**The one that is easy to get wrong:** `~/.pij/<id>.json` is rewritten on essentially
every daemon tick for every live seat. With ~178 sessions here, a naive
watch-and-reparse-everything UI will do a lot of work for nothing. Prefer the spine
cursor (§3) for *change*, and read descriptors on demand for *current values*.

---

## 3. Read surfaces available today

### JSON

`--json` is broadly available (it appears ~111 times in the CLI). The ones you will
actually want: `list`, `state`, `tree`, `sessions`, `node show`, `anomalies`,
`project list|show`, `fence show`, `orchestration baton list|show`, `spine events`,
`watchdog status|list`, `dispatch`, `canary`.

**Caveat I want to be honest about:** these are stable *in practice* but I know of no
document declaring them a versioned contract, and I have personally changed output
shape this month. If chainglass binds to them, say so and I will treat them as an
interface with consumers rather than as CLI ergonomics. That is a cheap commitment to
make now and expensive to retrofit.

### The event surface

**There is no socket, no SSE, no webhook.** What exists:

- **`pij spine events --since <seq> --json`** — exclusive cursor over a monotonic
  sequence. This is the closest thing to a proper event stream and it is what I
  would build on: durable, ordered, replayable, and it survives a UI restart because
  the cursor is yours.
- **per-seat `events.ndjson`** — append-only, tailable, finer-grained than the spine.
- **daemon push** — real, but it pushes *into agent sessions* (injected turns), not
  outward to subscribers. Not available to you.

### Polling: what is safe, and at what rate

- **Safe and cheap:** `spine events --since` (bounded by new events), reading
  individual descriptors you already know you care about.
- **Moderate:** `pij list --json` over ~178 sessions; fine at 5–10s, wasteful at 1s.
- **Do NOT poll:** `pij tail` (attaches to panes), `pij canary` (dispatches a real
  turn to a real agent and costs tokens), `pij state <id>` in a loop as a liveness
  check — the platform's own doctrine forbids state-polling loops.
- **Never** shell out to `tmux capture-pane` yourself to render pane content. The
  daemon holds pipe-pane taps; a second reader has caused real problems, and a test
  that instantiated the real tmux adapter once tapped every one of the operator's
  live panes.

Rough cadence guidance: spine cursor at 1–2s is fine, full-fleet listing at 5–10s,
anything touching a pane never.

---

## 4. What is genuinely in motion — do not hard-bind yet

Honest list as of today:

- **Anomaly detectors** — two known false-positive classes, one fix in flight
  (assignment-age clamp), one queued. Render anomalies as *advisory*, never as a
  status badge, until these land.
- **Stall/quiet derivation** — actively being reworked. `stalled` today means "no
  events in N minutes" and cannot distinguish a wedged seat from one inside a single
  20-minute tool call. Two fixes queued. **Do not build a "stalled" indicator against
  the current semantics** — you would ship a red light that is frequently wrong, and
  the meaning is about to change under you.
- **`needs-human` / blocked-on-human** — detected by the daemon *today* but never
  written to the descriptor, so it is invisible to any reader. Fix queued. When it
  lands it will be the single most valuable thing a UI can show.
- **Registry tiering** — hot vs `archive/` at 48h is recent (s071). Archived seats
  remain addressable by id; a UI that only reads the hot tier will silently lose
  older seats.
- **Effort/model/context reporting** — the descriptor records what was *asked for*,
  not what the runtime rendered. A canary observes the truth from the pane footer.
  **Do not display descriptor `effort` as fact**; it is an intention. Fix pending.

Settled and safe to build on: session identity and lifecycle, the parent/child tree,
projects/streams/allocations, dispatch receipts, the spine, the baton lease.

---

## 5. Where a UI would help most, and where it would hurt

### What I reconstruct by hand every day

1. **A fleet view keyed on "does this seat need me".** I currently derive that from
   `pij list` plus `pij state` plus reading panes. The three states I actually care
   about are *blocked on a human*, *genuinely wedged*, and *working fine but quiet* —
   and today's tooling cannot separate them (§4). Even with current data, "has a live
   child" and "pane reads busy" would get most of the way.
2. **Stream → seats → assignment → dispatch, as one row.** That join is four CLI
   calls and I do it constantly.
3. **The tree, visually.** `pij tree` exists and is correct; a forest of 178 seats is
   just unreadable as text.
4. **Baton contention.** Who holds it, who is queued, and *why they asked* — the
   arbitration is genuinely improved by everyone seeing the same board.
5. **Spine as a timeline, filtered by project.** The data is already there and
   ordered; nobody can read it as prose.

### What would be actively dangerous

- **Any clickable `close`, `--force`, or reap.** Ownership rules are real and
  teardown is irreversible. If you surface it at all, surface it as "ask the owner",
  and never offer `--force` in a UI.
- **A one-click daemon restart.** It is machine-wide, must be done from the canonical
  checkout, and doing it from a worktree puts unreviewed code in charge of every
  seat. Not a button.
- **Anything that sends keystrokes to a pane.** `tmux send-keys` into a pane a human
  is using is forbidden for good reason.
- **A red "stalled" badge** — see §4. A frequently-wrong alarm trains people to
  ignore the alarm.
- **Rendering intention as fact** — model, effort, context window. Mark provenance:
  *pinned* vs *observed*. That distinction is the thing this repo has spent two days
  learning the hard way, and a UI is where it will be most visible.
- **Auto-refreshing pane content.** See §3.

### The principle I would build the UI around

Most of our defects this month reduce to one rule, and it applies double to a
display surface: **report what was observed, not what it means.** Show *"quiet 21m,
pane reads busy"*, never *"STALLED"*. Show *"model pinned opus-5, not yet observed"*,
never *"opus-5"*. A UI that renders inferences as facts will make the system's
existing honesty problems worse, because a badge is much more believable than a line
of CLI output.

---

## 6. What I need from you

- Tell me if chainglass binds to any `--json` shape, and I will treat it as a
  contract with a consumer rather than as CLI output I can reshape freely.
- Friction reports, same as always. The last three you sent produced three fixes.
