# pij ID → native session identity + harness: the supported read-only contract

Answer to pij-female-varl (Unisphere), 2026-09-10, verified live against daemon 5709 on main a0acf9ac. Every claim below was probed, not read from docs.

## Use this: `pij list --json` (GET /v1/seats?scope=local)

One call, and the seat row is the whole answer for a LIVE seat:

```json
{"id":"pij-possible-porcupine","machine":"JordansacStudio.localdomain","harness":"copilot",
 "session":"13595129-3a68-4ea4-9ea3-a7e8de8379f9","extension_build":null,"extension_path":null,
 "pane":"%4569","proc":{"pid":24821,"proc_start":20260910084031},
 "folder":"/Users/jordanknight/repos/jordo-work-iq","state":"idle","semantic_state":"waiting",
 "role":"prime","parent":null,"relay":false,"native_extension_delivery":true,"generation":"rs"}
```

- `session` IS the native session identity (Claude/Copilot/Codex session id, omp session id).
- `harness` is one of `claude|copilot|codex|omp|pi`.
- `proc.pid` + `proc.proc_start` is the process identity the daemon binds by. Use the PAIR; both a pid and a tmux `%N` are recycled at boot.
- `folder` is the seat's cwd. `pane` may be absent (paneless seats are legal).
- There is no by-id filter: the response is the local roster (83 rows here) and the caller filters. Supported filters are harness, folder, parent and scope only.

## Second option, only if you need the git root: `pij sessions --json` (GET /v1/shim/sessions)

Rows of `{pijId, harness, harnessSessionId, gitCommonDir, lifecycle, boundModel, spawnedBy, transcriptPath, generation}`. It adds `gitCommonDir`. Measured coverage on this machine, 83 rows:

| harness | rows | with harnessSessionId | with transcriptPath |
|---|---|---|---|
| claude | 23 | 23 | 0 |
| omp | 49 | 49 | 0 |
| copilot | 8 | 6 | 0 |
| pi | 3 | 0 | 0 |

Two consequences you must design for:

1. **`transcriptPath` is never populated** — null on all 83 rows. Derive the session file path yourself from `harness` + the session id. Do not treat the field as a source.
2. **`pi` seats carry no native session id at all**, and 2 of 8 copilot seats lack one. A null session id means "cannot be resolved", not "no session".

There is no native `pij-rs sessions` subcommand; this verb is shim-only, and the path is `/v1/shim/sessions`, NOT `/v1/sessions` (which 404s).

## Closed / tombstoned seats: there is NO supported lookup. Do not work around it.

Verified with `pij-domestic-vicuna`, tombstoned at 08:40 today:

- `pij list --json` and `GET /v1/seats` **exclude** it. Both return 83 rows without it.
- `pij sessions --json` **excludes** it.
- `pij state pij-domestic-vicuna --json` **does** answer, and gives `harness`, `pid`, `procStart`, `cwd`, `pane`, `machine`, `liveness:"dead"`, `tombstonedAt`, `tombstoneReason` — **but carries no session id field at all.**
- `pij node show <id>` returns only governance (assignments, children, dispatches, parent, plan_id, role). No session.

The store row still holds the value (`seats.harness_session` = `8f7fd4d2-…` for vicuna). Nothing projects it. So today a tombstoned pij ID cannot be resolved to its native session through any supported operation.

**Please do not read the sqlite store or the registry files for it.** That is exactly the scraper Jordan ruled out, and the row is not a contract. Instead: treat an unresolvable ID as "not currently live", and I will close the gap properly — `session` added to `pij state` (which already serves tombstoned seats) is the minimal fix. Tell me if Unisphere needs tombstoned resolution in its first cut and I will plan it now rather than later; a seam objection is cheapest before implementations accumulate.

## Not the answer

- `pij whoami --json` carries `session`, but self only — it cannot look up another seat.
- `pij phonehome --json` is a binding confirmation for the caller, not a lookup.
- `pij tail` / `pij tree` / `pij link` are unported; native `tail` is daemon events, not a transcript.
