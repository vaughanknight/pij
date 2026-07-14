# Research Dossier: seven-day npm release-age quarantine

**Generated**: 2026-07-13
**Query**: "Enforce `min-release-age=7` without weakening build, install, or npm-audit behavior."
**Effort**: Standard
**Tools**: Mixed (repo reads, FlowSpace pi-mono graph, official npm documentation)
**Evidence**: 8 current sources · 2 material historical sources

## Answer

The installed npm is **11.10.0** and natively supports `min-release-age`; its value is **days**, so the seven-day policy value is `7`; an earlier incorrect-unit value was invalid. The official npm v11 configuration contract filters versions published inside the configured age window during resolution, while preserving an explicit higher-priority override path; it is a quarantine control, not a CVE or all-zero-day detector.

A project `.npmrc` is the smallest authoritative control for the repository's own `npm install`/lockfile-resolution commands. It is insufficient alone for all pij workflows: `just install` and `just update-pi` perform global Pi installation, while `pkg add`/`pkg bootstrap` invoke `pi install`; Pi runs its own npm commands with `--prefix` and no age flag. The implementation must therefore apply the same npm config through the environment to every pij-owned subprocess that can cause Pi to resolve an npm package, and prove it reaches that nested npm process.

`npm ci` must remain the clean-install proof, not a second resolver: its documented contract is to require and install the committed lockfile without writing it. The plan must prove the existing lock still installs under the policy and separately prove the refusal path during a fresh resolution. `npm audit` is orthogonal and must remain enabled and evidenced independently because the repository's CI command is deliberately report-only and the full local inventory runs package-vetter audit rather than root `npm audit`.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | npm 11.10.0 exposes `min-release-age` with default `null`; the native value is measured in days. | `npm --version`; `npm config get min-release-age`; `npm config list -l`; `@npmcli/config` definition hint `<days>` and implementation `86400000 * value` | Use the native npm control with `7` days; do not invent a lockfile-age parser. | High |
| F-02 | npm documents that `min-release-age` filters newly published versions; `before` wins when set at the same precedence, and higher-priority config may override lower. | npm v11 Config: https://docs.npmjs.com/cli/v11/using-npm/config#min-release-age | Document intentional emergency bypass and avoid claiming an unbypassable sandbox. | High |
| F-03 | There is currently no project `.npmrc`; the root install recipe is `npm ci`, while Pi global install uses `npm install -g --ignore-scripts`. | worktree root listing; `justfile:41-44,210-227` | Add committed project configuration and put the global install under the same release-age environment. | High |
| F-04 | `pkg add` installs before vetting and `pkg bootstrap` installs each enabled source via `pi install`; both inherit process environment today. | `harness/scripts/packages.ts:204-210,291-299` | Centralize the `pi` child environment and cover add/bootstrap; preserve report-and-continue verdict semantics. | High |
| F-05 | Pi's package manager resolves npm sources with `npm install ... --prefix <installRoot> --legacy-peer-deps` and has no release-age argument; nested npm inherits its parent environment. | FlowSpace `pi-mono`, `packages/coding-agent/src/core/package-manager.ts:getNpmInstallArgs` and `runNpmCommand` | Add a pij-owned environment boundary rather than relying on Pi implementation changes or a project `.npmrc` lookup from its cache directory. | High |
| F-06 | Pi mono itself uses `.npmrc` `min-release-age=2` (two days); its self-update path explicitly requests `--min-release-age=0`. | `pi-mono/.npmrc`; upstream hardening note; `packages/coding-agent/src/config.ts:103-166` | Seven days is a stricter compatible native setting, but Pi self-update is an explicit bypass outside this plan's controlled package-install surface and must be documented as such. | High |
| F-07 | `npm ci` requires a lockfile, removes `node_modules`, and never writes `package.json` or lockfiles. | npm v11 npm-ci: https://docs.npmjs.com/cli/v11/commands/npm-ci | Prove locked/current dependency install succeeds separately from fresh-resolution refusal. | High |
| F-08 | Root npm audit is report-only in CI and is absent from the full local checks inventory; current package-vetter audit remains report-only. | `.github/workflows/ci.yml:27-35`; `docs/plans/039-dependency-chores-audit/research-dossier.md:F-08` | Add an explicit root `npm audit --json` proof/CI assertion without changing the report-and-continue policy unintentionally. | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | Supply-chain controls must preserve report-and-continue for add/bootstrap/audit; the strict check remains `pkg vet`. | `docs/plans/009-extension-vetting/research-dossier.md`; `AGENTS.md` Security protocol | Direct | Do not turn a release-age block into a new vetter verdict or alter the human review policy. |
| H-02 | Security work can look green while root audit is red; audit evidence must be explicit and numeric. | `docs/plans/039-dependency-chores-audit/research-dossier.md:F-08,H-02` | Direct | Make audit preservation an acceptance criterion and test/CI output, not an assumption. |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| Git and URL sources are not npm registry publications. | F-02, F-04 | Native npm release age cannot quarantine git commit age or arbitrary URLs. | State the boundary; retain existing vetting/approval rules. |
| Existing locks can retain a version resolved before the policy. | F-07 | `npm ci` is intentionally frozen and may not re-evaluate package publication age. | Prove clean locked install; apply age gating to future resolution paths. |
| Pi may add its own explicit age override in future releases. | F-05, F-06 | A nested command flag can supersede the environment. | Regression-test observed child configuration and report a detected override rather than silently claiming coverage. |
| A controlled refusal test cannot depend on a package being freshly published at test time. | F-01, F-02 | Live registry timing makes a seven-day fixture flaky. | Use a pinned known package and a deliberately huge test-only age window measured in days (or deterministic fixture/proxy) to force rejection; keep production policy fixed at 7. |

## Domain Impact

| Domain / boundary | Relationship | Contract or constraint | Evidence |
|-------------------|--------------|------------------------|----------|
| `extension-authoring-harness` | owns change | `just` recipes, package workflow, checks and audit evidence | `docs/domains/registry.md`; `docs/domains/domain-map.md` |
| pi package manager | external consumer | nested npm must receive policy config without modifying pi-mono | F-05 |
| package-vetter | preserve | report-and-continue remains intact; no hand-edited manifests | `harness/scripts/packages.ts`; H-01 |

## Planning Handoff

- **Preserve**: committed lockfile behavior, `npm ci`, all existing build/typecheck/test recipes, report-and-continue package vetting, and audit visibility.
- **Change carefully**: `.npmrc`, `justfile`, and `harness/scripts/packages.ts` are the likely enforcement seams; any package manifest/lockfile change needs a later explicit code fence and baton.
- **Likely files/symbols**: new `.npmrc`; `justfile` install/update recipes and `pkg`; `harness/scripts/packages.ts` Pi child-process helpers; focused tests near the extracted helper; CI/audit documentation only if proof coverage requires it.
- **Decisions still required**: exact emergency-bypass protocol and the smallest deterministic fake/probe for nested Pi/npm environment propagation. The plan should choose a test seam before implementation.

## External Research

| Question | Why repo evidence is insufficient | Planning impact | Source |
|----------|-----------------------------------|-----------------|--------|
| Exact npm semantics for the native age filter and config precedence | npm behavior is external to pij. | Confirms the days value and override/security boundary. | Official npm v11 Config and npm-ci documentation cited above. |
