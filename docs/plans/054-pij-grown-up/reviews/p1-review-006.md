VERDICT: APPROVE — K1 root-cause dead; whole-of-P1 attested across all 19 findings (cycles 1–5); gates green. One non-blocking operational residual recorded below.

## Resolution attack — both cycle-5 resurrection probes re-run verbatim (root-cause DEAD)

**Evidence:** `.pi/extensions/pij/adapters/op-journal.ts:102-137` (clear), `:139-231` (pending sweep), `.pi/extensions/pij/adapters/atomic-file.ts:71-107` (fsyncDirBestEffort + writeJsonAtomic), `.pi/extensions/pij/core/cli.test.ts:2856-2978` (both probes as regressions).

`clear()` now writes a content-fsynced `<opId>.resolved` tombstone via `writeJsonAtomic` (temp fsync → rename → `fsyncDirBestEffort(opsDir)`) BEFORE the op unlink, and returns E-NOREG without unlinking if the tombstone write throws. `pending()` treats any `.json` coexisting with its `.resolved` tombstone as RESOLVED (excluded from the live list, op swept), a lone tombstone as garbage, and discards evidence only behind a load-bearing `fsyncDirBestEffort(opsDir)` proving the absence durable.

- **Aborted-intent forge after a winner** (cycle-5 probe 1): recovery sweeps the resurrected op+tombstone; the only `project-set` event is `winning-writer`'s; no forged `aborted-writer` event. PASS.
- **Committed false-block after B→C** (cycle-5 probe 2): recovery sweeps the resurrected op+tombstone; the B→C successor proceeds; two legitimate sets, no permanent false-block. PASS.

I re-attacked with a standalone real-fs probe against `FsOpJournal` directly:
- **A (faithful crash image, op+tombstone):** `pending()` presents 0 live and sweeps the op. Closed.
- **B (unfaithful image, op WITHOUT tombstone):** `pending()` presents 1 live → this image *would* re-forge, proving the tombstone is genuinely load-bearing and the whole safety property rests on `op-resurrects ⟹ tombstone-present`.
- **C (`clear()` resting state):** the only state `clear()` leaves is `{tombstone present, op absent}` — the tombstone is content-fsynced AND dir-fsynced (inside `writeJsonAtomic`) strictly before the unlink is issued. So image B cannot arise from `clear()` on any platform where directory fsync succeeds.

**Soundness boundary (honest):** the tombstone's directory entry rides the same `fsyncDirBestEffort` as every other durable publish in this store (`project-store.ts:59`, `spine-store.ts:172`, `atomic-file.ts:102`). Because the tombstone is dir-fsynced BEFORE the unlink, on any platform with working directory fsync (Linux/macOS — pij CI) or ordered metadata journaling (NTFS) the ordering `tombstone-durable ≺ op-absent-durable` holds, so a resurrected op is always accompanied by its tombstone. The tombstone is therefore never weaker than the project/once/spine data it protects; it fails only where the entire store already degrades to process-crash durability. This is the store's established, uniform floor — not a new weakness. K1 is root-cause dead to that floor.

## Tombstone-mechanism soundness (crash windows, sweep, growth, H2 interplay)

- **tombstone-written / unlink-lost:** op+tombstone → swept as resolved; op never presented as live. Safe. (`op-journal.test.ts:204-216`)
- **tombstone + op both resurrected:** same coexist path; the resurrected op is excluded from `out` at `op-journal.ts:180-191` BEFORE any removal — no forge/false-block even if the subsequent tombstone sweep or its dir fsync fails (the pair simply persists and retries). Safe.
- **lone tombstone:** garbage; removed only behind the load-bearing dir fsync that proves absence durable; if the op later resurrected it could not (its absence is now durable). Safe. (`op-journal.test.ts:225-229`)
- **tombstone fsync fails:** `writeJsonAtomic` throws → `clear()` returns E-NOREG naming the tombstone path, the op STAYS live, `pending()` still presents it (a squatting directory at the tombstone path is not evidence). No unlink without evidence. Safe. (`op-journal.ts:118-123`, `op-journal.test.ts:231-245`)
- **garbage-sweep correctness:** removal is gated on `sweepable.length > 0 && fsyncDirBestEffort(opsDir)`; when the fsync fails the sweep is skipped entirely, so evidence is never discarded non-durably. No sweep reopens the race.
- **H2 interplay (corrupt tombstone / torn resurrection):** a resurrected RESOLVED op with damaged bytes sweeps clean — the H2 "damaged safety record must wedge" law is deliberately (and correctly) scoped to LIVE records. A tombstone is only ever created by `clear()` for a genuinely-resolved op under a random-UUID stem (no reuse), so its filename alone is trustworthy evidence, and its content is atomically published (fsynced temp + rename) so it cannot be torn through the code's own path. Trusting the tombstone to sweep its paired op is sound. (`op-journal.test.ts:218-223`)

## Ruling adjudicated: mechanism 2 (fsynced tombstone) over mechanism 1 (load-bearing dir-fsync removal) — SOUND

Mechanism 1 makes directory fsync load-bearing inside `clear()`; but `fsyncDirBestEffort`'s own contract records that Windows cannot open a directory for fsync at all, so hard-durable removal would turn EVERY `clear()` into a permanent wedge on Windows — exactly the wedge the packet forbids. A bare resurrected op is byte-identical to a live crash record, so no recovery logic can distinguish them; only retained durable evidence can, and file-CONTENT fsync is durable on every platform. Mechanism 2 is the smallest sound choice and degrades on Windows to the house-documented process-crash floor, never to a wedge and never by discarding evidence. Rationale accepted.

## Regression + fence

Diff `3f91b22..0d295fe` is exactly as claimed: no new source files; `ports.ts` and `journal.ts` are comment/doc-only; `atomic-file.ts` widens `fsyncDirBestEffort` `void→boolean` (all four void callers unaffected — only the sweep branches on it); real logic lives only in `op-journal.ts`. fs↔fake contract parity holds: the tombstone is an fs-only durability artifact (an in-memory `FakeOpJournal` cannot experience resurrection, so it satisfies the abstract "never presented as live after a successful clear" guarantee vacuously) — the same fs-only-failure-mode precedent H2/M3 already set.

Gates (run in this worktree): `just typecheck` clean; full fenced platform+adapters+cli suite **729 passed / 1 skipped** (exact match to the orchestrator's number), both K1 probes green.

## Non-blocking operational residual (recorded, does NOT block APPROVE)

On dir-fsync-unsupported platforms (Windows), `fsyncDirBestEffort(opsDir)` returns false, so the sweep block never runs and `<opId>.resolved` tombstones accumulate permanently in `spine/ops/` — one per coupled write — and each `pending()` (every platform write verb) pays an O(N) `statSync` scan over them. This is unbounded growth + progressive per-write slowdown, Windows-only. It is the honest, *necessary* consequence of the cycle-5 retained-evidence requirement: where durable absence can never be proven, evidence can never be safely discarded. It has zero correctness/safety impact (`pending()` still enumerates and adjudicates correctly) and matches the store's already-accepted Windows durability floor. Recommendation for P2 (not a P1 blocker): either a bounded fallback (age/count cap on retained tombstones) or an explicit documented residual alongside the existing doubly-lost-clear residual.

## Whole-of-P1 attestation (all 19 findings, cycles 1–5)

- **Cycle 1–2 (F-series, G1–G4):** F1 atomic seq allocation, F3 canonical prev/next, F7 checked clock; G1 never-steal lock; G2/G3 phase-aware causally-ordered journal + machine-wide write lock + recovery gate; G4 complete-own-record canonicalization — all root-cause closed and unregressed (fence pins intact).
- **Cycle 3 (H1, H2, M3, M4, M5):** H1 committed-marker corroboration; H2 corrupt-entry wedge; M3 confirmed-absent clear; M4 own-`__proto__` preservation; M5 fake-lock contract twin — all closed.
- **Cycle 4 (J1, J2):** J1 coupled-op corroboration by state===next only (no once-override); J2 honest verb-side clear results — all closed.
- **Cycle 5 (K1):** durable resolution evidence — **now closed** by the fsynced tombstone; both resurrection probes pinned and re-attacked; no forge, no false-block, no wedge.

All 19 findings are root-cause complete. Phase 1 is safe to close.
