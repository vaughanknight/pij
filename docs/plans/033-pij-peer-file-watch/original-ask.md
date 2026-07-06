# Original ask — pij-peer-file-watch
**Captured**: 2026-07-06T08:10:43Z  ·  **By**: /the-flow

> i wanna add this for pij managed non pi agents. they can self-subscribe to chanes, they drop in with tmux liek otehr messages, they can unsub as they want too

> need debouncing etc too...

_("this" = the file-watch-notify capability, plan 015 — extend it to pij-managed **non-pi control-plane peers**: peers self-subscribe to file/glob changes via the `pij` CLI, change-notices are delivered into their tmux panes exactly like peer messages, and they can unsubscribe on demand. Debounce/coalesce/dedupe required. Thesis: see this session's `/thesis` read.)_
