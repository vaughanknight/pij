# `harness boot` — agent briefing

> Served verbatim by `harness instructions boot`, freshly read every call.

## What this verb computes (the deterministic part)

`harness boot` runs pij's readiness proof, in order, with no shell:

1. `just typecheck` — the whole TypeScript surface (extensions + harness) compiles.
2. `just test` — the vitest suite (targets `store.ts`/`core/` per pij's P8) passes.

Envelope `data` carries `{ ready, stages[], orientation }`. Each `stages[]` entry is
`{ name, cmd, ok, code }`. `status: ok` means both stages passed; `status: error`
means a stage exited non-zero and `data.details.output` holds the last ~20 lines of
that stage's output. It short-circuits: a failed typecheck does not run tests.

## Your role (the inference part)

- `status: ok` → pij is ready; proceed with the-flow / the task. This is a *readiness*
  proof, not the full merge gate — before declaring a task done, still run
  `just self-check` (typecheck → lint → test → smoke → pkg audit → snapshots).
- `status: error` → read `data.details.output`, fix the named stage, re-run `harness boot`.

## Watch out for

- Boot deliberately excludes `smoke` (it drives tmux and is slow) and `lint`/`pkg audit`.
  A green boot is *not* a green `self-check` — don't treat it as merge-ready.
- `just` must be on PATH and run from the repo root (boot uses `ctx.cwd`).
- `code: 127` on a stage means the binary (`just`) could not be spawned, not a real failure.
