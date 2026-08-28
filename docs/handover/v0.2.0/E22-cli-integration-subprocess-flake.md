# E22 — cli.integration subprocess-timeout flake + un-nameable-report defect

**Item id / stream at handover:** E22 (the flaky-file item; distinct from 12-FX which fixed `pij-skill-check.test.ts`) · s392-day3-codex-doctrine
**Status at v0.2.0 (tag `d120c53`):** designed, NOT started. Named from vitest bg logs; the exact failing `it` could NOT be named because the log was truncated (that truncation is part of the defect).
**Size estimate:** S–M, ~3–4 h · **Order / dependencies:** none (tail, low priority). 12-FX (skill-check flake) is a sibling, already fixed.

## 1. Why this exists (the observed failure, with evidence) — `docs/plans/392-day3-codex-doctrine/rulings.md:196-197`
Under full-suite / concurrent-fleet load, real-subprocess tests time out:
- `.pi/extensions/pij/cli.integration.test.ts` — 98 tests, 1 failed, **152966 ms** runtime (real `pij` CLI subprocesses). PRIME SUSPECT: 152 s of subprocess spawning is timing/contention-sensitive → classic timeout flake.
- `.pi/extensions/pij/acceptance-sweep.test.ts` — 14 tests, 1 failed, 831 ms (secondary).
- `harness/scripts/release-age-policy.test.ts` — the KNOWN pwsh-ENOENT environmental failure (deterministic; EXCLUDE, being skip-with-reason'd, see the pwsh companion of 12-FX / E7-adjacent hygiene).
- **The report defect:** the vitest bg logs were TRUNCATED before the failed test NAME (the o-prime hit the same truncation). A flaky report you cannot name is unactionable — fixing the truncation is part of this item (E22 is itself the rule: a red with no full, nameable log is a claim, not evidence). NOTE: these numbers are transcription-verified from `docs/plans/392-day3-codex-doctrine/rulings.md:196-197` (the o-prime's bg run over machine-local `~/.pij/pij-associated-louse/bg-*.log` — NOT reproducible by a stranger; reproduce fresh per §4).

## 2. What is ruled (design / spec)
- Quarantine/harden the slow subprocess tests: raise the per-test timeout for the subprocess-heavy `it`s, OR serialize/isolate them (a dedicated non-parallel pool), so contention can't push them past the timeout. Prefer isolation that removes the contention over a blanket timeout bump.
- Fix the truncation: capture the FULL vitest output (no head-cut) so the failing test is always nameable (E22/E42 — never assert a red from a truncated listing).
- E22 rule (README § rules): keep the failing run's log in full; fix the isolation; never retry into green.

## 3. Where the code is (at tag `d120c53`)
- `.pi/extensions/pij/cli.integration.test.ts` — the subprocess-heavy suite (spawns the real CLI); the `it`s that shell out are the flake surface.
- `.pi/extensions/pij/acceptance-sweep.test.ts` — secondary.
- `vitest.config.ts` (repo root; `"test": "vitest run"` in `package.json`) — where per-file parallelism / pool / timeout is set.
- 12-FX is the pattern: the investigation is `docs/plans/392-day3-codex-doctrine/tasks/item-12-FX-DRAFT-HOLD.md` and the shipped task record `docs/plans/392-day3-codex-doctrine/tasks/item-12-skillcheck-hardening/tasks.md` (both on main); the isolation FIX (`harness/scripts/pij-skill-check.sh` honoring `PIJ_REPO_ROOT` + a per-file repo snapshot) and its proof logs are committed on branch `s392/item12-fx-falcon` (`3f0849e`) and written up in the 12-FX handover section. Mirror that isolation where the contention is a shared resource; bound the timeout where it is pure subprocess latency.

## 4. Acceptance (behavioural, mechanical)
- Reproduce first and KEEP the full failing log in the plan folder, in a new item-E22 directory you create (nameable test, not truncated). Then prove deterministic: several consecutive full-suite runs green, logs kept (E22/E35). No mutant (flake fix); the gate is determinism under load + a nameable-on-failure log.
- Gates: `just typecheck`, full suite at merge product, two green runs.

## 5. Live verification
CI/local test infra only — no daemon restart. Run the full suite under concurrent load (or with fewer workers to force contention) N times; `cli.integration.test.ts` must not flake, and any failure names its test.

## 6. Risks / gotchas that already bit us
- **E22** — the whole rule: a flaky red with a truncated/absent log is unactionable. Fix the reporting AND the flake.
- **E35** — a full-suite red counts only on a fresh-from-main worktree; a long-lived worktree red is diagnostic (diff source vs main first).
- Blanket timeout bumps HIDE real regressions — prefer isolation; if you bump, say why in a comment.

## 7. Open questions for the human
- Empty — proceed when the tail reaches it; low priority relative to the shipped human-channel items.
