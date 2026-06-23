# Worker Fix Packet — {{FIX_PACKET_ID}}

> **Usage**: This is a PROGRAMMATIC template rendered by `lib/review.ts`
> `generateFixPacket()`. Every `{{PLACEHOLDER}}` is substituted at generation time.
> Do NOT edit this template's placeholders — they must match the `subs` record in
> `generateFixPacket()` step 6 exactly.

---

## Context

- **Original delegation**: {{DELEGATION_ID}}
- **Review**: {{REVIEW_ID}} (verdict: FIX_REQUIRED)
- **Run**: {{RUN_ID}}
- **Fix packet**: {{FIX_PACKET_ID}}

---

## Mission

Fix **ONLY** the issues listed in the findings below. Do not refactor, rename, or
reorganise code outside the findings scope. Do not add new features. Do not touch files
outside the allowed scope list.

---

## Allowed scope (AC-06)

You may only write to these files (exactly — no others):

{{ALLOWED_FILES_LIST}}

Any change to a file NOT on this list is an automatic out-of-scope finding in the
next review cycle.

---

## Fix dossier (findings you must address)

{{FINDINGS_SUMMARY}}

Address every finding above. For each: state what you changed and why it satisfies
the finding in `execution.log.md`.

---

## Forbidden paths

Do **NOT** touch any of:

- `.the-flow-state.json`
- `the-flow.json`
- `the-flow.md`
- `.flow-pair/` (any file under this dir)

---

## Report back

When done:

1. Run `just self-check` — all gates must be clean.
2. Confirm mutation checks on any load-bearing guard you touched.
3. Reply with a Worker Report per the orchestrator-worker protocol
   (`references/orchestrator-worker-protocol.md`). Include the literal
   `Tests N passed (N)` line from vitest and the exact sed expressions used for
   mutation gates.
