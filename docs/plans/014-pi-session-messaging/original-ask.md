# Original ask — pi-session-messaging
**Captured**: 2026-06-16T02:04:34Z  ·  **By**: /the-flow

> Need to research if there's any pi extensions to enable Pi to talk between
> sessions. So I've got two Pi windows, can they talk to each other? … The idea
> is I want to have one Pi and another Pi, just straight up having a conversation
> with each other naturally - near realtime.

> [phase 1 framing] an extension running, using file change notify to monitor a
> jsonl file. when new messages go in, they are immediately sent to the pi
> session. if it's not executing, then just straight away execute the prompt
> (pij message from: blah -> ). If the agent is executing then it will be added
> to the queue via steering. … the jsonl will say who it was from etc. … then
> when it changes, the extension finds unread items then plays them. could be
> more than one unread item, so pop them all in as separate messages.

> [after proving it] yeah it worked! okay that is phase one of our requirements
> sorted. we can map that in to a proper cli later. … but we have some more
> preamble to work through first before we are ready for the full plan.
