# u-cutover-controls transcript — plain Pi / legacy forceback

## Isolation and control

- Host and extension are identical to the Pi rs leg.
- The same native session was resumed, retaining seat id `pij-little-rascal`.
- Controls: `PIJ_DAEMON_GENERATION=legacy`, `PIJ_RS_ADDR=127.0.0.1:17683`, `PIJ_RS_STATE_DIR=/tmp/pij-w7-cutover-final.srxRKd/rs-forceback-state`.
- A fresh pij-rs daemon was actively answering at `127.0.0.1:17683` while the forceback ran.
- Legacy authority: `/tmp/pij-w7-cutover-final.srxRKd/legacy-shared`.

## Authority observations

The TS registry row exists:

```json
{"id":"pij-little-rascal","pid":29588,"harness":"pi","harnessSessionId":"01a054db-382a-760b-8ebb-247eb3820c22","runtimeBin":"pi","folder":"/Users/jordanknight/pi-hacking/pij-worktrees/s108-w7-cutover"}
```

The simultaneously-live Rust authority remained empty:

```json
{"ok":true,"command":"pij seats","v":1,"data":{"seats":[],"unavailable":[]}}
```

This is the escape-hatch discriminator: explicit `legacy` bypassed a reachable Rust daemon. The same seat id used in the Pi rs transcript landed only in the TS registry for this fresh authority pair.

## Pushed turn and reply

The legacy event log records the incoming turn and tool reply:

```text
[pij from pij-rapid-wren] Use the pij_send tool to send exactly PI_LEGACY_REPLY to pij-rapid-wren, then answer done.
pij_send {"to":"pij-rapid-wren","message":"PI_LEGACY_REPLY"}
sent → pij-rapid-wren text (delivered: peer was idle)
done
```

Result: registered in TS, absent from the live Rust authority, received a pushed turn, replied over the legacy file wire.
