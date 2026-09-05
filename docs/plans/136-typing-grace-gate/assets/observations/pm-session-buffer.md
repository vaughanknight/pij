- id: DL-001
  kind: difficulty
  description: "npm install fails in any fresh worktree: project .npmrc min-release-age=7 makes npm 11.10 pass --before to its own child during git-dep preparation, which then refuses ('--min-release-age cannot be provided when using --before'). CLI flag and npm_config_min_release_age env both fail to reach the child; only temporarily deleting the min-release-age line from .npmrc works. Every coder worktree will hit this before it can typecheck."
  fp: 1af964cc6de6
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:23:08.181Z"
- id: DL-002
  kind: difficulty
  description: "smoke scenario file-watch-notify fails inside the full 'just smoke' run but passes in isolation (npx tsx harness/scripts/smoke.ts file-watch-notify -> ok, 3.3s) — intermittent under full-suite conditions, so 'harness boot' red does not mean the tree is red. Baseline noise on 136 worktree at branch point."
  fp: 6737d76276ad
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:24:42.988Z"
- id: DL-003
  kind: difficulty
  description: "The global pij node CLI loads the MAIN checkout's .pi/extensions/pij/cli.ts regardless of cwd, so one broken node_modules in main takes out pij spawn/send/report for EVERY seat in every worktree simultaneously (observed 09:41-09:44: ERR_MODULE_NOT_FOUND on the git dep minih). pij-rs was unaffected and was the only working peer channel. Two consequences worth encoding: (a) a repo-wide single point of failure with no health check — 'pij doctor' does not exist for this; (b) worse, two seats independently tried to repair it and raced (prime and PM), because node_modules has no declared owner and no lock."
  fp: 0a179c654592
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:44:13.339Z"
- id: DL-004
  kind: difficulty
  description: "Concurrent npm install in the same node_modules by two agents produces ENOTEMPTY rmdir failures that read as filesystem corruption rather than as contention — neither party can tell from the error that another writer exists. A repair-lock or an advisory 'who owns node_modules' marker would have turned a 6-minute mutual-sabotage window into an immediate refusal."
  fp: d640d2147ffe
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:44:13.715Z"
- id: DL-005
  kind: difficulty
  description: "rust-analyzer in a fresh coder worktree resolves symbols but returns EMPTY reference/callsite results until the crate has been checked once — a coder reading that as 'no callers' would ship a signature change believing nothing consumed it. The empty result is indistinguishable from a true absence (same failure shape as the ripgrep --hidden trap in AGENTS.md: a probe's readiness gets reported as a property of the repo)."
  fp: 15e8c8a9279b
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:53:59.491Z"
- id: CONF-001
  kind: confusion
  description: "Cross-unit constant dependency was invisible in the impl-guide's fan-out: u3's frozen interface takes grace_ms as a parameter, which reads as decoupled, but preserving a zero-arg default constructor requires u2's DEFAULT_TYPING_GRACE_MS at COMPILE time — so 'u1 || u2 || u3, no shared file' was true for writes and false for builds. Tenet 10 says fences partition write intent, not the build; this is a concrete instance. The impl-guide could have caught it by asking, for each unit, 'what must EXIST for this unit to compile green standalone', not just 'what files does it write'."
  fp: 6e9f414d9f1f
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:00:18.432Z"
- id: DL-006
  kind: difficulty
  description: "Messages pushed to a working omp seat can be consumed by that seat's ACTIVE TOOL-SUBAGENT rather than its main context (u2 pij-immense-hawk reported my rulings arriving inside its PointerRedWitness subagent and having to be forwarded; u1 kept acting on a parked seam I had already unparked). Delivery succeeds, the receipt says delivered, and the intended reader never sees it — a silent mis-delivery inside the seat, not a transport failure, so nothing in the spine or the receipt can reveal it. Relevant to plan 136 itself: injection-time targeting inside a seat is as load-bearing as the hold decision."
  fp: bf9b60460593
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:00:45.744Z"
- id: DL-007
  kind: difficulty
  description: "harness checks reports a failing stage by embedding the command tail inside one minified JSON line and writes no durable report (.harness/extensions/checks/extension.ts:128,136-138). Any consumer with a line-length limit — every agent tool surface here truncates at 768 chars — sees 'test failed' with the failing test NAMES cut off, so the agent must re-run a scoped suite just to learn what broke. The gate knows the answer and throws it away at the moment of failure, which is the one moment it is needed."
  fp: 224addf1bad0
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:18:28.965Z"
- id: DL-008
  kind: difficulty
  description: "harness team tidy REFUSED all three 136 coder worktrees with E_UNPUSHED_COMMITS ('60 commits that exist nowhere else'), but every named commit is provably an ancestor of local main — git merge-base --is-ancestor returned yes for c8965d81, 4778b84c, 852f6d30, b1d22042 and c1f17eb4. The check appears to require a REMOTE tracking branch and treats 'not pushed' as 'exists nowhere', so in a repo that never pushes it refuses every merged worktree it was built to clean up. Worse for trust: the refusal is phrased as data loss, which is exactly the claim an operator cannot safely ignore, so the tool's one safety message is the one that cries wolf. Worked around with git worktree remove after verifying by sha that all three observation buffers were already committed."
  fp: b4c11c1031c1
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T03:05:58.210Z"
