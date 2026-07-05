# Review Brief — dlg-0001 (Plan 030 Phase 2: pair port + delegate + deprecation)

You are the **cross-model reviewer** (gpt-5.5). A different model (opus-4.8) implemented this; its
green report and self-audit are **claims, not proof**. Your job: verify, and try to **disprove**.

## What was built (uncommitted diff in the repo)
- `skills/pij/references/routes/pair.md` (NEW, 192 ln) — flow-pair protocol ported into the `/pij pair` route.
- `skills/pij/references/routes/delegate.md` (NEW, 78 ln) — single-task, no-review route.
- `skills/flow-pair/SKILL.md` (→ 17-ln supersession shim), `skills/flow-pair/lib/cli.ts` (help-text fix),
  `skills/flow-pair/references/harness-modes.md` (DELETED — "absorbed"), `skills/pij/SKILL.md` (registry unmark),
  `AGENTS_README.md`, `docs/how/skills.md`, `docs/how/flow-pair.md`, `docs/domains/flow-pair/domain.md` (pointers).
- Evidence: `docs/plans/030-pij-router-skill/tasks/phase-2/execution.log.md` (AC-04 checklist + T2.2 disposition).
- Recovered source for the graft: `docs/plans/030-pij-router-skill/tasks/phase-2/recovered-fork-delta.md`.

## Verify (most load-bearing first)

**DIM-0 — the parity audit must be NON-VACUOUS (mandatory, this is the gate).**
The whole phase risk is a *dropped invariant* in the port. The coder produced a 38/38 AC-04
source→target checklist (execution.log.md § AC-04). Prove it's real, not rubber-stamped:
1. Independently read the **reconciled 300-line** `skills/flow-pair/SKILL.md`… wait — it's now the 17-line
   shim. So read the port SOURCE the coder used: the 300-line repo SKILL.md is in **git HEAD**
   (`git show HEAD:skills/flow-pair/SKILL.md`). Enumerate ITS load-bearing rules yourself and check each
   is present in `pair.md` or cited to `00-routing.md § Shared conventions`. **Find a dropped rule if one exists.**
2. **Mutation check**: pick one checklist row, confirm removing that rule from pair.md would actually be
   *caught* by the audit (i.e. the checklist maps to real pair.md content, not a hopeful claim).
3. **Recovered-verbatim rows 13–14**: diff the two grafted sections in `pair.md` against
   `recovered-fork-delta.md` — they must match **verbatim** (own-the-deliverable + orchestrator sanity pass).

**AC-05 shim**: `/flow-pair` SKILL.md ≤20 ln, frontmatter `description` keeps flow-pair's trigger phrases
(NL routing still works), no duplicated protocol prose. `git show HEAD:...` vs now.

**AC-06 engine untouched**: only `cli.ts` **help strings** changed in `lib/`; nothing else in
`lib/`/`bin`/`schemas/`/`test/`/`prompt-lab/`. Run `just flow-pair-test` yourself — must be 148/148.

**harness-modes.md DELETION**: confirm the "absorbed by 00-routing § Shared conventions" claim — grep the repo
for live inbound pointers to `harness-modes.md`; a dangling reference = FIX_REQUIRED.

**T2.2 keep+cite deviation**: coder kept `orchestrator-worker-protocol.md` (not retired) because
`worker-fix.md:68` is a runtime-read template pointing at it. Confirm that pointer is real and the file is
genuinely runtime-read (grep `packet.ts`/`context-pack.ts`).

**Scope edit**: `skills/pij/SKILL.md` registry unmark — confirm it's ONLY the 2-row `(lands Phase 2)` removal
(pair + delegate), nothing else in that Phase-1 file touched.

**Gates**: run `just pij-skill-check` (must be green: parity, sibling-blind, token budgets, dup-prose single-owner).
**Sibling-blind**: pair.md/delegate.md name no other route module.

## Verdict (reply with EXACTLY this shape)
```
VERDICT: APPROVE | APPROVE_WITH_NOTES | FIX_REQUIRED
DIM-0: <how you proved the parity audit is non-vacuous — the dropped-rule hunt result + the verbatim diff result>
GATES: pij-skill-check <pass/fail> · flow-pair-test <N/N> · (any you ran)
FINDINGS: <numbered; each = severity · file:line · claim · evidence · smallest fix> (or "none")
NOTES: <optional>
```
Do NOT edit any files — read-only review. Report the verdict back to pij-z4bt25.
