## Pij inboxes for when we don't have TMUX (mostly for when we on windows)
- PIJ users can check pij for messages
- Can do a --wait and it will block until
- Messages are set as read when they are "read" auto
- Regular messages go here too for pij tmux, marked as read immediately
- pij needs to work on windows, need to do a sweep of non windows friendly stuff.
- Everythign else acts the same - so this works in shells other than tmux.
- Pij skill minor updates that if not in tmux to do this

## Pij orchestraors keep doign work themselves. 
- We need to make it so that when an orchestrator is briefed, it routes to pij orchestraotr skill
- This skill tell sit how to do pre-amble with user, how to then work through building the plan with /builder.
- The user hten often asks for explore stage straight away, then ask it if there are any workshop opportunities. The user will be here for this stuff, but it can do some auto if no questions.
- Then wi will get to workshops and POC see if tose are needed.
- then Plan, then after plan it needs to run /validate-v2 in a subagent or in a pij peer. 
- users then nromally have to say when read to build /pij please build with a copilot gpt 5.6 sol coder and separate reviewer, or please code with a claude code opus 4.8 coder and a codex reviewer tec. 
- intervidw pij-uec99o nad ask it to interview its workers on how the user has been working through this flow.
- It shoould ask and record at the top which peer config user woudl like to use with copilot gpt 5.6 sol being default.
- Also orchestraotrs get new tmux windows, then their peers are splits in that. Orchestraotrs should not pop in the prime's window.  
  