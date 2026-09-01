# Plan 124 — execution log

## Environment

- `harness boot --json` → healthy after reusing the canonical checkout's `node_modules`; package-lock SHA-256 matched exactly (`44390b8b14039c7d1d95ed90dc6ab8a57189384e68bdbfe2bc5685b1ff2f808d`).
- Initial `npm ci` failed in the git dependency preparation path because repo `min-release-age` and npm's generated `--before` conflicted; captured as harness difficulty `DL-001`.

## RED witnesses

- u1: `just test .pi/extensions/pij/adapters/daemon-http.test.ts .pi/extensions/pij/core/daemon-wire.test.ts` failed 5 new tests: no reconnect/cursor replay, no live-only refusal fallback, no auth refresh/retry, no bounded backoff, and rejected `cursor_reset`.
- u2: `just test .pi/extensions/pij/adapters/rust-runtime.test.ts` failed the new restart case: expected same-seat re-registration count 2, received 1.

## Implementation

- u1: supervised event subscription; per-machine cursor map; 250ms→5s jittered backoff; key refresh before attach; one 401/403 retry for all client requests; cursor-refusal live-only fallback; reconnect notices.
- u2: reconnect notices routed through the existing UI; reattach seat lookup and same-id/same-pane registration; replay remains serialized through the existing `pushedChain` and `consumePushed` inject→ack path.
- Additive wire contract: TypeScript admits the daemon's existing `cursor_reset` error kind.

## Granted allow-list rows

| Grant | Paths | Constraint | Prime ruling |
|---|---|---|---|
| Cursor refusal decoder | `.pi/extensions/pij/core/daemon-wire.ts`, focused test | Add `cursor_reset` only; no other wire kinds | `pij-still-weasel`, 2026-09-02 |
| Visible notice wiring | `.pi/extensions/pij/index.ts` | Boot-time notice callback only; avoid plan 125's `setSessionName` lines | `pij-still-weasel`, 2026-09-02 |

## Green receipts

- Focused suite: 3 files, 24 tests passed.
- `just typecheck` passed.
- LSP diagnostics: modified daemon/runtime/wire files clean; existing `index.ts` hints only at unrelated `await` expressions.
- Full `harness checks`: pending.
- Live hand-started omp restart transcript: pending prime-granted restart window.
