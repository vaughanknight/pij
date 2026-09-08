# Follow-up u2 — preserve human drafts during prompt recovery

**Delivered on `fix/resend-preserve-draft`, based on `origin/main` at `809616c6ea37364b482f7fd5ac7ee46171bc956a`.** The final commit SHA is sent to prime with this report's path. No push, PR, merge, production daemon change, or installed OMP modification.

## Decision and implementation

Delivery stays immediate. A draft never holds a resend.

The prime approved snapshotting at the resend's matching `message_start`, rather than enqueue time, so intervening typing survives. The existing handler now finishes its consumption ACK, snapshots the current editor, and restores on the next timer tick. Only OMP interactive user-role messages recognized by the existing `pijMessageId` parser qualify.

Two independent safeguards preserve human ownership:

- A nonempty editor at restoration time is never overwritten.
- Any terminal input between snapshot and restoration cancels restoration, including a human clear or submission that leaves the editor empty. The temporary listener is removed on that tick and never consumes input.

`setEditorText(saved)` restores the cursor to the end through OMP's native setter. The draft is never passed to `sendUserMessage`. No saved-draft map, resend delay, new retry loop, or daemon contract was introduced.

Changed source: `.pi/extensions/pij/index.ts:573` and the export of the existing `consumedMessageId` helper in `adapters/rust-runtime.ts:910`. The prompt-producing adapter is unchanged. Tests are in `index.test.ts`; the stable behavior is documented in `docs/how/pij-rs-api.md#extension-inbox-recovery`.

## Exact upstream clearing point

All references are to deployed **OMP v18.1.14**, not the older globally installed npm source package. Machine-readable citations: [u2-upstream.json](u2-upstream.json).

| Upstream source | Relevant behavior |
|---|---|
| [`packages/coding-agent/src/modes/controllers/event-controller.ts:960`](https://github.com/can1357/oh-my-pi/blob/v18.1.14/packages/coding-agent/src/modes/controllers/event-controller.ts#L953-L964) | `this.ctx.editor.setText("")` for a non-synthetic user message without a local submission signature. |
| [`packages/coding-agent/src/session/agent-session.ts:2373–2388`](https://github.com/can1357/oh-my-pi/blob/v18.1.14/packages/coding-agent/src/session/agent-session.ts#L2373-L2388) | Awaits extension handlers before subscriber/TUI fan-out. Synchronous restoration inside our handler would be erased. |
| [`packages/coding-agent/src/extensibility/extensions/types.ts:1438–1440`](https://github.com/can1357/oh-my-pi/blob/v18.1.14/packages/coding-agent/src/extensibility/extensions/types.ts#L1438-L1441) | `sendUserMessage` exposes only `deliverAs: steer / followUp / aside`. No draft-preserving, attribution, source, or synthetic option exists. `aside` changes queue placement, not the clearing condition. |
| [`packages/coding-agent/src/modes/controllers/extension-ui-controller.ts:116–118`](https://github.com/can1357/oh-my-pi/blob/v18.1.14/packages/coding-agent/src/modes/controllers/extension-ui-controller.ts#L116-L118) | `setEditorText` delegates to the editor's native `setText`. |
| [`packages/tui/src/components/editor.ts:826–835`](https://github.com/can1357/oh-my-pi/blob/v18.1.14/packages/tui/src/components/editor.ts#L826-L835), [`2057–2060`](https://github.com/can1357/oh-my-pi/blob/v18.1.14/packages/tui/src/components/editor.ts#L2057-L2060) | `setText` uses the default end anchor: final line, final column. |

A public nonclearing user-message variant was therefore not available to prefer. Ordinary custom-message delivery and Pi behavior remain unchanged.

## RED → green

[Original RED output](u2-red.txt): `preserves a resend draft while respecting unchanged human input` failed with an empty editor instead of the expected multiline Unicode draft, before the source fix.

The fake runs the real extension handler and real prompt-producing adapter. It awaits `message_start`, then performs OMP's clearing mutation, then advances timers. It proves:

1. A busy resend is submitted immediately despite the draft; text typed after enqueue, including `你好`, survives.
2. A replacement draft at restore time wins.
3. Intervening human input that leaves an empty editor wins.

Native cursor placement and exactly one actual consumption ACK are proved by the live scenario, not a mock echo.

Final `npm test`: **5,264 passed, 22 skipped; 240 files passed, four skipped** — [u2-npm-test.txt](u2-npm-test.txt).

`just pij-skill-check`: passed — [u2-skill-gate.txt](u2-skill-gate.txt).

Final serial `harness checks`: **all ten sensors passed, none skipped**, at `2026-09-08T04:59:20.704Z`: local-paths, typecheck, lint, test, copilot-native, windows-compat, smoke, pkg-audit, snapshots, pij-commit-trailers. Closing verdict: **“All checks green — safe to ship / declare this task done.”** The trailer sensor checked zero pre-commit commits and is advisory; actual trailers are derived separately immediately before committing.

**Cargo unaffected:** no Rust sources, manifests, migrations, or Rust fixtures changed; no Cargo command was needed for u2. The exercised existing daemon binary SHA-256 was `0d9c8a9385b7c3487cf3bbcae3f9bd48e49d7108c4784084260f3462cc66861a`.

One concurrent npm/gate run hit the existing native Copilot process-observation timeout in `whoami`: [u2-contended-test.txt](u2-contended-test.txt). After removing concurrent gate execution, the unchanged full npm suite and full harness gate both passed serially. Contention is a likely cause, not a proven diagnosis; no unrelated process-observation code was changed.

## Exact live probe

Evidence: [live-proof-u2.json](live-proof-u2.json), [before](u2-before-pane.txt), [after](u2-after-pane.txt), [cursor insertion](u2-cursor-pane.txt).

- Real **OMP 18.1.14**, runtime-discovered `github-copilot/gpt-5-mini`; native canary returned `U2_CANARY_OK`.
- Owned receiver **`pij-gigantic-penguin`**, pane **`%2`**, session `01a07f5a-1887-745e-a1ef-ada282eacec4`.
- Owned daemon **`127.0.0.1:52695`** and socket under `/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-draft-u2-viCavj`.
- Actual `sleep 60` active; `send-keys` typed **`HUMAN DRAFT IN PROGRESS do not clobber me`**, with no Enter. The draft was observed before injecting the incoming message and Escape.
- Message **`ea690f66-9643-4032-b4c1-a6714a6ee4a3`**, job **2**, recovered through `[pij resend 1]` **10,636 ms after Escape**.
- Exactly one delivered/reader-read receipt (**8**) and one `delivery.inbox-ack` (**9**). Job 2 completed, and the assistant returned the exact requested nonce.
- The **41-byte draft** remained identical. ANSI composer lines before/after are identical; the caret was column **43** both times: two prompt columns plus 41 draft characters.
- Typing `!` afterward produced exactly **`HUMAN DRAFT IN PROGRESS do not clobber me!`**, caret **44**. This exercises the native end cursor without submitting the draft.
- No transcript message contains the human draft.

**Capture caveat:** OMP paints a gray `an` autocomplete suggestion after `me`. Plain pane captures flatten that styling and appear to say `mean`; the suggestion is not editor content. The preserved ANSI evidence, caret position, and `me!` insertion distinguish the actual bytes from the ghost suggestion.

## Cleanup and harness lesson

The owned daemon and tmux server were stopped, the read-only database closed, and preliminary captures removed. The tmux supervisor's exit 1 is the expected result of intentionally killing its owned server. Production `127.0.0.1:7461` was never mutated.

The new regression encodes the previously missing proof boundary: extension completion precedes the TUI's clearing mutation. Two isolated-proof setup lessons remain for prime-owned harvest: bind the daemon itself to the owned `TMUX` socket as well as the seats; preserve ANSI/caret evidence so ghost suggestions are not mistaken for draft corruption. Governance and retro ledgers were not modified by this peer.
