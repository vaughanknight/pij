# rs vs legacy inventory (main e062f070, daemon pid 77407) — 2026-09-07, prime

## rs today
HTTP routes (crates/daemon/src/http/mod.rs Route enum): /v1/adopt /v1/events /v1/hold /v1/inbox /v1/inbox/ack /v1/inbox/typing /v1/phonehome /v1/register /v1/release /v1/report /v1/revive /v1/seats /v1/send /v1/shim/inbox /v1/shim/inbox/ack /v1/shim/send /v1/shim/sessions /v1/sidecar /v1/spawn /v1/state /v1/whoami.
CLI verbs (`pij-rs --help`): daemon ping doctor register adopt whoami phonehome spawn revive send inbox sidecar report list state tail.
`report` leaves (crates/daemon/src/http/report.rs): now | state <ready|waiting|hold|blocked|question|done> | blocked <note> | question <note> | clear. `verify` refused by name. Proven live 2026-09-07: `pij-rs report question …` → spine report.state seq 15493; `clear` → 15495.
Store tables with NO route/verb: projects, streams, dispatches, batons, baton_leases, baton_lease_history, prime_designation, seat_roles, descriptor_merge_history, delivered_messages, spawn_records. `assign_role` (crates/store/src/orchestration.rs:285) has only a test caller.
Spine writers: EventBus::publish (crates/daemon/src/events/mod.rs:62) — broadcasts; ReportService (crates/core/src/report.rs:116,:241) and Registry::put/tombstone (crates/store/src/registry.rs:231,:314) — direct INSERT, never broadcast, at=0, seat.put payload=''. Measured by chainglass with a positive control (~/substrate/chainglass/docs/plans/093-pij-rs-reader/assets/findings/live-push-recheck-2026-09-06.md).
Legacy→rs shim routing (.pi/extensions/pij/core/generation-routing.ts RS_ROUTE_TABLE): adopt whoami phonehome report{now,state,blocked,clear,question} send inbox{,check} state → rs. NEVER_ROUTED: inbox register, tail. Everything else executes against the LEGACY TS store.

## legacy governance surface still executing against the frozen legacy store (daemon OFF)
From skills/pij README registry + cli.ts usage: project · stream · fence · dispatch · ack · canary · attest · spine · task set · report verify · node show · anomalies · orchestration baton|prime · watchdog (status/pause/resume/exempt/reset/interval/watch/unwatch/list/disable-all/enable-all) · chore (add/run/list/ack/remove) · focus (save/list/launch) · sessions · agent (list/run/spawn/show/new/check/eject/report) · watch/unwatch · bg (create/list/tail/kill) · close · link · tree · compact-self · models · telegram · path · daemon. Probe 2026-09-07: `pij anomalies` answered from legacy spine seq 115475 (rs spine was at 15495) — two governance worlds. `pij canary`/`pij close` → E-NOID for rs seats (2026-09-05).

## consumers waiting on this
chainglass (plan 093 rs reader, o-prime pij-lonely-antelope): rail shows ROLE UNKNOWN on every card; treats seat.put/report.* as replay-only; needs role on the row, live descriptor fan-out, a reap/close verb, an rs API doc. ~716 idle corpse rows.
pij-team pipeline (skills): §C3 compact-at-completion unexecutable (rs refuses `command` on send); dispatch/ack/canary rituals write legacy.
