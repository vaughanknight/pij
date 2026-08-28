# E5 — `pij state --json` and `pij list --json` are lossy, inconsistent projections of the same descriptor

**Item id / stream at handover:** E5 (encode candidate, o-prime 2026-08-27) · s391-day3-core
**Status at v0.2.0 (tag `d120c53`):** designed (surveyed at the tag; no branch)
**Size estimate:** S (2–3 h) · **Order / dependencies:** none

## 1. Why this exists (the observed failure, with evidence)
- Encode row E5 (`government/briefs/encode-candidates-2026-08-27.md`, main): "`pij state --json` carries no `statusAt` while `pij list --json` does; `pij list --json` carries no `harness`; NEITHER carries the pane id (only the descriptor file's `paneId` does) — lossy-surface trap (recipe step 12 class), hit three times on 2026-08-27" — PA and prime recipes that scripted against one surface silently lost fields the other had.
- At `d120c53` the two projections are still two hand-maintained object literals in `.pi/extensions/pij/core/cli.ts`:
  - `state --json` (`:~2905-2960`): `dataDir pid state activity liveness lastEventAt boundModel boundProvider effort failureReason bindHealth terminal watchdog prime oldPrime orchestrationRole currentAssignment currentTask semanticState stateNote statusPrev statusNext statusAt statusSeq statusWrittenBy planId` — **no `id`, `harness`, `lifecycle`, `parent`/`parentId`, `spawnedBy`, `systemState`, `paneId`, `windowId`, `contextMax`, `assignments`**.
  - `list --json` (`:~5885-5930`): `id harness lifecycle parent spawnedBy systemState semanticState stateNote currentAssignment currentTask statusPrev statusNext statusAt statusSeq statusWrittenBy planId orchestrationRole assignments[] paneId windowId boundModel effort contextMax state activity liveness lastEventAt pid` — **no `dataDir`, `boundProvider`, `failureReason`, `bindHealth`, `terminal`, `watchdog`, `prime`, `oldPrime`**.
  - (Part of E5 has since moved: `statusAt` is on both at the tag — items 4/13 added it; `paneId` is on `list` but not `state`.)
- Incidents: recipe step 12 class — a script reading `pij state --json` for the pane id to `tmux send-keys` got `undefined`; a prime's PA parsed `list --json` for `failureReason` (only in `state`); the o-prime's E5 row counts three hits on 2026-08-27.

## 2. What is ruled (design / spec)
- One projection function for the machine surface: `descriptorJson(d, extras)` in `core/cli.ts` (or `core/descriptor-json.ts`) that BOTH commands call; `list` adds per-row `assignments[]`, `state` adds `dataDir` and the watchdog projection. Every descriptor field that either surface exposes today is exposed by both (additive — no field removed; E-rule: additive schema discipline).
- The text renderers stay as they are (humans read them); only `--json` is the contract.
- A test pins the field-set equality: `Object.keys(stateJson).sort()` ⊇ `Object.keys(listRowJson).sort()` minus the declared per-surface extras, driven through the real CLI over a sandbox `PIJ_HOME` (`cli.integration.test.ts` pattern), not a unit of the helper alone (E34).

## 3. Where the code is (at tag `d120c53`)
- `core/cli.ts` `case "state"` `:~3676` → the `--json` literal at `:~2905-2960` (inside the state renderer helper); `case "list"` `:~2861` → the `--json` literal at `:~5885-5930`. Both read a `SessionDescriptor` (`core/types.ts`) plus `projectOrchestrationRole(d)`; `list` also joins assignments (`assignments.map(...)`).
- `cli.integration.test.ts` — the sandbox-CLI harness (items 6/32 precedent).
- `docs/how/pij.md` — documents both `--json` shapes (update the field table).

## 4. Acceptance (behavioural, mechanical)
- Tests (real CLI, sandbox home, one descriptor with EVERY optional field set): `pij state <id> --json` and `pij list --json` each contain `id, harness, lifecycle, parentId, spawnedBy, systemState, semanticState, paneId, windowId, boundModel, boundProvider, effort, contextMax, failureReason, bindHealth, terminal, prime, oldPrime, orchestrationRole, currentAssignment, currentTask, stateNote, statusPrev/Next/At/Seq/WrittenBy, planId, pid, state, activity, liveness, lastEventAt`; `state` additionally `dataDir`, `watchdog`; `list` additionally `assignments[]`.
- **MUT-E5a**: delete `paneId` from the shared projection → both tests RED (proves one source). **MUT-E5b**: give `list` its own literal again lacking `failureReason` → the list test RED. **MUT-E5c**: rename `parent` → `parentId` without the alias → any consumer test reading `parent` RED — decide the name once (the descriptor field is `parentId`; `list` currently emits `parent`): keep BOTH keys for one release, documented.
- Gates: `npx vitest run .pi/extensions/pij/` at the merge product; `just typecheck`; `just pij-skill-check` (the `/pij` skill quotes `--json` field names — grep `skills/pij/**` for `statusAt`/`paneId` and update).

## 5. Live verification (after a daemon restart carrying it)
CLI-only (no restart): `pij state pij-relative-panther --json | jq '{id,harness,paneId,statusAt}'` and `pij list --json | jq '.[0]|{id,harness,paneId,failureReason}'` — all keys present (null allowed, never undefined/missing).

## 6. Risks / gotchas that already bit us
- Recipe step 12 class (PA standup recipe): scripts trusted one surface — three losses in a day.
- `just pij-skill-check` is load-bearing for skill text that names JSON fields (orient-local 2026-08-27); a rename without the skill update ships a lie.
- E-rule additive schema: never remove a key; add, alias, deprecate in docs.

## 7. Open questions for the human
1. Key naming: `parent` (list today) vs `parentId` (descriptor) — emit both for v0.2.x?
