# Research Dossier: npm audit triage

**Generated**: 2026-07-11T11:13:00Z  
**Query**: "Triage the repository's 34 npm-audit findings, identify safe updates, and preserve the ruled Dependabot and work-item boundaries."  
**Effort**: Audit  
**Tools**: Mixed  
**Evidence**: 10 current sources · 3 historical sources

## Answer

The 34 findings initially present as three headline roots: **Vitest (5)**, **Pi (3)**, and **minih (26)**, but those sets overlap. A lock-only probe showed `ws` remains reachable through minih/Ink after the Pi bump, while `tsx` retains an `esbuild` advisory after Vitest 4 unless both are explicitly refreshed.

The implementation should therefore use two isolated update batches: Vitest `2.1.9 → 4.1.10` plus `tsx 4.23.0`/`esbuild 0.28.1`, then the Pi peer family `0.74.0 → 0.80.6` plus root `ws 8.21.0`. A scratch lock probe verified the batches produce 34→29→26, with no critical advisory and every final finding rooted only in minih.

Dependabot configuration, vulnerability-alert enablement, automated security fixes, and GitHub settings are ruled non-goals. Work item 040 reverted its `unique-names-generator` manifest/lock changes; the o-prime verified both files byte-clean against HEAD, and hunk-level staging is forbidden.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | Dependabot has generated no work: no `.github/dependabot.yml`, zero Dependabot PRs (open or historical), vulnerability alerts disabled, automated security fixes disabled. | `gh pr list --author app/dependabot`; `gh api repos/AI-Substrate/pij/dependabot/alerts`; `.github/` tree | Do not add configuration or change settings under this plan; cite ruling R1. | High |
| F-02 | Current audit baseline is **34**: 1 critical, 9 high, 24 moderate; production-inclusive audit remains **29**: 8 high, 21 moderate. | `npm audit --json`; `npm audit --omit=dev --json` | The implementation needs explicit before/after audit evidence, not only the normal test gate. | High |
| F-03 | The headline root sets overlap: `ws` is reachable from both Pi and minih/Ink, and `esbuild` remains through `tsx` after Vitest 4. | Scratch probes under `.harness/temp/s039/`; `npm audit --json`; lock ancestry for `tsx`, `esbuild`, and `ws` | Treat 5/3/26 as orientation, not disjoint subtraction; prove the real lock graph after each batch. | High |
| F-04 | Vitest is declared `^2.0.0`, installed at 2.1.9, and 4.1.10 removes its critical root; `tsx 4.23.0` is also needed to move `esbuild` to safe 0.28.1. | `package.json:53-60`; `vitest.config.ts:1-69`; `.harness/temp/s039/vitest-batch-probe/package-lock.json` | Keep Vitest and `tsx` in one attributable toolchain batch; expected audit is 29 with zero critical. | High |
| F-05 | Pi peers are wildcard declarations but locked at 0.74.0. A proven temporary exact-peer constraint/regenerate/restore sequence lands all three peers at 0.80.6 while retaining `"*"`; root `ws` must also move to 8.21.0. | `package.json:41-47`; `.harness/temp/s039/final-graph-probe/package-lock.json`; `npm view @earendil-works/pi-coding-agent@0.80.6` | Use the proven sequence, assert registry latest remains 0.80.6, then refresh root `ws`; move CI to Node 22/24 per ruling. | High |
| F-06 | minih is pinned to released tag `minih-v0.2.4`, whose exact OpenTelemetry 0.216/2.7 and protobufjs 8.0.1 graph produces 26 findings. No newer tag exists. | `package.json:65-72`; `node_modules/minih/package.json:35-58`; `gh api repos/AI-Substrate/minih/tags` | The 26 findings cannot be safely fixed from a released minih version in this plan. | High |
| F-07 | Upstream minih PR 73 raises OpenTelemetry to 0.220/2.9 and protobufjs to 7.6.5, beyond the affected ranges, but CI fails because the exporter API change breaks `src/telemetry/init.ts`. | `AI-Substrate/minih#73`; run `28990058625`, job `86027670841` | Record the minih group as triaged and blocked on a green, released upstream fix; do not pin a red PR head. | High |
| F-08 | `harness checks` does not run root `npm audit`; CI runs it report-only with `|| true`. | `.harness/extensions/checks/extension.ts:25-54`; `.github/workflows/ci.yml:27-31` | Add explicit audit commands to the phase proof and acceptance criteria; a green harness gate alone does not prove the security delta. | High |
| F-09 | Work item 040's package hunks could not be separated safely by file-level pathspec; SW-5 therefore required a revert-to-HEAD handoff. | `rulings.md` §5; o-prime SW-5 ruling, spine Seq 26 | The o-prime has verified both files clean; Plan 039 may edit only after the queued git-index baton is granted. Hunk-level index mechanisms remain forbidden. | High |
| F-10 | A full scratch reproduction verifies the actionable target: Vitest+tsx produces 29 findings; Pi-family+ws produces 26, all rooted in minih. Audit high/moderate propagation changes after lock regeneration, so only total, critical count, package identities, and ancestry are stable gates. | `.harness/temp/s039/{vitest-batch-probe,final-graph-probe}/package-lock.json`; fresh `npm audit --json` | Gate on 34→29→26, critical 1→0, and minih-only ancestry; do not gate on a fixed high/moderate split. | High |

## Critical and High Advisory Inventory

| Root | Severity | Advisory | Risk |
|------|----------|----------|------|
| Vitest | Critical | `GHSA-5xrq-8626-4rwp` | Vitest UI server arbitrary file read and execution. |
| Vitest | High | `GHSA-fx2h-pf6j-xcff` | Vite `server.fs.deny` bypass on Windows alternate paths. |
| Pi | High | `GHSA-jfgx-wxx8-mp94` | Predictable temporary extension paths permit local privilege escalation on shared Linux hosts. |
| Pi | High | `GHSA-vmh5-mc38-953g` | undici SOCKS5 proxy TLS certificate validation bypass. |
| Pi | High | `GHSA-vxpw-j846-p89q` | undici WebSocket fragment-count denial of service. |
| Pi | High | `GHSA-hm92-r4w5-c3mj` | undici cross-origin routing through SOCKS5 pool reuse. |
| Pi / minih | High | `GHSA-96hv-2xvq-fx4p` | ws memory exhaustion from tiny fragments and chunks; the root package remains reachable through minih/Ink until explicitly refreshed. |
| minih | High | `GHSA-q7rr-3cgh-j5r3` | OpenTelemetry Prometheus exporter crash from malformed HTTP requests. |
| minih | High | `GHSA-66ff-xgx4-vchm` | protobufjs generated-code injection through bytes defaults. |
| minih | High | `GHSA-685m-2w69-288q` | protobufjs denial of service through unbounded recursion. |
| minih | High | `GHSA-75px-5xx7-5xc7` | protobufjs code-generation gadget after prototype pollution. |
| minih | High | `GHSA-jvwf-75h9-cwgg` | protobufjs process-wide denial of service through unsafe option paths. |
| minih | High | `GHSA-wcpc-wj8m-hjx6` | protobufjs denial of service through unbounded `Any` expansion. |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | Plan 014 made root audit report-only because the Vitest 4 fix was a breaking bump outside that phase's scope. | `docs/plans/014-pi-session-messaging/tasks/phase-5-smoke-ci-docs/execution.log.md:65-76` | Direct | That deferred bump is now explicitly in scope and needs isolated compatibility proof. |
| H-02 | Root audit is intentionally visibility-only in CI and absent from the full local harness sensor inventory. | `.github/workflows/ci.yml:27-31`; `.harness/extensions/checks/extension.ts:25-54` | Direct | Security acceptance must name a numeric audit delta separately from normal gates. |
| H-03 | Work item 040 had to compare audit JSON manually against the same 34-finding baseline. | `.harness/records/retro/2026-07-11/004-pij-memorable-id-poc.md:13-20` | Direct | Capture per-batch before/after JSON and avoid relying on `npm audit fix --dry-run`, which does not recompute the residual count. |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| Pi 0.80.6 changes the supported CI floor. | F-05 | The dependency declares Node `>=22.19.0`. | Per Jordan's ruling, replace Node 20 with Node 24 and retain Node 22; stop and escalate on either leg failure. |
| minih's 26 findings remain after safe in-repo updates. | F-06, F-07 | Zero findings is not presently achievable without consuming an unreleased, red upstream change. | Record exact residual findings and upstream pointer; revisit after a green tag. |
| The normal done gate can be green while root audit remains red. | F-08, H-02 | A false "all fixed" claim is possible. | Require `npm audit --json` baseline and residual counts in the implementation report and review. |
| Shared package-file serialization remains active. | F-09 | Another stream can invalidate the clean baseline if staging begins without the slot. | Wait for the o-prime's free signal, request the git-index baton, and stage nothing before its pushed grant. |

## Planning Handoff

- **Preserve**: wildcard Pi peer declarations; clean package files after work item 040's ruled revert; report-only CI behavior; Dependabot/GitHub settings unchanged.
- **Change carefully**: batch Vitest with `tsx`, batch the Pi family with root `ws`, run `npm audit --json` after each real update, reject unrelated churn, and never consume minih PR 73 while red.
- **Likely files/symbols**: `package.json`, `package-lock.json`; `vitest.config.ts` only if Vitest 4 proves an actual compatibility break.
- **Acceptance target**: 34 → 29 → 26 findings; critical 1 → 0; all 26 residual findings trace only to minih 0.2.4; full `harness checks` green; Node 22/24 CI reported.
- **Decisions still required**: none before planning. A Node 22/24 failure or newly released minih fix becomes an escalation, not an implicit scope expansion.
