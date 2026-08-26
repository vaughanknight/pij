# Busy-seat inbound steer head truncation

**Mode**: Simple
**Status**: READY

## Objective

Preserve every character of a pij message injected into a busy Claude Code seat. Investigate the OMP sender boundary first, name ownership from source and native evidence, and land the smallest deterministic pij fix.

## Constraints

- Product changes stay under `.pi/extensions/pij/**`.
- Evidence and plan artifacts stay under this plan directory.
- Do not modify installed OMP/Claude binaries, live inboxes, native transcripts, or global configuration.
- No uncoordinated live test sends.

## Evidence baseline

- OMP `pij_send` tool-call input contains the complete body with a clean opening.
- The receiver's durable pij inbox contains that complete body.
- Busy Claude's native `queue-operation` already contains a variably clipped opening; its pane renders the same clipped bytes.
- OMP → idle Claude is intact; Claude → OMP is an intact negative control.
- Pij injects Claude-bound bodies through `tmux send-keys -l`; the existing tmux seam documents bracketed `paste-buffer -p` as the safe multiline path.

## Decision

Ownership is pij's Claude tmux injection seam, not OMP composition or durable persistence. Use bracketed tmux paste for Claude payloads; preserve existing Copilot/Codex behavior.

## Testing Strategy

Full TDD at the adapter boundary:

1. Add a RED regression proving idle and busy Claude injections use one bracketed paste carrying the exact body.
2. Fixture includes a leading sentinel, multiline text, Unicode, and more than 8 KiB of content.
3. Run the focused Vitest file, then `just typecheck` and `just lint`.

## Implementation

| Task | State | Work |
|---|---|---|
| T001 | [x] | Compare OMP tool call, durable inbox, Claude queue operation, and pane evidence; name ownership. |
| T002 | [x] | Add RED adapter regression for exact idle/busy Claude body preservation. |
| T003 | [x] | Route Claude injection through bracketed tmux paste without changing other harnesses. |
| T004 | [x] | Record boundary evidence and run the authorized focused gates. |

## Architecture Map

```mermaid
flowchart LR
  A[OMP pij_send]:::completed --> B[durable inbox]:::completed
  B --> C[pij daemon route]:::completed
  C --> D[Claude tmux injection]:::completed
  D --> E[Claude busy queue]:::completed
  classDef completed fill:#d8f3dc,stroke:#2d6a4f
```

## Discoveries & Learnings

| Tag | Discovery |
|---|---|
| Noteworthy | Variable loss from one character to multiple sentences rules out a fixed truncation cap and localizes the race after durable inbox persistence but before Claude queue storage. |
| Noteworthy | `harness boot` is initially red because baseline `just typecheck` fails without diagnostics in the harness envelope; the required direct gates remain part of T004. |
