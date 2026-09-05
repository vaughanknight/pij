# Native Copilot extension

New Copilot CLI sessions use the repo-owned native user extension for Pij body
messages. Existing sessions are not retroactively attached. No UI-server/RPC
port or tmux message injection is used. Pi/OMP/Claude transport is unchanged.

## Install and diagnose

From the **canonical main checkout**, after the native extension and Rust daemon
changes have been composed:

```sh
just link
just copilot-native-doctor
```

`just install` includes the same link policy and doctor. Production linking
refuses linked worktrees before changing any home. The destination is
`${COPILOT_HOME:-$HOME/.copilot}/extensions/pij`, linked to the reviewed
`.copilot/extensions/pij/` source, including `extension.mjs` and `store.mjs`.
`COPILOT_HOME` also selects `settings.json`.

Setup merges only `experimental: true` into a valid settings object. Unknown
keys survive; an already-enabled file is not rewritten. Foreign symlinks
(including dangling links), real destination files/directories, symlinked
configuration roots/settings, and malformed settings are refused rather than
replaced. Settings updates use an atomic sibling-file rename. These preservation
checks are **brakes**: removing them permits the same or more writes.

`just unlink` removes only Pij-owned extension links; it leaves experimental and
all other settings alone. The doctor is read-only and verifies the exact source
link, both source modules, and persistent experimental enablement. It does not
prove a particular running session has attached. `copilot --no-experimental`
remains a deliberate per-session opt-out, not a reason to enable a fallback.

After setup, start `copilot` manually or spawn a new Copilot seat through Pij.
The native `pij_send({to, message})` tool returns a Pij receipt. Ordinary assistant
turns are not forwarded automatically. Compact/new/reload remote controls are
unsupported for Copilot; native user-driven session lifecycle remains separate.

## Receipt grades and failures

A daemon `reader-read` receipt means the native harness accepted a message. It is
**not** model completion. Public native events carry distinct event `id` and
`data.messageId`; assistant/idle evidence is recorded separately. Normal accepted
duplicates are suppressed. A crash across native acceptance and durable recording
can remain ambiguous; do not describe this as universal exactly-once delivery.

The extension claims with native-session/host-incarnation evidence and checks the
daemon's echoed proof before injecting. Missing support cannot silently downgrade
to an old daemon, shim, or tmux path. Human draft/typing is a consent brake: held
work stays durable, then delivers after release without another sender message.
A malformed or ambiguous claim stops affected receiving with a diagnostic, not a
successful ack or a replay loop. Daemon/key absence must leave ordinary Copilot
usable with a bounded reconnect and one actionable diagnostic per outage episode.

Post-join outages expose `[pij native] unavailable:` through the native session,
once per failure episode. The smoke counts the terminal prefix and proves an
ordinary user/assistant interaction before starting its isolated daemon. A
pre-join SDK/import failure can instead emit extension stderr or a native loader
error; that is not proof of timeline visibility. No private acceptance-file or
undocumented log-directory layout is required by the smoke.

## Deterministic checks

```sh
export VITEST_MAX_WORKERS=4 VITEST_MAX_THREADS=4 CARGO_BUILD_JOBS=4
just test harness/scripts/link-global.test.ts harness/scripts/copilot-native-smoke.test.ts
just copilot-native-test
just copilot-native-rust-test
```

The first command covers installer safety and proof-fixture boundaries. The
second runs the native extension's `node:test` files and is included in both
`harness checks` and `just self-check`; missing test files fail, never skip. The
Rust recipe runs `pij-core`, `pij-store`, `pij-harnesses`, `pij-daemon`, and `pij-cli`
with a checkout-local Cargo target. During parallel implementation use only the
assigned scoped checks; the composed native recipes and full gate run afterward.

## Real CLI witnesses

Build the composed Rust binary, then run the actual client driver:

```sh
CARGO_TARGET_DIR="$PWD/target" cargo build -p pij-cli --bin pij-rs
just copilot-native-smoke --mode both --provider local --output /tmp/native-local-receipt.json
just copilot-native-smoke --mode both --provider real --model <verified-model> --output /tmp/native-real-receipt.json
```

`--mode manual|spawned|both` selects direct Copilot launch or actual Rust Pij
spawn/prebind. `--provider local` is a **deterministic OpenAI-compatible fixture**,
not real inference. Real mode requires an inherited `COPILOT_GITHUB_TOKEN`,
`GH_TOKEN`, or `GITHUB_TOKEN` plus an explicit model. Supply credentials in memory;
never place tokens in command arguments, receipts, or repository files. The driver
never copies global authentication files and redacts known credentials from its
receipt. Signed-in `gh` alone does not populate an isolated HOME.

The driver creates private HOME/COPILOT_HOME/state, an empty workspace, a dedicated
tmux socket/config, and an owned real Rust daemon. Manual children have no Pij
identity/preallocation or SDK attachment variables; only the isolated daemon
endpoint/state overrides are present. No machine daemon restart, global install,
upstream binary update, or live-fleet call occurs. An isolated executable wrapper
adds safe Copilot launch flags for the spawned case; it execs the actual CLI and
preserves the host process identity.
Only the canonical path of that empty temporary workspace is seeded in the private
`settings.json`'s `trustedFolders`, avoiding an interactive startup trust prompt.
Global trust and tool permissions are unchanged; this is not `--yolo` or allow-all.

Witnesses retain exact source and executable hashes, versions, processes/panes,
Pij msg/job IDs, public native events, bidirectional tool-originated replies,
initial spawned task/duplicate checks, held/admitted draft evidence, missing
consumer refusal/queue evidence, and daemon restart/key rotation. Local-provider
protocol proof alone is not composed product acceptance. A passing full inventory
also does not replace actual manual/spawned and real-model witnesses.
Before teardown, the receipt captures each remaining pane's terminal text and
scrollback, including on failure. An individual pane's capture error is retained
without discarding the other panes; a listing error is also explicit.

Use `--pij-bin`, `--copilot-bin`, `--timeout-seconds`, or `--output` to select a
composed build and bound a run. Existing receipts are never overwritten. Exit
codes: `0` passed, `1` failed assertion/runtime, `2` missing prerequisite or invalid
invocation. Missing binary/shipping module/real credential names the prerequisite
rather than manufacturing a fixture success. Owned processes are stopped; private
run directories remain for diagnosis and contain native session state. Remove
only the specific run directory after retaining the needed redacted receipt.
