# Review — plan-084 Phase 3 (Add the repair path)

**Verdict**: ⚠️ **REQUEST_CHANGES** → **all 3 in-scope findings CLOSED**, 1 ruled out of scope and filed.
**Reviewed** 2026-08-05 · base `efcc889` (uncommitted at review time) · branch `s091/pa-gate-repair`
**Cold reviewer**: `phase3-reviewer` (gpt-5.6-sol) · **Persisted by** `pij-respectable-starfish` (reviewer is read-only)

## Clean, with evidence

| # | Question | Verdict |
|---|---|---|
| 1 | **Can `--for` undo Phase 2?** | **No.** `--for <seat>` / `--for=<seat>` only, no alias; unknown flags rejected by the watchdog allowlist (`core/cli.ts:880,966-970`); repeated flags last-wins and every final value still reaches the PA refusal; bare/empty/whitespace fail parsing (`:1330-1332`). The refusal checks `forSeat !== undefined` on the **caller's** projected role **before** target authorisation (`:2295-2318`), so naming self, parent or a stranger is immaterial. Reachable on both the bin path (`cli.ts:4098-4103` → `:4249-4270`) and core (`core/cli.ts:2263-2277`). |
| 2 | **Is `addedAt` preservation total?** | **Yes, sequentially.** One production construction site (`core/cli.ts:2430-2442`); the prior watcher is captured **before** filtering (`:2423-2427`); existing → `prior.addedAt`, new → fresh stamp (`:2439`). Self re-bind, PA self/parent re-bind and `--for` share the branch. Exemption normalisation preserves fields through spreads (`core/watchdog.ts:31-37,70-105`). One invocation cannot hold both actions (parser arity, `:1244-1265`). |
| 3 | **Re-keyed filter** | **Both directions closed.** Effective id `cmd.forSeat ?? self.value` (`:2419`); `watch --for X` replaces rather than duplicates; `unwatch --for X` removes X not the caller; `prior` captured before filtering so no ordering loss. |
| 4 | **Co-watchers respected?** | **Yes, sequentially** — non-matching entries retained verbatim (`:2424-2433`). **No, concurrently** → Finding 4. |
| 5 | **Cross-phase regression** | **None.** Phase-1 projection, `paTargetDecision`, the `conditional` arm, the totality scrape (now incl. chore subverbs), the "never says prime" pin, and the AC-14 zero-read invariant all intact. |
| 7 | **Documentation** | Accurate on named-seat binding, PA refusal incl. self, replace/remove semantics, and `addedAt` preservation — **after** Finding 3. |

## Findings and disposition

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | MEDIUM | **Parser hole** (`core/cli.ts:1268-1307`): `interval`, `exempt`, `list`, `disable-all`, `enable-all` returned **before** validating `--for`, so they silently ignored it and executed — contradicting the parser's own safety comment *and* the doc. An invocation with an invalid `--for` could still hit the machine-wide kill switch. | **FIXED.** Validation moved to the first statement of the watchdog case, above every early return. The test that missed it listed four actions and omitted **exactly the five that returned early** — *the hole and the blind spot were the same shape*. Now enumerates **all nine** watcher-less actions **and asserts each DID NOT WRITE** (a flag "rejected" while the action still executes is not rejected). Mutation: move validation back down → `watchdog exempt --for must be rejected: expected +0 not to be +0`, exit 0 — it executed. |
| 2 | MEDIUM | **Vacuous AC-10 test** (`core/cli.test.ts:8232`): named *"REFUSES a PA `--for` EVEN when it names itself"* but passed `"pij-pa-self"` while the caller was `"pij-boss"`. A regression permitting `forSeat === caller` would leave it green. Its own comment three lines above warns about right-verdict-wrong-reason — and it committed a different instance of exactly that. | **FIXED.** Now passes `CALLER`, keeps the unflagged control, asserts the third-party case separately. Mutation: permit `forSeat === self.value` → fixed test reddens. **And the coder proved the OLD test was blind rather than asserting it** — restored `"pij-pa-self"` with the mutation still injected, re-ran, **GREEN**. |
| 3 | MEDIUM | **`pij watchdog --help` omitted `--for`** (`cli.ts:342-348`). `usage-flags.test.ts` pinned the one-liner at `:332`, which got fixed; the dedicated help block — **the canonical place a prime looks** — was unpinned and did not. The recovery path was documented in **the string a test reads, not the one a human reads**. | **FIXED + PINNED.** Both help lines carry `[--for <seat>]`, plus a section on what the flag *does*. Pinned at **the PATH, not the flag** (`cli.integration.test.ts:3370`) so the failure mode recurs loudly for the next flag, with a **recursive vacuity guard** (`:3404`). Mutation: strip `--for` → pin reddens. **This is Pattern 0** — see the plan. |
| 4 | MEDIUM | **Unlocked read-modify-write** on watcher updates (`core/cli.ts:2370-2447`): concurrent `watch`/`unwatch` can silently erase a co-watcher or a preserved `addedAt`. Atomic *file publication* (`adapters/watchdog-store.ts:76-85`) is **not transaction atomicity**. | **OUT OF SCOPE — filed as #133.** Pre-existing; this stream changed *what* is written, not the concurrency shape. A correct fix is an interprocess lock or a store-level atomic-update API — a different change with its own failure modes deserving its own proof. Recorded as a known limit in the plan. Coder concurred with independent reasoning. |

## Final gate — run by the orchestrator, not taken on report

```
harness checks → ok: true · 8/8 · skipped: []
local-paths · typecheck · lint · test · windows-compat · smoke · pkg-audit · snapshots
```

Suite: **3419 passed / 15 skipped**, zero failures, green on first run. `tsc --noEmit` clean.
`just format` — no fixes needed.

## What this review earned

Answering *"what did all three of us miss?"* produced Finding 4 — which the author, the
orchestrator and two prior reviewers had all not raised — and Finding 3, which is the stream
violating its own recorded principle fifteen lines from where it wrote it down. **Both cold
reviews on this plan returned REQUEST_CHANGES with findings nobody inside the work had seen.**
