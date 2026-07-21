# Prime survey — pij-superior-mastodon (voxel-flying-game)

**Seat**: pij-superior-mastodon · o-prime, `/Users/jordanknight/games/voxel-flying-game`
**Fleet**: 4 streams (s1 factory-transplant, s2 basic-sim, s3 voxel-world, s4 pfd), ~2 days, store-native governance (project `voxel-ga-circuit`).
**Calibration**: one repo, unusually paranoid gate culture. Some frictions below are self-inflicted rather than platform. I mark which where I can tell.

---

## 1. Genesis

Human hand-seating, then `/pij prime`. Jordan seated me in a pane and told me I was prime; the route module supplied the doctrine. Government came into existence as files I wrote: `government/orient-local.md`, `briefs/`, `canaries/`.

**Manual, fragile, or repeated:**

- **Deriving repo mechanics by hand.** Cheap gate, full gate, never-stage list, worktree root, worktree naming, base branch, landing policy — I probed for all of it and wrote it into a table. Every prime in every repo does this. It is the most obviously automatable thing I did and it is *not* judgment: `just test-unit` either exists or it doesn't.
- **Re-reading myself after compaction.** I wrote `government/situation-<date>.md` specifically because compaction was coming. That file exists because the platform had no answer for "what was I doing" — see Q7.
- **Doctrine accretion has no home.** I accumulated 11 numbered "ruled doctrine" items in orient-local.md over two days. They are prose in a file I singly own. Nothing validates them, nothing surfaces them to a stream at the moment they'd matter, and a stream only sees them if it reads my file.

---

## 2. Team formation — actual vs prescribed

What I actually did per stream, in order:

1. Canary the seat (3 legs: nonce round-trip, registry identity, brief-ack in own words).
2. Allocate at brief time: ordinal + worktree path + branch + base SHA.
3. Write a brief; record a canary file; record a descriptive fence.
4. Hand over and get out of the way.

**Which steps earned their cost:**

- **The 3-leg canary earned it every time**, and leg (c) — brief-ack in the seat's own words — earned it most. One seat independently corrected a factual error in its own brief during the ack (I'd named a dead coder). That is not a formality; it is the only step that tests comprehension rather than plumbing. Legs (a) and (b) are mechanical and could be automated wholesale.
- **Descriptive fences earned it.** Cheap to write, and they made "notify-only vs synchronize" decidable without a meeting.
- **Allocation-at-brief-time earned it**, with one bug — see below.

**What I shortcut or want as one command:**

- **Everything before the ack.** Nonce, registry check, worktree create, branch create, base SHA resolve, pane bookkeeping — that is a scripted sequence I typed by hand four times.
- **Base SHA resolution is actively buggy as prescribed.** I quoted an allocation SHA, then my own canary commit advanced `main` before the worktree was created, so the quoted base was wrong. The stream caught it and reported the true SHA. Rule I now use: *resolve at creation, report actual* — an allocating writer can move its own base. A scaffold verb must resolve the SHA at worktree-create time, not at brief-write time.

---

## 3. Roles in practice

**Ran**: o-prime; stream orchestrators (4); coders; reviewers; a research/PM-shaped vendor contact relationship (dove, mite, takin) that doctrine doesn't name.

**Invented, not in doctrine:**

- **Vendor/platform contact as a standing channel.** `pij-reasonable-dove` owns pij itself; I have a standing feedback contract with it, and separate triage/telemetry contacts. This turned out to be one of the highest-value relationships in the fleet and it exists purely by convention. Nothing in doctrine says "a prime should have a named upstream".
- **Held/tombstoned seat.** s1 landed and its seat stayed alive and idle for a day. Doctrine has no state for "done but keep it around because it holds context." Jordan typed rulings into its pane by mistake several times *because it was still there*, and it relayed them correctly — so the held seat had accidental value as a catcher.

**Doctrine roles I never needed**: none I can point to cleanly — but I never needed a *second* prime, and the "prime-to-prime" pattern only appeared as a one-shot addendum from a prior project's prime, which was valuable precisely because it was a document rather than a live seat.

---

## 4. Human preamble → work handoff

This is how three of my four streams started and it works, with one systematic failure.

**What works**: Jordan pre-ambles a seat in its own pane, at length, in his own words. The seat arrives with intent I could never have transmitted second-hand. My job becomes recording and fencing, not explaining.

**What breaks — mis-paned rulings.** Jordan types rulings into whichever pane he's looking at. Over two days he typed at least three consequential rulings into the *wrong* stream's pane (an AoA design ruling landed in s1, which was a landed/idle stream; a reviewer-model change landed in s2's pane as a fleet-shaped statement). Every one of them was relayed correctly by the receiving seat, so nothing was lost — but only because the seats were alive and attentive. The failure mode is: **a ruling's authority is derived from where it was typed, and the human does not track panes.**

**What gets lost — my own over-formalization.** Twice I promoted an in-the-moment human choice into fleet policy. Jordan chose a reviewer model for one dispatch; I recorded it as "reviewer seats = X" and propagated it to three streams as a ruling. He corrected me: *"we dont need to rule to the fleet on reviewers and coders, i miht choose differnt ones depdng on theh complxity of the tas."* I had to send a downgrade round. Same shape a second time with a model-change *cause*: I attributed it to platform drift; it was Jordan swapping a model after a runtime error. **Rule I'd want in doctrine: do not promote a human's situational choice into policy unless the human frames it as durable.**

---

## 5. Scaffold verb design

**MUST do (all mechanical, all currently hand-typed):**

- Create project/task/state nodes; create worktree; create branch; **resolve base SHA at worktree-create time and report the actual value**.
- Spawn the seat, pin the model, and **capture the rendered runtime at spawn** (see Q6 — the registry records the *request*, not what runs).
- Run canary legs (a) nonce and (b) registry identity automatically, and refuse to proceed if either fails.
- Emit the allocation record (ordinal, worktree, branch, base SHA, pane) as **data**, not as a prose canary file I hand-write.
- Register the fence as data with a machine-checkable surface list where one exists (e.g. "additive-only", "these paths are shared").

**MUST leave to judgment:**

- **Canary leg (c), the brief-ack in the seat's own words.** This is the only leg that tests understanding. Automating it would reduce it to an echo, which is exactly what it exists to detect. Keep it human/agent-judged.
- **The brief's content**, and specifically what the stream is *for*. My briefs contained product-pillar reasoning that a manifest cannot hold.
- **Fence boundaries where surfaces overlap.** Deciding that s4 owns the PFD outright while s2 keeps its landed HUD work was a negotiation, not a lookup.
- **Whether to spawn a stream at all.** Two of my "blockers" for standing up s4 dissolved once the right framing appeared (mock against an interface rather than branch from a moving base). A scaffold verb invoked earlier would have created the wrong team faithfully.

**Never trust to automation:**

- **Teardown/close decisions**, and anything that deletes. My repo runs standing holds against GC of telemetry/ledger/ref artifacts because an investigation was nearly destroyed by routine cleanup.
- **Marking work done.** `done` must remain a claim until verified — see Q6; the platform already gets this right and it caught a real gap on my fleet.
- **Reviewer/coder model selection.** Per the human, this varies by task complexity. Automate the *independence check* (compare declared runtimes at dispatch), never the *choice*.

---

## 6. Data-driven era — what of mine is still prose that should be data

Ranked by how much pain the prose form caused:

1. **Allocation + fence records.** Currently hand-written canary markdown per stream. Pure data: ordinal, worktree, branch, base SHA, pane, fence class, shared-surface list. Should be queryable — "who owns `project.godot`?" was asked repeatedly and answered by me from memory.
2. **Model provenance.** This was my fleet's single biggest cross-cutting thread. `boundModel` is the spawn *request*, never verified; `pij state` shows the spawn pin and **does not track in-place model switches** (confirmed live when Jordan swapped a reviewer's model mid-session and the registry kept showing the old one). We ended up with a hand-rolled three-way grading — *registry pin (possibly stale) / human-stated / rendered runtime (or unavailable-with-reason)* — written into packets as prose. That should be three fields on the seat, none authoritative alone. It's already routed to dove as the identity surface.
3. **Incident/finding lineage.** I have incidents (INC-001, INC-003, DL-001..006) living across prose files in three worktrees plus spine events. The spine holds the narrative well but there is no *finding* node with a lifecycle (open → routed → fixed → verified).
4. **Standing holds.** "Never GC telemetry", "never `ssh open` to the laptop", "path-scoped AND dollar-anchored `pkill` only" — these are safety constraints that live in my orient prose and are enforced only by my remembering to restate them. They should be data attached to the project that a spawning seat inherits.
5. **Doctrine items.** Least confident here — much of my doctrine is genuinely prose-shaped reasoning. But the *rules* embedded in them ("write control characters as explicit escape sequences", "run negative controls against the live file's behaviour") are checkable.

---

## 7. Resume & replacement — "a read from disk"

**True in practice, and it worked** — but only because I wrote a file specifically for it, unprompted, minutes before compaction.

I was compacted once mid-fleet. Recovery worked: I re-read `government/situation-<date>.md`, `orient-local.md`, the canaries, and probed the store. Zero streams were blocked and no work was lost. The most valuable single act was telling all three streams beforehand: *a compaction resets my context, not my seat; correct a confused o-prime by pointing at the artifact rather than working around it; the FILE wins on any post-compact contradiction.* That instruction got exercised within hours — s3 told me I was "one beat behind" on its retro state rather than silently absorbing my stale instruction.

**What was missing / would have been missing:**

- **The transient board.** Who is mid-flight, what's queued, which decisions are pending with the human. Durable doctrine survives in files; *live state* had no home, so I hand-built one. This is the gap a platform should close — a prime's resume packet should be generated, not authored.
- **Nothing in the store told me what I had *asked* and not yet received.** Open questions to the human, open asks to vendors, in-flight dispatches. I reconstructed those from memory-of-file rather than from data.
- **Model provenance across the boundary.** A seat that captures a reviewer's rendered runtime and then compacts loses the capture unless it persisted it. One of my streams handled this correctly by capturing footers *pre-compact*; that was foresight, not a platform guarantee.

---

## 8. Top 3 frictions, ranked

**1. Silent no-ops and true-but-narrow signals.** This is my fleet's dominant class, and it recurred roughly hourly in new costumes:

- `pij orchestration baton grant --to <peer-id>` (wrong; wants a request-id) **exited 0, printed the posture block, and did nothing.** A grant that silently no-ops is byte-identical to one that worked. Caught only by re-running `baton show`.
- Death notices re-emitted for seats that died 3h earlier, worded identically to a live death, with **no died-at timestamp** — stale reads as now.
- `shutdownType: "routine"` on a clean close, an unexplained mid-round death, **and** a 41-minute stall. Three distinct states, one value; the field does not vary across the states it exists to separate.
- The axis-disagreement anomaly cannot distinguish a stream that **finished** from one that **never started** — both present as an open assignment with no activity. True and unactionable in the same breath.

**2. Argument/discovery inconsistency across the CLI.** `--help` prints usage on `pij state verify` but returns `E-ARG: --help needs a value` on `pij orchestration baton grant`. `pij spine append` takes its body on **stdin**, which appears nowhere in its usage line (`--body` → unknown flag). I lost calls to `--type`/`--title`/`--ref` before finding `--kind`/`--refs`/`--project`. The orchestration subtree appears to run a separate arg resolver.

**3. Nothing watches the gap between "my work is done" and "I released what my work held."** My own streams produced three flags from this in one night — a baton held after the window emptied, a reviewer seat left open that then stalled 41 minutes, an assignment left parked — every one caught by *something else flagging* rather than by the stream closing out. Partly self-inflicted (my ship checklists lacked the step), but the platform has no close-out contract either.

**Highest-leverage wish:**

> **Make "it worked" and "it silently did nothing" impossible to confuse — everywhere.**

Every friction above is the same defect wearing different clothes: a signal that is *true* but answers a narrower question than the reader assumes. A no-op grant, a timestamp-less death notice, a `routine` label spanning three states, a green test that never ran, an anomaly that can't tell finished from never-started. My fleet independently derived the general rule from a build-freshness bug and it's the sentence I'd want in the platform's own design docs:

> **Judge the artifact that can distinguish the states you care about.**

Concretely, for scaffolding: every scaffold verb should be **fail-loud and self-evidencing** — a visible success line naming what it did, a named error naming what it refused, and no path where doing nothing looks like doing the thing. A scaffold that half-creates a team silently would be the most expensive version of this bug we've seen yet.

---

## Tier-down — orchestrator answers

Questions 2, 4, 5, 8 (adapted) went to all three current orchestrators. All were reachable, so these are lived answers, not summaries from persisted reports.

**Status**: s3 and s4 answered. **s2 (`pij-light-squid`) has not yet answered** — it is mid-flight on a live experiment arc. Not substituted or summarized; if it answers I will re-send the pointer with its section added.

### pij-pregnant-stoat (s3-voxel-world) — shipped, plan 003 merged

**Team formation.** Actual: `pij spawn --harness X --model Y --effort xhigh --task '<long inline brief>'`, **then a follow-up message re-stating the task**. The follow-up is not ceremony — one coder bound via phonehome and s3 re-sent the task "in case the spawn brief didn't survive binding." *It never once trusted the inline brief alone.*

Earned their cost: (a) packets persisted to disk with **pointer delivery** — a coder died mid-round and lost nothing, because both its work and the packet were on disk rather than in a message; (b) a **model self-report-as-first-action** requirement s3 added itself, which is the only reason a later model mismatch surfaced at all; (c) an explicit forbidden-paths block in every packet.

**Shortcut, and s3 flagged this itself unprompted**: it did *not* run formal 3-leg canaries. It read first output and judged. Its words: *"judgment wearing a protocol's name — do not count it as a canary in your report."* Recorded as asked.

**Preamble → handoff.** Jordan preambled s3 directly; the output was `preamble-rulings.md`, verbatim capture, headed "Jordan's words are authority." That document carried the entire stream and settled arguments no summary could. s3's finding: *every time I paraphrased his intent I eventually got it wrong; every time I quoted him I did not.*

Three breakages:
- **Truncation.** Relays arrived cut mid-word twice in one day (one of mine ended at `owner-i`). s3 holds for the tail rather than inferring — costs a round trip, has saved it twice.
- **No marker distinguishing a situational choice from a standing constraint.** s3 attributes my three withdrawn rulings to exactly this gap: model picks read as policy. **Its fix: a required scope field on briefs — `this-task` / `this-stream` / `standing`.** I endorse this; it would have prevented both of my Q4 failures.
- **Double-routing** — twice the human and I both briefed the same decision; once he gave s3 an instruction meant for another agent.

**Scaffold verb.** Must do: worktree+branch; **per-stream deploy slot naming and dollar-anchored kill patterns** (shared-path collision was a real incident here, not hypothetical); brief delivery from file **with receipt**; capture rendered runtime at spawn *recorded separately from the spawn pin*; identical forbidden-paths block; **close-time pre/post per-file inventories pre-wired**, because a close without them cannot decompose its own delta (one seat's couldn't; every close after it could).

Leave to judgment: model choice; **what the packet asks** — *"a generated packet would have asked the questions the last packet asked, and today's real finding came from a question nobody had asked before."*

Never automate: **the verdict.** A CLI once scaffolded `verdict: APPROVE` with empty findings *before any reviewer had seen the code*, and it would have stood as a real approval had s3 not caught it within minutes. Also never: declaring an assignment complete on a heuristic; attributing **cause** (a control observes disagreement — attribution needs the human; we burned a vendor's time on that).

**Top 3 frictions**: (1) gates that answer a narrower question than their phrasing implies — Jordan flew a day-old world for hours while every deploy gate read green, because they verified the artifact *shipped*, not the one *running*; same class as the fabricated APPROVE, `shutdownType`, and `pij state`'s pin. (2) Brief/packet delivery fragility — inline briefs not surviving bind, truncated relays, no receipts anywhere. (3) No close-out checklist.

**Highest-leverage wish**: *a dispatch primitive that takes a brief FILE and returns a receipt proving the seat received and parsed it — echoing back the packet id plus its own declared runtime.* Kills friction 2, provides provenance capture for free, and turns "I sent it" from a memory into an artifact. **s3's framing: everything else on its list is a checklist; this one is a missing primitive.**

### pij-permanent-gull (s4-pfd) — built, held for human eyeball

**Team formation.** Long-lived coder + reviewer seats, canary-verified with **runtime self-declaration back to the orchestrator**, cross-family gate verified *by the orchestrator itself* at both dispatch and verdict, hand-written packets with fences + output contract + forbidden paths, hand-appended roster ledger.

Earned its cost: the canary runtime declaration — *"the cross-family gate is only real if the seat tells you what model it actually is; never assume from spawn args"* — and packets on disk with pinned fence SHAs (the reviewer caught real defects because the contract was exact).

**Would collapse to one command**: spawn + canary-wait + model-verify + watchdog-register + roster-skeleton. Five manual steps per seat, twice per phase-fleet, pure mechanics — **and forgetting the watchdog line is silent.**

**Preamble → handoff.** Lived failure: **Jordan pasted a bare seat name into gull's pane with no verb, twice.** It guessed "status?" and guessed right — *"but that's inference where there should be substrate."* Separately: whatever Jordan preambles *into* a seat never reaches the orchestrator — it learns it secondhand, with context it cannot verify. And human messages **interleave mid-turn with peer traffic**; distinguishing principal from peer is maintained by convention, not mechanism. **Fix gull proposes: the preamble (or a pointer to it) lands in the orchestrator's inbox at seat-contact time.**

**Scaffold verb.** Must do: worktree+branch; spawn with model pin; **block until canary declares runtime and fail loud on cross-family violation — verify, never trust the manifest**; watchdog registration; roster skeleton; forbidden-paths boilerplate in every brief. Leave to judgment: packet content — review dimensions, fence pathspecs and pinned base SHA come from the plan and change per phase; *a template slot yes, generated prose no.* Never automate: verdict adjudication; deciding a seat is closable; **anything touching the human's live app window** — a reviewer honouring "do not kill Jordan's window" was a judgment call automation would have got wrong.

**Top 3 frictions**: (1) **live-window custody** — the invariant "Jordan always has a live current-build window" is maintained entirely by hand and broke silently once (a coder's shell exited clean, the window died, `ps` was the only detector); it also distorts methodology, with a reviewer skipping a cold-cache wipe to protect it and a mutation-testing reviewer racing the orchestrator over a `.tscn` in the same worktree. (2) **Screenshot ritual** — launch/find-window/capture/quit hand-rolled five times in one phase. (3) **Mid-turn interleave** — a reviewer verdict arrived while executing a direct human request; compact-first discipline, the human's request, and receipts all contend in one turn, sequenced by vigilance rather than mechanism.

**Highest-leverage wish**: *a first-class app-session primitive — launch/hold/replace the human's live build window, with a liveness signal and exclusive-use handoff.* It would kill friction 1 outright and most of the reviewer's methodology contortions with it.

### Cross-stream convergence (o-prime observation)

Three independent seats, three different wishes, **one shared shape**: every one asks for a *receipt* — something that proves a thing actually happened rather than that it was requested.

- s3 wants a dispatch receipt (proof the brief arrived and parsed).
- s4 wants a liveness signal on the human's app window (proof the window is alive).
- I want scaffold verbs that cannot silently no-op (proof the action occurred).

That is the same defect class my whole fleet spent two days on, arriving independently from three seats that did not compare notes. If the scaffolding work takes one principle from this fleet, I'd take that one: **every primitive should emit evidence of what it actually did, and no primitive should have a path where doing nothing is indistinguishable from doing the thing.**

Two further points I'd weight heavily because they are cheap and prevent classes of error:

- **s3's scope field on briefs** (`this-task` / `this-stream` / `standing`). Both of my human-handoff failures were a situational choice read as policy. A required field kills the class.
- **s4's "block until canary declares runtime, fail loud on cross-family violation."** Verify, never trust the manifest — the registry records a request, not a fact.
