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

## Fresh proof after rebase to `main@4418e3f3`

The live run occurred on the preceding rebased product tree at `main@7b82118e`.
The final rebase to `4418e3f3` changed only the PM packet template formatting
(`git diff --stat 7b82118e..4418e3f3`); no product or test bytes changed.

Isolated daemon: `127.0.0.1:63341`, state `/tmp/pij-plan132-live-63341`.
The production daemon was not restarted. Both clients were real OMP processes
in the live `pij` tmux session, launched from the main checkout to avoid the
known linked-worktree extension collision while explicitly loading this
worktree's extension.

Healthy spawn response:

```json
{"ok":true,"command":"pij spawn","v":2,"data":{"id":"pij-plan132-live-ok","harness":"omp","pane":"%3287","proc":{"pid":16321,"proc_start":20260902171027},"folder":"/Users/jordanknight/pi-hacking/pij","state":"idle","spawn_id":"s-31c762b087d23b9248e416c2b518b39a","model":"github-copilot/gpt-5.6-sol","dispatched":true,"bound":true,"pid":16321}}
```

Healthy pane transcript:

```text
│       GPT-5.6 Sol        │
│      github-copilot      │
...
◫ 2.6%/1.1M ⟲ · rs·pij-plan132-live-ok · ⬢ GPT-5.6 Sol · ◒ high · ⑂ main ?5
rs pij-plan132-live-ok
```

Healthy roster readback named `liveness:"active"`, `pid:16321`, pane `%3287`,
and `boundModel:"github-copilot/gpt-5.6-sol"`.

Bad-model spawn response prefix and pane transcript:

```text
{"ok":false,"command":"pij spawn","v":2,"meta":"spawn.failed: seat pij-plan132-live-bad in pane %3288 model-mismatch: requested deliberately.invalid/model, actual no-model (exit code unavailable); log: .../pij-rs-spawn/s-328016ecb6d067cdab19685def842f52.log; last output: ...","error":"adapter"}
...
◫ 27K/? ⟲ · rs·pij-plan132-live-bad · ⬢ no-model · ⑂ main ?5
rs pij-plan132-live-bad
```

Fresh SQLite spine receipts:

```json
[
  {"seq":3,"kind":"spawn.bound","seat":"pij-plan132-live-ok","pane":"%3287","pid":16321,"spawn_id":"s-31c762b087d23b9248e416c2b518b39a"},
  {"seq":6,"kind":"spawn.failed","seat":"pij-plan132-live-bad","exit_code":null,"pane":"%3288","reason":"model-mismatch: requested deliberately.invalid/model, actual no-model","spawn_id":"s-328016ecb6d067cdab19685def842f52"}
]
```
