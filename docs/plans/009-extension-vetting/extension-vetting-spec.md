# Supply-Chain Vetting for the Package Manifest

**Mode**: Simple (clarified 2026-05-15) — single-phase plan with inline tasks; plan-4/plan-5 optional.

📚 This specification incorporates findings from [`research-dossier.md`](./research-dossier.md) and [`workshops/001-prompt-injection-rules.md`](./workshops/001-prompt-injection-rules.md).

ℹ️ Pij has a domain registry ([`docs/domains/registry.md`](../../domains/registry.md)). This plan modifies the existing `extension-authoring-harness` domain (no new domain formalised — Simple Mode); `agent-tooling-interface` is consumed (its surfaces — markdown + tool descriptions — are what the vetter scans). Future extraction of `extension-vetting` as a discrete domain is a natural next step but deferred.

---

## Research Context

The dossier established the threat model (4 vectors: lifecycle scripts, runtime code, prompt-injection via assets, transitive CVEs), surveyed the May 2026 tool landscape (Socket.dev, OpenSSF Scorecard, npm audit, lockfile-lint, Snyk, Semgrep), and identified **four critical discoveries**:

- **CD-01**: Pij installs are currently un-vetted. Four enabled entries today, zero pre-install checks.
- **CD-02**: Transitive pi-extensions install silently (e.g. `pi-subagents` appeared without manifest entry).
- **CD-03**: No prompt-injection scanner for markdown/tool-descriptions exists in May 2026 — pij is carving new ground.
- **CD-04**: The `requires.install` field is itself a shell-injection vector via the manifest.

The workshop (`001-prompt-injection-rules.md`) reached **Contract Ready** for the prompt-injection scanner: 7 rule categories with regex, severity ladder, FP-mitigation policy, `Verdict`/`Finding` types, CLI shape, golden corpus shape (9/10 positive + 7/7 negative acceptance target), and rule-evolution policy.

---

## Summary

**WHAT**: A vetter pipeline integrated into pij's package-manifest tooling that scans every third-party pi extension *before* it is installed or bootstrapped, recording a `vetted:` block on each manifest entry. The pipeline runs both cheap offline checks (npm audit, lockfile-lint, GitHub trust signals) and richer optional checks (Socket.dev behavioural analysis, prompt-injection scanning over extension markdown and tool descriptions).

**WHY**: Pi extensions run with the user's full system privileges (no sandbox), and their `SKILL.md` / `AGENTS.md` / tool descriptions load directly into the LLM context. Pij currently installs four such extensions with no vetting — a Shai-Hulud-style worm or a malicious tool description would have unrestricted access. The harness already insists on cross-machine reproducibility (`pkg bootstrap`); reproducibility without vetting just makes the supply-chain exposure portable.

---

## Goals

- Every entry in `.pi/packages.yaml` either has a recent `vetted:` block or is explicitly marked unsafe with a documented reason.
- `npm run pkg add <source>` automatically vets the candidate, prints findings, and refuses on `fail` (without `--unsafe`).
- `npm run pkg bootstrap` on a fresh clone refuses to install stale/un-vetted entries (without `--unsafe`).
- `npm run pkg audit` re-runs the pipeline across the whole manifest; exits non-zero on `fail`; suitable for `self-check` and CI.
- Vetter results compose: each vetter returns a uniform `Verdict`; aggregate `level` gates the install decision.
- Prompt-injection scanner (per workshop) meets its acceptance target: **9/10 positive + 7/7 negative** on the golden corpus, including zero false positives on the four currently-installed real packages.
- New rules can be added via a documented 5-step process (workshop edit → corpus addition → regression run → review → ship) without breaking previously-vetted entries.
- A reviewer or agent can read `pkg vet` output and decide accept/reject without further triage.
- The trust assumption around `requires.install` is **documented as a project rule** in `AGENTS.md`.

---

## Non-Goals

- **Not building a sandbox** (Docker, bubblewrap, devcontainer profiles). Sandboxing is layered defence the user can add externally; pij's job is *scan*, not *isolate*.
- **Not vetting pij's own extensions** under `.pi/extensions/`. Those are PR-reviewed by definition.
- **Not vetting MCP servers** in `.mcp.json` (different surface, different threat model — could be a sibling effort later).
- **Not building a UI**. CLI-only; output is text + JSON.
- **Not signing or publishing pij's own packages**. Producer-side supply-chain hygiene is out of scope.
- **Not auto-installing security patches**. The vetter is read-only; users opt into upgrades manually.
- **Not blocking pi's own session-start auto-install** of `.pi/settings.json#packages[]`. That bypass is documented as a known gap (Q-OPEN); closing it would require a pi-side extension, which is a separate effort.
- **Not running the scanner inside the LLM**. The scanner is deterministic regex + API calls — no model-in-the-loop in v1.

---

## Target Domains

Simple Mode → no new domain formalised. Work modifies the existing `extension-authoring-harness` domain (per registry) and consumes contracts from `agent-tooling-interface`. The `extension-vetting` concept is large enough that future extraction as its own domain is a natural next step; for v1 it's a new capability *within* `extension-authoring-harness`.

| Domain | Status | Relationship | Role in This Feature |
|---|---|---|---|
| `extension-authoring-harness` | existing (registered) | **modify** | `harness/scripts/packages.ts` gains `vet`/`audit` subcommands; new `harness/scripts/vetters/*.ts` modules; new `agents/package-vetter/` minih agent pack; `self-check` gains a `pkg audit` step; harness.md History row appended |
| `agent-tooling-interface` | existing (registered) | **consume** | Vetters + agent scan the surfaces this domain produces (SKILL.md, AGENTS.md, tool descriptions). No code changes inside this domain; the consume relationship is documentation/test-time only |
| `session-work-state` | existing (registered) | none | Unaffected — vetter pipeline does not touch session-scoped state |

**Extraction note**: If a future plan needs `extension-vetting` as a stand-alone domain (e.g. to compose with MCP vetting, sandbox layering, or CI integration), the contracts `Verdict` / `Finding` / `Vetter` and the `vetted:` manifest field are the natural extraction surface. See plan 009 for the v1 placement decision.

---

## Complexity

- **Score**: CS-3 (medium) — downgraded from CS-4 by clarifications: Simple Mode + minih agent absorbs the in-code prompt-injection scanner + no Tier-2 vetters in v1.
- **Breakdown**: S=1, I=1, D=1, N=1, F=1, T=1 (Σ=6)
- **Confidence**: 0.75
- **Assumptions**:
  - OpenSSF Scorecard API (`api.scorecard.dev`) remains free and stable.
  - npm audit's CVE coverage continues to be NVD-driven and not gated.
  - `pi install` is run by `bootstrap` rather than by pi itself for the gating to bite (currently the case).
  - The minih agent infrastructure (`agents/extension-validator/`) is reusable for the novel-validation pack.
  - LLM judgment is "good enough" for the novel/prompt-injection-style checks; non-determinism is acceptable with snapshot-based regression checks.
- **Dependencies**:
  - External tool availability: `npm`, `gh`, `curl` (already in pij dev env)
  - GitHub API quota for trust signals (5000/hr with `GH_TOKEN` from `~/.zshrc`)
  - LLM API access for the minih agent (existing pij infra)
- **Risks**:
  - **R1**: minih agent gives inconsistent verdicts on the same package across runs. **Mitigation**: snapshot regression against the 4 currently-installed packages; agent prompt is versioned and changes require corpus re-run.
  - **R2**: Pi's session-start auto-install bypasses `pkg bootstrap` entirely. **Mitigation**: documented as known limitation (CD-02); long-term fix is a pi-side extension (deferred).
  - **R3**: Vetted entries go stale on every fresh clone → `bootstrap` becomes annoying. **Mitigation**: `pkg audit` regenerates `vetted.date` if findings unchanged.
  - **R4**: Scorecard API outage → vetter flaky. **Mitigation**: cache last-known score; fail-soft (warn) on fetch failure.
- **Phase structure** (Simple Mode = single phase with inline tasks):
  - **Phase 1**: Tier-1 vetter pipeline + novel-validation minih agent + bootstrap gate. Tasks T01–T06 enumerated under § Tasks below.

### Tasks (inline, Simple Mode)

| ID | Task | CS |
|---|---|---|
| T01 | Extend `Entry` schema with `vetted: { date, score, overrides? }`; stub `pkg vet` and `pkg audit` subcommands; define `Verdict` / `Finding` types in `harness/scripts/vetters/types.ts` | CS-1 |
| T02 | Author the four Tier-1 vetter modules under `harness/scripts/vetters/`: `npm-audit.ts`, `lockfile-lint.ts`, `scorecard.ts`, `github-trust.ts`. Each returns a `Verdict`. Aggregate in `pkg vet` | CS-2 |
| T03 | Author the novel-validation minih agent pack — reuse `agents/extension-validator/` shape. Rubric draws from workshop 001's rule taxonomy as a brief (not regex). Agent reads installed package tree, makes LLM judgment, returns a `Verdict`-shaped report | CS-2 |
| T04 | `pkg add` runs full pipeline (Tier-1 vetters + agent); refuses on `level: fail` without `--unsafe`; writes `vetted:` block on success. `pkg bootstrap` enforces TTL (30d) + freshness gate; `--unsafe` overrides with stderr log + `vetted.overrides` field | CS-2 |
| T05 | Retro-vet the four currently-installed packages (`pi-mcp-adapter`, `pi-community-themes`, `pi-lean-ctx`, `pi-askuserquestion`); record `vetted:` blocks in `.pi/packages.yaml`. If any fails, document override or remove | CS-1 |
| T06 | Wire `pkg audit` into `npm run self-check`; update RUNBOOK with new commands + new-machine recipe; add "Security protocol" section to AGENTS.md documenting `requires.install` as trusted-by-design vector | CS-1 |

---

## Acceptance Criteria

1. **AC-01 — vet on add**: `npm run pkg add <new-source>` invokes the full pipeline (Tier-1 vetters + novel-validation agent) before writing the manifest entry. On `level: fail` the entry is NOT written unless `--unsafe` is passed; on success, the entry gets a `vetted: { date, score }` block.

2. **AC-02 — audit subcommand**: `npm run pkg audit` runs the pipeline against every enabled entry, prints a per-entry summary. Exit codes: **0** only if all return `level: ok`; **2** on any `fail`; **`warn` is treated as fail for the exit code** (also exit 2). Rationale: AC-08 (`self-check` stays green) requires a clean binary signal — warn-as-pass would let degradation accumulate silently. To explicitly accept a warn, the entry must carry `vetted.overrides` (per AC-03's `--unsafe` flow), at which point the vetter re-runs and the warn is gone or recorded with reason.

3. **AC-03 — bootstrap gate**: `npm run pkg bootstrap` refuses to install any entry whose `vetted.date` is missing or older than 30 days. `--unsafe` overrides; the override is logged to stderr and to the manifest's `vetted.overrides` field.

4. **AC-04 — currently-installed pass**: All four current entries (`pi-mcp-adapter`, `pi-community-themes`, `pi-lean-ctx`, `pi-askuserquestion`) pass the full pipeline at `level: ok` after MVP ships. If any returns `warn`/`fail`, either the entry is removed or carries a documented `vetted.overrides`.

5. **AC-05 — novel-validation agent (detection + stability)**: The minih agent at `agents/package-vetter/` reads an installed package tree, applies the workshop-001 rubric via LLM judgment, and returns a `Verdict`-shaped report. **Two-part acceptance**:
   - **(a) Detection**: agent correctly classifies a synthetic positive corpus exercising each of R-01..R-07 at intended severity. Acceptance: ≥6/7 categories detected at intended `level` (warn or fail per rule); 0 categories misclassified as `ok`. Corpus lives at `agents/package-vetter/corpus/positive/r{01..07}-*.md` and is versioned alongside the agent briefing.
   - **(b) Stability**: agent returns stable verdicts on the 4 currently-installed real packages — same `level` + ≤1 finding drift across 3 consecutive runs.

   Stability alone is insufficient — detection on the positive corpus must also pass for AC-05 to be considered met.

6. **AC-06 — Verdict contract**: Every vetter and the agent return the uniform `Verdict` shape (`vetter`, `score`, `level`, `findings`, `scannedFiles`, `durationMs`); `pkg vet` / `pkg audit` aggregate composes Verdicts and can be requested as JSON via `--json`.

7. **AC-07 — `requires.install` documented**: AGENTS.md gains a "Security protocol" section naming `requires.install` as a trusted-by-design shell-injection vector and the reviewer responsibilities that follow.

8. **AC-08 — self-check integration**: `npm run self-check` includes a `pkg audit` step. The four currently-installed entries keep `self-check` green.

9. **AC-09 — fresh-machine recipe**: RUNBOOK's "New-machine recipe" updated so `npm run pkg bootstrap` honours the gate. A user who clones and runs `npm install && npm run pkg bootstrap` either ends up with a vetted environment or with an explicit error pointing at the offending entry.

10. **AC-10 — transitive surfaces scanned**: Vetters + agent walk the full installed package tree (including transitively-pulled pi extensions like `pi-subagents`), not just the manifest line. `level` aggregates across the tree.

11. **AC-11 — `pi list` cross-check**: `pkg audit` cross-references its scan target against `pi list` output and warns about any installed-but-unmanifested pi extension. (Closes the loop on CD-02.)

---

## Risks & Assumptions

| ID | Type | Statement |
|---|---|---|
| RA-1 | Assumption | The four currently-installed packages are in fact safe (no known incidents). If retro-vet finds a true positive, the affected package is removed/replaced, not whitelisted. |
| RA-2 | Assumption | Pi's session-start auto-install is the only out-of-band install path. Users who hand-edit `.pi/settings.json` accept the bypass. |
| RA-3 | Risk | Socket.dev's free-tier policy could change. Pipeline degrades gracefully without it. |
| RA-4 | Risk | OpenSSF Scorecard API rate-limits or goes offline. Cache last-known score per package; fail-soft (warn) on fetch failure. |
| RA-5 | Risk | Prompt-injection scanner produces unfixable FPs on a real package the user actually wants. The workshop's context filters are the first line of defence; the `--unsafe` + `vetted.overrides` mechanism is the escape hatch. |
| RA-6 | Risk | Vetter latency exceeds user patience (target: full `pkg vet` of one package under 30 s; `pkg audit` of all 4 under 2 min). |
| RA-7 | Assumption | Reproducibility comes before convenience. A `bootstrap` that refuses a stale entry is a feature, not a bug. |
| RA-8 | Risk | `requires.install` allowlist (if added) breaks legitimate installer commands. Ship advisory-only first. |

---

## Clarifications

### Session 2026-05-15

- **Workflow Mode**: Simple — single-phase plan with inline tasks; plan-4/plan-5 optional; testing gate optional.
- **MVP scope**: Tier-1 code-vetters (npm-audit + lockfile-lint + Scorecard + github-trust + bootstrap gate + AGENTS docs) **plus** a minih agent for the novel-validation piece (replaces in-code prompt-injection regex scanner). Workshop 001's rule taxonomy becomes the agent's brief, not its code.
- **Fail policy**: Refuse outright on `level: fail`; `--unsafe` overrides with recorded reason in `vetted.overrides` + stderr log.
- **Vet TTL**: 30 days fixed. `pkg audit` regenerates `vetted.date` when findings unchanged.
- **Testing**: Hybrid — real captured-JSON fixtures for deterministic vetters; agent runs against the 4 currently-installed packages with snapshot regression checks.
- **Agent inputs**: Real LLM calls + real package tree in both production and tests. Captured outputs serve as regression snapshots; same `level` + ≤1 finding drift is acceptable.
- **Documentation**: RUNBOOK + AGENTS.md updates only (current pij convention). No new `docs/how/` file unless growth demands it.
- **`requires.install` enforcement**: Document-only for v1. AGENTS.md Security protocol names the vector; no allowlist code.

## Open Questions

Most prior open questions resolved by clarifications. Remaining:

1. **OQ-A (transitive scanning depth)**: Scan only what `pi list` enumerates, or walk every transitive npm dep too? *Lean: `pi list` + immediate npm deps; full transitive walk deferred. Decide during T03 design.*
2. **OQ-B (agent prompt versioning)**: How is the minih agent's rubric versioned? Each prompt change re-runs the snapshot suite. *Lean: rubric file checksum stored in `vetted.agentRubric` field; mismatch on `pkg audit` triggers re-vet.*
3. **OQ-C (CI environment for `pkg audit`)**: Offline-only subset for CI (skip Scorecard + agent)? Pij has no CI today, so deferred until CI exists.

---

## Testing Strategy

**Approach**: Hybrid

- **Tier-1 vetters** (npm-audit, lockfile-lint, scorecard, github-trust): real captured-JSON fixtures committed under `harness/scripts/vetters/__fixtures__/`. Unit tests assert `Verdict` shape and `level` derivation against the fixtures. No live network in tests.
- **Novel-validation minih agent**: integration tests run the agent against the 4 currently-installed package trees with real LLM calls; assertions are snapshot-based (same `level`, ≤1 finding drift). Snapshot updates require explicit `--update-snapshots`.
- **Aggregator** (`pkg vet` / `pkg audit` composition): integration tests with a mock manifest and stubbed individual-vetter responses to assert short-circuit + aggregation logic.

**Mock policy**: real LLM calls + real package tree in both production and tests. The deterministic vetters use captured-JSON fixtures (not mocks of `fetch`/`exec`). No mocking of LLM responses — accepts non-determinism in exchange for honesty about real behaviour.

**Excluded**: Tier-2 vetters (Socket.dev, Semgrep, Snyk) — not in v1 scope.

## Documentation Strategy

**Approach**: RUNBOOK + AGENTS.md updates only.

- **`RUNBOOK.md`**: New section "Vetting third-party extensions" documenting `pkg vet` / `pkg audit`; updated "New-machine recipe" to call out the bootstrap gate.
- **`AGENTS.md`**: New "Security protocol" section covering: (a) `requires.install` is a trusted-by-design shell vector — reviewers must scrutinise; (b) every `pkg add` must go through `pkg vet`; (c) `--unsafe` overrides must include a written reason in `vetted.overrides`.
- **No new `docs/how/` file** unless the vetter surface grows beyond v1.
- **No ADR** — Simple Mode + this spec + the dossier + the workshop already capture the architectural decision.

## Workshop Opportunities

| # | Topic | Type | Status | Notes |
|---|---|---|---|---|
| 1 | Prompt-injection rules | Integration Pattern | ✅ Complete, **needs reframe** ([001](./workshops/001-prompt-injection-rules.md)) | Rule taxonomy + severity ladder still authoritative but now serves as the **minih agent's brief / rubric**, not regex. Workshop has a "Pivot note" appended marking the shift. |

No further workshops required for v1 — Simple Mode + the agent-driven novel-validation eliminates the need for separate aggregation, schema, and allowlist workshops at this stage.

---

**Next step**: Run **/plan-3-v2-architect** to generate the implementation plan from this spec.
