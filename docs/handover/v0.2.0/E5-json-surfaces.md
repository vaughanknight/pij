# E5 — `pij state --json` and `pij list --json` are lossy, inconsistent projections of the same descriptor

**Item id / stream at handover:** E5 (encode candidate, o-prime 2026-08-27) · s391-day3-core
**Status at v0.2.0 (tag `d120c53`):** designed (surveyed at the tag; no branch)
**Size estimate:** S (2–3 h) · **Order / dependencies:** none

## 1. Why this exists (the observed failure, with evidence)
- Encode row E5 (`government/briefs/encode-candidates-2026-08-27.md`, main): "`pij state --json` carries no `statusAt` while `pij list --json` does; `pij list --json` carries no `harness`; NEITHER carries the pane id (only the descriptor file's `paneId` does) — lossy-surface trap (recipe step 12 class), hit three times on 2026-08-27" — PA and prime recipes that scripted against one surface silently lost fields the other had.
- At `d120c53` there are THREE hand-maintained `--json` object literals over the same `SessionDescriptor` in `.pi/extensions/pij/core/cli.ts`:
  - `state --json` (`case "state"` `:3676`; literal `:3694-3747`, 21 keys): `id lifecycle state activity liveness lastEventAt pid cwd harness orchestrationRole parent boundModel effort daemonLastTickAt daemonTickAgeMs daemonTickStale failureReason degraded degradedReason terminal watchdog` — **no `statusAt`/`statusPrev`/`statusNext`/`statusSeq`/`statusWrittenBy`, `planId`, `currentAssignment`, `currentTask`, `semanticState`, `stateNote`, `prime`, `oldPrime`, `bindHealth`, `boundProvider`, `dataDir`, `folder`, `unadopted`; no `paneId`/`windowId`.**
  - `list --json` (`case "list"` `:2861`; literal `:2900-2963`, 30 keys): `id folder dataDir pid state activity liveness lastEventAt boundModel boundProvider effort failureReason bindHealth terminal watchdog prime oldPrime orchestrationRole currentAssignment currentTask semanticState stateNote statusPrev statusNext statusAt statusSeq statusWrittenBy planId parent unadopted` — **no `cwd`, `harness`, `lifecycle`, `daemonLastTickAt`/`daemonTickAgeMs`/`daemonTickStale`, `degraded`/`degradedReason`; no `paneId`/`windowId`.**
  - `node show` (`case "node-show"` `:5869`; card `:5890-5930`) is the only surface that emits `paneId`/`windowId` (plus `harness`, `assignments[]`, `contextMax`).
  - So the original E5 row is still exactly true at the tag: `state` lacks `statusAt`; `list` lacks `harness`; NEITHER carries the pane id. (Both already emit `parent` = `effectiveParent(d)` by an in-code ruling, `:2952-2961` — D-041; keep that key and name.)
- Incidents: recipe step 12 class — a script reading `pij state --json` for the pane id to `tmux send-keys` got `undefined`; a PA reading `pij state --json` for the status card (`statusAt`) got nothing while `list --json` had it; the o-prime's E5 row counts three hits on 2026-08-27. Corroboration that the sets above are the real ones: `government/canaries/s391.md:7` records identity "from registry (`pij state --json`): harness=claude … parent=… cwd=…".

## 2. What is ruled (design / spec)
- One projection function for the machine surface: `descriptorJson(d, extras)` in `core/cli.ts` (or `core/descriptor-json.ts`) that all THREE commands call (`state`, `list`, `node show`); `list` adds `folder`/`unadopted`, `state` adds the daemon-tick/degraded fields, `node show` adds `assignments[]`/`contextMax`. Every descriptor field any surface exposes today (union of the three sets above, incl. `paneId`/`windowId`, `harness`, `cwd`, the five `status*` keys, `prime`/`oldPrime`, `bindHealth`, `boundProvider`) is exposed by all (additive — no key removed, `parent` keeps its ruled name/notion).
- The text renderers stay as they are (humans read them); only `--json` is the contract.
- A test pins the field-set union: `Object.keys(stateJson)` ⊇ UNION − declared per-surface extras, same for `list` rows and the `node show` card, driven through the real CLI over a sandbox `PIJ_HOME` (`cli.integration.test.ts` pattern), not a unit of the helper alone (E34).

## 3. Where the code is (at tag `d120c53`)
- `core/cli.ts` — `case "state"` `:3676` → literal `:3694-3747`; `case "list"` `:2861` → literal `:2900-2963` (with the `parent`/`effectiveParent` rationale at `:2952-2961`); `case "node-show"` `:5869` → card `:5890-5930` (the one with `paneId`, `windowId`, `assignments[]`). All read a `SessionDescriptor` (`core/types.ts`) plus `projectOrchestrationRole(d)`.
- `cli.integration.test.ts` — the sandbox-CLI harness (items 6/32 precedent).
- `docs/how/pij.md` — has NO field table today (only `:684-689` `pij state pij-worker --json   # boundModel, failureReason fields`); write one (the union, with which surface adds what).

## 4. Acceptance (behavioural, mechanical)
- Tests (real CLI, sandbox home, one descriptor with EVERY optional field set): `pij state <id> --json`, each `pij list --json` row and the `pij node show <id> --json` card contain the UNION: `id lifecycle state activity liveness lastEventAt pid cwd harness orchestrationRole parent boundModel boundProvider effort failureReason bindHealth terminal watchdog prime oldPrime currentAssignment currentTask semanticState stateNote statusPrev statusNext statusAt statusSeq statusWrittenBy planId paneId windowId contextMax`; `state` additionally `daemonLastTickAt daemonTickAgeMs daemonTickStale degraded degradedReason`; `list` additionally `folder dataDir unadopted`; `node show` additionally `assignments[]`.
- **MUT-E5a**: delete `paneId` from the shared projection → all three tests RED (proves one source; neither `state` nor `list` has it today, so the test is RED on base by construction). **MUT-E5b**: give `list` back its own literal at `:2900-2963` (lacking `harness`, `cwd`, `lifecycle`) → the list test RED on those keys. **MUT-E5c**: give `state` back its own literal at `:3694-3747` (lacking `statusAt` and the card fields) → the state test RED. **MUT-E5d**: drop `parent` → every test RED (the ruled key must survive).
- Gates: `npx vitest run .pi/extensions/pij/` at the merge product; `just typecheck`; `just pij-skill-check` (the `/pij` skill quotes `--json` field names — grep `skills/pij/**` for `statusAt`/`paneId` and update).

## 5. Live verification (after a daemon restart carrying it)
CLI-only (no restart): `pij state $(pij whoami) --json | jq '{id,harness,paneId,statusAt}'` and `pij list --json | jq '.[0]|{id,harness,paneId,statusAt}'` — all keys present (null allowed, never missing).

## 6. Risks / gotchas that already bit us
- Recipe step 12 class (PA standup recipe): scripts trusted one surface — three losses in a day.
- `just pij-skill-check` is load-bearing for skill text that names JSON fields (orient-local 2026-08-27); a rename without the skill update ships a lie.
- E-rule additive schema: never remove a key; add, alias, deprecate in docs.

## 7. Open questions for the human
None — `parent` (= `effectiveParent`, the same notion `node show` projects) is already ruled in code (`core/cli.ts:2952-2961`, D-041); keep it.
