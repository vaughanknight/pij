# s066 session-revive — cross-model review (Claude Opus 5 / pij-able-catshark)

**VERDICT: FIX_REQUIRED** — F1 and F2 are blockers; F3/F4 are close behind. The
implementation is well-shaped: preflight-before-mutation is real, every *handled*
error rolls back both the pane and the expectation, and the argv choices are the
fail-loud ones (verified against the live binaries). What is missing is coverage of
those rollbacks, a preflight on the *old* incarnation, and a reframe/notice path that
survives the canonical operator flow.

Reviewer ran: focused suite (baseline), an independent 11-mutant Dim-0, a regex
precision probe, live `--help` argv checks on all four binaries, and a read-only
census of the live `~/.pij` registry (1,981 descriptors). Machine-wide daemon NOT
restarted.

---

## Judgement on the primary target (cross-store transition/rollback ordering)

The *ordering* is sound. `planRevive` runs entirely before any mutation; the
expectation is written before the pane; every returned error unwinds in the right
order (`spawn fail → expectations.remove`; `registry.revive fail → killPane +
remove`; `pi wait fail → killPane + remove`). I could not find a handled path that
leaks.

The defects are one level out from ordering:

1. **What the triple means when the third store is never written** (F7) — a hard
   interrupt between the pane spawn and `registry.revive()` leaves a live resumed
   native session behind a `dissolved` descriptor: `FsRegistry.list()` hides it
   (`fs-registry.ts:138`), the daemon never drives it (it is not `pending`), and the
   expectation expires at +5 min into a **false** `⚠️ has exited` notice. Nothing
   kills the orphan pane. Window is ~ms for claude/copilot/codex; the pi/omp path
   self-heals because pi writes its own descriptor.
2. **No preflight on the OLD incarnation** (F6) — this is the "stale incarnation
   wins" hole. `runRevive` never checks the tombstone's own `paneId`/`pid`.
3. **A slow success is converted into a destructive kill** (F5) — the 15 s pi/omp
   registration wait has no post-kill re-check and no tombstone restore.

And none of the compensating writes are covered by a test (Dim-0 below).

---

## Findings

### F1 — HIGH · CONFIRMED · `core/revive.ts:198-203`
**The dissolved-only gate refuses the dominant real case, and misreports it as "live".**
`reconcileDeaths` never sets `lifecycle: "dissolved"` — it only latches `terminal`
(`core/daemon/death-reconciler.ts:134-139`). Only `pij close` dissolves. So every
seat that *died* (crash, killed pane, tmux server restart, reboot) is refused.

Live registry census: **704 pi + 48 claude + 42 copilot + 7 codex = 801 descriptors
carry a latched terminal absence AND a native session id, with `lifecycle ≠
dissolved`.** Reproduced against the real registry with this worktree's build:

```
$ npx tsx .pi/extensions/pij/cli.ts revive pij-ngku68
E-ARG: session 'pij-ngku68' is live; only dissolved sessions can be revived   (exit 64)
   # terminal: unrequested-by-pij, observed 2026-07-20T08:57:55Z
$ npx tsx .pi/extensions/pij/cli.ts revive pij-jtq3m3
E-ARG: session 'pij-jtq3m3' is bound; only dissolved sessions can be revived  (exit 64)
```

`is live` for a seat five days dead is actively misleading — `lifecycle ?? "live"`
should never claim liveness for a descriptor carrying a `terminal` observation.
Jordan's verbatim need ("we needed something more from that agent") mostly arises
*after* a death, not after a deliberate close.

**Fix:** accept `lifecycle === "dissolved" || terminal !== undefined ||
!isAlive(pid)`; derive the refusal message from the terminal observation.

### F2 — HIGH · CONFIRMED · `core/interstitial.ts:39-42` (+ `core/readiness.ts:76`)
**The auto-answer mis-fires on ordinary pane text, and the same pattern wedges every harness.**
`/Session in use[\s\S]*1\. Resume anyway[\s\S]*2\. Go back/i` — no line anchors,
unbounded greedy gaps, matched against the whole capture. Probe results (all three
assertions pass, i.e. all three are real):

| pane content | result |
|---|---|
| plain copilot agent prose mentioning the three fragments (footer `◎ Working esc interrupt`) | `{action:"answer", keys:["1","Enter"]}` → daemon presses **1 + Enter** into a live mid-turn pane |
| same prose, `classifyReadiness` | `"interstitial"` — **overrides the busy footer** |
| same prose, harness `claude` | `needs-human` |
| a *different* modal ("Overwrite checkpoint?") whose body contains the words and whose **option 1 is destructive** | `answer` → presses **1** |

Two distinct harms:
- **Wrong button, live terminal.** The fixture strings live in this repo, so any
  *pending* copilot seat that displays this code or the review packet self-triggers.
- **Never-bind trap, all harnesses.** `classifyReadiness` calls
  `classifyInterstitial` harness-less, so the same text returns `"interstitial"` and
  `driveSession` returns `needs-human` at `loop.ts:289` — **before** the
  init-injection branch at `loop.ts:307`. A pending claude/codex seat that renders
  that text pre-init never gets init and never binds. Same family as the BUSY_RE
  drift that produced the codex never-bind deadlock.

Blast radius is bounded to `index.pending()` seats with daemon-owned delivery, and
the one-shot latch is genuine (`loop.ts:280`, `drive.trustAnswered`) — so it is one
wrong keypress per pending seat per daemon lifetime, not a spam loop.

**Fix:** anchor the option lines (`/^\s*1\.\s+Resume anyway/m`), bound the gaps
(`[\s\S]{0,200}`), require the title on its own line, and match only the tail of the
capture. Precision must be far higher for an `answer` than for a `needs-human` — the
loose patterns are safe only because they fail in the harmless direction.

**Related (MED):** `drive.trustAnswered` is one boolean shared by *both* copilot
`answer` labels. A revive into an untrusted folder answers folder-trust, sets the
latch, and then the session-in-use modal that follows can never be answered — it
degrades to needs-human, which (per F3) is delivered to a dead inbox. The latch
should be per-label.

### F3 — MED-HIGH · CONFIRMED · `core/revive.ts:264-290`
**A revived seat's notices go to its dead original spawner; the reviver is told nothing.**
`buildRevivedDescriptor` keeps the durable `spawnedBy`; nothing records the caller.
`deriveCallerParent`'s result reaches only `command.env.PIJ_PARENT_ID` — which
daemon-bound harnesses never read (`cli.ts:1910`) — and the expectation's
`creatorId`, which is immunized at `cli.ts:1525` by setting `sessionId` (see
`death-reconciler.ts:159`). So the bound notice, `🙋 needs a human`, stalled and
death notices all route to `descriptor.spawnedBy`, which for the canonical
"revive the old dead agent" case is itself dissolved. `pij revive` prints PENDING
CANARY and exits; a revive that then hangs on a modal is **silent**.

**Fix:** set `spawnedBy` (or add `revivedBy` and prefer it in the notice targets) to
the resolved caller.

### F4 — MED-HIGH · CONFIRMED · `core/revive.ts:106-113` + `core/session.ts:255`
**91% of pi/omp revives get NO reframe.**
`piEnv` sets `PIJ_ANNOUNCE_TO: input.parentId ?? descriptor.spawnedBy ?? ""`, and
`session.boot` injects `PIJ_SPAWN_TASK` (the reframe) only inside `if (announceTo)`.
Census: **706 of 774 dissolved pi descriptors have no `spawnedBy`** (root/adopted
seats — exactly the long-lived ones worth reviving). Run from a non-peer shell,
`parentId` is undefined too ⇒ `announceTo === ""` ⇒ `REVIVE_REFRAME` is never
injected. The resumed pi/omp agent wakes with its full prior context and no
instruction to stop — and a pi peer can spawn and message on its own initiative.

Note the asymmetry: the claude/copilot/codex path gets the reframe from
`buildInitInjection` (`harness/claude.ts:139`), which is parent-independent.

**Fix:** inject the reframe on the revive path unconditionally, not via the announce
gate.

### F5 — MED · PLAUSIBLE · `cli.ts:1128-1147`, `cli.ts:199`
**The 15 s pi/omp registration wait kills healthy revives and cannot undo its own kill.**
`WAIT_TIMEOUT_MS = 15_000`, polled every 200 ms; on timeout `killPane` + exit
E-NOREG. **46 pi session files exceed 2 MB; the largest is 48 MB** — the
context-rich sessions most worth reviving are the least likely to finish
resume + extension boot + `registry.revive()` inside 15 s. Worse, the kill does not
re-read: if registration landed after the last poll, the result is a **live
descriptor (pi wrote it itself), a dead pane, and no tombstone** — after which
`pij revive` refuses with "is live" (F1) and the seat is stuck until someone runs
`pij close --force`.

**Fix:** re-read after the deadline before killing; if it registered, keep it (or
restore the tombstone); scale the deadline to artifact size, or expose it as a flag.

### F6 — MED · CONFIRMED · `cli.ts:1371-1470`
**No liveness preflight on the tombstone's own pane/pid — the "stale incarnation" hole.**
`runRevive` reads the descriptor and checks `folder` and the *native artifact*, but
never `descriptor.paneId` / `descriptor.pid`. A dissolved descriptor whose pane
survived (a `killPane` that failed, or the self-dissolve at `session.ts:613`) will
happily be revived: a **second** process resumes the same native session, the
descriptor points at the new pane, and the old live agent becomes invisible
(`list()` keyed on the descriptor). Two writers on one transcript.

**Fix:** refuse when the prior `pid`/pane is alive (or kill it first, explicitly).

### F7 — MED · CONFIRMED · `cli.ts:1471-1524`
**Unguarded window between pane spawn and tombstone replacement leaves an unrecoverable orphan.**
See the primary-target section. The residue after a hard interrupt (Ctrl-C, the
reviving *agent* being compacted or killed — routine in this fleet) is: live resumed
pane + `dissolved` descriptor + an expectation that turns into a false
`⚠️ has exited` notice five minutes later. No sweep reconciles "expectation has a
live pane and no live descriptor", and nothing reaps the pane.

**Fix:** write `sessionId` onto the expectation up front (it is already known), so
the record is self-describing; or add an orphan sweep on that exact condition.

### F8 — LOW-MED · `adapters/fs-registry.ts:147-152` + `core/cli.ts:2356`
**`revive()`'s identity guard is not the only door, and the phonehome change can fail quiet.**
`write()` refuses a dissolved→live transition only when `descriptor.pid ===
existing.pid`. Any writer with a different pid still resurrects a tombstone without
the harness/native-id match `revive()` enforces (e.g. `pij adopt` on a dissolved id
with a different `--session-id`), so the new invariant in `ports.ts:32` is not
enforced at both doors. Conversely, because `applyBinding` preserves `pid`, a
phonehome against a *dissolved* descriptor hits that same guard: the write is
silently dropped while phonehome still prints `(bound)`. Also, `|| d.lifecycle !==
"bound"` now heals `lifecycle: "failed"` back to `bound` on any phonehome,
overwriting the watchdog's terminal verdict. The revive flow itself is unaffected
(the descriptor is `pending` with a fresh pid by then).

### F9 — LOW · `core/types.ts:290`, `core/revive.ts:289`, `core/daemon/loop.ts:312`
**`revivePendingAt` is write-only and never cleared; PENDING CANARY is not durable.**
Written once, read only to select the reframe. Nothing clears it after golden
recall, and `stripPriorRuntimeTermination` (`session.ts:155`) does not strip it, so
it persists into later incarnations. `pij list` / `pij state` therefore cannot
distinguish a verified revive from an unverified one, and the pi/omp path never sets
it at all. Packet item 3's "a booted-but-amnesiac seat reports FAILED" is **not
implemented** — `PENDING CANARY` is one line of stdout and the honesty is entirely
operator-manual. Either document that, or make the flag load-bearing with a
`pij revive --verify` / clear-on-proof step.
**Verified clean:** the reframe does not leak a recall answer (`revive.ts:4-6`,
`claude.ts:139-141` carry no seed). ✓

### F10 — LOW · `core/revive.ts:4` vs `core/harness/claude.ts:139`
Reframe text duplicated with divergent wording ("…messaging anyone; wait for new
instructions" vs "…anyone. Wait for new instructions."). `claude.ts` should import
`REVIVE_REFRAME`.

---

## Independent Dim-0

**Baseline** (the 10 touched test files; the coder's "12 files / 675" is a superset):
`10 passed, 656 passed | 2 skipped`, green. Pre-existing agent-runner/EMFILE noise
excluded per the packet.

**Mutation — 11 valid mutants, 4 killed / 7 survived:**

| mutant | result |
|---|---|
| M1 `planRevive` dissolved-lifecycle gate disabled | **RED (killed)** |
| M2 session-in-use `answer` upgrade removed | **RED (killed)** |
| M4 phonehome `\|\| d.lifecycle !== "bound"` reverted | **RED (killed)** |
| M5 `plannedHarnessSessionId` dropped from the revived descriptor | **RED (killed)** |
| M3 `revive()` harness-mismatch half of the identity guard | GREEN — **survived** |
| M6 `exactlyOne` multi-artifact E-AMBIG branch | GREEN — **survived** |
| M9 `expectations.remove` on spawn failure | GREEN — **survived** |
| M10 `killPane` on `registry.revive` failure | GREEN — **survived** |
| M11 tmux title-failure `kill-pane` rollback | GREEN — **survived** |
| M12 `killPane` on pi-registration timeout | GREEN — **survived** |

**Conclusion:** the reported RED(6)→GREEN covers the argv shapes, the lifecycle
gate, the planned-native-id bind and the phonehome transition — all real. But
**every rollback/compensation path in `runRevive` — the coder's own named primary
risk — is mutation-uncovered**, as is the E-AMBIG store-ambiguity branch behind
packet item 5. The tests prove the happy path and the preflight; they assert nothing
about what happens after a partial failure.
Script: `<scratchpad>/mutate.sh` (restores every file it patches).

## Packet items answered

- **(1) spawn-limbo** — closed for the revive flow (deterministic bind via
  `plannedHarnessSessionId` at `loop.ts:347`, phonehome as belt-and-braces, both
  mutation-covered). Two side effects: fail-quiet on a dissolved descriptor and
  `failed → bound` healing (F8).
- **(1) copilot modal** — cannot key-spam ✓ (latch verified). **Can fire on a
  different modal ✗ and on ordinary prose ✗** (F2). Other harnesses fail closed ✓
  but the same pattern can wedge them pre-init (F2). Shape mismatch does degrade to
  a named needs-human ✓ — but the notice goes to a dead inbox (F3).
- **(2) fail-loud** — no path silently produces a fresh agent. Argv verified live:
  copilot `--resume=<id>` (correctly *not* `--session-id`, which creates-if-missing),
  `codex … resume <id>` (global-flags-before-subcommand parse checked, exit 0),
  `pi --session <path|id>` (existing-only, not `--session-id`), `omp --resume=<path>`.
  The real fail-loud gaps are *refusals of revivable seats* (F1), not false successes.
- **(3) canary honesty** — no leak ✓; but there is no mechanism, only a printed
  string (F9).
- **(4) preflight before mutation** — holds, and is genuinely tested (the
  copilot-missing-artifact case asserts an empty `TMUX_LOG` and zero expectations). ✓
- **(5) `runtimeBin`** — safe in practice: all 774 dissolved pi descriptors lack it
  and fall to exact-one-store inference over 766 pi / 61 omp uuidv7-named files, so
  a cross-store collision is not reachable. The filename shape
  (`<ISO>_<uuid>.jsonl`) matches `exactPiFamilySessions` ✓. Its E-AMBIG guard is
  untested (M6).
- **Evidence gap:** the live golden recall was **copilot only** (STAGE2.md:37). The
  pi/omp path — largest cohort (774), only path with a destructive timeout (F5), and
  the one that loses the reframe (F4) — is neither live-proven nor integration-covered.
