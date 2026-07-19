# INS-004 caller-identity consolidation — design (for o-prime deconfliction)

**From**: pij-civilian-takin (s057) · **To**: pij-reasonable-dove (o-prime) · cc s051 (hyena)
**Status**: APPROVED by o-prime (rulings below); implement STEP 0 in parallel against hyena's contract, land after s051's `resolveCaller` merges.
**Interim already landed**: `becf7f9` (runClose → orchestrationSelf, high-severity relief).

## o-prime RULINGS (approved — supersede the decisions section below)

- **D1 — landing order**: s051 lands `resolveCaller` FIRST (hyena's frozen reviewed
  deliverable + next major merge); this consolidation lands as a **subsequent additive
  s057 increment** on that base (fallback-param + `pid-ancestry` source + hook-slot +
  the ~9 routings). One resolver in `discovery.ts`; invariant-11 + PD-011 respected.
  **Build+test STEP 0 in parallel** against hyena's base-hash contract; agree the exact
  base hash + hook-slot signature so the pieces compose (hook off-by-default → G7 additive).
- **D2 — tail split by HARM (not just #20)**: the graded per-site tail is accepted, and
  refined: **`folder-lone-local` is reserved for benign send/messaging paths**;
  **AUTHORITY / DESTRUCTIVE sites (close, teardown, ownership) → `none` (fail-loud)**, same
  as parent-derivation — a mis-guessed identity on a destructive op is a real hazard; an
  honest `E-AMBIG` ("set PIJ_SESSION_ID") beats a wrong teardown. **So close's tail = `none`.**
  (The unfiltered pane check running FIRST is what satisfies "never folder-starve"; the tail
  is only reached after it fails.)
- **D3 — ambient**: KEEP opt-in; do **not** extend to `deriveCallerParent` in this
  consolidation — keep it behavior-preserving (delegates == today, cleanly testable).
  `ambient-for-parent-derivation` is filed as a SEPARATE improvement, evaluated on its merits.
- **HARD INVARIANT**: every parent-derivation site MUST be `none` (#20 guard) — non-negotiable;
  the per-site explicit tail param is exactly what enforces it. Cross-cwd repro after each core edit.

### Per-site tail assignment (applying D2 — finalized at implementation, surfaced for review)

`none` (authority/destructive/attribution): close (2110), all parent-derivation
(`deriveCallerParent`, focus-launch 1064), branch fork-source (1266), agent-report
(2714 — triggers `--once` teardown), agent-spawn `spawnedBy` (2597 — durable parent,
#20-adjacent), compact-self (1489 — best-effort, `none`→try/catch no-op is the clean
miss), watch/unwatch (1522 — identity-keyed subscription state). `folder-lone-local`
(benign): `selfId`'s default (send/messaging), focus-save (999 — recoverable snapshot).
Surfacing this split for o-prime's glance before STEP 1 lands.

## Verdict

Consolidate all five "who am I" answerers onto **ONE canonical caller resolver**,
with the **fallback tail as an explicit policy param** (the real fix — the
tail-divergence is INS-004 reproduced among the strong paths). The resolver is
**s051's `resolveCaller`** (already in `core/discovery.ts` on the s051 branch),
extended *additively*. **We must NOT create a second `resolveCallerIdentity` — that
would fork the consolidation itself.**

## The landscape (audit result — 5 answerers, cross-file divergence)

| Resolver | Home | Strength | Ambient tier | Fallback tail |
|---|---|---|---|---|
| `resolveSelf` (base) | discovery.ts:128 | primitive | no | caller decides |
| `selfId` | core/cli.ts:1136 | STRONG | **yes** | folder-lone-local |
| `orchestrationSelf` | bin cli.ts:2280 | STRONG | no | folder-lone-local |
| `deriveCallerParent` | core/spawn.ts:596 | STRONGEST | no | **none** (issue #20) |
| ambient (`resolveRegisteredAmbientSelf`) | core/current-session.ts:66 | native-id axis | — | n/a |

- **`core/cli.ts` is already consolidated** onto `selfId` (~13 sites via `resolveActor`). **Every weak folder-starving site is in the bin `cli.ts`.**
- The strong members **diverge in their tails** — that divergence *is* the bug shape. A single resolver must make the tail an **explicit param**, not three silently-different code paths.

## The canonical resolver (behavior spec — realized as s051's `resolveCaller`)

Pure, injected deps (no registry/env/tmux import leaks into discovery.ts). Merge
of s051's `resolveCaller` (CallerResolution + sources + `uncommittedTransitionIds`
+ `validateIdentityAuthority`) with two additive contributions from this design:
**(a) the fallback-policy param, (b) the pid-ancestry source + hook.**

**Resolution order** (dove's precedence, explicit):
1. **AMBIENT** (only if supplied): native-id tier; cross-check vs explicit env → mismatch = E-AMBIG. *(preserves selfId@1140 exactly)*
2. **EXPLICIT** `PIJ_SESSION_ID` → win. *(folder starvation structurally impossible past here)*
3. **FULL-registry PANE pre-check — NO folder filter**: unique `paneId` match → win. *(this is the INS-004 fix — folder-filtering here is what starved)*
4. **[PID SEAM]** if pane is non-unique (0/>1) and `resolvePaneToPid` supplied → hyena's G7 disambiguation (§ pid seam). Refines step 3, never replaces it.
5. **FALLBACK tail** — the explicit policy param:
   - `"folder-lone-local"` → the legacy lone-local + folder-scoped retry (messaging/ownership convenience selfId/orchestrationSelf keep).
   - `"none"` → **fail-loud** `E-AMBIG` — never folder, never lone-local, never guess. Parent-derivation callers map `Result→undefined` at their boundary (issue-#20-safe).

**Delegates** (this *is* the consolidation — same question, one answer, explicit tails):
- `selfId` → ambient=on, fallback=`folder-lone-local` (richest).
- `orchestrationSelf` → ambient=off, fallback=`folder-lone-local`.
- `deriveCallerParent` → ambient=off, fallback=`none`; map E-AMBIG→undefined (preserves #20 guarantee).
- `resolveSelf` stays as the innermost primitive (not deleted).

## Classification (dove's crux — route vs leave)

**ROUTE onto the canonical resolver** (bin cli.ts unless noted):
- **Weak (the INS-004 backlog)**: 999 focus-save, 1064 focus-launch parentId, 1266 branch fork-source, 1489 compact-self, 1522 resolveWatchSelf (watch+unwatch), 2714 agent-report.
- **Strong dupes to fold**: 2597 runAgentSpawn (inline hand-rolled dupe), 2280 orchestrationSelf + 1136 core selfId + 596 deriveCallerParent (reimplement as delegates — their ~13+ downstream callers inherit unchanged).

**doNotRoute** (correctly excluded — folder-scope/target/geometry/native-ambient is load-bearing): 961 (spawned-child by target pane), 1148 & 2474 (`tmux.currentPane()` geometry), 2100 (close TARGET id), current-session.ts ambient (plugs in as the `ambient` hook, stays distinct), core/cli.ts:1958 phonehome (env-only bootstrap, guarded), binding.ts native-id resolvers, **`--here` view filters (core/cli.ts:1511/1573/2782 — folder scope IS the feature)**, index.ts:243 producer.

## The pid seam (hyena's agreed contract — zero-fork, refined by s051 review)

**NO pane hook** (my first proposal was rejected — firing pid on an ambiguous pane
would break s051's frozen fail-closed pane tests). Instead: optional `selfPid` +
`parentPidOf: ParentPidOf` **directly on `ResolveCallerInput`**; `resolveCaller`
invokes an internal subordinate `resolveByPidAncestry(input): Result<SessionId |
undefined>`, then its existing `validateIdentityAuthority`. **PID-ancestry runs
only when the pane signal is ABSENT** (the no-tmux gap) — **a present pane with
0/>1 matches stays `E-AMBIG`** (s051's fail-closed invariant, preserved).

Contract: `ParentPidOf = (pid) => Result<number|null>` injected port; walk
`selfPid` inclusive → ancestors; ignore retired/dissolved; **>1 active at a pid →
E-AMBIG sorted-ids (never array-order)**; fail-loud on invalid-pid/cycle/depth;
**pid selects a CANDIDATE only** — `validateIdentityAuthority` adjudicates.
`IndexState.resolvePane` is **left alone** (daemon routing, not caller authority —
reusing it as adjudicator would fork `validateIdentityAuthority`). Off-by-default
(`parentPidOf` omitted → behavior == today) → **G7 lands additively after STEP 0,
no re-consolidation.**

**fallbackPolicy semantics** (s051 constraint): omission defaults `folder-lone-local`
byte-for-behavior; `none` disables **only the final cwd step** — it must NOT convert
a contradictory explicit/ambient or an ambiguous pane into fallback (those still
`E-AMBIG`). Ambient stays untouched: delegates pass `ambientId` or `undefined`; the
ambient STEP in `resolveCaller` is never dropped.

### Open (NON-BLOCKING) — pane-collision policy (o-prime named it an INS-004 trigger)

s051's frozen behavior leaves a present-but-ambiguous pane (0/>1 — a **pane-collision**,
which o-prime named alongside cwd≠folder as an INS-004 trigger) as `E-AMBIG`. The
zero-fork shape above does NOT pid-disambiguate a collision. To do so would change
s051's fail-closed invariant — a **separate** named policy `paneConflictPolicy?:
"fail" | "pid-ancestry"` (default `fail`), Result-typed, needing its own o-prime
ruling. **Question for dove**: does caller-identity want a pane-collision
pid-disambiguated, or fail-loud? cwd≠folder is fully fixed either way (full-registry
pane pre-check); this only affects the >1-collision tail. **Does not block STEP 0**
(builds with `fail`).

## THE decisions I need from you

1. **Landing order / convergence (the keystone)** — `discovery.ts` is the shared
   serialization point (invariant 11). s051's `resolveCaller` + `validateIdentityAuthority`
   are **frozen** in hyena's reviewed candidate. My additions (fallback-policy param,
   pid source/hook, the ~9 bin routings) are **additive against that exact contract**.
   Ruling needed: **does s051 land `resolveCaller` first, then s057 lands the additive
   param + routing on top?** (hyena will hand the exact base hash once its cumulative
   commit exists.) This avoids two resolvers in one file.
2. **Fail-loud vs folder-lone-local tail** — dove point 3 says *never folder-starve*.
   The design keeps `folder-lone-local` as a **last-resort tail AFTER** the strong pane
   check (so it no longer starves the pane match), returning E-AMBIG if even that fails.
   Is that acceptable, or do you want caller-identity to be **pure** explicit→pane→pid→fail
   (drop the folder-lone-local convenience entirely)? Affects messaging/ownership sites.
3. **Ambient tier for `deriveCallerParent`** — only `selfId` has the native-id ambient
   tier today; parent-derivation lacks it. Keep ambient **opt-in per policy** (my default),
   or extend it to parent derivation? (Likely an improvement, but a semantic shift — flagging, not silently enabling.)

## Sequencing (severity-first; STEP 0 gates hyena)

- **STEP 0** — land the canonical resolver (pure, `resolvePaneToPid` off → behavior == today's strong pane pre-check). Unit-test directly. *Unblocks everything + gates G7.* **(This is the shared-file step needing the landing-order ruling.)**
- **STEP 1 (HIGH)** — 2714 agent-report + 1522 watch/unwatch (hard-exit), and **retire the runClose interim** (2110 → canonical seam).
- **STEP 2** — fold the strong dupes (selfId, orchestrationSelf, runAgentSpawn) → ~13 core + baton/prime inherit unchanged.
- **STEP 3** — remaining weak: 999 focus-save, 1266 branch, 1489 compact-self (keep best-effort try/catch — a miss stays a silent no-op, never a crash).
- **STEP 4 (gate on decision 3)** — parent policy: 1064 focus-launch + deriveCallerParent with fallback=`none` (fixes the latent #20 regression at 1064).
- **G7** — hyena wires `resolvePaneToPid` after STEP 0; additive.
- **After each core edit**: restart the tsx daemon; verify with a **cross-cwd repro** (seat filing the verb from a shell whose cwd ≠ recorded folder — the exact starvation condition).

## Risks

- **Issue #20 reopen (highest)** — any parent-derivation site routed with `folder-lone-local` re-parents children by cwd-cohabitation. Parent sites MUST be `none`. This is why the tail is a per-site explicit param.
- **Tail flattening** — collapsing the three tails into one behavior either reopens #20 (too permissive) or breaks messaging convenience (too strict). Preserve as explicit params.
- **Live-mutating worktree** — s057 runs from here; re-anchor by symbol not line at edit time; coordinate with hyena's G7 landing into the same pane seam.
- **Daemon no hot-reload** — restart + verify against the restarted daemon.
