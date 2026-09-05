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

`just install` includes the same link policy, but reports and skips the optional
Copilot doctor when the CLI is absent. An installed but broken CLI still fails;
standalone `just copilot-native-doctor` always requires it. Production linking
refuses linked worktrees before changing any home. The destination is
`${COPILOT_HOME:-$HOME/.copilot}/extensions/pij`, linked to the reviewed
`.copilot/extensions/pij/` source, including `extension.mjs` and `store.mjs`.
`COPILOT_HOME` also selects `settings.json`.

Setup merges only `experimental: true` into a valid settings object. Unknown
keys survive; an already-enabled file is not rewritten. Foreign symlinks
(including dangling links), real destination files/directories, symlinked
configuration roots/settings, and malformed settings are refused rather than
replaced. Settings updates sync the complete temporary file before atomic rename,
then sync the parent directory where supported. Real sync errors fail setup;
an error after rename explicitly reports that changes were applied. These
preservation checks are **brakes**: removing them permits the same or more writes.

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

### Opt-in cross-language contract

```sh
just copilot-native-contract-test
```

This explicitly runs the daemon's ignored `native_runtime_cold_resume` integration
target against the actual JavaScript store module, HTTP, and SQLite. It requires
Node, Cargo, the composed daemon test target, and `.copilot/extensions/pij/store.mjs`.
Missing prerequisites fail the named invocation; nothing is skipped or stubbed.
Node checks the module's syntax before Cargo runs. The recipe sets
`PIJ_NATIVE_RUNTIME_MODULE` to that checkout's absolute store path,
`CARGO_TARGET_DIR` to its local `target/`, and all three worker/build caps to `4`.
Cargo runs with `--locked` and `--ignored --nocapture --test-threads=1`.
`--locked` protects the dependency lockfile, not the Rust toolchain version;
retain actual compiler/Cargo versions with proof receipts.

This is opt-in: default Rust-only tests do not require Node, and neither
`harness checks` nor `just self-check` adds this invocation. A passing contract
does not establish actual Copilot CLI attachment or real-provider inference;
those still require the live witnesses below.

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
native `config.json`'s `trustedFolders`, not `settings.json`.
Global trust and tool permissions are unchanged; this is not `--yolo` or allow-all.
`--workspace-trust prompt` omits that seed: this negative control should time out
at `Confirm folder trust` before any provider request. Compare it with the default
`--workspace-trust seeded` using separate full-driver invocations, which create
distinct fresh HOMEs. A new session in a previously approved HOME is not a valid
control: native remembered trust survives there. `verifyWorkspaceTrustDiscriminator`
checks the two receipts, the pre-launch config, exact prompt path, absent provider
activity in the negative control, and correlated ordinary native interaction in
the seeded run. Passing this startup discriminator is not full transport acceptance.

The reply step simulates a human approving **one** native extension-tool call.
Before sending Enter, it requires the active bottom modal's exact
`Run extension tool "pij_send"` title, parses that modal's own JSON arguments,
and compares the complete object with the expected isolated recipient and nonce.
It rechecks the dialog and requires `1. Yes` to be selected; session-wide approval
is never chosen. Unknown/mismatching dialogs fail without confirmation. Receipts
retain before/rechecked/after terminal evidence and the exact decision, alongside
the existing final-pane captures. This is test-human consent, not a permission
bypass or tmux message-body delivery; product policy/default grants are unchanged.

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
