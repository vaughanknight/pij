# Pre-registered probe table — u-cutover-controls

Reviewer `pij-central-crane`. Written and committed **before** the unit's head exists, so the
grading cannot drift to fit whatever the implementation turns out to do. Every row is a live
probe against the shipped surface; none is satisfied by reading a test or a transcript.

Rig, all throwaway, standing:

- `pij-rs daemon --bind 127.0.0.1:17461`, `PIJ_RS_STATE_DIR=/tmp/pij-w7-crane-state`.
- legacy home `/tmp/pij-w7-crane-legacy-home` (seeded `daemon.lock` so `hasLegacyFileSurface`
  is true); a second, deliberately empty one at `/tmp/pij-w7-crane-legacy-empty`.
- hosts `/Users/jordanknight/.npm-global/bin/{pi,omp}`, launched `--no-extensions -e <ext>`
  with inherited `PIJ_*` identity variables cleared.
- Nothing listens on `7461` and `~/.pij-rs` does not exist, so a default-address leg is a
  refusal and never contact with production. The legacy TS daemon and canonical
  `/Users/jordanknight/pi-hacking/pij/.pi/**` stay untouched.

## A · Forceback (packet priority 1) — the only case the control exists for

| # | condition | required outcome |
|---|---|---|
| A1 | `PIJ_DAEMON_GENERATION=legacy`, **rs answering on 17461**, legacy home seeded | seat registers in the LEGACY home (`pij-<id>.json` appears). rs authority must still show `seats: []`. |
| A2 | unset, rs answering | seat registers on rs — authority row present |
| A3 | `PIJ_DAEMON_GENERATION=rs`, rs answering | as A2 |
| A4 | `=legacy`, rs answering, legacy home **empty** | must not silently land on rs. Either legacy, or a loud refusal naming the variable. A silent rs fallback is a finding. |
| A5 | `=RS` / `=Legacy` (case) | ruled either way, but must be the SAME rule in Rust and TS |

A1 is the falsifier. An implementation that consults the variable inside the
refused-connection branch of `detectDaemonGeneration` (`daemon-http.ts:59-96`) passes A2–A4 and
fails A1, which is the whole control.

## B · Resolution order as a table (packet priority 2)

Each malformed row must error **loudly, naming the variable and the value**. Silent fallback to
a default is a finding; so is an error that names neither.

| # | input | required outcome |
|---|---|---|
| B1 | `PIJ_DAEMON_GENERATION` unset | `rs` |
| B2 | `=legacy` | legacy — explicit env wins |
| B3 | `=banana` | loud error naming `PIJ_DAEMON_GENERATION` **and** `banana` |
| B4 | `=` (empty) | loud error, not "unset" — B1 and B4 must be distinguishable |
| B5 | `=" legacy "` (whitespace) | whichever way it is ruled, identical in Rust and TS |

## C · Addr and state dir via BOTH CLI and env (packet priority 3)

Baseline already recorded in `review-cutover-baseline.md`: `PIJ_RS_ADDR` does **not** exist in
the Rust client today, `--addr` is never parsed, and empty `PIJ_RS_STATE_DIR` degrades to a
relative `daemon.key`. So C1–C3 are new work, not verification.

| # | input | required outcome |
|---|---|---|
| C1 | `PIJ_RS_ADDR=127.0.0.1:17461`, no `--addr` | reaches 17461 (today: reaches 7461) |
| C2 | `--addr 127.0.0.1:17461` + `PIJ_RS_ADDR=127.0.0.1:19999` | **CLI wins** |
| C3 | `--addr 127.0.0.1:7461` (explicit, equals the default) + `PIJ_RS_ADDR=…:17461` | **CLI still wins.** Fails if resolution compares `cli.addr` to the default string instead of asking whether the flag was supplied. |
| C4 | `PIJ_RS_ADDR=not:a:port` | loud error naming var and value, at resolution not at connect |
| C5 | `--addr not-an-addr` | loud error naming the flag and value |
| C6 | `PIJ_RS_STATE_DIR=` (empty) | loud error naming the variable — never a relative `daemon.key` |
| C7 | daemon `--bind` + its env equivalent, both set | same precedence rule as C2, and the same malformed handling as C4 |
| C8 | every one of C1–C7 against the **extension**, not just the CLI | identical rule both sides — otherwise the fix landed in one half (E-029) |

## D · Fence (packet priority 4)

`git diff --name-only <base>..<head>` intersected against the packet's write fence. Anything
outside `.pi/extensions/pij/**` (worktree copy), `crates/cli` config/env, `crates/daemon`
config env parsing, the unit's tests, and the unit's report is a finding. Specifically
checked: no diff under `crates/tmux/**`, `crates/store/**`, the sidecars paths, or the
canonical `/Users/jordanknight/pi-hacking/pij/.pi/**`; and no production daemon or store
contacted by any transcript.

## E · Receipt claims

- Every matrix leg carries an **authority observation** — a seat row from the daemon or a
  `pij-<id>.json` in the legacy home. A host transcript showing a model reply is refused: it
  is reproducibly produced by an extension that never loaded.
- The gate count is mine, run at the unit's head, not taken from the receipt.
- Any mutation transcript is re-run by me rather than read.
- Which of the four dual-claimed paths (`Cargo.toml`, `crates/daemon/Cargo.toml`,
  `crates/daemon/src/lib.rs`, `Cargo.lock`) the unit touched, since the tree is shared with
  u-sidecars and a gate run here currently compiles both units.
