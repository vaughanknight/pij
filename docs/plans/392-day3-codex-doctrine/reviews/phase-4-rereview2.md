# Cold RE-review #2 — Phase 4 finding-B residual (`docs/how/pij.md`)

> **TERMINAL REPORT.** Everything here was established before the report was sent.
> **This pass is CLOSED.** A further fix is re-reviewed as a new review, against a
> new sha, in a new file.

**Reviewer**: pij-pale-araminta (cold) · **Date**: 2026-08-27
**Prior verdict**: `reviews/phase-4-rereview.md` — `FIX_REQUIRED`, one residual
**Fix under review**: `a6d94f440e18d6c84166faee178d7bf048f4b274` "docs(pij): qualify pointer routing to the sqlite backend (Phase 4 finding B residual)"

## VERDICT: `APPROVE`

The residual is closed, and the non-blocking note A-1 is closed too. With A, D and
the `SKILL.md` half of B already closed in the prior pass, **nothing from my Phase 4
review remains open.**

---

## 1. Scaffolding, and the limits of what I proved

- **No mutations this pass, by instruction and by merit.** The packet says not to
  re-run Dim-0, and the change is doc-only, so there is nothing executable to
  mutate. The Phase 4 routing invariant remains **6/6 RED from the original pass**;
  I did not re-observe it today. Its subject is untouched — `a6d94f4` contains no
  `.pi/**` path at all (§4).
- **This is a prose review.** My method was to take each sentence in the changed
  section and ask whether it is false under `sqlite`, `fs`, or `dual` — the same
  three-column check I applied to `SKILL.md` in the prior pass. That is a reading,
  not an execution. I did not run a seat under `fs` or `dual` to observe the
  behaviour; the backend gating is read from `daemon.ts:1089/1138`,
  `channel-factory.ts:102-106` and `loop.ts:655+`, as in the prior two passes.
- **Not examined**: `just lint`, `just smoke`, `harness checks`, `pij-skill-check`
  (the last is known Item-9 debt, and `skills/**` is untouched by this commit); any
  live seat, daemon, socket or queue.
- Working tree after my work: only `roster.md` (orchestrator's, pre-existing) and
  the untracked packet. I wrote nothing outside this verdict file.

---

## 2. Establish 1 — the routing table is now backend-honest ✅

```diff
-| Codex today | Socketless pointer path | One `pij inbox` pointer line; … |
-| Legacy or otherwise socketless tmux seat | Pointer path | One `pij inbox` pointer line; … |
+| Codex today | Socketless pointer path* | *Sqlite default:* one `pij inbox` pointer line; … |
+| Legacy or otherwise socketless tmux seat | Pointer path* | *Sqlite default:* one `pij inbox` pointer line; … |
+
+*\* The pointer path runs under the `sqlite` default backend only (`daemon.ts` gates it on the
+sqlite queue). Under `PIJ_QUEUE_BACKEND=fs` or `dual` the pointer path is off and the body is
+typed into the pane — the pre-pointer behavior; the socket/RPC rows above are unaffected (they
+never depend on the backend).*
```

I checked **every** statement in the section, not just the two rows I complained
about, because a qualifier can fix one line and leave a neighbour false:

| Statement | fs | dual | sqlite |
|---|---|---|---|
| Claude+socket → full body, zero keystrokes | ✅ | ✅ | ✅ — socket branch is gated on harness + endpoint, never on the backend |
| Copilot+`rpcPort` → full body | ✅ | ✅ | ✅ — same |
| Codex / socketless → "***Sqlite default:*** one pointer line" | *no claim* | *no claim* | ✅ |
| **Pi → in-process receiver → full body** | ✅ | ✅ | ✅ — checked deliberately: the sqlite path injects via `startQueueConsumer` and the fs path via the watcher, but **both** deliver the full body, so this row needed no qualifier |
| footnote: pointer path is sqlite-only, `daemon.ts` gates it | ✅ | ✅ | ✅ |
| footnote: under fs/dual the pointer path is off, body typed | ✅ | ✅ | ✅ |
| footnote: socket/RPC rows unaffected, never depend on the backend | ✅ | ✅ | ✅ |
| safeguard: composer-idle guard still consulted before typing | ✅ | ✅ | ✅ — this is what mutation P4 turned RED in the original pass |
| executable-contract pointer to the `loop.test.ts` describe | ✅ | ✅ | ✅ — those four test names verified in the original pass |

**Nothing in the section is false under any of the three backends.** The footnote
is also better than the qualifier I asked for: it states the gate (`daemon.ts`),
the consequence under fs/dual (body typed), *and* explicitly protects the
socket/RPC rows from being swept up in the qualification — which is the mistake a
careless fix would have made, since those rows genuinely are backend-independent.

The `Pi` row deserves a word because it is the one I had to think about rather
than read: Phase 2 changed the pi receiver's *transport* (`FsChannel` → sqlite
`startQueueConsumer`), so "Full body" could plausibly have become backend-specific.
It did not — both branches inject the whole body — so leaving that row unqualified
is correct, not an oversight.

## 3. Establish 2 — note A-1 closed ✅

The amendment's evidence bullet now reads:

> `reports/pij-comms-review-2026-08-27.md` **(repo-root-relative — NOT this plan folder's `reports/`)** §5 …

That closes the trap, and closes it better than my suggestion: I proposed marking
the path root-relative; this additionally **names the decoy directory** that a
reader would otherwise land in. The `[orchestrator correction: …]` annotation
retiring the old `phase-1-review.md` cite is preserved.

## 4. Establish 3 — doc-only ✅

```
git show a6d94f4 --numstat  →  29 files, every path under docs/
grep -E "\.pi/|\.test\.|\.ts "  →  no match
```

No production source, no test, no `skills/**`. The commit also folds in a batch of
previously-untracked plan artefacts (my own review files among them); that is
housekeeping and does not affect the fix.

---

## 5. Note (non-blocking, forward-looking) — the footnote will expire when finding C lands

Recorded because it will rot silently otherwise, and the ticket is the only place
it can be caught.

The new footnote asserts a **positive** fact about `dual`: *"Under
`PIJ_QUEUE_BACKEND=fs` or `dual` the pointer path is off."* That is true today.
But `reports/finding-C-daemon-instanceof-ticket.md` proposes replacing
`daemon.ts:1089` with `sq = sqliteOf(this.channel)` — and `sqliteOf`
(`channel-factory.ts:102-106`) returns `channel.sqlite` for a `DualWriteChannel`.
**The moment that ticket lands, `dual` gets the pointer path and this footnote
becomes false for `dual`.**

Note the asymmetry, which is why only this one file is exposed:

- `SKILL.md` invariant 2 says "*under the sqlite default*, a socketless seat
  receives a path pointer" — it makes **no claim** about `dual`, so it stays true
  after the ticket. ✅
- The `pij.md` footnote makes a claim about `dual`, so it does not. ❌ (future)

The ticket currently notes only that "FX003 fixes the DOC to match today's code —
this ticket fixes the CODE"; it does not carry an obligation to update the doc when
the code changes. **Suggested**: add one line to the ticket's Fix section — *"also
update the `docs/how/pij.md` pointer-routing footnote, which currently states the
pointer path is off under `dual`."* No change needed to `a6d94f4`.

---

## 6. Gates

| Gate | Result |
|---|---|
| Every statement in the changed section true under fs / dual / sqlite | **PASS** (§2) |
| A-1 path trap removed | **PASS** (§3) |
| Doc-only, no `.pi/**`, no test | **PASS** (§4) |
| Dim-0 routing invariant | **6/6 carried forward**; no `.pi/**` in this commit. Not re-run. |
| lint / smoke / `harness checks` / `pij-skill-check` | **not run** — pre-existing red / `skills/**` untouched |

---

## 7. Why `APPROVE`

The residual was that a human-facing routing table promised a pointer line where
the code types a body, under two reachable backends. It is now scoped, the scope is
accurate, and the fix draws the line in the right place — qualifying the two rows
that depend on the backend while explicitly protecting the two that do not. I
checked the neighbouring rows and safeguards as well, since a partial qualifier was
the exact failure mode of the previous fix, and found none false.

Finding B is now closed across **both** surfaces it named. Together with A and D in
the prior pass, **Phase 4 has nothing outstanding from my reviews.**

§5 is a note about a *future* commit and does not qualify this one.

**Verdict: `APPROVE`.**
