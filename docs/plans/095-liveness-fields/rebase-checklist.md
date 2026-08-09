# s095 rebase checklist — run this, do not remember it

**Why this file exists**: the moment you are most likely to skip these checks is the moment you
have least context about why they exist — which is exactly when they fire. Written at 17:05 with
full context; executed later with none. Every line below cost someone a measured near-miss today.

Run **after** `git rebase origin/main` resolves, **before** `git push`.

---

## 0. Precondition — has #203 actually landed?

```bash
git show origin/main:docs/how/fleet/ledger/s092-install-blocker.md >/dev/null 2>&1 && echo LANDED || echo HOLD
git show origin/main:docs/how/fleet/ledger/s097-silent-detectors.md >/dev/null 2>&1 && echo "control HIT"
```

- `s092-…` is **exclusive to #203** — that is the only reason it is a sound probe.
- **Do not** test for the directory, the index table, or your own file. All three were created by
  s097's PR and return a **false yes** on a main where #203 has not landed. The class is closed:
  directory, index table, s097's file. There is no fourth.
- The **control** must hit. A probe that cannot reach the tree returns the same "absent" as a
  real absence.

## 1. The index section — assert IDENTITY, not count

**The count is ambiguous for this stream and the standard three-value table is wrong for us.**
We authored `## Per-stream ledgers` (ledger.md:1021); main carries `## Per-stream ledger blocks`.
Both match `^## Per-stream`, so our sequence is **1 → 2 → 1** and the *not-yet* value equals the
*pass* value. Count alone cannot tell "I have not rebased" from "I resolved correctly".

```bash
grep -c '^## Per-stream' docs/how/fleet/ledger.md            # MUST be exactly 1
grep -c '^## Per-stream ledger blocks' docs/how/fleet/ledger.md   # MUST be exactly 1  (main's wording survives)
grep -c '^## Per-stream ledgers$' docs/how/fleet/ledger.md   # MUST be exactly 0  (ours is gone)
```

Assert **exactly** these values. Never `< 2`, never `!= 2` — `0` is both the renamed-heading
value and the broken-pattern value.

**Delete our section wholesale, whether or not git raised a conflict.** Git may merge two
differently-worded headings **cleanly**, so the instruction's trigger may never fire and we would
ship two index sections having followed it exactly.

## 2. The relocation — both directions, with a control

A duplicated row is **present in both places**, so every presence-check says yes. Only the
absence half sees it.

```bash
grep -o '^### [FWS]-40[0-9]' docs/how/fleet/ledger/s095-liveness-fields.md | sort > /tmp/s095-rows-after.txt
diff /tmp/s095-rows-before.txt /tmp/s095-rows-after.txt && echo "SET IDENTICAL"   # not a count — the SET
grep -c '^### [FWS]-4' docs/how/fleet/ledger.md    # MUST be 0 — our rows are GONE from the body
grep -c '^### [FWS]-'  docs/how/fleet/ledger.md    # control: must be LARGE (~86). A 0 here means the grep is broken.
```

Compare the **set**, not the count: a lost row and a duplicated row **cancel** in a total.
17-before and 17-after is consistent with losing F-403 and duplicating W-401.

## 3. Our cell in the nine-ordinal table

Flip **our own** row, `s095`, from `pending` to `moved` and link
`ledger/s095-liveness-fields.md`. One cell, at our own ordinal's line.

- **Do not insert a row** — every ordinal is already listed. There is no position to choose, so
  insert-position errors are unrepresentable rather than guarded.
- **Do not touch any other stream's row.**
- Forgetting this flip is a **false negative**: "are there pending rows" then answers *not
  landed* forever, and everyone waiting sees a definite answer with no reason to doubt it. The
  prime re-checks this at close-out — we flip, they check, neither relies on the other
  remembering.

## 4. The code half still has to be true

```bash
grep -n 'processSnapshot' .pi/extensions/pij/daemon.ts      # the wiring must still be at the call site
harness checks --quick                                       # all seven sensors, on the MERGED tree
```

A rebase can leave a guard **present but no longer load-bearing** — mutant M3 proved AC-18b
(whole-file grep) stays green on an orphaned capture while AC-18a (call-site slice) goes red.
Presence is not wiring.

## 5. Reporting

CI green on a head that predates the current base is a **stale green**, not merge-ready. Re-run
after the rebase and report **that** result. Tell the prime immediately rather than batching.
