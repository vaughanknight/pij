# FIX packet — item 1, round 1

**Verdict: FIX_REQUIRED** from `pij-managing-prawn` (independent review).
Full review: `/Users/jordanknight/.copilot/session-state/741e2a92-a70e-45be-9d14-7daf7f5ff1f5/files/s073-item1-independent-review.txt`

**NARROWED SCOPE — these three findings ONLY.** Do not refactor anything else, do not improve
anything you notice in passing, do not touch `core/cli.ts` beyond what F2 and F3 require. Any
change outside these three needs to come back to me first.

I verified all three myself before writing this. They are real.

---

## F1 (HIGH) — `peer.md` blows its enforced line budget

`skills/pij/references/routes/peer.md` is **154 lines**; the enforced maximum is **150** and main
is at **exactly 150**. `just pij-skill-check` fails on it. Branch-caused; not either inherited
Biome blocker.

**Fix**: get it to ≤150 by **condensing the plan-id guidance you added**, not by deleting
unrelated content to make room. Main was already at the ceiling, which means that file has no
headroom by design — say the new thing in fewer lines rather than evicting someone else's.

Verify with `just pij-skill-check`.

---

## F2 (MEDIUM→ treat as the important one) — empty plan id accepted, and the root cause is wider

`pij spawn --plan-id=` and `pij attest <id> --plan-id=` both parse to `planId: ""`, persist it, and
project it. `""` is *present*, so it defeats the ruled contract that **absent = unattested**.

**And it validates silently.** `buildPlanIdWarning` (`core/spawn.ts:1076-1085`) does
`resolve(cwd, "docs", "plans", planId)` then `isDirectory(...)`. With `planId = ""` that resolves
to `docs/plans` itself — which exists — so it returns `null` and **no warning is emitted**.

**The root cause is broader than empty, and I want it fixed at the root, not patched at `""`.**
Dove ruled `planId` is an **opaque identifier**, but the validation probe treats it as a **path
segment**. So any id that is not a plain segment can accidentally resolve:

| `--plan-id` | resolves to | validation says |
|---|---|---|
| `""` | `docs/plans` | resolves ✓ (wrong) |
| `.` | `docs/plans` | resolves ✓ (wrong) |
| `..` | `docs` | resolves ✓ (wrong) |
| `../../some/real/dir` | anywhere on disk | resolves ✓ (wrong) |

Fix all of it:

1. **Reject empty/whitespace-only at parse time**, on **both** `spawn` and `attest`. An empty
   string is not an identifier — this is `E-ARG`, not a warning. (This is the one place a
   hard-fail is correct: dove's never-hard-fail ruling is about *unresolvable* plan ids in repos
   without the convention, not about syntactically invalid input.)
2. **Make the resolution probe refuse to treat a non-segment id as a path.** An id containing a
   path separator or resolving outside `docs/plans` must produce the **warn-and-proceed** message,
   never a false "resolves". Keep the id itself opaque — you are constraining the *probe*, not the
   value. `../../opaque/value` stays a legal plan id; it just must not silently claim to resolve.
3. **Fix the over-claiming test name.** `core/cli.test.ts:1996` is called
   *"parses one explicit opaque plan id and **rejects an empty attestation**"* but only asserts
   that a **missing** value is rejected (`attest pij-node`, and `--plan-id` with no argument). It
   never tests `--plan-id=`. Either rename it to what it proves or extend it to prove its name —
   **and it must be the latter**, because we need the behaviour.

**Read this next part.** This is why the defect survived 22 injection proofs: injection proves a
guard is load-bearing **for the assertion it actually makes**, not for the claim in its name. Every
proof you ran was valid. A test whose name over-claims is invisible to the method — it will flip
red exactly as designed, for the narrower thing it really checks. So: **when you name a test,
the name is a claim, and it must be as true as the assertion.**

---

## F3 (MEDIUM) — `attest` is hard-wired to `planId`, contradicting its brief

`core/cli.ts:241-245` types the command with `readonly planId: string` — required — and parsing
(`:811-817`), execution and output (`:2142-2160`) are all planId-specific. Adding `--designation`
would need changes to the type, the required-flag validation, execution, and the output shape.

The brief required the opposite, and it was dove's explicit one-verb ruling: **`--designation`
must be a pure addition — one flag row, one field write — never a refactor.**

**Fix**: reshape `attest` so attested fields are **optional and additive**:
- `planId?: string`, so a second optional field slots in beside it
- `E-ARG` when **no** attested field is supplied (`attest <id>` alone stays an error — that
  behaviour is right, only its implementation is wrong)
- execution writes whichever fields were supplied; output reports whichever changed
- **do not add `--designation`** — item 2 owns it and Jordan owns sequencing. Just make it a
  one-line addition when it comes.

---

## Method — unchanged

Per file, in isolation. **Run that file alone → baseline green → inject → confirm EXACTLY ONE test
flips → restore → green.** Never against the full suite. If an injection flips more than one test,
stop and tell me before restoring.

New guards here need the same treatment as the originals — a guard whose injection you did not run
does not count as a guard. In particular, prove the empty-id rejection by removing the check and
confirming exactly the new test goes red.

## Unchanged constraints

- Commit to `s073/pij-first-class-ui` as you go. Verify HEAD before every commit.
- Do not merge, do not restart the daemon, do not touch canonical `~/pi-hacking/pij`.
- Ignore the inherited Biome blockers — dove fixed them on main at `3f881cb`; we sync at merge.
- Report to `pij-exclusive-whitefish`.
