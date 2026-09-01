# Terminal-control body measurement — 2026-09-01

**Client**: hand-started OMP v18.0.3 in pane `%2250`, with no extensions/skills/rules.  
**Transcript**: `/Users/jordanknight/.omp/agent/sessions/-pi-hacking-pij-worktrees-s122-tmux-full-body/2026-09-01T09-45-16-873Z_01a05c5b-d349-7000-9db1-b9fc911be028.jsonl`.

The body was injected inside one bracketed-paste transaction and the persisted pre-render user turn was compared with the sent bytes.

| Input class | Sent | Persisted by OMP | Byte-intact |
| --- | --- | --- | --- |
| LF | line separator | line separator | yes |
| TAB | `A\tB` | `A   B` | no — expanded to spaces |
| NUL | `A\x00B` | `AB` | no — dropped |
| BEL | `A\x07B` | `AB` | no — dropped |
| BS | `A\x08B` | `AB` | no — dropped |
| VT | `A\x0bB` | `AB` | no — dropped |
| FF | `A\x0cB` | `AB` | no — dropped |
| CR | `A\rB` | `A\nB` | no — normalized |
| ESC (stray, not a delimiter) | `A\x1bXB` | `AXB` | no — ESC dropped |
| US | `A\x1fB` | `AB` | no — dropped |
| DEL | `A\x7fB` | `AB` | no — dropped |
| C1 NEL | `A\u0085B` | `AB` | no — dropped |
| bracket close delimiter | `ESC[201~` | terminates paste; suffix becomes keyboard input | unsafe |

Measured safe control domain: LF only. Every other measured `char::is_control()` value was dropped, expanded, normalized, or interpreted. A stray ESC—not only the closing delimiter—was explicitly measured and was not preserved, so rejecting it is not over-refusal.

Ruled contract: if a socket is available, it carries the original bytes. Otherwise a pane body containing an unsafe control remains queued, the pane receives a body-free explanation naming the control-byte exception, and the recipient pulls the intact queued body with `pij inbox`. The adapter also rejects unsafe controls before any pane write as defense in depth.

Proofs:

- `terminal_control_body_uses_socket_or_named_pull_never_typing`
- `terminal_control_body_is_announced_and_remains_readable_in_inbox`
- `submit_rejects_bracket_terminator_before_touching_real_pane`

## Final live control-pull witness

Hand-started extension-free OMP pane `%2300` was registered as `pij-inc-anaconda` against `/tmp/pij-s122-review5`.

- Sent body: 67 bytes, including stray ESC in `A\x1bXB`; SHA-256 `9ebd0ef342e5755ddc521f483460aeabcbba789008ab221e123f7ce07d820ec5`.
- Pane received one framed explanation: `message contains terminal control bytes that cannot be typed safely — body remains queued; run: pij inbox`.
- `target/debug/pij-rs … inbox --seat pij-inc-anaconda` immediately returned the original body with `\u001b` intact.
- The durable spine contains exactly one `delivery.control-body-pointer` event for the seat/message; its queue row ended `done` only after the inbox read.
