# 29b-T001 — W1+W2 call-site sensor fold (pre-merge)

**Base**: 5b77c99f4d35330044ab3ed1637492d9accda836 (29b-T001 deps fold — cold-reviewed ✅ APPROVE, `reviews/item-29b-t001-deps.md`).
**Ruling (orchestrator `pij-falling-outside`)**: APPROVE stands and the fold's own gate MUT-CALLSITE-HOME passes. But the reviewer proved (both directions, string-checked) that this fold **weakened an existing source pin** (W2) so the call site can bypass the factory and re-admit the original wrong-store-path bug with every guard green, and left a **false coverage comment** (W1). On this stream's human-channel bridge-restart-notifier path, doctrine is binding: "a PR whose review discovers an unsensored guard is folded pre-merge, never merged + follow-up." → **fold W1+W2 before the item-29b-T001 PR is built.**

## The gap (confirmed by orchestrator's own reading of 5b77c99)
- `daemon.ts:1796` call site: `bridgeNotifierDepsForDaemon(pijHome, registry, channel, log)` inside `notifyOwner: wireBridgeRestartNotifier( … )`.
- `daemon.test.ts:332` pin: `expect(source).toContain("notifyOwner: wireBridgeRestartNotifier(")` — was `wireBridgeRestartNotifier({` pre-fold; the fold loosened `({` → `(`, so it now ACCEPTS an inline object literal that bypasses the factory. Weaker.
- `daemon.test.ts:331` comment: `// Source pin: wrapping form only. The pathFor test above senses argument regressions.` — FALSE: the pathFor test (`:319-326`) exercises the factory internals, not the call-site binding. W1 proved a call-site arg mutation stays repo-wide SILENT.

## The fix (single file: `.pi/extensions/pij/daemon.test.ts`)
In the `it("wires production restart notices through watchers, never single-prime inference")` block (~:330-333):
1. **Reword the comment** to be accurate, e.g.:
   `// Call-site pin: the daemon must delegate deps construction to the factory. The pathFor test above senses args INSIDE the factory only; this pins the call-site binding the factory test cannot see.`
2. **Add the proven call-site pin** (reviewer-verified TRUE on pristine, FALSE on both mutants):
   `expect(source).toContain("bridgeNotifierDepsForDaemon(pijHome, registry, channel, log)");`
   Keep the existing `:332` pin and the `not.toContain("expected one live prime")` line.

## Mechanical oracle (E37 — save patches, RUN apply→red→revert→green)
Save both under `tasks/item-29b-bridge-advisories/`:
- **MUT-CALLSITE-ARG.patch** — `daemon.ts:1796`: `bridgeNotifierDepsForDaemon(pijHome, …)` → `bridgeNotifierDepsForDaemon(join(pijHome, "nope"), …)`.
  Acceptance: typecheck 0; **new call-site pin REDs**; existing `:332` pin stays GREEN (proves the new pin adds coverage :332 lacks — E40: the line no prior test sensed).
- **MUT-LITERAL-BYPASS.patch** — `daemon.ts:1796`: replace the factory call with an inline literal bypassing it:
  `wireBridgeRestartNotifier({ pijHome, registry, store: new FsWatchdogStore(join(pijHome, "nope")), channel, now: () => Date.now(), log })`.
  Acceptance: typecheck 0; **new call-site pin REDs**; `:332` pin stays GREEN (this is the W2 weakness the new pin closes); the bug (wrong store path) is fully re-admitted.
- For each: apply → red (name the exact test + line) → `git apply -R` → clean → re-run GREEN. Record the mutated + restored shas.

## Gates + deliverable
- `just typecheck` (0), `biome check` on the one changed file (clean), fence run `npx vitest run .pi/extensions/pij/daemon.test.ts` GREEN.
- Extend the 29b-T001 chain: commit on top of **5b77c99** in YOUR OWN build worktree (NOT the shared stream worktree — COORD-010; commit by explicit pathspec).
- Report the new candidate sha + the two mutant results.

## NOT in scope here (surfaced to o-prime separately)
- W3 (single-field deps assertion) and the Dim-1 #4 rescope of 29b-rest → `reports/item-29b-scope-notes.md`.
