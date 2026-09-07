# OMP parent steering and draft safety

**Date:** 2026-09-07  
**Seat:** pij-immediate-sma  
**Scope:** extension-only OMP parent ownership, native steering classification, and opt-in busy smoke.

## Finding

OMP task children execute in-process and bind fresh extension runtimes. They do not set Pi's subprocess-child environment markers. Their `session_start` inherited the parent's tmux pane/PID and registered against its inbox; a transport ACK could therefore mean a child, not the parent, consumed the message.

The controlled 15-cell matrix compared idle, foreground bash, and two-child fan-out across custom steer, custom followUp, user steer, attributed custom, and typed controls. With root ownership isolated, all steer variants reached the first available tool boundary. User-role API messages erased drafts; custom messages and correctly sequenced typed controls preserved them. FollowUp waited beyond ordinary-turn work.

## Encoding

- Reconciled [PR #376](https://github.com/AI-Substrate/pij/pull/376) by jakkaj: OMP print-mode contexts with pre-start `session_init` metadata are children, not peer seats. They cannot register or use inherited Pij controls. Independently hosted headless roots and Pi are preserved; the broader no-UI/opt-in experiment was removed.
- Custom messages retain their role, envelope, and default agent attribution. An attributed-user experiment was rejected: Escape restored the queued pij envelope into the draft, despite safe consumption-time behavior.
- `just step-on-probe --harness omp --state bash|subagents` exercises real work and requires the original parent session, parent-only nonce reply before remaining work completes, preserved draft, and a correlated inbox ACK. Idle remains the default.

## Proof

The child-ownership tests failed before the guard. A fresh owned OMP seat using the guard without experimental hook filtering retained native parent session `01a07973-0c6c-7000-90a3-fd6cf8ca01c4` across fan-out. Message-pushed/inbox-ACK spine pairs were **16316/16319** (idle), **16320/16323** (bash), and **16328/16331** (subagents). Parent ACKs and byte-identical drafts were observed in all three states. A separate Escape experiment then rejected user attribution; adapter call-shape tests reproduced that unsafe variant before it was removed.

PR #376's discriminator won the headless-root cell: a real OMP print root had `hasUI:false` but no `session_init`; the installed executor writes that metadata for children before `session_start`. New regression tests rejected the broad guard's root suppression and unguarded child send fallback before the exact classifier was applied.

Final focused selection: **119 passed, 4 opt-in tests skipped**. Canonical real-client receipts passed for idle (`step-on-idle-green.json`), bash (`step-on-bash-verified.json`), and real task fan-out (`step-on-subagents-accepted.json`). All preserve the draft and prove model consumption; busy cases additionally prove direct native Pij context at the original tool boundary, stable parent identity, and the correlated inbox ACK. The fan-out parent `01a07999-a25c-7000-a9b1-c5f3221faef4` stayed unchanged; its isolated daemon's push/ACK seqs were **5/8**. Live Escape preservation also passed.

Sensor refinements were evidence-driven: use owned executable fixtures instead of forbidden inline shell; record a minimal probe system prompt and explicit thinking level; reject shell jobs masquerading as task agents; reject child-result and post-terminal nonce evidence. One unreadable TUI redraw frame is an observation gap, not proof of draft mutation: reacquire within one second, count the retry, and fail persistent unreadability or any readable changed/empty draft.

Detailed matrix, pane/timestamp samples, bundled-runtime citations, and gate/probe receipts are in the task worktree's `.harness/temp/steer-matrix.json` and `.harness/temp/steer-report.md`.

## Magic wand

A delivery sensor must prove **who consumed the message**, not just that a transport acknowledged it. The busy probe now makes parent session identity and parent-only consumption executable acceptance criteria; the earlier idle-only sensor could not see this failure.
