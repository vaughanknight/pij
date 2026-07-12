# Requested fences — s041 inbox without tmux

**Requested from**: o-prime `pij-3vetx8`
**Status**:
- Planning fence: GRANTED.
- Phase 1: GRANTED OUTRIGHT at government spine Seq 43.
- Phase 2: GRANTED, including the daemon ownership and portable-integration
  addenda below.
- Phase 3: OPEN; request at its phase checkpoint.

## Planning fence

| Path | Action | Ownership / condition |
|------|--------|-----------------------|
| `docs/plans/041-pij-inbox-no-tmux/**` | modify/new | s041 single-writer |
| `.harness/temp/s041/**` | transient new | s041 scratch; never commit |

## Phase 1 — Portable Backpressure and Durable Inbox

| Path | Action | Ownership / condition |
|------|--------|-----------------------|
| `.pi/extensions/pij/core/{types,ports}.ts` | modify | s041 |
| `.pi/extensions/pij/adapters/{channel,channel.test,fakes,fakes.test}.ts` | modify | s041; `fakes.test.ts` addendum requested after task validation identified the canonical test home |
| `.pi/extensions/pij/cli.inbox.integration.test.ts` | new | s041; platform-neutral, no fake tmux |
| `harness/scripts/windows-compat.ts` | new | s041 |
| `.harness/extensions/checks/{extension.ts,instructions.md}` | modify | shared harness contract; s041 requested |
| `justfile` | modify | shared composite surface; add one thin `windows-compat` recipe + compose into `self-check` |
| `package.json` | modify | **shared/pinned surface**; scripts-only change requested; preserve s040 dependency pins; no dependency or lockfile edit planned |
| `.github/workflows/ci.yml` | modify | **shared/history surface**; s039 previously changed it; add isolated Windows portable job without rewriting existing Linux job |

### Phase 1 grant conditions

- `package.json` is scripts-only; prove dependency sections unchanged.
- `.github/workflows/ci.yml` adds an isolated Windows job and preserves the s039
  Linux flow.
- Every NEW-labelled path is existence-probed before creation.
- Any test that spawns real subprocesses declares an explicit Vitest timeout at
  authoring time.

## Phase 2 — Inbox CLI and Ambient Registration

| Path | Action | Ownership / condition |
|------|--------|-----------------------|
| `.pi/extensions/pij/core/{inbox,inbox.test,current-session,current-session.test}.ts` | new | s041 |
| `.pi/extensions/pij/core/{types,ports,harness/types,harness/types.test,harness/pi,harness/pi.test}.ts` | modify | s041; harness test siblings added after task validation |
| `.pi/extensions/pij/core/daemon/{router,router.test}.ts` | modify | s041 |
| `.pi/extensions/pij/{core/cli.ts,core/cli.test.ts,core/binding.ts,core/binding.test.ts,cli.ts,cli.integration.test.ts}` | modify | s040 is CLOSED; ordinary s041 ownership unless o-prime reports a new claimant |
| `.pi/extensions/pij/cli.inbox.integration.test.ts` | modify | addendum granted for the portable two-shell Windows proof; explicit subprocess timeouts required |
| `.pi/extensions/pij/orchestration-notice.integration.test.ts` | modify | F-001 addendum: dissolved/live pull production rows only; explicit timeout on the subprocess table |
| `.pi/extensions/pij/{daemon.ts,daemon.test.ts}` | modify | addendum granted for delivery-mode ownership filtering/tests/live proof only; delete-to-marker remains Phase 3 |
| `.pi/extensions/pij/adapters/{event-log,event-log.test,fakes,fakes.test}.ts` | modify | residual F-002 addendum: additive atomic `appendOnce` API and dual-consumer proof only |
| `.pi/extensions/pij/adapters/fs-registry.ts` | no planned write | s040-owned; consume existing APIs |
| `.pi/extensions/pij/core/{discovery,spawn}.ts` | no planned write | s040-owned |
| `.pi/extensions/pij/core/harness/copilot.ts` | no planned write | s040-owned |

### Phase 2 grant conditions

- Worktree-first on branch `s041/inbox-no-tmux`.
- New Phase 2 worker/reviewer seats start with the worktree as cwd.
- Every subprocess test declares an explicit timeout at authoring.
- Pull ownership receives cold review approval before the daemon restart.
- Daemon restart uses the baton; o-prime sends the machine-wide heads-up.
- Existing tmux-bound delivery is regression-proved before restart.
- `EventLogPort.appendOnce` is additive; legacy `append()` behavior is unchanged.
- Atomic publication uses one fsync and one hard-link attempt with no retry loop.
- The real hard-link path runs in the Windows compatibility lane.

## Phase 3 — Push-Path Convergence and Guidance

**Status**: GRANTED at government spine Seq 53.

| Path | Action | Ownership / condition |
|------|--------|-----------------------|
| `.pi/extensions/pij/{daemon.ts,daemon.test.ts,index.ts,index.test.ts}` | modify | s041 |
| `.pi/extensions/pij/{cli.ts,cli.integration.test.ts}` | modify | CLI help and regression proof |
| `.pi/extensions/pij/core/daemon/{loop,loop.test}.ts` | modify | s041 |
| `skills/pij/{SKILL.md,references/00-routing.md,references/routes/peer.md}` | modify | live-deployed shared skill; edit last; `just pij-skill-check` required |
| `docs/how/pij.md` | modify | shared operator contract |
| `docs/domains/{pij-messaging,pij-skill}/domain.md` | modify | shared domain contracts |
| `docs/domains/pij-control-plane/domain.md` | modify | HELD until s043 R8 is APPROVED and pushed to PR #11; refresh/rebase before additive edit |
| `docs/domains/{registry.md,domain-map.md}` | modify | shared domain indexes |

## Shared-resource requests

| Resource | Window requested | Release proof |
|----------|------------------|---------------|
| `git-index` | Pathspec-only commits for the granted phase; never stage unrelated s040/s039 changes | commit sha + exact path list + gates |
| `daemon-restart` | Phase 2 after pull-ownership review approval; Phase 3 after final daemon change approval | restart + post-restart canary |
| `package.json` | Phase 1 scripts-only serialized edit | diff proves dependencies unchanged |
| `.github/workflows/ci.yml` | Phase 1 isolated Windows-job edit, preserving s039 Linux flow | diff + YAML/CI proof |

Phase 3 daemon restart remains baton-gated after cold review APPROVE. Skill edits
land last.

## Explicit exclusions

- No `package-lock.json` change is planned.
- No dependency addition or version change is planned.
- No write to `government/**`, `.the-flow-state.json`, or hand-edited
  `the-flow.json` / `the-flow.md`.
- No daemon restart without the baton.
- No public push without o-prime + Jordan gates.
