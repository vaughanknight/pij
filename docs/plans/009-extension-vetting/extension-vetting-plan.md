# Supply-Chain Vetting for the Package Manifest — Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-05-15
**Spec**: [extension-vetting-spec.md](./extension-vetting-spec.md)
**Dossier**: [research-dossier.md](./research-dossier.md)
**Workshop**: [workshops/001-prompt-injection-rules.md](./workshops/001-prompt-injection-rules.md) (rubric for novel-validation agent)
**Status**: DRAFT

---

## Summary

Add a vetter pipeline to pij's `pkg` CLI that screens every third-party pi extension before it lands in `.pi/packages.yaml` or is installed by `pkg bootstrap`. The pipeline combines four deterministic Tier-1 code-vetters (npm-audit, lockfile-lint, OpenSSF Scorecard, GitHub-trust) with a minih agent (`agents/package-vetter/`) that applies the workshop-001 rubric to extension markdown and tool descriptions via LLM judgment. Each manifest entry carries a `vetted: { date, score }` block; stale (>30d) or missing blocks cause `pkg bootstrap` to refuse without `--unsafe`. AGENTS.md gains a "Security protocol" section documenting the `requires.install` shell vector.

---

## Target Domains

Pij has a domain registry ([`docs/domains/registry.md`](../../domains/registry.md)). This plan modifies the existing `extension-authoring-harness` domain and consumes contracts from `agent-tooling-interface`. No new domain formalised (Simple Mode) — see spec § Target Domains "Extraction note" for the future-extraction path.

| Domain | Status | Relationship | Role |
|---|---|---|---|
| `extension-authoring-harness` | existing (registered; Primary Doc = `docs/project-rules/harness.md`) | **modify** | `harness/scripts/packages.ts` gains `vet`/`audit` subcommands; new `harness/scripts/vetters/*` modules; new `agents/package-vetter/` minih pack; `self-check` gains a `pkg audit` step; `harness.md` History row appended; AGENTS.md + RUNBOOK updated |
| `agent-tooling-interface` | existing (registered) | **consume** | Vetters + agent scan SKILL.md / AGENTS.md / tool-description surfaces this domain produces. No code changes inside this domain |
| `session-work-state` | existing (registered) | none | Unaffected — out of scope |

---

## Domain Manifest

Absolute paths; all files live inside the implicit `harness` domain unless noted.

| File | Classification | Action | Rationale |
|---|---|---|---|
| `/Users/jordanknight/pi-hacking/pij/harness/scripts/packages.ts` | internal | modify | Extend `Entry` with `vetted:`; add `cmdVet`, `cmdAudit`; gate `cmdAdd` + `cmdBootstrap` on Verdict |
| `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/types.ts` | contract | new | `Verdict`, `Finding`, `Vetter` interface — the contract every vetter implements |
| `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/npm-audit.ts` | internal | new | Wraps `npm audit --json` over the installed package tree |
| `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/lockfile-lint.ts` | internal | new | Wraps `npx lockfile-lint` for registry-host + integrity policy |
| `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/scorecard.ts` | internal | new | Fetches `https://api.scorecard.dev/projects/<platform>/<name>`; fail-soft on outage |
| `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/github-trust.ts` | internal | new | `gh api repos/<owner>/<repo>` — age, stars, last commit, license presence |
| `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/agent.ts` | internal | new | Adapter that invokes the minih agent pack and parses its JSON report into `Verdict` |
| `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/aggregate.ts` | internal | new | Composes per-vetter Verdicts → overall `level` per `Verdict.level` rules |
| `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/__fixtures__/` | internal | new (dir) | Captured JSON from real `npm audit` / `lockfile-lint` / Scorecard responses for offline tests |
| `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/*.test.ts` | internal | new | Vitest unit tests for each vetter; fixture-driven |
| `/Users/jordanknight/pi-hacking/pij/agents/package-vetter/` | internal | new (dir) | minih pack: briefing prompts the workshop-001 rubric; run script reads package tree, emits Verdict JSON |
| `/Users/jordanknight/pi-hacking/pij/agents/package-vetter/__snapshots__/` | internal | new (dir) | Snapshot verdicts for the 4 currently-installed packages — regression suite for AC-05 |
| `/Users/jordanknight/pi-hacking/pij/.pi/packages.yaml` | internal | modify | Comment header documents `vetted:` field shape; existing 4 entries gain `vetted: { date, score }` blocks (T05) |
| `/Users/jordanknight/pi-hacking/pij/package.json` | internal | modify | `self-check` script gains `npm run pkg audit` step (T06) |
| `/Users/jordanknight/pi-hacking/pij/RUNBOOK.md` | internal | modify | New "Vetting third-party extensions" section; updated New-machine recipe (T06) |
| `/Users/jordanknight/pi-hacking/pij/AGENTS.md` | internal | modify | New "Security protocol" section per AC-07 (T06) |
| `/Users/jordanknight/pi-hacking/pij/docs/project-rules/harness.md` | contract | modify | History row 2026-05-15 appended naming the vetter gate; no contract change to BIO maturity (T06) |
| `/Users/jordanknight/pi-hacking/pij/docs/domains/registry.md` | contract | modify | History row appended for Plan 009 vetter capability inside `extension-authoring-harness` (T06) |
| `/Users/jordanknight/pi-hacking/pij/docs/domains/domain-map.md` | contract | modify | Add vetter gate as a sub-capability of `extension-authoring-harness`; add edge to `agent-tooling-interface` (consume = scanned); History row (T06) |

---

## Key Findings

Distilled from the dossier (no new research subagents needed — dossier + workshop are authoritative).

| # | Impact | Finding | Action |
|---|---|---|---|
| F-01 | **Critical** | **CD-02**: Transitive pi-extensions install silently — `pi-subagents` is loaded today without a manifest entry. The vetter MUST walk `pi list` output, not just the yaml line. | T03 agent + T04 aggregator iterate every `pi list` row; cross-check vs manifest in T04 |
| F-02 | High | **CD-04**: `requires.install` is a shell-injection vector via the manifest. Trusted-by-design but undocumented today. | T06 adds AGENTS.md Security protocol section (AC-07) |
| F-03 | High | OpenSSF Scorecard returns 404 for any package not in their indexed set (most small pi extensions). | Scorecard vetter must fail-soft: 404 → `info` finding, not `warn`/`fail`; cache last-known on success |
| F-04 | High | Pi's session-start auto-install reads `.pi/settings.json#packages[]` and bypasses `pkg bootstrap` entirely. | Documented as known limitation (Q-OQ-A); no fix in v1. RUNBOOK should mention it. |
| F-05 | High | minih agent non-determinism: same package may produce slightly different findings across runs. | AC-05 accepts ≤1 finding drift + same `level`; snapshot suite is the regression gate; rubric checksum stored in `vetted.agentRubric` (Q-OQ-B) |
| F-06 | Medium | Vetter latency budget: full `pkg vet` of one package must stay <30s (per RA-6); `pkg audit` of all 4 <2min. | Each vetter's test asserts <5s wall time on fixture; agent test budgets 20s |
| F-07 | Medium | GitHub API rate limit — 60/hr unauthenticated, 5000/hr with `GH_TOKEN`. | `github-trust` vetter checks `GH_TOKEN` env on startup; warns if unset |

---

## Agent Harness Strategy

- **Current Maturity**: L2 (per [`docs/project-rules/harness.md`](../../project-rules/harness.md))
- **Target Maturity**: L2 (no change — this plan reuses the existing BIO contract)
- **Boot Command**: `npm install`
- **Health Check**: `npm run self-check` (which gains a `pkg audit` step at T06)
- **Interaction Model**: Terminal (CLI subcommands: `pkg vet`, `pkg audit`, `pkg add`, `pkg bootstrap`)
- **Evidence Capture**: JSON via `--json` flag; stderr override log
- **Pre-Phase Validation**: This is a single-phase plan; run `npm run self-check && npm run pkg audit` at start and finish.

The minih agent (`agents/package-vetter/`) is itself a Boot/Interact/Observe-style harness for the validation question: boot = read package tree, interact = LLM judgment against rubric, observe = JSON Verdict report.

---

## Implementation

**Objective**: Ship a vetter pipeline that gates `pkg add` and `pkg bootstrap` on a Verdict produced by four code-vetters plus a minih agent, with `vetted:` blocks recorded per manifest entry and a 30-day TTL.

**Testing Approach** (Hybrid, per spec):
- Tier-1 vetters: vitest unit tests against captured-JSON fixtures (deterministic, offline).
- minih agent: snapshot regression against the 4 currently-installed packages with real LLM calls. Snapshot updates require `--update-snapshots`.
- Aggregator: unit tests with stubbed per-vetter Verdicts.

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|---|---|---|---|---|---|---|
| [x] | T001 | **Schema + skeletons + types**. Extend `Entry` with optional `vetted: { date: string /* ISO8601 */; score: number /* 0-100 */; overrides?: string; agentRubric?: string /* sha256 hex */ }`. Define types in `vetters/types.ts`:<br/>`type Severity = "info" \| "warn" \| "fail";`<br/>`type Level = "ok" \| "warn" \| "fail";`<br/>`interface Finding { rule: string; msg: string; severity: Severity; file?: string; line?: number; col?: number; snippet?: string; context?: "fenced-code" \| "defensive-doc" \| "carve-out"; }`<br/>`interface Verdict { vetter: string; score: number; level: Level; findings: Finding[]; scannedFiles: number; durationMs: number; agentRubric?: string; }`<br/>`interface Vetter { name: string; vet(packagePath: string): Promise<Verdict>; }`<br/>Add `cmdVet` and `cmdAudit` stubs that print to stderr `vetter not yet implemented (T001 skeleton)` and exit 0. Document `vetted:` shape + each Verdict field in `.pi/packages.yaml` header comment. | extension-authoring-harness | `/Users/jordanknight/pi-hacking/pij/harness/scripts/packages.ts`, `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/types.ts`, `/Users/jordanknight/pi-hacking/pij/.pi/packages.yaml` | `npm run typecheck` passes; `pkg vet` and `pkg audit` print the no-op stderr message and exit 0; `Verdict` / `Finding` / `Vetter` / `Level` / `Severity` types are exported from `types.ts`. | CS-1. Foundation; field types are now concrete (closes FC contract gap). |
| [x] | T002 | **Four Tier-1 vetter modules**. Each exports `vet(packagePath: string): Promise<Verdict>`. `npm-audit.ts` shells out to `npm audit --json` in the installed pkg dir and maps `vulnerabilities.<severity>` → Verdict findings. `lockfile-lint.ts` shells out to `npx lockfile-lint --path package-lock.json --type npm --allowed-hosts npm --validate-https`. `scorecard.ts` fetches `https://api.scorecard.dev/projects/<platform>/<owner>/<name>`; 404 → `info`, network fail → `warn` (per F-03). `github-trust.ts` calls `gh api repos/<owner>/<repo>` and checks: repo age ≥30d, stars ≥1 (low signal, not gate), last commit ≤180d, LICENSE present. Each module has a `.test.ts` next to it using fixtures from `__fixtures__/`. | harness | `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/npm-audit.ts`, `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/lockfile-lint.ts`, `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/scorecard.ts`, `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/github-trust.ts`, `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/__fixtures__/`, `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/*.test.ts` | All four modules return a valid `Verdict`. Unit tests pass against captured fixtures. Each test asserts <5s wall time (F-06). Scorecard fail-soft on 404. github-trust warns when `GH_TOKEN` unset (F-07). | CS-2. Per F-03 Scorecard must fail-soft. |
| [x] | T003 | **Novel-validation minih agent pack + adapter**. Create `agents/package-vetter/` modelled on `agents/extension-validator/` shape (same `agent.json` + briefing + run-script layout). **Briefing contract**: `agents/package-vetter/briefing.md` enumerates all 7 rule categories from workshop 001 § Rule taxonomy verbatim (R-01 override, R-02 role hijack, R-03 chat-template smuggle, R-04 exfil, R-05 authority appeal, R-06 encoded smuggle, R-07 tool-desc smuggling), each with: intent, ≥2 example-fires, ≥1 example-doesn't-fire, severity, FP-mitigation policy. Severity ladder + context-aware downgrades (fenced code / defensive-doc) included as agent instructions. **Adapter contract**: `vetters/agent.ts` exports `async function vetWithAgent(packagePath: string): Promise<Verdict>`. Internally invokes the minih pack (e.g. `execFileSync("minih", ["run", "agents/package-vetter", "--input", JSON.stringify({ packagePath })])` — mirror whatever shell `agents/extension-validator/` uses) and parses stdout JSON into a `Verdict`. **Positive corpus**: `agents/package-vetter/corpus/positive/r{01..07}-*.md` — at least one synthetic attack per rule category, used by detection test. **Snapshot directory**: `agents/package-vetter/__snapshots__/{pi-mcp-adapter,pi-community-themes,pi-lean-ctx,pi-askuserquestion}.json` for stability regression. **Rubric checksum** (per F-05): SHA-256 of `briefing.md` content; stored in `Verdict.agentRubric`; mismatch on `pkg audit` triggers re-vet with stderr warning. | extension-authoring-harness | `/Users/jordanknight/pi-hacking/pij/agents/package-vetter/`, `/Users/jordanknight/pi-hacking/pij/agents/package-vetter/briefing.md`, `/Users/jordanknight/pi-hacking/pij/agents/package-vetter/corpus/positive/`, `/Users/jordanknight/pi-hacking/pij/agents/package-vetter/__snapshots__/`, `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/agent.ts`, `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/agent.test.ts` | **Detection (AC-05a)**: agent classifies ≥6/7 positive-corpus files at intended `level` (warn or fail); 0 misclassified as `ok`. **Stability (AC-05b)**: snapshot test passes with same `level` + ≤1 finding drift across 3 consecutive runs on each of the 4 currently-installed packages. **Adapter shape**: `vetWithAgent(pkgPath).vetter === "agent"`; returns Verdict matching T001 types. Single invocation <20s wall time (F-06). Rubric checksum present in every Verdict. | CS-3 (raised from CS-2 — detection corpus + adapter contract + checksum logic + 4-package snapshot is more than the original CS-2 estimate). |
| [x] | T004 | **Aggregator + pipeline wiring + bootstrap gate + piList helper**. `aggregate.ts` exports `aggregate(verdicts: Verdict[]): Verdict` composing per-vetter findings into an overall `level`. Pipeline runs vetters in order: lockfile-lint → npm-audit → github-trust → scorecard → agent (short-circuit on `fail`). **`piList()` helper** (lives in `packages.ts`, mirrors `piRemove()` shape): `piList(): Promise<{ source: string; path: string }[]>` parses `pi list` output and returns structured entries; used by both `cmdVet` (single-entry resolve) and `cmdAudit` (full-tree walk + cross-check vs manifest per F-01 / AC-11). Modify `cmdAdd` to invoke aggregator before yaml write; refuse on `level: fail` unless `--unsafe`; on success record `vetted: { date, score, agentRubric }`. Modify `cmdBootstrap` to refuse any entry whose `vetted.date` is missing or >30d; `--unsafe` overrides. **`--unsafe` reason contract**: prompts user via `readline` for a reason; reason **required and non-empty** (≥1 char of non-whitespace); writes one stderr line in format `[unsafe] <ISO8601> <source> reason:<text>`; stores same string in `vetted.overrides`. Empty reason → refuse with exit 2 and message "override requires a reason". Add `--json` flag to both `cmdVet` and `cmdAudit` per AC-06 — emits aggregate `Verdict` JSON to stdout instead of human summary. | extension-authoring-harness | `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/aggregate.ts`, `/Users/jordanknight/pi-hacking/pij/harness/scripts/packages.ts` | `pkg add npm:pi-askuserquestion` runs full pipeline; on clean run writes `vetted:` block. Adding a synthetic failing package refuses without `--unsafe`. `pkg add --unsafe` with empty reason refuses; with reason writes both stderr line and `vetted.overrides`. `pkg bootstrap` on stale entry exits non-zero with message naming the offending source and the days-stale count. `pkg audit --json` emits aggregate Verdict array. AC-01, AC-02, AC-03, AC-06, AC-11 satisfied. | CS-2. Aggregator + helper + reason validation + `--json` are the central control point. |
| [x] | T005 | **Retro-vet currently-installed packages**. Run the pipeline against each of the four enabled entries. Record `vetted:` blocks in `.pi/packages.yaml`. **Contingency rules (per spec RA-1, non-negotiable)**: if any package returns `level: fail`, the package is **removed** from `.pi/packages.yaml` (not overridden) and the user is notified out-of-band. If any returns `level: warn`, the user is presented with the full findings via `pkg vet <source>` and must either accept-with-reason (records `vetted.overrides`) or remove. The override path is the same `--unsafe` flow from T004. No silent overrides; no empty reasons. | extension-authoring-harness | `/Users/jordanknight/pi-hacking/pij/.pi/packages.yaml` | All four enabled entries have a `vetted:` block. `npm run pkg audit` exits 0 (after any necessary removes or documented overrides). AC-04 satisfied. Any overrides have non-empty `vetted.overrides: "<reason>"`. | CS-1. Real exercise of the pipeline; the contingency rules pre-resolve the "what if it fails" branch. |
| [x] | T006 | **Docs + self-check integration + domain artefacts**. `package.json#scripts.self-check` chains `npm run pkg audit` after smoke. RUNBOOK gains a "Vetting third-party extensions" section explaining `pkg vet` / `pkg audit` / TTL / `--unsafe`. RUNBOOK's "New-machine recipe" updated to mention the gate. AGENTS.md gains a "Security protocol" section: (a) `requires.install` is a trusted-by-design shell vector — reviewer responsibility documented; (b) every `pkg add` must go through `pkg vet`; (c) `--unsafe` requires a written reason in `vetted.overrides`. Reference F-04 (pi auto-install bypass) as a known limitation. **Domain artefacts**: append History rows to `docs/domains/registry.md` and `docs/domains/domain-map.md` recording the new vetter capability inside `extension-authoring-harness` (and the `agent-tooling-interface` consume edge); append a History row to `docs/project-rules/harness.md` naming the new `pkg audit` gate. | extension-authoring-harness | `/Users/jordanknight/pi-hacking/pij/package.json`, `/Users/jordanknight/pi-hacking/pij/RUNBOOK.md`, `/Users/jordanknight/pi-hacking/pij/AGENTS.md`, `/Users/jordanknight/pi-hacking/pij/docs/project-rules/harness.md`, `/Users/jordanknight/pi-hacking/pij/docs/domains/registry.md`, `/Users/jordanknight/pi-hacking/pij/docs/domains/domain-map.md` | `npm run self-check` runs `pkg audit` as final step and exits 0. RUNBOOK explains every new command. AGENTS.md Security protocol section explicitly names `requires.install`. Registry + domain-map History rows appended for 2026-05-15 / Plan 009. harness.md History row appended. AC-07, AC-08, AC-09 satisfied. | CS-1. Docs-only; finalises the contract. |

**Total estimated complexity**: **CS-3** (medium) — Σ=7 (S=1, I=1, D=1, N=2, F=1, T=1). T003 raised to CS-3 individually after validation (positive corpus + adapter contract + checksum logic); total still CS-3 but at the upper end (Σ=7 / boundary).

---

### Acceptance Criteria

Pulled from spec; all must pass before plan is marked Complete.

- [ ] **AC-01**: `pkg add` runs full pipeline before write; refuses on `fail` without `--unsafe`; writes `vetted:` block on success
- [ ] **AC-02**: `pkg audit` runs pipeline across all enabled entries; exits **0** on all-ok, **2** on any warn-or-fail (warn-as-fail-exit per spec — keeps self-check binary)
- [ ] **AC-03**: `pkg bootstrap` refuses entries with missing or stale (>30d) `vetted.date`; `--unsafe` overrides only with non-empty user-supplied reason; reason written to stderr + `vetted.overrides`
- [ ] **AC-04**: All four currently-installed packages pass the pipeline at `level: ok` (retro-vet via T005, contingency rules apply)
- [ ] **AC-05a (detection)**: minih agent classifies ≥6/7 positive-corpus files at intended severity; 0 misclassified as `ok`
- [ ] **AC-05b (stability)**: minih agent returns stable verdicts (same `level`, ≤1 finding drift) on the 4 real packages across 3 consecutive runs
- [ ] **AC-06**: All vetters + agent return uniform `Verdict` shape; aggregate composes; `--json` produces machine-readable output
- [ ] **AC-07**: AGENTS.md "Security protocol" section documents `requires.install` as trusted-by-design shell vector
- [ ] **AC-08**: `npm run self-check` includes `pkg audit` and remains green
- [ ] **AC-09**: RUNBOOK "New-machine recipe" honours the gate
- [ ] **AC-10**: Vetters + agent walk full installed tree, not just manifest line (T004 aggregator iterates `pi list`)
- [ ] **AC-11**: `pkg audit` warns on any installed-but-unmanifested pi extension (F-01 / CD-02)

---

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| minih agent gives inconsistent verdicts on same package | Med | Med | Snapshot regression with ≤1 finding drift tolerance (AC-05); rubric checksum versioning (F-05) |
| Scorecard API returns 404 for most pi extensions (small projects) | High | Low | Fail-soft per F-03; 404 → `info`, not gate |
| GitHub API rate-limit hit during `pkg audit` | Med | Low | Use `GH_TOKEN` from shell env; warn at startup if unset (F-07); cache responses keyed by `<owner>/<repo>@<sha>` |
| Vetter latency exceeds budget | Low | Med | Per-vetter wall-time assertions in tests (F-06); aggregator short-circuits on `fail` |
| `requires.install` allowlist is a code regression risk | N/A | N/A | Document-only in v1; no code change |
| Pi session-start auto-install bypasses gate | High | Med | Documented as known limitation (F-04); pi-side fix deferred |
| `npm audit` finds CVEs in the four currently-installed packages | Med | Med | T005 surfaces them; user decides per-entry (override with reason vs remove) |
| Vetted entries go stale on every fresh clone | High | Low | `pkg audit` regenerates `vetted.date` when findings unchanged; 30d TTL is conservative |

---

### Constitution / Architecture Notes

- No `docs/project-rules/constitution.md` in pij — no formal constitution gate.
- No `docs/project-rules/architecture.md` in pij — no formal architecture gate.
- Existing `AGENTS.md` "Inherited from pi-mono" rules: no `any`, no inline imports, no `git add -A`, no `--no-verify`. All tasks respect these.
- Existing `AGENTS.md` P1–P10 patterns: vetter modules go under `harness/scripts/vetters/` (not `.pi/extensions/`), so the T2 layout convention (P1) doesn't apply — these are harness scripts, not pi extensions.

---

## Next Steps

1. ~~Run `/plan-4-complete-the-plan` to validate readiness.~~ ✅ Done 2026-05-15 — 2 HIGH (domain registry) fixed.
2. ~~Fix any High-impact findings.~~ ✅ Done.
3. ~~Run `/validate-v2` for cross-lens validation.~~ ✅ Done 2026-05-15 — 1 CRITICAL + 5 HIGH fixed; see Validation Record below.
4. ~~Implement: `/plan-6-v2-implement-phase`~~ ✅ Done 2026-05-15 — T001–T006 landed.
5. Close 4 HIGH findings from code-review agent run via [FX001](./fixes/FX001-audit-gate-hardening.md).

---

## Fixes

| ID | Created | Summary | Domain(s) | Status | Source |
|----|---------|---------|-----------|--------|--------|
| [FX001](./fixes/FX001-audit-gate-hardening.md) | 2026-05-15 | Audit-gate hardening — scoped overrides, unmanifested→warn, audit write-back, AC-05 live evidence | extension-authoring-harness (modify) | Proposed | code-review agent run `2026-05-15T16-35-28-225Z-409b` (4 HIGH findings) |

---

## Validation Record (2026-05-15)

### Validation Thesis

**Raison d'être**: Pij installs third-party pi extensions with zero pre-flight checks; pi extensions run with full user privileges and inject content into LLM context.

**Value claim**: Every manifest entry becomes gated by a Verdict-shaped pipeline; stale/missing vetting blocks `bootstrap` without `--unsafe`. Reproducibility without vetting → exposure portability — closed.

**Artifact promise**: A plan-6-executable sequence (T001-T006) with concrete file paths, measurable Done-When, and traceability back to spec ACs.

**Intended beneficiaries**: (1) implementor agent running plan-6; (2) operators on fresh-clone `pkg bootstrap`; (3) reviewers of future `pkg add` PRs.

**Proof target**: Implementation.

**Evidence standard**: Concrete absolute paths, measurable Done-When, ACs traceable to spec, alignment with workshop's agent-rubric pivot, dossier critical-discovery coverage.

**Thesis source**: `extension-vetting-spec.md` § Summary + § Goals; dossier CD-01..CD-04; workshop 001 § Pivot note.

**Thesis verdict (post-fix)**: Partially → **Advanced** — after fixes, AC-05 splits into detection (a) + stability (b); agent briefing now has explicit contract at `agents/package-vetter/briefing.md`; `--unsafe` reason now validated; T005 contingency for real failures pre-resolved per RA-1.

**Main thesis risk (residual)**: Detection corpus is synthetic; LLM judgment on real-world adversarial inputs not yet exercised. Mitigated by rubric checksum versioning + ability to expand corpus over time.

---

| Agent | Lenses Covered | Thesis Axes Covered | Issues | Verdict |
|-------|---------------|---------------------|--------|---------|
| Coherence + CS Challenge | Implementation Readiness, Edge Cases & Failures, Hidden Assumptions | Implementation Readiness, Evidence Sufficiency | 1 HIGH (T003 invocation), 5 MEDIUM, 2 LOW | 1 HIGH + 1 MEDIUM (CS) fixed |
| Risk Coverage | Hidden Assumptions, Edge Cases & Failures, Security & Privacy, Deployment & Ops | Evidence Sufficiency, Safety to Change | 3 HIGH (rubric brief, positive coverage, override governance), 2 MEDIUM | 3 HIGH fixed |
| Thesis Alignment | Thesis Alignment, Proof-Level Fit | Thesis Alignment, Evidence Sufficiency, Proof-Level Fit | 1 CRITICAL (stability ≠ detection), 2 HIGH (rubric specificity, T005 contingency), 2 MEDIUM, 1 LOW | 1 CRITICAL + 2 HIGH fixed |
| Forward-Compatibility | Forward-Compatibility, Integration & Ripple, Contract Integrity | Downstream Usefulness, Contract Integrity | 2 ❌ (Verdict types, exit-code contradiction), 11 ⚠️ | 2 ❌ + 1 ⚠️ (`--json`) fixed; 10 ⚠️ are doc nits for T006 |

### Forward-Compatibility Matrix (post-fix)

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| plan-6 implementor | Verdict / Finding shape with field types | encapsulation lockout | ✅ | T001 now defines `Severity`, `Level`, `Finding`, `Verdict`, `Vetter` interfaces inline with field types |
| plan-6 implementor | T003 agent invocation pattern | encapsulation lockout | ✅ | T003 specifies `vetWithAgent(packagePath): Promise<Verdict>` adapter contract and `execFileSync("minih", ["run", ...])` pattern mirroring existing pack |
| plan-6 implementor | T001 stub message exact text | contract drift | ✅ | T001 specifies stderr message `vetter not yet implemented (T001 skeleton)` and exit 0 |
| `pkg add` operator | Error contract on fail | shape mismatch | ⚠️ (advisory) | T004 specifies stderr line format `[unsafe] <ISO8601> <source> reason:<text>`; full UX wording for fail case still T006/RUNBOOK territory |
| `pkg bootstrap` operator | Error pointing format on stale | shape mismatch | ✅ | T004 Done-When: "exits non-zero with message naming the offending source and the days-stale count" |
| `npm run self-check` | Exit code vs AC-08 keep-green | contract drift | ✅ | AC-02 reconciled: warn-as-fail-exit (exit 2); explicit overrides via `--unsafe` flow are the only acceptable warn-to-pass path |
| `extension-authoring-harness` | Registry History row format | contract drift | ⚠️ (advisory) | T006 says "append History row"; row template would be tightening pass but not blocking |
| `agent-tooling-interface` | Scan-surface contract | contract drift | ✅ | T003 briefing.md cites workshop 001 § Scope priority order verbatim — implicit enumeration |

**Thesis alignment**: Plan now advances the value claim at Implementation proof level — detection (AC-05a) + stability (AC-05b) together prove the agent both catches injection AND is consistent; residual risk is real-world adversarial inputs vs synthetic corpus.

**Outcome alignment**: After fixes, the plan advances the VPO Outcome ("scans every third-party pi extension before it is installed or bootstrapped, recording a vetted: block") with closed contracts on the five previously-unspecified interfaces (Verdict shape, agent invocation, stub text, exit-code semantics, override reason validation) — `plan-6 implementor` can now execute without further clarification on the gate semantics.

**Standalone?**: No — multiple named downstream consumers (plan-6 implementor, pkg add/bootstrap operators, self-check chain, two registered domains).

**Overall**: ⚠️ **VALIDATED WITH FIXES** — 1 CRITICAL + 5 HIGH fixed; remaining MEDIUMs are doc-tightening for T006 phase or implementation-time concerns (scorecard source-parsing, GH_TOKEN CI policy, registry row templates, error message wording). None block plan-6 from starting.

---

## Post-Implementation Review + FX001 Close-Out (2026-05-15)

After plan-6 landed T001–T006, a `code-review` minih agent run (`agents/code-review/runs/2026-05-15T16-35-28-225Z-409b`) surfaced **4 HIGH correctness gaps** in the shipped gate — see the run's `report.json` for full text. Confidence ratings from the agent's `coverageMap`:

| AC | Pre-FX001 conf | Issue | Post-FX001 conf |
|----|---------------|-------|-----------------|
| AC-01 (gated add) | 0.55 | Pipeline gates exist but never proven with real agent | 0.85 (live regression in FX001-4) |
| AC-02 (audit exit) | 0.30 | Over-broad overrides + unmanifested ungated | **0.95** (FX001-1 + FX001-2) |
| AC-04 (4 packages ok) | 0.20 | Retro-vet ran with `PIJ_VET_SKIP_AGENT=1` | **0.90** (FX001-4 commits 3 runs/package + median, no skip) |
| AC-05a (detection ≥6/7) | **0.05** | Deferred — agent never run against corpus | **1.00** — 7/7 corpus rules detected (R-01..R-07 all classified `fail`) |
| AC-05b (stability ≤1 drift) | **0.05** | Deferred | **0.75** — 3/4 packages within drift target (mcp-adapter=1, themes=0, askuserquestion=0); pi-lean-ctx=2 exceeds. Real signal of agent stochasticity on text-heavy packages. |
| AC-10 (walks tree via `pi list`) | 0.25 | Unmanifested detected but not aggregated | **0.95** (FX001-2 `vetter:audit` Verdict) |
| AC-11 (cross-checks unmanifested) | 0.20 | Print-only | **0.95** (FX001-2) |
| AC-09 (fresh-machine recipe) | 0.40 | RUNBOOK says "rerun audit to refresh"; cmdAudit never wrote back | **0.95** (FX001-3 write-back) |

**FX001 surface** ([fixes/FX001-audit-gate-hardening.md](./fixes/FX001-audit-gate-hardening.md)):

| Sub | Closes | Commits | Note |
|-----|--------|---------|------|
| FX001-1 | F004 (override scope) | `eb1dc51` | Typed `{ rules, reason }`; single `parseOverrides()` reader; legacy form parses fail-safe |
| FX001-2 | F002 (unmanifested ungated) | `ee86023` | Synthetic `vetter:audit` Verdict with `source:"<audit:unmanifested>"` |
| FX001-3 | F001 (audit doesn't refresh) + F004-via-write-back | `0f9fa3b` | Write-back gated on RAW `verdict.level === "ok"`; in-place `YAMLMap.set()` preserves comments; `lineWidth:0` keeps long scalars unwrapped |
| FX001-4 | F003 (AC-05 deferred) | _(this commit)_ | 7 corpus + 12 package-run + 4 median snapshots; workshop-001 R-0N oracle cross-reference; opt-in live regression test; staleness alarm in self-check |
| FX001-5 | Encapsulation-lockout V1 from validate-v2 | _(this commit)_ | YAML schema-header + RUNBOOK document new override shape with worked example |

**Residual risk**: agent runtime is non-deterministic (LLM stochasticity); the AC-05b drift bound of ≤1 finding is **a soft target that real packages can exceed**. Empirically, 3/4 manifest packages met it on a single 3-run sweep; pi-lean-ctx came in at drift=2 — the agent sometimes flags one extra rule on text-heavy markdown trees. The recourse is documented (regenerate via `npm run snapshots:refresh`; review the median snapshot); the threshold may need to relax to ≤2 in a future spec revision based on more samples. Snapshot regeneration is owner-driven on rubric-hash change (alarmed by `snapshots:check` in `self-check`).
