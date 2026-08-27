# Item 20 review packet — transport T1/T2 dup window (cold, CODE)

**Candidate**: `a29a9fe5828a69d6b0495fd9c74479d65942b78b` (HEAD of s392 stream branch; fence files reconciled to main 50a7cf09 at 23f71d5, so `git diff main..a29a9fe` for the 8 files is the item-20 delta ONLY — verify structurally, NOT by test count [DL-012: `grep -c 'it('` false-counts `.split(`; use the vitest declaration-list diff]).
**Base**: current origin/main. **Dossier**: `../tasks/item-20-transport-dup-window/tasks.md`. **Write verdict to** `reviews/item-20-review.md`.
**Files (8)**: claude-socket.ts(+test), copilot-rpc.ts(+test), daemon-tmux.ts(+test), loop.ts, loop.test.ts.

## What this closes — OBS-04
Socket/RPC `sendSocket` returned `"failed"` for BOTH pre-write failure (T1, retry-safe) and post-write ack-loss (T2, bytes already delivered); `drainTmuxInbox` re-enqueues on `failed` → a T2 re-sends → DUPLICATE. Fix mirrors the PANE path's `unverified` (consume, no retry):
- `claude-socket.ts` / `copilot-rpc.ts`: a `wrote` flag; any failure AFTER the write flushes → `unverified`; pre-write/never-connected → `failed`; a Claude `dropped` NAK stays `failed` (retry-safe). Outcome type widened to include `unverified`.
- `daemon-tmux.ts sendSocket`: passes `unverified` through (no collapse to `failed`).
- `loop.ts drainTmuxInbox` socket branch: `unverified` now CONSUMES (`via:"socket"`), alongside `confirmed`; `failed` still enqueues.
- Receipt: NO code change — `applyWaitReceipt(..., {state:"unverified"})` already terminates the sender wait (existing cli.test.ts coverage, verified).

## Dim-0 mutation gate — MANDATORY, sha-verify RED→restore→GREEN on disk (lines below are CODER-CLAIMED — verify against the file, do not trust)
- **MUT-T2-claude** (claimed claude-socket.test.ts:111): force post-write failure to return `failed` instead of `wrote?unverified:failed` ⇒ a T2 test RED. Proves T2 pinned.
- **MUT-T2-copilot** (claimed copilot-rpc.test.ts:137): same for the RPC ⇒ RED.
- **MUT-DRAIN** (claimed loop.test.ts:1361) — **THE OBS-04 PROOF**: revert the drain's `unverified` case to `buffer.enqueue` ⇒ a second drain re-sends → duplicate observed → RED. This is the headline; verify it hardest.
- **MUT-NAK** (claimed claude-socket.test.ts:134): make the `dropped` NAK return `unverified` instead of `failed` ⇒ a NAK-retry test RED. Proves an explicit NAK stays retry-safe, not swallowed as delivered.

## Semantic checks (Dim-1) — the `wrote`-boundary is the crux
1. `wrote` flips EXACTLY at the flush boundary: a PRE-write connect error/timeout ⇒ `failed`; a POST-write socket close/no-status ⇒ `unverified`. Confirm both directions with the fakes (not just one).
2. The Claude `dropped` NAK path returns `failed` EVEN post-write (a NAK means genuinely-not-delivered → retry). Confirm this is not clobbered by the `wrote` flag.
3. copilot-rpc: `wrote=true` set only after a successful request write; a lost RESPONSE after that ⇒ `unverified`; a pre-send failure ⇒ `failed`.
4. drain: `unverified` consumes (no dup) AND does not lose the message wrongly — it's the accepted at-most-once-after-unverified tradeoff (same as the pane path). Confirm no `failed`/`held`/`gone` case was altered.
5. No collateral: `git diff main..a29a9fe` = only the 8 item-20 files; the declaration lists of the touched test files gain only the new T1/T2 tests, nothing removed. `gatesClean:false` = pre-existing repo-wide red only — confirm none touches the 8 files.

Report verdict + the 4 mutation shas/RED lines + Dim-1 findings to me.
