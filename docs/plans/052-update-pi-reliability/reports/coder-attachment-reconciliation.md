# s052 coder attachment reconciliation

## Hold reason

During the Seq 330 fix re-canary, the coder reported registered pane `%1398` and an untargeted `tmux display-message -p` result `%1250`. Product edits/tests were paused pending coder-origin provenance.

## Coder-origin evidence

```text
literal TMUX_PANE: %1398
pij whoami:        pij-zygomorphic-blackbird
cwd:               /Users/jordanknight/pi-hacking/pij-worktrees/s052-update-pi-reliability
wrapper pid:       18327
wrapper ppid:      4053
wrapper tty:       ttys208
Copilot session:   5b4b820b-880e-49f3-8c0f-e97272fd6a97
native child:      pid 18341, ppid 18327, same session id
targeted pane:     %1398 18327 /dev/ttys208 node
registry paneId:   %1398
registry pid:      18327
registry planned/native session: 5b4b820b-880e-49f3-8c0f-e97272fd6a97
```

Targeted tmux pane/pid enumeration returned exactly one `%1398 18327` mapping. Process-session enumeration returned only the wrapper and its direct native Copilot child.

The same-worktree cold reviewer is distinct:

```text
pij-rigid-mollusk
pane:    %1399
pid:     29009
session: 450d9e32-ba0e-46da-bdcb-b9272de6bd53
```

## Provenance of `%1250`

`%1250` came only from `tmux display-message -p` without `-t` inside a non-TTY tool subprocess. Tmux selected the active client/parent pane. It was not the coder's literal environment pane, targeted pane, registry pane, PID owner, TTY, or native session.

## Ruling

Coder pane `%1398` coherently and uniquely owns PID `18327`, TTY `/dev/ttys208`, and Copilot session `5b4b820b-880e-49f3-8c0f-e97272fd6a97`. There is no seat collision. The attachment hold is resolved without respawn or product mutation.
