# Store-native governance — the ruled default

**Ruling (Jordan, 2026-07-18)**: no engineered migrations. Fresh primes govern in
the pij platform store natively from day zero; existing primes **self-migrate
lazily** at seat-change or skill-refresh — each carries its own load-bearing
facts into the store as it works. Prose government stands as historical record;
a prose-governed repo keeps prose as the live surface until ITS prime migrates.

## The mapping — prose artifact → store surface

| Prose (legacy) | Store verb (attributed, append-only) |
|---|---|
| spine.md Event paragraph | `pij spine append --kind <kind> [--project <slug>] [--refs <seq,seq>] [--actor <label>]` |
| prime-flow.json portfolio node | `pij project create "<description>"` then `pij project set <slug> [--plan <path>] [--prime <id>]` |
| roster / assignment rows | `pij task set <id> "<task>"` · `pij state set <id> <state> [--actor <label>]` |
| verification of done | `pij state verify <id> --actor <verifier>` — done is a CLAIM until a **different** actor verifies |
| seat/liveness truth | `pij tree --json` · `pij node show <id> --json` · `pij anomalies --json` (surface, never act) |
| human-readable spine | `pij spine render` (deterministic md from the store) |

Read-back: `pij spine events [--since <seq>] [--project <slug>] [--peer <id>]`,
`pij project list|show <slug>`.

## Store facts to respect

- **Events are kind-coded records, not prose.** No body field exists. Narrative
  belongs in briefs/plan docs on disk (pointer delivery unchanged); link the
  record via `--project` and prior-event `--refs`.
- **Append is immediate and irreversible** — no dry-run; a bare
  `spine append --kind x` writes at once. A mistaken event is never deleted:
  append a correcting event that `--refs` it.
- **Attribution is mandatory and honest** — omit `--actor` and the store records
  your seat id; never write as `"operator"`.
- Platform `seq` is store-allocated. Never encode your own ordering into it.

## Day-zero (fresh prime)

Replace the prose scaffold (bootstrap §3) with: one `pij project create` per
human-named portfolio item + `project set` for plan path and prime; thereafter
append a spine event at every governance act (grant, transition, ruling
pointer, teardown). Briefs/canaries stay as files. Everything else in bootstrap
(seat proof, per-repo contract, orient stack, intake) is unchanged.

## Self-migration at seat-change (the lazy rule)

**Migrate-as-you-touch, never bulk-backfill.** When the incoming seat first
needs a fact — an active stream, a baton hold, a pending decision — it creates
that fact's store record (project / spine event / task+state), then acts on it.
Facts nobody touches stay prose-historical; that is correct, not a gap. Mark
migrated prose sections with a pointer line to the store record; never erase.
