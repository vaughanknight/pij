# Plan 150 — implementation and proof

**Implementation SHA:** `7ccf0e581fb64fafeaac5f5a0289c8493e7490a1`  
**Baseline SHA:** `71a062b22bfd973dc1419dfd9da389b32c84f4f8`  
**Round-two status:** H1/H2 and regression gaps are fixed; all required pre-rebase gates pass. AC6 remains **provisional**, not complete: the reviewer could not reproduce the isolated smoke before the plan-149 identity fix. Prime owns the rebase; this handoff is **READY-FOR-REBASE**, not DONE or approval to ship. No production restart, global linking, push, PR or merge occurred.

## Implementation

- **AC1:** `session.getEvents()` has no cursor, but the installed SDK exposes `session.rpc.eventLog.tail()` and `.read({cursor,max,includeEphemeral:false})` in `generated/rpc.d.ts:6492–6565,24265–24279`. New deliveries snapshot only a tail cursor; missing-callback recovery consumes at most 128 durable events per page. Production code no longer calls `getEvents()`.
- **AC2:** Discard recovery advances the same cursor after queue/processing snapshots. Old recovery pages never authorize fresh-boundary reinjection. Expired/malformed pages hold without ACK or resend. Boundaries retain one scalar, not a session-sized set.
- **AC3:** Observation races use removable waiters and page-read promises that resolve without retaining bodies. The original shared pending-consumption promise retained each full-history race result. Accepted journal recovery pages forward without buffering historical bodies.
- **AC4:** Consumption/completion correlation, immediate steering, consent Hold, receipt grades, durable acceptance and duplicate suppression remain intact. Test SDK seams now expose the real cursor contract; two fixtures previously exposing consumption before `send` now expose it after send.
- **AC5:** Receiver presence has the existing claim-lease duration, renewed through the existing heartbeat endpoint independently of host Working/completion/Hold. Deadline wakes use the existing delivery scheduler. Expiry durably parks bodies and refuses later native sends with the receiver named.
- **AC7 correction:** The original claim here—"explicit pull can recover only receiver-unavailable parked bodies"—was false at `10e255da`: a live receiver's pending mail could fall through to an ordinary manual claim and starve its extension. Round two gates manual admission under the same lock as native claims/heartbeats. A live, matching receiver lease returns a retryable refusal with remaining milliseconds, without claim/park, even under Hold. An expired or absent lease permits explicit recovery after Hold clears: pending/running native bodies are first parked, then only receiver-unavailable rows are restored. Job/message identity and history survive; manual reads never renew receiver presence. The existing pane/session identity ladder and strict paneless tuple remain unchanged.

## RED evidence against original source

New behavioral tests were run against the baseline source in temporary workspaces, not merely asserted to fail. Full outputs: [memory](red-memory.txt), [receiver lease](red-native-lease.txt), [HTTP manual pull](red-manual-inbox.txt), [shipped CLI](red-cli-inbox.txt).

### AC1–AC3: constrained Node heap

The same regression runs 20,000 realistic events / **74,415,558 serialized bytes**, 50 native deliveries (49 consumed/ACKed; one accepted while awaiting consumption), and repeated observation polls. Child Node uses `--expose-gc --max-old-space-size=512`; every sample follows `global.gc()`.

```text
node --test memory.test.mjs   # identical regression + original store.mjs
baseline heap: 5,152,464 bytes
poll 1: heap 80,935,984; growth 75,783,520; full reads 51
poll 2: heap 157,191,984; growth 152,039,520; full reads 52
poll 3: heap 233,467,360; growth 228,314,896; full reads 53
poll 4: heap 309,718,424; growth 304,565,960; full reads 54
poll 5: heap 385,960,584; growth 380,808,120; full reads 55
poll 6: heap 462,202,960; growth 457,050,496; full reads 56
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
child SIGABRT; parent test exit 1
```

### AC5: receiver death hidden by a live host

```text
cargo test -p pij-daemon --lib native_receiver_ -- --nocapture
native_receiver_expiry_parks_pending_and_running_mail_despite_live_host FAILED:
a live Copilot host cannot hide an expired receiver:
Queued { reason: Some("extension-stream"), next_retry_at: Some(0), draft_sha: None }

native_receiver_heartbeat_http_is_identity_bound_and_independent_of_hold FAILED:
pre-fix endpoint cannot decode the new receiver-heartbeat request
2 failed; exit 101
```

### AC7: pane-native manual pull refused

```text
cargo test -p pij-daemon --lib native_cli_pane_session_claims_and_acks_without_self_reported_host_tuple -- --nocapture
HTTP 400 instead of 200:
{"command":"pij inbox","error":"refused","meta":"daemon/native-inbox: native incarnation mismatch: native_session, pid and proc_start must match the current Copilot seat","ok":false,"v":2}
FAILED; exit 101

cargo test -p pij-cli --test spawn shipped_cli_native_inbox_uses_pane_session_ladder_and_acknowledges -- --nocapture
manual native inbox: {"ok":false,"command":"pij inbox","v":2,"meta":"daemon/native-inbox: native incarnation mismatch: native_session, pid and proc_start must match the current Copilot seat","error":"refused"}
FAILED; exit 101
```

AC4 is a preservation criterion, not a defect expected to fail on the baseline; every existing native contract remains green.

## Original implementation GREEN gates

| Command | Observed result |
|---|---|
| `just copilot-native-test` | Exit 0; original run: 176 tests, 173 passed, 3 Linux-only skips. The retained [40-line tail](native-tests.txt) now records round-two results below. |
| `~/.cargo/bin/cargo test --workspace` | Exit 0; 1,084 passed across 85 suites, 8 ignored, 93 filtered. Redundant full log removed per review. |
| `just copilot-native-contract-test` | Exit 0; actual JS chooser/client/bridge/journal + HTTP/SQLite, changed-host cold resume, one simulated native acceptance, zero reinjection. [Output](cold-resume-contract.txt). |
| `cargo fmt --all -- --check` | Exit 0. |
| `cargo clippy --workspace --all-targets -- -D warnings` | Exit 0. |
| Bare `node_modules/.bin/biome check`, followed directly by `$?` | `BIOME_EXIT=0`; 542 files, no errors/warnings. One pre-existing informational schema-version notice. [Output](biome-check.txt). |
| `just self-check` | Exit 0; 5,306 Vitest passes / 22 skips, native contracts, Windows portability checks, every smoke scenario, report-only package audit, snapshot check and attribution scan. Redundant full log removed; salient tail retained below. |

The same heap case completed **50 observation polls** with **zero full-history reads**. Baseline heap 5,157,840 bytes; peak growth **587,816 bytes**; final growth 421,808 bytes. Asserted bound: **32 MiB**.

Final composite tail:

```text
REVIEW (report-only, not blocking): 1/4 entry flagged — aggregate fail
snapshot-check: briefing.md SHA matches snapshots (cdf5f5b25001...)
pij-commit-trailers: warn — 0 missing across 2 harness commit(s) since merge-base with main
```

**Existing audit risk, not hidden by the passing gate:** `git:github.com/ghoseb/pi-askuserquestion` reported **4 fail / 13 warn** findings, including critical Vitest-related and high undici/nanoid advisories. Repository policy is report-and-continue. No manifest/package changes were made. The attribution scan's applicability warnings concern the two pre-existing plan commits; new implementation/evidence commits use freshly derived C11 trailers.

## AC6: provisional isolated native proof

The original run passed with official Copilot launcher + pinned **1.0.84-8** runtime, the worktree extension and real Rust daemon. The independent reviewer subsequently failed **3/3** clean-tree attempts (`-7` once, `-8` twice) at `--resume must preserve Pij address after proven owner death`, before memory measurement. This is a plan-149 identity dependency, not reproducible AC6 acceptance on the current base. Retain the compact original evidence as historical only; re-run after prime's authorized rebase.

Only model inference used the deterministic local fixture. This was real host/SDK/extension/daemon execution, not production deployment or real-provider inference. Production is a **mixed 1.0.84-7/-8 fleet**. The reviewer compared both installed SDK contracts: `eventLog.tail/read`, cursor status and paging fields are identical; `-8` clarifies byte-budget-short pages with `hasMore:true`. The implementation continues on `hasMore`, never page length, so AC1–AC3 apply to both. An oversized single event with a nonadvancing cursor safely holds receiving; it cannot authorize ACK/reinjection.

```sh
node_modules/.bin/tsx harness/scripts/copilot-native-memory-smoke.ts \
  --copilot-bin /Users/jordanknight/.local/bin/copilot \
  --copilot-runtime-dir /Users/jordanknight/.copilot/pkg/darwin-arm64/1.0.84-8 \
  --message-interval-seconds 1
```

Canonical reusable entry: `just copilot-native-memory-smoke` with the same flags.

Isolation: **127.0.0.1:58288**, private HOME/Copilot/Claude/state directories, dedicated **`tmux -L ac6-8ffb0aac-1fe`**. Seeded history: **20,010 events / 84,024,826 bytes**. Its full prefix hash remained unchanged after **30** native-consumed, model-completed, daemon-ACKed deliveries.

Extension PID **78961**, host PID **78599**:

| Elapsed ms | Completed messages | Extension RSS KiB | RSS MiB |
|---:|---:|---:|---:|
| 3 | 0 | 113152 | 110.500 |
| 10009 | 10 | 116224 | 113.500 |
| 20026 | 20 | 117120 | 114.375 |
| 30011 | 30 | 118800 | 116.016 |
| 30665 | 30 | 118800 | 116.016 |

The driver then issued **SIGKILL only to extension 78961**, revalidating PID, start stamp, command and ancestry. These checks are **brakes**, not retention policy: removing them could only permit more termination. Host 78599 stayed alive.

- Pending **job 31**, message `4f55fd17-4d00-4a83-bf04-4e94efc45d3c`, parked **59,023 ms** after the kill, within the unchanged **60,000 ms** receiver lease.
- Sender-addressed `delivery.parked` sequence **134** named recipient `pij-whispering-tick`, reason `native-extension-unavailable`, outcome `undelivered:native-receiver-unavailable`.
- The next actual CLI send returned **RPC `ok:true`, exit 0, but delivery `outcome:"refused"`**, not `queued/extension-stream`. Its reason was `native-extension-unavailable: native receiver for pij-whispering-tick has not renewed its lease`.
- After clearing the explicit test Hold, Copilot's actual `!` shell surface ran `pij-rs inbox --json` with its real **pane %2** and session `97d375f2-c6b5-4c15-9c5f-58a31fc8f000`. It returned the same pending message. **Job 31** became `done` with exactly one `reader-read` acknowledgement. No extension was revived or reinjected.

[Compact historical evidence](evidence/ac6-2026-09-15T07-03-27.574Z-d03e021a/summary.json) · [RSS CSV](evidence/ac6-2026-09-15T07-03-27.574Z-d03e021a/rss.csv) · [actual manual inbox output](evidence/ac6-2026-09-15T07-03-27.574Z-d03e021a/emergency-inbox.json). The 3,149-line receipt, repeated delivery timeline/native events, full workspace log and full self-check log were removed per review; the 169-line summary preserves their decision-bearing live facts.

Owned tmux/daemon/provider processes stopped. Successful private runtime/history remains locally available and Git-ignored. Failed private runs and temporary baseline workspaces were removed.

## Round-two safety decisions

- **Dead window:** After extension death, already-claimed mail remains unreachable until its remaining receiver lease expires (up to 60 seconds by default). Previously this looked like an empty successful inbox. The new HTTP 409 refusal carries `details:{code:"native-receiver-lease-live",retryable:true,expires_in_ms}` and a reason naming the lease/time. The stable API and native-extension guide document the wait.
- **No `--take-over`:** Revoking only the timer is unsafe: the old extension knows the same tuple, can renew it, and may already have accepted a body without visible consumption. Safe takeover needs fenced receiver generations across registration, heartbeat, claim and ACK plus an explicit ambiguous-acceptance protocol. That is not a small, testable extension of this fix; the expiry gate avoids introducing another delivery policy.
- **Trust model:** Heartbeats attest tuple knowledge under the machine bearer, not process possession. The same authenticated authority already permits native claims; a code comment now makes this existing boundary explicit.
- **Existing flake:** Review F009 observed `native_tests.rs:404` failing once in four workspace runs, while three isolated daemon runs passed 375/375. Captured as harness observation DL-003 with the missed lease/vocabulary proofs; no unrelated test was weakened.

## Round-two proof and consumer audit

Compact executable-command evidence: [round2-proof.json](round2-proof.json). **24 mutation runs all failed**, then every restored behavioral check passed. Mutations were temporary and restored before gates:

- **H1:** Deleting the live-lease admission block made the reviewer-derived test return an actual claim for `extension owns this` instead of a refusal (exit 101). Restored service/HTTP tests pass **3/3**: live lease → no claim/park, extension still receives; running claim at quarter-lease intervals → remaining-time refusal; exact expiry → same job/message recovered once. HTTP 409 exposes `retryable:true` and `expires_in_ms`. The workspace's shipped-CLI test launches the binary and verifies refusal details survive the client envelope and do not consume pending mail.
- **H2:** Removing the TS vocabulary entry fails both exact Rust/TS vocabulary equality and the outbound warning test (exit 1); deleting the Rust declaration instead also fails equality. Pi/OMP receives exactly one warning per parked message without clearing unrelated inbound mail. Deleting the CLI human reason suffix fails its visibility check. Restored sender suites: **146/146**.
- **Heartbeat:** Twelve deletion variants cover invalid state/duration/renewal, renewal at expiry, episode coalescing, exponential backoff and ceiling, resetting both backoff and episode after recovery, late-response stop, receive-held teardown, and independent busy/Hold renewal. Busy and Hold each drive **60 renewal ticks / 20 simulated minutes**, with 61 successful requests.
- **Cursor:** Six guard deletions each fail behaviorally: non-array events, >128 events, non-string cursor, nonboolean `hasMore`, expired status and nonadvancing cursor. Malformed pages cannot ACK, reinject or rewind. Deleting the `hasMore` continuation stops replay at page one and fails the replay test.
- **Paged heap:** Accepted-journal recovery serves **74,395,557 bytes / 20,000 historical events** through the real page-shaped seam: **158 reads, 317 forced-GC samples**, one ACK, zero sends/full reads; peak retained growth **1,795,768 bytes**. Artificially retaining page arrays until the final page fails the 32 MiB bound at **77,666,120 bytes** growth even though final heap falls to 5,949,056 bytes. This proves peak paging retention, not just absence of `getEvents`.

Sender audit: Pi/OMP's `rust-runtime.ts` closed vocabulary is fixed and equality-pinned to Rust `DeliveryFailure`. Claude's session hook only pings/adopts; it has no parked-outcome classifier. Copilot's native send tool returns the full receipt; it has no closed outcome list. Neither had an asynchronous parked-event subscriber to extend, so no new such capability is claimed. The Rust CLI preserves receipt/stream payloads; the TS CLI human renderer now includes nested refusal reasons.

An actual TS CLI process was also launched against a private HTTP fixture on **127.0.0.1:52982** (not a live-daemon delivery claim). It requested only `/health` and `/v1/shim/send`, exited 0, and printed:

```text
sent (rs) — msg isolated-refused-message — receipt refused — native-extension-unavailable: native receiver for pij-copilot has not renewed its lease
```

### Required round-two gates

| Command | Fresh result |
|---|---|
| `just copilot-native-test` → `node --test .copilot/extensions/pij/*.test.mjs` | Exit 0; **192 tests, 189 passed, 3 Linux-only skips**, zero failures/cancellations; constrained child includes both memory cases. |
| `cargo test --workspace` | Exit 0; **1,085 passed across 85 suites**, 8 ignored. Actual native CLI recovery/refusal test passed. No F009 flake observed in this run. |
| `cargo fmt --all -- --check` | Exit 0. |
| `cargo clippy --workspace --all-targets -- -D warnings` | Exit 0. |
| Bare `node_modules/.bin/biome check; status=$?` | **BIOME_EXIT=0**; 542 files checked, one existing schema-version info notice. |
| `just self-check` | Exit 0; **5,308 Vitest passes / 22 skips**, native suite, 84 Windows-compat passes / 2 skips, every smoke scenario, package audit and snapshots. |

```text
REVIEW (report-only, not blocking): 1/4 entry flagged — aggregate fail
snapshot-check: briefing.md SHA matches snapshots (cdf5f5b25001...)
pij-commit-trailers: warn — 0 missing across 4 harness commit(s) since merge-base with main
```

Initial round-two `harness boot` passed worktree-deps/typecheck but its smoke failed; the subsequent full required self-check passed every smoke. No gate was waived. The report-only third-party audit risk remains as described above. Raw full gate logs were not re-added.

## Harness lessons and handoff

- `harness boot` found missing worktree tooling; `just worktree-deps` created 358 local links without modifying main's dependencies.
- Current native support is proved by actual registration, not `--help` substring presence. The old official launcher otherwise selects an obsolete embedded runtime under isolated HOME. The proof copies only explicit runtime code, excludes in-use locks, pins its version, and copies no authentication/global configuration.
- Current extension processes use generic bootstrap argv; `EXTENSION_PATH` identifies their module. The probe reads only owned descendants and never records environment dumps.
- Cold Pi package installation caused the first smoke timeout; warmed smoke passed. A shortened PATH temporarily hid PowerShell; the passing full gate used the inherited toolchain.
- Captured observations DL-001, CONF-001 and DL-002 were read back for handoff. The permanent constrained-heap regression and isolated memory/death/manual-pull recipe encode the main lessons.
- Round-two review gaps are now executable backpressure: the live-lease admission regression and Rust/TS vocabulary equality prevent the false "parked only" claim and dropped sender warning from silently recurring; per-page forced GC detects transient replay retention that end-only samples miss.

Deploy the composed daemon and native extension together through the operator-owned lifecycle. Existing parked bodies remain recoverable by explicit manual pull; they are not silently replayed by a restarted extension. Plan 149's identity-selection region was not edited.
