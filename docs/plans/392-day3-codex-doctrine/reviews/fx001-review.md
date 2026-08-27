# Cold re-review — FX001 (Phase 1 post-merge `FIX_REQUIRED`) · flow-pair dlg-0003

**Verdict**: `APPROVE` — the fix does exactly what was asked, and I verified it from **both** directions rather than only the one the packet required. One info note, no action needed.

> **TERMINAL REPORT — no pass is open.** The Dim-0 pass is **CLOSED at 2 mutations**. Nothing is pending
> against `246f234`.

**Reviewed sha**: `246f234feb9199e8c6623b51ba4a0b62bfcb309e` — test-only: `core/cli.test.ts` (+33) and `fixes/FX001-pane-less-tick-witness.log.md` (+46)
**Source finding**: `reviews/phase-1-review.md` finding 7 / mutation 6 — **my own** blocking call, now discharged
**Reviewer**: `pij-pale-araminta` — GitHub Copilot CLI 1.0.81-14, claude-opus-5 @ xhigh
**Worktree**: `/Users/vaughanknight/GitHub/pij-worktrees/s392-day3-codex-doctrine` (verified `pwd` == `git rev-parse --show-toplevel`)

---

## What the packet asked me to establish

| # | Ask | Verdict |
|---|---|---|
| 1 | **Re-run mutation 6 myself** → RED, restore → GREEN, paste both | **CONFIRMED** — pasted below, run by me, not read from the coder's log |
| 2 | The new test is the witness I asked for; **confirm it is a negative/state assertion, not truthiness** | **CONFIRMED, and I have the failure message that proves which assertion does the work** |
| 3 | **No production code change** | **CONFIRMED** — `git show 246f234 --stat`: two files, one test, one log. No `.ts` outside `cli.test.ts`. |

---

## 1 · Mutation 6, re-run by me

```
$ just flow-pair-mutate .pi/extensions/pij/core/cli.ts \
    's/effectiveDeliveryMode\(target\) !== "pull"/target.deliveryMode !== "pull"/' \
    'npx vitest run .pi/extensions/pij/core/cli.test.ts'
→ suite: npx vitest run .pi/extensions/pij/core/cli.test.ts
→ mutated .pi/extensions/pij/core/cli.ts; running suite (expect RED)…
✓ suite went RED under mutation:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
→ restored; re-running suite (expect GREEN)…
✓ GREEN after restore:
✓ mutation smoke PASSED — the suite guards this behaviour.
```

**In Phase 1 this same command left 462/462 passing. It now goes RED.** That is the finding discharged.

---

## 2 · It is a negative/state assertion, and I can show which line fails

Being told "the suite went RED" is not enough — a red can come from the wrong assertion, or from the
wrong test. So I re-ran the mutation manually to capture the failure:

```
FAIL  .pi/extensions/pij/core/cli.test.ts > dispatch send
      > omits daemon tick metadata for a pane-less bound claude pull seat

AssertionError: expected { to: 'claude-pull', from: 'a1', …(8) } to not have property "daemonLastTickAt"
    1291|   expect(machine).not.toHaveProperty("daemonLastTickAt");
    1292|   expect(machine).not.toHaveProperty("daemonTickAgeMs");
    1293|   expect(machine).not.toHaveProperty("daemonTickStale");
```

Three things this establishes that the count alone did not:

1. **The RED is the new test** — not some incidental neighbour.
2. **The failing line is the negative property assertion**, not the `toMatchObject`. The mutation leaves
   `classifySendReceipt` untouched, so `receipt`/`reason` stay correct and only the tick fields appear —
   which means the **negatives are load-bearing**, exactly the property the packet told me to confirm.
3. **The negatives are not vacuous.** `not.toHaveProperty` passes trivially on an empty or wrong object,
   so I checked the pairing: the *same* object is first pinned by
   `toMatchObject({ receipt: "queued", reason: "pull-inbox" })`, and the failure message shows a real
   9-key payload. The assertion runs against a populated object in the correct cell.

**The fixture reaches the code under test**, which was the trap I flagged when I specified this fix:

```ts
desc({ id: "claude-pull", harness: "claude", lifecycle: "bound",
       paneId: undefined, deliveryMode: undefined,
       lastTickAt: new Date(T - 1_000).toISOString() })
```

`daemonReceiptAuthoritative` (`cli.ts:691-696`) is
`effectiveDeliveryMode(target) !== "pull" && (harness === "claude" | "copilot" | "codex")`. The fixture
is `harness: "claude"`, so it **passes the harness leg** and is decided by the delivery-mode leg — the
one that changed. A `harness: "pi"` descriptor could never have reached it, and this fixture is not one.
The fresh `lastTickAt` matters too: without it there would be no tick metadata to omit and the negatives
would pass for free.

---

## 3 · I also checked the direction the packet did not ask for

A witness that a cell is **empty** is only half the guard. If `daemonReceiptAuthoritative` were made to
return `false` for *everyone*, the new test would still pass — and the tick fields would vanish from
seats that legitimately need them. That is the failure mode the Phase 1 diff created in the first place,
by widening four fixtures with `paneId: "%9"`. So I ran the opposite mutation:

```
s/function daemonReceiptAuthoritative\(target: SessionDescriptor\): boolean \{/
  function daemonReceiptAuthoritative(target: SessionDescriptor): boolean { if (target !== undefined) return false;/

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯
FAIL  infers a pane-less legacy pi descriptor as pull-inbox while claude push stays daemon-owned
FAIL  busy control-plane peers with a fresh tick wait for the daemon's authoritative receipt
FAIL  marks a queued receipt as daemon-stale when the daemon tick is wedged
FAIL  names the compact hold at send time — 'queued: target compacting' (DL-004)
FAIL  an EXPIRED compact mark does not name the hold (drain has resumed)
FAIL  fans one raw body out in target order with independent results
```

**RED (6)** — and the second name in that list is precisely the family whose fixtures gained `paneId: "%9"`
in the reviewed Phase 1 diff. So the positive direction was never actually lost; it was the *negative*
direction that went dark, and that is now restored.

**Net: the cell is witnessed from both sides.** Tick fields present when they should be (6 tests), absent
when they should not be (1 test). Phase 1 finding 7 is fully discharged, not merely papered over.

---

## Gates I re-ran myself

| Gate | Result |
|---|---|
| `just flow-pair-mutate` mutation 6 | **RED (1) → restore → GREEN** |
| Manual re-run of mutation 6 (for the failure message) | **RED (1)**, named above |
| Opposite-direction mutation | **RED (6)**, named above |
| `npx vitest run .pi/extensions/pij/core/cli.test.ts` | **PASS 463/463** |
| `npm run typecheck` (`tsc --noEmit`) | **PASS**, exit 0 |
| `git status --porcelain -- .pi/` after all mutations | **empty** — byte-identical to HEAD |
| Test-only check | `git show 246f234 --stat` → `cli.test.ts` + one `.md`. **No production source.** |

**The coder's `FX001-pane-less-tick-witness.log.md` is accurate.** Every claim in it reproduced under my
own hands — same RED count, same GREEN restore, 463 passing, empty `git diff` after restoration. I note
that because I said in my Phase 2 report that a coder-reported RED is not evidence; the correct
follow-through is to say so plainly when the independent run agrees.

---

## What I did NOT check

| Not examined | Why |
|---|---|
| The other 462 `cli.test.ts` tests, individually | I ran them (463 pass) but reviewed only the +33-line diff. |
| `copilot` / `codex` pane-less descriptors | See the note below — deliberate, not overlooked. |
| Repo-wide `just lint`, `just smoke`, `harness checks` | Declared pre-existing red; **not re-run**, so the pre-existing claim is accepted, not confirmed. |
| Live behaviour of a real pane-less claude seat | Out of scope; no live seat touched. |

---

## Note (info — no action)

**The witness covers `harness: "claude"` only**, not `copilot` or `codex`, which also pass the harness
leg and can also be pane-less. I am **not** raising this as a gap: `effectiveDeliveryMode` is
harness-agnostic (`descriptor.deliveryMode ?? (paneId ? "push" : "pull")`), so the three harnesses enter
the changed expression identically and `claude` is genuinely representative. The Dim-0 criterion is met
with one harness. Adding the other two would be belt-and-braces, and I would rather the fix stayed at
+33 lines than grew for symmetry.

---

## Closing my own finding

Phase 1 finding 7 said: *"one `cli.test.ts` case, `{harness:"claude", lifecycle:"bound", paneId:undefined,
deliveryMode:undefined, lastTickAt:fresh}`, asserting `queued/pull-inbox` **plus a negative assertion that
tick fields are absent**."* That is, line for line, what landed — with a human-output leg thrown in for
free. It is test-only, it is 33 lines, and mutation 6 now fails.

**`APPROVE`.** Phase 1's verdict can move to `APPROVE_WITH_NOTES` with findings 1–6 carried as notes; of
those, only **finding 5** wants your attention before the AC-07 live proof — the bridge never calls
`recoverStaleClaims`/`resetClaimsOnStart` itself, so with the daemon down the retry leg cannot fire.
(My Phase 4 review turned up an independent corroboration of that: `daemon.ts:1089` gates the sweep on
`instanceof SqliteQueue`, so it also never runs under `PIJ_QUEUE_BACKEND=dual`.)

---

*Reviewed by `pij-pale-araminta` · 2026-08-27T20:12+10:00 · wire discipline C10.*
*Terminal — Dim-0 pass closed at 2 mutations; no pass open against `246f234`.*
