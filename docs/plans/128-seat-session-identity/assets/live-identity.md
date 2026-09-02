# Live identity proof — plan 128

**Date**: 2026-09-02
**Branch**: `128-seat-session-identity`
**Isolation**: source-built `target/debug/pij-rs`; state `/tmp/pij-128-rs.SP21oL`; bind `127.0.0.1:17461`. The production daemon was not stopped, restarted, or modified.

## Isolated daemon

```console
$ target/debug/pij-rs --addr 127.0.0.1:17461 --state-dir /tmp/pij-128-rs.SP21oL ping --json
{"ok":true,"command":"pij ping","v":2,"data":{"build":"pij-rs 0.1.0","machine":"JordansacStudio.localdomain","offline":false,"status":"healthy"}}
```

## AC1 — hand-started OMP and Claude persist native sessions

OMP was hand-started in tmux pane `%2812` with ambient spawn/announce identity scrubbed and only this branch's pij extension (`omp --no-extensions -e …/.pi/extensions/pij/index.ts --no-skills`) against the isolated rs daemon. A second list read after the reconnect regression and full-gate run still returned exactly this one id for the pane.

```console
pij: detected Rust daemon v1 at 127.0.0.1:17461; registered pij-enthusiastic-barnacle

$ target/debug/pij-rs … list --json | jq '<pane %2812>'
{
  "id": "pij-enthusiastic-barnacle",
  "harness": "omp",
  "session": "01a05fca-6a76-7000-b6fa-4a565da19330",
  "pane": "%2812",
  "folder": "/Users/jordanknight/pi-hacking/fs3-seat-session-identity"
}

$ read ~/.omp/agent/sessions/-pi-hacking-fs3-seat-session-identity/
2026-09-02T01-44-56-182Z_01a05fca-6a76-7000-b6fa-4a565da19330.jsonl
```

Claude Opus 5 was hand-started in tmux pane `%2787` with the isolated source CLI first on `PATH`; `/pij ready` returned `Ready.`.

```console
$ target/debug/pij-rs … list --json | jq '<pij-just-read-the-instructions>'
{
  "id": "pij-just-read-the-instructions",
  "harness": "claude",
  "session": "5dfaefc5-a406-4935-912b-1f7d7ff06457",
  "pane": "%2787",
  "folder": "/Users/jordanknight/pi-hacking/fs3-seat-session-identity"
}

$ read ~/.claude/projects/-Users-jordanknight-pi-hacking-fs3-seat-session-identity/
5dfaefc5-a406-4935-912b-1f7d7ff06457.jsonl
```

## AC2 — generation union, frozen fields, dedupe, repository scope

Source CLI: `/tmp/pij128-bin/pij`; isolated rs address/state supplied through environment.

```json
{
  "selected": [
    {
      "pijId": "pij-ugly-lamprey",
      "harness": "claude",
      "harnessSessionId": "9e2e28f3-81d5-4ea0-888d-f6964b6aba4b",
      "gitCommonDir": "/Users/jordanknight/pi-hacking/pij/.git",
      "lifecycle": "bound",
      "generation": "legacy"
    },
    {
      "pijId": "pij-enthusiastic-barnacle",
      "harness": "omp",
      "harnessSessionId": "01a05fca-6a76-7000-b6fa-4a565da19330",
      "gitCommonDir": "/Users/jordanknight/pi-hacking/pij/.git",
      "lifecycle": null,
      "boundModel": null,
      "spawnedBy": null,
      "transcriptPath": null,
      "generation": "rs"
    },
    {
      "pijId": "pij-just-read-the-instructions",
      "harness": "claude",
      "harnessSessionId": "5dfaefc5-a406-4935-912b-1f7d7ff06457",
      "gitCommonDir": "/Users/jordanknight/pi-hacking/pij/.git",
      "lifecycle": null,
      "boundModel": null,
      "spawnedBy": null,
      "transcriptPath": null,
      "generation": "rs"
    }
  ],
  "duplicateIds": []
}
```

`pij sessions --here --json` retained the three rows above and returned one unique `gitCommonDir`, `/Users/jordanknight/pi-hacking/pij/.git`; unit test `generation-router.test.ts` separately proves a row from another repository is excluded only under `--here`.

## AC3 — whoami contracts

```json
{"id":"pij-enthusiastic-barnacle","harness":"omp","pane":"%2812","folder":"/Users/jordanknight/pi-hacking/fs3-seat-session-identity","session":"01a05fca-6a76-7000-b6fa-4a565da19330","generation":"rs","capabilityGate":"absent"}
{"id":"pij-just-read-the-instructions","harness":"claude","pane":"%2787","folder":"/Users/jordanknight/pi-hacking/fs3-seat-session-identity","session":"5dfaefc5-a406-4935-912b-1f7d7ff06457","generation":"rs","capabilityGate":"absent"}
```

Forced-legacy `pij whoami --json` for `pij-ugly-lamprey` retained the existing top-level `id`, `folder`, `dataDir`, `state`, `pid`, `orchestrationRole`, `capabilitySchema`, and `verbs` object; no rs fields replaced the legacy contract.

## AC4 — external consumer resolves both rs seats

```console
$ flowspace3 conversation ingest --pij pij-enthusiastic-barnacle --json
{"ok":true,"command":"conversation ingest","v":1,"data":{"accepted":true,"address":"pij/pij-enthusiastic-barnacle","dedupe_key":"ingest:pij/pij-enthusiastic-barnacle@/Users/jordanknight/pi-hacking/fs3-seat-session-identity"}}

$ flowspace3 conversation ingest --pij pij-just-read-the-instructions --json
{"ok":true,"command":"conversation ingest","v":1,"data":{"accepted":true,"address":"pij/pij-just-read-the-instructions","dedupe_key":"ingest:pij/pij-just-read-the-instructions@/Users/jordanknight/pi-hacking/fs3-seat-session-identity"}}
```

Both commands resolved through `pij sessions`; neither read `pij.sqlite` directly.