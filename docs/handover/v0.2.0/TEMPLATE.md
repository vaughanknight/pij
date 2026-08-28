# <NN> — <item title>  (handover template — copy, fill every section, delete nothing)

**Item id / stream at handover:** <item number(s)> · <s391-day3-core | s392-day3-codex-doctrine>
**Status at v0.2.0 (tag `d120c53`, 2026-08-28 05:2xZ):** not started | designed | in flight (branch `<name>` at `<sha>`, pushed; what is done / what is not)
**Size estimate:** <S/M/L, hours> · **Order / dependencies:** <items that must land first>

## 1. Why this exists (the observed failure, with evidence)
What happened, on which sha, seen how. Every claim carries a pointer: PR number, spine seq, log path under the plan folder, queue row seq, capture file. Quote the exact log/error lines.

## 2. What is ruled (design / spec)
The decision as recorded (spine seq, ruling text verbatim where it exists). Invariants stated as a set. Accepted degradations named.

## 3. Where the code is (at tag `d120c53`)
Files, functions, line references. For each: what it does now, what must change. Note the production call site as well as the factory/adapter (E34/E40: a sensor proves only the layer it drives).

## 4. Acceptance (behavioural, mechanical)
- Tests to add (file, describe/it name, what they drive — real closure/call site, not a stub).
- Mutants that MUST go red, each named (`MUT-…`), with the exact line/hunk the mutant patches and the test that reds. Source-pin greps are second sensors only.
- Gates: `npx vitest run .pi/extensions/pij/` full suite at the MERGE PRODUCT (PR head + main) in a fresh worktree, `just typecheck`, `just pij-skill-check`; two green full runs on a fresh-from-main worktree; logs kept in the plan folder BEFORE any worktree is torn down.

## 5. Live verification (after a daemon restart carrying it)
Commands and expected output on a running daemon (see README § daemon restart). What a failure looks like.

## 6. Risks / gotchas that already bit us
The E-rules relevant to this item (README § rules), with the incident in one line each.

## 7. Open questions for the human
Anything that needs Vaughan's or Jordan's ruling before building. Empty is a valid answer.
