# 071 — Honest delivery: instant, truthful, self-healing

**Status**: READY
**Mode**: Simple
**Branch**: `s071/honest-delivery` (rebased on main `8ffac67`)
**Source of truth**: `.harness/temp/brief/BRIEF.md` (+ `.harness/temp/brief/REPRO-IDS.md`)
**Orchestrator**: `pij-reasonable-dove` · **Coder**: `pij-panicky-cardinal`

## Business spec

Three production failures on 2026-07-25 share one root: **pij tells you things that are
not true, and takes far too long to tell you anything at all.**

1. A daemon whose every tick crashed still reported green tests.
2. ~2,000 dead descriptors made each tick ~19s; every send waited a tick → 10–20s delivery.
3. A peer that could never bind sat forever as `idle · active`, `failureReason: null`,
   while `pij send` cheerfully returned `queued`.

The outcome we want: **delivery is instant, receipts are honest, and a wedged seat says so
out loud and can be recovered without hand-editing `~/.pij`.**

## Key findings (grounding — read before touching code)

| # | Finding | Evidence |
|---|---|---|
| KF-1 | `Daemon.tick()` calls `registry.list()` **6×** (4 `index.rebuild`, death sweep, watchdog reconcile) — each a full `readdir` + `JSON.parse` of every `~/.pij/*.json`. Cost is O(all descriptors ever), not O(live). | `daemon.ts:243,248,276,327,581,597` |
| KF-2 | The tick also **writes** `lastTickAt` to every daemon-owned descriptor every 600ms. | `daemon.ts:243-247` |
| KF-3 | `driveSession`'s `discovery.status === "ambiguous"` branch **returns before the watchdog block**, so an ambiguous transcript discovery never times out, never fails, never sets `failureReason`. This is the eternal `pending` / `idle · active` / `failureReason: null` signature exactly. | `core/daemon/loop.ts:431-435` vs the watchdog at `:438` |
| KF-4 | Non-branched claude spawns rely on **transcript new-path discovery**, which is racy by construction. Two claude peers sharing one cwd → two new paths → permanently ambiguous. `claude --session-id <uuid>` is supported standalone (verified via `claude --help`), so the id can be **pinned at spawn** like copilot/branched-claude already are — removing the race rather than patching its recovery. | `cli.ts:1508-1540`, `loop.ts:363-397` |
| KF-5 | Baton grant compares pins with `!==` string equality, so a short pin (`d5b9b6d7`) vs a full HEAD sha is "moved". | `core/orchestration/baton.ts:291` |
| KF-6 | The composer content gate is **commented out** under the 2026-07-25 emergency bypass and two of its tests are `it.skip`'d (main `8ffac67`). Out of scope here — do not re-enable. | `daemon.ts:178-181` |

## Testing strategy

**Hybrid**, with three non-negotiable gate rules from `green-that-lies`:

- **Real-adapter integration test** — at least one test drives the actual `DaemonTmux`
  **class instance** through the `Daemon` ports wrapper. The 067b4a1 spread bug survived
  because every fake was a plain object; a class instance is the only shape that catches it.
- **Control test per suppression/refusal** — every fix that makes something refuse, fail,
  or degrade ships a byte-identical-setup test proving the behaviour **fires without the fix**.
- **Dim-0 mutation on the final rebased tree**, printing `MUTATION APPLIED` lines, with
  behaviour-preserving mutants.

Plus `just typecheck && just lint && just test` and vitest on touched files (typecheck
excludes tests — vitest runs regardless).

## Constraints

- NEVER restart the machine-wide daemon from this worktree (orchestrator owns restarts).
- Do NOT mutate `~/.pij` archive layout live — code + tests only until dove approves migration.
- Daemon stays the **single writer** for archival moves; the CLI may only read the archive.
- Forward-only commits; PR to main when gates pass; no merge without cross-model review.

## Tasks

| ID | Task | D | Status |
|---|---|---|---|
| T001 | Pure archival policy: `classifyRegistryRecord` (hot vs archivable), 48h terminal rule | D1 | [x] |
| T002 | `FsRegistry`: keyed archive fallback (direct path, no glob), `listArchived()` over `archive/index.jsonl`, atomic `archive()` move + index append, `revive()` | D1 | [x] |
| T003 | Daemon tick-end archival sweep; tick-duration log every tick; hot-only scan | D1 | [x] |
| T004 | Delivery decoupled from the tick: `deliverPass()` on its own 200ms timer; tick demoted to reconciliation. **Not fs-watch** — `adapters/channel.ts:78-91` records that the live inbox watchers DROPPED fs.watch (FSEvents ~0.6-1.6s/handle, drops events SILENTLY under load); poll-primary gives a load-independent SLA and is shipped==tested. Deviation ruled APPROVED by pij-reasonable-dove 2026-07-25. | D2 | [x] |
| T005 | Never-bind fail-loud: ambiguous discovery no longer bypasses the watchdog; `bind-timeout` failure reason | D3 | [x] |
| T006 | Honest receipts: `delivered` only on observed injection; `queued` carries WHY; `blocked: peer never bound` | D3 | [x] |
| T007 | Pre-bind visibility: unbound-with-queued-task presents DEGRADED in `pij state`/`list` | D3 | [x] |
| T008 | Root fix: pin claude's session id at spawn (`--session-id`), killing transcript-discovery races | D4 | [x] |
| T009 | Defect A: `whoami` remediation says `pij phonehome` when a pending descriptor owns this pane | D4 | [x] |
| T010 | Defect B: `adopt` re-attaches an existing pending descriptor for the same pane, never mints a duplicate | D4 | [x] |
| T011 | Defect C: `pij identity release <id>` — release a native-identity claim without teardown | D4 | [x] |
| T012 | Baton `grant` E-PIN: prefix/rev-parse compare, not string equality | D5 | [x] |
| T013 | `pij list --here` help text notes it filters by folder | D5 | [x] |
| T014 | Batch liveness: one `tmux list-panes -a` + one ps snapshot per `list`/`state` call | D5 | [x] |
| T015 | Gate: real `DaemonTmux` class-instance integration test through the ports wrapper | GATE | [x] |
| T016 | Gate: full `just typecheck && just lint && just test` + Dim-0 mutation on the rebased tree | GATE | [x] |
| T017 | D6: canary context check — observed contradiction FAILS, unobservable PASSES as `contextTier=unverified` | D6 | [x] |
| T018 | D7: durable pending delivery — `failed` split from `unverified`; only a typed payload consumes | D7 | [x] |
| T019 | D3 addendum: `pij send` stamps the SENDER's `lastEventAt` | D3 | [x] |

## Discoveries & Learnings

| Task | Kind | Note |
|---|---|---|
