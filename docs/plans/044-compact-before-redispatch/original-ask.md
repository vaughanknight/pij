# Original ask — compact before redispatch

## Human direction

> im finding this problem ahappens a bit, i think there is scope to look at some ... work

Follow-up:

> stepped on

O-prime interpretation from context and voice-input rules: **spin one** — create a dedicated stream.

## Triggering field report

An orchestrator reported two multi-round misses:

- coder build → fix redispatch without compacting first;
- reviewer review → re-review redispatch without compacting first.

Jordan had to compact both peers manually.

Reported systemic causes:

1. C3 is positional guidance rather than a dispatch-seam invariant.
2. Mid-session self-compaction preserved only the concept, not a per-dispatch trigger.
3. Peers previously described as compacted/idle were incorrectly assumed to remain lean after new rounds.
4. Peer compaction is a separate action and is therefore easy to skip.

Correction already established by o-prime: orchestrator-driven peer compaction exists as:

```text
pij send <peer-id> --command compact
```

The missing capability is not raw compaction; it is mechanical enforcement or prompting at redispatch.

Candidate directions, not decisions:

- atomic `pij send --compact-first <peer>`;
- a first-class `pij compact <peer-id>` alias;
- daemon nudge after N rounds without compaction;
- another smaller seam discovered during research.

## Bound constraints

- Run `/builder` guided.
- Planning fence only until plan validation and o-prime fence adjudication.
- s041 Phase 3 currently owns likely CLI/skill surfaces; no edits or implementation may overlap it without an explicit sequencing ruling.
- Preserve current C3 semantics: compact completed coder before review; compact completed reviewer before fix or approval.
- Do not create an automation that compacts a peer while it is actively producing a response.
- Validated plan stops at `WAITING_FOR_BUILD_CONFIG`.
