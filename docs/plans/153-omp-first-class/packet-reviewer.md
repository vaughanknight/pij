# Review: plan 153 — omp is a harness, not a switch on pi (reviewer: pij-sunny-tarsier)

From: pij-far-jackal (prime). Reply ONLY via `pij send pij-far-jackal --body-file <path>`: VERDICT + path. You are registered; do not adopt. Load the pij skill and the builder skill. Read-only on the branch; write ONLY docs/plans/153-omp-first-class/review.md (+ reviewer-probes/).

Worktree: /Users/jordanknight/pi-hacking/fs3-omp-first-class, branch 153-omp-first-class. Merge-base cf08eacd; review `cf08eacd..00f04769` (plan bddccbe4 mine; code f6a0e058; evidence 00f04769). Diff against the MERGE-BASE, not origin/main — main has since taken 151, so a diff against main shows 151 files as deletions; they are not. `git merge-tree` against main is conflict-free (prime checked). `cd` there; `just worktree-deps` if needed; never touch main's node_modules; production daemon read-only; isolated daemon for anything live.

Read plan.md, report.md, then the diff. `pij report now "read 153" "probing"`.

Verdict bar — APPROVE only if each holds with a pasted probe:
1. **The move is pure.** 370 renames `.pi/extensions/pij/**` → `.omp/extensions/pij/**` (R091–R100). For every rename below R100 the content delta is the omp/pi split and nothing else — list each such file with its delta in one line. `.pi/extensions/pij` is now a symlink; confirm target, and that `readlink -f` from an omp seat's recorded `extension_path` still resolves into the repo.
2. **Live-machine transition.** This merge changes where the canonical checkout's extension lives while ~9 omp/pi seats are running from `.pi/extensions/pij`. Trace: (a) running seats keep loading (symlink) until their own restart; (b) `harness/scripts/link-global.ts` — what does `~/.omp/agent/extensions/pij` point at after `just` re-links, and does it need a manual step after merge? Name it; (c) `just self-check`, `worktree-deps`, `tsconfig.json`, `vitest.config.ts` all resolve the new path; (d) Copilot's `.copilot/extensions/pij` is untouched (git shows M only via base drift — confirm zero delta vs merge-base).
3. **AC1 pij_spawn harness is required with no default**; `bin` refused as a harness selector; `harness:"omp"` launches `omp` with omp's flag translation. Mutate: restore a default of `"pi"` and show which test goes red.
4. **AC2 retired-harness policy.** Where does `PIJ_RETIRED_HARNESSES` get its machine default (config.rs? justfile bounce-rs?) — after merge and `just bounce-rs`, is `pi` actually retired on THIS machine, or only when the env is set by hand? Say which. The `--allow-retired` override writes a spine event: paste it. Refusal envelopes are decodable and name the fix.
5. **AC3** grep receipt = 0 for the joins in `skills/pij/**` and the API doc; sample three rewritten passages for meaning drift (the split must not have changed any rule's substance). Confirm `~/.claude/skills/pij` was NOT edited (checkout relation stated).
6. **AC4 probe honesty**: `home-probe.txt` shows omp discovering the project `.omp/extensions/` — is the probe the real binary at its real config, or a fixture? Cite.
7. **Fence**: `registration.rs`, `.copilot/**`, receiver/delivery paths untouched vs merge-base (prime saw zero delta; confirm).
8. Gates on YOUR checkout: cargo test --workspace, fmt, clippy -D warnings, `npm test` for the extension, `just self-check`.

Verdict: APPROVE / APPROVE-WITH-FIXES (file:line each) / REJECT (why). Report at both edges.
