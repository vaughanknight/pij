- id: DL-001
  kind: difficulty
  description: "ddocs rendered .dd.md truncates long cells (~768 chars) with no visible marker in the cell — PM read a truncated impl-guide units row and had to re-read the raw .dd.json to get the frozen interface; any agent reading the rendered sibling of a packet or impl-guide silently gets a shortened contract"
  fp: 798936b8415f
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:33:56.742Z"
- id: DL-002
  kind: difficulty
  description: "git worktree add gives a tree with no node_modules, so 'harness boot' fails immediately with TS2688 'Cannot find type definition file for node' — reads as a code defect in a fresh coder worktree when it is only a missing 'npm ci'. Every worktree-per-coder dispatch pays this, and the failure names typescript, not dependencies."
  fp: 46a32b79639f
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:35:12.102Z"
- id: DL-003
  kind: difficulty
  description: "rust-analyzer in a freshly spawned omp seat returned 'No definition found' twice for the Registry trait (u1, pij-fit-haddock), pushing the seat back to identifier search to find trait implementors — LSP reports configured but answers as if unindexed, so the seat cannot tell 'no such symbol' from 'not ready yet'."
  fp: de6b726f86b1
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:35:12.278Z"
- id: DL-004
  kind: difficulty
  description: "flowspace3 search over .pi/extensions/pij/* returns path_unmatched in the pij repo while the TS LSP resolves the same files fine (u2, pij-motionless-clam) — the index does not cover the hidden .pi/ tree, and the envelope reports it as an unmatched path rather than an unindexed one, so a dogfooding seat reads it as 'the code is not there'. Same failure class as rg's hidden-path skip documented in AGENTS.md: a probe's default scope gets reported as a property of the repo."
  fp: 35616d385ae3
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:35:32.494Z"
- id: DL-005
  kind: difficulty
  description: "npm ci is unusable in this repo on npm 11.10.0: the git dependency (minih) triggers a nested 'npm install --before=<date>' derived from the repo's own .npmrc min-release-age=7, and npm then refuses its own invocation ('--min-release-age cannot be provided when using --before'). Both coders and the PM hit it independently within minutes. The repo's supply-chain policy and its own installer are in direct conflict, and the only safe workaround (cloning node_modules from an already-installed tree) preserves the policy while npm's suggested paths all bypass it."
  fp: f5e7f095f0f1
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:38:22.302Z"
- id: DL-006
  kind: difficulty
  description: "flowspace3 doctor emits a self-contradictory readiness envelope: daemon down (nothing listening on 127.0.0.1:7373) reported alongside auth accepted, healthy=true and verdict=degraded, with next_action telling the caller to start a daemon — which every worker seat is under a standing prohibition against doing. A seat cannot tell from the envelope whether the tool is usable, and the one action it suggests is the one action that broke PROD twice."
  fp: 2e60fe2c387a
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:38:22.450Z"
- id: CONF-001
  kind: confusion
  description: "PACKET DEFECT (plan 135, mine): I passed the impl-guide's 'bun test .pi/extensions/pij' wording into both coder packets without checking it. The repo's canonical runner is Vitest via 'just test'; bun treats the hidden .pi path as a filter and matches nothing, and the existing suites use vi.stubEnv, which bun lacks. u2 caught it at first run. A test command inside a packet is a contract and must be executed once by the author before dispatch."
  fp: 0a69e6a4dd52
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:38:22.598Z"
- id: DL-007
  kind: difficulty
  description: "INCIDENT, mine: a pij send message body was passed inside a double-quoted bash string and contained unescaped backticks, so the shell ran command substitution on the message TEXT and executed npm ci inside the main checkout, destroying its node_modules mid-flight and breaking the pij JS launcher for every seat plus both coders dependency copies. Two earlier messages survived only because I happened to backslash-escape the backticks. Encodable fix: pij send must never be composed as an interpolated double-quoted shell string - either the CLI grows a stdin/file body mode, or the harness ships a send helper that single-quotes and escapes, because prose destined for an agent will routinely contain backticks and dollar signs."
  fp: 7330ca131e4b
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:49:04.447Z"
- id: DL-008
  kind: difficulty
  description: "harness boot advertises a --full option in its help/docs but the boot verb declares no options, so harness boot --full --json is rejected as an unknown option (found by u1). Worse, bare harness boot DEFAULTS to running just smoke, which spawns real tmux seats - so a coder told not to spawn seats has no documented way to run boot safely and must skip the verb entirely."
  fp: 4cd9e8c6d188
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:49:04.606Z"
- id: DL-009
  kind: difficulty
  description: "rust-analyzer inside a spawned omp seat loads the SPAWN directory workspace (main checkout Cargo.toml, 256 packages) rather than the seat worktree, so every LSP query silently answers about the wrong tree - definitions and references come back empty or wrong while reporting healthy. Same failure class as the relative-path hazard already documented for file tools, but with no visible signal at all: the seat cannot distinguish no such symbol from wrong workspace. Found by u1 via analyzerStatus after two empty definition results."
  fp: 31d4a1c57029
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:49:04.767Z"
- id: DL-010
  kind: difficulty
  description: "cp -Rc SRC DST copies SRC *inside* DST when DST already exists, which during a dependency-tree repair produces the worst available shape: node_modules/.bin/tsx survives as a symlink while node_modules/tsx is an empty directory, so every harness sensor fails with code 127 command-not-found and names the executable rather than the defect. Six red sensors, none of which described the actual problem. Compounding factor: I had declared the tree healthy from a top-level package count (255) and a .bin count (21) - both true, tree unusable. Encodable fix: a harness verb for provisioning a worktree dependency tree that refuses a non-empty destination and verifies by EXECUTING a binary (tsx --version, vitest --version) rather than by counting entries."
  fp: 7804343daca6
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:52:38.718Z"
- id: DL-011
  kind: difficulty
  description: "A worktree node_modules can be a SYMLINK into the main checkout, so a copy aimed at the worktree writes into main and breaks every seat on the machine - which is what happened here at 09:48 and was initially attributed to the wrong plan. Reading through the symlink also makes the damage report name the wrong tree: I inspected the worktree path, saw the nested copy, and reported it as being in the worktree when it was in main. Encodable fix: readlink every node_modules before writing, and have any harness provisioning verb refuse a destination that resolves outside the worktree root. Same class as the relative-path hazard already documented for spawned seats, one level up: the path you inspect and the path you write are both lying in the same direction."
  fp: 2c4a662c899b
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:54:18.291Z"
- id: DL-012
  kind: difficulty
  description: "The load-control cap prescribed fleet-wide today, VITEST_MAX_THREADS, is NOT read by the installed Vitest 4.1.10 at all: its dist references VITEST_MAX_WORKERS (dist/chunks/coverage.DM_a_rWm.js) and contains zero occurrences of VITEST_MAX_THREADS. Found by u2 (pij-motionless-clam), independently confirmed by me. Every capped run today was in fact unbounded, which is the likely mechanism behind repeated flapping of real-binary timing tests while the box sat at load 87-203. A cap that is silently ignored is worse than no cap: it converts an unbounded run into one everybody believes was bounded, so the resulting flakes get attributed to code instead of contention. Encodable fix: the harness should own the concurrency cap (set it in vitest config or a checks wrapper) rather than relying on an env var whose name nobody verifies against the installed major version."
  fp: 00cbdb6eb991
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:58:35.679Z"
- id: DL-013
  kind: difficulty
  description: "Worktree isolation cannot isolate a MACHINE-GLOBAL extension link: every omp seat loads the pij extension through ~/.omp/agent/extensions/pij, a symlink into the MAIN checkout, so a TypeScript fix that is committed, merged and fully green in a plan worktree is simply not the code any live seat runs. The live proof for plan 135 failed at AC1 for exactly this reason - the rebuilt daemon correctly returned binding on the wire while the old extension in main ignored it, producing a silent no-announce identical to the pre-fix symptom. The impl-guide names the daemon-not-restarted version of this hazard (r4) and misses the extension-link twin. Encodable fix: any plan touching .pi/extensions must state in wave 0 where the live proof will read the extension FROM, because the answer is never the worktree."
  fp: d008950b9eec
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:16:35.275Z"
- id: DL-014
  kind: difficulty
  description: "A pij-sidecars process-exit test (direct_child_failure_survives_a_lingering_grandchild) failed inside a full cargo test --workspace run and then passed 10/10 on a quiet single-package re-run of the same tree. Third distinct load-artifact of the day after cli.test.ts and cli.integration.test.ts, all three in crates/files nobody in this plan touched, all three timing-sensitive around real processes. With VITEST_MAX_THREADS proven inert (DL-012) the machine was never actually capped, so these three were misattributed to code before being re-measured quiet. Encodable fix: the checks runner should mark timing-sensitive suites and re-run a failure once in isolation before reporting red, because a flaky red costs more agent time than the test saves."
  fp: c2571f2e4c1c
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:16:35.431Z"
- id: DL-015
  kind: difficulty
  description: "ddocs set refuses the \"text\" part on an acceptance-criteria item even though the key exists in the JSON and renders in the table: it answers \"acceptance_criteria/AC6 declares no part text\" while claim, state, receipt and note all set fine. So the longest and most load-bearing field on an AC — the one that states how it will be proven — is the one field the CLI will not let you amend, and the workaround is to write the amendment into note. Encodable fix: either make text addressable or stop rendering it as an authoritative column."
  fp: 252d20342be6
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:29:30.457Z"
- id: DL-016
  kind: difficulty
  description: "The builder flow archives the plan folder at post-flight, but this plans golden contract fixture LIVES in that folder and is read at test time by two suites (crates/daemon/src/http/tests.rs:445 and .pi/extensions/pij/adapters/rust-runtime.test.ts:33). Closing the flow correctly would therefore break the branch it just proved. Caught because a coder named it in its ASSUMPTIONS section, not because any gate could see it - no check fires until the archive move happens. Encodable fix: either post-flight refuses to archive a plan folder that is referenced from outside docs/plans, or the contracts phase places shared fixtures in a durable home from the start and the plan folder keeps only the pointer."
  fp: 74a17fe9d18e
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:33:37.344Z"
- id: DL-017
  kind: difficulty
  description: "The workspace rust-toolchain.toml pins channel 1.98.0 with a comment citing tenet 10 (EXACT version, never stable, because two seats silently compiling different code from one commit is the parallel hazard with no edit-time signal). That pin is NOT IN EFFECT on this machine and nothing reports it: rustup is not installed at all, and PATH resolves cargo and rustc to Homebrew 1.95.0, which do not read rust-toolchain.toml. Worse, PATH cargo-clippy is clippy 0.1.98 from a different Rust than the 1.95.0 compiling the code - so the linter and the compiler are different versions, and every Rust receipt today (including mine and both coders) cited rustc 1.95.0 as if it were the pinned toolchain when the pin says 1.98.0. Found because a coder noticed rustc and clippy version strings disagreed and reported it instead of ignoring it. Encodable fix: a checks sensor that compares the ACTIVE rustc/cargo/clippy versions against rust-toolchain.toml and fails when they differ - the pin is currently a comment, not a control."
  fp: 486a108fb5f9
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:44:18.301Z"
- id: DL-018
  kind: difficulty
  description: "There is NO working environment cap for this repos vitest suite. VITEST_MAX_THREADS is inert on Vitest 4 (dist reads WORKERS only) and VITEST_MAX_WORKERS did not cap either: with it exported, prime observed my gate running 29 worker processes at ~372 percent CPU with the box at load 382/16 cores and 126GB used. Only the CLI flag --maxWorkers=4 actually capped it (full suite then ran green: 231 files, 4690 tests). vitest.config.ts sets no pool or maxWorkers, so npm run test defaults to CPU count and harness checks has no way to pass a flag. Consequence: every full gate on this box is an uncapped fork bomb, which is the true source of the four timing-artifact failures adjudicated today. Encodable fix: set test.maxWorkers in vitest.config.ts (or cap in the npm script) so the gate is bounded by construction rather than by an env var nobody can make work."
  fp: 13659067173e
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T01:28:28.070Z"
- id: DL-019
  kind: difficulty
  description: "A git add whose file list included a path I had just deleted ABORTED THE WHOLE ADD, and I had suppressed its stderr — so two files (the Rust fixture consumer and the contract README) were never staged, the working tree carried the fix, the committed tree did not, and cargo test --workspace then went GREEN against the working tree. Main shipped red: three daemon tests failing deterministically with NotFound. This is the exact done-bar rule I wrote into all four coder packets (prove the change is in the tree you BUILT; an exit code is honest about what it built and silent about what it did not), broken by the PM who wrote it, in the one commit that moved a file two suites read at test time. Found by the cross-model reviewer in one command. Encodable fixes: never suppress stderr on a staging command; and after any commit that MOVES a consumed file, verify from git show HEAD or a clean checkout rather than from disk."
  fp: 009296e3e117
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T01:36:42.211Z"
- id: DL-020
  kind: difficulty
  description: "The MAIN checkout cannot pass its own lint gate, and has not been able to since 22 August: .claude/settings.local.json is an UNTRACKED, machine-local Claude permissions file that biome.json includes in its check set, so npm run lint reports \"Found 1 error\" and both the lint and windows-compat sensors fail in main while every worktree gate is green (worktrees do not carry the untracked file). Consequence for a plan: the composed branch gates green, the merge target is red for an unrelated reason, and the difference is invisible until someone runs checks in main. Encodable fix: gitignore plus biome-ignore the machine-local settings file so the canonical checkout can pass its own gate - a repo whose gate is permanently red in its main clone teaches everyone to read red as normal."
  fp: e223b36c37a5
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T01:45:01.287Z"
- id: DL-021
  kind: difficulty
  description: "REVIEWER-CONTRIBUTED (pij-wild-xoxarle, plan 135): no sensor anywhere compares what a gate BUILT with what was COMMITTED. A green cargo test --workspace proved nothing about the committed tree, and main shipped red because two files were never staged. The reviewer named this independently as INS-001 after finding the defect. Encodable fix: a checks sensor that refuses when tracked files differ from HEAD, or a done-receipt helper that prints git show HEAD:<file> for each changed file."
  fp: 3f114b247ff6
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T01:54:05.302Z"
- id: DL-022
  kind: difficulty
  description: "REVIEWER-CONTRIBUTED (plan 135, DL-001 in its buffer): a READ-ONLY reviewer has no supported path to re-derive RED-first evidence — every obvious move mutates the repo. This one solved it by git archive of the merge parent into /tmp plus a node_modules symlink and an overlay of only the new test files, which is the strongest form of the AC5 check and proved the twelve witnesses fail for the RIGHT reasons rather than exploding on missing imports. That recipe should be a harness verb, not a thing each reviewer reinvents under a read-only fence."
  fp: fde90d17ed39
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T01:54:05.603Z"
- id: DL-023
  kind: difficulty
  description: "REVIEWER-CONTRIBUTED (plan 135, INS-002): emitted-but-never-read fields look load-bearing in their own units tests and are inert in composition. Two in one plan: proc_source is serialized by the daemon and has ZERO consumers (not in the TS descriptor type, not in pij-rs state, not in pij list, only daemon tests), and parseFrame has no production callers at all, so AC8s legacy-parse half is a property of dead code. Both passed every unit gate. Worse, the inert proc_source is what let a MAJOR seam defect hide: nothing could observe that register had written a pane-shell identity. Encodable fix: a sensor for wire fields and exported functions with no non-test consumer."
  fp: 047cbbe084a8
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T01:54:05.827Z"
- id: DL-024
  kind: difficulty
  description: "A PM ruling can switch off a security control while every gate stays green, because there is no test for a control that was REMOVED. On plan 135 I ruled that register should keep a caller-asserted pid when the daemon pane-walk fell back to the shell — re-admitting subject-supplied evidence exactly when the daemon own evidence had failed, with the only surviving check proving liveness and nothing about the pane. The repo had already written the argument against it (identity.rs:436-450: a control whose input the SUBJECT supplies is not a control; accepting a claim meanwhile is not a stopgap, it is the control switched off) and marks the claimed pid DIAGNOSTIC ONLY at identity.rs:119-122 — and I had read neither before ruling. The cross-model reviewer withdrew its own remedy on the same grounds and proposed the fix that keeps the control: accept the claim only if the claimed pid is in the pane OWN process subtree, so the claim SELECTS among processes the daemon observed rather than supplying evidence. Encodable fix: when a ruling touches an admission or bind path, the dispatch must cite the existing doctrine comment in that file or state that none exists — the prohibition was already written, in the file being changed, and got past both the PM and the unit author."
  fp: 6d59887ca008
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T01:58:05.354Z"
- id: DL-025
  kind: difficulty
  description: "REVIEWER-CONTRIBUTED (pij-wild-xoxarle, plan 135, INS-003): the anti-impersonation rule is a COMMENT ON ONE BRANCH, not an invariant across them. identity.rs:436-450 states that a control whose input the subject supplies is not a control, and identity.rs:119-122 marks the claimed pid never-admissible — but nothing enforces that across the register path, so a PM ruling and a reviewer remedy BOTH proposed re-admitting a caller-asserted pid four hours apart without either noticing the prohibition sitting in the file being changed. Encodable fix: make the rule an invariant with a test (or a type that cannot carry claimed identity into a bind decision) rather than prose in one branch. Paired with INS-001: nothing compares what a gate built with what was committed. Same shape of hole in two substrates — a rule that exists only as text no sensor reads."
  fp: 1212c4c95577
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T01:58:42.881Z"
- id: DL-026
  kind: difficulty
  description: "THIRD INSTANCE IN ONE PLAN of the same defect shape: a MISSING FIELD FROM AN OLDER WRITER READ AS A MISMATCH RATHER THAN AS NO OPINION. (1) The announce bug itself: the extension inferred freshness from row-absence, so under rs where a row always exists it silently meant \"not fresh\" — no seat announced for six days. (2) pid_domain: a Claude 2.1.241 session record and peer key both lack the field, so matching_peer_token treats absent-vs-absent as a mismatch, yields no token, and the delivery silently drops to typed-to-pane even though the socket connects (found by prime on pij-lonely-antelope AFTER the remediation sweep). (3) proc_source: emitted and never read, so a pane-shell binding was unobservable. Encodable fix is doctrine, not three patches: an ABSENT optional field from an older writer means \"no opinion, behave as before\" and must never mean \"mismatch\" or \"false\"; the extras-first wire rule (tenet 6) needs this stated as its second half, because every one of these three shipped green. Related: all three workarounds are gestures nobody makes - re-adopt the seat, restart Claude on the current build, sweep the fleet."
  fp: 19753f95d78a
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:00:33.267Z"
- id: DL-027
  kind: difficulty
  description: "A remedy dispatched from a round-1 finding was REVERSED by the round-2 evidence the same reviewer had promised to gather: the fix was \"widen the interpreter allowlist to admit bun.exe\", and a real ps sweep (1743 processes, 106 harness candidates) showed all 17 bun.exe rejects are __omp_worker_* internals parented to a real bun omp - so widening would make 17 worker processes eligible to be selected as a pane harness, binding seats to processes that are real, live and wrong. The genuinely broken constraint was the one neither PM nor reviewer questioned: a {cli,index} file-stem whitelist that rejects a real pij-launched entrypoint (node .../@github/copilot/npm-loader.js --allow-tool=pij_send). A five-variant counterfactual over the same live data decided it, scoring each on acceptance AND worker admission. Encodable fix: when a recogniser or allowlist is widened, the change must be scored against the live population it will run on, counting what it newly ADMITS as well as what it newly accepts - the failure mode of widening is never visible in the case that motivated it."
  fp: ae27828da34a
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:02:32.892Z"
- id: DL-028
  kind: difficulty
  description: "REVIEWER-CONTRIBUTED (pij-wild-xoxarle, plan 135, INS-004): a recogniser tested only on synthetic strings cannot tell you WHICH constraint is wrong, because the suite contains neither a worker process nor a real loader. Todays proof: the pinned unit test suite passes on all 11 cases while the recogniser simultaneously rejects a real pij-launched copilot entrypoint (stem npm-loader not in the {cli,index} whitelist) and would, if widened along the axis both PM and reviewer first proposed, admit 17 __omp_worker internals as candidate harnesses. Encodable fix: a sensor that scores a predicate against a live ps snapshot and reports BOTH acceptance and a named exclusion class, turning \"widen the allowlist\" into a measured change with a false-positive count. Corollary the reviewer applied to itself: it validated its Python port against all 11 pinned Rust cases before letting its counterfactual table drive a code change - a reversal argued from an unverified instrument is just a different guess."
  fp: 1212c4c95577
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:04:22.341Z"
- id: DL-029
  kind: difficulty
  description: "A SUITE QUIETLY MOVED TO ACCOMMODATE A CHANGE is the mirror image of a fixture quietly moved out from under a suite, and both are invisible to every gate. Plan 135 shipped main red the first way (a git add aborted, so a relocated fixture left its Rust consumer pointing at a deleted path). The reviewer then found the second way waiting to happen: register_walk_and_sqlite_roundtrip_preserve_identical_process_start posts a deliberately WRONG caller claim (proc_start 1) and passes only because the pane override discards it before the liveness check - so it is an accidental CANARY for the fix in flight. If the claim-preference is implemented too broadly the test goes red, and the tempting repair is to edit the test, which would switch off the anti-impersonation control while turning the gate green. Encodable fix: mark canary tests as such in-source (a naming convention or attribute) with the sentence \"if this goes red, narrow the change, do not edit this test\", and have review confirm named canaries are unmodified in the diff - a rule that only lives in a reviewer head protects nothing after that reviewer stands down."
  fp: 078748577839
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:06:16.331Z"
- id: DL-030
  kind: difficulty
  description: "A WIRE-FORMAT CHANGE IN ONE PLAN COST A SIBLING PLAN A CONVERGENCE PASS, and the warning already existed inside the originating plan but never left it. 135 changed the injected message frame; ten assertions in 136 u1 compared the injected string LITERALLY and all moved at once. 135 had produced exactly the artifact 136 needed in advance - a 39-entry enumerable ledger of every touched literal with file:line and before/after, required by prime so the AC6 exception would be enumerable rather than approximate - and it stayed inside 135 review record. 136 durable fix was better than 135: its u1 replaced 23 literals with a frame helper, removing the class rather than migrating instances. Encodable fix: when a plan changes a wire format or any string other plans assert against, the enumerable touched-literals list is broadcast to sibling PMs at COMPOSE time, and the preferred remedy is a helper that makes the literal unassertable rather than a migration of literals."
  fp: 020b1100737b
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:07:13.620Z"
- id: DL-031
  kind: difficulty
  description: "REVIEWER-CONTRIBUTED (pij-wild-xoxarle, plan 135): the round-2 target list grew to EIGHT items across five PM/reviewer exchanges and existed ONLY in the message thread — so the reviewer would have reconstructed its own scope from message recall, the weakest input available and the one it had spent all day telling others not to trust. It moved all eight into the review record as a finding row (id r2) with the reasoning for each, including the canary mechanism verified against registration.rs:74 rather than asserted. Consequence worth generalising: review scope negotiated in chat is unqueryable and gone when the window scrolls, and a seat that dies mid-review takes the scope with it; persisted, round 2 is runnable by a DIFFERENT reviewer who inherits the reasoning and the two withdrawn remedies rather than a green branch and a cheerful summary. Encodable fix: any target or scope agreed after dispatch is written into the review ddoc, not just answered in the thread."
  fp: 3d5d2135e9a8
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:07:32.393Z"
- id: DL-032
  kind: difficulty
  description: "REVIEWER-CONTRIBUTED (plan 135, f6): fixing a user-facing string is not the same as fixing the SYSTEM description of it. 135 corrected the boot announce to describe the frame we emit, and left five LLM-facing tool-metadata strings in index.ts (pij_send description, promptSnippet, promptGuideline, the `to` parameter, pij_close) still describing the legacy frame — all injected into every session context. So a fresh seat is told twice in ONE context window that peer messages look two different ways, and the wrong half is attached to the tool it must use to reply. The reviewer demonstrated it from inside its own context rather than by grepping. Encodable fix: when a wire format changes, sweep every surface that DESCRIBES it to an agent - announce text, tool descriptions, prompt snippets, parameter docs, listing formats, and explanatory comments - because the ones injected into context teach behaviour more directly than the ones a human reads."
  fp: d6cb39ac5b77
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:13:02.534Z"
- id: DL-033
  kind: difficulty
  description: "A WITNESS WHOSE STRENGTH DEPENDS ON WHERE IT RUNS (reviewer n4, plan 135): the timebase test writes procStart under TZ=UTC and reads seat.proc from local ProcLiveness, so it genuinely discriminates on this host (local 12:15:09 vs UTC 02:15:09, verified twice) but on any host where local == UTC the two coincide and the test cannot tell a correct implementation from one that ignores the split entirely. CI runners are conventionally UTC — exactly where it would go quietly green forever. Fix: assert the two observations DIFFER and skip LOUDLY when they do not, so the host reports \"this property was not exercised here\" rather than \"this property holds\". Same class as a fixture whose answer depends on who wrote it, one axis over. Note the irony worth keeping: prime had made this equality a TEST rather than a report line so it could not rot into prose, and it could still have rotted into a tautology on a UTC box."
  fp: a10778440f92
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:15:28.319Z"
- id: DL-034
  kind: difficulty
  description: "A ONE-COMMAND SHELL MEASUREMENT IS AN INSTRUMENT, AND IT CAN BE WRONG (reviewer self-report, plan 135). The reviewer measured TZ handling with one shell quoting form and got local == UTC. At face value that meant the utc flag was inert on macOS, hence uds discovery compares a local observation against Claude UTC record, hence Claude delivery is broken on every non-UTC host — a MAJOR finding that would have contradicted an already-recorded live AC7 proof. It re-measured with env first, got the opposite, and never sent the claim. Both of us then measured independently (local 12:15:09 vs TZ=UTC 02:15:09) so the eventual NIT rests on two agents readings. The general point: the disbelieve-your-instrument rule gets applied to ported code and to test harnesses, and almost never to the smallest probe — a single date or ps call typed into a shell — which is exactly where a quoting mistake silently changes the answer. Encodable fix: any measurement that would overturn a recorded proof must be taken twice, by different means, before it is written down as a finding."
  fp: 7d538b4a5b08
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:16:01.094Z"
- id: DL-035
  kind: difficulty
  description: "DL-007 RECURRED, to a different agent, hours after being logged: u4 lost a backtick-delimited literal from a pij send body to shell command substitution — the same mechanism that made the PM execute npm ci in the main checkout this morning and break every seat. Two independent agents hit it in one day on one plan. That is no longer a discipline observation, it is a missing affordance with a measured recurrence rate: prose written for agents contains backticks and dollar signs as a matter of course, and the only transport we have interpolates them. The workaround (persist the body, send a path pointer) is known and was still not enough to prevent the second occurrence, because the trap fires before anyone remembers the rule. Encodable fix stands and is now urgent: pij send needs a --body-file or stdin mode."
  fp: d96d9bac12bf
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:18:52.195Z"
- id: DL-036
  kind: difficulty
  description: "THE HEADLINE SHAPE, THIRD INSTANCE IN ONE PLAN (reviewer n6): the rule \"the CLI must NEVER pre-frame a message body\" exists as a COMMENT at core/cli.ts:3396 (F1: deliver the RAW text... NEVER frame() here) with no production enforcement — a search of the extension found exactly three unframed-ness assertions, one of which is redundant beside a byte-exact toEqual on the same object. The failure it guards is silent rather than loud: a pre-framed body double-frames at the receiver and, because the frame regex body group is GREEDY, the result PARSES SUCCESSFULLY - verified by execution: from=a1, body=[pij-rs from a1]\\\\nbody\\\\n[/pij]. So the receiver delivers a body that IS a frame instead of rejecting it. Same family as INS-001 (a gate describing the working tree, not the commit) and INS-003 (anti-impersonation as prose on one branch): something wearing the appearance of verification while verifying nothing."
  fp: 69448b377ca6
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:21:09.492Z"
- id: DL-037
  kind: difficulty
  description: "harness observe BUFFER LOCATION IS UNRELIABLE ACROSS WORKTREE SEATS, and the failure is silent: u1 and u2 both RAN harness observe successfully and received receipts with ids (DL-001..006 + CONF-001, WIN-001), yet at stand-down neither worktree carried .harness/temp/agent/session-buffer.md and a find across both trees returned nothing. The main checkout buffer does exist (mtime within the session) but contains 8 entries about unrelated subsystems - flow-pair discovery, pij canary, the legacy claude daemon - NOT the coder entries, so the pooled-in-main theory does not fully explain it either. Meanwhile u3 and u4 buffers DO exist in their own worktrees, so the behaviour is inconsistent between seats of the same fleet. Ids are also per-buffer sequential, so u1 DL-001, u2 DL-001 and the PM DL-001 are three different observations that collide the moment two buffers are pooled or drained together. Both coder buffers were only recovered because the PM asked each seat to reproduce its own harness observe --list output before the window was killed. Encodable fix: buffer path keyed by SEAT ID rather than by cwd, globally unique observation ids, and a drain that reports which seats it read from - a drain that silently reads zero buffers looks identical to a fleet that captured no friction."
  fp: 6ead25d4b5c4
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:32:34.304Z"
- id: DL-038
  kind: difficulty
  description: "CORRECTION TO DL-037, cause now known and it was not a location bug: the u1/u2 observation buffers were DELETED by `git worktree remove` during tidy. .harness/temp is gitignored, so the worktree read as CLEAN and remove took the buffers with it. Main 8-entry buffer belongs to another seat, not to them. Every other worktree still holds its buffer (u3 5, u4 7, and others), so there was never an inconsistency to explain — my DL-037 hypothesis (path keyed by spawn cwd) was WRONG and is superseded by this. What actually saved the observations: rescue-BEFORE-close ordering, asking each seat to reproduce its own harness observe --list output before its window was killed. Two consequences worth encoding. (1) GITIGNORED STATE IS INVISIBLE TO EVERY CLEANLINESS CHECK, so a destructive tidy can be simultaneously correct-by-the-check and lossy — no worktree removal until .harness/temp is harvested, and harness team tidy must copy the buffer out FIRST. (2) The seat-keyed buffer mode ALREADY EXISTS (.harness/temp/<seat-id>/session-buffer.md is in use for at least one seat), so making it the default is a config change rather than new mechanism - and it would have made this loss impossible because the buffer would not have lived inside the removed tree."
  fp: ef3effb1f05b
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:34:52.370Z"
- id: DL-039
  kind: difficulty
  description: "REVIEWER-CONTRIBUTED (r2f3, plan 135): a done-report receipt describes the tree the coder BUILT, which is not the tree the change LANDS IN. u3 branch was based on an ancestor ~13,000 lines behind main — missing all of plan 136 and the f1 fixture fix — so on its own branch the golden fixture still sat in the plan folder and its green proved something about a tree nobody ships. The reviewer refused to test there: it trial-merged each fix into main with git merge-tree --write-tree (no repo mutation, zero conflicts), materialised the trees with git archive, and ran everything on main+u3 and main+u4. This is INS-001 one level out: not \"working tree differs from committed tree\" but \"committed tree differs from the tree it lands in\". Encodable fix: a done report must NAME ITS MERGE-BASE, and the composer re-runs on the trial-merge tree before accepting - otherwise every receipt in a long-running plan silently ages out as main moves underneath it."
  fp: 6e091fc81833
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:41:18.643Z"
- id: DL-040
  kind: difficulty
  description: "SECOND INSTRUMENT FAILURE OF THE DAY, and this one would have HIDDEN a real finding rather than inventing one (reviewer method note, plan 135): its scope sweep used grep -r \"[pij from\" where [pij is an unterminated bracket expression, and it returned ZERO matches. It nearly recorded \"nothing outside the extension\". grep -F found four live seat-facing occurrences in skills/pij/references/routes/ - including one documenting the output of pij inbox, which the same round had just changed. I re-verified with grep -F before dispatching. Pattern across both of todays instrument failures: the smallest probes (a date call, a grep) are the ones nobody verifies, and a regex that silently matches nothing is indistinguishable from a clean repo. Encodable fix: any absence-based claim must be produced by a probe that has been shown to match SOMETHING first - prove the instrument can see before believing what it cannot."
  fp: 8f0b6550a731
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:41:18.794Z"
