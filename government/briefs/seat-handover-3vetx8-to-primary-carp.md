# Seat handover — pij-3vetx8 → pij-primary-carp

**From**: pij-3vetx8 (outgoing o-prime) · **To**: pij-primary-carp (incoming o-prime)
**Date**: 2026-07-12T09:35Z · **Spine at**: Seq 52 · **Status**: marker HELD live until incoming acks receipt (no continuity gap)

Authoritative state is `government/spine.md` (Seq 52) + `government/baton-book.md`. This brief is the fast-path index.

## Active streams / owners

| Stream | Peer | Surface | State | Merge gate |
|---|---|---|---|---|
| s041 inbox-no-tmux | pij-concrete-reptile | PR #9 | **Closing Phase 2** per your ruling (D-032/D-033 = non-blocking shared debt, no smoke-harness work). Next: commit/push PR #9, then Phase-3 fence request (exact owned set) **to you**. PR #9 latest CI green (check 22/24 + windows-compat pass). | Jordan's explicit word |
| s043 telegram-last-speaker-routing | pij-rigid-minnow | PR #11 | Live-proof PASSED both rounds (routing tracks latest speaker). R8 (`[pij-id] [repo/branch]` prefix, omit `/main`) **review = APPROVE_WITH_NOTES** (contract/mutation clean); one Medium prefix-budget regression (added prefix pushes text→4097 / caption→1097 over Telegram limits) being fixed before landing (`reports/r8-fix-001.md`). On fix+APPROVE → fold R8 into SAME PR #11 (no 2nd PR). Landing/commit ask now routes to YOU. | `PROCEED 11` (typed) |

## Immediate decisions / blockers

1. **CI npm-audit posture — OPEN, Jordan's call (asked on Telegram, awaiting A/B).** Vet gate `pkg audit` is FAIL-by-design on the unfixable **minih@0.2.4 → @opentelemetry/* → protobufjs@8.0.1** advisory subtree (`npm audit fix` = "no fix available"; 26 total, 0 critical). Hosted `ci` audit step is already report-only (`|| true`), so hosted CI does not fail on it; the red is the vet gate that streams' `harness checks`/bootstrap trip (won't re-vet until upstream bumps — packages.yaml:75). Paths offered: **A** = accept & re-vet report-only (matches Plan-009 posture, fast, unblocks all streams) · **B** = bump minih (AI-Substrate-owned, durable fix, needs a minih release). If Jordan picks A, spin the small re-vet commit on `.pi/packages.yaml` (extend the documented exception to the otel/protobufjs advisories).
2. **s043 R8** — review APPROVE_WITH_NOTES; one Medium prefix-budget regression (prefix pushes text→4097/caption→1097 over Telegram limits) — s043 fixing before landing (`reports/r8-fix-001.md`). Catch the fix re-review, then fold R8 into PR #11.
3. **PR #11 merge** — held for `PROCEED 11`.
4. **PR #9 merge** — held for Jordan's word.

## Baton status — ALL FREE

- **daemon-restart**: FREE (returned by s043 09:12Z, lease-0cd252e3; evidence: live-proof.md).
- **git-index**: FREE.
- **push-main**: FREE (double-gated: o-prime deconfliction + Jordan's typed go).
- **Spawn freeze**: LIFTED (done-notice discharged to pij-1ca01u5, pij-concrete-reptile).

## Last verified evidence

- s043 live-proof (both rounds): `docs/plans/043-telegram-last-speaker-routing/reports/live-proof.md`, bridge pane %757 (`last speaker <id>` / `route <id>: injected 1 message(s)` both directions).
- s043 R8: `.../reports/r8-coder-complete.md` — GREEN 96/96, branch-mutation RED 1/95, `index.ts` restore SHA-256 `613f89524dc3c49365976f50347f0386338ba2b84e2e93cb679bdd0edcdc7e1b`, isolated `harness checks` PASS.
- s041 PR #9: latest CI green (check 22/24 + windows-compat).

## Governance backlog (no ordinal spun)

- **Daemon stale-notice guard** (emit-once / tombstone-on-close) — daemon re-fires death notices for dead descriptors, costing live-pane turns (pij-11yrz0d + pij-469ohv 7×). Filed by pij-1ca01u5 via s013 sweep. Control-plane, non-urgent.
- **Harness worktree-awareness** (D-032 Driver folder-trust bypass in worktree launch + D-033 pi-peacock worktree-derived cwd/branch) — now non-blocking shared debt; 2-strike (s041 + s043). Wants a general worktree-aware fix, not per-stream.
- **flow-pair defect ordinal** — 9 classes accumulated (heaviest backlog; 2 cross-repo strikes).
- **pij-aa756x quarantine** — Jordan-owned remediation decision, OPEN.

## Actions needed

**From you (incoming o-prime):**
- Drive Jordan's A/B audit decision; if A, spin the re-vet commit.
- Catch s043 R8 review verdict → fold into PR #11 (no 2nd PR).
- Hold both merges for Jordan's explicit typed words (`PROCEED 11` / PR #9 go).
- Receive s041's Phase-3 fence request.
- Ack this handover so pij-3vetx8 can unset its marker and close cleanly.

**From Jordan:**
- A/B on CI audit posture.
- `PROCEED 11` (s043) and PR #9 merge word when ready.
- Confirm the seat rotation (flagged to him on Telegram).

## Convergence note (single-writer discipline)

We ran briefly as two seats. Your priority ruling on s041 (D-032/D-033 non-blocking) **supersedes** pij-3vetx8's crossed-in-flight narrow harness fence grant — that grant is VOID; yours governs. From your ack, you are the sole government writer; pij-3vetx8 issues no further rulings and holds its marker only to avoid a continuity gap.
