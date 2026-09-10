# pij-rs API and governance contracts

This is the stable consumer reference and refusal ledger for the Rust cutover. `pij` serves an explicitly routed rs operation or refuses; it never silently runs the TypeScript daemon. `PIJ_DAEMON_GENERATION=legacy` is not an escape. Missing credentials, an absent daemon, unknown verbs/leaves and unsupported flags do not authorize another store. `pij sessions` reads rs rows only, never a cross-generation union.

## Evidence and wire format

Canonical fixtures, **not new live captures**:

- [`governance-routes.json`](../../crates/testkit/fixtures/golden/api/governance-routes.json): request/response cases, refusal cases, isolation contract and deterministic fixture values.
- [`governance-events.json`](../../crates/testkit/fixtures/golden/api/governance-events.json): Hello, exact frames, decoded payloads and ordering invariants.
- [`error-envelopes.json`](../../crates/testkit/fixtures/golden/api/error-envelopes.json): shared complete v2 error examples, including `not_found` and `cursor_reset`; snake_case is the runtime wire contract.

Historical plan copies remain receipts, not runtime schema dependencies. Fixture timestamps, seat ids, paths and sequences are examples, not evidence of a deployment. PM owns isolated runtime captures and composition validation; production and chainglass acceptance remain prime-owned. The existing plan-root `impl-guide.dd.json` stays where it is; this cutover does not move it.

Executed client captures live separately in [`governance-client-parity.json`](../../crates/testkit/fixtures/golden/api/governance-client-parity.json): 29 mutation and 9 refusal pairs against identical scripted responses, 18 same-daemon CLI pairs, 4 live HTTP/shim pairs, and 6 error-policy pairs. Each record retains original stdout, comparison method, and binary/source hashes. Scripted mutation responses prove the client boundary; separate real workflow and OMP canary receipts prove domain effects. Native-only registration and HTTP-only sessions are declared capability probes, not silently omitted failures.

HTTP responses use the complete `Envelope<T>` v2: `ok`, `command`, `v`, and the original `data`, `error`, `meta`, `details` or other present fields. `error` uses the existing **snake_case** ErrorKind wire values, including `not_found` and `cursor_reset`; do not change the production enum/decoder or reinterpret them as `not-found`/`cursor-reset`. A named refusal lives in `details.code`, not a replacement nested error object. For routed HTTP commands, `pij --json` forwards the original complete v2 success **and refusal** envelope bytes: no data-only unwrap, field renaming, filtering or rewrapping. Human output is a presentation, not a separate schema. Native/shim byte parity must be captured against equivalent state; these fixtures do not claim a new parity run.

Native `pij-rs --json` also preserves the original response buffer after version and payload validation; it never re-fetches the body for printing. Both clients append a final newline only when one is absent. Deliberately CLI-computed native results remain computed: spawn's `dispatched`/`bound`/`pid` projection, send's origin/message-id receipt, the compact-self command alias, and aggregated inbox/acknowledgement-warning output. Those are not unchanged daemon responses.

`commit-trailers` is the deliberate CLI-only exception: `pij commit-trailers` forwards narrowly to `pij-rs commit-trailers`, preserving trailer-only stdout, native stderr (including the derivation-tier note), and exit status. There is no commit-trailers HTTP endpoint or JSON wrapper.

### Exit policy

AC4 asserts **JSON byte parity**, not exit-code parity. Existing client policies remain distinct; scripts must inspect the complete envelope and use the policy of the executable they invoked.

| Result | Native `pij-rs` | Shim `pij` |
|---|---:|---:|
| Successful envelope | 0 | 0 |
| `error: refused` | 2 | 4 |
| `error: not_found` | 3 | 4 |
| `error: auth` | 4 | 4 |
| `error: cursor_reset` | 5 | 4 |
| `error: skew` or `adapter`; uncategorized envelope failure | 1 | 4 |
| Native argument/usage error; shim named argument/unported refusal | 2 (Clap stderr, not necessarily JSON) | 4 (named refusal) |
| `commit-trailers` native pass-through | Native command status | Same native command status |

Sources: [`exit_code`](../../crates/cli/src/lib.rs), [shim refusal/output handling](../../.pi/extensions/pij/cli.ts). The native-pass-through signal contract is also preserved; this table does not redefine OS signal termination.

## Machine trust, caller identity and roles

Every `/v1` route requires a bearer key. The key grants **machine access**, not a seat identity or authority over another seat. Callers are within that trusted-machine boundary; `CallerContext` is not a cryptographically authenticated per-seat credential. The daemon resolves the caller using its existing identity service and observed pane/process binding. An asserted `PIJ_SESSION_ID` locates a record; it cannot create a seat or override contradictory pane evidence. Caller-supplied pid/start fields in the shim context are diagnostic, not adoption evidence. Never substitute a short-lived CLI pid for the harness process.

Governance families accept `{ "argv": ["project", "list"], "caller": { "TMUX_PANE": "%10", "cwd": "/work/project" } }`. `argv` includes the family; a mismatched route/family refuses. Native typed role/answer/close/reap requests converge on the same daemon operation as shim argv, not an independent semantic parser. Do not mix typed operation fields with argv. `--actor`, `actor` or `assigned_by`, where accepted, must match the resolved caller: they never grant impersonation.

`RoleService` is authoritative: asserted roles live in `seat_roles`, joined into whoami, `/v1/seats`, StateCard and phonehome. A descriptor's stale role does not win. The projected role is optional (`Option<String>`): a string is an assertion; JSON `null` means no asserted role, never an inferred `worker` or empty string. Consumers must preserve null versus omission and must not reinterpret an omitted role as a request to clear it. Adoption/registration with role omitted preserves an existing assertion; a fresh unstamped seat remains null. Explicit null on adopt/register is not an unset operation. Use `pij role <seat> --unset` or typed `/v1/role` with `"role": null`; omitting role from that typed mutation is invalid.

Self or the target's **current recorded parent** may assert/unset its role; an unrelated seat gets `E-RS-OWNERSHIP`. Protocol may require governors to designate roles, but the service's self-or-parent contract is explicit. An asserted display role, even `prime`, confers no general governance or remote-control authority. Narrow exceptions are [assume-dead revive of a parentless seat](#revive) and [parking a blocked extension inbox head](#extension-inbox-recovery), which accept an authoritative `prime` role. Prime designation is a separate orchestration record.

Sources: [`identity.rs`](../../crates/daemon/src/http/identity.rs), [`role.rs`](../../crates/daemon/src/http/role.rs), [`types.rs`](../../crates/daemon/src/http/types.rs), [`governance.rs`](../../crates/daemon/src/http/governance.rs).

## Verified paneless external admission

`pij inbox register --json` is served through Rust authority for external
Claude/Copilot/Codex callers without `TMUX` or `TMUX_PANE`. The accepted address
is `data.id` in the complete v2 envelope, not a top-level id. The bridge validates
`CLAUDE_CODE_SESSION_ID`, or `COPILOT_AGENT_SESSION_ID` plus its matching UUID
session-state directory, or `CODEX_THREAD_ID` plus its matching readable native
rollout. It never allocates a name or writes a legacy registry/channel.

Native `/v1/register` receives an empty id, exact harness/session, folder and
requesting CLI process tuple. The daemon observes the nearest matching live
external harness ancestor, checks process incarnations and conflicting session
arguments, and allocates/reuses the canonical address under the shared registry
lock. The stored and returned `data.proc` belongs to that **host**, never the
short-lived CLI. Unchanged repeat admission returns `binding:"same"` without a
registry/event mutation. Inherited stale ids do not override verified native
identity; absent/conflicting host evidence refuses. Ordinary native registration
and extension-owned Copilot admission retain their separate protections.

From the same verified native host/session, no manual `PIJ_SESSION_ID` export is
needed for the shim's whoami, phonehome, send or inbox paths. `PEER_ID` below is
another peer's actual registration `data.id`; `MSG_ID` is the message being answered:

```bash
pij inbox register --json
pij whoami --json
pij phonehome --json
pij send "$PEER_ID" 'literal text' --json
pij inbox --wait 30000 --json
pij send "$PEER_ID" 'reply text' --in-reply-to "$MSG_ID" --json
```

`inbox --wait` without milliseconds waits indefinitely; a positive finite timeout
returns an empty claims array when no mail arrives. Success remains the complete
v2 envelope with `data:[...]`; claims contain `job_id` and the original `message`,
including reply correlation. The CLI acknowledges only after successful output.
Self-send remains refused. Paneless pull has `pane:null` and
`native_extension_delivery:false`: it is not extension push attestation or a
model canary, and pushed/extension-owned seats must not run a competing wait.
Bare native clients still need the explicit registered identity their API takes.

Sources: [`registration.rs`](../../crates/daemon/src/registration.rs),
[`shim.rs`](../../crates/daemon/src/http/shim.rs),
[`generation-router.ts`](../../.pi/extensions/pij/adapters/generation-router.ts).

## Extension inbox recovery

OMP/Pi body delivery is acknowledged only when the harness emits the matching
`message_start`; injection returning or a turn starting is not consumption proof.
The ordinary route stays unchanged. An unconsumed message idle for
`PIJ_REDELIVER_IDLE_MS` (default `10000`) is resent through `sendUserMessage`,
not the custom-message queue, with a one-line `[pij resend n]` prefix and message-id
correlation. Starting another turn resets the idle window. The local extension
capture `delivery.resend` records `messageId`, `attempt`, and the recovery reason;
it is not a daemon spine event.

OMP recovery preserves the current human draft without delaying delivery.
After the resend's correlated `message_start` ACK handler, the extension snapshots
the editor and restores it on the next tick, after OMP's user-message clear.
Restoration requires an empty editor and no intervening terminal input; human
typing, submission, or clearing wins. Restored text places the cursor at its end
and is never submitted as part of the resend.

A reclaimed unconsumed message refreshes claim tracking, never directly resends.
Consumption remains deduplicated by message id. The boundary recovery below and
idle fallback share a three-resend limit; after the last resend gets its idle
consumption window, `POST /v1/inbox/ack` with
`"delivery_outcome":"undelivered:harness-swallowed"` terminally fails the claim
instead of recording successful delivery. Escape can trigger the boundary recovery.

Extension body claims use `PIJ_RS_EXT_CLAIM_LEASE_SECS` (default `60`).
While holding an unconsumed claim, the extension sends
`POST /v1/inbox/heartbeat` with `{"seat":"<seat>","job_id":123}` every 20s.
The successful v2 envelope has `data:{"job_id":123,"state":"running"}`; renewal
resets `claimed_at` without incrementing `lease_expirations`, acknowledging
consumption, or recording `ReaderRead`. A recipient-owned terminal body returns
`state:"done"` or `"failed"` without mutation; wrong recipients and controls refuse.

At expiry, a live seat persisted as `working` renews rather than spending a lease.
This working-state check is a **one-directional safety interlock (brake)**:
removing it can only expire/park more mail. Three silent, unprotected lease
expirations park the job as `state:"failed"` with
`outcome:"undelivered:lease-exhausted"`, unblocking the serial queue; ordinary busy
turns do not count as extension failure. Parking remains a **policy**: it changes
the delivery outcome. Neither leases nor resends replay remote controls or change
Claude/Copilot delivery.

### Compaction and resend

- `session_before_compact` suspends claims/resends. The first `session_compact`, `turn_start`, `agent_end`, or `message_start` releases the latch and re-polls on the next 1s tick, even without a push callback. Aborted compaction need not emit `session_compact`; a wall-clock ceiling (`PIJ_COMPACTION_LATCH_MAX_MS`, default 120000ms) also releases it and captures `delivery.compaction-repoll` with boundary `ceiling`.
- The first observed `tool_result`, `turn_end`, or `agent_end` grants one prompt resend after `PIJ_BOUNDARY_GRACE_MS` (default 2000ms), even while busy; matching `message_start` cancels it. The default is max(2× measured OMP drain p95, 2s): five healthy busy-seat samples gave p95=139ms. This rule applies to both OMP and Pi.
- Compaction defers that resend until the latch releases; later retries retain the 10s idle fallback and the shared three-resend limit. Both timing overrides accept positive safe-integer milliseconds; invalid values use the default.
- Heartbeat runs every 20s and before resend; only a validated, matching-job `done`/`failed` response drops pending tracking without reinjection. Legacy/unknown data and heartbeat errors retain the idle resend/parking path, not busy-boundary recovery; failed/unknown forced probes cannot bypass the 20s heartbeat throttle. During stream reconnection, inbox transport work waits for the existing exponential reconnect backoff, while local idle resends remain available.
- Test-only `PIJ_TEST_SWALLOW_INJECT=1` drops OMP custom peer injections for isolated-daemon proof; it does not drop prompt resends.

```bash
pij-rs inbox --seat <seat> --peek --json
pij-rs inbox release --seat <seat> --job <job-id> --evidence 'Observed blocked head' --json
```

Peek distinguishes parked rows from the live head and does not acknowledge them.
Release requires the target's recorded parent or an authoritative `prime` role,
nonempty evidence, and the running extension body head; refusal is decodable.
It parks with `undelivered:operator-released`. This is not the existing
typing-grace release operation, and does not terminate any harness process.

Every park publishes `delivery.parked` addressed to the sender, carrying
`messageId`, `jobId`, `recipient`, `outcome`, and `reason`, plus the failure receipt.
The failed row and both sender events commit together before live publication.
A real queue paired with a fake spine refuses terminal recovery with
`E-RS-INBOX-AUTHORITY-SPLIT`, rather than emitting cursors from another store;
ordinary reads and successful acknowledgements remain supported.
The sender sees a warning naming the undelivered id and recipient. The recipient
clears that message from its pending badge and visibly names the parked id once.
The badge counts only unconsumed messages not recently resent; it is not a count
of successful delivery or model completion.

## Seat roster rows and absence

`GET /v1/seats` returns the v2 `pij seats` envelope with `data: {seats: [...], unavailable: [...]}`, not a bare row array. Each unavailable peer is `{machine, reason}`; retained rows from that peer are stale last-known data, so an empty `unavailable` list and an empty roster are different facts. Active results exclude tombstoned rows. Local rows are role-joined, stamped with the serving machine alias, and projected with `generation: "rs"`.

| Row fields | Wire contract |
|---|---|
| `id`, `harness`, `folder`, `state` | Present stable seat id, harness enum, absolute working folder and observed system state; do not rename them to TS fields. |
| `generation`, `relay`, `native_extension_delivery` | Present `"rs"` and boolean flags. False is an explicit value, not omission. Display role does not grant native delivery attestation. |
| `session`, `pane`, `proc`, `semantic_state`, `role`, `parent` | Present even when null. `session` is the serialized native harness-session id (not `harness_session`); null is unknown. `pane:null` is paneless; `proc:null` is no bound process identity. Non-null `proc` is `{pid, proc_start}`; never interpret pid alone as identity. Null semantic state/role means no declaration/assertion; null parent means no recorded governing seat. |
| `extension_build`, `extension_path` | Present string or null on current-daemon whoami, seats and state responses. Build is the loaded Pi/OMP extension's `<sha10>`, `<sha10>+dirty`, or `hash:<12 hex>`; path is its resolved real source directory, not the seat's working folder. Null means no build was reported (a pre-144 Pi/OMP extension, or a harness without this feature), never a retroactive guess from today's checkout. Older daemons omit these keys entirely. |
| `machine` | Optional in the base descriptor serialization; this HTTP handler stamps it for local rows. Preserve the machine alias in federated views rather than guessing from seat ids. |
| `spawn_id`, `model`, `provider`, `effort` | Omitted when unknown/unset (`skip_serializing_if`), not emitted as null; absence is not an inferred launch, model or effort. |
| `cross_session_inbound_accept` | Omitted means unknown, treated as closed; explicit false differs from unknown and true. |
| `tombstoned_at`, `tombstone_reason` | Omitted when absent in descriptor/history serialization. Tombstones are excluded from this active-roster endpoint, not proof that their history never existed. |

These are flattened `SeatDescriptor` fields plus HTTP `generation`, **not StateCard**: the latter has its own camelCase projection and explicit `unsupported` list. Preserve null versus omission when comparing envelopes. RoleService owns the role join; the phonehome optional-role change remains a u2 dependency for PM composition, not a runtime acceptance claimed here.

Pi/OMP captures build identity once at extension load and reuses it on registration, adoption and re-registration. Git identity uses the real extension directory's repository HEAD, with `+dirty` scoped to that directory; a standalone install hashes sorted relative paths and bytes from `index.ts`, `adapters/*.ts` and `core/*.ts`. Later disk changes do not relabel the running extension. A registration without metadata clears any prior values. This is runtime-reported provenance, not a daemon-verified attestation. Human `pij whoami` prints `extension: <build> (<path>)`, and the Pi/OMP footer keeps the build and dirty marker visible. Build identity remains JSON-only for list: the native human view has no width-budgeted build column, and the shim's existing list route is JSON-only.

Direct HTTP `/v1/seats` accepts exact `harness`, `folder`, `parent` filters, `scope=local`, and `here=<absolute-path>`; another scope value or relative `here` refuses. Default scope may include federated last-known rows. Shim `pij list` forwards `--harness`, `--folder`, `--parent` and `--scope local` as URL-encoded GET parameters, preserving literal values. Shim and native `pij-rs list --here` select rows whose recorded `folder` equals the caller's canonical cwd; the flag is boolean (`--here`, `--here=true`, `--here=false`), never a path value. Existing absolute paths are canonicalised; unavailable absolute paths retain their literal spelling, never the daemon cwd. POST accepts `{argv:["list","--here"],caller:{cwd:"/absolute/path"}}`, sharing anomalies' boolean/path helpers. GET and POST query `here=<absolute-path>` use the same projection; other filters intersect rather than widen it. Native list accepts no other filters, and shim `pij sessions` has no query flags. Legacy `--prime`, `--role`, `--archived` and tree filters remain named refusals. `/v1/shim/sessions` is a distinct rs projection, never a union with the legacy store.

```bash
pij list --harness omp --folder '/work/project with spaces' --parent <seat> --scope local --json
pij-rs list --here --json # caller cwd, not daemon cwd
pij sessions --json      # rs session projection: no query flags
```

| Route | Scope | Refusal |
|---|---|---|
| GET/POST `/v1/seats?here=<absolute-path>`; POST argv `list [--here]` | Canonical caller folder equality; preserves `unavailable` and existing exact filters | Relative query/caller cwd or path-valued argv `--here` returns a v2 `E-RS-ARG` envelope |

The additive `list_here_capture` in [`governance-client-parity.json`](../../crates/testkit/fixtures/golden/api/governance-client-parity.json) retains four actual native/shim byte-equal pairs (bare, true, false, unfiltered) and four argument refusals against one private real-adapter daemon. Its binary hash and captured cwd identify the exercised artifact; this is not production deployment evidence.

Sources: [`types.rs::FederatedRoster / UnavailablePeer`](../../crates/daemon/src/http/types.rs), [`model.rs::SeatDescriptor`](../../crates/core/src/model.rs), [`http/mod.rs::SeatProjection / seats`](../../crates/daemon/src/http/mod.rs).

## Governance route inventory

All POST families below use argv/caller unless the typed alternative is named. Unknown leaves refuse; unsupported flags are not dropped. These are the daemon routes, not invented `/v1/report/<leaf>` endpoints.

| Method and path | CLI / operation | Canonical case ids |
|---|---|---|
| POST `/v1/project` | `project create <description> [--repo <path>] [--plan <path>] [--prime <id>]`; `list`; `show <slug>`; `set <slug> [--description <text>] [--repo <path>] [--plan <path>] [--prime <id>]` | `project-create`, `project-list`, `project-show`, `project-set` |
| POST `/v1/stream` | `stream create --project <slug> --slug <stream> [--base <ref>] [--ordinal N] [--root <path>]`; `list [--project <slug>]`; `show <allocation>`; `close <allocation>` | `stream-create`, `stream-list`, `stream-show`, `stream-close` |
| POST `/v1/fence` | `fence set <stream> --paths <a,b> [--shared <x,y>]`; `show [--stream <stream>] [--path <path>]` | `fence-set`, `fence-show` |
| POST `/v1/dispatch` | `dispatch <seat> --packet <path> [--wait[=MS]]` | `dispatch-create` |
| POST `/v1/ack` | `ack <dispatch> --packet-sha <sha256>` | `dispatch-ack` |
| POST `/v1/canary` | `canary <seat> [--expect-model <model>] [--wait[=MS]]` | `canary-verified` |
| POST `/v1/attest` | `attest <seat> --plan-id <id>` | `attest-plan` |
| POST `/v1/task` | `task set <seat> <task> [--project <slug>]`; `close <assignment> --reason <done/cancelled/failed/superseded>` | `task-set`, `task-close` |
| POST `/v1/node` | `node show <seat>` | `node-show` |
| POST `/v1/orchestration` | `orchestration baton define/list/show/request/grant/return/reclaim`; `prime set/retire/unset <seat>`; `role set <seat> <role>` / `role unset <seat>` | `baton-define`, `baton-list`, `baton-show`, `baton-request`, `baton-grant`, `baton-return`, `baton-reclaim`, `prime-set`, `prime-retire`, `prime-unset`, `orchestration-role-set`, `role-unset` |
| POST `/v1/role` | `role [<seat>] <role>` / `role [<seat>] --unset`; typed `{seat?, role, caller}` | `role-set` |
| POST `/v1/report` | `report now/state/question/blocked/clear/verify`; state metadata flags below | `report-question`, `report-verify` |
| GET and POST `/v1/anomalies` | `anomalies [--here] [--project <slug>]`; GET `here=<absolute-path>&project=<slug>` | `anomalies-list`, `anomalies-argv` |
| GET and POST `/v1/decisions` | `decisions [--state <open/answered/all>] [--asked_by <seat>] [--parent <seat>]`; GET keys `state`, `asked_by`, `parent` (literal underscore; `--asked-by` refuses) | `decisions-list`, `decisions-argv` |
| POST `/v1/answer` | `answer [--supersede] <decision> <answer>`; typed `{decision, answer, supersede?, caller}` | `decision-answer`, `decision-answer-supersede` |
| POST `/v1/close` | `close <seat> [--reason <text>]`; typed `{seat, reason?, caller}` | `seat-close` |
| POST `/v1/reap` | `reap [--dry-run]`; typed `{dry_run?, caller}` | `reap-dry-run` |
| POST `/v1/spine` | `spine append --kind <kind> [--refs <a,b>] [--project <slug>]`; `events/render [--since N] [--peer <seat>] [--project <slug>]` | `spine-append`, `spine-events`, `spine-render` |
| POST `/v1/adopt` | Existing identity admission plus optional asserted role; omitted parent and role remain unsaid | `adopt-with-role` |
| POST `/v1/register` | Existing verified registration plus optional asserted role; failed admission cannot commit a role | `register-with-role` |

The case-id column names exact `.routes[].cases[].id` entries in [`governance-routes.json`](../../crates/testkit/fixtures/golden/api/governance-routes.json): select the row's method/path, then that id for its pinned `request` and `response` (and `shim_request` when supplied). For combined GET/POST rows, `*-list` is GET and `*-argv` is POST. A GET fixture's `request:null` means no request body. The existing report now/state event payload examples are separately pinned by `report-now` / `report-state` in [`governance-events.json`](../../crates/testkit/fixtures/golden/api/governance-events.json); the new report route cases are question/verify. These pointers are fixture provenance, not new captures.

`--json` is accepted by the command surfaces. Read families share their GET and POST parser/projection; GET `here=true` cannot guess the caller's folder and refuses. Exact peer/project filters do not widen scope. `status-stale` is node-keyed, so a project filter can omit it: supervisors query anomalies unscoped before declaring cards fresh.

Project/stream/fence/dispatch/task records are rs store authority, not files under `~/.pij/`. Fences describe intended writes, not permission. Stream close changes its record, not the worktree. Dispatch persists packet digest and outbound linkage before delivery; queued is not delivered, and delivered is not acknowledged. Only the resolved recipient can ack the matching packet SHA; identical ack is idempotent. Canary requires actual nonce-correlated dispatch/ack and observed runtime/model evidence, not descriptor presence. `attest --plan-id` never grants native-extension-delivery attestation. `node show` joins rs records only. `spine render` returns `{text,cursor}` and never writes a legacy ledger file.

Source: [`governance.rs` parser and handlers](../../crates/daemon/src/http/governance.rs), [`report.rs`](../../crates/daemon/src/http/report.rs), [`anomalies.rs`](../../crates/daemon/src/http/anomalies.rs), [`decisions.rs`](../../crates/daemon/src/http/decisions.rs), [`lifecycle.rs`](../../crates/daemon/src/http/lifecycle.rs).

## Canonical wire examples

The following excerpts are verbatim canonical fixture objects (`role-set`), not new live captures. Send typed role fields OR the fixture's shim argv form, never both.

POST `/v1/role` request:

```json
{
  "seat": "pij-worker",
  "role": "reviewer",
  "caller": {
    "TMUX_PANE": "%10",
    "cwd": "/work/project"
  }
}
```

Complete success envelope:

```json
{
  "ok": true,
  "command": "pij role",
  "v": 2,
  "data": {
    "seat": "pij-worker",
    "role": "reviewer",
    "assigned_by": "pij-parent",
    "assigned_at": 1788739200000,
    "seq": 101
  }
}
```

Matching canonical event frame (decode `event.payload` as a JSON string):

```json
{
  "type": "event",
  "machine": "fixture-machine",
  "cursor": 101,
  "event": {
    "v": 1,
    "at": 1788739200000,
    "kind": "role-set",
    "seat": "pij-worker",
    "payload": "{\"actor\":\"pij-parent\",\"action\":\"assigned\",\"record\":{\"seat\":\"pij-worker\",\"role\":\"reviewer\",\"assigned_by\":\"pij-parent\",\"assigned_at\":1788739200000}}"
  }
}
```

## Report assignment metadata

| Leaf / flag | Contract |
|---|---|
| `report state <state> --assignment <id> [--refs a,b]` | Assignment must exist and belong to the reporting caller. |
| `report blocked\|question "<text>" --assignment <id> [--refs a,b]` | Same ownership check, before state publication or durable question creation. |
| `--refs a,b` on `state`, `blocked`, `question` | Allowed without an assignment; split on commas, trim entries, discard empty entries, preserve order. |
| `report verify <seat> [--assignment <id>]` | Unchanged: current parent verifies matching task-scoped done evidence; self-verification refuses. |
| `--project` | Refused: rs reports are node-scoped; project comes from the node (`pij node show`). |
| `--for` | Refused: rs has no relay authority yet; report as yourself. |

Unknown task ids return `E-RS-ASSIGNMENT-UNKNOWN`. Another node's task returns
`E-RS-ASSIGNMENT-NOT-YOURS` and names its owner. Both are HTTP 400 v2 refusals,
with the code in `details.code`; neither writes state or opens a question.
Assignment and refs flags require one nonempty value; duplicates refuse.
`now` and `clear` do not accept assignment/refs flags.

The canonical persisted and projected names are **`assignment_id`** and **`refs`**.
Old `report.state` records read with `assignment_id: null` and `refs: []`.
`node show` exposes the selected node's latest record at `data.node.state`
(null before its first declaration); child summaries remain structural.
`pij state` exposes `assignment_id` and `refs` beside `stateNote`, and report
JSON receipts expose the same metadata. An unscoped declaration or `clear`
replaces previous metadata rather than retaining stale task context.
Reporting `done` never closes a task; closure remains an explicit task operation.

[`report-assignment-client-parity.json`](../../crates/testkit/fixtures/golden/api/report-assignment-client-parity.json)
retains isolated native/shim node/state readbacks and assignment refusals.
Stdout is byte-equal; existing refusal exit policies remain native `2`, shim `4`.
The deterministic state-record golden is separately generated from the core
service; neither fixture claims production deployment.

## Questions, answers and current parents

`report question <text>` creates a durable decision plus `decision.opened` atomically; `question_seq` is that actual allocated event sequence. A later report clear/state change does not answer or delete the question. Read projections and parent filters follow the asker's **current parent**; the historical `decision.opened` payload retains parent-at-ask. Root questions may be visible through prime fallback, but that visibility does not grant answer authority.

The asker or current parent may answer. Another-seat answers retain stable `answer_msg_id` and use the existing DeliveryService to the **asker**, not its parent. Durable delivery acceptance closes the decision; a rejection leaves inspectable open intent. Identical retry must not duplicate a push. Self-answer closes with `answer_msg_id: null`, without a redundant self-send. `report verify <seat>` is current-parent-only, never self-verification. With `--assignment`, it selects the latest done naming that assignment even if unrelated done events followed; without it, the latest done overall. A newer done for the same assignment reopens its unverified-done finding.

```bash
pij report question 'Who owns the migration?'
pij decisions --parent <current-parent> --json
pij answer <decision> 'The store unit owns it' --json
# Recovery ONLY after observing a terminal, non-delivered prior answer:
pij answer --supersede <decision> 'The replacement ruling' --json
```

Only the current parent can supersede, not the asker, former parent or unrelated seats. Eligible prior intent is failed/no-queue preparation or an already-recorded terminal non-delivered outcome (including expired-unknown/refused); elapsed time is not proof of expiry. Pending/running jobs, held outcomes and pre-injection reservations without a completed audit refuse `E-RS-ANSWER-IN-TRANSIT`. **An answer in transit cannot be withdrawn; wait for its terminal outcome.** Claim expiry returns to pending, not terminal expired-unknown. Delivered/acknowledged answers refuse `E-RS-ANSWER-DELIVERED`, including durable outcome evidence after bounded delivered-id eviction. No queue cancellation, withdrawal, new transport or custom retry is supplied.

Supersession atomically records the prior answer under `superseded` and opens fresh prepared intent. The new message id derives from the allocated supersession event seq; an obsolete completion cannot close that replacement. This requires queue=real and spine=real **sharing the decision/event SQLite authority**, not just matching labels. Mixed or fake combinations refuse HTTP 409 `E-RS-ANSWER-AUTHORITY-SPLIT`, naming `queue_backend` and `spine_backend`, before any replacement mutation/admission. Ordinary questions, answers, identical retry and self-answer remain available for supported configurations.

## Baton leases

```bash
pij orchestration baton define merge --resource branch:main --repo <repo>
pij orchestration baton request merge --purpose 'Integrate reviewed work' --pin <sha> --evidence 'gate receipt'
pij orchestration baton grant merge --to <request-id> --json
pij orchestration baton show merge --json
# Holder returns the EXACT lease id observed in grant/show:
pij orchestration baton return merge --lease-id <observed-lease-id> --evidence 'integration complete'
# Keeper reclaims that EXACT observed lease only after explicit judgment:
pij orchestration baton reclaim merge --lease-id <observed-lease-id> --evidence 'holder confirmed gone'
```

Return/reclaim **require** the observed `--lease-id`. Missing or stale ids return `E-RS-LEASE-STALE`, naming the current lease and remediation; a shim must not resolve a fresh lease on the caller's behalf. One holder, request purpose, pin re-verification and authorization remain enforced. An asserted role is not a lease grant. These are shared-store records/events, not legacy atomic lease files. The book can annotate evidence; it is not another lease authority.

`baton request` persists the request and publishes `baton.requested` before calling the existing delivery service, from the requester to the definition's `created_by` keeper. Its complete response includes `data: {request, seq, notice}`. The exact legacy notice text is pinned by `baton_notice_body_template` in the stable route corpus.

`notice` is `queued` for Pi/OMP extension-stream admission until ReaderRead; `delivered` requires actual transport confirmation. `unverified` uses existing `Dead`/`Recycled` process-incarnation evidence, not a new heartbeat-age rule. A missing or dissolved keeper yields `notice: null` and no send. The eight retained host cases keep their message/no-write counts; idle Pi's expected value was explicitly corrected from delivered to queued under the honest-receipt rule.

Send/probe errors or Held/Refused transport outcomes cannot be presented as success or erase the committed request. `E-RS-PARTIAL` retains `committed`, `event_published`, `request` and `seq` evidence. A publication failure prevents the notice send. A later reader acknowledgement may prove delivery without creating a second notice message; self-send still uses the existing refusal path.

## Retirement and conservative reaping

`pij close <seat>` is a self-or-recorded-parent tombstone, **not process termination or pane teardown**. The active roster excludes tombstones; history retains the reason/sequence. A parent repeat-close returns existing evidence. Retired self identity still refuses, naming tombstone evidence; it is not an authentication exception. There is no `--force` bypass.

```bash
pij reap --dry-run --json
# Only an authorized operator deciding to reconcile records runs the mutation:
pij reap --json
```

Eligibility: confirmed process death **or** `proc_start` mismatch, **and**, for a pane-bound record, confirmed absence of that exact pane. Paneless records require the confirmed stale process alone. A live/recycled process is never signalled. Unknown process/pane evidence is reported as `unverifiable` and blocks retirement. Removing that check can only permit the same set or more reaps: it is a **brake**, not retention policy or an age threshold. Dry-run changes neither records nor spine. Execution re-observes and compares the binding before atomic tombstoning so a concurrent revive is not retired from an old snapshot.

The process adapter uses `LC_ALL=C ps -o lstart=PIJ_LSTART -p <pid>`. Absence is specifically exit **1**, empty stderr, valid UTF-8 and **one header line whose trimmed value is `PIJ_LSTART`, with no subsequent line**. The canonical example is `PIJ_LSTART\n`. Exit 0 requires the header plus exactly one parseable process row. Empty stdout, wrong header, an extra blank/data row, any stderr (even whitespace), other exits, signals and parse errors are unknown—not dead. Existing regression names include `exit_one_with_header_only_and_empty_stderr_is_absent`, `successful_probe_without_process_row_is_unknown`, `failed_probe_requires_exact_header_only_output`, `any_stderr_vetoes_both_absent_and_live_protocols` and `other_exits_and_signals_with_header_only_are_unknown`; naming them is not a claim that this docs change ran them.

Sources: [`reaper.rs`](../../crates/daemon/src/reaper.rs), [`proc.rs`](../../crates/harnesses/src/proc.rs).

## Death sweep

The daemon automatically applies the same conservative reap rule every **5 seconds** by default; set `PIJ_RS_DEATH_SWEEP_MS` on the daemon to change the interval in milliseconds. `pij-rs reap --dry-run --json` exposes the same candidates for an equivalent observation. A candidate needs a `Dead` or `Recycled` process incarnation and confirmed absence of its recorded pane (paneless records use the existing stale-process rule). Unknown evidence is not death.

Each unchanged candidate receives one atomic `seat.tombstone` with `reason: "observed-dead"` and observation fields `pid`, `proc_start`, `pane`, `pane_present: false`. Already-tombstoned rows are not retired again. The sweep never signals a process or tears down a pane.

After tombstoning, the daemon pushes an obituary to the child's **recorded parent** through `DeliveryService::send`. It uses `pij_core::BG_ACTOR`, the shared daemon-owned `pij-bg` virtual actor already used for background-job completion—not a second sender identity. The exact text is pinned as `death_notice_body_template` in the [stable route corpus](../../crates/testkit/fixtures/golden/api/governance-routes.json):

```text
[pij] seat <id> died (<reason>) — pane <pane> absent, pid <pid> gone at <iso>. It was your child; revive with `pij-rs revive <id>` or leave it.
```

A send receipt proves only its recorded delivery strength: queued is not parent observation. Parents need not poll for child deaths. A parent that is tombstoned or itself observed-dead in the same sweep receives no notice; the daemon counts these suppressions in one line, `death sweep: N notice(s) withheld — recipient dead too`, rather than flooding dead parents after a reboot.

Obituary preparation, send and audit failures are isolated per seat: log the error, continue with the remaining parents, then report `death sweep: N notice(s) failed` once. A failed obituary does not roll back retirement or gain an automatic retry.

## Revive

```bash
pij-rs revive <seat> [--session <tmux-session>] [--name <window-name>] --json
# Only the recorded parent, or a prime for a parentless target:
pij-rs revive <seat> --assume-dead --evidence 'Observed stale binding; describe the evidence' --json
```

Native revive accepts an explicit tombstoned id **or** a seat observed `Dead` with its recorded pane absent; no preliminary `close` is needed. In the observed-dead case it first commits `seat.tombstone` with `reason: "revive-observed-dead"`, then relaunches under the same spawn-lock critical section. The receipt's `details.seq` cites the tombstone sequence.

A tombstone row is sufficient even when an older native retirement left no matching `seat.tombstone` event. Before relaunch, the daemon records `revive.legacy-tombstone` with the stored retirement timestamp and reason; `details.legacy_tombstone_seq` cites this audit and `details.seq` is omitted rather than inventing a tombstone receipt. A tombstone event from a previous incarnation does not count as a receipt for the current row. Audit publication failure leaves the tombstoned row untouched.

For `Recycled` (the pid belongs to another process incarnation) or `Unknown` (for example, the process probe is unavailable or no process binding is recorded), `--assume-dead` requires nonempty `--evidence`. The daemon resolves the caller from caller evidence: only the seat's recorded parent may override, or, **if the target has no parent**, a caller whose authoritative role is `prime`. An unrelated prime cannot override a parented seat. The override records `revive.assumed-dead` with the supplied evidence and observed binding, cited by `details.assumed_dead_seq`; it **never signals the replacement pid**. An `Active` process or a present recorded pane still vetoes revival, even with this flag.

Without an eligible override, `E-RS-REVIVE-LIVE` names the observation and exact override command; its remediation does not grant authorization. Shim `pij revive` still refuses `E-RS-UNPORTED`, and native `--print`/`--attach` remain unsupported.

## Event stream and cursors

`GET /v1/events` is NDJSON, **not SSE**. The first line is the fixture Hello below, not `type=hello` and not a v2 command envelope:

```json
{"build":"pij-rs 0.1.0","hello":true,"v":1}
```

An Event frame has `type`, `machine`, `cursor`, `event`; inner Event has `v:1`, epoch-millisecond `at`, literal `kind`, optional `seat`, and **`payload` is a JSON STRING**. Decode the outer line, then JSON-decode that string once. Inner `event.seq` is not serialized: advance the appropriate machine's cursor from the frame. The canonical `role-set`/governance payloads use `{actor,action,record}`; seat.put decodes directly to the persisted SeatDescriptor and seat.tombstone to its reason object. Existing report.now/report.state payloads are not renamed. New publications have real timestamps; historical `at=0` rows are not rewritten.

No `since` means live-only. Replay takes a URL-encoded JSON cursor map such as `{"fixture-machine":100}`, exclusive per machine; an integer `since=100` refuses. Native CLI spelling: `pij-rs tail --since fixture-machine=100` (repeat `--since` for each machine). This follows daemon events, **not a peer transcript**. `pij spine events --since 100` is a separate local-spine query and returns its local cursor.

All producers append through the sole EventBus/store ordering seam, commit before broadcasting the returned seq, and preserve replay/live boundary ordering without duplicate/skipped rows. Caller cancellation after admission does not abandon commit/broadcast; shutdown joins admitted producers before flush. Destructive governance mutations commit state and spine event atomically or neither. Consumers must not advance a cursor past an unemitted row.

## Unsupported status

This anchor is permanent; refusals and shipped consumers must not depend on an active plan directory. The inventory distinguishes **shim gaps** from native capability. A missing route never enables legacy execution, even when explicitly forced, and a family row does not promise every old leaf or flag.

- **Shim-only gaps / different meanings:** `spawn`, `revive`, `tail` and `daemon` refuse `E-RS-UNPORTED`; native capability is not a grammar-compatible shim port. Use the documented native forms in the [peer](../../skills/pij/references/routes/peer.md) and [ops](../../skills/pij/references/routes/ops.md) routes where available. Native tail is an event stream, not a transcript. [Native revive](#revive) accepts tombstoned or observed-dead ids and the authorized `--assume-dead --evidence` override; `--print` and `--attach` remain unsupported. Native spawn has no legacy layout/task/branch/plan-id flags.
- **List/sessions filters:** shim `pij list` forwards declared `harness`, `folder`, `parent` and `scope=local` query values to GET `/v1/seats`. Shim and native `pij-rs list --here` scope to caller cwd; path-valued `--here` refuses. Native list has no other filters. `pij sessions` routes GET `/v1/shim/sessions` with no query flags or legacy union. Unsupported `--role`, `--prime`, `--archived` and tree semantics refuse instead of being dropped. Prime designation has no dedicated list/getter projection here: use actual designation receipts/events and authoritative government/human evidence; role assertion or an empty filtered view cannot prove absence.
- **Baton projection limits:** a blocked-time field is not provided. Automatic request notices and their honest delivered/queued/unverified/null projection are supported as described under [Baton leases](#baton-leases); a durable request alone still does not prove recipient observation.
- **Unported command surfaces:** `agent`, `path`, `telegram`, `models`, `watch`, `unwatch`, `chore`, `watchdog`, `focus`, `tree` and `link` refuse through the shim. This does not remove already composed sidecar internals; it does not advertise those old administrative grammars as a native port. In particular, there is no rs reparent/root-placement command equivalent to link.
- **Inbox/admission:** verified external `inbox register` and `inbox --wait [ms]` are [supported](#verified-paneless-external-admission), not gaps. Paneless adopt, unlisted inbox leaves, generic shim `register`, send `--wait` and attachment semantics remain refused. Never fabricate host process evidence or use a legacy fallback; extension-owned registration/receive stays owned by that extension.
- **Control and bg are supported, not gaps:** remote compact/new/reload, compact-self and bg create/list/tail/kill remain shipped. Controls carry no body; acceptance is not execution. Copilot and paneless controls refuse; new/reload require self or recorded parent plus target arming, not a prime role. Never replace refusal with slash text or sendkeys. bg remains daemon-owned detached execution with durable completion injection, bounded server-side log reads and owner/parent authorization; it introduces no answer queue cancellation.
- **Native commit-trailers data gap:** forwarding is supported, but `commit_trailers::run` currently calls `derive` with no repository-designation input and does not query current assignment. It reads role-joined self/local seats, then uses a complete recorded-parent root as the explicit interim fallback. `Pij-Plan` derives from worktree path, branch or local flow context. Do not claim designation/current-assignment lookup or use stale legacy rows to fill either gap.
- **StateCard:** inspect its `unsupported` notes instead of manufacturing missing telemetry/lifecycle fields. Optional/null role is absence of assertion, not proof that the role port is unavailable.
- **Recovery boundary:** `answer --supersede` is terminal-only and shared-real-authority-only as above. The refusal is intentional; no queue withdrawal exists. Close/reap reconcile records, not processes. An unsupported force flag cannot bypass ownership.
- **Native sessions capability:** there is no `pij-rs sessions` subcommand in this cutover. The shim's session projection is compared with original live GET `/v1/shim/sessions` response bytes, not an invented native CLI surface.
- **Registration CLI boundary:** `register --role` remains native/HTTP-only. Shim `register` refuses `E-RS-UNPORTED` by name; it is not a fallback registration path.
- **Exit-policy convergence:** native and shim refusal exit policies should converge in separate work. Until then preserve the table above; do not silently align statuses while changing JSON routing.

The actual CLI-verb table is [`skills/pij/SKILL.md`](../../skills/pij/SKILL.md); routing enforcement reads that table rather than a test-owned duplicate. Source inventories: [shim route/refusal declarations](../../.pi/extensions/pij/core/generation-routing.ts), [native Command enum](../../crates/cli/src/main.rs), [native attribution helper](../../crates/cli/src/commit_trailers.rs), [inbox parser](../../crates/daemon/src/http/shim.rs), [identity admission](../../crates/daemon/src/http/identity.rs). Final isolated runtime, full-envelope byte parity and production/chainglass evidence belong to the PM/prime, not this document.
