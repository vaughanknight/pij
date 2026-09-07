# Governance branch delivery

- Commit: `d9dad3a21c6ed846e6e2c2fc8951be28a9255d7d` (`encode-governance-branch`).
- Scope: 120 files; 753 insertions, 13,306 deletions. One local commit; no push, PR, merge, standing-worktree mutation or re-root execution.
- Attribution: `Pij-Seat: pij-fiscal-nepheli`; `Pij-Prime: pij-minor-unicorn`, derived by `pij-rs commit-trailers` at commit time.

## Delivered

1. Canonical four-rule block: `skills/pij/references/prime/rituals/bootstrap.md#governance-branch--the-rules`. Generic orphan/permanent-worktree recipe, moves/stays boundary, receipt-only requirement reconciliation, named owner, lynx/Jordan provenance; platform-store authority retained.
2. Prime route/orients/protocol/templates use `<government-root>` and resolver citations; pij's machine layout remains a worked example only. AGENTS.md and docs/how/pij.md point to the canonical rules.
3. `harness/scripts/government-root.sh [REPO]` discovers the registered, available governance worktree, rejects missing/unavailable roots without a main fallback, and prints bootstrap guidance.
4. `harness/scripts/reroot-governance.sh [--dry-run|--prepare] [REPO]` defaults read-only. Preparation creates the protected backup tag and one attributed, exact-tree parentless candidate atomically, without moving the standing branch. Its printed final handoff is for the prime alone; configured hooks remain enabled.
5. All 96 tracked `.harness/government/` copies removed from this product worktree after branch-presence proof; only README.md remains trackable. No real executable consumer depended on those copies. Synthetic dispatch fixture stays isolated; CI only triggers on main/PR.
6. Peer route is 147/150 lines with rs control gestures intact. Documentation integration test now checks C1's authoritative rules plus peer citation and registration ordering, rather than requiring duplicated prose.

## Proof and gate disposition

| Proof | Observed result | Receipt |
|---|---|---|
| `just pij-skill-check` | Exit 0; all hard gates green | [skill gate](governance-skill-check.log) |
| Governance fixtures | 19/19 before final fresh-orphan case | [fixture run](governance-tests.log) |
| Generic fresh-orphan recipe | 1 passed, 19 deselected | [bootstrap](governance-bootstrap-proof.log) |
| Changed peer doc contract | 1 passed, 109 deselected | [doc contract](governance-peer-doc-contract.log) |
| Actual government resolver | Exit 0; standing governance root | [resolver](government-root.log) |
| Actual re-root dry-run | Exit 0; no preparation/handoff performed | [complete output and prime handoff](governance-reroot-dry-run.log) |
| Independent tooling review | Source-only; no material findings | [review](governance-safety-review.json) |
| Final `harness checks` | Exit 1: smoke only; every other sensor passed | [full gate](governance-harness-checks.log) |
| Final standalone `just smoke` | Exit 0; all 11 scenarios pass | [standalone smoke](governance-standalone-smoke.log) |

**Accepted exception, not a green full gate:** the final full-gate todo startup timed out under load (`durationMs: 15180` in retained tail). The prime explicitly accepted the inherited runtime-flake class after standalone smoke passed and instructed delivery without another whole-gate run. Earlier file-watch-notify boot failure received the same standalone proof. No runtime implementation was changed to hide either failure.

Final sensor verdicts: local-paths=pass, typecheck=pass, lint=pass, test=pass, copilot-native=pass, windows-compat=pass, smoke=fail, pkg-audit=pass, snapshots=pass, pij-commit-trailers=pass.

Changed budget receipts: peer 147/150; prime route 79/90; bootstrap 79/90; kickoff 90/90; protocol 170/170; orchestrator 120/120. Untouched batons.md retains its existing advisory 200/90 warning; no budgets were raised.

## Prime-only re-root next action

Read the [complete dry-run output](governance-reroot-dry-run.log), pause all governance writers, then run `harness/scripts/reroot-governance.sh --prepare` from this worktree when ready. Review and run the newly emitted handoff block yourself. Do not reuse a stale pinned handoff after governance advances. The script preserves existing protected refs rather than overwriting them; remote publication is a separate decision.

Dry-run source tip: `54101b087efdb3f91b29d952bb772f70554d0625`. Source tree: `8711a46a952fd0010116bdc091d0aaf22ce785f7`.
Backup: `prime-governance-pre-orphan-2026-09-07`.
Candidate: `prime-governance-orphan-2026-09-07`.
Root message: `governance: orphan re-root, history at tag prime-governance-pre-orphan-2026-09-07`.

## Removal policy and preservation brake

Policy: governance documents belong to the governance branch, not the product branch. The branch-presence check is a **one-directional safety interlock (brake)**: absence can only spare a path, never select extra deletion. Every path below existed on the pinned governance tip before removal. [JSON](governance-presence.json) and [TSV](governance-presence.tsv) carry the same inventory.

| Removed main path | Present on prime-governance |
|---|---|
| `.harness/government/baton-book.md` | yes |
| `.harness/government/briefs/chore-primitive-2026-08-02.md` | yes |
| `.harness/government/briefs/chore-primitive-rollout-2026-08-02.md` | yes |
| `.harness/government/briefs/feature-round-2026-07-19.md` | yes |
| `.harness/government/briefs/fleet-outstanding-checkin-2026-07-13.md` | yes |
| `.harness/government/briefs/interview-agent-teams-2026-08-04.md` | yes |
| `.harness/government/briefs/no-honest-idle-available-state-2026-08-01.md` | yes |
| `.harness/government/briefs/omp-launcher-experiments.md` | yes |
| `.harness/government/briefs/pa-efficient-bug-2026-08-09.md` | yes |
| `.harness/government/briefs/pa-lastEventAt-frozen-2026-08-01.md` | yes |
| `.harness/government/briefs/pa-missing-anaconda-2026-07-31.md` | yes |
| `.harness/government/briefs/pa-standup-recipe.md` | yes |
| `.harness/government/briefs/pa-value-survey-2026-08-02.md` | yes |
| `.harness/government/briefs/pm-unwilling-butterfly-2026-07-29.md` | yes |
| `.harness/government/briefs/pr14-reconcile.md` | yes |
| `.harness/government/briefs/prime-feedback-triage-2026-07-18.md` | yes |
| `.harness/government/briefs/retired-ruling-audience-2026-08-03.md` | yes |
| `.harness/government/briefs/round-mandate-detection-state.md` | yes |
| `.harness/government/briefs/round-mandate-identity.md` | yes |
| `.harness/government/briefs/s036-adoption.md` | yes |
| `.harness/government/briefs/s037-adoption.md` | yes |
| `.harness/government/briefs/s038-brief.md` | yes |
| `.harness/government/briefs/s039-brief.md` | yes |
| `.harness/government/briefs/s040-adoption.md` | yes |
| `.harness/government/briefs/s041-brief.md` | yes |
| `.harness/government/briefs/s042-brief.md` | yes |
| `.harness/government/briefs/s043-brief.md` | yes |
| `.harness/government/briefs/s044-brief.md` | yes |
| `.harness/government/briefs/s045-brief.md` | yes |
| `.harness/government/briefs/s046-brief.md` | yes |
| `.harness/government/briefs/s047-brief.md` | yes |
| `.harness/government/briefs/s048-brief.md` | yes |
| `.harness/government/briefs/s048-build.md` | yes |
| `.harness/government/briefs/s048-pi-mono-hardening-note.md` | yes |
| `.harness/government/briefs/s050-focus-agents.md` | yes |
| `.harness/government/briefs/s051-pij-identity-integrity.md` | yes |
| `.harness/government/briefs/s052-update-pi-reliability.md` | yes |
| `.harness/government/briefs/s053-focus-sqlite-backend.md` | yes |
| `.harness/government/briefs/s054-pij-grown-up.md` | yes |
| `.harness/government/briefs/s055-pij-watchdog.md` | yes |
| `.harness/government/briefs/s074-pij-rail-v2-brief.md` | yes |
| `.harness/government/briefs/s075-denorm-clearing-ratification-ask.md` | yes |
| `.harness/government/briefs/s075-task-asymmetry-brief.md` | yes |
| `.harness/government/briefs/s076-watchdog-parked-brief.md` | yes |
| `.harness/government/briefs/s077-fallback-resurrection-brief.md` | yes |
| `.harness/government/briefs/s077-fix-authorization.md` | yes |
| `.harness/government/briefs/s078-pa-role-brief.md` | yes |
| `.harness/government/briefs/s078-pa-role-ratification-ask.md` | yes |
| `.harness/government/briefs/s082-chore-primitive-stream-brief.md` | yes |
| `.harness/government/briefs/s091-pa-gate-repair.md` | yes |
| `.harness/government/briefs/s101-daemon-tick-cost.md` | yes |
| `.harness/government/briefs/s102-stall-notice-discriminator.md` | yes |
| `.harness/government/briefs/seat-handover-3vetx8-to-primary-carp.md` | yes |
| `.harness/government/briefs/seat-handover-primary-carp-to-reasonable-dove.md` | yes |
| `.harness/government/briefs/seat-name-generator-bias-2026-08-01.md` | yes |
| `.harness/government/briefs/subscriptions-outlive-seats-2026-08-01.md` | yes |
| `.harness/government/briefs/tmux-smarts-poc-2026-07-19.md` | yes |
| `.harness/government/briefs/watchdog-pa-ineligible-2026-08-01.md` | yes |
| `.harness/government/canaries/s036.md` | yes |
| `.harness/government/canaries/s037.md` | yes |
| `.harness/government/canaries/s038.md` | yes |
| `.harness/government/canaries/s039.md` | yes |
| `.harness/government/canaries/s040.md` | yes |
| `.harness/government/canaries/s044.md` | yes |
| `.harness/government/canaries/s045.md` | yes |
| `.harness/government/canaries/s046.md` | yes |
| `.harness/government/canaries/s047.md` | yes |
| `.harness/government/canaries/s048.md` | yes |
| `.harness/government/canaries/s054.md` | yes |
| `.harness/government/canaries/s055.md` | yes |
| `.harness/government/canaries/s102.md` | yes |
| `.harness/government/collision-evidence-2026-07-18.md` | yes |
| `.harness/government/doctrine/a-baseline-stores-a-point-not-a-path.md` | yes |
| `.harness/government/doctrine/a-constraint-outlives-the-fix-that-retires-it.md` | yes |
| `.harness/government/doctrine/a-coupled-instrument-cannot-report-its-subject.md` | yes |
| `.harness/government/doctrine/an-instrument-that-punishes-diligence-is-inverted.md` | yes |
| `.harness/government/doctrine/ask-what-else-satisfies-the-shape.md` | yes |
| `.harness/government/doctrine/preconditions-travel-with-remedies.md` | yes |
| `.harness/government/doctrine/rigour-follows-the-claim-you-want.md` | yes |
| `.harness/government/handover/2026-07-28-inherited-open-handles.md` | yes |
| `.harness/government/handover/2026-07-28-reasonable-dove-to-wee-albatross.md` | yes |
| `.harness/government/handover/2026-07-30-butterfly-read-prime-cards.md` | yes |
| `.harness/government/handover/2026-08-10-wee-albatross-to-continuing-ermine.md` | yes |
| `.harness/government/handover/2026-08-12-continuing-ermine-live-state.md` | yes |
| `.harness/government/incidents/INC-001.md` | yes |
| `.harness/government/incidents/INC-002.md` | yes |
| `.harness/government/observations/pa-context-cost-experiment.md` | yes |
| `.harness/government/observations/s102-pm-compliance.md` | yes |
| `.harness/government/observations/s102-stall-prereg.md` | yes |
| `.harness/government/orient-local.md` | yes |
| `.harness/government/prime-flow.json` | yes |
| `.harness/government/prime-flow.md` | yes |
| `.harness/government/rulings/2026-07-31-primes-owe-status-cards.md` | yes |
| `.harness/government/rulings/2026-08-02-s082-chore-primitive-kickoff.md` | yes |
| `.harness/government/rulings/2026-08-05-prime-succession-ermine.md` | yes |
| `.harness/government/spine.md` | yes |

## Harness handover

Encoded improvement: tested government-root resolution replaces machine-path guessing; the missing-root diagnostic names the bootstrap action. Migration fixtures prove dry-run byte nonmutation, preservation, collision refusal, dirty/in-progress/concurrent-source rejection, configured hooks and the actual prime handoff.

Observations are preserved in `agent/session-buffer.md` for the prime's governance-side harvest; this worker did not write the standing ledger. Dependency bootstrap used only per-package/.bin symlinks to main's installed dependencies. The sibling worktree-deps stream owns the permanent bootstrap improvement. The full-gate runtime-startup flake and the C1 duplicate-prose test correction are recorded with their dispositions.

Noteworthy existing documentation skew: C1/C3 still carry legacy slash-control wording; peer.md retains the rs explicit-command/no-literal-fallback contract. This task preserved that rs gesture and did not expand into rewriting unrelated conventions.
