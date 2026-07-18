# s052 cold review request — authoritative npm resolution

**Do not start until the orchestrator explicitly releases you after coder completion.**

Review the final unstaged s052 diff independently against:

- live owner brief: `/Users/jordanknight/pi-hacking/pij/government/briefs/s052-update-pi-reliability.md`
- `docs/plans/052-update-pi-reliability/reports/design-contract.md`
- `docs/plans/052-update-pi-reliability/tasks/implementation.md`
- implementation and execution evidence in the adjacent reports/reviews paths

## Mandatory lenses

1. **SFI authority:** every npm pull/read/resolution/download/install/check is Microsoft-proxy-only; no direct npmjs read, comparison, fallback, or diagnostic; fixture-only upstream receives zero governed requests.
2. **Independent age:** every fresh resolution keeps client age 7; only frozen root lock replay clears age, while retaining explicit proxy + online enforcement.
3. **Cache recovery:** `prefer-online` materially revalidates stale cached metadata and follows current proxy truth.
4. **Fail closed:** proxy inconsistency, corrupt/missing tarball, and missing exact lock artifact remain non-zero; no retry/fallback/cache deletion/lock rewrite.
5. **Coverage:** Unix/Windows install/update, global npm, Pi nested installs, prerequisites, extension update, audit/checks, root npm/npx, and local pinned tools use the intended seam.
6. **Runtime hardening:** `just pij` cannot auto-install tsx; doctor detects the stale global bin target without an invalid realpath comparison. Blocked packaging paths remain untouched and residual npx scope is disclosed.
7. **Hermeticity and disposable validation:** tests/probes use temp HOME/cache/config and local registries; accepted full-gate evidence applies the exact 23-file inventory at base `591f188f394ab17d8c34a800fd55f87c752d4005`, uses a dedicated short tmux server, and confines npm/Pi writes. Explicitly adjudicate the first rejected validation attempt, which reused the existing tmux server and left a real `~/.pi/agent/sessions/...pij-s052-validation-k_uajea4...` residue plus real npm-cache activity. Confirm it is disclosed, uncleaned, excluded from accepted proof, and does not contaminate the implementation diff. Distinguish concurrently volatile real session/cache trees from unchanged critical configs, package roots, and installed Pi. No live npmjs call.
8. **Diagnostics:** proxy-only; actual age-eligible resolution precedes packing; verdicts are truthful and cleanup is guaranteed.
9. **Windows:** real PowerShell, no mock/skip; all four variables set/cleared/restored under deliberate error; finite 30s child < derived 35s named test; no global timeout.
10. **Vetter semantics:** add/bootstrap/audit remain report-and-continue and strict `pkg vet` behavior is unchanged.
11. **Boundaries:** no manifest/lock/settings/package YAML/CI/government/.pi extension/flow-pair/unrelated product changes.

## Dimension 0 / non-vacuity

Prove with file/line and execution evidence that the focused suite would fail if any of these were weakened:

- online revalidation removed;
- registry changed or caller override retained;
- age lowered/omitted or caller `before` retained;
- fixture upstream fallback added;
- missing/corrupt proxy artifact accepted;
- exact lock replacement allowed;
- Windows restoration removed;
- local pij tool path reverted to opportunistic npx.

Run focused tests independently plus appropriate typecheck/lint in the implementation worktree. Do **not** run `harness checks` or `just self-check` there. Independently inspect `reports/disposable-validation.md`, `reports/disposable-harness-checks.json`, and `reports/disposable-validation-inventory.json` showing the exact diff applied at base `591f188f394ab17d8c34a800fd55f87c752d4005`; if a full-gate rerun is necessary, create another disposable isolated clone/check-out so `.pi/packages.yaml` in the implementation worktree is never mutated/restored. Do not perform live proxy/npmjs or global mutation. Inspect actual diff, first-attempt residue disclosure, and protected status; do not trust the coder report alone.

## Output

Write only:

- `docs/plans/052-update-pi-reliability/reviews/cold-review.md`

Verdict must be `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED`, with findings ordered by severity and exact file/line evidence. No product edits, stage, commit, push, fetch, or rebase. Send a pointer-only completion message and idle.
