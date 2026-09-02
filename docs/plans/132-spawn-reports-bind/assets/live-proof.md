# Live proof — plan 132

Isolated daemon: `127.0.0.1:17461`, state `/tmp/pij-plan132-live-20260902`. The production daemon was not restarted. Both clients ran in the live `pij` tmux session through OMP v18.0.3 with the worktree extension explicitly loaded.

## Dead/unusable model before honest bind

Command:

```text
target/debug/pij-rs --state-dir /tmp/pij-plan132-live-20260902 --addr 127.0.0.1:17461 --json spawn --id pij-plan132-bad8 --harness omp --bin /tmp/pij-plan132-omp --model deliberately.invalid/model --cwd /Users/jordanknight/pi-hacking/pij --session pij --wait-seconds 30
```

Transcript:

```json
{"ok":false,"command":"pij spawn","v":1,"meta":"spawn.failed: seat pij-plan132-bad8 in pane %3068 model-mismatch: requested deliberately.invalid/model, actual no-model (exit code unavailable); log: /var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-rs-spawn/s-50881602c0e5a373516a9cfcc52e984d.log; last output:\n ◫ 27K/? ⟲ · pij-plan132-bad8 · ⬢ no-model · ⑂ main ?5 \npij-plan132-bad8\n...","error":"adapter"}
```

The client remains alive by ruling; spawn reports `bound:false` through the failed envelope because the requested model did not bind. SQLite spine evidence:

```text
seq 26  kind spawn.failed  seat pij-plan132-bad8
payload: {"exit_code":null,"last_output":" ◫ 27K/? ⟲ · pij-plan132-bad8 · ⬢ no-model ...", ...}
```

## Healthy bind

Command:

```text
target/debug/pij-rs --state-dir /tmp/pij-plan132-live-20260902 --addr 127.0.0.1:17461 --json spawn --id pij-plan132-healthy3 --harness omp --bin /tmp/pij-plan132-omp --model github-copilot/gpt-5.6-sol --cwd /Users/jordanknight/pi-hacking/pij --session pij --wait-seconds 30
```

Spawn response:

```json
{"ok":true,"command":"pij spawn","v":1,"data":{"id":"pij-plan132-healthy3","harness":"omp","pane":"%3076","proc":{"pid":39359,"proc_start":20260902133347},"folder":"/Users/jordanknight/pi-hacking/pij","state":"idle","parent":null,"spawn_id":"s-b5783e1e8d6a97a886135c3e63179efa","model":"github-copilot/gpt-5.6-sol","dispatched":true,"bound":true,"pid":39359}}
```

Tmux footer (`tmux capture-pane -p -J -t %3076`):

```text
│       GPT-5.6 Sol        │
│      github-copilot      │
...
◫ 2.6%/1.1M ⟲ · pij-plan132-healthy3 · ⬢ GPT-5.6 Sol · ◒ high · ⑂ main ?5 · (sub)
pij-plan132-healthy3
```

Roster readback:

```json
{"ok":true,"command":"pij state","v":1,"data":{"id":"pij-plan132-healthy3","state":"idle","liveness":"active","pid":39359,"procStart":20260902133347,"cwd":"/Users/jordanknight/pi-hacking/pij","harness":"omp","parent":null,"boundModel":"github-copilot/gpt-5.6-sol","pane":"%3076"}}
```

SQLite spine evidence:

```text
seq 29  kind spawn.bound  seat pij-plan132-healthy3
payload: {"pane":"%3076","pid":39359,"spawn_id":"s-b5783e1e8d6a97a886135c3e63179efa"}
```

The spawned id, footer id, roster row id, pane, pid, and `spawn.bound` event agree.
