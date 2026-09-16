# Plan 153 — implementation report

Source commit: f6a0e058b2fded3fd14cd28428525c0ff18c1a78

## Acceptance

- **AC1:** `pij_spawn.harness` is required (`omp|pi|claude|copilot|codex`); no caller/binary default. Explicit OMP launches `omp --auto-approve --model <provider/id> --thinking <effort>`, never `--branch`. `--bin` accepts executable paths only and refuses harness selectors/mismatches. Retired `resolvePiBin` fallback removed; the public tool refuses legacy runtime spawning because it cannot consult the machine policy.
- **AC2:** daemon `PIJ_RETIRED_HARNESSES` is parsed once into typed configuration (generic default empty); `just bounce-rs` opts this machine into `pi`. Native spawn refuses before mutation; `--allow-retired` persists `spawn.retired-harness-override` before launching. In-process spawn reads fresh daemon `/health` retirement policy before local mutation; older daemons without that field refuse with an upgrade instruction. Revive semantics intentionally unchanged.
- **AC3:** case-insensitive `pi/omp|omp/pi` search across `skills/pij/**` and `docs/how/pij-rs-api.md` returned **0 matches** after the split. Each harness has separate contract rows/columns and model examples. `readlink -f ~/.claude/skills/pij` resolved the main checkout's `skills/pij`; no deployed copy edited.
- **AC4:** OMP 18.1.22 discovered a private project's `.omp/extensions/probe/index.ts` and deduplicated its `.pi` symlink (one marker, RPC ready). Moved the actual extension to `.omp/extensions/pij`; `.pi/extensions/pij -> ../../.omp/extensions/pij`. Real OMP `whoami` reports the new real `extension_path`. Updated TypeScript/Vitest discovery, moved sibling imports, linker symlink discovery and portability sensor coverage. `detectPiRuntime` unchanged.
- **AC5:** actual OMP seat `pij-broken-lucia`, running `github-copilot/gpt-6-astra`, called the registered tool twice. OMP child `pij-liquid-tilda` registered as `omp`, matching spawn `s1789533500959-0` and parent. Pi tool call refused. Native Pi override independently bound `pij-honest-mistake`; spine event seq **7** records the exception. Exact receipts below.
- **AC6 — explicit next-plan gap:** `pij models` remains unported. Agents still cannot enumerate or distinguish the installed **per-harness model catalogs through pij**; a documented example or spelling accepted by one runtime is not availability proof in another. No model-catalog implementation added. After the home move, focused tests use `npm test -- --run .omp/extensions/pij`, not the excluded discovery symlink path.

## RED before GREEN

Full original outputs: [AC1 RED](red-ac1.txt), [AC2 RED](red-ac2.txt).

```text
AC1: npm test -- --run .pi/extensions/pij/core/spawn.test.ts .pi/extensions/pij/index.spawn-schema.test.ts
Test Files  2 failed (2)
Failed Tests 8
pij_spawn schema: expected true to be false (omitted harness was accepted)
OMP builder: Expected: "omp" / Received: "pi"
pi --bin omp: expected ok:false / Received: ok:true

AC2: cargo test -p pij-daemon http::tests::retired_harness_spawn_refuses_before_pane_or_descriptor_mutation -- --exact --nocapture
assertion `left == right` failed: {"command":"pij spawn","data":{"bound":false,"cross_session_inbound_accept":false,"dispatched":true,"extension_build":null,"extension_path":null,"folder":"/abs/tree","harness":"pi","id":"pij-retired","native_extension_delivery":false,"pane":"%100","parent":null,"proc":null,"relay":false,"role":null,"semantic_state":null,"session":null,"spawn_id":"s-173959f17cd76400a9ca73d03e86e43b","state":"idle"},"ok":true,"v":2}
left: 200
right: 400
test result: FAILED. 0 passed; 1 failed; 390 filtered out
```

AC3 initial search found collapsed harness prose; final search found none. AC4 is capability discovery rather than a failing product assertion; [actual probe](home-probe.txt) selected the move branch. AC5 exercised the resulting real runtime, not fake fixtures. AC6 is a declared non-goal, not a test claim.

## Gates

All commands ran from this worktree with `~/.cargo/bin/cargo` for Rust.

```text
cargo test --workspace                         exit 0
cargo fmt --all --check                        exit 0
cargo clippy --workspace --all-targets -- -D warnings  exit 0
Finished `dev` profile [unoptimized + debuginfo] target(s) in 20.69s

npm test (inside just self-check):
Test Files  243 passed | 4 skipped (247)
Tests       5306 passed | 22 skipped (5328)
just self-check                               exit 0
smoke: pij-team-scaffold ... ✓
smoke: pij-watchdog ... ✓
smoke: file-watch-notify ... ✓
smoke: image-see ... ✓
smoke: minih-workbench ... ✓
smoke: pi-peacock ... ✓
smoke: pij ... ✓
smoke: ralph-loop_compact-survival ... ✓
smoke: session-sql ... ✓
smoke: skill-runner ... ✓
smoke: todo ... ✓
✓ snapshot-check: briefing.md SHA matches snapshots (cdf5f5b25001...)
```

Targeted spawn regression run: **208 passed**; linker/moved watch imports: **64 passed**. A later full run also hit one native Copilot process-observation refusal in an unchanged inbox integration test ([receipt](registration-gate-note.txt)); no registration/receiver code or test was altered. Initial boot hit a smoke deadline; the full completion gate later passed every scenario. Rust's first full compile exposed a missing test-module import; fixed before the successful workspace/fmt/clippy run.

**Report-only existing findings, not silently waived:** package audit flags `git:github.com/ghoseb/pi-askuserquestion` aggregate fail (4 fail / 13 warn), including critical Vitest and high undici/nanoid findings and non-allowlisted lockfile hosts. No package modified. Biome reports schema-version info (2.0.0 config / 2.4.14 CLI). Initial plan commit `bddccbe4cc16fc77df9de41bd7a7cad59ac7b946` lacks `Pij-Prime`; not rewritten. New commits use live C11-derived trailers.

## Live envelopes

Private daemon: `127.0.0.1:55076`, separate state/HOME/Claude/XDG directories and tmux socket `pij153-9fgk8o_r`; `offline:false`. No production bounce, source mutation, push, PR or merge. Native Pi was launched from a private non-worktree cwd because the existing linked-worktree refusal correctly remains in force.

### Actual model-facing tool calls

```json
{
  "PIJ_SESSION_ID": "pij-broken-lucia",
  "calls": [
    {
      "tool": "pij_spawn",
      "arguments": {
        "harness": "omp",
        "model": "github-copilot/gpt-6-astra"
      },
      "result": "spawned pij worker — spawnId=s1789533500959-0 paneId=%5"
    },
    {
      "tool": "pij_spawn",
      "arguments": {
        "harness": "pi"
      },
      "error": "pij_spawn failed (E-ARG): harness pi is retired on this machine; use omp (or pass --allow-retired)"
    }
  ]
}
```

### Tool-spawned child identity

```json
{"ok":true,"command":"pij whoami","v":2,"data":{"id":"pij-liquid-tilda","harness":"omp","session":"01a0a882-3ae3-7450-98e5-1719711b9a93","extension_build":"bddccbe4cc+dirty","extension_path":"/Users/jordanknight/pi-hacking/fs3-omp-first-class/.omp/extensions/pij","pane":"%5","proc":{"pid":76292,"proc_start":20260916143820},"folder":"/private/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-153-live-9fgk8o_r","state":"idle","semantic_state":null,"role":null,"parent":"pij-broken-lucia","relay":false,"native_extension_delivery":false,"spawn_id":"s1789533500959-0","model":"github-copilot/gpt-6-astra","provider":"github-copilot"}}
```

### Native policy refusal

```json
{"ok":false,"command":"pij spawn","v":2,"meta":"harness pi is retired on this machine; use omp (or pass --allow-retired)","error":"refused"}
```

### Native explicit override

```json
{"ok":true,"command":"pij spawn","v":2,"data":{"id":"pij-honest-mistake","harness":"pi","session":"01a0a880-aafc-790b-84fe-673645400e93","extension_build":"bddccbe4cc+dirty","extension_path":"/Users/jordanknight/pi-hacking/fs3-omp-first-class/.omp/extensions/pij","pane":"%3","proc":{"pid":98156,"proc_start":20260916143639},"folder":"/private/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-153-live-9fgk8o_r","state":"idle","semantic_state":null,"role":null,"parent":"","relay":false,"cross_session_inbound_accept":false,"native_extension_delivery":false,"spawn_id":"s-ef1bf759243061c552e4e4137fae65bc","model":"openrouter/moonshotai/kimi-k2.6","dispatched":true,"bound":true,"pid":98156}}
```

### Audited exception

```json
{"at":1789533399061,"kind":"spawn.retired-harness-override","payload":"{\"allow_retired\":true,\"harness\":\"pi\",\"spawn_id\":\"s-ef1bf759243061c552e4e4137fae65bc\"}","seat":"pij-honest-mistake","seq":7,"v":1}
```

[Full event envelope](live-pi-events.json), [health](live-health.json), [bin selector refusal](live-bin-refusal.json).

## Convergence and harness closeout

Plans 151/152: receiver/inbox/heartbeat/delivery code unchanged. `adapters/rust-runtime.ts` has **one changed hunk: `spawn()`**, now async, checking health and selecting local versus native daemon launch. Exact zero-context hunk: `@@ -368 +368,30 @@ export class RustRuntimeSession {`. `index.ts` changes are confined to the `pij_spawn` registration/comment/schema/execute block; hunks: `@@ -263,2 +263 @@ export default function (pi: ExtensionAPI): void {`, `@@ -269 +268 @@ export default function (pi: ExtensionAPI): void {`, `@@ -272 +271 @@ export default function (pi: ExtensionAPI): void {`, `@@ -274,0 +274,10 @@ export default function (pi: ExtensionAPI): void {`, `@@ -301 +310,6 @@ export default function (pi: ExtensionAPI): void {`. `index.test.ts` adds only the legacy-spawn policy regression and its tmux import. `crates/daemon/src/http/registration.rs` untouched. `revive.rs` only adds the new request field with `false`. The directory move preserves all otherwise unchanged source bytes; the parent must account for these renames when converging 151/152.

Encoded harness improvements: the tool schema makes an omitted harness invalid; regression cases defend OMP executable/effort selection and pre-mutation retirement; linker coverage defends the project-home symlink; portability sensor and test discovery explicitly cover `.omp/extensions`.

Best remaining improvement to offer: a reusable **isolated native harness probe** that provisions private HOME/onboarding, tmux, daemon and credential-safe runtime state and captures actual tool + binding receipts. The attempted nested-import wrapper did not load even after relocation; direct native loading and a real model tool call supplied the proof instead. No wrapper simulation is claimed as AC5 evidence.

Owned probe processes were stopped and private HOME/credential copies plus throwaway scripts deleted. Harness observations are retained at `.harness/temp/agent/session-buffer.md` for prime-owned governance harvest; no worker-written governance ledger or flow state. Retirement event means an admitted override, not guaranteed later registration; the live proof separately observed binding.

## Fix round

Accepted rulings in `packet-fix.md`; baseline `00f04769`. No production daemon bounce or runtime mutation. This section supersedes the original omission of retirement auditing from revive; permission to revive an existing seat stays unchanged.

### F1 — restore the dirty-source brake

**RED:** the new canonical-source case ran the actual shell script with pathspec-aware Git and isolated Pij/tmux fixtures. Before the source fix, dirty `.omp/extensions/pij/core/spawn.ts` reached the bounce:

```text
npm test -- --run harness/scripts/bounce-daemon.test.ts
1 failed, 3 passed
expected [ 'fetch', 'report', 'stop', 'start' ] to deeply equal [ 'fetch' ]
```

**GREEN:** `bounce-daemon.sh` now scans `.omp/extensions/pij` **and** `.pi/extensions/pij`; the latter protects the discovery symlink itself. The same four tests passed: both dirty paths refuse before stop/start; clean source still bounces. This is a **one-directional brake, not a policy**: removing it can only permit more bounces. The fixture now respects requested pathspecs rather than returning dirt regardless of what Git was asked to inspect.

### F2 — split emitted harness guidance and extend the prose sweep

**RED:** `generation-routing.ts` emitted the combined `pi/omp` label through `cli.ts`'s `renderRsAnswer`/`writeOutput` path. The dead `parseAdoptArgs` string and five other non-test comment occurrences were also outside the original prose-only sweep.

**GREEN:** the shared renderer names the actual harness. `cli.ts` needs no duplicate branch: its existing call consumes the corrected renderer. Actual public CLI output, observed against the private Rust-daemon integration fixture:

```json
{"harness":"pi","stdout":"Pi seats self-register at boot; you are already reachable — run `pij whoami` to confirm, never adopt\n","stderr":""}
{"harness":"omp","stdout":"OMP seats self-register at boot; you are already reachable — run `pij whoami` to confirm, never adopt\n","stderr":""}
```

`npm test -- --run .omp/extensions/pij/cli.inbox.integration.test.ts -t self-registered`: **2 passed, 15 filtered/skipped**. The test retains identity/no-extra-seat assertions rather than pinning exact prose; temporary stdout collection was removed after capture. `parseAdoptArgs` remains dead library, not claimed as a live surface.

Expanded built-in grep receipt (case-insensitive):

```text
pattern: pi/omp|omp/pi
scope: skills/pij/** + docs/how/pij-rs-api.md
       + every .omp/extensions/pij/**/*.ts except *.test.ts
inventory: 335 TypeScript files, 156 non-test files; untruncated enumeration
No matches found — 0
```

The additional edits in `core/archive.ts`, `adapters/fs-registry.ts`, and `core/daemon/pane-signals.ts` are comments only; no receiver, delivery, heartbeat, or registration behavior changed.

### F3 — audit explicit revival of a retired harness

**RED:** new `revive_retired_harness_succeeds_and_audits_override` passed the successful-revival assertions but failed the real-spine audit assertion:

```text
cargo test -p pij-daemon --test revive_http revive_retired_harness_succeeds_and_audits_override -- --exact --nocapture
assertion `left == right` failed: retired revival must be audited
  left: 0
 right: 1
1 failed; exit 101
```

**GREEN:** `revive.rs` supplies `allow_retired: true` to the existing launch path because revival is an explicit operator act. The same test passes, asserting successful retired-Pi revival, exactly one matching override event, and audit sequence before launch publication. This is private-loopback HTTP with a real SQLite registry/spine and injected fake tmux/liveness, not a claim of a live Pi process. Captured persisted event:

```json
{"v":1,"at":1789535516487,"kind":"spawn.retired-harness-override","seat":"pij-child","payload":"{\"allow_retired\":true,\"harness\":\"pi\",\"spawn_id\":\"s-048442af893e3a49247efb690a161572\"}"}
```

Temporary event printing was removed after capture. Ordinary spawn retirement refusal and the persist-before-launch audit failure brake are unchanged.

### F4 — correct the identity comments

**RED:** `types.ts` said Pi and OMP both persisted `harness: "pi"`; `state.ts` failed to distinguish its legacy TypeScript projection from Rust registry identity.

**GREEN:** both comments now state the actual boundary: Rust registration uses `input.runtimeBin` as distinct `pi` or `omp`; the TypeScript transport projection retains `pi` and carries the executable in `runtimeBin`. Comment-only correction; no identity logic changed.

### F5 — delete the unread environment variable

**RED:** `PIJ_PI_BIN` had two source writes, no readers, and stale test assertions.

**GREEN:** both writes and the unsupported provenance comment are gone; the now-unused private `piEnv` runtime argument and both callers are updated. Removed the field-copy-only spawn test, retained actual executable/argv and rendered-shell command coverage. Spawn/revive suites: **211 passed**.

```text
built-in grep PIJ_PI_BIN .omp/extensions/pij (source and tests; hidden paths included)
No matches found — 0
```

### Re-run gates and handoff

All commands below exited **0**, after removing temporary receipt output and running `just format` and `cargo fmt --all`. Rust commands used `/Users/jordanknight/.cargo/bin/cargo`.

| Gate | Result |
|---|---|
| `cargo test --workspace --no-fail-fast -- --test-threads=1` | Passed |
| `cargo fmt --all --check` | Passed |
| `cargo clippy --workspace --all-targets -- -D warnings` | Passed |
| `npm test -- --run .omp/extensions/pij` | 177 files passed, 2 skipped; **4371 tests passed, 14 skipped** |
| `just self-check` | 243 files passed, 4 skipped; **5306 tests passed, 22 skipped**; all **11 smokes passed** |

Closing snapshot receipt: `✓ snapshot-check: briefing.md SHA matches snapshots (cdf5f5b25001...)`.

Existing advisories remain: Biome schema 2.0.0 versus CLI 2.4.14; report-only package audit flags `git:github.com/ghoseb/pi-askuserquestion` (aggregate fail, 4 fail/13 warn); C11 warns about missing `Pij-Prime` in historical commits `7bec9160`, `8dd9a115`, and `bddccbe4`. No package changes or history rewrites.

Encoded improvement: F1's pathspec-aware brake fixture now fails on the exact source-home regression the old fake hid. Observation `DL-003` is retained in `.harness/temp/agent/session-buffer.md` for prime-owned harvest. No deployed skills, main-checkout dependencies, or plan-151/152 runtime logic were changed. No push, PR, or merge.

## Follow-up: self-check selector

Baseline `eb9d00c3995f79aefb30102f570175a459f4d83b`, branch `153-followup-selfcheck-selector`. This corrects the earlier self-check proof claim: its exit was zero, but the Windows focused stage ran no files. The full-suite count did not establish that this separate stage exercised anything.

### RED — actual current stage

Before source changes, `just windows-compat` exited **0** with:

```text
=== windows-compat: focused-tests ===
> vitest run .pi/extensions/pij/adapters/channel.test.ts .pi/extensions/pij/adapters/fakes.test.ts .pi/extensions/pij/adapters/fs-registry.test.ts .pi/extensions/pij/cli.inbox.integration.test.ts
No test files found, exiting with code 0
filter: .pi/extensions/pij/adapters/channel.test.ts, .pi/extensions/pij/adapters/fakes.test.ts, .pi/extensions/pij/adapters/fs-registry.test.ts, .pi/extensions/pij/cli.inbox.integration.test.ts
include: .omp/extensions/**/*.test.ts, .pi/extensions/**/*.test.ts, harness/**/*.test.ts, skills/**/*.test.ts
exclude:  node_modules, .pi/extensions/pij/**, .pi/git, .pi/npm
windows-compat: all portable stages passed.
```

The project-wide `passWithNoTests: true` laundered the excluded discovery-symlink selectors into success. The focused stage now passes Vitest's native `--passWithNoTests=false`; no output parser or duplicated test discovery. The global setting is unchanged.

### Selector inventory and changes

Searched `justfile`, `harness/scripts`, and then `harness/driver` for both `.pi/extensions/pij` and `.omp/extensions/pij`, including paths assembled from separate string components.

| File | Change |
|---|---|
| `harness/scripts/windows-compat.ts` | Four focused test selectors now use `.omp/extensions/pij`; explicit fail-on-empty flag. |
| `harness/scripts/pane-signals-smoke.ts` | Five source imports use the canonical home. |
| `harness/scripts/pij-cli.cjs` | Executable CLI source selection uses `.omp`. |
| `harness/scripts/step-on-probe.ts` | OMP's explicit `-e` entrypoint uses `.omp`. |
| `harness/driver/governance-fixture.ts` | Public CLI fixture selects the canonical source. |
| `harness/driver/governance-external.ts` | External host selects the canonical CLI URL. |
| `harness/driver/tmux.ts` | Shared tmux primitive import uses the canonical home. |
| `harness/scripts/windows-compat.test.ts` | New regression executes the actual stage and Vitest in an empty temporary project. |

`justfile` contained no literal Pij source selector and is unchanged. Remaining `.pi` references are intentional: the legacy bounce invocation parser, the **additional discovery-symlink dirty brake**, linker/discovery and portability fixtures, and the stale-install regression fixture. Removing the symlink brake would undo F1; it remains alongside `.omp`, not instead of it.

### Fail-on-empty regression and GREEN

`npm test -- --run harness/scripts/windows-compat.test.ts` before the flag:

```text
FAIL fails the focused stage when no files match despite project passWithNoTests
AssertionError: expected +0 to be 1
Test Files  1 failed (1)
exit 1
```

The same test after the flag: **1 file / 1 test passed**. It skips unrelated static stages through a fixture npm launcher, runs real Vitest with `passWithNoTests: true` in the temporary project, and requires both the no-files diagnostic and focused-stage **exit 1**. Temporary projects are removed in `afterEach`.

The first corrected `just windows-compat` run exited **0**, selecting actual files:

```text
=== windows-compat: focused-tests ===
> vitest run --passWithNoTests=false .omp/extensions/pij/adapters/channel.test.ts .omp/extensions/pij/adapters/fakes.test.ts .omp/extensions/pij/adapters/fs-registry.test.ts .omp/extensions/pij/cli.inbox.integration.test.ts
Test Files  3 passed | 1 skipped (4)
     Tests  67 passed | 19 skipped (86)
windows-compat: all portable stages passed.
```

This first run was **cold**, not the requested warm proof: the new worktree had no Rust binary, so all 17 private-daemon inbox tests skipped. Dependencies were linked with `just worktree-deps` (358 links); the warm gate builds this worktree's own `target/debug/pij-rs` and sets `PIJ_RS_BIN_REQUIRED=1` to prevent silently skipping the inbox suite.

### Warm self-check

Built with `/Users/jordanknight/.cargo/bin/cargo build -p pij-cli --bin pij-rs`, using the private worktree target directory. `just self-check` ran with `CARGO_TARGET_DIR` set to that directory and `PIJ_RS_BIN_REQUIRED=1`.

Actual warm-stage receipt from the first full gate:

```text
=== windows-compat: focused-tests ===
> vitest run --passWithNoTests=false .omp/extensions/pij/adapters/channel.test.ts .omp/extensions/pij/adapters/fakes.test.ts .omp/extensions/pij/adapters/fs-registry.test.ts .omp/extensions/pij/cli.inbox.integration.test.ts
✓ .omp/extensions/pij/adapters/fakes.test.ts (14 tests)
✓ .omp/extensions/pij/adapters/channel.test.ts (14 tests | 1 skipped)
✓ .omp/extensions/pij/adapters/fs-registry.test.ts (41 tests | 1 skipped)
✓ .omp/extensions/pij/cli.inbox.integration.test.ts (17 tests)
Test Files  4 passed (4)
     Tests  84 passed | 2 skipped (86)
windows-compat: all portable stages passed.
```

That first full gate nevertheless exited **1** in the later smoke stage:

```text
smoke: file-watch-notify ... ✗
"kind": "idle-timeout"
"message": "waitIdle timed out after 30000ms"
last output: Cloning into '<worktree>/.pi/git/github.com/ghoseb/pi-askuserquestion'...
error: Recipe `self-check` failed on line 225 with exit code 1
```

The other ten smokes passed. The subsequent gate reuses the first-boot package cache; no timeout increase, assertion weakening, registration change, or production daemon restart.

**Final warm `just self-check`: exit 0.** The requested Windows-focused excerpt from that successful gate:

```text
=== windows-compat: focused-tests ===
Test Files  4 passed (4)
     Tests  84 passed | 2 skipped (86)
windows-compat: all portable stages passed.
```

The successful full gate also reported:

```text
Test Files  244 passed | 4 skipped (248)
     Tests  5307 passed | 22 skipped (5329)
smoke: file-watch-notify ... ✓
✓ snapshot-check: briefing.md SHA matches snapshots (cdf5f5b25001...)
```

All **11 smokes passed**. Existing package audit findings remain report-only: `git:github.com/ghoseb/pi-askuserquestion`, 4 fail/13 warn; the Biome schema-version information is unchanged. `node harness/scripts/pij-cli.cjs --help` also exited **0**, exercising the canonical public CLI entrypoint. This is local macOS execution of the portable Windows lane, not a claim of native Windows execution.

The encoded improvement is the fail-on-empty stage plus a real-runner negative regression, not another reminder to inspect logs. Observations `DL-001` and `DL-002` are retained in `.harness/temp/agent/session-buffer.md` for prime-owned harvest. No production daemon mutation, deployed-skill changes, push, PR, or merge.
