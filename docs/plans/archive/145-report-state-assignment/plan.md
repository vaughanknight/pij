# Plan 145 — `pij report state|blocked|question --assignment/--refs` on rs

Owner: pij-minor-unicorn (prime). Source: finding by pij-possible-porcupine / PA pij-evolutionary-roderika 2026-09-10 (jordo-work-iq government findings/2026-09-10-report-assignment-refusal.md): `pij report state done --assignment <id> --refs …` refuses with "rs has no assignment model", while `pij node show` exposes that very assignment and the node route documents the flag.

## Problem (verified on main a0acf9ac)
`crates/daemon/src/http/report.rs:161-185` `unsupported_flag` refuses `--assignment`/`--refs` (and `--project`, `--for`) for every report leaf except `verify`, with text written in plan 114 when rs had no assignment model. Plan 139 added one: `crates/store/src/governance.rs` `open_task` / `task(id)` / `list_tasks(node)` (`TaskAssignment`), and `report verify --assignment` already validates it via `decisions::verify`. `StateRecord` (crates/core/src/report.rs:46) carries `state`, `note`, `registry_seq` only. The refusal is now a FALSE statement that sends callers toward legacy, and the skill route (`skills/pij/references/routes/node.md:58`) advertises the flag.

## Acceptance
- AC1 `pij report state <state> --assignment <id> [--refs a,b]` and `pij report blocked|question "<text>" --assignment <id> [--refs a,b]` succeed on rs when `<id>` names an existing task assignment whose node is the CALLER (`task(id).node == caller`). Refuse otherwise by name: `E-RS-ASSIGNMENT-UNKNOWN` (no such id) / `E-RS-ASSIGNMENT-NOT-YOURS` (names the owning node) — never accepted-and-ignored, never "no assignment model".
- AC2 `StateRecord` gains `assignment: Option<String>` and `refs: Vec<String>` (additive, serde default so old rows read back). They are projected on `pij node show <seat> --json` (the seat's current state block) and `pij report --json`/state card wherever `note` already appears. `--refs` without `--assignment` is allowed (TS parity) and recorded.
- AC3 The four false refusal strings become TRUE ones or go away: `--project` → "rs reports are node-scoped; project comes from the node (see `pij node show`)"; `--for` → "rs has no relay authority yet; report as yourself" (still refused, honestly). No refusal may cite a `.pi/extensions/...` line or claim rs lacks a model it has.
- AC4 Tests, RED first: parser (report.rs) accepts/refuses per AC1 with exact codes; service test that the record round-trips assignment+refs through the spine and `node show`; golden/parity fixtures regenerated deliberately; a control that `report verify --assignment` is unchanged.
- AC5 Docs: `docs/how/pij-rs-api.md` report section (flags table) and the node route line already there stay true; note the codes.
- AC6 Live proof on an ISOLATED daemon: open a task for a seat, `report state waiting --assignment <id> --refs x,y`, read it back on `node show`; the not-yours and unknown refusals cited verbatim.

## Non-goals
Implementing `--project` scoping or `--for` relays. Auto-closing a task from `report state done` (closure stays `pij task close` / parent `report verify`). Legacy TS.
