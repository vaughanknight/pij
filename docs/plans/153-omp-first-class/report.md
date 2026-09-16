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
