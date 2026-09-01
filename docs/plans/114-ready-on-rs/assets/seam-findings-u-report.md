# Seam findings — u-report (plan 114 wave 2), BEFORE building

From `pij-fine-unaha` to PM `pij-printed-peafowl`. Every line below was read on
tree in `/Users/jordanknight/pi-hacking/pij-worktrees/s114-u-report`, not
recalled. Ordered by cost-of-late. F1 and F2 need your ruling; F3–F5 I can
proceed on under a stated default, and I say which.

---

## F1 — BLOCKING. Follow-the-seat is DECLARED, TESTED, AND UNREACHABLE in the shipped binary

`cli.ts:4615` — `await routeVerb(verb, leaf, process.argv.slice(2))`. No fourth
argument, so deps default to `defaultRouterDeps()`
(`adapters/generation-router.ts:48`), which returns exactly
`{ fetch, readFile, env, home }` — **no `ambientSeatId`, no `seatInLegacy`, no
`seatInRs`**. `routeVerb` therefore computes `seatId === undefined`
(`generation-router.ts:152`), and `decidePreCall`'s follow-the-seat guard
(`generation-routing.ts:324`) requires `seatId !== undefined && seatInRs ===
false && seatInLegacy === true`. It can never fire. Its only exercise is
`adapters/generation-router.test.ts:233`, where the test supplies the three deps
by hand.

So ac-1143's THIRD outcome — `legacy-seat-followed`, oq-1141's ruling — is not
reachable by anything an operator can type. That is not a wave-1 defect at wave-1
altitude: with no rs handlers, every routed verb 404s on an ABSENT axum route
(empty body) and lands on `legacy-rs-not-implemented`, which is the correct
answer for every seat by accident. The guard being dead costs nothing while rs
implements nothing.

**It stops being free the moment my handler exists.** `/v1/report` will then
match, and every seat on this machine — the fleet is overwhelmingly
legacy-resident — POSTs its `report now` to rs. rs does not know those seats.
Whatever I answer is one of two bad things:

- envelope-carrying refusal (any status) → `classifyRsResponse` returns
  `rs-error` → `E-RS:` on stderr, `exitCode = 4`, legacy never runs. **Every
  legacy seat's `pij report now` breaks the day I merge.**
- empty-bodied 404 from inside my own handler → falls back to legacy and works,
  but it spells "rs has no such route" for a fact that is "rs has no such SEAT".
  That is the F-1128 family the plan already cites, and it is the discriminator
  wave 1 spent its receipt establishing.

I will not pick between those on my own authority — the second one launders a
seat fact into a route fact, and the first one is a fleet-wide break.

**Ask (recommended):** wire the three deps at `cli.ts:4615`. The mechanism is
already built and tested; only the call site is missing. That is a wave-1 file
(`.pi/extensions/pij/**`), which my packet forbids me to touch, so it is yours or
u-route's, not mine.
**If you rule otherwise**, tell me which answer an unknown-to-rs seat gets and I
will implement it named and tested. What I will not do is leave it implicit.

## F2 — BLOCKING. One route row covers six sub-verbs, and there is no leaf-level hold

`RS_ROUTE_TABLE` (`core/generation-routing.ts:79`) carries `{ verb: "report",
rsPath: "/v1/report", method: "POST" }` — whole-verb, no `leaf`. `findRoute`
falls through to the whole-verb row for any leaf, and the deny list is matched
`deny.find((entry) => entry.verb === verb)` — **verb-level only, no leaf**. So
there is no way to route `report now` and hold `report verify` back.

That matters because **rs has no assignment model at all**. TS `report verify
<node>` stamps `verifiedBy` on an assignment record; `--assignment <id>`,
`--refs a,b` and `--project <slug>` all address assignment/project objects that
do not exist anywhere in `crates/`. `crates/core/src/report.rs` is registry +
spine and nothing else. These are not shapes I can honour with more effort; there
is no object to honour them against.

Once `/v1/report` exists, every one of those reaches me and cannot fall back
(see F1's first bullet — an envelope answer is always `rs-error`).

**Ask (recommended):** replace the single `report` row with FIVE leaf rows —
`now`, `state`, `blocked`, `clear`, `question` — leaving `verify` with no row, so
it resolves `legacy-unrouted`. That is five `{verb, leaf, rsPath, method, why}`
objects and **no dispatch change**; `findRoute` already prefers leaf rows
(`generation-routing.ts:118-124`). It is also the deliberate act that ac-1145's
whole settlement rests on, applied one level down.
**Alternative** (say the word and I build it): keep the one row and I refuse
`verify` by name, accepting that `pij report verify` stops working for any seat
rs is willing to answer for.

## F3 — The semantic-state vocabulary DIVERGES between the generations, and TS says its list is ruled

- TS `SEMANTIC_STATES` (`core/types.ts:110-119`), commented "HUMAN-RULED
  vocabulary, byte-exact: never extend, rename, or reorder" — eight words:
  `blocked, question, hold, waiting, ready, failed, cancelled, done`.
- rs `SemanticState` (`crates/core/src/model.rs:104-117`) — six:
  `Ready, Waiting, Hold, Blocked, Question, Done`.

**`failed` and `cancelled` exist in TS and do not exist in rs.** `pij report
state failed` and `pij report now … --state cancelled` are accepted by the
parser callers use today (`core/cli.ts:1712`, `:1646`) and have no rs
counterpart.

My default, unless you rule otherwise: **refuse those two by name** — an explicit
"rs has no semantic state 'failed'; the rs vocabulary is
ready|waiting|hold|blocked|question|done" — and NOT map them onto a near-fit
(`failed`→`done` and `cancelled`→`done` are both available and both lies, and a
near-fit that type-checks is the worst outcome available here).

I am flagging rather than fixing because adding two variants to
`SemanticState` also touches `nudgeable()`, whose decision table is itself a
ruling with a regression test behind it (`model.rs:119-141`), and because this
divergence will bite every verb that carries a state, not only mine. If you want
the vocabularies reconciled, that is its own row with its own migration test.

## F4 — Card-field rules: TS and rs core deliberately DISAGREE, and I am choosing the boundary

| rule | TS (what callers hit today) | rs core |
|---|---|---|
| did/next max length | 280 after collapsing (`core/cli.ts:815, :824`) | `CARD_LIMIT = 280` (`model.rs:293`) — **match** |
| empty did/next | `E-ARG` "report did must not be empty" (`core/cli.ts:822`) | **explicitly permitted** — `report.rs` documents "Empty is deliberately valid: a present empty card and no card are different facts" |
| embedded newline | `E-ARG` "report did must be one line" (`core/cli.ts:819`) | silently collapsed to a space by `collapse_whitespace` |
| blocked/question note | 280? no — **200** (`REPORT_NOTE_MAX_LENGTH`, `core/cli.ts:816, :841`) | **no limit at all** — `blocked()`/`question()` call `collapse_whitespace` and nothing else |

Your packet named the 280 limit from live experience and it is right — and it is
the one row of four that already agrees. The other three do not.

My default: enforce the **TS** rules at the rs CLI/handler boundary, and leave
`crates/core` alone. That keeps caller-facing shape parity (which is what
ac-1144 actually claims) without overruling a documented deliberate choice inside
core, and it keeps one implementation of the length rule — core's `CARD_LIMIT`
constant is what my boundary check will cite for 280, not a copied number.
The 200-char note limit has no core constant to cite; I will add one beside
`CARD_LIMIT` rather than inline a literal, unless you would rather I did not
touch core at all — say so and I will hold it in the boundary with a comment
pointing at `core/cli.ts:816`.

## F5 — Not mine to fix, and you should see it: the shim prints raw JSON for EVERY rs-served call

`cli.ts:4617-4620`:

```
if (outcome.kind === "rs") {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
}
```

Unconditional — there is no `--json` check on that path. So on the day `report`
routes to rs, a human typing `pij report now "a" "b"` stops getting

    reported by pij-fine-unaha: "a" → "b" (spine 127864)

and starts getting a JSON blob. Arguments are only half of "the SAME shapes
callers already type today"; the answer is the other half, and this is the
single most-typed missing verb.

I can make the payload carry everything a human line needs, and I will. I cannot
make the shim render it — that is `.pi/extensions/pij/**`, wave-1 owned and out
of bounds for me. Raising it so it is a decision rather than a surprise.

---

## Checked and CONFIRMED SOUND — so you know what I did not have to fight

- **`crates/core`'s report semantics are real and genuinely unwired.**
  `ReportService`, `CardRecord`, `StateRecord`, `CardStatus`, `ReportConfig`
  (`stale_after_ms` = 10 min) all exist and are tested — and grep for
  `ReportService` across `crates/` returns **only** `crates/core/tests/report.rs`.
  Zero production consumers. "Consume core, do not re-implement" is available,
  not aspirational, and my unit is its first wiring. Including the staleness
  threshold, per your packet.
- **The zero-shim-edit claim holds.** The `report` row already exists in the
  table with `rsPath: "/v1/report"`, and the not-implemented discriminator is
  "404 with a body no rs handler would have written". Landing the axum route
  flips it live with no edit under `.pi/extensions/pij/**`. (F2 is a question
  about WHICH rows, not about whether the mechanism works.)
- **Your 401-masks-route-absence warning is exactly right and I will test around
  it.** `require_bearer` layers the whole router
  (`crates/daemon/src/http/mod.rs:214-218`), so an unauthenticated probe of
  `/v1/report` answers 401 identically before and after my handler exists. Any
  "the route is missing" conclusion drawn from a keyless probe would be
  worthless. My red witness reads the daemon's own bearer key.
