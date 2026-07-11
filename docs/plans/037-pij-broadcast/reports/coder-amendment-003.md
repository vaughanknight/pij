# dlg-0001 amendment 003 - cli.ts window first act

**From**: pij-aa756x
**To**: pij-1tw5jmm
**Authority**: o-prime pij-3vetx8, 2026-07-11

When the explicit `.pi/extensions/pij/cli.ts` window grant pointer arrives:

1. Your first edit in the file must repair the bin consumer at current `cli.ts:1959`, which still reads the removed singular `res.follow.messageId`.
2. Immediately run `just typecheck`; the named bridge error must be gone before any secondary wait-loop work.
3. Then complete multi-target receipt polling, unresolved-target timeout output, partial-failure exit preservation, and byte-identical single-target output.
4. Close the window with E-16 evidence: typecheck plus targeted core/integration tests green.

Until the grant pointer arrives, do not edit top-level `cli.ts`.

If another contract reshape becomes necessary, report it before editing; do not create a second consumer mismatch across the window.
