# 23-FX — claude-socket fake close-race flake (implementation DONE, exact-repro PARTIAL)

**Item id / stream at handover:** 23-FX · s392-day3-codex-doctrine
**Status at v0.2.0 (tag `d120c53`):** IN FLIGHT — implementation **DONE**, E22 exact-repro **PARTIAL**, on branch `s392/item12-fx-falcon` (pushed, HEAD `8237e78`; 23-FX commit `7540a9c`). Not yet merged. Spec: `docs/plans/392-day3-codex-doctrine/tasks/item-23-FX-spec.md` (on main).
**Size estimate:** DONE (~S) · **Order / dependencies:** none.

## 1. Why this exists (the observed failure, with evidence)
`adapters/claude-socket.test.ts` "sendClaudeFrame > reports sent after bytes flush but 'the socket closes'" (`:113`) intermittently observed 0 received lines instead of 1 — the FAKE socket's close raced the byte-flush/received-line emit. Origin: red once at main `5ef1220` (o-prime dx, `docs/plans/392-day3-codex-doctrine/rulings.md` / `docs/plans/392-day3-codex-doctrine/tasks/item-23-FX-spec.md`).

## 2. What was ruled / done
Make the FAKE deterministic on two fronts:
- **Close ordering:** `close` is emitted ONLY after the fake's post-log write callback — `c.write("\n", () => c.end())` — so the received line is always flushed before close.
- **Accept-readiness handshake:** the fake writes a "ready" marker in its `server.listen(sock, () => …)` callback, and the client waits for it — closing a SECOND race the investigation surfaced: a socket pathname can exist before the child is accept-ready (ECONNREFUSED before accept under parallel load).

## 3. Where the code is
Branch `s392/item12-fx-falcon`, commit `7540a9c`, file `.pi/extensions/pij/adapters/claude-socket.test.ts` (+22/-8): the `close` mode's `c.write("\n", () => c.end())`; `server.listen(sock, () => fs.writeFileSync(ready, …))` + the client-side readiness wait; a per-mode `ackWaitMs` (2 s for `close`).

## 4. Acceptance (mechanical) — implementation MET, exact-repro PARTIAL
Flake fix, no mutant; gate = determinism over N runs, logs kept (E22). On branch `7540a9c`: targeted tests green; THREE consecutive post-fix parallel full-suite runs green; a pre-fix run captured the RELATED fake-listener ECONNREFUSED-before-accept race (`docs/plans/392-day3-codex-doctrine/tasks/item-23-FX/pre-fix-full-suite-run-4.log`).
**HONEST CAVEAT:** the EXACT historical zero-line close symptom did NOT reproduce locally in 100 targeted stress attempts — so the fix is proven to CLOSE THE MECHANISM (close-ordering + accept-readiness) and to fix the related race that did reproduce, but the original exact symptom was not reproduced-then-fixed under observation.

## 5. Live verification
Test-infra only. Run `adapters/claude-socket.test.ts` under concurrent full-suite load N times; no zero-line close, no ECONNREFUSED-before-accept.

## 6. Risks / gotchas that already bit us
- **E22** — the exact symptom being un-reproduced is stated, not hidden (a red with no repro is a claim). The mechanism-closure is the real remedy; the related ECONNREFUSED race IS reproduced + fixed.
- Fake-socket tests are timing-sensitive under parallel load — the readiness handshake is the general fix for "pathname exists before accept-ready".

## 7. Open questions for the human
- Is mechanism-closure (close-ordering + accept-readiness) sufficient to close 23-FX, or should the exact zero-line symptom be pursued to a reproduction first? (Recommendation: sufficient — the exact symptom is almost certainly the same accept-ready/close-ordering race; a further hunt has diminishing returns.) Merge decision: land `7540a9c` with the caveat noted.
