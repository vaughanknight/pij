# Cold RE-review — Phase 4 (7) after A-fix + FX003

> **TERMINAL REPORT.** Everything in this file was established *before* the report
> was sent. **This pass is CLOSED.** A further fix is re-reviewed as a new review,
> against a new sha, in a new file.

**Reviewer**: pij-pale-araminta (cold) · **Date**: 2026-08-27
**Prior verdict**: `reviews/phase-4-review.md` — `FIX_REQUIRED` (A: mis-pathed benchmark citation; B: SKILL.md clause false under fs/dual)
**Fixes under review**: **A** — orchestrator edit to `doctrine-amendment-pointer-relaxation.md` (uncommitted working-tree change) · **B** — FX003 `4dca931` "fix(pij): scope pointer promise to sqlite"

## VERDICT: `FIX_REQUIRED` — one blocking residual

**A is fully closed**, and closed well: the evidence exists, is tracked, and says
exactly what the amendment now claims it says. **The root cause (finding D) is
closed too.** **B is half closed** — `SKILL.md` is correct, but the second surface
my finding named, the `docs/how/pij.md` routing table, still carries the same
false claim.

---

## 1. Scaffolding, and the limits of what I proved

- **No mutations this pass.** Per the packet, Dim-0 already passed 6/6 and the
  routing invariant was not re-run. I verified that carrying it forward is
  legitimate rather than assuming it: `git diff c354d22..HEAD` over
  `core/daemon/loop.ts` and `loop.test.ts` is **empty**, the only commits since
  are `f21269f` (Phase 2 tests) and `4dca931` (SKILL.md + task doc), and
  `git status -- .pi/` is clean. The subject of those 6 mutations is byte-identical,
  so the earlier result stands — but **I did not re-observe it today.**
- **The A-fix is an uncommitted working-tree edit**, not a commit. I reviewed the
  file as it currently sits on disk. If it is amended before landing, my reading
  does not carry.
- **The PD-02 before/after comparison required temporarily restoring the pre-fix
  `SKILL.md`.** I did that with a `cp` backup under a shell `trap`, restored it,
  and confirmed `git status --porcelain -- skills/` is **empty** afterwards. No
  `git checkout`/`stash` was used.
- **Not examined**: `just lint`, `just smoke`, `harness checks` (pre-existing red,
  out of scope); any live seat, daemon, socket or queue — I ran no live transport.
  I did **not** independently re-run the §11/§13 benchmarks; I verified that the
  cited document *contains* those figures, which is what the citation claims, not
  that the figures are themselves correct.

---

## 2. Finding A — **CLOSED** ✅

The amendment's Evidence bullet now reads
`reports/pij-comms-review-2026-08-27.md` §5 … §11 / §13. I checked the file and
each claim rather than taking the packet's word for it.

| Claim in the amendment | Verified |
|---|---|
| file exists **and is tracked** | ✅ `git ls-files --error-unmatch` succeeds |
| §5 = Claude inbox socket, verified live | ✅ `## 5. Findings — the Claude Code inbox socket (verified live)` |
| §11 = PoC | ✅ `## 11. PoC — day-1 slice, built and proven (2026-08-27, Amendment 2)` |
| §13 = day-2 benchmarks | ✅ `## 13. Day-2 — the §11 list worked to dry (2026-08-27, Amendment 3)` |
| §11 C1: **3032 B**, **391 ms**, **0 keystrokes** | ✅ verbatim: `C1 \| claude seat, idle: pij send --body-file 3032 B / 31 lines \| byte-exact user turn; queued → acked in **391 ms**; zero keystrokes` |
| §13 quote: "byte-exact with zero keystrokes (claude socket / copilot RPC)" | ✅ verbatim at §13: `Every 3 KB body arrives **byte-exact with zero keystrokes** (claude socket / copilot RPC)` |

This is the benchmark I reported in the first pass as **unlocatable** — I flagged
it as unverifiable rather than false, and that was the right call: the evidence
was real all along, and only the path was wrong. It is now correct. The old
`reviews/phase-1-review.md` cite survives **only** inside an explicit
`[orchestrator correction: …]` annotation that states the earlier draft was
wrong — that is the right way to retire a bad citation, and I would not remove it.

### Root cause (finding D) — **CLOSED** ✅

I flagged that the bare `"review §5/§11–13"` shorthand, carrying no path, is what
induced the mis-citation in the first place. Both upstream sources now carry the
full path *and* the lesson, which is stronger than just fixing the instance:

- plan `day3-codex-doctrine-plan.md:234` — "…`reports/pij-comms-review-2026-08-27.md` §5/§11/§13 benchmarks — **cite the FULL PATH, not bare "review §N"**"
- dossier `tasks/phase-4-pointer-doctrine/tasks.md:57` — same instruction, verbatim

### Note A-1 (non-blocking) — the path is root-relative, and there is a same-named decoy

`reports/…` resolves **from the repo root**. But the amendment lives in
`docs/plans/392-day3-codex-doctrine/`, which has **its own `reports/` directory**
containing sibling files (`phase-4-report.md`, `fx003-coder-report.json`, …). A
reader resolving the path relative to the document lands in a real directory and
finds the file **absent** — which is precisely the failure mode finding A was
about. I spent a search on exactly this before locating the file at the root.

It is not blocking because the document is internally consistent: every other path
it cites (`government/doctrine/…`, `skills/pij/references/…`,
`.pi/extensions/pij/core/daemon/loop.test.ts`) is root-relative too. A one-word
fix ("repo-root `reports/…`") would remove the trap for good.

---

## 3. Finding B — **half closed**

### 3.1 `skills/pij/SKILL.md` — **CLOSED** ✅

```diff
-… a socketless seat receives a path pointer, never a body (pty clip).
+… receives the body inline byte-exact; under the sqlite default, a socketless
+seat receives a path pointer instead of a typed body. Keep sends short under
+every backend (C10).
```

I checked each clause of the new sentence for a backend under which it is false:

| Clause | fs | dual | sqlite |
|---|---|---|---|
| persist packets/large bodies to disk first | true | true | true |
| socket/RPC seat receives the body inline byte-exact | true — the socket branch is gated on harness + endpoint, **not** on the queue backend | true | true |
| "**under the sqlite default**, a socketless seat receives a path pointer" | *makes no claim* | *makes no claim* | true |
| keep sends short under every backend | advice, backend-independent | ✓ | ✓ |

Nothing is false under any backend. The clause went from asserting a conditional
as a global invariant to being explicitly scoped, which is exactly the remedy
finding B asked for. `SKILL.md` is **85 lines** (budget 150) ✅.

### 3.2 `docs/how/pij.md` routing table — **STILL OPEN** ❌ (blocking)

My finding B named **two** surfaces: "a backend qualifier on the SKILL.md clause
**and the `pij.md` routing table**." Only the first was fixed. `docs/how/pij.md`
was not touched by FX003 (`git show 4dca931 --stat` = `SKILL.md` + one task doc)
nor by the A-fix, and it still reads:

| Recipient | Transport | What crosses the live channel |
|---|---|---|
| Codex today | Socketless pointer path | One `pij inbox` pointer line; body stays durable |
| Legacy or otherwise socketless tmux seat | Pointer path | One `pij inbox` pointer line; body stays durable |

Under the heading *"What crosses the live channel"*, unqualified. But the pointer
path is gated at `daemon.ts:1138` by `{ pointer: sq !== undefined }`, where `sq`
(`:1089`) is sqlite-only. So under `PIJ_QUEUE_BACKEND=fs` or `dual` what actually
crosses the live channel for those two rows is the **full body typed into the
pty** (`loop.ts:655+`) — the very clip risk the row denies. This is the same
false statement, in the same words, that was blocking in `SKILL.md`.

**Why the finding-C ticket does not cover this.** The ticket
(`reports/finding-C-daemon-instanceof-ticket.md`) proposes `sq = sqliteOf(this.channel)`
at `:1089`, and correctly notes "FX003 fixes the DOC to match today's code — this
ticket fixes the CODE." That closes **dual**. It does **not** close **fs**:
`sqliteOf` (`channel-factory.ts:102-106`) returns `channel` for a `SqliteQueue`,
`channel.sqlite` for a `DualWriteChannel`, and **`undefined` otherwise** — so an
`FsChannel` still yields `pointer: false` and still types the body. `fs` is a
documented, reachable opt-out (`pij.md:266`). **The `pij.md` row therefore needs
the doc qualifier on its own merits, whether or not the code ticket ever lands.**

**Fix**: mirror the SKILL.md wording — scope the two socketless rows to the sqlite
default (e.g. a "Under the default `sqlite` backend" note under the table, and a
line for the `fs`/`dual` behaviour). One clause; no code change. The section
already discusses backends elsewhere (`pij.md:263-267`), so the vocabulary exists.

---

## 4. PD-02 — `just pij-skill-check` before/after ✅ (and the check itself is pre-existing red)

The check **fails** (exit 1, 10 ✗ / 184 ✓). It is **not** caused by this fix, and I
proved that rather than asserting it — I restored the pre-FX003 `SKILL.md`, re-ran,
and diffed:

```
diff before.txt after.txt   →  IDENTICAL
✗ count:  before 10   after 10
```

That matches, exactly, the documented baseline in
`item-9-skill-check-debt-scoping.md`: *"Baseline on origin/main 5445c85c (skills/
untouched by this stream): 10 ✗ / 184 ✓"*, with the ten failures being line-budget
overruns in `routes/peer.md`, `routes/node.md`, `prime/orchestrator.md` and missing
real-tree marker strings — none in `SKILL.md`, which the same note records as
`85/150`. It is scoped as "Item 9", fenced to `skills/pij/**`, deferred to its own
cold-reviewed PR.

**So PD-02 is satisfied in the sense that matters** (the fix changes nothing), but
I want to state the sharp edge plainly: the gate's *pass/fail* signal is unusable
here, and the only reason this is safe is that the before/after outputs are
byte-identical. A reviewer who ran it once and read "❌ failed" would draw the
wrong conclusion in either direction.

---

## 5. Gates

| Gate | Result |
|---|---|
| Cited evidence file tracked + §5/§11/§13 present with claimed figures | **PASS** (§2) |
| `just pij-skill-check` before vs after | **IDENTICAL**, 10 ✗ both sides — pre-existing Item-9 debt |
| `SKILL.md` ≤ 150 lines | **PASS** — 85 |
| Dim-0 routing invariant | **carried forward 6/6**; subject unchanged (`git diff c354d22..HEAD` on `loop.ts`/`loop.test.ts` empty). Not re-run. |
| `git status --porcelain -- .pi/ docs/how/ skills/` | **empty** after all work |
| lint / smoke / `harness checks` | **not run** — pre-existing red, out of scope |

---

## 6. Why `FIX_REQUIRED`

A is closed, and closed at the root as well as the instance — the plan and dossier
now forbid the bare `"review §N"` shorthand that caused it, which is the durable
fix and better than what I asked for. The SKILL.md half of B is closed correctly:
the clause is scoped, and I could not find a backend under which any part of the
new sentence is false.

What holds the verdict is narrow and concrete: **the second surface named in
finding B is unchanged**, still asserts "one `pij inbox` pointer line" as what
crosses the live channel for socketless seats, and is false under `fs` and `dual`.
I am not raising a new finding — this is the unfixed half of the original one, and
I would rather say so than let a partially-applied fix close a finding that named
two places. The remedy is one clause in `docs/how/pij.md`, and it is needed
independently of the finding-C code ticket, which resolves `dual` but not `fs`.

Note A-1 (root-relative path with a same-named decoy directory) is **not**
blocking and I would not hold a merge for it.

**Verdict: `FIX_REQUIRED`.**
