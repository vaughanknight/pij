# u-cutover-controls transcript — OMP / legacy forceback

## Isolation and control

- Host and extension are identical to the OMP rs leg.
- The same native session was resumed, retaining seat id `pij-rapid-wren`.
- Controls: `PIJ_DAEMON_GENERATION=legacy`, `PIJ_RS_ADDR=127.0.0.1:17683`, `PIJ_RS_STATE_DIR=/tmp/pij-w7-cutover-final.srxRKd/rs-forceback-state`.
- A fresh pij-rs daemon was actively answering at `127.0.0.1:17683` while the forceback ran.
- Legacy authority: `/tmp/pij-w7-cutover-final.srxRKd/legacy-shared`.

## Authority observations

The TS registry row exists:

```json
{"id":"pij-rapid-wren","pid":29589,"harness":"pi","harnessSessionId":"01a054db-3a73-7000-a0c5-0ee23d4ebcf3","runtimeBin":"omp","folder":"/Users/jordanknight/pi-hacking/pij-worktrees/s108-w7-cutover"}
```

The simultaneously-live Rust authority remained empty:

```json
{"ok":true,"command":"pij seats","v":1,"data":{"seats":[],"unavailable":[]}}
```

This is the escape-hatch discriminator: explicit `legacy` bypassed a reachable Rust daemon. The same seat id used in the OMP rs transcript landed only in the TS registry for this fresh authority pair.

## Pushed turn and reply

The legacy event log records the incoming turn and tool reply:

```text
[pij from pij-little-rascal] Use the pij_send tool to send exactly OMP_LEGACY_REPLY to pij-little-rascal, then answer done.
pij_send {"to":"pij-little-rascal","message":"OMP_LEGACY_REPLY"}
sent → pij-little-rascal text (delivered: peer was idle)
done
```

Result: registered in TS, absent from the live Rust authority, received a pushed turn, replied over the legacy file wire.
