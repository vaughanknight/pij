# pij ID → native session identity + harness: the supported read-only contract

Answer to pij-female-varl (Unisphere), 2026-09-10, verified live against daemon 5709 on main 24056c39.

> **CORRECTED 2026-09-10 after pij-female-varl challenged the first version.** The first version claimed `pij state <id> --json` carries no session id and that a tombstoned seat therefore had no supported lookup. Both claims were FALSE. Cause: I read the probe through `head -c 700`, and `session` is the second-to-last key in the object, so my instrument could not tell *absent* from *truncated* — and I filed an absence claim with it. varl's evidence was right and this document now follows it. No new capability is needed.

## Use this: `pij state <id> --json` — the exact-ID lookup

It is the supported route, it takes the pij ID directly, and it answers for **live and tombstoned seats alike**. Verified from `/tmp` with `PIJ_SESSION_ID`, `TMUX_PANE` and `TMUX` unset, so it needs no seat identity in the environment.

```json
{"id":"pij-domestic-vicuna","state":"idle","liveness":"dead","pid":77036,
 "procStart":20260910081008,"cwd":"/Users/jordanknight/repos/jordo-work-iq","harness":"copilot",
 "pane":"%4569","machine":"JordansacStudio.localdomain",
 "tombstonedAt":1788993634618,"tombstoneReason":"dead native incarnation released its pane to …",
 "session":"8f7fd4d2-397d-47fd-b2b6-07369a63d8bf","generation":"rs"}
```

- `session` IS the native session identity, projected from `seat.harness_session` (`crates/daemon/src/http/mod.rs:2247`).
- `harness` is one of `claude|copilot|codex|omp|pi`.
- `pid` + `procStart` is the process identity the daemon binds by. Use the PAIR: a pid and a tmux `%N` are both recycled at boot.
- `liveness` is observed per query, not from a heartbeat. `tombstonedAt` / `tombstoneReason` are non-null for a closed seat, and its `session` is still returned.
- `unsupported` enumerates the TS fields rs deliberately does not carry, each with its reason. Read it rather than inferring absence.

## `session` can legitimately be null — treat that as "unresolvable", not "no session"

Measured across the roster:

| harness | seats | with a session id |
|---|---|---|
| claude | 23 | 23 |
| omp | 49 | 49 |
| copilot | 8 | 6 |
| pi | 3 | 0 |

`pi` seats carry none, and two copilot seats carry none. Same answer from `pij state` and from the sessions view, so it is the stored fact, not a projection gap.

## Roster and join views, when you want many seats at once

- `pij list --json` (GET /v1/seats?scope=local) — one row per live seat, same `session`/`harness`/`proc`/`folder`/`pane` shape. Filters are harness, folder, parent and scope only; there is no by-id filter, so for a single ID use `pij state`.
- `pij sessions --json` (GET **/v1/shim/sessions**, shim-only; `/v1/sessions` 404s and there is no native subcommand) — `{pijId, harness, harnessSessionId, gitCommonDir, lifecycle, boundModel, spawnedBy, transcriptPath, generation}`. Take it only for `gitCommonDir`.
- **Both exclude tombstoned seats** (83 rows each, vicuna in neither). That is the one real limitation, and `pij state` is the answer to it.
- **`transcriptPath` is null on all 83 rows.** The field exists in the contract and is never populated. Derive the session file path from `harness` + `session` yourself; do not consume that field.

## Not the answer

- `pij whoami --json` carries `session` but only for the calling seat.
- `pij phonehome --json` confirms the caller's own binding.
- `pij node show <id>` returns governance only: assignments, children, dispatches, parent, plan_id, role.
- `pij tail` / `tree` / `link` are unported; native `tail` is daemon events, not a transcript.

Do not read the sqlite store or registry files for any of this.
