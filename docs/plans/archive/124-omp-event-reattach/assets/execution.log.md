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

## Review resolution

- r1 (`assets/reviews/review-r1.dd.md`) found 2 MAJOR, 4 MINOR, 1 NIT. All were fixed or explicitly deferred; fixes added RED-first witnesses for successful-attach backoff, stream diagnostics, async consumption/cursor order, HTTP status, known-seat behavior, and jitter cap.
- r2 (`assets/reviews/review-r2.dd.md`) found poison-frame wedging and an unwitnessed backoff reset. Prime ruled five bounded poison retries, then one visible msg-id/error notice, cursor advance, and continuation because the queue row remains authoritative until acked.
- r3 (`assets/reviews/review-r3.dd.md`) → **APPROVE**. F8/F9 fixed and mutation-proven; Q2 (no live gap-emission witness) accepted as non-blocking because unit coverage and the Rust `seq > since` authority cover the contract.
- Prime-authored template defect F7: AC rows lacked required `claim`/`state`. Prime authorized the minimum ddocs repair; every id/text was preserved and `ddocs validate plan.dd.json` is clean.

## Granted allow-list rows

| Grant | Paths | Constraint | Prime ruling |
|---|---|---|---|
| Cursor refusal decoder | `.pi/extensions/pij/core/daemon-wire.ts`, focused test | Add `cursor_reset` only; no other wire kinds | `pij-still-weasel`, 2026-09-02 |
| Visible notice wiring | `.pi/extensions/pij/index.ts` | Boot-time notice callback only; avoid plan 125's `setSessionName` lines | `pij-still-weasel`, 2026-09-02 |
| Baseline lint repair | Seven files named by `just lint` | Eleven warning-only edits, isolated commit `0c6f7582`; no behavior changes | `pij-still-weasel`, 2026-09-02 |

## Green receipts

- Final focused suite: 4 files, 43 tests passed.
- Full suite: 230 files passed, 4 skipped; 4632 tests passed, 19 skipped.
- `just typecheck` passed; modified TypeScript files have no LSP errors.
- Final `harness checks` passed all eight sensors: local paths, typecheck, lint, test, Windows compatibility, smoke, package audit, and snapshots.
- Live isolated restart: `assets/live-restart-transcript.md` — two hand-started OMP seats, rotated key, visible loss/re-attach notices, inline body, bidirectional post-restart `pij_send`, same ids/panes, and `message.pushed → delivery.inbox-ack` with no pointer row.
