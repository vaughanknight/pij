# Busy Claude steer head truncation — root cause report

## Verdict

**Owner: pij's Claude tmux injection seam. OMP composition and pij persistence are exonerated.**

Pij delivered complete OMP tool input into the durable receiver inbox, then injected Claude-bound text with `tmux send-keys -l`. Busy Claude recorded a variably clipped prefix in its own queue before processing the turn. Pij already had a bracketed tmux paste primitive intended to keep multiline bodies intact; the Claude delivery path did not use it.

## Boundary evidence

Only sanitized prefixes are retained here.

| Boundary | Topic example | Alias-correction example |
|---|---|---|
| OMP `pij_send` input | `SELF-TEACHING CLI + PROVIDERS ROW LANDED…` | Complete sender body observed by the receiver inbox comparison |
| Durable pij inbox | `SELF-TEACHING CLI + PROVIDERS ROW LANDED…` (`msg-1787730609620-000001-10615`) | `CORRECTION + verified expansion for pij#19…` (`msg-1787729741300-000001-98165`) |
| Claude native queue | `he topic is a one-paragraph edit.GATES…` at `2026-08-26T07:50:11.580Z` | `ed, so NO canonical identity isproven…` at `2026-08-26T07:35:41.799Z` |
| tmux pane | Same `he topic…` prefix in the authorized screenshot | Receiver observed the same clipped turn |

The topic sender's captured OMP event has both the device `write` call and the resulting `pij_send` tool call with the full, clean opening. No leading control sequence or malformed first chunk appears. The durable inbox matches that input. Loss therefore occurs after persistence and before Claude's `queue-operation` record.

Discriminators from the receiver:

- OMP → idle Claude: intact openings.
- OMP → busy Claude: four observed clipped openings.
- Claude → OMP: intact negative control.
- Lost prefix length varies from one character to multiple sentences; this is not a fixed cap.

## Source path

1. `.pi/extensions/pij/index.ts` registers `pij_send`, validates one message/command, and dispatches the complete message string.
2. `.pi/extensions/pij/core/daemon/loop.ts` frames the durable body and passes `decision.text` unchanged to `DaemonPorts.sendText`.
3. `.pi/extensions/pij/adapters/daemon-tmux.ts#DaemonTmux.sendTextUnchecked` previously used `typeLiteral` for Claude.
4. `.pi/extensions/pij/adapters/tmux-keys.ts#typeLiteral` invokes `tmux send-keys -l`.
5. The same module's `pasteBuffer` uses `set-buffer` plus `paste-buffer -p`; its contract explicitly identifies bracketed paste as the multiline-safe path.

The exact internal Claude editor scheduling race is not observable from available source. The measured boundary is sufficient: the complete durable body enters pij's tmux seam, while Claude's first durable queue record is already clipped. Pij owns choosing the unsafe injection primitive and can contain the defect without modifying Claude or OMP.

## Fix

Claude-bound messages now use `pasteBuffer(..., { bracketed: true })`, presenting the body as one bracketed paste operation before the existing harness-specific settle and Enter. Copilot keeps literal injection because its focus wake, visible-tail confirmation, clearing, and retype recovery are calibrated to that path. Codex is unchanged because no evidence implicated it.

## Deterministic regression

`.pi/extensions/pij/adapters/daemon-tmux.test.ts` covers idle and busy Claude delivery labels with one exact body that includes:

- a leading sentinel;
- real multiline content;
- non-BMP Unicode;
- more than 10 KiB crossing the common 4 KiB input boundary;
- a trailing sentinel.

Pre-fix: two RED assertions, because no `set-buffer` call existed. Post-fix: both cases require one exact `set-buffer` body, one `paste-buffer -p`, and no `send-keys -l` for that body.

## Operational note

No installed OMP/Claude package, live inbox, native transcript, daemon, registry, or global configuration was modified. A live seat probe was not used because the running daemon resolves the canonical main checkout, not this isolated branch; it would exercise pre-fix code rather than validate the branch.
