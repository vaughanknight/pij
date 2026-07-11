# Backpressure Coverage — dependency chores audit

**Spec**: [dependency-chores-audit-plan.md](./dependency-chores-audit-plan.md)
**Generated**: 2026-07-11
**Certainty**: Strong

> Advisory only. Never blocks, never gates, no scores.

## Existing Sensors

| Sensor | Command | Dimension | Found in |
|--------|---------|-----------|----------|
| clean dependency install | `npm ci` | behaviour | `package-lock.json`, CI |
| root vulnerability graph | `npm audit --json` | behaviour | npm CLI |
| dependency ancestry | `npm explain <package>` / lockfile `jq` queries | behaviour | npm CLI, `package-lock.json` |
| typecheck | `just typecheck` | maintainability | `justfile` |
| lint | `just lint` | maintainability | `justfile` |
| unit + integration tests | `just test` | behaviour | `vitest.config.ts` |
| minih contract drift | `just test .pi/extensions/pij/core/agents/contract.test.ts` | architecture-fitness | agent-runtime tests |
| full local gate | `harness checks` | maintainability + behaviour | `.harness/extensions/checks/extension.ts` |
| Node matrix proof | GitHub Actions Node 22/24 legs | behaviour | `.github/workflows/ci.yml` |
| scope/seam proof | `git diff`, `git diff --cached`, baton lease | architecture-fitness | git + pij orchestration |

## Coverage Matrix

| Criterion / failure mode | Deterministic sensor | Status | Tier | Probe trail |
|--------------------------|----------------------|--------|------|-------------|
| AC-01 baseline is 34 with named package roots | `npm audit --json` + lock ancestry query | EXISTS | computational | — |
| AC-02 toolchain reaches 29 and zero critical | post-update `npm audit --json`; version query; `just typecheck && just lint && just test` | EXISTS | computational | — |
| AC-03 Pi family/ws reaches 26 with wildcard peers | lock `jq` query + post-update audit | EXISTS | computational | — |
| AC-04 all 26 residuals trace only to minih | audit package list + `npm explain` / lock ancestry | EXISTS | computational | — |
| AC-05 CI is Node 22/24 and audit remains report-only | workflow diff + GitHub Actions results | EXISTS | computational | — |
| AC-06 no work item 040 hunk enters the change | SW-5 clean-HEAD verification + git-index lease + staged diff | EXISTS | computational | — |
| AC-07 clean install and full local gate | `npm ci` + `harness checks` | EXISTS | computational | — |
| AC-08 both remote CI legs pass | GitHub Actions checks | EXISTS | computational | — |
| AC-09 no forbidden scope appears | final `git diff --name-only` + exact diff review | EXISTS | computational | — |
| Lock regeneration silently adds unrelated dependency churn | package version/diff inventory against the task's named set | EXISTS | computational | — |
| Audit severity propagation changes while ancestry stays constant | compare total, critical, package identities, and ancestry; treat high/moderate as informational | EXISTS | computational | — |

## Certainty: Strong

Every acceptance criterion has a current deterministic sensor. Root `npm audit` is not part of `harness checks`, but the plan names it explicitly before, between, and after the two dependency batches.

## Suggested "done when" lines

| For criterion | Suggested line | Backed by |
|---------------|----------------|-----------|
| AC-04 | done when `npm audit --json` reports total 26, critical 0, and every listed package is reachable only from minih 0.2.4 | EXISTS |
| AC-06 | done when the staged diff contains only the granted Plan 039 surfaces under an active git-index lease | EXISTS |
| AC-07 | done when a fresh `npm ci` and full `harness checks` both exit 0 | EXISTS |

