# Review r1 — AC judgements and composition seams

Companion to `review-r1.dd.json` / `review-r1.dd.md`.
Reviewer: `pij-thoughtful-manatee` (claude-opus-5). Branch `124-omp-event-reattach` @ `857527bd`, base `54fb7e95`.

Everything below was re-derived. Where I judge on the author's artifact rather than my own
observation, the row says so — per packet i7 the author's receipts are claims, not authority.

## Acceptance criteria (done-bar d1)

| AC | Verdict | Evidence I actually observed |
|---|---|---|
| AC1 — live inline body after restart, `message.pushed → delivery.inbox-ack`, no pointer | **TRUE (on artifact)** | `assets/live-restart-transcript.md`: spine rows 3–5 and 6–8 show `message.pushed → delivery.outcome → delivery.inbox-ack` for both msg_ids with no `delivery.pointer-announced`; target pane shows `[pij from pij-ok-trout] P124_AFTER_RESTART_INLINE` inline. I did not witness the run; the artifact is internally consistent (two hand-started seats, two distinct per-boot key hashes, ids and panes preserved across the restart). Isolated-daemon substitution is known-open (packet i8) and costs no finding. |
| AC2 — `pij_send` tool works post-restart | **TRUE (on artifact)** | Same transcript: the *target* seat — the one that lived across the restart — issued its own `pij send` after the key rotated and got `queued df218e0c…`, which is the bearer-authenticated path the plan says was broken. Structurally corroborated by me in code: `request()` (daemon-http.ts:246–263) re-reads `daemon.key` on 401/403 and retries exactly once. |
| AC3 — unit: reconnect with cursor, gap frames once, refused cursor → live-only + notice | **TRUE, with one qualification** | I ran the suite myself: `daemon-http.test.ts` 12/12, exit 0. Reconnect carries `since={alpha:7,beta:3}`; refusal test asserts attach 2 has `since`, attach 3 does not, and the notice names the daemon's reason. **Qualification:** the fake returns preset frames and does not implement `since`, so it cannot prove "exactly once" by itself. I closed that gap against the authority instead — `crates/store/src/spine.rs:74-82` replays `WHERE seq > ?1` (strictly exclusive) and `crates/daemon/src/events/mod.rs:85-110` refuses `since > newest` with `CursorBeyondSpine → 409 CursorReset`. Storing the last **seen** cursor is therefore correct. See finding F3 for the one window where it is not. |
| AC4 — unit: key rotation, one retry, no loop | **TRUE** | Ran it: `["Bearer old-key", "Bearer new-key"]`, and the always-401 client rejects with the daemon's message after exactly 2 fetches (`toHaveBeenCalledTimes(2)`). No loop. |
| AC5 — RED-first witnesses, typecheck, vitest, `harness checks` | **TRUE (RED-first independently reproduced)** | I did not take the author's word. I checked base `54fb7e95` into a throwaway detached worktree, copied in **only** the three new test files, and ran them: **6 failed / 18 passed** — matching the claimed 5 (u1) + 1 (u2). Failures are the substantive ones (no reconnect/cursor replay, no live-only fallback, no auth refresh, no bounded backoff, `cursor_reset` rejected, re-registration count 1 not 2). Then on the branch: `npx tsc --noEmit` **exit 0**; full `.pi/extensions/pij` suite **169 files / 4006 tests passed, 2 files & 15 tests skipped, exit 0**. `harness checks` — see note below. |

**`harness checks` — run and observed by me, not inherited.** All eight sensors pass, exit 0:
`local-paths`, `typecheck`, `lint`, `test`, `windows-compat`, `smoke`, `pkg-audit`, `snapshots`
(`{"ok":true,...,"next_action":"All checks green"}`). Together with the typecheck and full-suite
runs above, every green claim in `assets/execution.log.md` that I could re-run, I re-ran, and each
one held.

## Composition seams (done-bar d2)

| Seam | Sides | What crosses | Verdict |
|---|---|---|---|
| S1 — notice literal | u1 produces `"pij: re-attached…"` (daemon-http.ts:205, 215) · u2 triggers on `notice.startsWith("pij: re-attached")` (rust-runtime.ts:127) | a bare string literal restated on the consuming side | **Sound, and — unusually — actually witnessed.** This is the shape that normally ships dead (a literal restated on one side, both suites green, wire dead between them). Here it is not: the new `rust-runtime.test.ts` case drives the **real** `PijDaemonClient` through a **real** drop-and-re-attach and asserts both the exact notice strings and `registrations.toHaveLength(2)`. A wording change in u1 fails that test. No finding. |
| S2 — re-attach ordering | u1 emits the notice *before* pumping the new stream · u2 enqueues `ensureRegistration` onto `pushedChain` | ordering of re-registration vs replayed frames | **Sound and deliberate.** Because the notice fires at daemon-http.ts:205 before the loop breaks back to `pumpEventStream`, `ensureRegistration` is queued ahead of every replayed frame — so replay is acked against a seat that has already been re-registered. Getting this backwards would have acked against an unknown seat. |
| S3 — extension ↔ Rust daemon (cross-runtime) | `since` map + `cursor_reset` kind in TS · `EventQuery.since` + `ErrorKind::CursorReset` in Rust | JSON cursor map, refusal kinds, replay inclusivity | **Sound; verified against the Rust source, not the fake.** Unknown alias → `refused`; cursor beyond spine → 409 `cursor_reset`; both are accepted by `isCursorRefusal` (daemon-http.ts:341). `cursor_reset` added to `DaemonErrorKind` matches the Rust enum. Risk r4 (federation, multiple aliases) is handled — the whole map is sent and `subscribe_remote(&cursors)` consumes it. |
| S4 — shared `pushedChain` | `consumePushed` · `ensureRegistration` | serialization of injection and re-registration | **Works, with a coupling worth knowing.** They share one chain, so a slow or hung inject delays re-registration and two re-registration HTTP calls delay pending injections. Acceptable today (it is what makes S2's ordering guarantee hold), but it means one stuck inject freezes seat continuity too. Note only. |
| S5 — u1 → u2 error channel | `onError` passed by u2 (rust-runtime.ts:124) | stream/decode failures | **Broken — see finding F2.** The consumer is wired and correct; the producer never calls it. A live reader with no writer. |

## Interface drift from the impl-guide (priority 3)

- **Real drift:** the guide specifies "`onError` is now called only for terminal conditions (abort)". The implementation calls it for *no* condition, abort included. Filed as **F2**.
- **Not drift, guide imprecision:** the guide says the frame type "gains `cursor: {alias, seq}`". `EventFrame` already carried `machine: string; cursor: number` before this plan (`core/daemon-wire.ts:81-85`) and was not changed. Nothing gained, nothing broken — worth correcting in the guide so a future reader does not hunt for a shape that never existed.
- Everything else (u1 supervision around a pure `pumpEventStream`, no disk persistence of cursors, no Rust changes, additive `cursor_reset` only) matches the guide.

## Flowspace3 dogfooding (packet i1) — friction

Used `FS3_OUTPUT=json flowspace3 search "<question>"` per amendment 3.

- Rust-side questions work well: *"bounded exponential backoff reconnect loop"* returned `crates/daemon/src/federation/mod.rs` and `crates/daemon/src/pointer/worker.rs` at 0.55–0.57 (composition code 35 / doc 64) — genuinely useful for seeing how the Rust side already spells this.
- **Friction (distinct from the known-open `.pi` indexing gap):** a question phrased about *code consumers* — *"who consumes the daemon event stream notice callback"* — came back **doc 91 / code 10**, top hits being plan-review prose from plans 041 and 071 rather than any consumer. Two effects compound: the `.pi` tree is unindexed (known-open, i8), and the doc corpus is large and semantically close because plan prose *describes* the code. For consumer-discovery questions in this repo the index currently answers with commentary about the code instead of the code. I fell back to `grep` for every u1↔u2 consumer question in this review.
