# PM adjudication — Opus composed-code review6ff2f981

## P1-A: scenario correction; retain explicit same-seat revive hold
The described ordinary new-session path does NOT keep seat S: chooseRegistration:95-112 generates a new id and sends supersedes for a changed native session; backend checked supersedes tombstones the predecessor. Old M1 remains on old seat; M2 to new seat is reachable. Add/verify the actual rollover+M2 regression, not a fictitious in-place native switch. Explicit same-seat revive into a DIFFERENT native conversation is separately governed by pm-lifecycle-rulings: hold old targeted queue and direct user to resume original native or use a NEW seat/reissue. This is an intentionally visible refusal, not a new dead-letter/discard/re-stamp policy. P2-C's now-fixed metadata is essential to make it visible. No automatic deletion or wrong-context delivery authorized.

## P1-B: upheld; durable identity is not live-process identity
Change journal namespace to stable Pij seat id + native session only. PID/start remains the live claim/ack validation tuple, and may be recorded inside journal diagnostics, but MUST NOT hide accepted records from a new process resuming the same native conversation. Add real filesystem restart/claim regression with a different pid/start, plus changed native session remains isolated. Accepted duplicate ack stays acceptance-grade; missing completion proof explicitly holds per prior ruling.

## P2-C: upheld, targeted fix delivered
Runtime40ded909 / evidenceabd1ec7b introduces typed claim page/hold reason; consent quiet backoff versus native-target actionable receive-hold. PM will compose and verify64 tests.

## P2-D: upheld as lock-span issue
Do not drop takeover/claim/ack exclusion. Move expensive OS ancestry/tmux consent observations out of global critical sections or narrow exclusion to relevant identities, with revalidation at mutation. Preserve cross-SEAT same-PROCESS takeover invariant; a naive per-seat lock is insufficient. Prove an unrelated OMP/Pi claim/ack progresses while native Copilot observer is deliberately blocked, and takeover/stale native negatives still fail. Existing non-Copilot semantics stay unchanged.

## P2-E: upheld
Fresh bootstrap must not require Copilot binary unless user invoked standalone strict Copilot doctor. Default install may report absent optional Copilot capability and continue; direct doctor still fails. Prove via injected temp-home/PATH seam. Do NOT run real just link/install, especially during135 global-link freeze.

## P2-F: conservative scope clarification accepted
Known non-Copilot controls stay unchanged. An unverifiable control target must fail closed rather than blindly type, because it could be Copilot and violates no-fallback otherwise. Record this explicit diagnostic behavior in docs; no new process guessing or silently allowing unknown targets. This is a brake, not a policy change deciding recipient identity.

## Smaller items
- Installer fsync: uphold for global user-settings durability; sync temp contents before rename and directory after where supported, propagate real errors. Use isolated tests, no global writes.
- Misleading everything-already-linked after Copilot mutation: uphold; fix accurate reporting without widening native runtime contract.
- Recoverable native-extension-unavailable: runtime should re-register only that precisely identified recoverable refusal with bounded retry; stale tuple/invalid proof/ambiguous send stays held. No blanket HTTP400 retry.
- Preexisting queued controls: explicitly outside old-session compatibility; no new deletion/deadletter policy. Safe visible refusal/hold, operator can use new seat. Do not downgrade to typing.

Live proof still open. Corpus manifest metadata reviewed and fixed by PM; corpus6 rerun green. Final full gates deferred until source fixes and135 spawn freeze lift.
