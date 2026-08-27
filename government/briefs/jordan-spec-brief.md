# Stream brief — jordan-spec (Fable seat; spawn AFTER s392 item 10b merges)
**From**: pij-relative-panther (o-prime, pij) · **Drafted**: 2026-08-27T13:27:02Z · **Lifecycle**: provisional (not yet spawned)

## Structure tree
```text
Vaughan
└─ o-prime pij-relative-panther · pij-prime:1 (%45)
   ├─ PA pij-ready-perosteck · sensor/relay only
   ├─ s391-day3-core · pij-associated-louse (items 1b/4/6b/13/15/16 — unrelated to you)
   ├─ s392-day3-codex-doctrine · pij-falling-outside (built the comms work you are documenting; ask it factual questions by pij send, never for opinions on scope)
   └─ jordan-spec · <this seat> · window jordan-spec
```

## Work item
- **Human ask, verbatim intent** (Vaughan, 2026-08-27, in-pane + Telegram): a standalone, detailed, self-contained spec of the claude + copilot **SQLite + sockets** comms approach for another Claude ("Jordan") to pick up and run with; "do not include any other project information"; "it can be huge"; include gotchas and outstanding items; file it as an issue on the pij repo under the AI-Substrate org. Recorded: project `jordan-spec` (spine 25088), source definition `docs/plans/392-day3-codex-doctrine/jordan-spec-deliverable.md` (read it first, in full).
- **Deliverables**: (1) `docs/specs/claude-copilot-sqlite-sockets-comms.md` in your worktree, committed on your branch, PR to main; (2) a GitHub issue on the confirmed target repo carrying the spec verbatim — **filed only on my explicit GO after I read the spec** (external-facing; Vaughan ruled the destination, I gate the moment).
- **Plan folder**: `docs/plans/<ORD>-jordan-spec/` (ordinal from the allocation below) · **Worktree/branch/base**: per the allocation record (`pij stream create --project jordan-spec`) · **Landing**: PR → merge (o-prime) → issue.
- **Source material (mine; cite paths, do not paste governance)**: `reports/pij-comms-review-2026-08-27.md` §2–§5, §11–§13 + `reports/pij-comms-review-2026-08-27/*.md`; `docs/how/pij.md` (Delivery routing), `docs/how/pij-telegram.md`; `.pi/extensions/pij/adapters/{sqlite-queue,channel-factory,queue-consumer,claude-socket,copilot-rpc,daemon-tmux}.ts` + tests; `core/daemon/loop.ts` routing invariant tests; s392 plan + phase reports + `deferred-codex-phase.md`; PRs #1, #3, #4, #5, #6, #9, #11, #12 on vaughanknight/pij.
- **Must cover**: architecture (WAL queue tables + state machine + leases/park; backend selection sqlite/fs/dual; delivery routing: Claude inbox socket, Copilot `--ui-server` RPC, pointer path for socketless seats; generic queue-consumer at-least-once; Telegram bridge + pi in-process receiver on it); the wire frames (exact, from the report); benchmarks; doctrine (P1 transport vs P2 persistence); **gotchas actually hit** (pty 1022-byte clipping; Flash + `--context long_context`; the dual-backend `instanceof` gate; at-least-once duplicate windows; daemon restart strands spine locks; CLI/daemon code skew after ff; 64 KiB stdout truncation on pipes; sender receipt false-positive for bridge targets); **outstanding**: Codex app-server path (deferred design), `--skip-backlog`, token-scoped `resetClaimsOnStart`, durable retry on Telegram API failure, the pane-binding hardening (item 10b) if not yet merged, card-write race (item 13), spine-lock reclaim (item 15).
- **Must NOT contain**: pij governance/orchestration meta (primes, streams, batons, PA, spine seqs), other streams' work, fleet chatter, seat ids. Technical and standalone only.

## Descriptive fence
- Touch set: `docs/specs/claude-copilot-sqlite-sockets-comms.md`, `docs/plans/<ORD>-jordan-spec/**`. Read-only everywhere else. No code changes. No skill edits.
- Forbidden: `.the-flow-state.json`, `the-flow.json`, `the-flow.md`; `government/**`; `~/GitHub/pij` working tree; other worktrees; the live daemon; `gh issue create` before my GO.

## Orient stack
1. `/pij prime` → `<skill>/references/prime/orchestrator.md` (skill root `/Users/vaughanknight/.claude/skills/pij`) 2. `<skill>/references/prime/orient-global.md` 3. `/Users/vaughanknight/GitHub/pij/government/orient-local.md` 4. this brief + the deliverable definition 5. `/thesis` via the on-disk SKILL.md contract (`~/.agents/skills/thesis/SKILL.md`; not Skill()-registered) 6. preamble checkpoint to me, then write.

## Assignment and reporting
- No coder fleet needed: you write the spec yourself (docs-only); use ONE cold reviewer (`/pij pair` reviewer role, copilot gpt-5.6-sol xhigh) to check the spec for: standalone-ness (no meta leaked), factual anchors (file:line on the merged main), and completeness against the "must cover" list. Report the verdict by pointer.
- Card at both edges (`pij report now`); reports `claim · artifacts[] · shas[] · gates[] · observations[] · open[]`; C10 wire discipline; every `pij send` body via a quoted heredoc + `--body-file`.
- Questions to Vaughan: ask in your own pane and send me the pointer.
