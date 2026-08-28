# Cold review — item 10a (index-state pane guard) · TERMINAL REPORT

**Reviewer**: `pij-joint-nightingale` (GitHub Copilot CLI 1.0.81-14, claude-opus-5) — cold, no prior context on this item.
**Orchestrator**: `pij-falling-outside` · **Packet**: `reviews/item-10a-review-packet.md` · **Rubric**: `~/GitHub/pij/skills/flow-pair/references/review-rubrics.md` (Dim-0 MANDATORY)
**Worktree**: `/Users/vaughanknight/GitHub/pij-worktrees/s392-day3-codex-doctrine` (pwd verified) · **Base**: `fa6378a` · **Reviewed**: `6948e14` (impl) + `2a9a3ec` (report)

> **This pass is CLOSED.** No mutations were run after this file was written. Every mutation described below was restored and verified before writing.

---

## Verdict

**`FIX_REQUIRED` — documentation only. The code is APPROVED as written; do not revert or re-work `6948e14`.**

The guard is correct, in-fence, minimal, and its tests are genuinely non-vacuous (Dim-0 passes empirically, four mutations). What fails review is a **claim**, not a line of code: `reports/item-10a-report.md` asserts *"The resolution half of the cross-government pane-misbind incident is fixed."* My evidence contradicts that on three independent counts (F1). In an incident-facing artifact that is the difference between an incident that stays open and one that looks closed, so I am not downgrading it to a note.

If the orchestrator's convention is that prose-only defects never block a code commit, read this as `APPROVE_WITH_NOTES` on `6948e14` + `FIX_REQUIRED` on `2a9a3ec`'s report text. I have written it as `FIX_REQUIRED` because the rubric maps a wrongly-stated outcome (Dim-10) to that verdict and I would rather be explicit than tidy.

---

## Scaffolding, workarounds, and the limits of what I ran

Stated first, so nothing below reads as more solid than it is.

1. **`rg` is not installed on this machine** (`/bin/bash: rg: command not found`). Every sweep below used the `grep` tool with explicit paths or `grep -r` from the worktree root, both of which traverse `.pi/` normally. This sidesteps the repo's known hidden-path trap (AGENTS.md) but means my "no caller anywhere" claims rest on `grep -r`/`find | xargs grep`, not ripgrep.
2. **I mutated `core/daemon/index-state.ts` four times** (the packet authorises this). Backup at `/tmp/index-state.orig.ts`; pre-mutation sha256 `3a20cd49864dec8e788c756c16935b44cdaad3234e62a8f7b3cf03f44a41e30a`. **Post-restore sha256 is identical and `git status` shows the file unmodified.** Verified before writing this file.
3. **Every reproduction here is static + unit-level.** I ran no daemon, no tmux, no live pane. I did **not** reproduce the incident. My statements about the incident's mechanism are read off the incident record and the source, not observed.
4. **`just lint` was not run** (I ran `just typecheck` and the full vitest suite). The coder reports changed-file Biome PASS; I did not independently confirm it.
5. Another stream wrote `tasks/item-9-skill-check-debt/` into the tree while I worked. It is untracked, outside my fence, and I did not touch it.

### What I did NOT adequately examine

- **`just lint` / Biome** on the changed files — unverified, taken on the coder's word.
- **`harness checks` / smoke** — not run; out of proportion for a one-line pure-function change, but that is a choice, not a clean result.
- **Whether any *other* repo (main checkout, s391 worktree) calls `resolvePane`.** I searched only this worktree, which is the correct scope for this diff, but F1 would need re-checking if a consumer lands elsewhere first.
- **The `pij close` / dissolve teardown path end-to-end.** I read `FsRegistry` dissolve (`adapters/fs-registry.ts:908`) and `list()` (`:277`); I did not trace every writer that can stamp `dissolved`.

---

## Dim-0 — mutation gate (MANDATORY) · **PASS**

I ran the packet's required mutation via `just flow-pair-mutate` (twice — the harness summarises rather than naming the failing tests), then re-ran it **by hand** to capture first-hand RED output, then added three mutations of my own.

### M1 — the packet's required mutation (revert the guard entirely) · **RED (2)**

`if (d.paneId && d.lifecycle !== "dissolved" && d.lifecycle !== "failed")` → `if (d.paneId)`

```
× IndexState > resolves bound and pending panes but never dissolved or failed panes
  → expected 'dissolved' to be undefined
× IndexState > a terminal descriptor cannot overwrite the fresh seat that reused its pane
  → expected 'closed-old' to be 'fresh-bound' // Object.is equality

AssertionError: expected 'dissolved' to be undefined
- Expected: undefined
+ Received: "dissolved"
 ❯ index-state.test.ts:114:32   expect(ix.resolvePane("%2")).toBeUndefined();

AssertionError: expected 'closed-old' to be 'fresh-bound'
 ❯ index-state.test.ts:127:32   expect(ix.resolvePane("%1")).toBe("fresh-bound");

Tests  2 failed | 7 passed (9)
```

`just flow-pair-mutate` independently reported `✓ suite went RED under mutation: Failed Tests 2` → `✓ GREEN after restore` → `✓ mutation smoke PASSED`, matching the orchestrator's 2 RED.

**Assertion quality — the check the rubric actually demands.** Both load-bearing assertions are of the required kind:
- `expect(ix.resolvePane("%2")).toBeUndefined()` — a **negative** assertion; it flips from `undefined` to the literal string `"dissolved"`.
- `expect(ix.resolvePane("%1")).toBe("fresh-bound")` — an **exact-identity/state** assertion; it flips to `"closed-old"`. Not truthiness: a truthy check would have passed under mutation, since the mutated code returns a perfectly truthy wrong id. This is exactly the reused-pane case the packet asked me to confirm.

No weak-test red flags from the rubric list apply to the two new tests: no `.ok === true` truthiness, no lenient OR-regex, both exercise the failure branch, and the values are re-derivable from the code.

### M2 — drop only the `failed` clause · **RED (1)**

`… && d.lifecycle !== "dissolved")` → `× … never dissolved or failed panes → expected 'failed' to be undefined` · `Tests 1 failed | 8 passed`

### M3 — drop only the `dissolved` clause · **RED (2)**

`… && d.lifecycle !== "failed")` → both tests fail as in M1 · `Tests 2 failed | 7 passed`

**M2 + M3 together prove each clause is independently guarded** — the suite does not merely notice "some guard exists".

### M4 — over-restriction (allow-list instead of deny-list) · **GREEN → this is a gap (F3)**

`if (d.paneId && (d.lifecycle === "bound" || d.lifecycle === "pending"))` → **`Tests 9 passed (9)`.**

The suite stays green while `ready` and legacy (`lifecycle: undefined`) seats silently lose pane resolution. The execution log explicitly claims *"Bound, pending, ready, and legacy descriptors retain pane resolution"* — the `ready`/legacy half of that claim is **asserted but untested**. `desc()` defaults `lifecycle` to `undefined`, and no test in the file pairs a `ready` or legacy descriptor with a `paneId` (`SNAPSHOT`'s legacy seat `pi-a` has no pane at all).

### Bonus — the retention half IS guarded

`expect(ix.get("dissolved")?.lifecycle).toBe("dissolved")` / `…("failed")` (test lines 118–119, 128) go RED if a dead seat is ever dropped from `byId`, so packet item 3's "these must stay indexed" property is protected without needing a mutation. Confirmed against the diff: `git show 6948e14` touches **only** the `byPane` line (plus one comment) in `index-state.ts` — `byId`, `byHarnessSession`, `byHarnessIdentity` are untouched.

---

## Regression + gates (independently re-run)

| Gate | Result |
|---|---|
| `npx vitest run .pi/extensions/pij/core/daemon/index-state.test.ts` | **PASS** 9/9 |
| `npx vitest run .pi/extensions/pij` (full extension suite) | **PASS** — 171 files, **3946 passed**, 15 skipped, 0 failed |
| `just typecheck` (`tsc --noEmit`) | **PASS** (exit 0) |
| `just lint` | **not run** (see scaffolding §4) |

No regression. Scope is clean: the diff touches `index-state.ts` + `index-state.test.ts` only (impl), and docs-only in `2a9a3ec` — exactly the declared fence, with no `loop.ts` change (Dim-1 PASS, Dim-9 PASS).

---

## Findings

| # | Sev | Dim | Finding |
|---|-----|-----|---------|
| F1 | **high** | 10 / 3 | Report claims the incident's resolution half is *fixed*; three independent facts say the change is behaviour-neutral hardening. |
| F2 | medium | 6 | `resolvePane`'s doc comment no longer describes its contract — the next consumer (item 10b) will read the old one. |
| F3 | medium | 0 / 4 | Over-restriction is unguarded (M4 GREEN); the `ready`/legacy claim in the execution log has no test. |
| F4 | low | 0 | Packet Q2 answered: `failed` **can** own a live pane. The exclusion is still right, but not for the stated reason. |
| F5 | info | — | Out-of-fence: six ad-hoc pane→id resolvers have no lifecycle filter at all. Route to 10b. |

### F1 · high · The "incident fixed" claim is not supported

`reports/item-10a-report.md` line 5: *"The resolution half of the cross-government pane-misbind incident is fixed."* Three findings, any one of which alone would make that overstated:

1. **`IndexState.resolvePane` has zero production callers.** A `find | xargs grep` over every `.ts/.js/.mjs/.cjs/.json` in the worktree (excluding `node_modules`, `.git`) returns exactly two source files: `index-state.ts` (the definition) and `index-state.test.ts` (its own tests) — plus `.flow-pair/runs/**` packet JSON, which is this delegation's own prompt text. `daemon.ts` is the only importer of `IndexState` (`daemon.ts:60`, `:151`) and uses only `rebuild`, `all`, `pending`, `get` (`:388, :393, :416, :495-497, :521, :561, :800, :829, :1057, :1333`). `this.index` is never passed to another module. **Nothing in production resolves a pane through this index today.**
2. **Even with a caller, the `dissolved` arm would be unreachable.** The daemon rebuilds exclusively from `this.registry.list()` (`daemon.ts:388/416/496`) and the production registry is `FsRegistry` (`daemon.ts:1557`), whose `list()` already drops dissolved records: `if (descriptor && descriptor.lifecycle !== "dissolved")` (`adapters/fs-registry.ts:277`; `FakeRegistry` matches at `adapters/fakes.ts:166`; documented at `core/anomalies.ts:195`). A dissolved descriptor never reaches `rebuild()`. Only the **`failed`** arm can change what the index contains.
3. **`byPane` was not the incident's mechanism.** The incident record states seat `pij-nasty-tick` had **`paneId None`** and that pane `%108` was **unregistered**. A pane-less seat never enters `byPane`, and an unregistered pane has no descriptor — so `resolvePane("%108")` returned `undefined` *before* this commit too. The record's own §Mechanism half 2 is *"pending-recovery / pane resolution for a pane-less copilot seat accepted an unregistered pane of the same harness"* — that is the bind side, i.e. item 10b.

**None of this makes the commit wrong.** Closing a reachable-by-construction hole in a shared index before someone wires a consumer to it is good defence-in-depth, and the item's own tasks.md scopes it honestly as "the resolution-side half". The defect is that the deliverable states an *outcome* the evidence does not support, in an artifact attached to a live incident.

**Remedy (docs only, no code):**
- `reports/item-10a-report.md` — replace "is fixed" with the accurate claim, e.g. *"`IndexState.resolvePane` can no longer return a dissolved or failed seat. This is defence-in-depth: the accessor has no production caller today and `FsRegistry.list()` already excludes dissolved records, so no runtime behaviour changes. The incident's actual resolution path (a pane-less seat adopting an unregistered pane) is item 10b and remains OPEN."*
- `tasks/item-10a-index-state-guard/tasks.md` §Problem — the line *"In the incident a dissolved copilot seat became a delivery/resolution target"* is true of the outcome but implies `byPane` was the route; note that the seat was pane-less.
- **Do not mark the incident's resolution half closed on this commit.**

### F2 · medium · The public contract of `resolvePane` is now stale

`index-state.ts:96` still reads `/** Reverse-resolve a tmux pane id back to its pij-id. */`. After this commit that is no longer what it does: it reverse-resolves a pane to its pij-id **only for non-terminal seats**. The incident citation lives on the `rebuild` guard (`:56`), where a consumer reading the accessor will not see it. Item 10b is explicitly the change that wires a real caller into this area — it will read the wrong contract. Suggested: `/** Reverse-resolve a tmux pane id to its pij-id — LIVE seats only. Terminal (dissolved/failed) seats are deliberately absent (pane-misbind incident), so this is a delivery-target index, not a pane-ownership index. */`

### F3 · medium · Dim-0 gap on the other side of the guard

Per M4. The tests pin the deny-list's *exclusions* hard (M1/M2/M3 all RED) but nothing pins its *inclusions* beyond `bound`/`pending`. Suggested: extend the existing `resolves bound and pending panes…` case with `desc({ id: "ready", paneId: "%5", lifecycle: "ready" })` and `desc({ id: "legacy", paneId: "%6" })`, asserting both resolve. That one addition turns M4 RED.

### F4 · low · Packet Q2 answered: a `failed` seat *can* own a live pane

The packet reasons "a `failed` PRE-BIND seat has no live pane". That premise is **not universally true**, though the conclusion still holds. `markFailed` has exactly one call site — `fail()` in `core/daemon/loop.ts:494-513` — and it **does not kill the pane**; it persists the descriptor (`paneId` retained) and notifies the spawner. Two `DeathReason` values describe a failed seat whose pane is demonstrably alive and genuinely its own (`core/types.ts:66-67`):
- `"bind-timeout"` — *"spawned, **pane alive**, but never bound inside the bind window"*;
- `"pane-input-blocked"` — *"boot line never written: **a human was typing in the pane**"* (`loop.ts:480-490`).

Excluding these from `byPane` is still **correct for this index's purpose** — a seat that never bound must never be a delivery target — and there is no consumer to regress. But the justification should be "terminal ⇒ never a delivery target", not "has no live pane", because the latter is false for two of eight death reasons. This is the same point as F2 from the other direction: the index has quietly become a *delivery-target* index, and that is the fact to write down. No change to the shipped condition is warranted.

### F5 · info · Out of fence — the live pane→id resolvers are still unguarded

Six sites resolve a pane to a session id **directly off `registry.list()` with no lifecycle filter**: `core/spawn.ts:797`, `core/discovery.ts:141`, `core/cli.ts:1999`, `.pi/extensions/pij/cli.ts:927`, `:3764`, `:4108`/`:4347`. They fail safe when two descriptors claim one pane (`byPane.length === 1` ⇒ ambiguity yields `undefined`), but a **lone `failed` seat holding a reused pane resolves to the dead seat** — the same defect class this commit fixed in `IndexState`. `dissolved` is masked there too by `FsRegistry.list()`, so `failed` is again the live edge. **Out of item 10a's fence and correctly not touched.** Recorded so it lands with item 10b or a new item rather than being assumed covered.

---

## Dimension summary

| Dim | Verdict | Note |
|---|---|---|
| 0 Test quality | **PASS** | 4 mutations; M1/M2/M3 RED with negative+identity assertions; M4 GREEN → F3 |
| 1 Scope | PASS | `index-state.ts` + `.test.ts` only; no `loop.ts` |
| 2 Contract | PASS | Guard is verbatim the packet's specified line; `byId`/`byHarnessIdentity` untouched |
| 3 Plan-alignment | **FINDING** | T001–T003 delivered; T003's report states an unsupported outcome (F1) |
| 4 ACs | PASS w/ note | Both behavioural claims tested; inclusion side untested (F3) |
| 6 Domain-currency | **FINDING** | Accessor doc not updated to the new contract (F2) |
| 7 Progress log | PASS | `execution.log.md` present with RED/GREEN narrative, file list, gate results |
| 8 Regression | PASS | 3946 tests pass; typecheck clean; `just lint` not re-run by me |
| 9 Prompt-follow | PASS | Fence respected, TDD order evidenced, pathspec commits, incident comment present |
| 10 Learning | **FINDING** | Decisions captured, but the outcome stated is wrong (F1) |

**Reviewer integrity**: mutations restored byte-identical (sha256 `3a20cd49…41e30a` before and after; `git status` clean for the file). The only file I wrote is this one.
