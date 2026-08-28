# Item 11 report — skill-check order hardening

## Claim

The order checker now resolves canonical journey markers inside `## Ordered entry`, so an
incidental backward cross-reference cannot create a false out-of-order result. A new R1
assertion makes read-back and inline confirmation deterministic preconditions of fleet
confirmation, including when both phrases share one line.

## SHA

- Implementation: `f6d3734c0583259f78f1ee3b7ae76dea40344c1f`

## Behavior

- Correct order plus an earlier `human preamble` cross-reference: **PASS**.
- R1 mutant with fleet confirmation before the still-present read-back text: **FAIL**.
- Genuine `/thesis` / host-invocation inversion: **FAIL**.
- Real `skills/pij`: **PASS**, 0 `✗`.

The checker keeps `You are a stream orchestrator` as a document-level role marker. All
journey markers use the canonical section slice, and R1 uses first line/column positions
within that slice rather than line-only ordering.

## F5 revert decision

The forced `preamble checkpoint` wording reduced clarity by dropping the fact that this is
the human preamble. It is restored to `human preamble checkpoint`; the fixed section
boundary means this natural backward reference no longer confuses the gate. No ordered
entry step moved.

The optional `never a modal question UI` restatement remains omitted because global
invariant 9 is its authoritative home.

## Gates

- Script tests: **PASS** — 3/3.
- Real skill checker: **PASS**, including `orchestrator order: read-back precondition`.
- Shell syntax: **PASS**.
- Changed-test Biome: **PASS**.
- Typecheck: **PASS**.

## Blast radius

`harness/scripts/pij-skill-check.sh` gates every pij skill change. The new test therefore
runs the real script against copied real fixtures rather than testing a parallel TypeScript
interpretation.

## Orchestrator correction + review outcome
Cold review APPROVED (`reviews/item-11-review.md`, f6d3734), with the reviewer reproducing the ACTUAL historical defect (bfbb08d text at both sites) now RED, Dim-0 non-vacuity proven (3 guards → 3 distinct signals), and a bonus: this commit promotes the entire `pij-skill-check` gate into `just test`/`harness checks` for the first time.
**Correction to my earlier "all journey markers" phrasing**: only the FIRST order loop was section-scoped. A SECOND order loop (`pij-skill-check.sh:479-495`, "orchestrator pair order") still has the whole-file `grep|head -1` bug (R4) — flagged, follow-up.
Per the reviewer's explicit recommendation, item 11 merges as-is; R2 (decoy bypass — one incidental in-section mention of "back verbatim" defeats `marker_position`; reviewer prototyped a verified 4-line anchor-to-numbered-step fix), R3 (Build-config site needs a literal clause pin, not an order check), and R4 (scope the second loop or comment it whole-file) are a follow-up: **item 12** (`tasks/item-12-skillcheck-hardening/`).
