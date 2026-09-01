# s121 — adopt is consent: registration stamps delivery consent (oq-1104)

**Owner**: pij-fatal-woodpecker (offered, accepted 2026-09-01). **Reviewer**: pij-impressive-gopher,
appointed BEFORE code — its question is the mechanism. **Start gate**: after PR #341 merges (same
code area). Prime-authored per the 2026-08-31 ruling; PM executes.

## The coupling (vicuna's ruling on oq-1101 — three dependents, decide together)
1. Consent default — ANSWERED by Jordan's 2026-08-31 ruling: accept ON at all times for Claude
   seats, adopted and hand-started included (rulings/2026-08-31-crosssessioninbound-on-at-all-times.md).
2. Held-delivery backoff — LANDED (#330).
3. Mirror gap (this unit): nothing reads a hand-started seat's own on-disk consent into the
   descriptor, so adopted seats are pointer-only forever.

## Scope
- Per Jordan's 2026-09-01 ruling (rulings/2026-09-01-adopt-is-consent.md): registration/adopt of a
  Claude seat STAMPS `cross_session_inbound_accept = Some(true)` — adopt IS the consent act. No
  session-file read needed. (Supersedes this brief's first cut, amended by excision.)
- One backfill sweep for existing live rows, tombstone-aware AND dead-pane-aware (see req-0018
  note: 137 live-looking rows hold dead panes — do not stamp rows whose pane nobody has looked for).
- NOT in scope: emitting `from-mode=bypass` (test uds.rs:925 pins its absence — pij never asserts
  a permission state); any change to the Held/approval path; s120's grading.

## Traps as tests (witness must be able to FAIL)
- Non-Claude and command-carrying messages keep their existing behavior — the stamp widens Claude
  body delivery only; assert a copilot/codex adopt does NOT gain a socket rung.
- Some(false) is still honored if ever set explicitly — the stamp applies at registration, it does
  not overwrite a later explicit refusal (test must separate None-at-adopt from Some(false)-later).
- The live witness, both worlds positive: (a) hand-started Claude WITH accept in settings, adopted,
  body arrives as a real turn with NO store hack; (b) control seat WITHOUT the setting on the same
  build stays on pointers. Run from a real pane, not a unit test.
