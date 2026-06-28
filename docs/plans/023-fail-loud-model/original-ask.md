# Original ask — fail-loud-model
**Captured**: 2026-06-28  ·  **By**: /the-flow

> next we ned to add support for codex... [evolved across the session into:]
>
> "we should not need to verify, i think that if its not going to work, pij should
> scream when they first call the cli..."
>
> "if its truly dead, the user can assist"
>
> "when we run pij, the daemon communicates things right? why not if we fire up a
> new session, the daemon checks in on it, if its stalled or dead it tells the creator?"
>
> [endorsing pij-vigz1i's suggestion] "yep all great things. lets get a flow up for it"
>
> Combined intent: make model resolution fail loud instead of silent —
> (1) `pij models` discovery so agents/humans don't grep ~/.pi/agent/models.json (fuzzy match, pi-first);
> (2) spawn-time model validation (reject/suggest on unknown --model — scream on first CLI call);
> (3) daemon whole-life heartbeat: detect a bound session going stalled/dead (incl. the
>     bad-model first-inference 400 that deterministic-bind never proves) and PUSH it to the
>     creator (PIJ_PARENT_ID) with a machine-stable reason — truly-dead routes to the human,
>     no auto-heal. Reuses the existing boot-phase notify-the-creator pattern and the shipped
>     liveness() primitive. This is the expanded task #10 "fail-loud bound model".
