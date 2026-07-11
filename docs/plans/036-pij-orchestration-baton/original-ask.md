# Plan 036 — original ask
**Recorded**: 2026-07-11 by pij-3vetx8 (o-prime) · source: Jordan, in the o-prime's pane

Verbatim-close: "i think 07 here is a good opportunity to dogfood. we can set up an orchestrator and have it work through adding baton. i think it should be pij orchestration baton though, so we can add more orchestration primitives later."

**Rulings bound to this plan** (spine § Rulings, 08:35Z):
1. The work item is P-07 — the baton primitive (requirements seed: plan 035 spine R9.7 + map.md § batons graduation path + INC-004/E-22).
2. CLI namespace ruled: **`pij orchestration baton <verb>`** — batons are the first inhabitant of an `orchestration` verb family; design for future primitives. Namespace is settled; ergonomic aliases may be proposed, not substitutes.
3. This is a **dogfood of the prime route on its home repo**: one stream orchestrator owns plan 036 end-to-end under the o-prime (pij-3vetx8); the run's frictions are first-class output.
4. P-08 (deliver-to-seat) is let go per Jordan — not this plan, no near-term ordinal; mitigations remain route doctrine.

**Design prior art the stream inherits** (pointers, not instructions): `docs/plans/035-o-prime-routing-skill/requirements-spine.md` § R9.7 + R4.3/R4.4 · `skills/pij/references/prime/rituals/batons.md` (the convention the primitive mechanizes; the book stays as evidence layer) · `docs/plans/035-o-prime-routing-skill/vendored/encode-candidates.2026-07-11T08Z.md` E-22 (git index as unserialized surface) + the o-prime builder's design sketch in session notes: atomic file-create leases under ~/.pij, daemon push on grant, probe-at-grant, alert-never-auto-reclaim, FIFO vs --granter modes, --pin re-verify, `with` wrapper.
