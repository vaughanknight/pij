# Validation — pij-agents-minih-plan.md

- **Validated**: 2026-07-03T08:15:00+10:00
- **Target**: `docs/plans/029-pij-agents-minih/pij-agents-minih-plan.md` (post-amendment revision, plan v1.0.0)
- **Contract sources**: `research-dossier.md`, `workshops/001-minih-reuse.md`, `workshops/002-pij-agent-cli-experience.md`, session directives (2026-07-03)
- **Checks**: `FakeAgentAdapter` export verified in minih src + dist typings (`src/index.ts:19`, `dist/index.d.ts`); `validateInput/validateOutput/validateSystemOutput` exported via `./runner` (`src/runner/index.ts:390-392`, dist typings); `claude`/`codex` binaries on PATH; minih tag `minih-v0.2.4` present locally; scout-verified pij seams (`loadModels` private `cli.ts:152`, `PROVIDER_HARNESS_MAP` private `core/cli.ts:336`, barrel-less `core/` convention, vitest globs, `*.live.test.ts` gating); AC↔coverage-map cross-check; one independent critic (read-only), all findings lead-verified against sources
- **Verdict**: VALIDATED WITH FIXES
- **Thesis / proof**: purpose met — implementable 2-phase plan with contract-sketched seams; target proof (Implementation) supported by fresh source evidence for every load-bearing library claim
- **Consumers**: 2/2 named (phase-task expansion + implementer) — coverage map complete after AC-03 repair

## Findings

| Severity | Finding | Evidence | Status |
|---|---|---|---|
| HIGH | Recorded run of an un-ejected built-in writes `runs/` into the installed package dir (minih roots runs at pack dir) | minih `src/runner/folder.ts:799`; plan Key Finding 07 + task 2.7 pre-amendment | fixed — rule added (AC-08, 2.7, KF-07): un-ejected built-ins run ephemeral; eject to record. Decision taken by recommended default in Jordan's absence — reversible to a `~/.pij` runs-redirect if preferred |
| MEDIUM | AC-12 contract test through real `runAgent` would write `runs/<ts>/` under the committed fixture each `just self-check` | same folder.ts mechanic; task 1.2 pre-amendment | fixed — 1.2 copies fixture to temp dir + asserts clean tree |
| MEDIUM | Temp-tree crash-sweep pinned to daemon start, but inline runs are daemon-independent | AC-05/1.7 pre-amendment; `agent` verb is daemon-less (cli.ts intercept) | fixed — sweep also at every `pij agent run` start (AC-05, 1.7) |
| MEDIUM | AC-03's CLI-observable half (`E-BADINPUT` exit 1, rendered AJV lines) had no covering task in its map row | Acceptance Coverage Map AC-03 row pre-repair | fixed — row now cites 1.5 + 2.6 |

## Repairs

- Mechanical: AC-03 coverage row completed (2.6 added).
- Grounded amendments (each cited to its finding): AC-05, AC-08, tasks 1.2 / 1.7 / 2.7, Key Finding 07. Re-checked: amended rows are internally consistent with workshops 001/002 (ephemeral engine + eject pattern already existed; no new machinery invented).
