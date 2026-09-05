- id: DL-001
  kind: difficulty
  description: "u4 Flowspace client search in assigned worktree returned path_unmatched for .pi/extensions/pij/** despite worktree LSP resolving message.ts, session.ts and router.ts there. Hidden TS extension subtree is absent from this indexed scope; exact file/LSP evidence used, not code-absence inference."
  fp: bd7854029269
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:27:20.419Z"
- id: CONF-001
  kind: confusion
  description: "u4 boot guidance disagrees with implementation: governance says typecheck+test and boot briefing Watch out says excludes smoke, but extension defaults to just smoke. Packet forbids real-seat smoke; harness boot --full selects nonsmoke Vitest baseline. Encode a docs/implementation parity check or explicit --no-smoke boot option."
  fp: 3b37cbb2a917
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:28:51.392Z"
- id: DL-002
  kind: difficulty
  description: "u4 documented harness boot --full is refused E108 unknown option --full; implementation reads ctx.options.full but CLI does not expose it. Cannot use default boot because packet forbids live smoke. Recorded unavailable attempt; use scoped Vitest baseline and approved checks --quick. Fix must declare the full option at the CLI boundary."
  fp: 76ddb9fd5c18
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:29:05.296Z"
- id: DL-003
  kind: difficulty
  description: "u4 full checks --quick failed only untouched skills/flow-pair/test/identity.test.ts cleanup: ENOTEMPTY removing temporary .git after git init. One isolated rerun passed all 6 tests. Gate remains honestly red; PM owns disposition, no retry behavior or unrelated source change added."
  fp: 9933dccc62db
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:41:57.243Z"
- id: DL-004
  kind: difficulty
  description: "u4 harness commit succeeded direct-verified with authorship note landed, but conversation ingest reported session identity unresolvable despite pij whoami resolving this rs seat. No conversation ingested; commit attribution unaffected. Need rs registry seat identity support in harness conversation-ingest resolution."
  fp: bfe2ca4afaee
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:44:09.468Z"
- id: WIN-001
  kind: win
  description: "u4 r2 widened AC8 guard caught 26 legacy frame mentions by exact file:line before fixes, including additional tracker payloads missed by the first scan. One explicit allowlist plus readable offender output now prevents model-facing frame vocabulary drift without rewriting historic fixtures. Inbox output remains a distinct listing to preserve D-040 instruction/log separation."
  fp: 33a410020c19
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:23:05.140Z"
- id: DL-005
  kind: difficulty
  description: "u4 r2 ONE checks --quick failed only unchanged PA watch/unwatch state subprocess: cli.integration.test.ts returned143 rather than0; our file change is solely doc-sentence expectation. Required isolated case rerun passed1 with97 skipped. Extension suite passed4082; full quick gate remains red, disposition escalated. No unrelated timing/assertion changes."
  fp: b3a0ee743eeb
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:30:32.477Z"
- id: WIN-002
  kind: win
  description: "u4 r2f1+r2f2 extended frame-vocabulary guard from extension to maintained skills, while historical plans stay excluded by root. A deliberately stale exact-line exemption failed the new fired-Set assertion; removing it revealed four stale skills sentences, all fixed. Original14 exact exemptions unchanged; guard now detects both unexpected legacy mentions and unused allowances."
  fp: 8507c71a84d1
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:44:17.368Z"
- id: WIN-003
  kind: win
  description: "u4 r2f4 guard now covers system-prompt append source, maintained how-to and domain docs, as well as extension and skills. Expanded-root RED named all5 new offenders; source fixes restored31/31 green. Single-file and directory traversal both exercised; authored extension-only allowances and historical-plan exclusion retained. Global installed append intentionally not synced by this fenced worker."
  fp: b2085b376ad6
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T03:00:43.610Z"
