# Seat handover — pij-primary-carp → pij-reasonable-dove
**Written**: 2026-07-16T09:34:00Z · **Trigger**: Jordan-ruled rotation recorded in `government/spine.md` Seq 385

> Jordan amended the normal order: outgoing prime finished its in-flight s054
> adoption, informed the safe live fleet, then wrote this pack. The incoming marker
> was already active during that bounded overlap.

## Boot path for the incoming seat

1. `pij-reasonable-dove` is already adopted and appears beside `pij-primary-carp`
   in `pij list --prime --here --json`. Do not retire the outgoing marker until its
   final stand-down send.
2. Read: spine → baton book → prime-flow (CLI-only) → briefs → THIS PACK →
   `government/orient-local.md`. The spine must read **Seq 385**.
3. Transfer every writer line after the final send:
   - [ ] `government/spine.md` line `Writer: pij-primary-carp`
   - [ ] `government/baton-book.md` header `Writer: pij-primary-carp`
   - [ ] `government/orient-local.md` header `Writer: pij-primary-carp`
   - [ ] Re-run `rg "Writer:" government` and confirm no additional outgoing owner.
4. Outgoing prime sent preliminary rotation notices under Jordan's amended order.
   After writer transfer, send the authoritative announcement to each live stream,
   citing this pack and naming `pij-reasonable-dove` explicitly.
5. Retire `pij-primary-carp` only after its FINAL send:
   `pij orchestration prime retire pij-primary-carp --json`; verify it disappears
   from current-only prime list and remains queryable as `oldPrime:true`.

## Live state inherited

### Prime overlap

- Outgoing: `pij-primary-carp`, active/current prime until final send.
- Incoming: `pij-reasonable-dove`, active/current prime, pane `%1546`.
- Do not tear down either pane or any stream/fleet as part of rotation.

### Streams and fleets

| Stream | Seat / fleet | State at handover | Next contract |
|---|---|---|---|
| s050 focus agents | `pij-bored-pelican` | **HOLD / low priority**. Phase 1 shipped as PR #23 / `591f188`. Transcript-path hotfix has corrected plan/evidence but no product code. Worktree `s050-focus-sqlite-fix`; artifacts preserved. | Keep frozen and reachable. It is explicitly non-gating for s054. |
| s051 identity integrity | `pij-remarkable-hyena`; coder `pij-fond-sole` working; reviewer `pij-useful-wildfowl` idle | G1–G6 plus issue #24 independently approved. Jordan-authorized terminal-group blocker fix is active under `g7-terminal-group-fix-tasks.md` SHA `e7885b50...`; G7 remains blocked. | Terminal fix → hash-bound independent approval → resume/finish G7 → exact reviewed local commit. No early commit, no push. **Jordan's incoming mission: get s051 through PR before s054 is PR-ready.** |
| s052 update-pi reliability | `pij-pregnant-dragon` working/stale; children `pij-rigid-mollusk`, `pij-unusual-boa`, `pij-zygomorphic-blackbird` idle | Branch `s052/update-pi-reliability@a990056`; PR #25 open/red because authoritative proxy lacks locked Pi 0.80.6. Package/lock remain baseline SHAs `baefc4af...` / `44390b8b...`; only `?? node_modules`. Seq 381 deterministic narrow 0.80.3 derivation is authorized but no candidate has been reported. | Derive → cold review → atomic package+lock apply → policy/root/full gates → NEW local commit. No push until separate Jordan confirmation. This committed outcome also precedes s054 product/PR readiness. |
| s054 pij grown up | `pij-civilian-takin`, Claude Fable 5/high, pane `%1214` | Adoption 3/3 PASS; linked under outgoing prime; brief acked. Worktree `s054-pij-grown-up@591f188`. Research report moved byte-identically to `docs/plans/054-pij-grown-up/grow-up-ask-research.md` SHA `12465f24...` with provenance; canonical copy removed. | Preamble goes to incoming prime. Research/plan only. No product implementation or PR until refreshed fence after s051/s052 convergence; s051 must be through PR first. |

### Additional live or parked peers

- `pij-male-mastodon` exposed a stale PR #14 reconciliation run in
  `/Users/jordanknight/pi-hacking/pij-worktrees/pr14-windows-reconcile`.
  PR #14 already merged as `5830b279`. Its coder
  `pij-evolutionary-junglefowl` received the stale packet immediately before the
  hold; direct tail verification shows it stopped after read-only inspection and
  `harness boot`, with **no mutation**. Keep run/worktree/coder frozen as evidence;
  no repair, cleanup, dispatch, commit, or push.
- `pij-vital-toucan`, pane `%1537`, remains halted from the live issue #20
  owner=`unknown` reproduction. **Do not send, close, link, delete, prune, or
  force-close it.** It was intentionally excluded from rotation broadcast.
- `pij-special-finch` is dead; its determinism ledger inputs are already recorded.
- `pij-voluminous-meerkat` is dissolved; the s050 "loose end" requires no teardown.
- Same-attachment warning: s052 descriptors `pij-unusual-boa` and
  `pij-zygomorphic-blackbird` both report pane `%1398`. Outgoing prime queued one
  text-only rotation notice to each before recognizing the shared attachment.
  No further alias sends; route only through `pij-pregnant-dragon` until reconciled.

## Batons

- `daemon-restart`: free.
- `git-index`: free.
- `push-main`: free.
- `cli-ts-window`: baton-book still names old s037 holder `pij-aa756x` from
  2026-07-11. Treat this as stale/inconsistent and audit before any canonical
  `.pi/extensions/pij/cli.ts` convergence; do not silently assume free.
- Isolated s051/s052/s054 worktree edits/tests/local commits are notify-only.
  Rebase/landing, shared daemon/global state, or same-branch/index work re-enters
  baton discipline.

## Sequencing watches

1. **Closing window — s051 before s054**: preserve exact terminal-fix fence, obtain
   independent approval, finish G7, create the reviewed local commit, then obtain
   push/PR authorization and drive the PR. s054 cannot become PR-ready first.
2. **s052 local commit**: PR #25 remains red/open. Complete only Seq 381's narrow
   derivation; any invariant failure stops. No alternate resolution or push.
3. **s054 preamble**: incoming prime receives `/pij prime` preamble, then may release
   research/plan only. Product fence waits for current-main reread after s051/s052.
4. **s050 hold**: keep parked; no cleanup or donor teardown is required.
5. **Portfolio graph gap**: `harness flow insert-node` for s054 failed E309 because
   legacy `government/prime-flow.json` has disconnected orphan nodes. Never hand-edit
   the JSON; DL-010/retro records the needed repair primitive.
6. **Global skill topology**: `~/.agents/skills/pij` still resolves to protected
   `/Users/jordanknight/pi-hacking/pij-worktrees/land-pij-doctrine-2/skills/pij`.
   Keep that worktree. Repoint to canonical only after content equality and an
   explicit convergence window.
7. **Daemon**: running pid `41256`, window `@1107`; no restart is authorized by
   rotation.
8. **Canonical safety**: backup ref
   `refs/backup/canonical-pre-reconcile-8a0ef68` → `8a0ef685...` remains; preserve
   until explicit cleanup.
9. **Outgoing descriptor**: after final send, incoming retires the marker and
   preserves old-prime history; no pane teardown.

## Ruled-and-settled — do not re-litigate

- s051 terminal-group fix is separate descriptor-only journal/recovery; no active
  boot/re-key/close/effect weakening. G7 stays blocked until independent approval.
- s052 npm reads/downloads/resolution use the Microsoft package-feed proxy only,
  client age=7, fail closed, no npmjs fallback; direct npmjs exists only for
  authenticated publish writes. The authorized immediate path is the exact narrow
  Pi 0.80.3 derivation from verified proxy bytes with SHA512.
- s050 is low-priority HOLD.
- s054 is the large deterministic-platform modernization: JSON governance,
  first-class projects, parent graph/adoption, node task/state/metadata authority,
  terminal addressability, and UI-shaped query contracts. Research/plan first;
  architecture questions remain open to Jordan through the context owner.
- Worktree isolation removes edit-time serialization, not convergence-time
  serialization. No hand-edits to the-flow or prime-flow JSON.
- Shared aliases are never safe individual send/close/link/delete/prune targets.

## Session-bound dependencies and relay contracts

- **Discharged**: s054 adoption nonce, structural link, brief delivery, canonical
  report migration, and 3/3 canary are persisted.
- **Discharged**: outgoing sent rotation notices to every safe current stream/fleet.
  Some receipts remain queued, but delivery is durable and no acknowledgment is a
  progress gate. Incoming sends the authoritative post-transfer announcement.
- **Discharged**: s052 status request was superseded by the rotation notice; future
  report goes directly to incoming.
- **Discharged**: stale PR14 cancellation was verified no-mutation by direct coder
  tail. Male-mastodon was told to send any final audit result directly to incoming.
- **Discharged**: harness observations were harvested into
  `.harness/records/retro/2026-07-16/001-primary-carp-seat-handover.md`; session
  observation buffers were cleared.
- **Final relay**: outgoing sends this pack path + SHA to incoming, then stops.
  Incoming owns writer transfer, authoritative fleet announcement, and outgoing
  marker retirement.

## Uncommitted tree

Canonical `main@591f188` is intentionally dirty. Do not bulk-stage or normalize.

- **Outgoing government state**: tracked `government/{spine,baton-book,orient-local,prime-flow.json,prime-flow.md}` plus untracked briefs/canary,
  including this pack. These are single-writer operational records; incoming decides
  the exact pathspec commit/landing after writer transfer.
- **Harness retro**:
  `.harness/records/retro/2026-07-16/001-primary-carp-seat-handover.md`.
- **Owner/unrelated tracked dirt**: `.pi/packages.yaml`, `README.md`, `RUNBOOK.md`,
  `harness/scripts/link-global.ts`, `justfile`, and the two flow-pair prompt-lab
  candidate files. Preserve; do not infer one owner or stage together.
- **Owner/unrelated untracked dirt**: `.pi-subagents/**`,
  `docs/plans/041-pij-inbox-no-tmux/reports/final-ship-teardown.md`,
  `docs/reports/2026-07-12-flow-pair-dogfood-plan-058.md`,
  older government briefs, and `harness/scripts/link-global.test.ts`.
- **s051 worktree**: 52-file cumulative G1–G7 candidate, ~10k inserted lines, plus
  plan/evidence; no commit yet. Exact terminal-fix fence is narrower than cumulative
  status and remains task-bound.
- **s052 worktree**: `a990056`, only untracked `node_modules`; package files unchanged.
- **s054 worktree**: two expected untracked planning artifacts
  (`grow-up-ask-research.md`, `provenance.md`); no product files.

## Outgoing-descriptor lifecycle

The incoming seat retires `pij-primary-carp` only after the outgoing FINAL send.
The descriptor remains old-prime history. No pane, stream, fleet, worktree, branch,
daemon, alias, or global-link teardown is authorized by this rotation.

**spine-seq at write**: 385
