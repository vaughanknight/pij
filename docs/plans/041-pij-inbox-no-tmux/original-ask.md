# Original ask — plan 041: pij inboxes without tmux (Windows-friendly pij)

**From**: Jordan, o-prime's pane, 2026-07-12 — "read @docs/PRD/wishlist.md and get new orchestraots" (garbled precursor: "/pij new peer orchestrator …"). This work item is wishlist §1, verbatim below.

## Verbatim wishlist section

> ## Pij inboxes for when we don't have TMUX (mostly for when we on windows)
> - PIJ users can check pij for messages
> - Can do a --wait and it will block until
> - Messages are set as read when they are "read" auto
> - Regular messages go here too for pij tmux, marked as read immediately
> - pij needs to work on windows, need to do a sweep of non windows friendly stuff.
> - Everythign else acts the same - so this works in shells other than tmux.
> - Pij skill minor updates that if not in tmux to do this
>
> (docs/PRD/wishlist.md as of 2026-07-12, sha at brief time in the stream brief)

## Bound context (o-prime)

- Delivery today is tmux-injection via the daemon; the inbox files already exist on disk (FsChannel) — this ask adds a pull surface (`check`/`--wait`), read-state semantics, and a Windows-compat sweep.
- FX001/FX002 send-path invariants and receipt semantics are load-bearing; any read-state change must preserve them.
- Wishlist line "Regular messages go here too for pij tmux, marked as read immediately" = the tmux-injected path marks inbox copies read at injection.
- Open clarify candidates for Jordan at preamble: read-state persistence shape; whether `--wait` needs a timeout default; CI coverage for Windows (no Windows runner exists today).
