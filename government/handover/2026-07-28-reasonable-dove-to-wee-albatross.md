# Seat handover — pij-reasonable-dove → pij-wee-albatross (incoming o-prime)
**Written**: 2026-07-28T21:32:29Z · **Trigger**: Jordan ruled the rotation; relayed by
`pij-wee-albatross` in its SEAT ROTATION send. Ordering was albatross's (marker retired ahead
of my final send) and is recorded here as accepted — nothing outstanding was cancelled by it.

## 0. Read this first — the shape of what you inherit

**You inherit no live fleet.** Every seat I spawned or drove in this repo is dead. There is no
work in flight, no coder mid-task, no reviewer holding a verdict. What you inherit is a **filing
backlog and three unmade human decisions**. My standing instruction from Jordan for the whole
tail of this session was verbatim: **"Keep filing, fix nothing."** I did not implement anything
after that ruling; neither should you until Jordan says otherwise.

## 1. Where governance actually lives — store-native, confirmed

Your read was right and is not a staleness bug.

| surface | state |
|---|---|
| `government/spine.md` | **FROZEN historical record.** Last event 2026-07-13T12:02Z, `Seq: 195`. Do not append. |
| `government/baton-book.md` | prose, `**Writer**: pij-primary-carp` — stale, superseded by the store |
| `government/orient-local.md` | prose, `**Writer**: pij-primary-carp` — still useful as a *project* read; writer line is vestigial |
| **the pij platform store** | **LIVE.** `pij spine events` is at **seq 22952** as of this write |

The ruling is in [`skills/pij/references/prime/rituals/store-native.md`](../../skills/pij/references/prime/rituals/store-native.md)
— Jordan, 2026-07-18: *no engineered migrations; fresh primes govern in the store natively from
day zero.* You are a fresh prime, so **you are a day-zero store-native prime** — you do not owe
a prose migration and you should not attempt one.

**Verbs to read instead of the prose spine:**

```bash
pij spine events [--since <seq>] [--project <slug>] [--peer <id>]
pij spine render                       # deterministic md from the store
pij project list | pij project show <slug>
pij tree --json | pij node show <id> --json | pij anomalies --json
```

**Writing:** `pij spine append --kind <kind> --project <slug> --refs <...> [--actor <label>]`.
Append is **immediate and irreversible — no dry-run.** A bare kind-only append now REFUSES
(two stray junk events earned that guard). A mistake is corrected by appending an event that
`--refs` the bad one, never by deletion.

**The rotation checklist in the template partly does not apply to you.** There is no spine
`Writer:` line to transfer (the prose spine is frozen), and the baton-book/orient-local writer
lines name a prime three rotations dead. Record the rotation as a **store event**, not a prose
edit. `grep -rn "Writer" government/*.md` returns exactly the three lines above — all vestigial.

## 2. Live state inherited

### Streams + fleets — none live in this repo

All eleven seats in `pij list --here` are `dead` except: you, me, and `pij-telegram`
(pi, alive, pid 21568 — **the operator DM channel; do not close it**. `pij send pij-telegram`
DMs Jordan; his swipe-replies route back as injected turns).

`pij-exclusive-whitefish` — **dead** (pid 42658 gone, last event 54h ago). It is still recorded
as the prime of project `p073-pij-first-class-ui`. That pointer is now dangling; see §5.

### Correspondents still alive — in OTHER repos, not mine to hand you

These four are live seats I *corresponded* with, not seats I own. They report into their own
primes. Listed because their reports are load-bearing on my filings and you may need to reach
them:

| seat | cwd | last event | what it carries |
|---|---|---|---|
| `pij-superior-mastodon` | `games/voxel-flying-game` | 4h ago | the largest body of watchdog/baton frictions (#42, #43, pause census, the `pausedBy` nesting correction) |
| `pij-resident-leech` | `games/voxel-flying-game` | 10h ago | authored the re-worded watchdog ping copy — **now cleared to ship, see §4** |
| `pij-cheap-cheetah` | `substrate/chainglass` | 21h ago | repo-family scoping + the adopt/orphan census (185/215) |
| `pij-chief-roadrunner` | `substrate/chainglass` | 38h ago | adopt mechanism read, self-parent cycle, the `--repin` evidence gap; prime of six chainglass projects |

**What none of them knows:** that this seat rotated. I have not announced it. Announcing is
yours (template step 4) — and say your id explicitly, because none of them can discover it.

### Batons — none held, no standing grant

`pij orchestration baton list --json`: three batons hold leases, **none in this repo** —
`landing-main` (harness-engineering, `pij-massive-meadowlark`), `osk-dev-sqlite` and
`osk-dev-store` (osk-split-billing, `pij-90wkbu`). The three batons I ever touched
(`daemon-restart`, `git-index`, `push-main`) are all **free**; my name appears only in their
release history.

**Standing rules that outlive me** (carry these, they are Jordan's, not mine):

1. **Forward-only on main — never `git revert`.** Remove with code; move forward.
2. **Never destroy uncommitted WIP.** Back up before any reset/stash.
3. **Never reintroduce the #22 seven-day npm release-age reversal.** `min-release-age=7` in
   the repo `.npmrc` is deliberate supply-chain policy. Do not remove, lower, or bypass it; do
   not weaken `audit=true`, do not add `--force`/`--ignore-scripts`, never commit credentials
   or proxy tokens, and **never hardcode Jordan's Microsoft proxy URL** — read the registry
   from `npm config`.
4. **Daemon/delivery changes**: edit → restart daemon → verify a live peer round-trip → *then*
   commit/push. The daemon runs tsx off source with **no hot-reload**.
5. **Never restart the machine-wide daemon from a worktree.** Canonical main only.
6. **Never `tmux send-keys` into a pane a human is using.**
7. **Ownership-aware teardown**: close only what you spawned; `--force` only on explicit ask.
8. **Store-internals surgery** (hand-editing `~/.pij/**` JSON) is **operator-authorised only** —
   never routine. I did it once, with Jordan watching.

### Sequencing watches

| watch | window | note |
|---|---|---|
| **Task ordering 11 → 10 → 2 vs the watchdog trio** | **OPEN — Jordan's call, see §6** | The trio is: re-worded ping copy → `STALE_AFTER_MS` threading (#15) → semantic axis (#28/#42). Not started. |
| `s051` push (#44) | **CLOSING** — 17k lines, 70 files, **one disk, no remote copy** | Every hour this sits is exposure. See §6. |
| Retire my marker | after my final send | `pij orchestration prime retire pij-reasonable-dove --json`, then verify absent from `pij list --prime --here --json` and present as `oldPrime: true` in `pij tree pij-reasonable-dove --all --json` |
| `p073` project prime points at a dead seat | no hard deadline | see §5 |

## 3. Ruled-and-settled — DO NOT RE-LITIGATE

These were argued, evidenced, and closed. Re-opening them costs a day each.

- **Merged is ADOPTED, not VERIFIED.** No item is reported shipped off a merge. Everything that
  fooled this fleet on 2026-07-26 was green at exactly the merge stage. Commit `04e6e22` says so
  in its subject line on purpose: *"item 1 APPROVED for merge — and explicitly NOT verified."*
- **`planId`**: owner `cli`, **not** append-only. The discriminating control is a **second**
  write by a non-owner over an existing value — set-then-read proves nothing. Independent of
  `Project.planPath`, opaque, never derived; disagreement between them is not an error.
  Resolution outcome is **emitted in the spawn receipt, never stored** on the descriptor.
  `--plan-id` is dropped from `dispatch`. Two writers only: `spawn` creates, `attest` corrects.
- **The hard-fail boundary on identifiers** (kept verbatim because it stopped being
  re-litigated once written this way): the never-hard-fail ruling governs an identifier we
  cannot **resolve** — a real id in a repo without the convention. *"An empty string is not an
  unresolvable identifier, it is the ABSENCE of one. Rejecting it is not a resolution policy, it
  is argument validation."* `E-ARG` at parse time, after trimming.
- **Three outcomes, never two**, for any probe: `resolved` (silent) · `did-not-resolve` (warn) ·
  **`not probeable` (say so explicitly)**. Absent must be distinguishable from null. Collapsing
  the third into silence makes *unprobed* read as *validated*.
- **`--designation` is a separate axis from `role`.** Role was deliberately NOT widened for the
  chainglass observatory. It lands with item 2 as a pure addition; Jordan sequences it.
- **Revivability ruling** — `docs/plans/073-pij-first-class-ui/dove-ruling-revivability.md`.
  **Read the amendment banner at the top before citing it**: I wrote it on a premise that was
  later retracted, and amended it in place rather than deleting. The retracted premise was that
  four seats were unrecoverable; they were not (see §4, `CLAUDE_CONFIG_DIR`).

## 4. SESSION-BOUND dependencies and their relay contracts

Three things existed only inside my session. **Writing them here discharges the relay contract
for all three** — there is nothing further I owe after this pack lands.

### 4a. The watchdog interval lever is PROVEN END-TO-END — leech's copy is cleared to ship

This is the one measurement that could not survive my seat, and it is the reason the trio's
first item is unblocked.

I set `intervalMs: 7200000` (2h) on my own watchdog mid-session and then measured the gap
between consecutive fires on the running seat:

```
fire #14: 2026-07-28T14:11:06.986Z
fire #15: 2026-07-28T17:26:47.851Z
GAP:      195.7 minutes        (configured interval = 120.0 min)
```

**AMENDED 2026-07-28T23:40Z, after fire #17 — one gap is not a cadence, three is.** Extending
the same measurement:

```
#14 → #15 = 195.7 min   (1 interval)
#15 → #17 = 370.5 min   (2 intervals) = 185.2 min each
mean over 3 intervals   = 188.7 min = 1.57× the configured 120
```

The lever works — ~20 min to ~3 h — but it **does not land on the configured value**; it
overshoots by ~57%, and the overshoot is systematic across every interval measured, not noise
in one. Leech's copy is still cleared to ship. What changes is that **nobody should set 120
expecting 120**: if the copy quotes a number, quote the observed behaviour, not the setting.

Before the change the cadence was ~20 min. `mastodon` had verified the mechanism **in source**
(`ac61e2e`); nobody had verified it **through a live change on a running seat**. That was the
last unverified assumption sitting under the item ranked first. **It now holds.** Sixteen fires
arrived at this seat; I declined every one.

**The methodological note is worth more than the number**: the measurement required a seat
willing to stay armed and be annoyed sixteen times. **Every seat that took the ping's own advice
(`pij watchdog pause`) removed itself from the population that could produce this evidence.** A
control whose advice destroys the evidence for evaluating it will always look fine.

**Caveat you must carry**: my seat's watchdog is still configured at 7200000 and that config
dies with the descriptor. It is a mutation with no attributed reason in the record — which is
exactly defect-class #45. Consider it noted rather than hidden.

### 4b. Four "lost" seats were never lost — `CLAUDE_CONFIG_DIR`

There are **two claude homes on this machine**: `~/.claude` and `~/.claude-alt`, via
`cc-alt()` at `~/.zshrc:188`. `pij` hardcodes `homedir()` in **all three** harness path builders
(task #37), so a seat started under the alt home reads as *transcript gone* to every pij revive
path. I searched only `~/.claude`, agreed with a peer that four seats were unrecoverable, and
called the agreement verification. Jordan's pushback forced the second search. **All four were
recoverable.**

Two rules fell out, both now in my memory and both worth your holding:
- **Search both homes before believing any "transcript gone" claim, including your own.**
- **Setting `CLAUDE_CONFIG_DIR=$HOME/.claude` is NOT a no-op.** Unset reads `$HOME/.claude.json`
  (a 210KB profile); set reads `<dir>/.claude.json`, which did not exist — so a profile-less
  session boots and a 431-byte stub gets created. `scripts/prime-up.sh` was fixed twice for
  this: it now emits the override **only** for a non-default root, and prefers the non-default
  root when a transcript is reachable under both (a hardlink is undetectable by path).

### 4c. `s051` is 70 files of PRIME-APPROVED security work sitting on one disk

Filed as **#44**, and it is the single highest-consequence thing I found. Approved a week ago by
a prime, never converged, **no remote copy**, 13 conflicts, and gate G9-04 was never run. If
this disk dies the work is gone. See §6 — the decision is Jordan's, the *urgency* is not.

## 5. Uncommitted / unpushed tree — and why

`git status` on main is clean except **one** untracked file:

```
?? skills/flow-pair/prompt-lab/clusters/fix-code/candidates/learn-0001.md
```

That is prompt-lab candidate output, not mine to commit — leave it.

**The real exposure is not in this checkout.** Run `bash scripts/worktree-push-audit.sh` (I
wrote it this session, committed as `8a63c58`, precisely because reporting push state from the
checkout you happen to be standing in reads a *place* when the honest question is a *state at a
place*). Current output:

```
LOCAL ONLY         reconcile/pr14-windows       6 commits, NO REMOTE BRANCH AT ALL
UNPUSHED           s051/pij-identity-integrity  7 ahead of origin/main
UNPUSHED           s052/update-pi-reliability   1 ahead of origin/main
LOCAL ONLY         s073/pij-first-class-ui      6 commits, NO REMOTE BRANCH AT ALL
```

- **`s051/pij-identity-integrity`** — the #44 body. See §4c and §6.
- **`s073/pij-first-class-ui`** — six commits by `pij-exclusive-whitefish`, which is **dead**.
  Item 1 (plan linkage, `--plan-id` → `planId` + `HARNESS_PLAN_ID`/`PIJ_PLAN_ID`) is already
  merged to main as `9326641`; these six have **not** been reconciled against the skill edits I
  made on main afterwards. My recommendation was to revive whitefish in a fresh pane to do the
  reconcile — see §6. The `p073-pij-first-class-ui` project still names whitefish as prime;
  either revive it or re-point the project.
- **`s052/update-pi-reliability`** and **`reconcile/pr14-windows`** — both verified **superseded**.
  My recommendation is **push, do not delete**: pushing costs a branch ref, deleting destroys the
  only copy of work someone may cite later. That is a recommendation, not a ruling.

**`NO UPSTREAM` is never `clean`.** Six s073 commits stayed invisible for an entire session
because a naive ahead-count against a nonexistent upstream returns zero. The audit script treats
it as a distinct case for that reason.

## 6. Pending human decisions — all three are Jordan's, none are yours to take

I asked; he has not ruled. I parked on these and stood down rather than proceeding on assumption.

1. **#44 — push `s051` before deciding anything else about it.** 17k lines, one disk, 13
   conflicts, G9-04 never run. My position: *push first, decide second* — the push is
   reversible, the disk is not. Jordan has not said yes.
2. **s073 — revive `pij-exclusive-whitefish` in a fresh pane** to reconcile its six commits
   against the skill edits now on main. Alternative is to re-point the project and reconcile
   under a new seat.
3. **Sequencing — `11 → 10 → 2` vs the watchdog trio.** The trio's first item (leech's re-worded
   ping copy) is now unblocked by §4a and could go immediately if he wants it first.

Two further standing constraints on how you ask him: **never use a modal question UI** (global
invariant 9 — ask inline through the active delivery channel and persist the pending decision),
and **questions stay with their context owner** (invariant 10 — you ask him directly; do not
proxy through me or anyone else).

## 7. Open filing backlog — 30 tasks, the shape that matters

Tasks #5, #6, #10, #12, #15–#23, #25–#45 are open in the session task list. Rather than
re-transcribe them, the **classes** worth your holding, because they recur and each one cost a
day to see:

- **#45 — controls that produce a clean record with nothing in it.** Three whose OFF-state reads
  as PASS, one never consulted at all. The umbrella defect of this whole session. **A candidate
  fourth member was filed on standdown as #46 and RETRACTED the same hour — read #46's
  retraction banner, not its title.** TRUE: `pij node show --json` does not project the
  `watchdog` object at all, for a seat `pij list --json` shows armed at a non-default interval
  having fired 17 times. FALSE, and mine: that it emits `null`, making off-state and
  unprojected-state byte-identical. The key is **absent**, which is the correct, distinguishable
  behaviour. I measured with `d.get('watchdog')` — which returns `None` for absent and for null
  alike, **an instrument that collapses the exact two states the finding was about.** Downgrade
  to the known #41 shape (a load-bearing field no read verb projects). Not a #45 member on this
  evidence. Albatross's `'watchdog' in row` was the sound instrument; my "precision delta"
  against its seat was a phantom my own read created.
- **#42 + #28 composed** — `semanticState` has a live writer and no governing reader. Separately
  each reads as a small wiring gap; composed, **the axis is decorative**. Two honest
  single-ended reports compose into a different claim than their sum.
- **#34 / #35 / #40** — the post-reboot delivery storm family. Root cause was obituaries
  addressed to corpses plus permanent-classified-as-transient; fixed this session (`"gone"`
  outcome threaded through `ports.ts`, `daemon-tmux.ts:309`, `loop.ts:587`,
  `death-reconciler.ts`). #35 (adopt reports a success it never persisted — bare `return` on the
  tombstone guard at `fs-registry.ts:205`) and #40 (`revive.ts:682` is a second, unvalidated
  writer of `parentId`/`spawnedBy` that stamps a self-cycle) are **still open**.
- **#16 + #15** — `watchdog pause` silences only one of **two independent** stall detectors, and
  `STALE_AFTER_MS` is 60s, which sits *below* observed-normal seat quiet. Consequence measured:
  **47 of 51 live seats (92%) were paused**, so supervision was OFF fleet-wide while *appearing*
  to exist. Keep your own watchdog **armed**, and never assume a peer is watched.
- **#36–#39** — revivability is not first class. pij discovers claude's identity from an artifact
  it does not own, and every revive path is blind to `CLAUDE_CONFIG_DIR` (§4b).

**One correction I owe the record**, because you will read my filings and should know where I
was wrong: I once claimed `pausedBy` was unprojected. **It is not** — it is nested inside the
`watchdog` object (215 rows), and **I had used it successfully three hours earlier in my own
code**. I accepted a peer's report over my own transcript. A bad measurement is catchable by
re-measuring; **a good measurement overridden by deference is not**, because nothing in the
later reasoning looks wrong. Before treating agreement as corroboration, ask: *did we both
measure this, or did one of us take it?*

## 8. Outgoing-descriptor lifecycle

Per template: retire me **after this pack lands and my final send is made**. All three relay
contracts are discharged by §4 above; I am not holding anything back. My descriptor must remain
queryable as old-prime history — if a pane teardown is separately ruled, it must preserve that
registry evidence.

```bash
pij orchestration prime retire pij-reasonable-dove --json
pij list --prime --here --json      # verify ABSENT
pij tree pij-reasonable-dove --all --json   # verify oldPrime: true
```

This pack plus my stand-down note constitute the owner's explicit ask.

---

**spine-seq at write**: store spine **22952** (`pij spine events | tail -1`,
2026-07-28T21:31:52Z). Prose `government/spine.md` remains frozen at `Seq: 195`, 2026-07-13 —
**that is correct, not stale**; do not "fix" it.
