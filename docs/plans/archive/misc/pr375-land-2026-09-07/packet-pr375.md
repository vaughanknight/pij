# Task: land PR #375 — Linux native Copilot delivery and recovery

From: pij-minor-unicorn (prime). Reply only via pij_send to pij-minor-unicorn. Load /pij and /builder first. Worktree `/Users/jordanknight/pi-hacking/pij-pr375-land` (branch `pr375-land`, checked out at origin/fix/linux-native-copilot-recovery). `cd` there. Never touch main's checkout/node_modules (worktree-local node_modules = per-package symlinks into main; never cp, never npm install), the live daemon (port 7461), or global links; never `omp update`. Rust via `~/.cargo/bin/cargo` (1.98 pinned; bare cargo is Homebrew 1.95). Isolated daemon recipe for any live proof: own port, --state-dir, isolated HOME + Claude homes, own tmux socket (`tmux -L`).

## The PR
`gh pr view 375` / `gh pr diff 375`. Draft from Jordan's other (Linux) machine; base layer of a stack (#376 sits on it and is being reconciled by another seat — do not touch #376). 7 files: .copilot/extensions/pij/{extension,store}.mjs (+tests), crates/daemon/src/registration.rs, docs/how/copilot-native-extension.md, harness/scripts/copilot-native-smoke.ts. Claims: (1) identify Linux native Copilot hosts from /proc/<pid>/exe not ps comm; (2) keep native completion ancestry across consecutive foreground interactions; (3) let an independently verified dead native owner resume its address while retiring a temporary bootstrap registration; (4) rollover smoke fixture uses explicit semantic Hold after #374.

## Do
1. Rebase onto origin/main (e062f070 or later); resolve conflicts honestly (registration.rs was touched by 137/#369/#371 on main).
2. Review each claim against main's code: for (1) note that main's read_native_process already reads /proc/<pid>/exe (registration.rs ~:831) — establish what the PR actually changes and whether it is still needed; for (3) check it cannot let a live owner be displaced (recycled-pid rules, plan 095) — this is the risky one; write the argument down.
3. Gates on macOS: `cargo test --workspace`, clippy -D warnings, fmt; `just copilot-native-test`; touched vitest files + typecheck via main's binaries. Linux behaviour is proven by CI on the PR — push your rebased branch to `pr375-land` on origin and read the CI result (you may push THIS branch; never main).
4. Live: run the Copilot native smoke recipe (`just copilot-native-smoke --mode manual --provider local` from the packet's isolation rules) once on your rebased tree.
5. Report: rebased sha, per-claim verdict (needed / redundant / risky-with-argument), gate tails, CI link, anything not run. I merge. Do not merge, do not close #375.
