# s054 state-model survey — pij-primary-carp

The two-axis split is right, but the proposed enums still mix four different truths.

## System-side changes

- Add `unknown`. Across Pi/Claude/Copilot/Codex, missing telemetry must fail honest rather than become `idle`, `stalled`, or `dead`.
- Add mechanically detectable `stopped`/suspended. We had live panes intentionally halted that were neither idle nor dead.
- Move `unadopted` out of `system_state`. A node can be simultaneously working and unadopted; this is graph/authority state.
- Prefer separate projections:
  - runtime: `starting | working | idle | stalled | stopped | dead | unknown`
  - lifecycle: `pending | bound | dissolved`
  - adoption/identity: `adopted | unadopted`, with `quarantined` remaining identity-owned.

## Semantic vocabulary

Keep `blocked`, `question`, `hold`, and `waiting`. Add:

- `ready`: work is complete enough for the next owner/reviewer/merge ceremony, but not accepted.
- `failed`: the attempt ended without an acceptable result and needs a new decision/retry.
- `cancelled` or `abandoned`: intentionally terminal without success.

`done` must mean **accepted by the owning authority**, not merely self-reported completion. Fleet work repeatedly needed to distinguish:

- coder reported complete;
- reviewer approved;
- phase accepted;
- ready to commit;
- committed;
- ready for PR;
- shipped.

Without `ready`, agents misuse `done` and hide the exact handoff still required.

I would not add `active`/`in_progress` as a semantic value unless a task assignment can remain active while the process is mechanically idle; null semantic state plus runtime `working|idle` is usually enough.

## Do not rely on `stateNote` alone

Each semantic state needs structured context:

- `waiting`: `waitingOn`, pointer/ref, since;
- `blocked`: blocker id/kind, owner, evidence pointer;
- `question`: decision owner + durable question pointer;
- `hold`: ruling/lease pointer + authority that may clear it;
- `ready`: ready-for enum/ref (`review`, `commit`, `pr`, `merge`, etc.);
- `failed`: attempt/evidence pointer and whether retry is authorized.

Free text remains useful as a human summary, not the contract.

## Writer authority is the biggest risk

“Anyone can write, channel-enforced” is too permissive unless transitions are authority-aware. A child must not clear a prime-issued `hold`, and an arbitrary peer must not mark another node `done`.

Persist every change as an append-only attributed event with:

- verified actor id and actor authority/relationship at write time;
- monotonic version/CAS;
- previous and next state;
- reason/evidence pointer;
- timestamp;
- optional expiry;
- clearing authority.

Recommended rule: self or parent may raise `blocked/question/waiting/ready/failed`; only the issuing authority or a higher verified ancestor may clear `hold`; only the task owner/acceptor may set `done`.

## Concrete fleet states this must represent

- “Terminal fix implemented; awaiting independent approval.”
- “G7 blocked by a product defect.”
- “No candidate produced; authorized strategy exhausted.”
- “Ready for local commit, push forbidden.”
- “PR open but CI failed.”
- “Governance hold, preserve artifacts.”
- “Stale run cancelled; mutation status unknown.”
- “Process alive but intentionally halted.”
- “Descriptor live but identity quarantined.”

The smallest useful model is therefore: honest orthogonal system projections plus semantic `blocked | question | hold | waiting | ready | failed | cancelled | done`, with structured refs and authority-safe transitions.
