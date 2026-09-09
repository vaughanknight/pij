# Review — plan 143, post-compaction delivery

Reviewer: pij-awake-xerinae. Branch `143-omp-post-compaction-delivery` @ `510b5bec` vs merge-base `5135a0a1` (`git merge-base HEAD main`).

## Verdict: APPROVE-WITH-FIXES

The behaviour the plan asked for is present, tested, and independently reproduced. One fix is
mandatory before merge (F1): the compaction bracket has no closing edge on the failure paths that
pi/omp actually take, and while it is latched open **all** mail delivery stops permanently — a
strictly worse failure than the one being fixed, because the pre-change bug self-healed at the next
human turn. F2/F3 are the same class one layer down: a resend now requires a successful daemon
round-trip, and both "old daemon" and "daemon unreachable" silently disable resend *and* parking.

Everything below was run by this reviewer; the mutation probes ran in a throwaway detached worktree
(`git worktree add --detach /tmp/p143-probe 510b5bec`), never in the branch worktree and never
against the production daemon.

## 1. Per-AC test that goes RED

| AC | Behaviour | Test that dies without it |
|---|---|---|
| AC1 | `session_compact` re-polls with no push callback | `rust-runtime.test.ts:1397` "session_compact repolls even when the compaction push callback never ran" |
| AC1 | no claim inside the bracket | `:1382` "…never during compaction"; `:1359` startup-peek race |
| AC2 | busy-seat boundary resend | `:1409` "tool_result resends an unobserved inject through the prompt while the seat is busy" |
| AC2 | resend deferred by compaction | `:1421` "a boundary resend waits for session_compact while compaction is open" |
| AC2 | one boundary, then idle fallback | `:1493` "only the first resend uses a busy boundary…" |
| AC3 | terminal heartbeat drops without resend | `:1434`; reclaim variant `:1448` |
| control | observed inject never resends | `:1462`; healthy-drain grace `:1477` |

**Baseline** (probe worktree, `npx vitest run rust-runtime.test.ts daemon-http.test.ts`):
`108 passed`, matching report.md:31.

**Proof by revert 1 — compaction re-poll.** Deleted `this.inboxPending = true` from `onCompact`
(`rust-runtime.ts:388`). Result: `1 failed | 87 passed` — `:1397` RED. Restored.
Note `:1382` survives this mutation, because the missed-push case is carried by the push handler
setting `inboxPending` at `:264`; `:1397` is the only witness for the callback-less path.

**Proof by revert 2 — boundary resend.** Neutralised the `boundaryDueAt` assignment in
`queueBoundaryResend` (`rust-runtime.ts:401`). Result: `4 failed | 84 passed` — `:1409`, `:1421`,
`:1493`, and `:1984` ("recovers interrupted mail through the same bounded prompt path") all RED.
Restored; baseline green re-confirmed.

**Daemon side, independent run** (branch worktree, read-only to the daemon):
`cargo test -p pij-daemon --lib http::` → `166 passed; 0 failed`.

## 2. Duplicate-injection paths (Q2)

Every path that can put the same body in front of the model:

1. **First inject** — `rust-runtime.ts:646` `session.onInbound(...)`, only when `claim.attempt === 0`
   and not compacting (`:639`, `:640`).
2. **Boundary resend** — `:807-814` → `recoverPending(…, true)` → `resendPending(…, "boundary-unconsumed")` `:827`.
3. **Idle resend** — same tick, `:811-813` idle branch.
4. **Re-claim (`attempt > 0`)** — never injects directly: existing row returns at `:618-622`, a new
   row returns at `:639`. It *does* now arm path 2 at the next boundary (`queueBoundaryResend` `:398`
   does not exclude reclaims), which is a narrowing of the previous 10s-idle margin for reclaims.

**One counter, one gate — confirmed.** `pending.resends` is the only counter; it is incremented
exactly once at `:842` and checked at `:824` and `:836`. The boundary is gated to `resends === 0` in
both places that can arm or fire it (`:400`, `:808`), so a pending message gets **at most one**
boundary resend; everything after it needs the 10s idle rule. `MAX_RESENDS = 3` (`:73`) still caps
all paths together. This matches the AC2a ruling.

The residual duplicate risk is not the counter — it is the grace window. See F4.

## 3. AC3 — does production supply the state the guard reads? (Q3)

Yes, on the real path, not the fake:

- `crates/daemon/src/http/mod.rs:2015` — `Ok(job_state) => envelope(OK, Envelope::ok("pij inbox", json!({"job_id":…,"state":job_state})))`.
- `crates/daemon/src/delivery/mod.rs:1108-1133` — `heartbeat_inbox` returns `&'static str`;
  `terminal_delivery_state` first, then `"running"` after a successful `heartbeat_delivery`.
- `crates/store/src/queue.rs:538-568` — the SQL is recipient-scoped (`serial_key = ?2`, payload
  `$.to = ?2`), body-only (`$.command IS NULL`), terminal-only (`state IN ('done','failed')`),
  read-only. Non-mutating, so a heartbeat still cannot manufacture consumption.
- Claim rows also carry `state:"running"` now (`delivery/mod.rs:1056`), and the extension parser
  handles `state === "done"` at `rust-runtime.ts:1032`.

So the response shape is real. The **client-side handling** of it is the problem — F2.

## 4. Can a resend fire inside a compaction window? (Q4)

No, on three independent guards, and the deferral is tested:

- `recoverUnconsumed` returns at `rust-runtime.ts:801`.
- `recoverPending` re-checks after its `await` at `:821` (the only place a resend can be re-entered
  post-await).
- `resendPending` checks again at `:835`.
- A claim arriving mid-bracket is held, not injected: `:640-643`.
- Witness: `rust-runtime.test.ts:1421`.

The compaction check is correctly characterised in report.md:19 as a one-directional interlock:
removing it only permits more claims/resends. That is true — and F1 is the cost of an interlock
with no release.

## 5. Fault switch (Q5)

`PIJ_TEST_SWALLOW_INJECT` — `pi-runtime.ts:66-71`. Inert unless the value is exactly `"1"`, and only
on the OMP custom-message branch; prompt resends are unaffected (correctly, or the AC5 proof would
prove nothing). The name states its purpose. It cannot ship enabled: nothing in the repo sets it —
`git grep` finds it only in the adapter, its test, the how-doc bullet, and the plan/report. See F6
for the one hardening ask.

## 6. Report honesty (Q6)

- **Live seqs are internally consistent, and NOT independently re-verifiable.** The isolated
  daemon's state dir (`/var/folders/.../pij143-proof-s1thfepd/state`, report.md:50) has been removed,
  as report.md:72 says it was. I re-read the committed transcripts instead: push/ACK **5/8**
  (`live-compaction-large.json`), **11/14** (`live-compaction-small.json`), **15/18**
  (`live-busy.json`) all appear in each file's `spine` array with the claimed kinds
  (`message.pushed`, `delivery.inbox-ack`), and `job.claimed_at`/`acked_at`/`first_running_observation`
  match report.md:60-62 to the millisecond. The terminal heartbeat `{"job_id":3,"state":"done"}` is
  present in `live-busy.json`. **These are self-recorded artefacts; the authority they were read
  from no longer exists.** Report and reviewer agree on that.
- The AC5 "claims emit no spine event" ruling (report.md:54) is consistent with what the transcripts
  contain — there is no claim kind in any spine array, and claim evidence is the SQLite row.
- report.md:38 truncates its own harness envelope and says so. report.md:66 explicitly declines to
  claim native drain is immediate. Both are honest; the second is F4's admission.
- Gates re-run by this reviewer: extension suite `108 passed`, daemon `http::` `166 passed`. The full
  `cargo test --workspace` / `harness checks` numbers are taken from the committed logs, not re-run.

---

## Findings

### Degrades a control

**F1 — `compacting` has no closing edge on the paths pi/omp actually take on failure; latched, it
stops mail permanently and a human turn no longer rescues it.** *(mandatory fix)*

`rust-runtime.ts:383` sets the flag. It is cleared in exactly three places: `onCompact` `:387`, boot
`:205`, `shutdown` `:438`. There is no timeout and no fallback edge.

pi's session only emits `session_compact` on the success path. Manual compaction:
`dist/core/agent-session.js:1370` emits `session_before_compact`, then `:1379` throws on `cancel`,
`:1399` `await compact(...)` can throw, `:1406` throws on abort — and only `:1417` emits
`session_compact`. Auto-compaction is the same shape: `:1599` open, early `return false` at `:1615`
and after `:1635`, close only at `:1660`. `compaction_end` *is* emitted on the aborted paths — but it is
not an extension event: `dist/core/extensions/types.d.ts:846-847` exposes only
`session_before_compact` and `session_compact`. So there is no event the extension can subscribe to
that closes the bracket on failure.

While latched open: the mail ticker returns at `:295`, `recoverInbox`'s loop never runs `:486`,
every push is noted-and-dropped `:541-545`, `recoverUnconsumed` returns `:801` — and critically
`repollAfterCompaction` returns early *because* `compacting` is true `:393`, so `turn_start` and
`agent_end` no longer recover. The original incident ended when the human typed a turn at 13:40:05
(plan.md:7-8); after this change, that escape hatch is gone. And the motivating incident **was a
compaction failure** ("remote compaction 404s", plan.md:6).

report.md:70 states "no new timeout silently closes an unended bracket" as a property. It is the
hazard.

Fix (small): give the bracket a bounded release — clear `compacting` after N seconds without
`session_compact` (a watchdog, with a `session.capture` when it fires), and/or treat the first
`turn_start`/`tool_result` observed while `compacting` as an implicit close. Add a regression that
opens a bracket, never closes it, and asserts delivery resumes.

Command: `grep -n "compacting" .pi/extensions/pij/adapters/rust-runtime.ts` (3 writers, 10 readers);
`sed -n '1360,1430p;1590,1665p' <pi-coding-agent>/dist/core/agent-session.js`.

**F2 — a mixed-version deploy silently disables every resend and the parking path.**

`daemon-http.ts:186-189` types the heartbeat as `InboxHeartbeat` but `post<T>` at `:334` is
`decodeEnvelope<T>(...).data` with no runtime validation — unlike `pushedInboxClaim`
(`rust-runtime.ts:1008+`), which throws on every malformed field. An older daemon returns
`data: 123` (the pre-change wire shape, still visible in the docs diff for
`docs/how/pij-rs-api.md`). Then `response.state` is `undefined`, so `heartbeatPending` falls through
to `:742` (`return response.state === "running"`) and yields `false`, and `recoverPending` returns at
`:821` — **no boundary resend, no idle resend, no
`undelivered:harness-swallowed` parking, and no capture on that branch.** The seat shows
`📨 1 pending` forever, which is precisely the symptom plan 143 exists to remove.

report.md:70 mitigates this with an instruction ("deploy the new daemon and refreshed extension
together"), not a guard.

Fix: validate the heartbeat payload like the claim parser does — throw or `capture` on an
unrecognised shape — or treat an unknown state as `running` so local recovery survives skew. Either
is fine; silence is not.

**F3 — "consulted but unreachable" fails closed *and* spins at 1 Hz.**

`heartbeatPending`'s catch (`:743-756`) returns `false`, so an unreachable or erroring daemon
suppresses every resend and the park path. Meanwhile `recoverUnconsumed` re-evaluates the idle
condition every tick (`:811-813`) and `force = true` bypasses `CLAIM_HEARTBEAT_MS` (`:725`), so each
stuck pending message issues **one heartbeat and one `daemon_event_heartbeat_error` capture per
second, indefinitely** — `injectedAt` is only reset by an actual resend (`:843`), which never
happens. Before this change, resend was purely local and heartbeats were 1/20s.

Fix: on a failed forced heartbeat, fall back to the 20s throttle; and decide explicitly whether an
unreachable authority should veto a *local* resend at all (it is a different question from "another
reader settled it", which is what the comment at `:820` is actually about).

### Obscures information / narrows a margin

**F4 — the 1000ms boundary grace is unproven against real OMP drain latency; if native drain is
slower than 1s, every healthy busy-seat message is delivered twice.**

`BOUNDARY_RESEND_GRACE_MS = 1_000` (`rust-runtime.ts:71`). The only control,
`rust-runtime.test.ts:1477`, drains at `advanceTimersByTimeAsync(500)` — inside the grace by
construction, so it proves the cancel wiring, not the margin. The live busy scenario ran with
`PIJ_TEST_SWALLOW_INJECT=1` (report.md:66), so **zero healthy custom envelopes were ever measured**.
The single real latency number in the report — `tool_result 1788926754831` → `message_start
1788926764642` (report.md:62) — is ~9.8s, ten times the grace. It is not the same measurement (that
message was injected *after* the boundary and waited for the next one), but it is the only evidence
available and it points the wrong way. report.md:66 concedes the point.

A duplicate is not recoverable downstream: `onMessageStart` (`:417`) only flips `consumed`; the
prompt copy is already in the model's context, and the peer sees the same instruction twice.

Ask (cheap, one seat): run the busy scenario once **without** the swallow flag and record the
delay between the `tool_result` extension event and the custom `message_start`. Set the grace from
that, or require two consecutive boundaries before the first resend.

**F5 — a claim that crosses compaction start is first delivered as `[pij resend 1]` and starts with
two attempts left.**

`:640-643` arms `boundaryDueAt` and returns without injecting. The post-bracket tick therefore takes
the resend branch (`:807`, `:827`), so the message's **first** appearance carries the
`[pij resend 1]` prefix (`pi-runtime.ts:59`) and one of three attempts is already spent. Fix: at
bracket close, inject normally instead of arming the boundary timer.

**F6 — the fault switch drops silently, and its symptom is identical to the bug being fixed.**

`pi-runtime.ts:66-71` returns with no `capture` and no `notify`. It cannot ship enabled by default,
but an inherited environment (exported var, or a spawned peer inheriting the parent env) would make
a seat drop every custom inject while looking exactly like plan 143's incident. One
`notify(…, "warning")` or `session.capture` on first use makes it self-evident. Documented correctly
at `docs/how/pij-rs-api.md` ("Compaction and resend", bullet 5).

**F7 — scope note, no action.** The boundary rule is harness-agnostic: `pi-runtime.ts:62` uses the
custom-message path for any `messageId`, not just OMP, and `rust-runtime.ts:398` does not branch on
harness. Plan 143 is OMP-scoped, but Pi seats get the new resend timing — and F4's duplicate risk —
too. Worth one sentence in the how-doc if it is intended.

## What is good

- The interlock/policy distinction is applied correctly and stated in the right terms (report.md:19).
- AC3 reads real daemon authority, not the fake — the SQL is recipient-scoped, body-only, terminal-only
  and non-mutating, so a heartbeat still cannot fabricate `ReaderRead`.
- The startup-peek/compaction race was found by the coder, run RED, and closed (`:508`, test `:1359`) —
  that is the class of bug this review would otherwise have had to find.
- `pendingConsumption` identity is re-checked after every `await` (`:735`, `:839`), which is what
  makes the single-counter guarantee in §2 hold under concurrency.
- Docs (AC6) match the implemented behaviour line for line, including the 20s-and-before-resend
  heartbeat cadence and the now-corrected peer-route rule.
