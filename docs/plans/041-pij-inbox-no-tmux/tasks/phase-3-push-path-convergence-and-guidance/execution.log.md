# Phase 3 Execution Log — Push-Path Convergence and Guidance

## Pre-Dispatch Freeze — Spine Seq 74

- **Validation**: `VALIDATED WITH FIXES` at
  `../../validations/phase-3-push-path-convergence-and-guidance-tasks-validation.md`.
- **Clean planning checkpoint**: `e6f36be` after rebase.
- **Rebased base**: `origin/main` at
  `347b6dd732110bc76b3d421e61a401cc228149d6`.
- **Path-scoped source ref**:
  `origin/s043/telegram-last-speaker-routing`.
- **Source commit**:
  `a831930bdcc190f58abf31f153131c0953227d9c`.
- **Source path**: `docs/domains/pij-control-plane/domain.md`.
- **Source/restored blob**:
  `844464ee03dcbc54e3a660245ddac93095b0a5a7`.
- **Restore proof**: the restored worktree blob matched the source blob exactly;
  no other s043 path or commit was imported.
- **Merge ordering**: PR #11 must merge before PR #9. After #11 merges, rebase
  `origin/main` so the s043 document baseline becomes ancestry.

The Phase 3 implementation may add only s041 delivery-ownership/read-marker text
to the restored control-plane document. It must not modify or remove the approved
s043 content.

## T001–T005 — Push Consumer Convergence

- **Tests-first RED**:
  `just test .pi/extensions/pij/daemon.test.ts
  .pi/extensions/pij/core/daemon/loop.test.ts
  .pi/extensions/pij/index.test.ts` failed with 6 intended failures:
  retained tmux envelopes/markers, unverified markers, no-pane unread ownership,
  receipt event-before-marker, pi post-`onInbound`, and receipt history.
- **Implementation**:
  - daemon uses `InboxPort.listUnread()` and retains every `msg-*`;
  - receipt events append/reuse before `markRead()` and never reach send-keys;
  - tmux messages mark only after confirmed/unverified `sendText` outcome;
  - no-pane bound targets are not listed, marked, or buffered;
  - pi seeds `seen` from durable unread/read state and marks after
    `PijSession.onInbound`.
- **Focused GREEN**: 126 tests passed across daemon, daemon loop, pi wiring,
  inbox core, no-tmux CLI integration, full CLI integration, and daemon
  ownership.

## T006–T009 — Guidance and Domain Contracts

- CLI help and `docs/how/pij.md` now state:
  - pi/tmux peers remain push-first;
  - non-tmux external peers use `pij inbox --wait`;
  - first inbox use auto-registers pull ownership;
  - finite and indefinite waits share immutable `msg-*`/`read-*` history.
- Non-held domain docs/indexes were refreshed before the skill source.
- `docs/domains/pij-control-plane/domain.md` was compared directly with source
  commit `a831930bdcc190f58abf31f153131c0953227d9c`: the final diff contains
  additions only and no removed source lines.
- Skill source landed last. `just pij-skill-check` passed; line budgets are
  71/150 (`SKILL.md`), 64/250 (`00-routing.md`), and 90/150 (`peer.md`).

## T010 — Dim-0 Mutation Proof

### Marker ownership and post-outcome timing

- **Mutation**: pre-mark every tmux message inside the `drainTmuxInbox` argument
  before `sendText` runs.
- **RED**: `.pi/extensions/pij/daemon.test.ts` failed 2 intended tests.
- **Restore/GREEN**: mutation harness restored the file and the suite passed.
- **SHA-256 before/after**:
  `f0793d364f315ca821177771a1c2cab3362b9a111c99a6de1b996f41f155a1bf`.

### Push/pull guidance branch

- **Mutation**: replace `pij inbox --wait` with `pij state` in
  `skills/pij/references/00-routing.md`.
- **RED**: the named CLI/skill guidance integration test failed.
- **Restore/GREEN**: mutation harness restored the file and the named test
  passed.
- **SHA-256 before/after**:
  `bcf1f7dbbcc65d33a02e10618adafd2d3f5ebb16344389dbe70af3e440a44adf`.

## Stop Gate

Pre-review gates:

- `just flow-pair-test`: 148 passed.
- `just typecheck`: passed.
- `just lint`: exited 0; 9 pre-existing warnings and the existing Biome schema
  informational notice remain outside this phase fence.

Implementation stopped at T011. The daemon was not restarted, no live canary
was attempted, and no push/ship claim was made. Cold review and the daemon baton
remain orchestrator-owned.

## Cold Review Fix Cycle — `dlg-0001-fix-001`

The cold review returned `FIX_REQUIRED` with F-001 through F-003. Coder work was
restricted to the granted fix packet; T011 approval, daemon restart/live proof,
and ship work remain orchestrator-owned.

### F-001 — Per-message same-target progress

- **RED**: the new two-message daemon regression failed because the first
  successful injection had neither a marker nor receipt when the second
  `sendText` threw. Focused run: 69 passed, 1 failed.
- **Fix**: `Daemon.drainInbox()` now calls the core drainer for one durable
  message at a time, then publishes that message's marker and terminal receipt
  before attempting the next message.
- **Isolation**: whole-life and provider notifications run before the fallible
  inbox drain, so a target-local inbox/send error cannot suppress those
  independent transitions. This restored the legacy daemon push suite without
  changing its tests.
- **GREEN**: the first marker and delivered receipt are visible during the
  second send attempt; the second marker is absent, its body remains unread,
  and a second tick retries only the failed message.

### F-002 — Retained watch-delivery history

- The phantom `pij-watch` inbox assertion remains unchanged.
- The target inbox now proves exactly one retained `msg-*`, its matching
  `read-*`, and `FsChannel.listUnread("pij-c") === []`.

### F-003 — Load-bearing C1 receive mapping

- The CLI/skill regression now parses the exact C1 header and receive row:
  pi push = automatic injected turn plus the explicit `Pi injects in-process`
  clause; tmux control-plane push = automatic daemon-injected turn; external
  pull = `pij inbox --wait [ms]`.
- It also requires the peer route's non-tmux wait registration, pi/tmux injected
  reply, and pull-not-state-polling clauses.
- **Mutation**: inverted the receive row so pi/tmux used
  `pij inbox --wait [ms]` and external pull used daemon injection.
- **RED**: named test 1 failed, 34 skipped.
- **Restore/GREEN**: named test 1 passed, 34 skipped.
- **SHA-256 before/after**:
  `bcf1f7dbbcc65d33a02e10618adafd2d3f5ebb16344389dbe70af3e440a44adf`
  for `skills/pij/references/00-routing.md`.
- Strengthened test hash:
  `ce41c985dcd00d08fc1c3e607b588dcfdb627331bb9b079a5714b19f35f21e76`.

### Final Fix Proof

- Focused F-001/F-002/F-003 set: 3 files, 70 tests passed.
- Expanded daemon isolation set: 4 files, 91 tests passed.
- `just test`: 127 files passed, 4 skipped; 1,850 tests passed, 10 skipped.
- `just typecheck`: passed.
- `just lint`: exited 0; the same 9 pre-existing warnings and Biome schema
  informational notice remain outside this fix fence.
- `just pij-skill-check`: passed.
- `harness checks --quick`: typecheck, lint, test, Windows compatibility,
  package audit, and snapshots passed; smoke skipped by `--quick`.
- Package-audit-only vetted timestamp drift in `.pi/packages.yaml` was restored;
  the manifest has no final diff.
- `git diff --check`: passed.

F-001, F-002, and F-003 are fixed and ready for cold re-review. No daemon
restart, live canary, commit, push, merge, or ship action occurred.

## T011 — Cold Approval

- Coder `pij-zygomorphic-bison` was compacted before review.
- Reviewer `pij-vicious-swift` ran as Copilot GPT-5.6 Sol xhigh and was
  compacted before each verdict was opened.
- Initial verdict: `FIX_REQUIRED` with F-001 through F-003.
- Seq 81 granted `.pi/extensions/pij/core/daemon/watch.test.ts` test-only scope.
- Targeted re-review:
  `docs/plans/041-pij-inbox-no-tmux/reviews/phase-3-push-path-rereview.md`.
- Final verdict: **APPROVE**.
- Reviewer fresh proof: focused 70/70; independent C1 inversion RED then
  byte-identical GREEN; full 1,850/1,850; typecheck, lint, skill check, and
  `harness checks --quick` green.
- Orchestrator sanity pass confirmed per-message marker/receipt finalization
  before advancing and the exact C1 receive-mode association.

### Peer compact protocol correction

Spine Seq 128 supersedes the earlier blocking compact practice. For reusable
coder/reviewer peers, the orchestrator sends compact immediately **without**
`--wait` and continues report/review/fix work; compact latency never blocks the
critical path. The one-shot E-DEAD exception remains.

## T012 — Reviewed-Daemon and Genuine External Pull Proof

### Baton and deployment

- Baton request:
  `request-349dd07f-47c7-4c03-a9ab-4a409c3af3d2`.
- Lease:
  `lease-f46643fc-aaa3-4d55-b322-d159fd635335`.
- Grant/freeze: government Spine Seq 88/97.
- Old daemon: PID `99125`, tmux window `@731`.
- Reviewed s041 daemon: PID `67500`, tmux window `@744`.
- Process command resolved to this worktree's
  `.pi/extensions/pij/daemon.ts`.

### Pre-stage findings

- Bare `pij` on PATH is intentionally npm-linked to the main checkout by
  `just install`; it therefore remained Phase-2-only before merge.
- The live proof used isolated shim `/tmp/s041-live-bin/pij` pointing at the
  reviewed worktree. The machine-wide npm link was not repointed.
- `pij models` omitted Terra `medium`, but Spine Seq 86 confirmed direct
  Copilot support. Copilot session events mechanically recorded
  `selectedModel:"gpt-5.6-terra"` and `reasoningEffort:"medium"`.
- One replacement receiver exception was granted at Spine Seq 97 after the
  pre-staged process exited before the freeze.

### Receiver and delivery evidence

- Genuine no-tmux Copilot session:
  `1ece30a1-861f-4376-b077-f614429e6c46`.
- Environment output contained only
  `COPILOT_SESSION_ID=1ece30a1-861f-4376-b077-f614429e6c46`; no `TMUX`,
  `TMUX_PANE`, or `PIJ_SESSION_ID`.
- Ambient registration:
  `pij-dry-coyote`, harness `copilot`, `deliveryMode:"pull"`.
- The receiver blocked in foreground on `pij inbox --wait --json`.
- Tmux client `pij-concrete-reptile` sent:
  `S041-T012-LIVE-1ECE30A1 exactly-once pull proof`.
- Message id:
  `1783890087923-000001-4901`.
- Sender wait result: terminal `delivered`.
- Receiver result contained exactly one message with that id/body and
  `timedOut:false`; the Copilot client then exited.

### Durable ordering evidence

- Retained receiver envelope:
  `~/.pij/pij-dry-coyote/inbox/msg-1783890087923-000001-4901.json`.
- Matching post-consumption marker:
  `~/.pij/pij-dry-coyote/inbox/read-1783890087923-000001-4901.json`,
  `readAt:2026-07-12T21:01:28.044Z`.
- Counts: one exact envelope, one exact marker.
- Sender receipt envelope:
  `msg-1783890088054-000001-83758.json`.
- Sender receipt marker:
  `read-1783890088054-000001-83758.json`.
- Persisted atomic event:
  `event-once-2813b76bc1f0a03deed0157cd9cff55995b5b7ba5a24f1ebbd37fef9ccf191ab.json`.
- The event body is
  `[pij receipt 1783890087923-000001-4901] delivered`; its timestamp precedes
  the sender receipt marker publication path established by the reviewed
  event-before-marker implementation.
- Reviewed daemon remained healthy at PID `67500` after the proof.

## T013 — Pre-Push Final Gate

- Final validate-v2 sidecar:
  `../../validations/phase-3-implementation-validation.md` — `VALIDATED`.
- `just test`: 1,850 passed, 10 skipped.
- `just typecheck`: passed.
- `just lint`: passed with the same 9 pre-existing warnings and Biome schema
  informational notice.
- `just pij-skill-check`: passed.
- `just windows-compat`: passed; 31 focused portable tests.
- `harness checks`: typecheck, lint, test, Windows compatibility, package audit,
  and snapshots passed. Smoke alone failed on the known Pi folder-trust prompt.
- **R-004 disposition**: that smoke prompt is shared, unowned, non-blocking s041
  debt; no smoke-harness edit or assignment wait is permitted.
- Excluded package/lock, channel adapter, fs-registry, discovery, spawn, Copilot
  harness, engineering harness, and workflow surfaces have no content diff.
- Package-audit-only `.pi/packages.yaml` timestamp drift was restored.
- Flight plan advanced through Phase 3/review to `ship`; phase observations were
  drained to
  `.harness/records/retro/2026-07-12/004-041-pij-inbox-no-tmux-phase-3.md`.
- PR #9 was updated to `03baeadb5b85a43acfdac280b96e40d23fcde5da`
  with a force-with-lease pinned to the prior remote
  `a798bf269a79b01bcccff80ebbfadb00eaabc7e1`.
- Hosted workflow run:
  `https://github.com/AI-Substrate/pij/actions/runs/29209203506`.
- Node 22: PASS in 3m34s.
- Node 24: PASS in 3m38s.
- Windows compatibility: PASS in 4m29s.
- PR #9 remains unmerged by ruling. PR #11 must merge first, then PR #9 must
  rebase `origin/main` so the s043 control-plane document baseline becomes
  ancestry.
- Post-merge handoff: update the main checkout, verify bare `pij inbox --help`
  and the machine-wide `/pij` skill guidance, then complete the `ship` node.

## PR #11 Convergence

- PR #11 merged to main as
  `3b1a47beaed0455611e443ae8e2827cfb1aa460d`.
- The clean s041 branch rebased onto that commit as required by Seq 74/101.
- Exactly one conflict occurred:
  `docs/domains/pij-control-plane/domain.md`.
- Resolution preserved the merged s043 blob
  `844464ee03dcbc54e3a660245ddac93095b0a5a7` and added only the six s041
  lines: durable push ownership, retained tmux history, push delivery marker,
  and the Plan 041 history row.
- Shared-document delta versus merged main: 6 additions, 0 deletions; every
  s043 and s041 row occurs exactly once.
- Rebased Phase 3 implementation commit:
  `d2a37184c5cba01ba496f65105006588b0afcb34`.
- Post-rebase `harness checks --quick`: all stages passed.
- Full smoke remains governed by R-004; no smoke-harness scope was added.

## Post-Green External Identity Guard

### Human-found failure

Jordan's blind no-tmux test exposed a wrong-session takeover path: an agent with
no `TMUX_PANE` listed a shared tmux server, guessed `%0`, and adopted another
session's pane. A skill-only hard ban prevented new pane discovery but a second
blind run proved an already contaminated descriptor could still be trusted by
`whoami` and preserved by registration.

`pij-grieving-gibbon` was quarantined at Spine Seq 111 and was not used for
subsequent evidence.

### Review/fix sequence

- Seq 106: skill/test hard-ban packet granted.
- Initial skill-only review approval was withdrawn after the contaminated blind
  evidence.
- Seq 113: mode-aware `current-session`/CLI repair granted.
- Re-review found two residuals: explicit `PIJ_SESSION_ID` bypass and deletion
  of append-only `reportedAt`.
- Seq 127: final `core/cli.ts/.test.ts` residual addendum granted.
- Final cold re-review:
  `../../reviews/phase-3-final-identity-rereview.md` — **APPROVE**.
- Independent mutations:
  - explicit-id early bypass → RED, byte-identical GREEN;
  - `reportedAt` deletion → RED, byte-identical GREEN.
- Final full suite: 1,878 passed, 10 skipped.
- Focused final review suite: 132 passed.
- Skill check, typecheck, lint, and `harness checks --quick` passed.

### Final contract

- Delivery owner is resolved before identity advice.
- No/empty `TMUX_PANE` never discovers or adopts a pane.
- External identity begins with `pij inbox register --json`.
- External `whoami` accepts only a paneless pull descriptor.
- Tmux ambient identity accepts only the exact current process pane.
- Detectable ambient identity validates even when `PIJ_SESSION_ID` is set; ids
  must match. With no ambient native identity, explicit-id compatibility remains.
- Registration repairs the same durable id to paneless pull, clears stale
  pane/push/spawn and `agentOnce` runtime, and preserves append-only
  `reportedAt` plus durable identity/history.

### Ordered machine-wide deployment and final proof

- Early dual deployment evidence was preserved but rejected for ordering at
  Spine Seq 124; both links were restored to main and verified at Seq 125.
- After final cold APPROVE, Seq 129 authorized dual deployment:
  - `~/.agents/skills/pij` →
    `/Users/jordanknight/pi-hacking/pij-worktrees/s041-inbox-no-tmux/skills/pij`;
  - global `pij` →
    `/Users/jordanknight/pi-hacking/pij-worktrees/s041-inbox-no-tmux/.pi/extensions/pij/cli.ts`.
- Genuine no-tmux Copilot proof:
  - UUID `38358490-1a46-43dd-8582-32ac41bdafb6`;
  - model `gpt-5.6-terra`, reasoning effort `medium`;
  - isolated `PIJ_HOME`;
  - initial id `pij-constitutional-dormouse`;
  - controlled stale pane/push contamination;
  - explicit whoami rejected `E-NOID` with `pij inbox register`;
  - registration repaired the same id to pull, `existing:true`;
  - repeat remained idempotent;
  - explicit whoami then succeeded;
  - final descriptor was paneless pull, stale runtime absent, and
    `reportedAt:"2026-07-13T00:00:00.000Z"` preserved.
- Proof client exited 0. No old/quarantined id was used.

### Peer compact protocol

Spine Seq 128 makes reusable-peer compact fire-and-forget: send immediately
without `--wait` and continue review/fix work. The one-shot E-DEAD exception
remains.

## Post-Green Fix — External Adopt Guard

- Delivery-owner detection now precedes self-registration guidance.
- Empty or absent `TMUX_PANE` is explicitly external pull mode. Both `/pij`
  routing and the peer route hard-ban `tmux list-panes`, `tmux
  display-message`, every other pane-discovery command, and any inferred,
  guessed, selected, or adopted pane id.
- External `/pij adopt` intent redirects to `pij inbox register` or the first
  auto-registering `pij inbox --wait`. Tmux self-adopt is restricted to the
  current process's exact non-empty `$TMUX_PANE`.
- Every unconditional `E-NOID -> adopt first` instruction was removed or made
  mode-specific. Pi/tmux push-first and external pull guidance remain
  load-bearing in the integration test.
- **Focused GREEN**: named CLI/skill guidance test passed, 1 passed and 34
  skipped.
- **Mutation RED**: removed the external no-pane command-ban sentence from
  `skills/pij/references/00-routing.md`; the named test failed exactly on the
  missing hard-ban clause, 1 failed and 34 skipped.
- **Restore/GREEN**: restored byte-identically; the named test passed again.
  Routing SHA-256 before/after:
  `0e47700933e57b34792c26101aaf2e7d93aabfeab222e630b539fb7c987dbfb2`.
- `just pij-skill-check`: passed; routing/peer budgets are 68/250 and 96/150.
- `just typecheck`: passed.
- `just lint`: exited 0 with the same 10 pre-existing warnings and Biome schema
  informational notice.
- `harness checks --quick`: typecheck, lint, test, Windows compatibility,
  package audit, and snapshots passed; smoke skipped by `--quick`.
- Package-audit-only `.pi/packages.yaml` timestamp drift was restored; the
  manifest has no final diff. `git diff --check` passed.
- No CLI production behavior, daemon restart, live proof, package/lock,
  harness, flow-state, commit, push, merge, or full-smoke action occurred.

## Post-Green Production Repair — Contaminated External Identity

- **F-001 fixed**: ambient registered-self validation now receives the exact
  current-process `TMUX_PANE`. Tmux accepts only the exact attached pane when
  the descriptor is not pull-owned; external mode accepts only a paneless
  `deliveryMode:"pull"` descriptor. Missing, contradictory, stale-pane, and
  non-pull external joins fail before pane/cwd fallback with
  `pij inbox register` guidance.
- **F-002 fixed**: external `pij inbox register` reuses the exact durable pij id
  and rewrites it to paneless pull with current folder/pid and idle state.
  `dataDir`, `eventsPath`, `startedAt`, `prime`, identity, event/model, branch,
  spawn-parent, and agent-pack metadata remain durable. Pane/tick/failure,
  pending-init, transcript-snapshot, and once-close runtime fields are removed;
  clearing `agentOnce` prevents the daemon from dissolving the repaired pull
  peer while append-only `reportedAt` history remains durable.
- Tmux `inbox register` is read-only for the exact current pane and refuses a
  different pane; it never repairs or takes over a tmux descriptor.
- **F-003 fixed**: production regression
  `rejects and repairs a contaminated external ambient identity in place`
  seeds `paneId:"%0"` with no delivery mode, proves exact-pane tmux resolution
  and registration, rejects no-tmux `whoami`, refuses pane takeover, repairs
  the same id to pull, proves repeat registration, and resolves no-tmux
  `whoami` afterward. The focused current-session + CLI suites passed
  49 tests.
- **Independent mutation proof** against the named production regression:
  inverting external mode validation failed 1 test with 35 skipped because
  contaminated `whoami` returned 0 instead of 2; removing the pull-delivery
  repair failed 1 test with 35 skipped on missing `deliveryMode:"pull"`.
  Each restore returned 1 passed/35 skipped and restored
  `.pi/extensions/pij/core/current-session.ts` byte-identically to SHA-256
  `16939544a7999f9143e5c829d7eb09114a4f011a8beda1203bb0dd1ba3a6137e`.
- `just test`: 1,876 passed, 10 skipped. `just pij-skill-check`: passed
  (routing 70/250; peer 108/150). `just typecheck`: passed. `just lint`:
  exited 0 with the same 10 pre-existing warnings and Biome schema notice.
- `harness checks --quick`: typecheck, lint, test, Windows compatibility,
  package audit, and snapshots passed; smoke skipped by `--quick`.
- Package-audit-only `.pi/packages.yaml` timestamp drift was restored.
  `git diff --check` passed. Final content changes are restricted to the seven
  packet-allowed production/test/skill/log files; review packets remain
  untracked and unchanged.
- No registry adapter, descriptor type, daemon, package/lock, harness,
  workflow, persistence migration, daemon restart, machine-wide deployment,
  commit, push, merge, or quarantined-peer action occurred.

## Final Residual Repair — Explicit Identity and Append-Only Report History

- Explicit `PIJ_SESSION_ID` no longer short-circuits detectable ambient identity
  validation in the shared CLI core. Ambient validation failures propagate;
  a validated ambient id must equal the explicit id or fail `E-AMBIG`; when no
  ambient native identity exists, direct explicit-id compatibility remains.
- `phonehome` retains its binding-only bootstrap exception: a pending spawned
  peer uses its explicit pij id before the ambient reverse join that phonehome
  itself establishes. CLI subprocess tests now blank inherited host ambient
  identity variables by default so no-ambient compatibility proof is isolated.
- External repair preserves append-only `reportedAt` while still clearing
  `agentOnce`, pane, tick, failure, planned-id, init, and spawn-transcript
  runtime. The once-close latch therefore remains disabled without deleting
  report history.
- Production regression now rejects explicit `PIJ_SESSION_ID` before repair,
  repairs the same durable id, preserves `reportedAt`, and then resolves the
  explicit id successfully. Complete residual suites passed 99 tests; the named
  focused selection passed 18 with 81 skipped.
- **Independent mutation proof** against the named production regression:
  moving the explicit-id return ahead of ambient validation failed 1 test with
  35 skipped because contaminated explicit `whoami` returned 0 instead of 2;
  deleting `reportedAt` during repair failed 1 test with 35 skipped because the
  repaired history field was absent. Each restore returned 1 passed/35 skipped.
  Final byte-identical SHA-256 values:
  `.pi/extensions/pij/core/cli.ts`
  `b6f95a832fd96fe58999aaabf56143055b2b39ab75f3b7ecae93480edf960501`;
  `.pi/extensions/pij/core/current-session.ts`
  `bfc2be7d3332acee4d51421806e6995b0f8db7f31f951fccfabe6336a83c2ceb`.
- `just test`: 127 files passed, 4 skipped; 1,878 tests passed, 10 skipped.
  `just pij-skill-check`, `just typecheck`, and `just lint` passed; lint retained
  the same 10 pre-existing warnings and Biome schema notice.
- `harness checks --quick`: typecheck, lint, test, Windows compatibility,
  package audit, and snapshots passed; smoke skipped by `--quick`.
  Package-audit-only `.pi/packages.yaml` timestamp drift was restored and
  `git diff --check` passed.
- Residual-authored changes are restricted to the Seq 113 scope plus
  `.pi/extensions/pij/core/cli.ts` and `.pi/extensions/pij/core/cli.test.ts`.
  A concurrent, unowned one-line compact-discipline update is present in the
  Phase 3 `tasks.md`; this repair did not author or alter it. Review packets
  remain untracked and unchanged.
- No daemon restart, deployment, manual test, commit, push, merge, package/lock,
  registry/type/daemon migration, or quarantined-identity action occurred.
