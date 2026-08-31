# Reviewer baseline probes — the three cutover controls BEFORE the unit

Reviewer `pij-central-crane`. Run at HEAD `80bb0317` (wave-7 dispatch, no unit code) so that
every claim the unit's receipt makes about "already exists" / "now works" can be graded against
an observed prior state rather than against the packet's prose.

Method: probe the SHIPPED surface (REVIEWER.md § 1.2). Binary built from this tree,
`CARGO_TARGET_DIR=/tmp/pij-w7-review-crane-target`, `cargo build --locked -p pij-cli`.

## Production safety

- `lsof -nP -iTCP:7461 -sTCP:LISTEN` → **nothing listening**; `~/.pij-rs` **does not exist**.
  So there is no production pij-rs daemon on this machine and no production rs store; the
  default-address legs below are refusals, not contact with anything live.
- Throwaway instance only: `pij-rs daemon --bind 127.0.0.1:17461` with
  `PIJ_RS_STATE_DIR=/tmp/pij-w7-crane-state`.
- The legacy TS daemon and the canonical `/Users/jordanknight/pi-hacking/pij/.pi/**` were not
  touched by any probe on this page.

## Observed, verbatim

| # | invocation (all `--json list`) | observed |
|---|---|---|
| 1 | `--addr 127.0.0.1:17461` | `{"ok":true,"command":"pij seats",…,"data":{"seats":[],"unavailable":[]}}` |
| 2 | `PIJ_RS_ADDR=127.0.0.1:17461`, **no** `--addr` | `{"ok":false,…,"meta":"could not reach the daemon: error sending request for url (http://127.0.0.1:7461/v1/seats)"}` |
| 3 | `PIJ_RS_STATE_DIR=` (empty), `--addr 127.0.0.1:17461` | `{"ok":false,…,"meta":"daemon/auth: could not read the daemon key at daemon.key (No such file or directory (os error 2)) — is the daemon running?"}` |
| 4 | `PIJ_RS_ADDR=not:a:port`, `--addr 127.0.0.1:17461` | `{"ok":true,…"seats":[]}` — env not consulted at all |
| 5 | `--addr not-an-addr` | `{"ok":false,…,"meta":"could not reach the daemon: error sending request for url (http://not-an-addr/v1/seats)"}` |

## What each one settles

**B-1 · `PIJ_RS_ADDR` does not exist in the Rust client today.** Probes 2 and 4 are the same
fact from both sides: with the variable set to a *reachable* address the client still went to
`127.0.0.1:7461`, and with it set to garbage the command still succeeded. Corroborated
statically — `grep -rn "PIJ_RS" crates/ --include=*.rs` returns exactly one line,
`crates/cli/src/lib.rs:28` (`PIJ_RS_STATE_DIR`), and `--addr` is a plain
`#[arg(long, global = true, default_value = "127.0.0.1:7461")]` at `crates/cli/src/main.rs:29-30`
with no `env =`.

This contradicts two documents the coder is instructed to build on:

- `assets/wave-3/WIRE-CONTRACT.md:218-220` — *"Address and key: `PIJ_RS_ADDR` else
  `127.0.0.1:7461` … Both already exist in `crates/cli`."* **False for the Rust client.** It is
  true only of the TS extension (`.pi/extensions/pij/adapters/daemon-http.ts:54-55`), which is
  presumably where the belief came from.
- `packet-u-cutover-controls.md:10` — *"honor `PIJ_RS_ADDR` (env) and `--addr` (CLI, exists)"*.
  Only the parenthesised half is true, and the sentence reads as though both halves are.

Consequence for grading: `PIJ_RS_ADDR` in the Rust client is **new work**, not verification of
existing work. A receipt that "verifies and documents" it without a code change is describing
the extension and calling it the client.

**B-2 · Empty `PIJ_RS_STATE_DIR` is a silent, relative fallback (probe 3).** `default_state_dir`
(`crates/cli/src/lib.rs:27-31`) takes `var_os(...).map(PathBuf::from)` unconditionally, so an
empty value produces an empty `PathBuf` and the key path degrades to the **relative** string
`daemon.key`, resolved against the process cwd. The error names neither the variable nor the
value, and its trailing question — *"is the daemon running?"* — actively misdirects: the daemon
was running and answering on the address given. This is exactly the shape packet item 3
forbids. Pre-existing, so it is the unit's to fix, not the unit's fault.

**B-3 · `--addr` is never parsed, only concatenated (probe 5).** A malformed value is carried
into a URL and surfaces at connect time. It does at least echo the value, so it is less bad
than B-2, but under packet item 3 a malformed control is owed a loud refusal naming the control
and the value at resolution time, not a connection error later.

**B-4 · The extension has the same silent-fallback shape** for both variables:
`.pi/extensions/pij/adapters/daemon-http.ts:54-55` uses `env.X?.trim() || DEFAULT`, so an empty
or whitespace value is indistinguishable from unset. Whatever loud-error rule lands in Rust has
to land here too, or the fix has landed in one half (E-029).

**B-5 · Generation is currently *probed*, not *declared*.** `detectDaemonGeneration`
(`daemon-http.ts:59-96`) tries rs first and falls back to legacy only when the connection is
refused **and** a legacy file surface exists (`index.ts:285`). So "rs by default" is already
true whenever rs is up — which means the interesting half of the forceback is the other
direction: **`PIJ_DAEMON_GENERATION=legacy` must land on legacy while rs is answering.** An
implementation that consults the variable only inside the `catch`/refused branch passes every
test where rs is down and fails the only case the control exists for. That is the first thing I
will probe on the unit.

## Tree

`git status --short` after all probes: only the two unrelated
`*.bak-leanctx-eradication-20260830` files COMMON § 3 says to ignore. HEAD not moved.
