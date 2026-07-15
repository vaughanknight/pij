# Original ask — focus-agents
**Captured**: 2026-07-14  ·  **By**: /the-flow (seat pij-bored-pelican, stream s050)

> A typical use case I have is will have a pij peer that I have done some research in, and it has the absolute golden context.
> - I want to checkpoint here, so other agents can come in at this point and ask it a bunch of stuff and iterate with it
> - But then I want another agent to come back again and get that same golden context point and start afresh!
> - How can I do this? How can I make it so a pij orchestrator or any peer can go "okay launch x back to golden context"
> - Will I be able to tell an agent or a peer via pij to "checkpoint working-state" - call it "critical final state information" and it will save that context here forever. I can list checkpoints in repo. Checkpoint will include the agent etc, and pij can just launch them in a new tmux window.
> - Can we start with pi client, but add claude and copilot too.
> - We can experiment in tmux with pi, claude and copilot (and codex!) and see if they support this. We can also use perplexity etc
> - We should experiment by using /pij peers in pi agent with copilot gpt 5.6 sol 1m workers.
>
> Later refinement: call them **focus agents**. Verb surface `pij focus save/list/launch`. Storage `~/.pij/focus/<id>/` (global blobs, repo-filtered listing) — confirmed good.
