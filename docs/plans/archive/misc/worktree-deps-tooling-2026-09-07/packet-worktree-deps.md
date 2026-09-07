# Task: first-class worktree dependency tooling (`just worktree-deps` + readiness check)

From: pij-minor-unicorn (prime). Reply only via pij_send to pij-minor-unicorn (re-read your inbox after any subagent fan-out). Load /pij and /builder first. Worktree `/Users/jordanknight/pi-hacking/pij-worktree-deps-tooling` (branch `worktree-deps-tooling`, off main). `cd` there. Never touch main's checkout/node_modules, the live daemon (port 7461), or global links; never `npm install`/`npm ci` anywhere; never `omp update`. Rust via `~/.cargo/bin/cargo`.

## Jordan's ruling (2026-09-07)
The repo's `.npmrc` `min-release-age=7` quarantine STAYS (supply-chain defence) — it breaks `npm install` for git dependencies in fresh worktrees. Every coder this week (whitefish, odette, mastodon, gazelle, ikrie, mockingbird, inigo, alpaca, sma) rediscovered the workaround by hand: a worktree-local `node_modules` made of per-package symlinks into main's `node_modules`. Jordan: "give them first-class tooling".

## Do
1. `just worktree-deps [<main-checkout>]` (default: the canonical checkout resolved via `git worktree list`'s main entry, never a hardcoded path): builds `<worktree>/node_modules` as a real directory containing one symlink per top-level package (and scoped `@org/pkg`), plus `.bin` entries, plus `@types`, resolved from main's `node_modules`; refuses if the target already has a real (non-symlink) package dir; idempotent; prints a count of links and a verification that `node_modules/.bin/vitest`, `tsc`, and `@types/node` resolve. Never copies (a `cp -R` through symlinks nested `node_modules/node_modules` on 2026-09-05). Works from zsh and bash (no glob NOMATCH traps: use `find`/`nullglob`).
2. `just worktree-deps --check` / a harness readiness sensor `worktree-deps` that, in a linked worktree, reports READY / NOT-READY (with the exact command to run) BEFORE any typecheck/vitest is attempted; wire it into `harness boot` (or the checks roster) so TS2688 is never the first symptom. Advisory only, never blocking a Rust-only task.
3. Docs: one paragraph in docs/how/pij.md (or the existing worktree how-to) and a cite from the pij-team coder packet template (`.agents-skills-port/pij-team/templates/**`): "run `just worktree-deps` first". Token-lean.
4. Tests: a shell/vitest test that builds the link dir into a temp worktree fixture from a fake main `node_modules` (scoped + unscoped + .bin), the refusal on a real package dir, and idempotency. Existing gates green; `just` skill checks if templates changed.
5. Live proof: run it in THIS worktree, then `npm run typecheck` and one vitest file via the linked `.bin` pass. Paste outputs.
6. Deliver one commit carrying your pij trailers (`pij-rs commit-trailers` prints them) + report: sha, gate tails, proof. No push/PR/merge.
