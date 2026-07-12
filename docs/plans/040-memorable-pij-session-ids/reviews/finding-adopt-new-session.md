# F004 - Copilot `/new` can adopt an unrelated old durable identity
**Severity**: CRITICAL
**Source**: Jordan live report, 2026-07-12

## Reproduction

1. In a Copilot pane, type `/new`.
2. The new agent runs:
   `pij adopt "$TMUX_PANE" --harness copilot`.
3. It adopts old id `pij-aa756x` instead of minting a new memorable id.

Jordan explicitly authorized a direct read-only diagnostic interview with the misbound
agent. No product edit is delegated through that contact.

## Evidence

- `pij-aa756x` started at `2026-07-11T09:20:11.226Z`, but adoption moved it to pane
  `%470` and bound native id `2a87e6a4-ec58-4c78-8eae-8123df46bf4d`.
- `copilotSessionStateScan()` chooses the globally newest UUID directory by mtime with
  no cwd, pane, process, or current-session discriminator:
  `.pi/extensions/pij/core/harness/copilot.ts:38-53`.
- At the adoption instant, `2a87...` was the newest visible directory. Newer Copilot
  session directories appeared only after the new agent continued running.
- Therefore a fresh `/new` can attach to another live/recent Copilot session's durable
  tuple before its own session-state directory is observable.

### Deterministic signal found

- The `pij adopt` child environment contains
  `COPILOT_AGENT_SESSION_ID=df4f563b-314a-4a79-b019-ddba54ac33c1`.
- `df4f.../workspace.yaml` names that id.
- `df4f.../events.jsonl` starts that session and contains the exact adopt prompt/tool
  invocation.
- The directory existed about 37 seconds before adopt. Old `2a87...` became globally
  newest only because routine shutdown/workspace activity touched it about two seconds
  later than `df4f...`.
- Native PID `34859` argv still names pre-`/new` session `61f7...`, and both `61f7...`
  and `df4f...` have `inuse.34859.lock`; argv and lock files are stale/ambiguous after
  `/new`.

`COPILOT_AGENT_SESSION_ID` is the canonical current-session signal. Global mtime,
process argv, and in-use locks are not authoritative across `/new`.

## Contract violation

- Fresh `/new` must mint a new identity, never reattach an old peer.
- Exact durable tuple reuse is valid only after the current Copilot native session is
  identified without ambiguity.

## Required fix

- Never treat a global newest-by-mtime Copilot directory as authoritative current-pane
  identity when the current session cannot be uniquely correlated.
- Read `COPILOT_AGENT_SESSION_ID` from the adopt process environment and validate its
  UUID plus matching session-state metadata (`workspace.yaml` / `session.start`).
- Never let global newest-mtime override or substitute for the environment UUID.
- If the environment signal is absent/invalid, require explicit `--session-id` or remain
  pending/fail clearly; never bind the globally newest Copilot directory.
- Add a regression where another Copilot session is newest when adoption begins and the
  current `/new` directory appears later; the old descriptor must remain untouched and
  the fresh session must not receive its id.

## Independent reviewer assessment

**Reviewer**: `pij-16d2xlz`  
**Independent severity**: **CRITICAL**

The live outcome corrupts the primary identity boundary: adoption rewrites the old
descriptor's pane/PID/cwd attachment to the fresh agent, so messages, remote commands,
telemetry joins, event/history paths, and operator actions addressed to the old pij id
can reach the wrong session. This is more than a delayed bind or stale display; it
reattaches an unrelated durable identity and makes the old peer's primary key represent
the new agent.

### Root cause

1. `copilotSessionStateScan()` selects one UUID from a machine-global directory using
   only newest mtime.
2. `runAdopt()` supplies that guess to `resolveAdoptSessionIdForHarness()`.
3. The Copilot resolver treats the guess as authoritative, with no provenance or
   ambiguity state.
4. `runAdopt()` then performs durable tuple lookup. When the guessed UUID already has a
   durable mapping, normal reuse semantics reattach its old pij id to the new pane.
5. The current Copilot process exposes `COPILOT_AGENT_SESSION_ID` as a canonical UUID,
   but pij does not read this variable anywhere. The existing generic
   `envSessionId` input is populated only from `CLAUDE_CODE_SESSION_ID`, and the Copilot
   resolver ignores it.
6. `pij phonehome` is also Claude-only: it reads only
   `CLAUDE_CODE_SESSION_ID`. Therefore a safe Copilot pending fallback has no
   harness-aware self-confirmation path today.

The allocator and durable registry are not the initiating defect. They are given the
wrong native tuple and then correctly reuse its durable id.

### Required behavior

- An explicit `--session-id` remains authoritative.
- A current-session Copilot signal may be authoritative only when it is proved to track
  `/new` correctly. The live environment exposes `COPILOT_AGENT_SESSION_ID`; the
  read-only agent interview must confirm that its value at adoption time equals the
  fresh `/new` session UUID rather than the prior session.
- A machine-global newest-by-mtime directory must never be authoritative for adoption.
- If no deterministic current-session signal exists, adoption must either:
  - create/retain a pending descriptor with an actionable confirmation path; or
  - fail with an actionable request for `--session-id`.
- A pending Copilot path requires `phonehome` to read the harness-appropriate current
  session signal; otherwise it cannot safely converge.

### Required regression

Add a real CLI boundary test with these fixtures:

1. Seed old Copilot native tuple `old-native` -> `old-pij-id`, including a live
   descriptor with sentinel pane/PID/cwd/prime/history fields.
2. Make `old-native` the newest visible `~/.copilot/session-state` directory.
3. Set the deterministic current-session signal to `new-native`; initially omit
   `new-native`'s session-state directory, then allow it to appear later.
4. Run `pij adopt <pane> --harness copilot` without `--id` or `--session-id`.
5. Assert the fresh session never receives `old-pij-id`.
6. Assert the old descriptor is byte-identical and its by-native mapping remains
   `old-native` -> `old-pij-id`.
7. Assert the fresh session is either:
   - bound to `new-native` under a new memorable id when the current-session signal is
     available; or
   - safely pending/failed with an actionable diagnostic when it is unavailable.
8. Re-run after `new-native` becomes visible and prove exact reuse of the fresh id,
   never the old id.

Add a negative companion case with no deterministic Copilot signal and only an old
global directory: the resolver must return no authoritative native id. Also add
phonehome coverage if pending is retained.

## Round-three resolution

**Status**: **RESOLVED**  
**Reviewed patch**:
`review-input-round3.patch` (`5e17053e023457184a86605dc36f39c6fe0f442ed5dafe949b512c3709ecc877`)

- Validated `COPILOT_AGENT_SESSION_ID` is now the only implicit Copilot identity.
- Missing, malformed, or state-unmatched values stay pending with an actionable
  `bindingIssue`; no global session is selected.
- Explicit `--session-id` remains authoritative.
- Copilot phonehome reads the Copilot env, not the Claude env.
- Reviewer mutation of the no-global-fallback guard went RED and restored GREEN.
- Reviewer delayed-directory proof preserved the old descriptor bytes and durable
  tuple, then bound the fresh pending id after the current state directory appeared.

**Disposition**: F004 closed; Plan 040 final review verdict is **APPROVE**.
