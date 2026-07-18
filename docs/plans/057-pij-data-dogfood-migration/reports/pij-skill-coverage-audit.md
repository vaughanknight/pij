# pij skill coverage audit — cold-agent learnability

**VERDICT: adequate-with-gaps** — a cold agent routed to peer/agent/ops/node learns the verbs well
(exact syntax + WHEN), but `focus` is unplaceable, `watchdog` has no route home despite every session
being auto-watched, and the prime landing only reaches the platform verbs via today's store-native.md
(linked from bootstrap.md, still absent from prime.md's ritual index).

Paths below are repo-relative; skill = `skills/pij/`, routes = `skills/pij/references/routes/`.

## Coverage — live verb family → best doc home → quality

| Verb family | Best home | Quality |
|---|---|---|
| spawn | peer.md:57-68 + 00-routing C2/C5 (canary, --layout) | teaches-when-and-how (drift: --effort enum; gaps: --no-watchdog, --agent alias) |
| **focus save/list/launch** | — | **ABSENT** (shipped #23; no SKILL.md row, no route, no mention anywhere) |
| send | peer.md:72-87 + SKILL invariant 2 (pointer delivery) | teaches-when-and-how |
| tail | peer.md:77 + 00-routing C2 | teaches-when (signature incomplete: --type/--lines missing) |
| close | peer.md:89-96 (ownership, compact-and-reuse) | teaches-when-and-how |
| adopt | ready.md + peer.md:8,26,104 (exact-$TMUX_PANE guardrails) | teaches-when-and-how (gap: `pending`/phonehome outcome unhandled in ready.md) |
| whoami | peer.md:19,25 | bare-mention (--env omitted; node.md needs it for PIJ_SESSION_ID) |
| list | peer.md:32 / ops.md:24 | bare-mention (--prime omitted) |
| **sessions** | — | **ABSENT** (telemetry join table; not in coverage table or any route) |
| models | 00-routing C4 (never-grep rule) | teaches-when-and-how |
| state `<id>` | peer.md:33 / ops.md:25 (corpse detection) | teaches-when-and-how |
| state set / verify | node.md:25-29 + store-native.md:15-16 (done-is-a-claim) | teaches-when-and-how |
| task set | node.md:24 + store-native.md:15 | teaches-when-and-how (**both omit --project → exhibit F6**, see fixes) |
| inbox | ready.md + peer.md:17-20,111-117 (pull-not-poll) | teaches-when-and-how |
| tree | peer.md:35-41 + node.md:44-47 (filters, scoping) | teaches-when-and-how |
| link | peer.md:46-55 + node.md:48-52 | teaches-when-and-how |
| node show | node.md:34 | bare-mention (adequate) |
| anomalies | node.md:54-66 (symptom→move table) + store-native.md:17 | teaches-when (new --here/--project scoping absent) |
| project CRUD | node.md:12-19 + store-native.md:14 (prose→store mapping) | teaches-when-and-how |
| spine append/events/render | node.md:33-40 + store-native.md:13,18,25-35 (refs convention, no-delete, attribution) | teaches-when-and-how (established --kind vocabulary still unlisted anywhere) |
| daemon | ops.md:9-17 + 00-routing C6 (no-hot-reload restart) | teaches-when-and-how |
| phonehome | ops.md:37-41 | teaches-when-and-how |
| path | ops.md:26 | bare-mention (adequate) |
| telegram | ops.md:43-49 | bare-mention (adequate) |
| compact-self | 00-routing C3 + SKILL.md:43,59 | teaches-when-and-how |
| watch / unwatch | docs/how/pij-peer-watch.md (mechanics verified accurate) | teaches-how (no route module = no orchestrator WHEN; no way shown to inspect subscriptions) |
| **watchdog** | SKILL.md:45 pointer → docs/how/pij-watchdog.md | bare-mention at router; **ABSENT from ops.md**, which owns supervision and can't explain watchdog pings |
| orchestration baton | prime/rituals/batons.md + SKILL invariant 11 | teaches-when-and-how |
| orchestration prime set/retire/unset | SKILL.md:49-50 (/pij prime vs CLI disambiguation) | bare-mention (placed; retire missing from top USAGE line — CLI quirk, not doc) |
| agent list/run/spawn/show/new/check/eject/report | agent.md (full lifecycle, spawnedBy report mechanics) | teaches-when-and-how (SKILL.md:41 row omits `report`; --prompt -, E-NOTMUX undocumented) |
| skill-in-peer (`agent spawn --once`) | skill.md (3-part prompt recipe, per-harness skill dirs) | teaches-when-and-how |
| flow-pair fleet | pair.md (FSM, compact-early, verdict law) | teaches-when-and-how (see drift 4-6) |
| help / version | CLI self-serve | n/a |

**store-native.md (added 2026-07-18, worktree) — credit:** closes most of the prime-landing platform
gap: prose→store verb mapping (project/task/state/spine/anomalies), refs convention
(`commit:<sha>`, `pr:<n>`, `path:`, prior seqs), mandatory honest attribution, append-is-irreversible +
correct-by-referencing-event, day-zero scaffold, lazy migrate-as-you-touch. Linked from bootstrap.md
header and seat-handover.md. Still open: no row in prime.md's ritual index (the dispatch surface), no
established event-kind vocabulary, and its task set row omits --project (drift 9).

## DRIFT — docs contradicting live CLI (bugs)

1. `routes/peer.md:60` — `--effort low|medium|high|xhigh` closed enum; live accepts
   `off|minimal|low|medium|high|xhigh|max` (per-model via `pij models`, warn-don't-block).
2. `SKILL.md:45` — watchdog subverbs `(status/pause/resume/exempt/watch/unwatch/list)` stale; live adds
   `reset|interval|disable-all|enable-all`.
3. `SKILL.md:41` — agent subverb enumeration omits live `report`.
4. `routes/pair.md:148-157` + `skills/flow-pair/references/review-rubrics.md` — verdict law still
   default-APPROVEs on zero findings; stated current behavior is refuse-on-zero-findings. NOTE:
   `skills/flow-pair/lib/review.ts:133-141` in the main checkout also still APPROVEs — doc+lib
   reconciliation needed, may live in another worktree.
5. `routes/pair.md` invocation block — `review --delegation <id>` / `fix --review <id>` vs live
   `review: --run-id --delegation-id --phase-dir` and `fix: --run-id --delegation-id --review-id`;
   shelled as printed → arg error. Also omits `--cluster` on dispatch (hard invariant 6).
6. `routes/pair.md` — default reviewer `github-copilot/gpt-5.5:xhigh`; effort suffix is a no-op
   (non-reasoning model, no thinkingLevelMap).
7. `routes/node.md:54-66` — anomalies taught bare-form only; live now takes `--here` / `--project <slug>`.
8. `routes/prime.md` + `SKILL.md:31` — "government files have one writer" vs node.md:6 "anyone may
   write, safety is DERIVED"; and "spine" names two objects (government/spine.md vs ~/.pij/spine)
   with no disambiguation in the prime landing. store-native.md is the bridge but prime.md never
   points to it.
9. `prime/rituals/store-native.md:15` — task set shown without `--project`, replaying exhibit F6.

## TOP-5 fixes (agent-confusion-prevented per line added)

1. **task set --project + payoff line** — edit `skills/pij/references/prime/rituals/store-native.md:15`
   (and `routes/node.md:24`): show `pij task set <id> "<task>" --project <slug>` and state the payoff —
   the assignment carries projectSlug and every later state-set/state-verified event inherits it;
   omitting it silently orphans claim/verify events. Directly kills live exhibit F6. ~2 lines.
2. **Index store-native.md from the prime landing** — add one ritual-index row to
   `routes/prime.md` (~line 33-37): "Record governance in the platform store → rituals/store-native.md".
   Without it a cold prime dispatched via SKILL.md never loads the platform surface. 1 line.
3. **Give watchdog a home** — short section in `routes/ops.md` (status/pause/resume/exempt + "every
   session is auto-watched; a ping means the watchdog, not a peer" row in the diagnosis table) and fix
   the stale enumeration at `SKILL.md:45`. Largest absent family; unexplained pings are guaranteed. ~8 lines.
4. **Place focus + sessions** — coverage rows in `SKILL.md:36-50` for `focus save|list|launch` and
   `sessions`, plus a 3-line focus block in `routes/peer.md` beside spawn (save immutable checkpoint,
   launch forks into pending-canary — canary-verify applies). Currently unplaceable verbs. ~5 lines.
5. **Fix pair.md's shelled-command contract** — correct review/fix required args, add `--cluster` to
   dispatch, and align the verdict-law passage with refuse-on-zero-findings (with review-rubrics.md).
   Prevents hard arg errors and the rubber-stamp APPROVE path. ~6 lines.

(Honorable mention, 1-line each: peer.md:60 effort enum → defer to `pij models`; node.md anomalies
scoping flags; spawn `--no-watchdog`; a "flags not positionals — `--harness` is required" caution on
the peer.md spawn block, matching the observed spawn syntax errors.)
