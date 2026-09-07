# Code Review: Plan 139 — rs governance port (final composed artifact)

**Plan**: /Users/jordanknight/pi-hacking/fs3-rs-governance-port/docs/plans/139-rs-governance-port/plan.dd.json
**Specification / guide**: plan.dd.json (`summary`, `goals`, `non_goals`, `acceptance_criteria`) + /Users/jordanknight/pi-hacking/fs3-rs-governance-port/docs/plans/139-rs-governance-port/impl-guide.dd.json (`pij-team/impl-guide`, retained by explicit prime ruling)
**Packet**: /Users/jordanknight/pi-hacking/fs3-rs-governance-port/docs/plans/139-rs-governance-port/packet-reviewer.dd.json
**Phase**: whole composed artifact (phases ph-c0a1 … ph-a9c3)
**Subject SHA (exact, frozen)**: `335d20981c37c868f6039724f4a78b621c8bb7e2` on branch `139-rs-governance-port`, worktree clean (`git status --porcelain` empty)
**Baselines**: plan base `d964233d4cbf45400a6b2fc5f873de48909e7e38`; released main `63988ededb9a62a7e45cbd68b36e930b0631593b` (merge-base with the subject — the 139 delta is `63988ede...335d2098`)
**Date**: 2026-09-07
**Reviewer**: pij-zany-reptile (independent cross-model reviewer, pij peer)
**Harness / model — requested**: omp · `github-copilot/claude-opus-5` · effort `high`
**Harness / model — OBSERVED**: OMP v18.0.10; native session `01a07c38-90fe-7000-bd9b-d502b368ff43`; session journal records `model_change → github-copilot/claude-opus-5` (`resolvedModelIsFallback=false`) and `thinking_level_change → thinkingLevel=high`. Not inferred from spawn argv. Pane `%4233` (`pij:11.0`, window `p139-opus-review`), agent pid 69055 under `pij-rs __spawn-child` 69039.
**Admission canary**: `e957f6d290ec03af9fe02710b62bc882a911819af26c9d62` (returned to the PM before release).
**Testing approach**: Hybrid — Rust unit/integration contracts + isolated-daemon end-to-end + byte-parity goldens; production/chainglass arms are prime-owned and deliberately unclaimed.

## A) Verdict

**APPROVE WITH NOTES**

No CRITICAL and no HIGH **code** defect was found in the composed artifact. Every code-side acceptance clause I could decide read-only decides TRUE at source.

The one HIGH finding (F001) was an **evidence** gap, not a code defect, and it **closed during this review**: when first checked, no artifact referenced the frozen SHA and the newest executed full gates were RED at `e6a2d5d5`; the PM then landed `assets/rust-gate-335d-green.txt`, `assets/engineering-gate-335d-green.json` and `assets/final-gates-proof.json`. I verified those at their raw output rather than at the receipt — zero `FAILED`/`panicked` lines, `pij-gate: all stages green` across toolchain/lock/fmt/clippy/test/arch (`arch PASS 9 crates, 0 violations`), the previously failing `daemon_death_mid_stage_restores_input_within_bound` passing at line 556, and the tmux adapter suite reporting `ok. 32 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out` at line 591 — the same 32 tests as the RED run's 31 passed + 1 failed, so nothing was skipped or filtered to obtain the green. `harness checks --json` reports `ok:true` with every required sensor passing and a single advisory `warn` on `pij-commit-trailers` at exit code 0. Source is unchanged since my read (`git status --porcelain` lists only `docs/plans` assets), so the reviewed subject is still the frozen artifact.

What remains open is two traceability items and the prime-owned arms — neither is a code defect.

**Key failure areas**:
- **Implementation**: none. The four "least confident" areas named in the packet (cancellation-shielded publication and shutdown ordering; SQL pool/sequence coherence through fixture replacement; dispatch/decision side-effect and receipt ordering under cancellation/retry; CLI native/shim parity with no legacy fallback) all hold at source.
- **Evidence**: F001 raised and closed within this review; two traceability defects remain in receipts/task rows (F002, F003).
- **Doctrine**: none — no project-rules violation observed in the reviewed delta.
- **Reinvention**: none — the port replaces the legacy surface rather than duplicating it; the legacy TS governance path is refused, not shadowed.

## B) Summary

The port lands as one governance world. `INSERT INTO spine_events` exists at exactly one site (`crates/store/src/spine.rs:48`); every governance mutation reaches it through `append_in_transaction` inside the same SQLite transaction that mutates the domain row, and every publication goes through `EventBus::publish_committed`, which takes an owned lock and completes the commit-and-broadcast pair inside a spawned task so caller cancellation cannot strand a persisted-but-unbroadcast row. Subscribers take the live receiver *before* reading the tail and refuse an impossible cursor by name (`CursorBeyondSpine`), so a cursor cannot advance past an unemitted row.

Destructive lifecycle is genuinely conservative. `reap` treats unknown evidence as a brake in the strict sense: removing any UNKNOWN branch would reap *more*, never differently. The `ps` protocol is exact — exit 1 with the literal `PIJ_LSTART` header and empty stderr is the only absence proof; exit 0 with a row is live; everything else (stderr, other exits, signals, malformed or extra rows) becomes an adapter error that surfaces as `unverifiable` and never reaps. Candidacy is `(dead OR recycled) AND (recorded pane absent OR paneless)`, matching AC7 literally, and the tombstone commit is CAS-guarded on the whole descriptor with a rollback witness.

Decisions implement each AC6 clause distinctly rather than approximately: the self-answer branch is discriminated on `actor != asker.id`, producing `answer_msg_id = null` and no push; supersession is restricted to the asker's *current* parent, requires both queue and spine to be real SQL authorities (`E-RS-ANSWER-AUTHORITY-SPLIT` naming both), and refuses in-transit and delivered intents by name (`E-RS-ANSWER-IN-TRANSIT`, `E-RS-ANSWER-DELIVERED`) with no withdrawal path introduced.

The shim guard is real, not decorative: the coverage test reads the actual `skills/pij/SKILL.md` at test time, parses the CLI-verb table, and a mutation test injects a synthetic verb into that real text and asserts the guard throws. Every verb in the table is routed or refused with `E-RS-UNPORTED` naming the ledger; no fall-through, no legacy fallback.

Evidence quality was the weak edge when the review opened and is now materially better: local and isolated proofs are strong and largely raw, and the frozen SHA acquired its own green `pij-gate` and `harness checks` run mid-review (F001, closed). What remains is bookkeeping — several receipts and checked task rows still cite superseded commits and ephemeral coder worktrees.

## C) Checklist

**Testing approach: Hybrid**

- [x] Core validation tests present for every ported governance verb (unit, HTTP, store, CLI integration)
- [x] Critical paths covered — spine single-writer, cancellation, ownership, reap evidence, decision authority
- [x] Key verification points documented with observed outcomes (isolated daemon workflow, byte parity, canary)
- [x] Only in-scope files changed — 150 non-doc files in `63988ede...335d2098`; no main-checkout, global-state or government mutation in the delta
- [x] **Full gates green on the reviewed SHA** — `assets/rust-gate-335d-green.txt` (`pij-gate: all stages green`) and `assets/engineering-gate-335d-green.json` (`ok:true`, no required sensor skipped), both bound to `335d2098` by `assets/final-gates-proof.json` (F001, closed)
- [x] Domain compliance — N/A (domain mode off; the canonical plan declares no domain manifest)
- [x] Production/chainglass arms presented as pending, never fabricated green

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH → **CLOSED** | was: assets/rust-gate-e6a2-red.txt:598-610 · assets/engineering-gate-e6a2-red.txt:1 — now: assets/rust-gate-335d-green.txt:556,591 · assets/engineering-gate-335d-green.json · assets/final-gates-proof.json | evidence | No green full gate bound to `335d2098` when the review opened; the PM landed both gates mid-review, exit 0, verified at raw output | **Closed — no action.** Same 32 adapter tests as the RED run, nothing filtered; previously failing test now `ok` |
| F002 | MEDIUM | assets/tasks/phase-1/tasks.dd.json (tk-11a1, tk-12a1) · assets/tasks/phase-2/tasks.dd.json (tk-20a2, tk-21a2, tk-22a2) | traceability | Tasks marked `checked` cite receipt commit `0a7a2673`, a pre-merge wave-1 checkpoint superseded by `d0cd734c`, `5eda7fc2`, `78531a0b`, `e6a2d5d5`, `335d2098` | Re-point those receipts at the composed execution entries (`lg-0009`/`lg-0012`) so "checked" names the composed state |
| F003 | MEDIUM | crates/testkit/fixtures/golden/api/governance-client-parity.json (`source_base`) | traceability | `source_base` = `78531a0b`, but all 30 pinned `source_snapshot` digests match the frozen tree, and all 30 of those files changed after `78531a0b` | Set `source_base` to the actual capture commit, or rename the field to `previous_capture_commit` (its `history` twin already uses that name) |
| F004 | LOW (note) | crates/core/src/anomalies.rs:131-139 | parity | Relay evidence renders `join(",")` / `"none"` where legacy `.pi/extensions/pij/core/daemon/anomaly-sweep.ts:133` renders `join(", ")` / `"(none)"` | Unreachable today (every detector emits exactly one seq). Align the two spellings before any detector emits 0 or ≥2 sequences |
| F005 | NA (refuted) | crates/core/src/anomalies.rs:220-227 | parity | A critic reported `AnomalyThresholds::default()` hardcoding a 10-minute stale threshold | **Refuted at source** — line 223 reads `status_stale_ms: STATUS_STALE_MS`. No action |

## E) Detailed Findings

### E.1) Implementation Quality — no material findings

Verified at source, each against the packet's named priorities:

**Sole spine writer (AC1).** `grep -rn 'INSERT INTO spine_events' crates/store/src` returns exactly one line: `crates/store/src/spine.rs:48`. Every other occurrence in the tree is a test fixture (SQLite `CREATE TRIGGER … BEFORE INSERT` fault injections, a seeded row in `crates/store/tests/store_integration.rs:78`, and the guard test's own needle construction in `crates/daemon/src/events/governance_tests.rs:281`), none of which is a production write path.

**Cancellation shielding (packet i3.1).** `crates/daemon/src/events/mod.rs:100-122`:

```rust
let guard = self.publish_lock.clone().lock_owned().await;
let live = self.live.clone();
tokio::spawn(async move {
    let _guard = guard;
    let (event, result) = commit.await?;
    …
    let _ = live.send(event);
    Ok((seq, result))
}).await
```

The commit-and-broadcast pair runs in an owned task holding the ordering guard, so dropping the caller's future (client disconnect, `select!` loss, request abort) cannot leave a persisted row unbroadcast. The doc comment is honest about the one case it cannot shield (runtime termination) and pairs it with `flush()` (`:130-132`), which is awaited during shutdown after producers stop. Cancellation *before* admission starts no work.

**Follower ordering / cursor safety (AC1).** `subscribe` (`:142-168`) takes the live receiver **before** reading the tail, so a row appended during replay lands on at least one leg and sequence comparison removes the overlap; a `since` beyond the newest sequence is refused by name rather than silently filtered — the comment records that the silent-filter version made a reset peer emit nothing forever while reading Connected.

**Destructive atomicity (AC7, packet i4).** `crates/store/src/registry.rs:48-105`: one `begin_write` transaction performs the full-descriptor CAS (`E-RS-INCARNATION-CHANGED` on mismatch, with `tx.rollback()`), `append_in_transaction` for `seat.tombstone`, then the row `UPDATE`; `rows_affected == 0` rolls back to `NoRegistryEntry`; only then `tx.commit()`. `/v1/seats` excludes tombstoned rows at `crates/daemon/src/http/mod.rs:2276-2277`, so "removes the row from /v1/seats" is satisfied by the same committed transaction.

**Reap evidence semantics (AC7).** `crates/daemon/src/reaper.rs:64-101` — `Active ⇒ Retain`; `Dead|Recycled ⇒` pane check; recorded pane present `⇒ Retain`; pane absent `⇒` candidate; **any** probe error `⇒ Unknown(reason)` pushed to `unverifiable`; missing process identity `⇒ Unknown("process-identity-unavailable")`; `pane: None ⇒ "paneless"`, deciding on process identity alone. Eligibility is re-derived a second time immediately before the CAS (`:157-177`), so a concurrent revive turns into `liveness-changed`, not a tombstone. `dry_run` returns before any write. The module header states the brake correctly: *"Unknown evidence is a brake: removing it permits the same set or more reaps."*

**`ps` absence protocol (AC7).** `crates/harnesses/src/proc.rs:105-140`. Non-`{0,1}` exit **or** any stderr ⇒ adapter error. Header must equal `PIJ_LSTART` exactly. Then `(Some(1), None, None) ⇒ Ok(None)` (absence), `(Some(0), Some(row), None) ⇒ parsed start` (live), everything else ⇒ error. Failed-empty output, diagnostics, malformed output, extra rows and signals therefore all stay UNKNOWN and never reap. Recycled pids are caught by `proc_start` comparison in `crates/core/src/liveness.rs:23-33`, which returns `Recycled` for a *different* start in either direction rather than collapsing it to Active or Dead.

**Decision authority and push discrimination (AC6).** `crates/daemon/src/http/decisions.rs:192` — `let msg_id = (actor != &asker.id).then(|| …)` is the exact discriminator: a self-answer carries no msg id, performs no `delivery.accept`, and closes with `answer_msg_id` null (`:198-207`, `:244-260`); an authorized non-asker answers with a stable msg id and the row closes **only** after a `Queued|Delivered` receipt (`:227-237`), with the same msg id reused on retry so the intent is immutable. Supersede (`:180-190`) requires `current.parent == actor && current.id != actor`, then requires both backends real, refusing `E-RS-ANSWER-AUTHORITY-SPLIT` with **both** backends named in the record. Terminality is enforced in the store (`crates/store/src/decisions.rs:290-335`): delivered ⇒ `E-RS-ANSWER-DELIVERED`; any non-failed job row or a `held` outcome ⇒ `E-RS-ANSWER-IN-TRANSIT`; a completed `refused` outcome is terminal and allowed. The superseding write retains the old id/answerer/text under `superseded` in the `answer-superseded` event. No withdrawal or cancellation path was introduced.

**Delivery semantics (packet i4, "no drift from #373/#374").** The final fix commit `e6a2d5d5` adds a *new* verified paneless pull path (`claim_pull_inbox`) gated behind an explicit `pull_liveness` argument that only the external-register path supplies; existing pane-bound push semantics are untouched. Two tightenings are conservative (more refusal, never more delivery): native typing observation now additionally requires `native_extension_delivery`, and lease-expiry invalidation widens to any identity-supplied claim (`tuple_bound`). `recipient.proc.expect("paneless pull has a host identity")` is guarded — `paneless_pull()` (`crates/daemon/src/delivery/mod.rs:79-91`) requires `seat.proc.is_some()`, so the `expect` is locally proven unreachable.

**Final commit hygiene (`335d2098`, test-only).** I confirmed the claim rather than accepting it. It touches `crates/tmux/tests/adapter.rs` and `.pi/extensions/pij/cli.integration.test.ts` only (plus assets). Neither change weakens an assertion:
- `pane_input_off` now asserts tmux command success and panics on a non-boolean instead of silently comparing to `"1"`; the timeout path emits `pane_id|pane_pid|pane_input_off|pane_title` plus the marker owner and stderr instead of a bare "did not converge"; the fixture is isolated with `-f /dev/null` and `SHELL=/bin/sh`. **The 2 s recovery bound is retained** — `daemon_death_mid_stage_restores_input_within_bound` still calls `wait_for_pane_input(…, Duration::from_secs(2))` (`crates/tmux/tests/adapter.rs:570`).
- `inbox register` moves out of the blanket closed-verb list into a dedicated, *stricter* assertion: exit 4, `error: refused` with `details.code = E-AMBIG`, exactly one request (`GET /health`), legacy snapshot unchanged, no tmux invocation.

### E.2) Domain Compliance

N/A — domain mode off; `plan.dd.json` declares no domain manifest and the repository has no `docs/domains/` registry for this plan. Not a failure.

### E.3) Anti-Reinvention

| New component | Existing match? | Domain | Status |
|---|---|---|---|
| `crates/core/src/decisions.rs`, `crates/daemon/src/http/decisions.rs` | Legacy TS decision store | legacy (being retired) | proceed — replacement under an explicit cutover, not a parallel implementation |
| `crates/daemon/src/reaper.rs` | Legacy TS death-reconciler | legacy | proceed — legacy path refused, not shadowed |
| `crates/core/src/anomalies.rs` | Legacy `core/anomalies.ts` + `daemon/anomaly-sweep.ts` | legacy | proceed — deliberate re-derivation over the rs spine; relay vocabulary preserved (see F004) |
| `crates/cli/src/{governance,lifecycle,role,decisions,anomalies}.rs` | `RS_ROUTE_TABLE` shim rows | rs | proceed — one native surface plus one refusing shim; no third path |

No genuine duplication found: every new component either replaces a legacy component whose path is now refused, or is the single native implementation behind the shim.

### E.4) Testing & Evidence

**Coverage confidence: 90%** (raised from 82% when the frozen SHA's own green gates landed and were verified; the residual deduction is the prime-owned production/chainglass arms).

Proven by raw executed deterministic output (spot-checked against the artifacts, not accepted from prose):
- byte-for-byte client parity, 66 matched pairs, `comparison: "Original UTF-8 stdout, no normalization; final LF only when absent; exit policies remain distinct"` — `assets/parity-final-proof.json` + `crates/testkit/fixtures/golden/api/governance-client-parity.json`. I independently re-verified all 30 `source_snapshot` digests against the frozen worktree: **30/30 match** (`sha256sum -c`), so the pinned corpus is the frozen artifact's corpus despite the mislabelled `source_base` (F003).
- native keeper-notice suite 13/13 (`assets/native-gate-targets-output.txt`, `assets/native-notice-proof.json`); real OMP model canary turn with nonce and recipient SHA ack (`assets/actual-omp-canary-proof.json`); paneless protocol smoke, exit 0 (`assets/paneless-smoke-proof.json`); proc-liveness contract suite (`crates/harnesses/src/proc.rs` tests).

Executed on the frozen SHA itself (landed mid-review, verified at raw output rather than at the receipt):
- `assets/rust-gate-335d-green.txt` — zero `FAILED`/`panicked` lines; `pij-gate: all stages green` over toolchain/lock/fmt/clippy/test/arch; `arch PASS 9 crates, 0 violations`; `daemon_death_mid_stage_restores_input_within_bound ... ok` (line 556); tmux adapter suite `ok. 32 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out` (line 591) — the same 32 tests as the RED run's 31 passed + 1 failed, so the green was not obtained by removing, skipping or filtering a test.
- `assets/engineering-gate-335d-green.json` — `ok:true`; `local-paths`, `typecheck`, `lint`, `test`, `copilot-native`, `windows-compat`, `smoke`, `pkg-audit`, `snapshots` all pass; `pij-commit-trailers` warn at exit code 0 (advisory attribution sensor, no invented identity). `skipped: []`.
- `assets/final-gates-proof.json` binds both runs to `source_sha 335d20981c37c868f6039724f4a78b621c8bb7e2`.

Still not executed, by design and by ownership:
- production stamped events / auto-reap (AC2, AC7 production arms) and chainglass confirmation (AC3, AC9, `tk-42a4`) — correctly presented as pending and prime-owned, nowhere fabricated green.

Author honesty is good where it matters: `assets/receipt-u6.json` declares its own work UNRUN ("READY is not DONE"), `receipt-u3-canary.json` labels itself "authored but not run", and `receipt-u4-native-notice.json` says "READY_TO_VALIDATE is not acceptance". Formatter/lint success is nowhere presented as behavioral proof; the retained `u6-lint-failure*.txt` are historical RED, not green claims.

Backpressure integrity: every AC maps 1:1 to `bp-0001…bp-0009`; phase-3/4 `done_when` assertions link `pressure` to real rows; phase-1/2 `proven_by` links resolve to real `execution-log.dd.json` entries. No broken pointers found — the defect is staleness (F002), not dangling links.

### E.5) Doctrine Compliance

No violation found in the reviewed delta. Two doctrine points worth recording positively, because they are the kind that usually rot:
- the reaper header states the brake-vs-policy distinction explicitly and correctly — removing the UNKNOWN branch would delete *more*, so it is an interlock, not a retention policy;
- `crates/core/src/liveness.rs` documents why a pid is not an identity and why `Recycled` is a third outcome rather than a coerced Dead/Active.

## F) Coverage Map

| AC | Description | Evidence | Verdict | Confidence |
|----|-------------|----------|---------|------------|
| AC1 | One spine writer; both subscribers receive `report now` + `adopt`; cursor never past an unemitted row | `crates/store/src/spine.rs:48` (grep = 1 hit) · `events/mod.rs:100-168` · `store_registry.rs::forbid_direct_insert_outside_spine` · `assets/green-proof-wave1.json`, `assets/native-cli-workflow-proof.json` | **TRUE** (code + isolated) | 90% |
| AC2 | `seat.put` `at` within 1 s and payload decodes to `SeatDescriptor`; tombstone has `at` + reason | `store/src/registry.rs` (`registry_event`, real clock) · `assets/native-cli-workflow-proof.json` (`adopt_at`, `adopt_seq`) | **TRUE (isolated); production arm PENDING (prime)** | 85% local / 0% production, by design |
| AC3 | Role asserted, self-or-parent only, third seat refused, projected onto `/v1/seats`, StateCard, `list` | `http/role.rs`, `role_tests.rs`, `registration.rs`, `http/mod.rs` (`join_roles`) · `assets/role-projection-proof.json` | **TRUE (local); chainglass arm PENDING (prime)** | 85% local |
| AC4 | Full governance sequence on rs + shim identical JSON, pinned as goldens; literal-kind caller-attributed append | `governance-client-parity.json` (66 pairs, no normalization) · `governance-routes.json` · `assets/parity-final-proof.json` · `assets/native-cli-workflow-proof.json` | **TRUE (isolated)** | 88% |
| AC5 | Anomalies computed from rs only; parked suppressed; verify clears unverified-done; one named constant; relay text parity | `core/src/anomalies.rs:22,220-227` (`STATUS_STALE_MS`, single owner) · `http/anomalies.rs` (query-time, no writes) · `cli/tests/governance_boot.rs` (verify clears, re-done reopens) | **TRUE**; latent unreachable relay divergence (F004) | 87% |
| AC6 | Question → parent; answer pushes and closes; self-answer no push (`answer_msg_id` null); terminal-only supersede by current parent; authority split refusal | `http/decisions.rs:150-262` · `store/src/decisions.rs:120-193,290-335` | **TRUE** | 90% |
| AC7 | Owner close tombstones atomically; `E-RS-OWNERSHIP`; conservative reap; UNKNOWN never reaps; recycled-pid safe; dry-run writes nothing | `store/src/registry.rs:48-105` · `reaper.rs:64-204` · `harnesses/src/proc.rs:105-140` · `http/lifecycle.rs` | **TRUE (isolated); production receipt PENDING (prime)** | 90% local |
| AC8 | Every skill-table verb routed or `E-RS-UNPORTED`; enforcement test reads the real table; `anomalies` off legacy | `core/generation-skill-coverage.test.ts:5-51` (reads real `skills/pij/SKILL.md`, mutation test throws) · `generation-routing.ts:136-292` · `cli.ts` | **TRUE** | 92% |
| AC9 | Routes cite rs verbs and refusals; `docs/how/pij-rs-api.md` documents fields, frames, cursor, auth, every route with pinned samples + supersession/withdrawal/authority clauses | `skills/pij/**` (legacy-verb grep in ported rows = 0) · `docs/how/pij-rs-api.md` · golden fixtures | **TRUE (documentation half); chainglass confirmation PENDING (prime)** | 85% doc half |

**Overall coverage confidence: 90%.** The deduction is entirely the four deliberately prime-owned production/chainglass arms — not defects, but exactly why "accepted local code" is not whole-plan or production acceptance.

## G) Commands Executed

All read-only. No build, test, formatter, linter, daemon, commit or code edit was run.

```bash
git rev-parse HEAD                                        # 335d20981c37c868f6039724f4a78b621c8bb7e2
git status --porcelain                                    # clean at read; later: docs/plans assets only (PM gate evidence)
git merge-base 63988ede 335d2098                          # 63988ede… (released main is the merge base)
git diff --stat  63988ede...335d2098                      # 299 files
git diff --name-status 63988ede...335d2098                # -> reviews/_computed.manifest.txt (150 non-doc files)
git show --stat e6a2d5d5 335d2098
git show 335d2098 -- crates/tmux/tests/adapter.rs .pi/extensions/pij/cli.integration.test.ts
git show e6a2d5d5 -- crates/daemon/src/delivery/mod.rs
grep -rn 'INSERT INTO spine_events' crates/store/src      # exactly one hit: spine.rs:48
jq -r '.source_snapshot|to_entries[]|"\(.value)  \(.key)"' \
  crates/testkit/fixtures/golden/api/governance-client-parity.json | sha256sum -c   # 30/30 OK
ddocs schema show builder/review
grep -c 'FAILED\|panicked' assets/rust-gate-335d-green.txt # 0
grep -n 'test result:' assets/rust-gate-335d-green.txt     # adapter suite line 591: 32 passed; 0 failed; 0 filtered
jq -r '.data.results[]|"\(.name)\t\(.status)"' assets/engineering-gate-335d-green.json
```

**Computed diff** — persisted at `assets/reviews/_computed.diff` (2.2 MB, 56 624 lines, 150 file diffs), produced by:

```bash
git diff 63988ededb9a62a7e45cbd68b36e930b0631593b...335d20981c37c868f6039724f4a78b621c8bb7e2 \
  -- . ':(exclude)docs/**' > assets/reviews/_computed.diff
```

**Declared exclusion**: `docs/**` only. That removes the plan's own dossier, receipts, ledgers and generated `.dd.md` views — none of which is subject code — and leaves every reviewed source, test, fixture, harness and skill file. The 150 file diffs it contains match the 150 non-doc entries in `_computed.manifest.txt` exactly, so the exclusion drops no reviewed file. The diff was regenerated from the same two commits after the verdict; no analysis was re-run and no finding changed.

## H) Handover Brief

**Review result**: APPROVE WITH NOTES

**Plan**: /Users/jordanknight/pi-hacking/fs3-rs-governance-port/docs/plans/139-rs-governance-port/plan.dd.json
**Guide**: /Users/jordanknight/pi-hacking/fs3-rs-governance-port/docs/plans/139-rs-governance-port/impl-guide.dd.json
**Subject**: `335d20981c37c868f6039724f4a78b621c8bb7e2`
**Tasks dossier**: /Users/jordanknight/pi-hacking/fs3-rs-governance-port/docs/plans/139-rs-governance-port/assets/tasks/phase-{1,2,3,4}/tasks.dd.json
**Execution log**: /Users/jordanknight/pi-hacking/fs3-rs-governance-port/docs/plans/139-rs-governance-port/assets/execution-log.dd.json
**Review file**: /Users/jordanknight/pi-hacking/fs3-rs-governance-port/docs/plans/139-rs-governance-port/assets/reviews/review.final-composed.md
**Review receipt (ddoc)**: /Users/jordanknight/pi-hacking/fs3-rs-governance-port/docs/plans/139-rs-governance-port/assets/reviews/review-receipt.dd.json (built view: `review-receipt.dd.md`)
**File manifest**: /Users/jordanknight/pi-hacking/fs3-rs-governance-port/docs/plans/139-rs-governance-port/assets/reviews/_computed.manifest.txt
**Computed diff**: /Users/jordanknight/pi-hacking/fs3-rs-governance-port/docs/plans/139-rs-governance-port/assets/reviews/_computed.diff (subject code diff, `docs/**` excluded)

### Composition seams examined

| Seam | Units | Finding |
|---|---|---|
| EventBus ↔ SqliteRegistry (`RegistryPublisher`) | u1 ↔ u2/u5 | Clean — the registry's commit closure runs *inside* the bus's admitted, guarded task, so registry mutations inherit the spine's ordering and cancellation shield instead of duplicating them |
| Spine ↔ decisions/governance/role stores | u1 ↔ u3/u4 | Clean — all use `append_in_transaction` in the same tx as their row write; no store owns a second sequence source |
| Decisions ↔ delivery | u4 ↔ #373/#374 delivery | Clean — the answer closes only on a durable `Queued|Delivered` receipt, and retries reuse the prepared msg id, so the seam is idempotent rather than at-most-once |
| Reaper ↔ registry CAS ↔ liveness/tmux ports | u5 ↔ u1/u2 | Clean — eligibility is recomputed immediately before the CAS, and the CAS compares the whole descriptor, so the two-phase read cannot retire a revived seat |
| CLI/shim ↔ daemon HTTP ↔ skill verb table | u6 ↔ all | Clean — one table, parsed from the real skill doc by the guard; goldens pin native and shim output from the same daemon |
| Merge seam with released main `63988ede` (controls, bg jobs) | u0..u6 ↔ main | Clean in the reviewed delta — controls/`compact-self`/`bg` remain routed and supported; no governance verb regressed to legacy |

### Required actions (none blocking merge on code grounds)

| # | Owner | What | Why |
|---|---|---|---|
| 1 | — | ~~Land the raw gates for `335d2098`~~ | **F001 done during this review** — `rust-gate-335d-green.txt`, `engineering-gate-335d-green.json`, `final-gates-proof.json`; verified at raw output |
| 2 | PM | Re-point phase-1/2 checked receipts at composed execution entries | F002 — "checked" currently names a superseded pre-merge commit |
| 3 | PM | Fix or rename `source_base` in `governance-client-parity.json` | F003 — the label resolves to bytes that are not the pinned ones |
| 4 | Prime | Production AC2/AC7 receipts, chainglass AC3/AC9 confirmation, `tk-42a4` | Owned above this review; correctly blocked, not fabricated |
| 5 | Anyone touching anomalies | Align relay `join`/empty spelling before a detector emits 0 or ≥2 evidence seqs | F004 — latent byte-parity trap, unreachable today |

### Handback

Accepted **local** code review. This is not production acceptance and not whole-plan acceptance: the production and chainglass arms remain prime-owned and explicitly blocked, and `tk-42a4` stays blocked, not manufactured green.

The gate condition stated when this review opened has been met: both full gates now exit 0 on `335d2098` with no required sensor skipped, and I verified that at the raw output rather than at the receipt — including that the adapter suite still runs all 32 tests, so the green is not a filtered green. The verdict therefore stands as **APPROVE WITH NOTES** with only two traceability items (F002, F003) and one latent-parity note (F004) outstanding, none of which blocks merge on code grounds.

If any source file changes after this SHA, the artifact is no longer the reviewed subject and the delta must come back through review.

---

## Addendum — bounded re-review of the traceability correction

**Re-reviewed**: the PM's metadata-only correction delta for F002 and F003, applied on top of the subject SHA. **Runtime code unchanged** — the only non-doc files touched are `crates/testkit/fixtures/golden/api/governance-client-parity.json` (one deleted line) and `crates/testkit/fixtures/MANIFEST.toml` (its digest). Read-only again: no validators re-run, no analysis repeated.

**F002 — accepted, closed.** The five rows now cite `execution-log.dd.json#entries/lg-0014` instead of the superseded `0a7a2673; …lg-0002`, and their assertions replace `pressure: not-applicable` with the real rows `bp-0001`, `bp-0003`, `bp-0004`. `lg-0014` is an execution entry, not a claim: canonical Rust gate exit 0 across all six stages with a 9-crate zero-violation architecture pass, plus complete engineering checks exit 0 with no skips at `2026-09-07T14:59:32.894Z`, naming the three raw artifacts. Original notes and historical logs retained.

**F003 — accepted, closed; the implementation is better than the fix I proposed.** Rather than renaming the corpus key and leaving two labels for one fact, the PM deleted the redundant `source_base` (its `history.previous_capture_commit` already recorded the `78531a0b` lineage) and renamed the only `source_base` in the parity *receipt*. I verified byte-equality instead of accepting it:

| Check | Result |
|---|---|
| Fixture diff | exactly one deleted line (`source_base`) |
| `MANIFEST.toml` | 112 803 → 112 742 bytes = the 61-byte line; `a9311375…` → `8ac16285…` |
| Digest vs disk | `sha256sum` of the file equals the new manifest digest |
| Semantic equality | `diff <(git show HEAD:… \| jq -S 'del(.source_base)')  <(jq -S . …)` → **IDENTICAL** |
| `source_snapshot` | still **30/30 OK** against the frozen tree |
| Provenance | old capture digest retained as `captured_corpus_sha256`; `review-traceability-correction.json` records `runtime_source_changed: false`, which the diff confirms |

Every captured stdout byte, pair and count is unchanged. Provenance is strictly better than before, because the original capture identity is retained rather than overwritten.

**F006 — NEW, MEDIUM.** All five newly checked acceptance criteria (AC1, AC4, AC5, AC6, AC8) carry `proven_by: assets/execution-log.dd.json#entries/lg-0015` — the entry recording *this review*. A review is a judgement about evidence, not evidence; it executes nothing. AC1 is the sharpest case: its text demands a live two-subscriber control, an execution that genuinely exists (`green-proof-wave1.json`, `native-cli-workflow-proof.json`) but is no longer what the AC points at. My AC1 verdict was "TRUE (code + isolated)" — a reading of that control, not a re-run of it. The same document does this correctly everywhere else: every backpressure row and every task/`done_when` row cites `lg-0014`, an actual execution. **Smallest fix**: point each checked AC's `proven_by` at the executed entry carrying its witness, and keep `lg-0015` as a corroborating `links` reference.

**F007 — NEW, MINOR (process).** The correction was announced as bounded (F002 rebinding, F003 rename) but the delta also flips `unchecked → checked` on `tk-30a3`, `tk-31a3`, `tk-32a3`, `tk-40a4`, their `done_when` assertions, `bp-0005…bp-0008`, phase `ph-e6f8`, and five ACs. Those are acceptance decisions, not traceability corrections. **On the merits I support each**: the phase-3 tasks hold prior named RED/GREEN plus the composed dual-green; `tk-40a4`'s AC8 surface is entirely local with a real guard; the five ACs are exactly the ones I judged TRUE with no prime-owned arm; and everything with a production or chainglass arm — AC2, AC3, AC7, AC9, `tk-41a4`, `tk-42a4` (still `blocked`), phase `ph-a9c3` — was correctly left unchecked or blocked. So this is a scope-declaration defect, not a false claim; but an ACK given against the announcement alone would have covered more than the announcement described.

**Addendum verdict**: the APPROVE WITH NOTES verdict on `335d20981c37c868f6039724f4a78b621c8bb7e2` is **unchanged**. F002 and F003 are closed. F006 and F007 are new, both PM-owned, neither involving runtime code and neither blocking. `tk-42a4` and the production/chainglass arms remain blocked and prime-owned.
