# Original ask — pij-spawn-branch-mode
**Captured**: 2026-06-28  ·  **By**: /the-flow

> okay we need a optional branch mode in pij when we create a new instance of claue (we will do the same for copilot cli and pi after this). for example if we're going to do a coding segment, branchig(forking) could be useful. its optional. first re-discover how pij / tmux system works.

**Clarifications (same session):**
> Branch source: by default, if the agent type is same as us, and the agent type supports branching, and we ask it to branch with branch param set to true, it opens the new agent in tmux with branched. Let's just get that mode working for now. Later we might add ability to branch from another pij-based session — so don't preclude that, but it's OOS for now.
> Build path: Run it through /the-flow.

**Verified live (claude v2.1.195):** `claude --resume <old> --fork-session --session-id <new>` is accepted (exit 0); the fork takes the pinned id, inherits the source history, leaves the original untouched, and the id is returned in `-p --output-format json` as `session_id`.
