# Research Dossier: pij substrate for deterministic team-scaffold verbs

**Generated**: 2026-07-20T10:10:00Z
**Query**: "What does pij provide today for deterministic team scaffolding (stream create, dispatch receipts, canary, fences/allocations-as-data, autonomy field) — what is greenfield, and what constraints govern extending the platform?"
**Effort**: Deep (3 workers: spawn/send/canary trace · store surface trace · institutional memory)
**Tools**: Standard
**Evidence**: 12 current sources · 5 historical sources

## The Ask

Jordan ruled a mission (061 `original-ask.md`): make agent-team formation convention-based and deterministic — human backlog item → prime intake → transactional team scaffold → `/builder` plan → pair-fleet build → PR, with humans touched only at real gates. The lived-experience survey (`inputs/team-scaffold-survey-synthesis-2026-07-20.md`) established *what* to build (stream-create, receipts, canary verb, fences-as-data, autonomy field). This dossier answers *on what*: which pij code surfaces exist to build on, which are greenfield, and which platform contracts constrain the work.

## Answer

1. **Lineage is an existing extension point, not greenfield**: spawned peers already receive identity via env (`PIJ_SESSION_ID`, `PIJ_PARENT_ID`, `PIJ_SPAWN_MODEL/EFFORT/TASK`, `PIJ_ROLE`) with an atomically-written descriptor — team-id/role/reply-form fields piggyback on this channel with zero new plumbing (F-01).
2. **Receipts half-exist**: receiver-triggered delivery receipts (`queued|delivered|unverified`) already flow back to senders; the parse-ack the survey demands is an extension of `ReceiptState` at the `inbox.ts` consume seam — a natural, local change (F-04).
3. **Canary and model verification are 100% prose today**: no nonce/challenge code exists; `boundModel` is pure self-report with no round-trip to the running harness. A canary verb and rendered-runtime capture are new surface (F-02, F-03).
4. **Worktree management is zero code** in pij (grep-confirmed) — `pij stream create` starts from nothing, but must interact with the existing `gitCommonDir` identity field (F-05).
5. **The store extends by strict law**: new record types = new `~/.pij/<type>/` subdirs (top level is registry-reserved — phantom-peer trap); new verbs = three coupled `core/cli.ts` tables + switch cases (ride the platform parser, NOT an orchestration-style second resolver); writes attribute via the existing `resolveActor` chain; safety checks follow the derived-never-enforced anomaly pattern (F-06..F-10).
6. **Contract territory is closed and human-ruled**: semantic/system state vocabularies are byte-locked (WS-6, plan 060); spine is append-only single-log; new event kinds and the team-manifest schema are exactly the class 054 ruled "human-ruled contract territory" → workshop material (H-02, W-01).
7. **Two standing hazards shape the design**: the 036 silent-no-op grant is the anti-pattern every scaffold verb must be designed against (fail-loud, self-evidencing, atomic-before-dispatch), and s051 restart-safe identity is a live dependency — scaffold correctness leans on it (H-01, H-03).

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | Spawned peers get identity/lineage via env (`PIJ_SESSION_ID`, `PIJ_PARENT_ID`/`PIJ_ANNOUNCE_TO`, `PIJ_SPAWN_ID/MODEL/EFFORT/TASK`, `PIJ_ROLE`, `PIJ_HARNESS`); descriptor written atomically `lifecycle:"pending"` → merged `bound` | `.pi/extensions/pij/core/binding.ts:119-152,369-384,391-418` | Team/role/reply-form fields ride the existing env+descriptor channel — kill pij-blindness without new plumbing | High |
| F-02 | `boundModel`/`effort` are self-report: spawner's request echoed into the descriptor; no call-back verifies what the harness actually loaded | `core/session.ts:224-238`, `core/spawn.ts:406` | Model-pin verification is greenfield; needs a new peer→registry report round-trip (survey's "rendered runtime" field) | High |
| F-03 | No canary/nonce/challenge-response code exists; `pending-canary` is a manual focus-fork label only | `cli.ts:356`, `core/focus.ts:112,424,474` | `pij canary` (legs a+b) is new surface — confirms survey premise that canary is prose ritual | High |
| F-04 | Delivery receipts are receiver-triggered at inbox consume (`send-delivered-receipt`, states `queued\|delivered\|unverified`); `pij send --wait` polls them | `core/inbox.ts:213-235`, `core/message.ts:32-48`, `core/cli.ts:1884-1922` | Parse-ack = extend `ReceiptState` or add a receipt kind at the inbox.ts seam — the dispatch-receipt primitive is a local extension, not a new transport (matches 054 KF-09) | High |
| F-05 | Zero git-worktree management code in pij; only a worktree-launch guard + read-only `gitCommonDir` resolution | `core/focus.ts:264`, `cli.ts:358`, `core/ports.ts:39` | `pij stream create` is built from scratch; must define interaction with `gitCommonDir` session-join identity | High |
| F-06 | Store law: one subdir per record type under `~/.pij` (`projects/<slug>/project.json`, `assignments/<id>.json`, `spine/events.ndjson`); top level reserved for registry descriptors (phantom-peer trap) | `adapters/project-store.ts:3`, `adapters/assignment-store.ts:3`, `adapters/spine-store.ts:3` | Fences/allocations land as `fences/`, `allocations/` subdirs; never top-level JSON | High |
| F-07 | Adding a verb touches three coupled tables (`FAMILY_SUBCOMMANDS`, `ALLOWED_FLAGS`, `MAX_POS`) + parse/execute switch cases; bin-side generic `--help` filter exists for platform verbs | `core/cli.ts:489-567,923-1104,2216-2965`; bin `cli.ts:3019-3024` | Scaffold verbs get flags validation + `--help` for free on the platform parser; missing a table entry degrades silently to E-ARG | High |
| F-08 | Two separate arg resolvers confirmed: orchestration subtree has its own parser routed before the platform `--help` filter | `core/orchestration/cli.ts:246` vs bin `cli.ts:3005-3008,3019` | Scaffold family must ride the platform parser — the orchestration-style second resolver is the documented drift source | High |
| F-09 | Actor resolution is a fixed precedence chain (`--actor` asserted → ambient self → `PIJ_SESSION_ID` → TMUX pane match → cwd fallback) threading `ActorProvenance` into spine events | `core/cli.ts:1183-1226` | Reuse `resolveActor` unchanged for fence/allocation writes; audit tooling depends on the provenance field | High |
| F-10 | Anomalies are pure derived queries over `{descriptors, assignments, events}`, swept by the daemon; "safety is DERIVED, never enforced (WS-6)" | `core/anomalies.ts:1-6`, `core/daemon/anomaly-sweep.ts:52-60` | Scaffold integrity checks (un-acked briefs, half-scaffolds, stale allocations) follow this pattern — new anomaly classes, not enforcement | High |
| F-11 | `Project` record: interface + type guard + `PROJECT_FIELD_ORDER` must change in lockstep (canonical JSON feeds spine prev/next byte-comparability) | `core/platform/types.ts:33-44,198-213`, `core/platform/project.ts:53-61` | `autonomy: power-through\|gated` is a three-place lockstep edit; miss one → round-trip validation break or spine determinism corruption | High |
| F-12 | Spine `append` reads only flags (`--kind/--refs/--peer/--project/--actor/--bare`); no stdin path found | `core/cli.ts:1051-1090,2408-2442` | Survey respondent's "stdin-only spine append" not reproduced on this base — likely older build; re-verify before designing around it | Medium |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | Baton `grant --to <peer>` exited 0, printed posture, did nothing (wrong arg form); strict-exit-codes finding recorded | plan 036 execution.log #Finding-02; survey §8 | Direct | The anti-pattern all scaffold verbs are designed against: fail-loud, self-evidencing, atomic-refuse before dispatch |
| H-02 | Store contract territory is human-ruled: spine event-kind vocab, WS-3 single machine-wide append-only log, WS-6 closed state vocabularies (byte-identical, no extension — re-affirmed plan 060 AC-02) | 054 workshops WS-3/WS-6; 060 AC-02 | Direct | Team-manifest schema + new spine event kinds need a workshop with Jordan; scaffold cannot invent state kinds |
| H-03 | Restart re-key twin problem documented live (survey: cattle's reply under twin alias); s051 owns prevention/repair; 036 ruled additive-only descriptor schema | survey §4; 036 research F-08; s051 stream | Direct | Scaffold depends on s051 landing; capture resolved identity at spawn; base SHA at worktree-create time |
| H-04 | Honor-system posture: no ACLs, free writes with logged attribution, granter discretion over FIFO, atomic wx no-replace lease file as single-holder truth | 036 plan ruling #7; 054 WS-5 | Partial | Scaffold verbs accept any actor, append everything to spine; allocation "locking" = atomic-create file, 036-style |
| H-05 | Dispatch-receipt is the coalface #1 ask; 054 KF-09: no new transport needed — reuse existing delivery channel | survey §5; 054 KF-09 | Direct | Receipt primitive = separate verb from manifest; builds on F-04 seam |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| s051 identity fix not yet landed (twin re-key) | H-03; spine events (s051 in 7-mutant review at last read) | Scaffold receipts/canary bind to seat ids; twins corrupt attribution | Sequence: consume s051's contract when it lands; design canary to record pane+pid+native-id triple defensively |
| Phantom-peer trap at `~/.pij` top level | F-06 | A misplaced record file mints a fake peer | Law in the plan: new record types always get subdirs; add a test asserting registry.list() unaffected (056 precedent) |
| Silent-no-op class in existing CLI | H-01, F-07 (silent E-ARG degradation) | Scaffold verbs inherit the substrate's failure style unless designed against | Every verb: evidence-line on success, named error on refusal, atomic refuse; add tests for wrong-arg paths |
| Stdin spine-append claim unreproduced | F-12 | A design assumption from the survey may be stale | One-line re-verify with mastodon before citing it in the plan |

## Planning Handoff

- **Preserve**: store subdirectory law (F-06); closed state vocabularies (H-02); `resolveActor` + `ActorProvenance` (F-09); derived-never-enforced safety (F-10); append-only spine; additive-only descriptor schema (H-03); existing receipt machinery (F-04).
- **Change carefully**: `core/cli.ts` three-table verb registration (F-07, silent E-ARG on miss); `Project` three-place lockstep for `autonomy` (F-11); `inbox.ts` receipt emission (parse-ack extension must not break existing `--wait` consumers).
- **Likely files/symbols**: `core/binding.ts` (lineage env), `core/spawn.ts` + `core/session.ts` (descriptor/model), `core/inbox.ts` + `core/message.ts` (receipts), `core/cli.ts` (verb tables + parse/execute), `core/platform/types.ts` + `project.ts` (autonomy field), new `adapters/fence-store.ts`/`allocation-store.ts`, new `core/worktree.ts` (greenfield), `core/anomalies.ts` (new derived classes).
- **Decisions still required**: **(W-01) team-manifest schema + scaffold verb-family vocabulary** — contract territory, human-ruled per 054 precedent (workshop candidate); **(W-02) receipt-state extension vocabulary** (parse-ack as new `ReceiptState` value vs new receipt kind — touches a shipped consumer surface; workshop-or-plan-decidable); v1 verb cut-line (which of stream-create/canary/receipt/fence/autonomy ship first vs follow); whether `pij team scaffold` composes in v1 or lands after the building-block verbs (survey recommends after).
