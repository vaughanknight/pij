# Draft-aware Pi/OMP holds — delivered

Commit: `18d5235b` — `fix(pij): hold delivery only for active drafts`

Branch/worktree: `omp-draft-aware-hold`, `/Users/jordanknight/pi-hacking/pij-omp-draft-aware-hold`.

One commit; Co-Authored-By trailer identifies Oh My Pi. No push, PR, merge, production-daemon restart, installed-binary modification, or global-link change.

## Behavior

- `HoldQueue.shouldHold(at, draft)` requires a nonblank draft AND recent edit-capable input. Empty editor always permits delivery, including after a submitted spawn prompt.
- Claim routing, repeated pushes, and every drain decision sample `getEditorText()` live. Clearing a held draft releases on the next one-second tick.
- Sensor accepts printable Unicode, Kitty/modifyOtherKeys text, bracketed paste, and configured editing/clipboard/external-editor actions. Mouse/focus/navigation/key-release input does not refresh recency. The final implementation is synchronous; it does not depend on an after-input text snapshot that would miss asynchronous clipboard completion.
- Arrival toast, held status, grace expiry, recovery/order, and existing bypass behavior remain covered.

Interactive getter evidence: installed OMP `src/modes/controllers/extension-ui-controller.ts:124` returns `this.ctx.editor.getText()`. Legacy `@earendil-works/pi-tui` imports are mapped by OMP's existing shim; its `decodeKittyPrintable` export maps to OMP's broader printable decoder. No new compatibility shim was added here.

## Gate receipts

| Command | Result |
| --- | --- |
| `vitest run .pi/extensions/pij` via main's read-only binary | 172 passed / 2 skipped files; 4133 passed / 15 skipped tests; 153.35 s |
| Final focused queue + adapter + runtime suite | 3 files, 68 tests passed |
| `npm run typecheck` | exit 0 |
| `npx --no-install biome check` on six touched TypeScript files | `Checked 6 files ... No fixes applied.` |
| `just smoke` | All 11 scenarios passed; 43.88 s |
| Final `harness checks` (pretty-printed through jq) | `status: ok`, `data.ok: true`; all 9 signals pass, no signals skipped; timestamp `2026-09-06T01:04:23.154Z` |

Final harness signals: local-paths, typecheck, lint, test, copilot-native, windows-compat, smoke, pkg-audit, snapshots. Each reports `status: pass`, `code: 0`. Closing line: `All checks green — safe to ship / declare this task done.`

First composite attempt failed only smoke. Standalone smoke then passed, and the final full composite passed without an intervening product edit. Initial failure detail was lost to the tool's one-line JSON truncation; no root cause is claimed.

RED evidence: initial blank/clear cases failed in queue/runtime (5 failures), input sensor cases failed against the activity-only adapter (12 failures). Review additionally exposed batching/async-paste snapshot limitations; that observer was removed. Kitty Unicode, private-use navigation, and modifyOtherKeys Unicode each had discriminating RED witnesses before their final corrections.

## Final-code production-daemon proof

Own hand-started OMP 18.0.10 PTY seat `pij-delighted-catfish`, discovered/canary-verified `github-copilot/gpt-5-mini`, explicitly loaded this worktree's extension. No Jordan pane used. Seat stopped after proof.

### Empty editor after SGR click and arrows

Prime's message `01a07435-d73b-7bb1-accf-858b7247ca10`:

- `message.pushed`: spine **12600**, `1788656080699`.
- `delivery.released`: **12602**, `1788656080705` (**+6 ms**).
- `delivery.inbox-ack`: **12603**, `1788656080708` (**+9 ms**), job `2887`.
- No `delivery.held` event.

A second empty-editor probe from `pij-urban-odette`, `5f21d633-36e3-41d0-b693-bca4681592a4`, likewise released immediately (**12604 → 12606 → 12607**) and rendered `ACK FINAL-EMPTY-PROBE`.

### Nonempty draft, visible hold, clear, release

Peer message `e69922a2-1363-4c0e-91ea-ef7754dd5b50`, sent by `pij-urban-odette`:

- Draft remained visible; recipient status showed `1 held · typing`.
- `message.pushed`: **12608**, `1788656119294`.
- `delivery.held`: **12610**, `1788656119297`, `since_ms: 1788656113814`.
- Ctrl-U clear was issued during `1788656135327..1788656135330`.
- `delivery.released`: **12618**, `1788656135740` (**410–413 ms after clear**, within one tick).
- `delivery.inbox-ack`: **12619**, `1788656135742`, job `2889`.
- The empty editor and `ACK FINAL-DRAFT-PROBE` rendered after release.

The earlier iteration also used prime-sent probes: empty **12549 → 12551 → 12552**; held **12566**, clear/release **12569**, ack **12570**. Final-code receipts above supersede that iteration.

## Original dispatch observation

`pij-urban-odette` message `01a07427-49eb-7622-83aa-fa95f2eecb9e`: pushed **12525**, held **12527**, released **12528**. Held duration **51.599 s**; release occurred **60.451 s** after recorded input `1788655118172`. Spawn-prompt input as the source is consistent with the timestamps, not independently proven.

## Scope and remaining limits

- Live changed-behavior proof exercised OMP, not a separately hand-driven Pi clipboard session. Pi/OMP protocol and clipboard classification are covered by unit witnesses; existing Pi smoke scenarios passed.
- Fifteen opt-in tests were skipped by existing suite configuration; no harness signal was skipped.
- Worktree had no dependencies. No install performed: a real local `node_modules` directory links dependency entries read-only to main, excluding main caches; generated caches stay worktree-local.
- Durable guidance and proof receipts are committed in `docs/how/pij.md` and `.harness/records/retro/2026-09-06/001-omp-draft-aware-hold.md`. Machine-readable receipts: `.harness/temp/omp-draft-aware-hold-evidence.json`.
- Harness improvement shipped as regression witnesses. An opt-in Driver SDK scenario automating PTY/probe/spine joins is recorded as a proposal, not added to this bounded fix.
