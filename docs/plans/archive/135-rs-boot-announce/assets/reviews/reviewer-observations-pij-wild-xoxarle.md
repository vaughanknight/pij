- id: INS-001
  kind: insight
  description: "A green 'cargo test --workspace' proved nothing about the committed tree: commit c5069fe0 moved a fixture, its 'git add' file list named the now-missing old path so the WHOLE add aborted, and 2>/dev/null hid it. The working tree carried the fix, the commit did not, and every gate ran against the working tree. Three pij-daemon tests were left failing on main. No sensor in this repo compares 'what I built' with 'what I committed'."
  target: project-sensor
  severity: blocking
  workaround: "Ran cargo test -p pij-daemon --lib registration_binding by hand as the first act of review; it failed in 19s."
  suggested_encoding: "Add a harness checks sensor that runs every committed test path referenced by a fixture, or simply make 'harness checks' the only accepted gate receipt and require it be run on a CLEAN tree (git stash -u equivalent / git worktree of HEAD), not the working tree."
  fp: 2aa1b934c695
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T01:50:29.558Z"
- id: DL-001
  kind: difficulty
  description: "Re-deriving a RED-first claim as a READ-ONLY reviewer has no supported path. Every obvious move (git stash, git worktree add, checking out the base) mutates the repo and is forbidden by the review fence, so proving 'this witness fails on the pre-fix tree' required hand-rolling a detached copy in /tmp."
  target: tooling
  severity: annoying
  workaround: "Extracted the merge parent with 'git archive <sha> | tar -x -C /tmp/pij-base-135', symlinked node_modules from the main checkout, copied only the NEW test files plus the fixture onto it, ran vitest there."
  suggested_encoding: "A 'harness red-witness <base-sha> <test-paths...>' recipe that builds the throwaway base tree, overlays named test files, runs them and reports which fail — so RED-first evidence is reproducible by a reviewer in one verb instead of six commands and a fence-safety argument."
  fp: 1a314acd679a
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T01:51:32.805Z"
- id: INS-002
  kind: insight
  description: "Two things this plan added are emitted-but-never-read: the register response's proc_source (the ONLY signal distinguishing a real harness binding from a pane-shell fallback) has zero consumers outside daemon tests, and parseFrame has zero production callers. Both look load-bearing from their own unit's tests and are inert in composition."
  target: project-sensor
  severity: degrading
  workaround: "Read every consumer by grep before believing the field was load-bearing."
  suggested_encoding: "A checks sensor (or a clippy lint) that flags a serialized wire field with no reader on either side of the boundary — 'emitted and never read' is a diagnostic that would have caught proc_source and parseFrame in one pass."
  fp: 7ff7356ac699
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T01:51:32.983Z"
- id: INS-003
  kind: insight
  description: "A reviewer remedy can re-open a control the codebase already rejected, because the rejection lives in a code COMMENT on one branch rather than in a rule that spans branches. I proposed 'prefer the caller claim when the pane walk falls back'; identity.rs:436-450 had already ruled that class out for the paneless branch ('a control whose input the SUBJECT SUPPLIES is not a control'), and nothing would have flagged the contradiction one branch over."
  target: project-sensor
  severity: degrading
  workaround: "Traced every producer of a register claim before endorsing the remedy; found identity.rs:436-450 arguing the opposite case for the adjacent branch."
  suggested_encoding: "Promote the anti-impersonation rule from a comment into a checkable invariant — e.g. a single choke point that admits a process identity only if the daemon OBSERVED it (derived, or claim-selected-from-a-derived-set), so a future remedy cannot re-open it in a branch the comment does not sit in."
  fp: 54d15fa84184
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T01:57:35.813Z"
- id: INS-004
  kind: insight
  description: "A recogniser tested only against synthetic strings gives no signal about WHICH constraint is wrong. harness_command's real defect is the {cli,index} stem whitelist (it rejects a live pij-launched copilot npm-loader.js), while the constraint everyone including me proposed widening — the node|bun interpreter list — is the one that must NOT move: widening it admits 17 omp internal workers as candidate harness processes. The synthetic test suite could not distinguish those two axes because it contains no worker processes and no real loader."
  target: project-sensor
  severity: degrading
  workaround: "Ported harness_command to Python, ran it over all 1743 live processes, then evaluated five recogniser variants over the same snapshot counting both what each accepts and how many internal workers it admits."
  suggested_encoding: "A checks sensor that evaluates any process-recogniser predicate against a LIVE ps snapshot and reports accept/reject counts plus a named exclusion class (e.g. __omp_worker_*) — so 'widen the allowlist' is a measured change with a false-positive count, not a guess."
  fp: 032527f7af37
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:02:00.957Z"
- id: DL-002
  kind: difficulty
  description: "A package-scoped 'cargo test -p pij-tmux' silently includes crates/tmux/tests/adapter.rs, which drives REAL tmux panes on the developer's live machine. Nothing at the invocation site distinguishes it from unit tests; I only learned it was a real-resource test from its failure output, 20 minutes after launching it against a live fleet."
  target: tooling
  severity: degrading
  workaround: "Re-ran everything with --lib and reported the red separately with its caveats; did not re-run the tmux test."
  suggested_encoding: "Mark real-resource test targets as such so they cannot be swept in by a package-level cargo invocation — a required feature flag, a #[ignore] with an explicit --ignored opt-in, or a separate integration target the default 'cargo test -p X' does not build."
  fp: 12923e19c10d
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:51:58.841Z"
