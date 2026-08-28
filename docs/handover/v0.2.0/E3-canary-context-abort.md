# E3 — `pij canary` on a seat whose pinned model has no catalog context window fails the whole canary instead of marking the context leg unverified

**Item id / stream at handover:** E3 (encode candidate, o-prime 2026-08-27; spine 23930/23932) · s391-day3-core
**Status at v0.2.0 (tag `d120c53`):** designed (surveyed at the tag; no branch)
**Size estimate:** S (1–2 h) · **Order / dependencies:** none

## 1. Why this exists (the observed failure, with evidence)
- Encode row E3 (`government/briefs/encode-candidates-2026-08-27.md`, main): "`pij canary` on a Claude-pinned seat aborts at `E-CANARY-CONTEXT` (no catalog context window) BEFORE dispatching the nonce, exit 0, no PASS line — leg (a) silently unproven (spine 23930/23932; canaries/s391.md, s392.md)". Both streams' canary records for 2026-08-27 show Claude-harness seats (models outside the Copilot catalog, e.g. `claude-fable-5`) with no PASS line.
- What the canary must prove (C2, `references/prime/protocol.md` § canary-verify): leg (a) round-trip nonce → the seat is alive and its input path works; (b) mechanical identity (registry row + pane probe); (c) a second send. The context-window check is a bonus tier check — it must never mask leg (a).
- At `d120c53` the failure is in the finalize leg, `core/cli.ts:4407-4418`: `expectedContextWindow = contextMaxFor(descriptor.boundModel, deps.models)`; when the catalog has no entry → `failCanary("E-CANARY-CONTEXT", "… pinned model '<m>' has no catalog context window; cannot validate effective tier")` → **exit 3** (`failCanary`, `:4352-4358`) — AFTER the nonce came back. So the nonce round-trip succeeded and the command still reports failure; the dispatch record never gets `canary: pass`. (On 2026-08-27 an earlier build aborted before dispatch with exit 0 — the row's wording; the finalize-leg refusal is the surviving defect at the tag.)
- `core/canary.ts evaluateCanary` (`:129-160`) already handles the honest case: when `expectedContextWindow` is undefined it records NO context check; when expected is known but unobservable it records `{observedLabel: "unverified", source: "unobservable", check: "unverified"}` and PASSES. Only an observed-vs-expected contradiction refuses (`:151-156`). The cli.ts pre-check short-circuits that design.

## 2. What is ruled (design / spec)
- The canary's verdict is the NONCE leg. Context-window verification is an independent leg that can be `matched | unverified (unobservable) | unverified (no-catalog)`; it refuses only on a contradiction.
- A pinned model absent from the catalog is recorded on the dispatch's canary record as `contextWindow: { expected: null, expectedLabel: null, observedLabel: <pane footer or "unverified">, source: "no-catalog", check: "unverified" }` and the PASS line says `context=unverified(no-catalog)`.
- Exit code 0 with `canary PASS … context=unverified(no-catalog)`; exit 3 remains for model mismatch (E-CANARY-MODEL), identity, and context contradictions.

## 3. Where the code is (at tag `d120c53`)
- `.pi/extensions/pij/core/cli.ts` — canary parse `:1220-1243` (`pij canary <id> [--expect-model] [--wait[=MS]]`); dispatch leg `:4477-4560` (`buildCanaryPacket`, `dispatchPlatform({verb:"dispatch-packet", wait})`); finalize leg `:4360-4460` (`FinalizeCanaryInput`, the context pre-check `:4407-4418`, `evaluateCanary` call `:4421-4430`, spine event `canary:pass` `:4433-4445`); `failCanary` `:4352`.
- `.pi/extensions/pij/core/canary.ts` — `CANARY_CONTEXT_ERROR` `:10`; `evaluateCanary` context branch `:129-160`; `CanaryRecord["contextWindow"]` type (`source: "unobservable" | …`) — add `"no-catalog"`.
- `core/models/registry.ts` `contextMaxFor(model, models)` — returns undefined for unknown models (that is the correct signal; do not fake a catalog entry).
- PASS-line renderer (grep `canary PASS target=` in `core/cli.ts`) — prints `context=<label> check=<check> source=<source>`.
- Tests: `core/cli.test.ts:7576-7610` currently PIN the refusal ("… has no catalog context window …") — those assertions invert; `core/canary.test.ts:200-280` covers `evaluateCanary`.

## 4. Acceptance (behavioural, mechanical)
- Test (real `runCli` over a sandbox home, `core/cli.test.ts`): seat pinned to a model absent from the catalog, nonce acknowledged → exit 0, stdout `canary PASS … context=unverified(no-catalog)`, dispatch record `canary.contextWindow.source === "no-catalog"`, spine `canary:pass` event written.
- Test: model present in catalog + pane footer contradicts → still `E-CANARY-CONTEXT`, exit 3 (unchanged).
- Test: model present, footer unreadable → PASS with `unverified(unobservable)` (existing behaviour, keep).
- **MUT-E3a**: restore the `failCanary` pre-check at `:4412` → the no-catalog test RED. **MUT-E3b**: make `source` always `"unobservable"` → the no-catalog test RED on the source field (proves the honest label). **MUT-E3c**: skip the spine `canary:pass` append → RED (the record is the proof consumers read).
- Gates: `npx vitest run .pi/extensions/pij/` at the merge product; `just typecheck`; `just pij-skill-check` (the `/pij` skill's canary text names the PASS line — grep `skills/pij/**` for `canary PASS`).
- Update `government/canaries/*.md` writers? No — they are hand-written records; the PASS line is what they paste.

## 5. Live verification (after a daemon restart carrying it)
CLI-side only. `pij canary <a Claude-pinned seat> --wait=90000` → `canary PASS target=… model=… check=matched context=unverified(no-catalog)`; exit 0; `pij node show <seat>` shows the canary record. Failure looks like today: `E-CANARY-CONTEXT: target '…' pinned model '…' has no catalog context window` with exit 3 after the nonce has already round-tripped.

## 6. Risks / gotchas that already bit us
- C2 is recursive: every spawn, every orchestrator; a canary that cannot pass on Claude seats pushes primes to skip it (two streams did on 2026-08-27 — the row's "silently unproven").
- E26 (provenance): the canary record is daemon/CLI-written truth; "unverified" must be a recorded label, never an absent field.
- `just pij-skill-check` is load-bearing when skill text quotes CLI output.

## 7. Open questions for the human
None.
