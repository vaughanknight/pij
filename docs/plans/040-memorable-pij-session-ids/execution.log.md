# Plan 040 Execution Log

## 2026-07-11 — T001 shared seams

- Granted implementation fence received in flow-pair delegation `dlg-0001`.
- `harness boot` passed typecheck and the full existing test suite before edits.
- s038 is landed: `SessionDescriptor.prime?: boolean` is present in `core/types.ts`.
- s039 is landed: `unique-names-generator` is absent from `package.json` before the s040 package window.
- Existing worktree changes are outside the granted product-code fence and remain untouched.
- `types.ts` is read-only for s040; all edits stay within the packet's allowed paths.

## 2026-07-11 — T002–T004 RED

- Recovered the removed PoC contract from its local session transcript rather than
  inventing a new first-candidate algorithm.
- Pinned known vectors: `pij-arbitrary-locust`, `pij-sure-cuckoo`,
  `pij-appropriate-wildebeest`, and `pij-flaky-leech`.
- Added RED coverage for the 1,202 x 355 corpus, full-space uniqueness/exhaustion,
  native collision retry, same/different tuple claims, pre-bind reservation ownership,
  known-failure release, crash-orphan retention, rollback, opaque-id reuse, Pi
  reload/new lifecycle, spawn/agent/adopt wiring, prime preservation, and multi-hyphen
  Telegram forms.
- The RED run failed only on the absent package/module/APIs and old opaque minting paths.

## 2026-07-11 — T005–T008 implementation

- Re-added exact `unique-names-generator@4.7.1`; install audit remains at the post-s039
  baseline of 26 findings and zero critical.
- Created the production candidate sequence. Attempt zero is byte-compatible with the
  PoC; subsequent attempts linearly probe the complete Cartesian space without repeats.
- Extended `FsRegistry` with one atomic by-pij owner record shared by native identity
  claims, pre-bind reservations, and descriptor ownership.
- Wired Pi boot, control-plane spawn, agent spawn, and adopt to memorable allocation.
  Existing native mappings and opaque descriptors win before allocation.
- `adopt --id` now requires an existing descriptor/reservation; crash-orphan recovery is
  explicit and unknown ids return `E-NOID`.
- Updated user and domain contracts; preview-only `pij-name-poc` surfaces remain absent.

## 2026-07-11 — T009 proof

- Collision-retry mutation changed the `E-AMBIG` retry guard: registry tests went RED,
  the file restored byte-identically, and the suite returned GREEN.
- Legacy-reuse mutation disabled the untagged Pi migration guard: registry/index tests
  went RED, the file restored byte-identically, and the suite returned GREEN.
- Targeted identity suites: 232 tests passed.
- Full repository suite: 1,764 passed, 10 skipped; flow-pair suite: 148 passed.
- Exact package pin and preview-surface absence checks passed; npm audit remained
  10 moderate + 16 high = 26 total, zero critical.
- `harness checks` passed all six sensors: typecheck, lint, test, smoke, package audit,
  and snapshots.
- Daemon restart and live multi-peer creation use the orchestrator's shared-resource
  baton and remain an orchestrator-owned acceptance action, as specified by T009.

## Harness feedback

- `harness/scripts/flow-pair-mutate.sh` accepts a third custom test command, but the
  `just flow-pair-mutate` recipe exposes only file + expression. Non-flow-pair mutation
  proofs therefore require direct script invocation; the recipe should forward an
  optional test command.
- Full `harness checks` refreshed five `vetted.date` values in `.pi/packages.yaml`
  even though package audit is documented as report-only. The out-of-fence timestamp
  churn was reverted; the audit sensor should be made read-only.

## 2026-07-12 — review fix 001

- **F001**: split candidate allocation into by-pij owner claim, live-descriptor
  compatibility validation, then by-native tuple publication. A same-native racer may
  complete the tuple without having its shared owner record removed; race winners are
  validated against the exact native tuple before reuse, and occupied untagged legacy
  descriptors are retried without modification.
- **F002**: added synchronized real-process allocation races using six `tsx` workers
  behind a filesystem barrier. Four rounds prove free attempt zero converges for every
  caller; four rounds prove an unowned legacy attempt zero sends every caller to attempt
  one, preserves the legacy bytes exactly, and retains the winning owner/tuple records.
- **F003**: adopt JSON and human output now derive binding state from the final
  descriptor. Real-CLI coverage proves `adopt --id <existing>` with no explicit or
  discoverable native id reports the stored native id and `bound`, never `pending`.
- Reviewer collision mutation went RED and restored GREEN.
- Focused registry + CLI integration: 58 passed. `just typecheck`,
  `just flow-pair-test` (148 passed), and `git diff --check` passed.

## 2026-07-12 — review fix 002 (F004)

- Reproduced the Copilot `/new` identity-theft bug RED: a globally newer old
  session-state directory was selected instead of the current
  `COPILOT_AGENT_SESSION_ID`, and env-absent adopt reused the old durable descriptor.
- Replaced global mtime selection with current-session resolution: the env value must
  be a UUID and match directory metadata under `~/.copilot/session-state`.
- Missing/invalid env no longer falls through to another global session. Adopt remains
  pending with an actionable `bindingIssue`; explicit `--session-id` still wins.
- Phonehome now resolves native identity by descriptor harness:
  `COPILOT_AGENT_SESSION_ID` for Copilot and `CLAUDE_CODE_SESSION_ID` for Claude.
- Real-CLI regression keeps the old descriptor bytes, pane, and tuple untouched while
  current-env adopt creates its own identity. A second regression starts pending with
  no env, then binds that same memorable id through Copilot phonehome.
- Focused Copilot/binding/core-CLI/integration suites: 117 passed. `just typecheck`,
  `just lint`, `just flow-pair-test` (148 passed), and `git diff --check` passed.

## 2026-07-12 — T009 reviewed live proof

- Round-three cold review (`pij-16d2xlz`, GPT-5.6 Sol xhigh) returned **APPROVE**;
  F001-F004 are closed. Reviewer global-fallback mutation went RED (2 failures),
  restored byte-identically, then GREEN.
- Daemon restarted under lease
  `lease-28b97565-749c-4406-86cd-b336d367f306`: PID `66261` -> `39754`.
  The first immediate status read raced startup and showed orphan; one bounded
  three-second recheck proved the daemon healthy.
- Existing memorable peer `pij-concrete-reptile` received nonce
  `S040-REPTILE-612` and replied after the sender's receipt wait timed out.
- Fresh spawn minted `pij-medieval-jaguar`, bound to Copilot, and reported its own id
  via `pij whoami` (`S040-FRESH-SELF-901`).
- Pending recovery proof:
  - raw Copilot pane `%476`, native UUID
    `73b49588-f1cc-4071-89b1-0ba6ad77df0c`;
  - adopt ran with `COPILOT_AGENT_SESSION_ID` removed and safely created pending
    `pij-endless-cuckoo` with a no-global-fallback binding issue;
  - daemon init triggered `pij phonehome` without manual pane injection;
  - descriptor became `bound` to the exact UUID and the pane reported
    "Bound successfully as pij-endless-cuckoo."
- F004 live user reproduction and read-only diagnostic established
  `COPILOT_AGENT_SESSION_ID` as canonical across `/new`; global mtime, process argv,
  and `inuse.<pid>.lock` were stale/ambiguous and are no longer identity sources.
- `pij-gigantic-goat` could not be reused for the post-restart canary because its
  process had died overnight; this was reported rather than hidden.
- A send `--wait` timeout followed by a valid nonce reply is delayed confirmation,
  not message loss. Jordan's separately observed Enter/input issue remains watch-only
  until reproducible.
- Owned coder, reviewer, fresh-spawn, retained-canary, and pending-recovery peers were
  dissolved after proof.
- Final `harness checks` passed typecheck, lint, test, smoke, package audit, and
  snapshots. Package-audit timestamp churn was restored to the pre-check manifest bytes.
