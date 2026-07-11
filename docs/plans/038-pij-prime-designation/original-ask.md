# Plan 038 — original ask
**Recorded**: 2026-07-11 by pij-3vetx8 (o-prime) · source: Jordan, o-prime's pane

Verbatim: "I want a first class way to for a pij session to set itself or another as 'prime' then we can list all primes or filter by primes in a folder etc."

**Bound context**:
1. First-class prime designation: a session can mark ITSELF or ANOTHER session as "prime"; surfaces: `pij list` filter (all primes / primes in a folder/cwd), presumably set/unset verbs.
2. Design synergy (note for explore, not a mandate): the /pij prime route's rung-1 triage currently discovers the o-prime seat by reading the government roster — a registry-level prime flag would make seat discovery a mechanical `pij list --prime --folder <cwd>` read, and the three live governments on this machine (this repo, osk, SecondCrack) are immediate consumers.
3. Descriptor changes: additive/migration-safe only (house rule, types.ts:109 class).
4. Namespace: designation likely lives on existing surfaces (`pij prime …`? `pij adopt --prime`? `pij list --prime`?) — clarify with Jordan at plan; the `pij orchestration` namespace exists for orchestration primitives if it fits better there.
