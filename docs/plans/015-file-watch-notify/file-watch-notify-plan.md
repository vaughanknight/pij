# File-Watch Notify — pi extension
**Mode**: Simple
**Plan Version**: 1.1.0
**Created**: 2026-06-16
**Status**: READY
**Spec source**: unified (this file)

> 📚 Incorporates findings from `research-dossier.md` + `external-research/watch-fidelity.md`.

## Business Specification

### Research Context
pij already implements the watch→debounce→dedupe→**steer/immediate inject** seam from a `session_start` background watcher with **no tool call** (`adapters/channel.ts`, `adapters/pi-runtime.ts`, `core/session.ts`, `index.ts`). pi exposes **no native fs-watch hook**, so a self-run watcher is the supported path. The deep dive surfaced the **directory-watch trap**: pij only works dir-watching because its writers use atomic tmp+rename; a *general* user-folder watcher must **not** trust `fs.watch` event types and must reconcile a `{mtimeMs,size}` snapshot to classify created/modified/deleted.

### Summary
A standalone pi extension that watches **one or more configured folders**, each with **one or more glob patterns**, and on a matching change **injects a notification straight into the session** — steered if the model is busy, immediate if idle — exactly like receiving a pij message, with **no tool call** required for the agent to learn about it.

### Goals
- Configure ≥1 watch (folder + ≥1 glob pattern) from a project-local file.
- On a matching create/modify/delete, inject a human-readable notice (`[file-watch] <path> changed (modified)`) — no tool call.
- Reuse pij's steer-if-busy / immediate-if-idle inject behavior verbatim.
- Reliable change classification under real editors (atomic-save artifacts ignored; bursts debounced/coalesced).
- Zero coupling to pij (standalone extension; copies/adapts the proven pattern).
- Arm/list/stop watches at **runtime** via `/file-watch-notify` subcommands (no reload needed).

### Non-Goals
- Recursive repo-wide watching at scale (opt-in `recursive:true` only; chokidar/@parcel documented as future drop-in, not built now).
- Reacting to changes with actions (it only *notifies* — the agent decides what to do).
- A new shared core / refactor of pij (explicitly rejected in clarifications — standalone).
- Cross-session delivery (this is local-session only; that's pij's job).
- Persisting runtime-added watches back to `.pi/file-watch.json` (runtime watches are session-local; re-add after reload, or use the config file for durable watches).

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| file-watch-notify | **NEW** | **create** | The watcher extension: config, folder watch, change classify, notice inject |
| pij-messaging | existing | **consume** | Reference pattern only — copy/adapt the watch+steer-inject seam; **no changes to pij** |

#### New Domain Sketches
##### file-watch-notify [NEW]
- **Purpose**: Watch configured folders/globs and inject in-session notices on file change, no tool call.
- **Boundary Owns**: watch config parsing, glob compilation, snapshot reconcile + change classification, notice formatting, the background watcher lifecycle, the inject decision (steer/immediate).
- **Boundary Excludes**: peer/cross-session messaging (pij's), acting on changes (agent's), recursive-at-scale backends (future).

### Testing Strategy
- **Approach**: Hybrid — **TDD for the pure core** (glob compile, snapshot reconcile, change classify, notice format) vs hand-written fakes; **Lightweight** validation for the thin pi-wiring (`index.ts`). Matches P8 ("tests target the store").
- **Rationale**: the core is real logic (the directory-watch-trap fix lives here); wiring is a translator.
- **Focus Areas**: created/modified/deleted classification, atomic-save artifact filtering, multi-pattern + multi-folder matching, debounce coalescing, steer-vs-immediate decision.
- **Excluded**: cross-platform fs-event timing (covered by the snapshot reconcile design, not unit-asserted per-OS).
- **Mock Usage**: B — targeted constructor-injected **fakes** for `fs` and the pi runtime (project convention P3/P4); no liberal mocking.

### Documentation Strategy
- **Location**: B — `docs/how/file-watch-notify.md` (mirrors `docs/how/pij.md`).
- **Rationale**: consistent home; documents config shape, behavior, steer semantics, and the directory-watch-trap rationale.

### Complexity
- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=1, D=1, N=1, F=1, T=1
- **Confidence**: 0.80
- **Assumptions**: pij's inject path (`sendUserMessage`+`deliverAs:"steer"`) is reusable as-is; picomatch acceptable as the one glob dependency.
- **Dependencies**: `picomatch` (single, 0-transitive-dep matcher); Node ≥19.1 for opt-in `recursive:true`.
- **Risks**: editor atomic-save fidelity (mitigated by snapshot reconcile + ignore-list); steer-spam during big rebuilds (mitigated by debounce + coalesce).
- **Phases**: 1 (Simple).

### Acceptance Criteria
- **AC-01**: Given a configured folder + pattern `*.md`, when a matching file is created/modified/deleted, the session receives an injected notice naming the path + change kind — with **no tool call**.
- **AC-02**: When the model is busy, the notice is delivered as a **steer** (after the current turn, not a mid-stream interrupt); when idle, **immediately**.
- **AC-03**: **Multiple patterns** and **multiple watched folders** are supported from config.
- **AC-04**: Editor atomic-save artifacts (`4913`, `*~`, `.goutputstream*`, `.tmp*`, dotfiles) produce **no** spurious notices; an atomic save is reported as a single **"modified"**.
- **AC-05**: A burst of rapid changes is **debounced/coalesced** (no notice spam); change kind is classified via **snapshot reconcile**, not raw `fs.watch` event types.
- **AC-06**: The watcher **starts at `session_start`** and **disposes on reload** (explicit `disposeAll()`); **shutdown** disposal is implicit via `persistent: false` (the watcher never holds the event loop; the OS reclaims it on exit) — no tool call to arm.
- **AC-07**: Runtime commands arm/list/disarm watchers **without a reload** — `/file-watch-notify watch <dir> <glob...>` starts a live watcher, `/file-watch-notify list` shows active watches, `/file-watch-notify stop <dir>` disposes one. Config-at-boot (AC-06) remains the persistent path; runtime watches are session-local.

### Risks & Assumptions
- Assumes a single shallow folder is the common case; `recursive:true` is opt-in and documented with EMFILE/ENOSPC caveats.
- Assumes the extension ignores its own/config writes (none expected — it's read-only over watched dirs).

### Open Questions
- **Config source/shape** (resolved with a default below): `.pi/file-watch.json` chosen as the default; a `settings.json` block or env override is a possible future addition.

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Config schema & source | Storage Design | Locks the user-facing contract before code | One file vs settings block? per-watch notice templates? env override? |
| Notice format & coalescing | CLI Flow | Tune the in-session UX | One notice per change vs per-burst summary? rate-limit window? |

### Clarifications
#### Session 2026-06-16
- **Workflow Mode**: Simple.
- **Packaging**: Standalone extension (no coupling to pij; copy/adapt the seam).
- **Testing**: Hybrid (TDD core vs fakes, lightweight wiring).
- **Documentation**: `docs/how/file-watch-notify.md`.
- **Mock Usage**: Targeted fakes for `fs`/pi-runtime (project convention; not asked).
- **Config source** (decided default): `.pi/file-watch.json`.

#### Session 2026-06-17
- **Runtime watch control** (scope change, user-requested): the runtime `/file-watch-notify watch|list|stop` subcommands are now **in scope** (the original plan implied config-at-boot only). Rationale: live setup/adjustment without a `/reload` is the natural way to try and tune watches. Runtime watches are **session-local** (not persisted to config). Feasibility grounded in the existing `pi.registerCommand("file-watch-notify", { handler(args, ctx) })` seam in `index.ts` — the read-only status command already proves the command + `ExtensionCommandContext` path.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: Config schema & source; Notice format & coalescing.
- Backpressure coverage: not captured (post-spec seam not run).

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings + the directory-watch-trap fix |
| external-research/watch-fidelity.md | y | sets the snapshot-reconcile algorithm + ignore-list + debounce window |
| workshops/*.md | n | — |
| backpressure-coverage.md | n | — |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Round 1 complete; no critical `[NEEDS CLARIFICATION]` |
| G2 | Constitution | N/A | no `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | no `docs/project-rules/architecture.md` |
| G4 | ADR Compliance | N/A | no `docs/adr/` |
| G5 | Structure | PASS | all required sections present |
| G6 | Testing Alignment | PASS | Hybrid → core test tasks precede impl; ACs measurable |
| G7 | Domain Completeness | PASS | NEW domain has a setup task; manifest covers all files |

### Summary
Build a standalone `file-watch-notify` pi extension that adapts pij's proven background watcher + steer/immediate inject. The pure core (picomatch glob compile, `{mtimeMs,size}` snapshot reconcile, change classification, notice formatting) is TDD'd vs fakes; a thin `fs.watch` adapter and a `session_start` wiring layer make it live. Outcome: configured folder/glob changes appear in-session with no tool call, steered when busy.

### Config Schema (minimal default — the config-schema workshop may refine)
`.pi/file-watch.json` (project-local), read once at `session_start`:
```json
{
  "watches": [
    { "dir": "docs", "patterns": ["**/*.md"], "events": ["add","change","unlink"], "recursive": false }
  ],
  "debounceMs": 30,
  "ignore": ["4913", "*~", ".goutputstream*", ".tmp*", ".*"],
  "notice": "[file-watch] {path} {kind}"
}
```
- `watches[]` — one or more; each `dir` + ≥1 `patterns` (picomatch), optional `events` filter (default all), optional `recursive` (Node ≥19.1).
- `debounceMs` default 30 (20–50 ok); `ignore` defaults to the atomic-save artifact list; `notice` template tokens `{path}`/`{kind}`.
- Parsed via a tagged-union `Result` (P4); invalid config → a single startup notice, watcher stays down. This is the minimal contract the implementer builds to (T003b/T006); the config-schema workshop may extend it.

### Runtime Commands (amendment) — implementation contract
The runtime `/file-watch-notify watch|list|stop` surface (T010–T012) builds to this concrete contract so the T010 tests and the T011 handler cannot drift (closes the validate-v2 HIGH gaps):

**`commands.ts` — pure parser (pi-free, P2/P8):**
```ts
export type ParsedCommand =
  | { kind: "watch"; dir: string; patterns: string[] }
  | { kind: "list" }
  | { kind: "stop"; dir: string }
  | { kind: "status" }                 // empty args / `help` → status line + usage
  | { kind: "error"; reason: string };
export function parseCommand(args: string): ParsedCommand;
// "" or "help" → {kind:"status"}; "watch <dir> <glob...>" needs >=1 pattern else error.
```

**`index.ts` refactor (T011)** — required because the current handler is read-only and the watcher-build block + `config` are `session_start`-callback-local:
- **Promote config to module scope**: `let loadedConfig: Config | null = null;` set in `session_start` after a successful parse. Runtime watches use `loadedConfig?.debounceMs ?? DEFAULT_DEBOUNCE_MS`, `?? DEFAULT_IGNORE`, `?? DEFAULT_NOTICE` — so they match config-booted watches and still work when no `.pi/file-watch.json` exists.
- **Migrate `disposers: Array<() => void>` → `Map<string, () => void>` keyed by resolved absolute dir.** `disposeAll()` becomes `for (const d of disposers.values()) d(); disposers.clear();`; the `session_start` loop uses `disposers.set(dir, () => folder.dispose())`. This makes per-dir `stop` possible **and** guarantees runtime watches are torn down on `/reload` (no leak/inject into the new session).
- **Extract a module-scope helper** `startWatch(dir, patterns): { ok: true } | { ok: false; reason: string }` that compiles + arms a `FolderWatcher` **inside a `try`** (bad glob / missing dir → `{ok:false}`, never an uncaught throw — also fixes the current `compileWatch`-outside-`try` gap) and `disposers.set(resolvedDir, …)`. Both `session_start` and the command handler call it.
- **Arming dedupes**: if `disposers.has(resolvedDir)`, dispose + delete the existing watcher first, then re-arm (no double-notification from config-vs-runtime or runtime-vs-runtime overlap).
- **Replace the existing `registerCommand("file-watch-notify")` handler** (do NOT add a second registration): the body dispatches on `parseCommand(args).kind` — `status` → the status line + usage; `watch` → `startWatch` + notify; `list` → one line per `disposers` entry `watching: <dir> [<patterns>]` (or "no active watches"); `stop` → `disposers.get(resolvedDir)?.()` + `delete` (works for config- or runtime-armed dirs, since both live in the map), else "not watched".

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/file-watch-notify/store.ts` | file-watch-notify | contract | pi-free pure core: compile/reconcile/classify/format/config |
| `.pi/extensions/file-watch-notify/store.test.ts` | file-watch-notify | internal | core unit tests vs fakes |
| `.pi/extensions/file-watch-notify/watcher.ts` | file-watch-notify | internal | fs.watch + debounce + readdir/stat adapter |
| `.pi/extensions/file-watch-notify/inject.ts` | file-watch-notify | internal | pi inject adapter (steer/immediate) — adapts pij's pi-runtime |
| `.pi/extensions/file-watch-notify/commands.ts` | file-watch-notify | internal | pure runtime-command parser (`watch`/`list`/`stop`) — pi-free |
| `.pi/extensions/file-watch-notify/commands.test.ts` | file-watch-notify | internal | command-parser unit tests |
| `.pi/extensions/file-watch-notify/index.ts` | file-watch-notify | contract | session_start wiring (P10) |
| `docs/how/file-watch-notify.md` | file-watch-notify | contract | user guide |
| `docs/domains/file-watch-notify/domain.md` | file-watch-notify | contract | domain doc |
| `package.json` | _platform | cross-domain | add `picomatch` dep |
| `.pi/file-watch.json` | file-watch-notify | contract | user-authored watch config (shape in § Config Schema) — read at boot |
| `.pi/extensions/file-watch-notify/watcher.test.ts`, `inject.test.ts`, `index.test.ts` | file-watch-notify | internal | adapter + wiring integration tests (Hybrid; `index.test.ts` covers AC-01/02/06, reload, error recovery) |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **Directory-watch trap**: `fs.watch(dir)` may miss in-place modifies; pij avoids it only via atomic writes. | Classify via `{mtimeMs,size}` snapshot reconcile on each debounced wake — never trust `fs.watch` event types. |
| 02 | High | Editor atomic-saves emit artifacts (`4913`, `*~`, `.goutputstream*`) + delete-then-recreate. | Ignore-list; a true tmp+rename atomic save is single-wake → one `modified`; a cross-wake re-add within ~100 ms is reclassified `modified` (not spurious `created`). |
| 03 | High | `picomatch` is 0-dep, ~3–5× faster than minimatch, accepts one-or-more patterns, compile-once. | Compile matcher once at config load; reuse per path. |
| 04 | Medium | Inject path + lifecycle already proven in pij (`sendUserMessage`+`deliverAs:"steer"`; `session_start` seam). | Adapt verbatim; pick steer vs immediate from `isIdle()`. |
| 05 | Medium | Bursts cause double events / steer-spam. | Debounce 20–50 ms; coalesce N changes per wake into one notice. |

### Implementation

**Objective**: Ship a standalone file-watch→in-session-notify extension reusing pij's seam, with a snapshot-reconcile core.
**Testing Approach**: Hybrid — TDD the pure core (store.ts) vs fakes; lightweight smoke for wiring.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T000 | **Harness pre-flight** — `/eng-harness-flow --event pre-implement --phase "Phase 1" --plan-dir docs/plans/015-file-watch-notify` | — | — | Router envelope handled; verdict narrated before code | _Harness seam (router installed)_ |
| [x] | T001 | Scaffold extension (`just new file-watch-notify`) + add `picomatch` dep | file-watch-notify / _platform | `.pi/extensions/file-watch-notify/*`, `package.json` | typecheck passes; picomatch resolves | P1 layout |
| [x] | T002 | **Tests-first**: core unit tests vs fakes (glob compile, snapshot reconcile → created/modified/deleted, atomic-save ignore-list, multi-pattern/multi-folder match, notice format) | file-watch-notify | `store.test.ts` | tests written + red; cover AC-01/03/04/05 | TDD |
| [x] | T003a | **Tests-driven core (the trap fix)**: `{mtimeMs,size}` snapshot reconcile → created/modified/deleted + atomic-save ignore-list + re-add-within-100ms→modified | file-watch-notify | `store.ts` | T002 green; AC-04/05 covered | P2, finding 01/02 — **critical path** |
| [x] | T003b | Config parse (tagged-union Result, per § Config Schema), compile picomatch matcher(s), notice formatting | file-watch-notify | `store.ts` | parses the § Config Schema example; multi-pattern/multi-folder match; AC-01/03 | P2, finding 03 |
| [x] | T004 | `watcher.ts` adapter: `fs.watch(dir)` + 20–50 ms debounce + `readdir`+`stat` → `store.reconcile`; optional `recursive:true` | file-watch-notify | `watcher.ts` | integration test over a tmp dir detects create/modify/delete | finding 05 |
| [x] | T005 | `inject.ts` adapter: `inject(notice, isIdle()? "immediate":"steer")` via `sendUserMessage` (adapt pij pi-runtime) | file-watch-notify | `inject.ts` | unit test vs fake pi asserts steer when busy, immediate when idle | AC-02, finding 04 |
| [x] | T006 | `index.ts` wiring (P10 single `session_start` handler): load `.pi/file-watch.json` (per § Config Schema), start watcher(s), inject on change, dispose on shutdown/reload | file-watch-notify | `index.ts` | live `/reload` arms watcher with no tool call | AC-06; mirror pij `index.ts` lifecycle |
| [x] | T007 | Domain doc + user guide | file-watch-notify | `docs/domains/file-watch-notify/domain.md`, `docs/how/file-watch-notify.md` | config + behavior + steer semantics + directory-watch-trap documented | docs strategy |
| [x] | T008 | `just self-check` green; live smoke (edit a watched `*.md`, see the notice while busy) | file-watch-notify | — | self-check passes; manual steer notice observed | AC-01..06 |
| [x] | T099 | **Harness phase-end** — `/eng-harness-flow --event phase-end --plan-dir docs/plans/015-file-watch-notify` | — | — | Router envelope handled at phase end | _Harness seam (router installed)_ |
| [x] | T010 | **Tests-first** (follow-on increment): pure `parseCommand(args)` → the `ParsedCommand` tagged union in § Runtime Commands | file-watch-notify | `commands.test.ts` | red tests assert each `kind` + fields: `watch`(dir+patterns), `list`, `stop`(dir), `status`(empty/`help`), `error`(missing args / no pattern); AC-07 | TDD core (P8) |
| [ ] | T011 | Implement `commands.ts` + **refactor** `index.ts` per § Runtime Commands: module-scope `loadedConfig` + `DEFAULT_*` fallbacks, `disposers`→`Map<dir,()=>void>`, try-guarded `startWatch` helper (dedupes same dir), and **replace** the existing `registerCommand` handler with the dispatcher | file-watch-notify | `commands.ts`, `index.ts` | live `/file-watch-notify watch scratch/x "**/*.md"` arms with **no reload** (defaults when no config); `list` shows it; `stop` disposes it; bad glob / missing dir → warning, no crash | AC-07; § Runtime Commands |
| [ ] | T012 | Self-check + live smoke: arm at runtime → `list` shows the dir → edit a watched file → see the steered notice → `stop` → `list` empty & silence; **reload smoke**: a runtime watch is gone after `/reload` (Map cleared) | file-watch-notify | — | self-check green; arm/list/stop + reload-disposal observed live | AC-07 |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T003b, T004, T008 | core reconcile test + live smoke |
| AC-02 | T005 | inject unit test (fake pi, busy/idle) |
| AC-03 | T002, T003b | multi-pattern/multi-folder core tests |
| AC-04 | T002, T003a | atomic-save ignore-list tests |
| AC-05 | T003a, T004 | debounce/coalesce + reconcile tests |
| AC-06 | T006, T008 | live `/reload` smoke (no tool call) |
| AC-07 | T010, T011, T012 | command-parser tests + live runtime arm/list/stop smoke |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Directory-watch trap (KF-01)** — `fs.watch` event types are unreliable for *all* directory watchers (not just cross-platform) | Critical→Low (mitigated) | High | Snapshot reconcile (not event types) is architecturally **required**, not optional hardening — platform-agnostic |
| Steer-spam during large rebuilds | Medium | Low | Debounce + coalesce N changes per wake into one notice |
| Atomic-save artifact false positives | Medium | Low | Ignore-list; tmp+rename is single-wake → one `modified`; cross-wake re-add reclassified `modified` (see Known Limitations) |
| picomatch dep rejected by policy | Low | Low | It's a regular npm dep (0 transitive); hand-rolled `*.ext` matcher is a fallback |
| Runtime-added watches lost on reload | High | Low | Documented as session-local (Non-Goal + Known Limitations); re-add after reload or use `.pi/file-watch.json` for durable watches |
| T011 latent scope (config-scope refactor, `disposers`→Map, dedupe, `list` format) | Medium | Medium | Fully specified inline in § Runtime Commands so the implementer doesn't guess; a post-T011 mini-check before the T012 smoke |

### Known Limitations
- **AC-04 scope**: a true atomic save (write-temp → rename over the target) lands inside one debounced wake, so it is reported as a **single `modified`** — AC-04 holds. The distinct, rarer case where a delete and its re-add fall in **separate** wakes is reclassified to `modified` (never a spurious `created`), but a preceding `deleted` may surface. Single-notice coalescing across wakes would require a deferred-delete flush timer (a lone delete must still surface without a following fs event) and is **deliberately out of scope** (documented in `docs/how/file-watch-notify.md` + `domain.md`).
- **Burst delivery**: all changes in one wake are combined into a **single** injected message (AC-05), not one message per file.
- **Runtime watches are session-local**: watches added via `/file-watch-notify watch` are not persisted and are lost on `/reload` (the disposer Map is cleared). Tear down with `/file-watch-notify stop <dir>`, or add the dir to `.pi/file-watch.json` for a durable watch.

### Harness Seams
- **Entry point**: `/eng-harness-flow --event <seam> [--phase <id>] [--plan-dir <p>] --json` — the single door; child skills never named.
- **Pre-implement** (`--event pre-implement`): fired by the implement verb at phase start (T000); verdict narrated verbatim (`healthy / SLOW / UNHEALTHY / UNAVAILABLE`). `UNAVAILABLE` falls back to standard testing.
- **Phase end** (`--event phase-end`): fired at the phase seam (T099); `--event plan-complete` fires at merge.
- **Best-effort**: advisory, never blocks.

---

## Validation Record (2026-06-16)

### Validation Thesis
**Raison d'être**: Plan a standalone pi extension delivering configured folder/glob change notices into a live session with no tool call, steered if busy, reusing pij's watch+steer-inject seam.
**Value claim**: The build is low-risk assembly because the plan correctly separates reuse-from-pij vs the genuinely-new snapshot-reconcile fidelity fix.
**Artifact promise**: The implement stage can build Phase 1 from the inline task table with minimal clarification; ACs are testable.
**Intended beneficiaries**: the implement stage / implementer agent; future maintainers.
**Proof target**: Implementation.
**Evidence standard**: tasks map to testable ACs; reuse claims match real pij source; the directory-watch-trap fix is correctly specified.
**Thesis source**: research-dossier.md + external-research/watch-fidelity.md + the user's original ask.
**Thesis verdict**: Advanced (after fixes).
**Main thesis risk**: an underspecified config schema could let the implementer guess a shape the workshop later contradicts — **fixed** by adding § Config Schema.

| Agent (lens) | Lenses Covered | Issues | Verdict |
|---|---|---|---|
| Coherence + Completeness | Coherence, Completeness, Proof-Level Fit | 1 HIGH fixed, 1 MEDIUM fixed, 1 LOW fixed | ✅ after fixes |
| Thesis + Risk | Thesis Alignment, Evidence Sufficiency, Hidden Assumptions | reuse claims verified vs source; 0 open | ✅ |
| Forward-Compatibility | Forward-Compatibility, Test Boundary | 1 HIGH fixed (encapsulation lockout) | ✅ after fixes |

> Run note: the `flowspace-research-v2` fan-out collided on a singleton live agent instance (infra limit, not content); the three lenses were run **in-parent** and grounded against the real pij source (`session.ts:172-173` steer/isIdle; `channel.ts` fs.watch dir+debounce+dedupe; `pi-runtime.ts` `deliverAs:"steer"`) — all reuse claims verified true.

**Issues found & fixed**
- **HIGH (encapsulation lockout / proof gap)** — config schema for `.pi/file-watch.json` was unspecified, blocking T006. **Fix**: added § Config Schema (minimal default) + referenced it from T003b/T006.
- **MEDIUM (proof-level fit / CS challenge)** — T003 over-bundled five concerns incl. the critical trap fix. **Fix**: split into T003a (snapshot reconcile + classify + ignore-list — critical path) and T003b (config/glob/notice); updated coverage map.
- **LOW (completeness)** — Domain Manifest missed `.pi/file-watch.json` + adapter test files. **Fix**: added rows.

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|---|---|---|---|---|
| implement stage | a config schema concrete enough to build T006 | encapsulation lockout | ✅ (after fix) | § Config Schema added |
| implement stage | the trap fix is a discrete, AC-verified task | proof-level fit | ✅ (after fix) | T003a + AC-05 |
| implement stage | testable Done-When per task; ACs verifiable under Hybrid | test boundary | ✅ | AC-02→T005 (fake pi), AC-06→T008 (live smoke) |
| implement stage | consistent layout/deps (picomatch, .pi/extensions/file-watch-notify/) | shape mismatch | ✅ | Domain Manifest + tasks consistent |

**Thesis alignment**: Value claim advanced at Implementation proof level; reuse claims verified against source; the one real risk (config-schema gap) is closed.

**Outcome alignment**: With § Config Schema added and the trap fix isolated as T003a, the plan as written advances the Outcome — *"configured folder/glob changes appear in-session with no tool call, steered when busy"* — buildable by the implement stage without guesswork.

**Standalone?**: No — downstream consumer is the implement stage (this plan's inline tasks).

Overall: ⚠️ VALIDATED WITH FIXES

---

## Amendment Validation (2026-06-17) — runtime watch/list/stop commands

**Trigger**: user brought the runtime `/file-watch-notify watch|list|stop` subcommands in-scope (was implied config-at-boot only). Re-ran the plan verb's amendment path; the mandated `/validate-v2` step ran **in-parent** (the `subagent` fan-out is blocked by a live singleton agent this session — the same infra limit recorded above; validate-v2 permits in-parent synthesis).

**Thesis impact**: value claim unchanged ("changes appear in-session, no tool call") — the amendment adds a *control surface*, not a new mechanism. Low marginal risk: the runtime handler reuses the exact watcher-build block already proven in `session_start`.

**Lens findings (in-parent, grounded vs real source)**:
- **Coherence / Completeness** — AC-07 added; Goals + Non-Goals updated; Domain Manifest gains `commands.ts` / `commands.test.ts`; tasks T010–T012 (tests-first → impl → smoke) cover it; coverage map + risks updated. No dangling cross-refs. ✅
- **Feasibility / Forward-Compat** — grounded against `index.ts:122` `pi.registerCommand("file-watch-notify", { handler: async (args, ctx: ExtensionCommandContext) })`: the handler already receives raw `args` + ctx; the watcher-build loop (`compileWatch`→`WatchReconciler`→`FolderWatcher.start()`→`disposers.push`) is in activate-scope and reusable for live arming; inject uses the session `currentCtx` already set at boot. **No new pi capability required.** ✅
- **Thesis risk** — runtime watches are ephemeral (lost on reload). Surfaced as a Non-Goal + a Risk row (documented, not silently dropped). ✅

**Status**: stays **READY** (Simple, CS-3 unchanged). Gate Matrix re-checked — G5 structure intact (new sections populated), G6 testing (T010 tests precede T011 impl), G7 domain (new files in manifest). No CRITICAL/HIGH open.

Overall: ✅ VALIDATED (amendment) — READY to implement T010–T012.

---

## Validation Record — real `validate-v2` fan-out (2026-06-17)

The earlier two passes (original + amendment) ran **in-parent** because the `subagent` tool was wedged — a globally-linked pij announced inside subagent children and collided with the `-p` task prompt (fixed in `bb3e40e`). With subagents healthy, the **real 4-agent parallel fan-out** ran (4/4 succeeded), grounded against the shipped source.

| Agent (lens) | Issues | Verdict |
|---|---|---|
| Coherence + Completeness + Proof-Level Fit | 0 CRIT · 2 HIGH · 4 MED · 3 LOW | ⚠️→✅ after fixes |
| Risk + Hidden Assumptions + Edge Cases | 0 CRIT · 2 HIGH · 3 MED · 2 LOW | ⚠️→✅ after fixes |
| Thesis Alignment | 0 blockers · 1 LOW | ✅ (thesis advanced; reuse claims verified vs source) |
| Forward-Compatibility | 2 HIGH · 3 MED · 1 LOW | ⚠️→✅ after fixes |

**Thesis Verdict** (dedicated agent): understood **Yes**; value claim **advanced**; proof Target=Implementation, Actual=Implementation (T001–T008 shipped, T010–T012 pending); evidence **Strong**; main risk = the runtime `dir→disposer` lifecycle must reach `disposeAll()` on reload — **now specified**.

**Outcome alignment** (FC agent): the plan **fully advances** *"configured folder/glob changes appear in-session with no tool call, steered when busy"* (Phase 1 shipped); the *"runtime arm/list/stop without reload"* half **did not advance as written** — two HIGH gaps (disposers shape; config scope) forced implementer guesswork. **Both are now closed** by § Runtime Commands.

**Fixes applied to the plan (all grounded in real source):**
- **HIGH — config scope**: the runtime handler couldn't reach `config.{debounceMs,ignore,notice}` (callback-local). → § Runtime Commands promotes `loadedConfig` to module scope with `DEFAULT_*` fallbacks.
- **HIGH — disposers shape / reload leak**: `Array<()=>void>` can't do per-dir `stop` and runtime watches would survive `/reload` and inject into the new session. → migrate to `Map<dir,()=>void>`; `disposeAll()` clears all; T012 adds a reload-disposal smoke.
- **MED**: concrete `ParsedCommand` TS contract (T010 asserts each `kind`) · **replace** (don't double-register) the handler · **dedupe** arming the same dir · specify `list` format (+ T012 asserts it) · try-guard `compileWatch`/`WatchReconciler` via the `startWatch` helper · Risk row for T011 latent scope.
- **LOW**: Known-Limitations runtime-watch bullet (broken xref) · `index.test.ts` added to the Domain Manifest · AC-06 shutdown qualified (implicit via `persistent:false`) · T012 verifies `list` + the nonexistent-dir error path.

**Status**: stays **READY** — 0 CRITICAL; the 2 HIGH and all MEDIUM/LOW are resolved in-plan (T010–T012 are now buildable without guessing). Agent reports at `/tmp/pij-val-015c/{coherence,risk,thesis,forward-compat}.md`.

Overall: ⚠️→✅ VALIDATED WITH FIXES (real fan-out).
