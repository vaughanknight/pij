# PR A execution log — chore literals and paths

| Time (UTC) | Task | Evidence |
|------------|------|----------|
| 2026-08-02T09:37Z | Pre-flight | `harness boot` passed `just typecheck` and `just test` after the dispatch-mandated `just _root-lock-npm-ci` restored missing dependencies. |
| 2026-08-02T09:38Z | Scope | Read the full field dossier; accepted only F-1 and F-3. F-4 remains explicitly excluded. |
| 2026-08-02T09:39Z | Design | Selected repo-only pretty JSON, repo-root execution per chore scope, in-repo absolute-path normalization, and repo-external absolute-path refusal with seat/fleet guidance. |
| 2026-08-02T09:41Z | T001 RED | Shipped `cli.ts` drive test produced the expected two failures: repo-local absolute paths remained verbatim/warn-only, and repo-external absolute paths were accepted. Existing 24 CLI tests stayed green. |
| 2026-08-02T09:43Z | T002 GREEN | 36 targeted tests passed across the shipped CLI drive, atomic writer, and chore store. The repo roster alone is formatted; compact state writers remain byte-compatible. |
| 2026-08-02T09:46Z | Cross-worktree proof | A roster authored with `cat /tmp/.../repo/absolute.txt` stored `cat ./absolute.txt`; from a linked worktree root, `repo-absolute` returned `other-absolute` and `repo-relative` returned `other-relative`. |
| 2026-08-02T09:46Z | Subdirectory proof | Running the same roster from `<other-worktree>/nested` probed both chores with the same worktree-local values and no `NOT-PROBEABLE` rows. |
| 2026-08-02T09:46Z | Writer proof | Biome reported `Checked 1 file in 5ms. No fixes applied.` for the freshly generated `.pij/chores.json`. |
| 2026-08-02T09:47Z | Refusal proof | Repo-external `/usr/bin/true` failed with exit 64 and the actionable repo-relative/seat/fleet message; the roster SHA-256 was unchanged. |
| 2026-08-02T09:55Z | Full gate | Final `harness checks` returned `status:"ok"`, `ok:true`, all eight sensors `pass`, and `skipped:[]`. The first smoke attempt lost a tmux pane; isolated retry passed all 11 scenarios before the full gate passed. |
| 2026-08-02T10:12Z | Review REJECT | Reviewer drove the shipped CLI and persisted three bypasses: add probe `../external.txt`, add probe `///tmp/...`, and update full `../external.txt`. Scope reopened only for the F-1 containment guard. |
| 2026-08-02T10:17Z | T004 GREEN | Replaced the refusal predicate with shell-word extraction plus canonical resolved-path containment. The 36-test targeted suite passed, including add/update × probe/full matrices for parent escape, double-slash root, and accepted inside-relative paths. |
| 2026-08-02T10:18Z | Reviewer reproduction replay | Shipped CLI returned exit 64 for add probe `../external.txt`, add probe `//tmp/.../external.txt`, and update full `../external.txt`; inside-relative add/update probe/full all exited 0. The persisted roster contained only `inside-full,inside-probe`. |
| 2026-08-02T10:27Z | Review REJECT #2 | Reviewer proved the analyser fail-open on `$HOME`, `${HOME}`, `~`, later variable expansion, inline interpreter code, `$()`, backticks, and unterminated quoting. Scope reopened only for static-analysis recognition. |
| 2026-08-02T10:32Z | T005 GREEN | Added a fail-closed tagged shell analysis plus inline-interpreter detection. The 37-test targeted suite passed; its shipped-CLI matrix covers all eight reviewed forms across add/update × probe/full and preserves the accepted `python3 ./scripts/probe.py arg` control. |
| 2026-08-02T10:32Z | Dynamic replay | All eight reviewer forms returned exit 64 with the construct named; update-full `$HOME` also returned 64. Only `static-multiword` persisted in the roster. |
| 2026-08-02T10:50Z | Review REJECT #3 | Reviewer bypassed the deny-list with `eval` plus a single-quoted payload. Direction changed from recognising forbidden constructs to accepting only a finite executable/token grammar with unknown-default refusal. |
| 2026-08-02T10:59Z | T006 GREEN | Replaced construct recognition with an explicit executable/token grammar. The 37-test targeted suite passed, including the unknown-default proof and multi-argument static script control. |
| 2026-08-02T10:59Z | Grammar replay | `eval` with a quoted HOME payload refused as a forbidden construct; unknown `mystery-probe` and `awk` refused as unproven executables; static Python, Git, and GitHub CLI commands all persisted. |
| 2026-08-02T11:10Z | Review REJECT #4 | Reviewer proved the script-runner production still used a forbidden-flag deny-list: Node `--print=<expr>` bypassed it and persisted. Direction changed to exact safe flags before the script path, unknown-default refusal. |
| 2026-08-02T11:15Z | T007 GREEN | Replaced inline-mode recognition with exact source-owned safe flags per runner. The 38-test targeted suite passed, including add/update × probe/full refusals with byte-stable rosters and accepted Node/Python safe-flag controls. |
| 2026-08-02T11:15Z | Runner replay | Node `--print=...`, unknown `--title=probe`, bundled shell `-eu`, and update-full `--print=...` all returned 64; only `safe-node,safe-python` persisted. |
| 2026-08-02T11:35Z | CI RED | PR #77 had one timeout: the combined dynamic refusal matrix took 31.655s against Vitest's 30s per-test limit; 3,933 tests and windows-compat passed. |
| 2026-08-02T11:38Z | T008 GREEN | Split the grid into eight independently named `it.each` cases plus separate static/unknown-default controls. Every refusal still drives add/update × probe/full and asserts roster bytes unchanged. Dynamic cases took 2.137–2.334s locally; the longest related runner case took 6.407s. No timeout changed. |

## Decisions and trade-offs

- Preserve `writeJsonAtomic`'s compact contract for registry, spine, focus, chore state, and every other machine-owned durable file.
- Add a formatted atomic JSON wrapper that shares the same temp-file/fsync/rename path; use it only for repo-scoped rosters.
- Normalize references to the authoring worktree root into `.`-relative command text.
- Resolve every static path-like shell word against the active worktree and refuse it when the canonical result escapes. The error directs machine-local commands to seat or fleet scope.
- Run only repo-scoped commands at `worktreeRoot`; seat and fleet commands preserve caller-cwd behavior.
- Canonicalize existing absolute literals before relativizing so symlink aliases of the same
  checkout are accepted, while unresolved or genuinely external absolute paths still fail.
- Extract static shell words and resolve path-like candidates against the canonical worktree.
  Containment, not spelling, decides acceptance; the same helper is shared by add/update and
  probe/full.
- Fail closed before containment when shell analysis finds expansion/substitution, inline
  interpreter code, pathname/grouping/here-doc syntax, or malformed quoting/escaping. Repo
  scope deliberately trades those forms for portability; seat/fleet scope remains the route
  for dynamic commands.
- Supersede the construct deny-list with an allow-list grammar: one approved executable (or
  repo-relative executable) plus unquoted tokens from a fixed character alphabet. Script
  runners require a repo-relative script path and refuse inline modes. Unknown executables
  and malformed input default to refusal.

## Changed files

- `.pi/extensions/pij/adapters/atomic-file.ts`
- `.pi/extensions/pij/adapters/atomic-file.test.ts`
- `.pi/extensions/pij/adapters/chore-store.ts`
- `.pi/extensions/pij/adapters/chore-store.test.ts`
- `.pi/extensions/pij/core/chores/cli-verbs.ts`
- `.pi/extensions/pij/core/chores/drive.test.ts`
- `docs/how/pij-chore.md`
- `docs/domains/pij-control-plane/domain.md`
- `docs/domains/agent-tooling-interface/domain.md`
- `docs/domains/domain-map.md`
- `docs/plans/077-chore-field-round-2/tasks/pr-a-literals-and-paths/tasks.md`
- `docs/plans/077-chore-field-round-2/tasks/pr-a-literals-and-paths/execution.log.md`

## Gates

- Targeted shipped-CLI/store/writer suite: 46 passed.
- Actual cross-worktree root run: 2 repo chores probed, both returned the second worktree's
  values.
- Actual subdirectory run: 2 repo chores probed, no failures, same second-worktree values.
- Fresh repo roster: Biome clean without rewriting.
- Repo-external absolute-path refusal: exit 64, roster unchanged.
- `just typecheck`: passed.
- `just lint`: passed with the repository's existing warnings/info only.
- `harness checks`: all eight sensors passed; none skipped.
