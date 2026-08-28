# 35 — GitHub Actions has never run on this repository (gates are local-only)

**Item id / stream at handover:** 35 · s391-day3-core
**Status at v0.2.0 (tag `d120c53`, 2026-08-28 05:2xZ):** designed (investigated; root cause is outside the repo — needs the owner's GitHub account settings; a one-click test workflow is proposed)
**Size estimate:** S (1–2 h once the account-side cause is fixed) · **Order / dependencies:** none; unblocks the "merge product green" gate for every other item

## 1. Why this exists (the observed failure, with evidence)
- The repo's only workflow, `.github/workflows/ci.yml` (workflow id 317915369, `state: active`, created 2026-07-22T04:57Z with the repo), has **zero runs** in the repository's lifetime: `gh run list --limit 50` → 0 rows; `gh api repos/vaughanknight/pij/actions/workflows/317915369/runs` → `total_count: 0` (probed 2026-08-28 ~05:4xZ).
- GitHub has received the triggering events: the last 30 repo events are `PushEvent: 18, PullRequestEvent: 8, CreateEvent: 4` (`gh api repos/{owner}/{repo}/events`), and `pushed_at` = 2026-08-28T05:19:56Z. The workflow triggers on `push: branches: [main]` and `pull_request` — both event kinds occurred many times on 2026-08-27/28 (PRs #2–#34 merged by the o-prime).
- Yet **no check suite was ever created**: `gh api repos/{owner}/{repo}/commits/d120c53/check-suites` → `total_count: 0`, `check-runs: 0`. A workflow that GitHub had *enqueued and cancelled* (the `concurrency: cancel-in-progress` block) would still leave a check suite; zero suites means GitHub never enqueued anything.
- Repository-side settings are correct: `actions/permissions` → `{"enabled": true, "allowed_actions": "all"}`; `actions/permissions/workflow` → `default_workflow_permissions: read`; the repo is public, not a fork, not archived, `main` unprotected, no rulesets (`rulesets` → 0); the YAML parses (`gh workflow view ci --yaml`); `actions/cache/usage` answers (Actions API is reachable for the repo).
- Consequence recorded in the o-prime's orient (2026-08-27): "CI has never run in this repo (0 Actions runs, workflow active). Merges are ruled on local gates + cold review + live proof, recorded per PR (spine 24514) until Vaughan fixes Actions." Every PR in this handover was merged on local gates only (README § How to work an item, step 3).

## 2. What is ruled (design / spec)
- Owner's standing rule (spine 24514, orient-local 2026-08-27): local gates + cold review + live proof are the merge law **until Actions works**; the handover README restates it. No change to that law is proposed here — this item makes Actions actually run so the law can retire.
- Invariants once Actions runs: (i) the merge-product gate (`npx vitest run .pi/extensions/pij/` on PR head + main) is what CI must execute — the workflow already does `npm test`, which includes `cli.integration.test.ts` (per its own comment); (ii) known environmental reds (pwsh-only `harness/scripts/release-age-policy.test.ts`; OSC-7337 lint) must be **named** in CI output, never silently red (E45 class — see item 33's `watchdog-smoke:` line); (iii) the live tmux Driver smoke stays local (the workflow comment already says so).
- Accepted degradation until then: the 5-minute local full suite per PR at the merge product, recorded in the PR body (as done for PRs #27–#34).

## 3. Where the code is (at tag `d120c53`)
- `.github/workflows/ci.yml` — one job `check`, matrix `node: [22, 24]`, steps: checkout, setup-node (npm cache), `extractions/setup-just@v2`, `npm ci --min-release-age=null`, lockfile allowlist (`harness/scripts/lockfile-allowlist.ts`), `npm run typecheck`, `npm run lint`, `npm test`, `npm audit --audit-level=high || true`. Last change 9e2bd72 "ci: supersede in-flight runs for the same ref (#157)" — from the upstream (AI-Substrate) history; this repository (`vaughanknight/pij`) was created 2026-07-22 with that file already present.
- Nothing in the repo can make GitHub *enqueue* a run; the fix is on the account/repo settings side, plus a diagnostic workflow (below) so the next probe is one click, not an API archaeology.
- `npm run lint` is RED on main today (`.pi/extensions/pij/producers/osc-7337-producer.ts`, pre-existing Biome findings — the "OSC baseline"): the moment Actions runs, `lint` fails the job. Either fix that file (out of this item's scope; small) or split lint into a report-only step until it is fixed — decide before enabling (§ 7).
- `npm test` at the repo root runs the WHOLE vitest include (236 files incl. `harness/scripts/*.test.ts`); `release-age-policy.test.ts` spawns `pwsh`, which the `ubuntu-latest` runner does not have unless installed (`pwsh` IS preinstalled on GitHub's ubuntu images — verify on the first run; if absent, the test must skip with a named reason, not fail).

## 4. Acceptance (behavioural, mechanical)
- Add `.github/workflows/actions-probe.yml`: `on: [workflow_dispatch, push]`, one job that echoes `${{ github.sha }}` and `node --version`. Its purpose is a one-click proof that the account can enqueue runs at all (`gh workflow run actions-probe`). **MUT-35a**: none — this is an environment probe, not code; the "test" is `gh run list --workflow actions-probe` showing ≥1 run with conclusion `success`.
- Then `ci.yml`: (a) add `workflow_dispatch` so it can be re-run by hand; (b) name environmental reds: run `npm run lint` with `continue-on-error: true` ONLY IF the OSC file is not fixed first, and print a `baseline-red[OSC]` line in the job summary (`$GITHUB_STEP_SUMMARY`) so the red is visible, not silent (E45); (c) keep `npm test` hard.
- Gate: first green `ci` run on a PR = the merge-product check the README asks for; from then on the README's step 3 changes to "CI green on the PR head + local full suite at the merge product until CI runs on the merge commit too".
- Repo check that must go green: `gh api repos/{owner}/{repo}/commits/<pr-head>/check-suites` → `total_count ≥ 1` with app `github-actions`.

## 5. Live verification (after a daemon restart carrying it)
Not daemon-side. Verification is: `gh workflow run actions-probe && sleep 60 && gh run list --workflow actions-probe --limit 1` → `completed success`. A failure looks like today: `gh run list` empty, `check-suites: 0`.

## 6. Risks / gotchas that already bit us
- **E45** (name known reds in the sensor's output): `npm run lint` is baseline-red; an all-or-nothing CI turns that into "CI is always red", which is how the local pwsh/OSC reds hid three dead-sensor drifts for weeks (item 33, DL-018).
- **E35** (full-suite gates count only fresh-from-main): CI gives this for free — one more reason to make it run.
- Local-only reds today: `release-age-policy.test.ts` (pwsh absent on macOS), OSC lint, windows-compat mirror of the same lint (`harness checks`), plan-055 smoke (item 33). All named in every s391 PR body.
- 32-FX (PR #33): the merge-product full suite went red under parallel load from a cold `npx` spawn in a test — CI runners are slower than the dev box; expect budget-class flakes to show up first in CI (E22: name, keep the log, fix or quarantine with a reason; never re-run into green).

## 7. Open questions for the human
1. **Vaughan**: GitHub → Settings (account) → Billing → "Actions" — is Actions blocked for the account (payment verification / spending limit) or is there an account-wide "Disable Actions" policy? Repo-level settings are already `enabled`. The `gh api /user/settings/billing/actions` call returned 404 with my token (no billing scope) — only the owner can see this. Zero check suites across 18 pushes is the signature of an account-level block, not a workflow bug.
2. Fix the OSC-7337 lint baseline before enabling CI (≈30 min), or ship lint as report-only with a named `baseline-red[OSC]` line? Recommendation: fix it — it is the only thing standing between "CI runs" and "CI is green".
