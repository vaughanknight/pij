# Item 9 report — live pij skill-check debt

## Claim

All 10 `just pij-skill-check` failures are cleared without deleting a unique behavioral
mandate. The three constrained files are within budget, all seven exact marker/order
contracts pass, and the live-skill gate exits 0.

## SHA

- Live-skill commit: `bfbb08d4d32da70417850dde6d8cdec5664cae47`

## Gate evidence

- Before: `.harness/temp/s392/skillcheck-9-before.txt` — 10 `✗`.
- After: `.harness/temp/s392/skillcheck-9-after.txt` — 0 `✗`.
- Budgets: `peer.md` 150/150; `node.md` 150/150; `orchestrator.md` 112/120.
- `just typecheck`: **PASS**.

## Exact marker repairs

1. `routes/peer.md`: the structure example now contains
   `pij link <child> --parent <parent> [--json]`; the role option remains in the same line's
   designation note.
2. `routes/prime.md`: the scoped probe now states
   `` `pij list --prime --here --json` is current-prime-only ``.
3. `routes/prime.md`: `oldPrime` history now contains the contiguous phrase
   `never an active-seat signal`.
4. `prime/rituals/kickoff.md`: placement now says
   `verify the automatically persisted structural link with pij tree <id> --json` before
   canary.
5. `prime/rituals/kickoff.md`: parent-only repair now contains
   ``run `pij link <id> --parent <o-prime-id> --json` `` before brief delivery; the
   role-bearing one-call path remains authoritative.
6. `prime/orchestrator.md`: the stop report uses `phase report → <path>`, satisfying the
   pointer marker and removing the invalid markdown link target `<path>`.
7. `prime/orchestrator.md`: the earlier status heading says `preamble checkpoint`, so the
   first `human preamble` marker is step 6 of ordered entry, after the real host invocation.

## Removed and consolidated lines

### `references/routes/peer.md`

1. **Two precondition paragraphs -> one C1-owned block.** Removed the repeated declarations
   that absent `TMUX_PANE` means external pull and repeated registration advice. The
   replacement preserves: spawning requires tmux, exact current-pane adoption, the full
   adopt options, explicit bans on `tmux list-panes`/`tmux display-message`/pane discovery,
   no inferred pane, and register/first-wait remediation.
2. **Four tree-explanation lines -> three.** Removed only line wrapping and repeated subject
   names; current-repo, global, subtree, hidden-history, `--all`, and OR-within/AND-across
   filter semantics remain.
3. **Eight structure lines -> five.** Consolidated repeated descriptions of structural
   `parentId` and placement. Root `null`, legacy `spawnedBy` fallback, close ownership,
   no-other-field mutation, validation-before-write, adopt/spawn placement, governor role
   designation, and no self-declared role all remain.
4. **Five body-safety lines -> two.** Removed the repeated incident location and line wraps.
   The live incident, double-quote substitution, single-quote remedy, literal
   `--body-file`, stdin, and shell-bypass guarantee remain.
5. **External reply introduction shortened.** Removed the second restatement of durable
   address establishment; registration/first-wait auto-registration and the two receive
   commands remain immediately below.

### `references/routes/node.md`

1. **Six cadence lines -> four with global invariant 12 citation.** Removed the duplicate
   long-form stale-card example already owned by invariant 12. Both-edge reporting,
   watchdog-is-backstop, current-card truth, and `report clear` remediation remain.
2. **Four audience lines -> three.** Consolidated prose while preserving prime/PM rendering,
   worker ledger-only recording, role command, and `ROLE UNKNOWN`.
3. **Five limit lines -> three.** Removed the aspirational aside and "discover by hitting"
   admonition; exact 280/200 limits, whitespace collapse, `E-ARG`, no truncation, and
   renderer-only visual truncation remain.
4. **Five question-persistence lines -> three.** Removed repeated assurances that the
   question will be seen; non-expiry, clear/replace termination, and no re-ask/self-nudge/
   duplicate-spine behavior remain.

### `references/prime/orchestrator.md`

1. **Status preamble compressed and delegated to invariant 12.** Removed repeated
   first-person/cadence prose; both start/stop commands, their timing, question/blocked
   routing, no active semantic state, completion, and no watchdog self-pause remain.
2. **Invalid phase-report markdown removed.** `[phase report](<path>)` was not a real link
   and caused pointer-integrity failure; `phase report → <path>` retains the placeholder
   instruction without inventing a filesystem target.
3. **Build configuration reduced from repeated paragraphs to one contract block.** Exact
   coder/reviewer defaults, human confirmation, persisted verbatim read-back, worker
   topology, caller cwd, C2/C5 canary, pair lifecycle ownership, no silent defaults,
   current provided-peer path, plan-roster persistence, and flow-pair override limitation
   remain.
4. **Question escalation lines consolidated under invariants 9-10.** Removed the repeated
   explanation of why parents cannot proxy; exactly-one-hop escalation and context-owner
   questioning with a pointer remain.
5. **Worktree coordination lines consolidated under invariant 11 and `batons.md`.** Removed
   repeated tell-not-ask rationale; touch-set/overlap recording, o-prime notification,
   continued isolated work, convergence/shared-resource synchronization, and
   reconciliation-not-lock semantics remain.
6. **Long silence narrative consolidated under C7.** Removed the misconduct contrast and
   repeated recovery rationale; outage-first handling, 15-minute cadence, one liveness
   check, explicit status request, recovery poke, poke-before-redispatch, failed-pokes
   threshold, no short polling, and continuing-report fields remain.
7. **Long stale-card scenario consolidated under invariant 12.** Removed the illustrative
   busy/talking worker story already present in the global invariant. Supervisor
   accountability, unscoped `pij anomalies`, every remediation, confirmation, and the
   exact reasons `--project`/`--here` hide rows remain.
8. **Package drift paragraph compressed.** Removed repeated "known benign class" prose;
   timestamp-only classification, `.pi/packages.yaml`/`vetted.date`, boot causes,
   date-only proof, byte-identical HEAD restore, cause recording, no hand edit, and every
   content-change breach category remain.
9. **Resume paragraph reflowed.** Compaction/resume/replacement re-entry, `/pij prime`,
   substrate re-derivation, and memory-not-position truth remain.

### Marker-only files

- `references/routes/prime.md`: no rule removed; two split phrases were made exact and
  contiguous.
- `references/prime/rituals/kickoff.md`: no rule removed; two structural verification
  commands were added in their required order.

## Review warning

These are live skills. The cold review must verify commit `bfbb08d` against the inventory
above; a green syntactic gate is necessary but semantic preservation is the acceptance
criterion.
