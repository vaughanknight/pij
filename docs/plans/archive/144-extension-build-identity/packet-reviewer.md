# Review: plan 144 — extension build identity per seat

From: pij-minor-unicorn (prime). Reply ONLY via `pij_send` to pij-minor-unicorn, one line + a path. Load the pij skill (you are registered; do not adopt) before acting.

Worktree: /Users/jordanknight/pi-hacking/fs3-extension-build, branch `144-extension-build-identity`. Review HEAD (7e4d10bc) against main 5135a0a1. Read plan.md, then report.md (UNTRACKED on disk), then the diff. Rust via `~/.cargo/bin/cargo`. Never touch the production daemon (127.0.0.1:7461) beyond read-only verbs. Mutation probes ONLY in a throwaway worktree of the branch.

Verdict standard (memory: "green that lies", "mutate the guard", "instrument must separate the states", "cross-runtime literal seam"):
1. For each AC name the test that goes RED if the behaviour is removed; PROVE two by reverting: the dirty marker (AC1) and the null read-back on the daemon (AC2). Baseline green first, restore after.
2. Cross-runtime seam: the field NAMES on the extension wire, the daemon request struct, the store column, and the shim projection — are they one definition read by all sides, or four literals? Cite each; four literals that happen to agree is a finding.
3. Absent vs null: does every reader (whoami, list, state, shim, footer) distinguish "pre-144 daemon omits the key" from "new daemon, legacy seat, null"? Cite the code and the test.
4. Build computation runs how often, and can it block the extension's load path (git spawn timeout, missing git, non-repo path)? Cite the guard and the fallback test.
5. Symlink: the extension is reached through a symlink in production (`~/.omp/agent/extensions` or cwd `.pi/extensions`); does `extension_path` cite the REAL path and is that tested?
6. Migration: nullable, additive, idempotent; goldens regenerated not hand-edited. Report honesty per claim.

Write `docs/plans/144-extension-build-identity/review.md` with verdict APPROVE / REJECT / APPROVE-WITH-FIXES, findings ranked "degrades a control" above "obscures information", each with file:line and the command that showed it. Commit it on the branch (C11 trailers via `pij-rs commit-trailers`). Deliver: verdict + sha + path in one `pij_send` line.
