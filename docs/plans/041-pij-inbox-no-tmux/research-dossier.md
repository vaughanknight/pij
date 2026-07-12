# Research Dossier: pij inboxes without tmux

**Generated**: 2026-07-12T10:31:00+10:00
**Query**: "Pij inboxes for when we don't have TMUX (mostly for when we on windows)"
**Effort**: Standard
**Tools**: Mixed
**Evidence**: 12 current sources · 3 historical sources

## Answer

1. pij already has a portable delivery substrate: every send is an atomic
   `msg-*.json` drop under the target's data directory. The missing feature is a
   durable consumer/read-state API, not a new transport.
2. Current consumption semantics are implicit and incompatible with a pull inbox:
   the daemon deletes tmux-injected messages, while the pi receiver retains files
   and keeps only an in-memory `seen` watermark. Neither path persists when or how
   a message was read.
3. `pij check [--wait [ms]]` fits the existing pure CLI grammar/dispatch plus the
   thin bin's polling pattern. It can resolve self through `PIJ_SESSION_ID` without
   tmux, list unread non-receipt messages in order, mark returned messages read,
   and block until at least one unread message exists.
4. Pushed paths should converge on the same read-state operation: tmux injection
   marks the inbox copy read after an injection outcome is obtained, and pi marks
   it read after handing it to `PijSession.onInbound`. Deleting injected files
   would destroy the history the new surface requires.
5. The no-tmux receive path does not itself require a daemon. The unresolved
   product boundary is identity/registration: existing `adopt`, spawn, and skill
   prerequisites require tmux, so a fresh external agent in a normal Windows shell
   has no documented way to create its descriptor and `PIJ_SESSION_ID`.
6. Windows support needs executable proof, not only a source sweep. CI is Ubuntu
   only, and the CLI integration suite creates a POSIX `#!/bin/sh` fake `tmux` and
   uses executable-mode bits, so the current test harness is not Windows-runnable.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | `FsChannel.deliver` atomically writes ordered `DeliveredMessage` JSON files into `<PIJ_HOME>/<id>/inbox`; the payload has no read field. | `.pi/extensions/pij/adapters/channel.ts:15-18,38-54` | Extend the existing file contract; do not add a second transport. | High |
| F-02 | `FsChannel.watch` scans existing and new files in id order, dedupes only through a caller-owned in-memory `Set`, and has a poll fallback when `fs.watch` drops events. | `.pi/extensions/pij/adapters/channel.ts:57-110` | Reuse ordering and polling, but replace ephemeral read semantics with durable state. | High |
| F-03 | Pi seeds `seen` with every existing inbox filename on boot/reload, then injects only later files; retained history is therefore treated as read without recording that fact. | `.pi/extensions/pij/index.ts:313-326` | Pi injection must call the same durable mark-read operation as pull/tmux consumers. | High |
| F-04 | The daemon currently removes receipt files without injection and removes ordinary files after `drainTmuxInbox`; honest delivery receipts are emitted only after the injection outcome. | `.pi/extensions/pij/daemon.ts:346-390,393-406`; `.pi/extensions/pij/core/daemon/loop.ts:416-446` | Mark ordinary messages read only after the outcome; keep receipts hidden and preserve Plan 032 outcome ordering. | High |
| F-05 | CLI verbs are a discriminated `ParsedCommand` parsed/validated in `core/cli.ts`, then executed through injected registry/event/delivery/process dependencies. | `.pi/extensions/pij/core/cli.ts:31-95,215-255,568-569` | Add `check` in the pure core with fake-backed tests; keep filesystem polling in the bin/adapter. | High |
| F-06 | Existing send `--wait [ms]` already supports an optional numeric timeout, polls every 200ms, and defaults to 15 seconds. | `.pi/extensions/pij/core/cli.ts:286-375`; `.pi/extensions/pij/cli.ts:136-138,294-329` | Reuse the grammar/cadence; the default for inbox wait is a product decision, not a mechanics gap. | High |
| F-07 | Self-resolution is already tmux-free when `PIJ_SESSION_ID` is set; `whoami`, `send`, `list`, `state`, and `path` use the registry without invoking tmux. | `.pi/extensions/pij/core/cli.ts:612-687,708-862,891-981`; `docs/how/pij.md:46-55` | Pull receive works in any shell for an already-registered session. | High |
| F-08 | Creating an external session identity is still tmux-bound: `adopt` resolves pane cwd/pid through `tmux display-message`, and spawn/agent-spawn fail `E-NOTMUX`. | `.pi/extensions/pij/cli.ts:998-1025,1289-1315,490-494,1717-1724` | Clarify whether Plan 041 must add a non-tmux registration/adoption path; otherwise Windows support is receive-only for pre-registered sessions. | High |
| F-09 | Daemon auto-start is also tmux-owned (`pij-daemon` window); outside tmux it only prints a start instruction that still follows the same path. | `.pi/extensions/pij/cli.ts:331-405` | Pull inbox must not depend on the daemon; a headless daemon is separate unless required for broader Windows parity. | High |
| F-10 | CI runs only Ubuntu Node 22/24, while CLI integration creates a POSIX shell fake `tmux` and relies on `chmodSync(..., 0o755)`. | `.github/workflows/ci.yml:8-35`; `.pi/extensions/pij/cli.integration.test.ts:105-129` | Add a Windows runner and make the integration harness platform-neutral or split portable vs tmux-only coverage. | High |
| F-11 | Domain ownership is split: `pij-messaging` owns wire/receipt/CLI contracts; `pij-control-plane` owns tmux injection and delivery ownership. | `docs/domains/pij-messaging/domain.md:55-84`; `docs/domains/pij-control-plane/domain.md:53-79` | The plan must change both domains without moving the pi runtime seam into the daemon. | High |
| F-12 | `/pij` currently defines control-plane mode as daemon + tmux self-adopt, promises pushed replies, and declares polling an exception only for broken transports. | `skills/pij/references/00-routing.md:25-39,61-63`; `skills/pij/references/routes/peer.md:6-43` | Update detection, prerequisites, and receive guidance for a first-class non-tmux pull mode. | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | Plan 019 deliberately made external peers push-only through tmux and rejected an inbox-check requirement. | `docs/plans/019-pij-tmux-control-plane/original-ask.md:4-25`; `pij-tmux-control-plane-plan.md:19-35,75-90` | Partial — Plan 041 intentionally adds the fallback while preserving push behavior. | Keep one file-backed send path; add another consumer rather than replacing tmux injection. |
| H-02 | Plan 032 made daemon post-injection outcomes authoritative and added terminal `unverified`; receipt parsing/waiting must never regress. | `docs/plans/032-pij-honest-send-receipts/pij-honest-send-receipts-plan.md:10-26,56-69,133-163` | Direct | Read-state transitions happen after, not instead of, the receipt outcome path. |
| H-03 | Plan 033 avoided a CLI/daemon lost-update race by preferring a CLI-owned sidecar that the daemon only reads. | `docs/plans/033-pij-peer-file-watch/research-dossier.md:27-30,44-50,62-67` | Direct pattern | A read-state sidecar/index is the safer default if message envelopes remain immutable. |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| Read-state storage shape | F-01–F-04, H-03 | In-place envelope rewrites, sidecar state, and unread/read directory moves have different race, compatibility, and retention properties. | Jordan decision before the plan locks tasks. |
| No-tmux identity bootstrap | F-07–F-09 | `check` is useful only after a descriptor and self id exist; Windows cannot use current adopt/spawn. | Clarify receive-only vs full non-tmux registration scope. |
| Wait default | F-06 | Indefinite blocking matches "until"; 15s matches existing send wait and avoids hung automation. | Jordan decision; keep explicit millisecond override either way. |
| Windows verification | F-10 | A source audit without a Windows execution gate can ship false compatibility. | Decide whether Windows CI is required in this plan. |
| Concurrent s040 ownership | Working tree + `government/briefs/s041-brief.md:28` | `core/cli.ts`, `cli.ts`, integration tests, discovery/binding/spawn, and fs-registry are actively modified. | Manifest the overlap and request serialized apply/commit windows through the o-prime. |

## Domain Impact

| Domain / boundary | Relationship | Contract or constraint | Evidence |
|-------------------|--------------|------------------------|----------|
| `pij-messaging` | Modify | Durable inbox/read vocabulary, pure `check` CLI contract, receipt filtering, pi mark-read. | F-01–F-07, F-11 |
| `pij-control-plane` | Modify | Tmux injection marks read after outcome; no daemon ownership of pi injection. | F-04, F-09, F-11 |
| `/pij` agent harness | Modify | Detect non-tmux mode and teach `check --wait` instead of promising push delivery. | F-12 |
| Extension-authoring harness | Modify | Portable integration fixtures and Windows CI proof. | F-10 |

## Planning Handoff

- **Preserve**: atomic inbox writes and lexical ordering; raw body framing at the
  receiver; sender identity; Plan 032 `queued → delivered|unverified` receipts;
  daemon-only tmux injection; pi-only `sendUserMessage`; additive/migration-safe
  persisted fields.
- **Change carefully**: make mark-read idempotent and atomic; exclude internal
  receipts from user-facing `check`; avoid replay after reload; return all currently
  unread messages when a wait wakes; keep old inbox files readable.
- **Likely files/symbols**: `adapters/channel.ts` + tests; `core/cli.ts` + tests;
  top-level `cli.ts` + integration tests; `daemon.ts`/`core/daemon/loop.ts` + tests;
  `index.ts`; `core/types.ts` if read vocabulary moves into the domain;
  `docs/how/pij.md`; `skills/pij/{SKILL.md,references/00-routing.md,references/routes/peer.md}`;
  `.github/workflows/ci.yml`; domain docs.
- **Decisions still required**: read-state persistence shape; `check --wait`
  default timeout; Windows CI requirement; whether no-tmux scope includes
  registration/adoption (and possibly headless daemon/spawn) or only receiving for
  already-registered sessions.
