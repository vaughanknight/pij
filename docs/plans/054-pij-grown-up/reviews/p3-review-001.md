VERDICT: APPROVE

# P3 review 001 — cold cross-model review (cycle 1)

**Reviewer**: cold copilot `gpt-5.6-sol` @ xhigh (reviewed P1 ×6 + P2 ×1; compacted, re-derived from artifacts).
**Target**: range `e39cbb4..99372bf` — Phase 3 (Enforced tree + adoption, the #20 fix), 7 commits, 16 files (+762 / −59).
**Authorities honoured (precedence)**: plan §Phase 3 + AC-08 + Finding 07 · WS-1 (three-axes split) · `tasks.md` §SW-7 (BINDING) + coder-packet · execution.log (claims, not truth) · my p1-review-001..006 + p2-review-001 (all prior pins must hold).

---

## Gates (run by me in the worktree)

| Gate | Result |
|---|---|
| `just typecheck` (`tsc --noEmit`) | **clean** |
| Fenced `npx vitest run core adapters` | **1934 passed / 7 skipped / 0 failed** (matches coder claim) |
| Boundary sensor live plant (`process.env.HOME` in prod `gauge.ts`) | **RED** as required (`× context/gauge.ts imports only permitted modules`), reverted clean |
| `deriveCallerParent` independent edge-probe (7 cases) | **7/7 pass** |

Baseline flake `harness/scripts/release-age-policy.test.ts` (pwsh ETIMEDOUT) is out of scope per packet; not exercised by the fenced gate.

---

## Independent SW-7 verification (HIGH if violated) — PASS

- **Forbidden identity-internals untouched**: `git diff --name-only e39cbb4..99372bf | grep -E 'core/discovery|core/current-session|core/close'` → **EMPTY**. I ran this myself; s051's zone is byte-untouched. Parent DERIVATION changes live only at the two `cli.ts` spawn call sites + adopt application; `resolveSelf` is retained verbatim for `--branch` fork-source and messaging.
- **Behavior-contract law**: I spot-checked every new/changed test file. `deriveCallerParent` tests assert **outcomes only** (the pure fn doesn't even take cwd as a parameter — the strongest possible proof cwd cannot gate it). The tree/unadopted tests assert projection outcomes (three axes independently). The link tests assert event field values, `opJournal` empty, refusal-mutates-nothing, append-failure honesty — never internal call shapes. **Zero internal call-shape assertions found.** Contracts would survive an s051 identity-internals rewrite.
- **Fence**: `daemon.ts` is **ABSENT** from the diff (SW-6 window respected). No new top-level paths beyond the declared fence.

---

## Per-AC / dimension conformance

### AC-08 (parent = invoking session; adopt; prime root; unadopted; re-parent history) — CONFIRMED
- **Caller-truth derivation** (`core/spawn.ts` `deriveCallerParent`): `PIJ_SESSION_ID` (trimmed non-empty) wins → else a **unique** pane-exact match across the **FULL** registry list → else `undefined`. cwd is never an input. Wired at BOTH spawn sites: control-plane `parentId` and pi `announceTo` (child self-registers `spawnedBy` from it) — so the #20 mechanism is killed on both paths. Verified live through the real bin (integration suite: #20 kill, cross-cwd pane, env-wins, pi announce).
- **adopt** (`cli.ts` runAdopt, unchanged by P3): `--parent` validated via `planLink` (cycle-checked) and persisted present-when-given (`cli.ts:1997`); parentless adopt never infers a parent. Integration test pins both. Ruling (g) holds.
- **prime parentless = legal root**: `isUnadopted` excludes `prime === true`; tree test pins prime root, no problem, `effectiveParentId: null`.
- **unadopted enumerable machine-wide**: `tree --global --json` flows `unadopted: true` (present-when-true) on nodes; `list --json` carries an explicit per-row boolean. Filter recipe pinned (`forest.roots.filter(unadopted === true)`).
- **re-parent history reconstructable**: `spine events --peer <child>` replays `A→B→C→root` incl. the root hop; verified end-to-end through the bin (2 node-linked events).

### Dimension 3 — new-surface correctness
- **`deriveCallerParent`**: my 7-case probe confirms empty/whitespace pane query → undefined; undefined descriptor panes never accidentally match a defined query; pane resolves self among cohabitants; env short-circuits an ambiguous pane; ambiguous pane (dup registrations) refuses; no-identity many-cohabitants → undefined (the #20 kill).
- **`isUnadopted`**: `prime !== true && effectiveParent === null`. An **orphan** (parent pointer whose target vanished) keeps a non-null `effectiveParent` → NOT unadopted, correctly a structural `TreeProblem` on a different axis. Explicit `--root` on a non-prime writes `parentId: null` (severing the `spawnedBy` fallback) → correctly unadopted.
- **node-linked event** (V-05 uncoupled): appended under `withPlatformWriteLock` → `recoverPendingOps` gate → `buildSpineEvent` → plain `append` (never journaled — `opJournal` empty pinned). Root shape ruled and honoured: `next` OMITTED via own-property spread (never null/sentinel), refs `[node:<child>]` only, `prev` still carried. Append-failure is honest: descriptor truth lands first, `spineSeq: null` + `spineWarning` in JSON **and** a `(WARNING: …)` suffix in human output; exit stays 0 (the re-parent DID happen — only the audit line failed). **The warning surface is adequate** (surfaced in both output modes, machine-readable, mirrors the P2-approved runtime-axis skip-and-log doctrine) — not a silent loss.

### Dimension 5 — regression / frozen surface
- **P1/P2 pins**: all green inside the 1934-test fenced run (J1/K1 recovery, corroboration, latch discipline, 44h anomaly, the codex 72M-vs-258k lie pin retained in `gauge.test.ts`).
- **Frozen `core/cli.test.ts` legacy block**: diff has exactly two hunks (one import add ~L1377, one tail-additions block from L3574) and **zero deletions** — the first-58-test legacy block is byte-identical.

### Dimension 7 — P4 exposure
- T005's consumption contract is adequate for P4 4.3: one predicate (`isUnadopted`) feeds tree node / list row / hint; `ADOPTION_HINT` is the single authored remedy text to import from `core/tree.js`; enumeration query shape (`tree --global --json` filter + `list --json` boolean) is stable and test-pinned. A UI/skill can consume it as-is.

---

## Coder rulings a–g — ALL SOUND

- **(a) event `prev` = `effectiveParent(current)`, not raw `parentId`** — SOUND. Records the tree truth every projection speaks; a spawned child's first re-parent honestly reads "was under its spawner" (`spawnedBy`), giving a gapless reconstruction chain. Raw `parentId` would omit that hop and drop history. Deviation from the packet's descriptive anchor is a correctness improvement.
- **(b) `pij link` now attribution-REQUIRED in the wired bin (F2); a pre-existing bin composition test UPDATED** — SOUND, legit contract evolution. The updated test lives in `cli.integration.test.ts` (the real-bin suite that evolves with verb contracts), **not** the frozen `core/cli.test.ts` legacy block. Requiring an identifiable actor for an audited re-parent IS the audit hole T004 closes; the `--actor` escape hatch preserves every workflow (refusal message names it), refusal-mutates-nothing is pinned, and no legitimate action is blocked — only unattributed ones.
- **(c) attribution rides `resolveSelf` (incl. lone-local) while parent derivation excludes lone-local** — SOUND. "Which session am I" (messaging/attribution, s051's contract) is a distinct question from "who parents this child" (tree truth). Attribution's lone-local convenience is orthogonal to the #20 fix; keeping the split confines the behavior change to parent derivation only.
- **(d) `--branch` keeps `resolveSelf`** — SOUND. Fork source is OUR OWN descriptor; parent is the caller. Verified `callerRes` feeds only `planBranch`, `parentId` comes solely from `deriveCallerParent` (`cli.ts:1230-1254`, `buildControlSpawnCommand` at 1308).
- **(e) T006a sensor: comment reworded, regex NOT weakened** — SOUND, independently verified. `GLOBAL_PROCESS = /\bprocess\s*[.[]/` scans raw source; the old `"no process."` comment tripped it (a false positive), reworded to `"process-free"` (no `.`/`[` follows). A live plant of `process.env.HOME` in production `gauge.ts` still turns the sensor RED, and `FORBIDDEN_PRODUCTION` still catches `node:fs`. The new `toContain("context/gauge.ts")` coverage pin closes my P2 note-1 gap (pure-but-unsensored). No detection gap masked.
- **(f) dead codex `contextWindow` output REMOVED** — SOUND removal, no lost data. The field was never consumed (my P2 note 3). `codexContextFromRollout` now returns `number | null`, aligned with its claude/pi siblings; the consumer updated to the bare value. `contextMax` is the models.json join (AC-09); a second self-reported max needs its own precedence ruling, correctly logged as a P4/backlog DEFERRED item rather than silently wired.
- **(g) "adopt needed no change"** — SOUND, verified against AC-08. runAdopt (untouched by P3) already honours `--parent` (validate+persist) and never infers a parent for parentless adopt; both pinned in the integration suite.

---

## Non-blocking observations (do NOT block APPROVE)

1. **LOW — `pij link`'s descriptor write is outside the platform write lock (pre-existing, doctrine-consistent).** The link `registry.write(planned.value)` runs before `withPlatformWriteLock` (only the spine append is locked), whereas `task-set`/`state-set` run `denormDescriptor` **inside** the lock (`core/cli.ts:2140`). So a `link` racing a same-node `state set`/`task set` could, in the microsecond window between the denorm's fresh read (`cli.ts:1777`) and its raw write (`:1782`), have its `parentId` reverted — and unlike `systemState`, `parentId` does not self-heal. Mitigants: (i) the window is microscopic; (ii) it is **pre-existing** — the link descriptor write was always lock-free, and P3 T004 only ADDED the (locked) spine append, not the descriptor write's scope; (iii) it is **doctrine-consistent** — V-05 says descriptor truth must never wait on the spine, so moving the write inside the lock would violate that doctrine; (iv) the spine event still records the re-parent intent, and a reverted-to-parentless node self-announces as `unadopted`, prompting a re-link. The denorm doc's claim "raced denorms don't exist: every caller runs under the platform write lock" is technically accurate as scoped (denorm-vs-denorm), but does not cover denorm-vs-link. Consider a one-line doc note acknowledging the link-vs-denorm residual, or (if ever tightened) a merge-write for the link parentId — not required for this phase.

2. **LOW (carry-forward, unchanged) — T006c `model_context_window` deferral.** Removal is correct today; the DEFERRED backlog note (precedence vs the models.json join, AC-09) should be picked up in P4 before any rollout-reported max is wired. Tracked in the execution log; noted here only so it is not lost.

---

## Whole-of-P3 attestation

I attest that Phase 3 (Enforced tree + adoption): (1) implements AC-08 caller-truth parentage from identity only, killing issue #20 on both spawn paths; (2) surfaces `unadopted` as an independent adoption axis (prime never flagged, orphan ≠ unadopted); (3) audits `pij link` as an uncoupled V-05 node-linked spine event with the ruled root shape, honest append-failure, and immutable `spawnedBy`; (4) resolves all three P2 carry-ins soundly (sensor extended + live-verified, denorm fresh-read pinned, dead codex output removed); (5) holds every P1/P2 pin green; (6) satisfies SW-7 independently (identity-internals untouched, contracts are outcome-only, `daemon.ts` absent). All seven coder rulings (a–g) are SOUND. The two observations are LOW and non-blocking.

**VERDICT: APPROVE** — Phase 3 closes.
