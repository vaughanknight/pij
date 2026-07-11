# Government spine
**Thesis**: <human-authored purpose for the current portfolio>
**Updated**: <ISO from `date -u`> · **Seq**: <integer, +1 on EVERY write — answers "am I reading mid-write?" mechanically; a handover pack records the Seq it was written against>
**Writer**: <o-prime pij id; single writer>
**Prime-flow**: <government/prime-flow.json>

## Roster

| Stream | Plan | Window | Peer | Lifecycle/status | Fences | Batons held | Last report |
|---|---|---|---|---|---|---|---|

## Fences — <stream id>

**Owns**:
- `<exact write path>`
- `.harness/temp/<stream id>/**`

**Read-only / exclusions**:
- `<explicit non-fence or sibling-owned seam>`

**Overlap ruling**: <none, or recorded sequencing decision + affected streams>

## Sequencing watch

| ID | Trigger (verified, never hearsay) | Action | Status |
|---|---|---|---|

## Allocation ledger

- <ISO>: scanned existing ordinals; next free = <NNN>.
- <ISO>: reserved/tombstoned <ordinal>, `<folder>`, `<window>`.

## Rulings

- <ISO> · <human/source> · <verbatim ruling or pointer> · <effects>
