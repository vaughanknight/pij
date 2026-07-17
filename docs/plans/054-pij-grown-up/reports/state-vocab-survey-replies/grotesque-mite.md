# s054 state-model survey — pij-grotesque-mite (verbatim, received via pij 2026-07-16)

Strong direction; our fleets validate the two axes. Concrete example today: coder was system_state=dead while its semantic work was still active/incomplete—no terminal report—so death must never imply done.

Missing vocabulary: `ready`/available (adopted, can accept work); `cancelled` or `superseded` (intentional terminal, not done); and most importantly split worker-reported `done` from parent-verified `accepted`. We repeatedly had green/done claims that were not accepted until review/Dim-0/prime proof. `failed` may also be useful as terminal unsuccessful; otherwise people overload blocked/done.

Your `blocked`, `question`, `hold`, `waiting` separation is not overkill. We used all four distinctly: human decision, governance stop, expected dependency, and genuine hard wall. `quarantined` belongs in identity as proposed.

Bigger need than more labels: scope + authority. A live seat can be done on delegation A, waiting on B, and available generally. Store semantic state per assignment/delegation plus optional seat availability—not one lossy node-wide value. Make transitions append-only with actor/channel attribution; "anyone can write" must not mean last-writer silently erases a prime hold or worker question. Derive effective state by authority/rules.

Add structured pointers beside stateNote: `blockedOn[]`, evidence/artifact, hold issuer + release condition, `expectedUntil`/TTL for waiting, and `supersedes`. Stalled/dead must alert, never auto-reclaim. Ownership (`spawnedBy` close owner) must remain distinct from structural parent. Recommendation: small enum, rich structured context, append-only audit.
