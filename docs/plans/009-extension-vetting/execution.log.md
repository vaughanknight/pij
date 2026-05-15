# Plan 009 — Extension Vetting — Execution Log

## Pre-phase harness validation (2026-05-15)

| Check | Status | Note |
|---|---|---|
| Boot | ✅ healthy | `node v24.7.0` available |
| Interact | ✅ healthy | npm/vitest/biome present |
| Observe | ✅ healthy | `npm run self-check` chain runnable |
| minih | ✅ on PATH | `/Users/jordanknight/.npm-global/bin/minih` — T003 agent pack will be live-runnable |

---

## T001 — Schema + skeletons + types ✅

`harness/scripts/vetters/types.ts` defines `Severity`, `Level`, `Finding`, `Verdict`, `Vetter` interfaces + `deriveLevel`/`deriveScore` helpers. `Entry` in `packages.ts` extended with optional `vetted: { date, score, overrides?, agentRubric? }`. `cmdVet` and `cmdAudit` stubs added that print `vetter not yet implemented (T001 skeleton)` and exit 0. `.pi/packages.yaml` header comment now documents the `vetted:` shape and TTL semantics.

Evidence: typecheck clean; `npm run pkg vet` prints stub message and exits 0.

---

## T002 — Four Tier-1 vetter modules ✅

Created `npm-audit.ts`, `lockfile-lint.ts`, `scorecard.ts`, `github-trust.ts` under `harness/scripts/vetters/`. Each exports `vet(packagePath, source)` returning a `Verdict`. Source-to-Scorecard mapping (`parseSource`) extracted to be shared between Scorecard and GitHub-trust. Fixtures captured at `__fixtures__/`: `npm-audit-clean.json`, `npm-audit-mixed.json`, `scorecard-good.json`, `scorecard-weak.json`. 16 new vitest tests across `types.test.ts`, `npm-audit.test.ts`, `scorecard.test.ts`.

Discoveries:
- **P7 trap**: my first pass used `from "./X.ts"` imports — fine for vitest, fatal for `tsc --noEmit`. Switched to `./X.js` per pi-mono inherited rule. **Encoded fix**: noted in execution log; future vetter modules should be authored with `.js` imports.
- **Scorecard 404 is the common case**: small pi extensions aren't in the OpenSSF index. Vetter correctly fails-soft to `info`. Validated against all 4 currently-installed packages — all 404.

Evidence: typecheck clean; lint clean; all 16 new tests pass; total suite 66 passing.

---

## T003 — minih agent pack + adapter + positive corpus ✅

`agents/package-vetter/` pack created with `agent.json`, `prompt.md`, `briefing.md`, `instructions.md`, `input-schema.json`, `output-schema.json`. `briefing.md` is the **hard rubric** — workshop-001's 7 rule categories (R-01..R-07) embedded verbatim with intent, examples-that-fire, examples-that-don't, severity, and FP-mitigation policy. The agent computes SHA-256 of `briefing.md` as `agentRubric` for versioning. Permissions: read-only + shell + no network + no write.

Positive corpus at `corpus/positive/`: 7 files (`r01-override.md` through `r07-tool-desc-smuggle.ts`), one per rule category, each containing concrete attack patterns at the expected severity. The R-06 file uses real zero-width and RTL-override codepoints. Snapshot directory at `__snapshots__/` is empty — populated on first live agent run.

Adapter at `harness/scripts/vetters/agent.ts` exports `vetWithAgent(packagePath, source)` and `agentVetter: Vetter`. _Note: this paragraph documents the historical Plan-009-landing shape; the adapter was rewritten in FX001-4 — see the FX001 log for the current spawn pattern._ Originally spawned `minih run agents/package-vetter --input '{...}'`. `PIJ_VET_SKIP_AGENT=1` short-circuits to an `ok` Verdict with a `vetter:meta` info finding — the production skip path for determinism in `self-check` and CI.

3 contract tests added at `agent.test.ts` (skip-path, alias check, bad-input handling). Live agent runs are opt-in by unsetting the env var.

Discoveries:
- **Agent invocation pattern** (Plan-009-landing form, since superseded): `minih run <pack-path> --input <json>`. **FX001-4 discovery**: current minih CLI uses `minih run <slug> -p key=value` with output in `runs/<id>/output/report.json`; this paragraph is preserved for historical context but is **not the current contract**. See FX001-4 in `fixes/FX001-audit-gate-hardening.md`.
- **Output discipline matters**: agent prompt is explicit that stdout = exactly one JSON object. Diagnostics go to stderr. This makes parsing trivial and robust.

Evidence: typecheck clean; lint clean; 3 new agent-adapter tests pass; total suite 69 passing.

---

## T004 — Aggregator + pipeline wiring + bootstrap gate + piList helper ✅

`harness/scripts/vetters/aggregate.ts` exports `aggregate(verdicts)` composing findings and deriving level + score, plus `runPipeline(vetters, path, source, opts)` with short-circuit option. `resolve-path.ts` adds `parsePiListOutput`, `piList`, `resolveSourcePath` — ANSI-aware parsing of `pi list` output, preferring project scope. 13 tests added across `aggregate.test.ts` and `resolve-path.test.ts`.

`packages.ts` heavily extended:
- New top-level `VETTERS = [lockfile-lint, npm-audit, github-trust, scorecard, agent]` (agent last because slowest + LLM cost).
- `vetSource(source)` resolves install path via `resolveSourcePath`, runs the pipeline, aggregates. If source not installed → `fail` Verdict with `vetter:not-installed`.
- `cmdVet` parses `--json` flag, runs `vetSource`, exits 0 on `ok` else 2.
- `cmdAudit` iterates all enabled entries, prints per-entry summary, cross-checks installed-but-unmanifested via `pi list`. Respects `vetted.overrides` to downgrade `warn → ok` for accepted entries. Exits 0 on all-effective-ok else 2.
- `cmdAdd` installs eagerly (`pi install`), vets, refuses on `fail` without `--unsafe`, prompts for reason on `--unsafe`, writes `vetted: { date, score, overrides?, agentRubric? }` on success. Rolls back the install on refuse.
- `cmdBootstrap` enforces 30-day TTL via `isFresh()`. Refuses stale/unvetted entries with an explicit message naming the offending source and days-stale count. `--unsafe` overrides only with a non-empty reason (prompted via readline if TTY, else require `--reason "..."`). Writes `vetted.overrides` for overridden entries.
- `--unsafe` reason: `extractReason()` parses `--reason "text"`; `promptReason()` falls back to interactive readline in TTY; logs `[unsafe] <ISO> <action> <source> reason:<text>` to stderr.
- Switch is now `async main()` with top-level await + error catch.

Discoveries:
- **`pi list` output uses ANSI escapes**: bold for section headers, dim for paths. Parser must strip via `\x1B\[[0-9;]*[A-Za-z]/g` regex. Encoded in `parsePiListOutput`.
- **End-to-end live smoke verified**: `PIJ_VET_SKIP_AGENT=1 pkg vet git:github.com/ghoseb/pi-askuserquestion` runs the real pipeline in 6.5s, correctly surfaces the missing-LICENSE warning on github-trust, falls back to info on Scorecard 404.
- **`pkg audit` re-runs every time** rather than trusting recorded vetted block. Tradeoff: catches new CVEs but ignores prior overrides without explicit support. Resolved by adding `effective` level computed against `vetted.overrides`.

Evidence: typecheck clean; lint clean; 13 new tests pass; total suite 82 passing; live smoke against real installed package succeeds.

---

## T005 — Retro-vet currently-installed packages ✅

`PIJ_VET_SKIP_AGENT=1 npm run pkg audit` against the 4 enabled entries:

| Package | Level | Findings |
|---|---|---|
| `pi-mcp-adapter` | ok | scorecard 404 (info), agent skipped (info) |
| `pi-community-themes` | ok | scorecard 404 (info), agent skipped (info) |
| `pi-lean-ctx` | ok | no lockfile (info), not-github (info), scorecard 404 (info), agent skipped (info) |
| `pi-askuserquestion` | **warn** | github-trust:no-license (warn), scorecard 404 (info), agent skipped (info) |

Wrote `vetted:` blocks for all 4 in `.pi/packages.yaml`. The askuserquestion entry carries `vetted.overrides`: "no-LICENSE on upstream; install-only use, not redistribution; flagged in research-dossier.md" — a true-positive finding (we noted this in plan 005 research) accepted per T005 contingency rules.

Re-audit: `pkg audit` now exits 0 — effective level for all 4 is `ok` (1 via documented override).

Discoveries:
- **First real signal from the new pipeline**: github-trust correctly flagged that `pi-askuserquestion` has no LICENSE — a finding we'd noted in research but had no enforcement for. This is exactly the kind of signal AC-04 was meant to surface, and the override mechanism handles the user's prior decision to consume-anyway. **The system worked first try.**

---

## T006 — Docs + self-check integration + domain artefacts ✅

- `package.json#scripts.self-check` now ends with `&& PIJ_VET_SKIP_AGENT=1 npm run pkg audit`.
- `RUNBOOK.md` gained a "Vetting third-party extensions" section + updated "New-machine recipe" + new rows in "Where things are" (vetters + agent pack paths).
- `AGENTS.md` gained a "Security protocol" section per AC-07, explicitly naming `requires.install` as a trusted-by-design shell-injection vector, documenting reviewer responsibility.
- `docs/project-rules/harness.md` History row appended for 2026-05-15 / Plan 009.
- `docs/domains/registry.md` History row appended (the new capability lives inside `extension-authoring-harness`).
- `docs/domains/domain-map.md` Mermaid graph extended with a new `V` node (vetter pipeline) as sub-capability of harness, with a "scans markdown + tool descriptions" edge to `agent-tooling-interface`. History row added.

**Final BIO check** — `npm run self-check` end-to-end:
- typecheck ✅
- lint ✅
- test: 83 passing
- smoke: ✅
- `pkg audit`: 4 entries vetted ok (1 via documented override)

Exit 0. Plan landed.

---

## Summary

| Metric | Value |
|---|---|
| Tasks completed | 6/6 (T001–T006) |
| New source files | 11 (5 vetters + types + aggregate + resolve-path + adapter + 2 fixtures parents) |
| New test files | 6 (32 new tests across the vetter modules) |
| New agent pack | 1 (`agents/package-vetter/`) with 7-file positive corpus |
| Modified files | 6 (packages.ts, package.json, packages.yaml, RUNBOOK.md, AGENTS.md, harness.md, registry.md, domain-map.md) |
| Acceptance criteria satisfied | AC-01, AC-02, AC-03, AC-04, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11 |
| Acceptance criteria deferred | AC-05a/b (agent live-snapshot runs — pack + corpus committed and runnable; populating `__snapshots__/` is a manual first-run step) |
| Total test suite | 83 passing, 2 skipped |
| self-check status | green (typecheck → lint → test → smoke → pkg audit, all exit 0) |
| True-positive signals from new pipeline | 1 (`pi-askuserquestion` no-LICENSE, accepted with documented override) |

## Outstanding items

- ~~**AC-05 live agent snapshots**~~: ✅ closed by [FX001-4](./fixes/FX001-audit-gate-hardening.md). `agents/package-vetter/__snapshots__/` now carries 7 corpus snapshots + 12 raw package runs + 4 medians.
- ~~**Detection corpus run**~~: ✅ closed by FX001-4. Full results: 7/7 corpus files classified at the intended severity (R-01 through R-07 all detected as `fail`). AC-05a exceeded its ≥6/7 target.
- ~~**Plan-7 code review**~~: ✅ ran via `agents/code-review` minih agent — surfaced 4 HIGH findings (F001-F004); all addressed by [FX001](./fixes/FX001-audit-gate-hardening.md).
- ~~**Adapter live path**~~: ✅ closed by FX001-4. The Plan 009 adapter used an outdated minih CLI signature (`--input <json>` — silently failing); rewritten to `-p key=value` + `last-run`-based report read. Also `output-schema.json` `additionalProperties: false` was conflicting with minih's system envelope — flipped to `true`.

## Post-implementation FX001 close-out (2026-05-15)

A `code-review` minih agent audit of the Plan 009 landing surfaced 4 HIGH correctness gaps:

| Finding | Fix sub-task | Commit |
|---------|--------------|--------|
| F001: `pkg audit` never refreshes stale `vetted.date` | FX001-3 | `0f9fa3b` |
| F002: Unmanifested installs detected but not gating exit | FX001-2 | `ee86023` |
| F003: AC-05 evidence deferred (agent never run against corpus) | FX001-4 | _(this commit)_ |
| F004: `vetted.overrides` mask all warns on the entry (over-broad) | FX001-1 | `eb1dc51` |

Plus FX001-5 (docs + plan close-out) — `.pi/packages.yaml` schema-header + `RUNBOOK.md` document the new `overrides.rules` shape; `harness.md`/this log/Plan Validation Record extended.

All 5 sub-commits pinged the `code-review-companion` per commit-boundary protocol; companion was silent (no findings) for FX001-1..3. FX001-4 + FX001-5 are bundled for the final review-request.
