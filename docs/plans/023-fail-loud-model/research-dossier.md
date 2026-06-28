# Research Dossier: fail-loud model resolution (pij models · spawn validation · daemon stalled/dead push)

**Generated**: 2026-06-28
**Query**: "Make pij model resolution fail loud: (1) pij models discovery across harnesses, (2) spawn-time --model validation, (3) daemon whole-life stalled/dead push to creator incl. bad-model first-inference 400. Research per-harness model registries (pi/claude/copilot/codex) and the exact 400 signal per harness."
**Effort**: Deep (3 parallel workers — pij-codebase trace · per-harness probe · institutional memory)
**Tools**: Standard
**Evidence**: 12 current sources · 4 historical sources

## Answer

1. **No model validation exists today** — `--model` is parsed and passed straight through to the harness CLI on both spawn paths; `cli.ts` itself admits the silent-fallback footgun in its help text (F-01).
2. **Discovery is wildly uneven across harnesses.** Only **pi** has a clean machine-readable registry (`~/.pi/agent/models.json`) *and* a native `--list-models` CLI (F-02). **codex** and **copilot** have **no local registry** (codex = config.toml default only; copilot fetches its list live from GitHub) (F-04, F-05). **claude** has an opaque `models_cache.json` and only exposes aliases (F-06). Usefully, pi's registry carries a **`github-copilot` provider section**, so it can partly seed copilot discovery (F-03).
3. **The bad-model error surface is NON-UNIFORM** — this is the single most important finding for detection. **claude** rejects a bad `--model` at **spawn-time to stderr** (`API Error: …`) *before the session boots*; **pi / codex / copilot** accept it silently and only fail on the **first inference**, logged in different places (session JSONL / rollout JSONL / `[ERROR]` logs) (F-07). One uniform detector will not work.
4. **The daemon already notifies the creator** (`spawnedBy`) on bind/fail during boot — `buildBoundNotice` / `buildFailedNotice` / `markFailed` / `notify` / `fail` (F-08). The whole-life heartbeat is an *extension* of this proven pattern, not new machinery.
5. **The two gaps are exact**: `observeActivity` is **mute** post-bind (no creator push on stall/dead — F-09), and **deterministic-bind binds the instant the pane is interactive without proving the first inference** — the bad-model hole for copilot/branched-claude (F-10). The detection primitive (`liveness()`) already shipped (F-11).
6. **The descriptor has no place to record *why* something died** (no `reason`/`error` field — F-12), and prior feedback requires surfacing the **bound** model, not the requested one (H-02). Both are additive schema changes.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | No spawn-time model validation; pass-through is admitted in help text | `.pi/extensions/pij/cli.ts:88-90`; `core/spawn.ts:66-98` (`buildSpawnCommand`, `--model` @68-69), `:224-263` (`buildControlSpawnCommand`, `--model` @245-246); parse @`spawn.ts:411-447` | Validation is a *new* hook at the CLI/spawn boundary; the value flows through one chokepoint per path | High |
| F-02 | **pi** has a clean registry + native list CLI | `~/.pi/agent/models.json` (providers→models: id/name/api/baseUrl/contextWindow/maxTokens) + `pi --list-models [search]` | pi discovery = parse the JSON (or shell `--list-models`); the gold-standard case, build it first | High |
| F-03 | pi's registry also lists a **`github-copilot`** provider section | `~/.pi/agent/models.json` (provider: github-copilot) | pi's JSON can *seed* copilot discovery — partial mitigation for copilot's missing registry | Medium |
| F-04 | **codex** has no registry and no list command | `~/.codex/config.toml` (`model="gpt-5.5"`); `codex --help` has no `models` subcommand | codex discovery must hardcode a snapshot or scrape recent rollouts — flag as a decision | High |
| F-05 | **copilot** fetches its model list **live from GitHub**; no local registry | `~/.copilot/settings.json` (active only); logs show `"Successfully listed 34 models"` at DEBUG | copilot discovery = hardcoded snapshot (seedable from F-03) or a live probe; staleness risk | High |
| F-06 | **claude** registry is opaque; only aliases exposed | `~/.claude/models_cache.json` (exists ~178KB, unreadable format); `~/.claude/settings.json` active alias only; no `models` subcommand | claude discovery likely alias-list only (sonnet/opus/haiku/fable + known full ids) | Medium |
| F-07 | **Bad-model error surface is non-uniform** | claude → **stderr at spawn** (`API Error: …`, pre-boot); pi → session JSONL `"isError":true`; codex → rollout JSONL error events / `rate_limits.has_credits:false`; copilot → `~/.copilot/logs/*` `[ERROR]` | **Per-harness detection adapters**, not one detector. claude is catchable at *spawn*; the rest only at *first inference* | High |
| F-08 | Daemon already pushes creator notices on bind/fail during boot | `core/binding.ts:104-110` (`buildBoundNotice`), `:113-122` (`buildFailedNotice`), `:34-36` (`markFailed`); `core/daemon/loop.ts:77-79` (`notify`), `:240-254` (`fail`) | The whole-life heartbeat reuses this exact pattern — extend, don't invent | High |
| F-09 | `observeActivity` is mute post-bind — updates state, never pushes to creator | `core/daemon/loop.ts:97-111` | The stall/dead push hooks in here (or a sibling) — compute liveness transition, then `notify(spawnedBy)` | High |
| F-10 | Deterministic-bind binds on pane-interactive **without proving first inference** | `core/daemon/loop.ts:185-200` (`plannedHarnessSessionId` path; comment "binds the instant the pane is interactive") | The bad-model hole for copilot/branched-claude — needs a functional first-inference gate before "healthy" | High |
| F-11 | The liveness detection primitive already shipped | `core/state.ts:33-42` (`liveness(pidAlive, ageMs, staleAfter, working)`), `:59-66` (`isStalled`), `:7` (`STALE_AFTER_MS=60_000`) | "Detect stalled/dead" = wire a push when this verdict flips for a bound session; logic exists | High |
| F-12 | No `reason`/`error` field on `SessionDescriptor` | `core/types.ts:34-90` (fields: id, spawnedBy, state, lastEventAt, plannedHarnessSessionId, pid, paneId); `SessionLifecycle = pending\|ready\|bound\|failed` @24 | Add a machine-stable `failureReason?` (+ likely `boundModel?`) additively so `pij state`/`list` can surface it | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability | Implication |
|----|---------------------------|--------|---------------|-------------|
| H-01 | All three asks (pij models, fail-loud `--model`, daemon push) are already documented as the **top two themes** of control-plane dogfooding | `docs/plans/019-pij-tmux-control-plane/control-plane-feedback.md` §§1,3 + "Overall" | **Direct** | This plan IS the #1 recorded theme — no need to re-justify; lift the framing from there |
| H-02 | Surface the **bound** model, not the requested one (else `--model glm-5.2` shows while GPT-5.5 runs — amplifies the bug) | `019/control-plane-feedback.md` §1 ("record the **bound** model") | **Direct** | Add `boundModel?` to descriptor; daemon reads footer/ready-ping → bound; requested≠bound → warn or bind-fail |
| H-03 | Immovable invariants: spawn **returns id immediately** (never blocks on bind/network); pure core / impure adapter; deterministic vs discovery bind; harness-agnostic spawn | Plans 019 (AC-01/02), 020 (AC-02/03), 021 (AC-01), 022 (AC-02) | **Direct** | Spawn-time validation must **warn/suggest, not block** spawn; classifiers must be pure; detection lives in the daemon, name-validation at the CLI |
| H-04 | **No auto-heal** — truly-dead routes to the human; the daemon only notifies | `023/original-ask.md`; consistent w/ 019 notify design | **Direct** | No retry/fallback-substitution machinery; death push → human assists |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| codex + copilot have **no clean registry** | F-04, F-05 | `pij models` can't be uniform; hardcoded snapshots go stale | Decision at plan: snapshot (seed copilot from F-03) vs live-probe vs "pi-first, best-effort others" |
| claude `models_cache.json` is **unreadable/opaque** | F-06 | claude discovery may be alias-only | Accept alias-list for claude; don't reverse-engineer the cache |
| Exact "model not supported" 400 string **not captured live** (no recent failures) | F-07 (no 400s in sampled sessions) | Detector pattern must be robust without a golden string | Pattern broadly (status 400/429 + `isError`/error-event) per harness; POC by inducing one bad spawn |
| claude's error is at **spawn-stderr**, not first-inference | F-07 | Breaks the "uniform first-inference gate" assumption | claude gets a *spawn-time* stderr catch; others get a *first-inference* daemon gate |

## Planning Handoff

- **Preserve**: spawn **returns the pij-id immediately** (validation never blocks — H-03); pure-core/impure-adapter split (classifiers pure, tmux/fs/process injected); harness-agnostic spawn core; the existing `notify`/`buildBoundNotice`/`buildFailedNotice` creator-push pattern (F-08); the shipped `liveness()` primitive (F-11); deterministic-bind's no-wait behavior (F-10 — add a *gate*, don't reintroduce a blocking wait).
- **Change carefully**: `SessionDescriptor` schema — add `boundModel?` + `failureReason?` **additively** (F-12, H-02); the deterministic-bind path (F-10) — a first-inference health gate must not regress the fast-bind for *good* models.
- **Likely files/symbols**: a new model-registry adapter (`core/models/*` — read `~/.pi/agent/models.json`, fuzzy match) + per-harness discovery strategy; `cli.ts` (new `pij models` verb + wire spawn-time name validation, ≈`:88-90`); `core/spawn.ts` (validation hook at parse, F-01); `core/daemon/loop.ts` (`observeActivity` push @`:97-111`; first-inference gate @`:185-200`); `core/binding.ts` (`buildStalledNotice`/`buildDeadNotice` + reason, beside `:104-122`); `core/types.ts` (new fields, `:34-90`); reuse `core/state.ts` `liveness()`.
- **Decisions still required**:
  1. **Discovery strategy per harness** — pi (registry, easy); copilot (snapshot seeded from pi's github-copilot section vs live-probe); codex (snapshot vs scrape); claude (alias-list). Pi-first, others best-effort?
  2. **Detection split** — claude = spawn-time stderr catch; pi/codex/copilot = first-inference daemon gate (per-harness adapters, F-07).
  3. **Validation posture** — warn-and-suggest (fuzzy closest id) vs hard-reject on unknown `--model`. H-03 says **don't block spawn**; likely warn + suggest, reject only on an empty-after-fuzzy miss.
  4. **boundModel source** — footer capture vs ready-ping vs transcript (H-02).
  5. **Death-push shape** — reuse `notify(spawnedBy, …)` with a machine-stable `failureReason` (`model-not-supported`/`auth`/`quota`/`stalled`/`dead`/`unknown`); truly-dead → relay to human (H-04).

## External Research
_None material — every open question is answerable from the repo, the local harness configs, or a one-off induced-failure POC._
