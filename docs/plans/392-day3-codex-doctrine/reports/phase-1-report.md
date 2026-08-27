# Phase 1 report — 3b Telegram forwarder on the sqlite queue + honest pull receipt

**Seat**: pij-falling-outside · **Date**: 2026-08-27T09:2xZ · **Status**: MERGED (PR #1 → main 27077052) on APPROVE_WITH_NOTES; verdict later changed to FIX_REQUIRED (test-coverage hole, mutation 6) → FX001 follow-up fix in flight

## claim
Phase 1 (3b) approved: cold reviewer pij-pale-araminta APPROVE_WITH_NOTES at 3501f855 (Dim-0 4/4 RED→GREEN); orchestrator sanity re-run of mutation 1 matched (2 RED / 80 GREEN, byte-identical restore); live AC-07 PASS on the same sha (phone oracle pending); coder verified (`pij report verify`); PR opened from branch s392/3b-telegram-sqlite-forwarder @ 3501f855.

## artifacts[]
- commits on `s392/day3-codex-doctrine`: `69f1c4524c39340ff63c26ba498fd489ca3faeec` (impl, 12 files, +911/−128), `3501f8558276ade4e10e40a42e3ffd1d5e56816b` (handover + execution log)
- docs/plans/392-day3-codex-doctrine/reports/phase-1-handover.md (bridge start cmd, row-149 retire SQL, AC-07 proof)
- docs/plans/392-day3-codex-doctrine/reports/phase-1-coder-report.json
- docs/plans/392-day3-codex-doctrine/tasks/phase-1-telegram-sqlite-forwarder/execution.log.md
- docs/plans/392-day3-codex-doctrine/reviews/phase-1-review-packet.md → reviews/phase-1-review.md (sha 52fd98c62a713e53a9102c390bd8a62682b0353e8d44efe5e492591b6dffd5d4, APPROVE_WITH_NOTES, 6 findings none ≥ medium)
- docs/how/pij-telegram.md § Queue backend & restart semantics

## shas[]
- plan v1.3.0 4946aac20e24544eb6123e2c11f0f942bc482c9d9d647cb0679469d0a80bcbb4 · dossier a88705ea437e3de92a73ef561cf3ca75be030722a58ee952d905fd04f6d10e37
- base 2953d7599b3b8a498295f9e07b766a4fff49edc9 → HEAD 3501f8558276ade4e10e40a42e3ffd1d5e56816b

## gates[]
- coder: `npx vitest run .pi/extensions/pij/` 3920 pass / 15 skip; `just typecheck` PASS; changed-file Biome PASS (execution.log.md)
- orchestrator cheap look: hunk `telegram/bridge.ts` forwardOne → `throw ForwardIncomplete` on `undeliveredText>0`; `adapters/queue-consumer.ts` acks only after handler; re-ran queue-consumer/bridge/cli/fs-registry.overlay suites: 591 pass / 1 skip
- pre-existing reds, verified not ours: `just test` 1× pwsh ENOENT; `just pij-skill-check` RED on main's own skills/ (DL-003; `git diff 2953d759..HEAD -- skills/` empty); repo lint + smoke debt
- LIVE AC-07 (o-prime baton, bridge restarted on 3501f85 from this worktree, pid 95084, 09:24Z): row 149 retired w/ receipt; 290 claimed→acked (consumer-95084) 1 s; probe 653 queued→acked 1 s, ack receipt after the send; 121 failed untouched — verified read-only by the orchestrator (rulings.md 09:24Z entry). Phone oracle: pending Vaughan
- cold review Dim-0: M1 bridge `undeliveredText > 0`→false: 2 RED; M2 consumer skip-ack: 3 RED; M3 cli effectiveDeliveryMode revert: 5 RED; M4 (reviewer's own) drop await before ack: 2 RED — all restored byte-identical, typecheck PASS, 6 touched suites 618 pass
- orchestrator sanity: re-ran M1 → 2 failed / 78 passed under mutation; 80 passed after restore; `git diff` empty

## observations[]
- DL-001 / difficulty / skill-layer / thesis skill not Skill()-reachable for Claude seats / link into ~/.claude/skills
- DL-002 / difficulty / env / pwsh known-red / skip probe when pwsh absent
- DL-003 / difficulty / skill gate / `just pij-skill-check` RED on main (3 budgets over, 3 strings missing) — blocks ANY live skill edit incl. Phase 4 / pay the debt or split budgets before Phase 4
- DL-004 / difficulty / tooling / `pij canary` false-negative timeout ~2 s before ack / longer default or `--wait`
- obs-10 / insight / delivery / the coder's PARTIAL was honest gate reporting, not incomplete work: aggregate gates are red on main; a `harness checks --scope <paths>` would let a worker report CLEAN for its fence

## open[]
- POST-MERGE FIX_REQUIRED (verified: mutation 6 stays green 462/462): missing negative test for `daemonReceiptAuthoritative` on a pane-less bound claude seat; fixture widenings at cli.test.ts:1276/1299/1323 removed the witnesses. FX001 → coder → small PR. Runtime code correct.
- Live proof (AC-07) + row-149 retirement + bridge restart: o-prime baton; pre-review pointer sent 09:2xZ — restart timing is the o-prime's call
- DONE: `pij report verify pij-gunboat-diplomat` after APPROVE
- Reviewer notes carried as follow-ups: bridge.test.ts:1092 ordering assertion (clock-based, replace with order log); fs parity is behavioural ("skip receipt" log line moved inside the chain), not literal; retry leg requires a running daemon (bridge never sweeps its own leases) — documented; channel-factory.test.ts was in the packet's allowed paths but not the dossier table (dossier gap)
- Incident (rulings.md 09:3xZ): shared-worktree mutation hazard during review — benign (disjoint fences), rule + DL-005 recorded
- Follow-ups: `--skip-backlog`; token-scoped `resetClaimsOnStart`; durable retry on Telegram API failure; Phase 4 gated on DL-003
