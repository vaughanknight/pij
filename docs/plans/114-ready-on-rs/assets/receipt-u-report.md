# Receipt — u-report (plan 114 wave 2)

Coder `pij-fine-unaha`, branch `s114/u-report`, commit `253826e7`
(plus `<seam findings>` commit, docs only). I never merged and never touched
`/Users/jordanknight/pi-hacking/pij`.

## Genuine red, then green — chronological, not reconstructed

The witness is `crates/daemon/tests/report_http.rs`, written and run BEFORE
`crates/daemon/src/http/report.rs` existed. It compiled and ran against the
shipped surface; the failures were behavioural 404s from an absent axum route,
not a compile error.

```
RED  (handler absent)   test result: FAILED. 1 passed; 17 failed
GREEN (handler present) test result: ok.     20 passed; 0 failed
```

The one test that PASSED red is
`a_keyless_probe_is_401_and_therefore_proves_nothing_about_the_route`, and it
passed for the right reason: `require_bearer` layers the whole router
(`http/mod.rs:214`), so a keyless probe answers 401 identically before and after
the handler exists. It is in the suite precisely to pin that a 401 settles
nothing about route presence — the trap the packet warned about. Two tests were
added after green (forwarded caller context, and the receipt's human line); they
are the only two in the file that never ran red, and I am naming them rather than
letting the count imply otherwise.

## Gate — read BARE, redirected, no pipe

```
cargo run -p pij-testkit --bin pij-gate > /tmp/u-report-gate.txt 2>&1
echo "BARE_GATE_EXIT=$?"
```

```
pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  lock      PASS  Cargo.lock matches the manifests, and the tree
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  9 crates, 0 violations
pij-gate: all stages green
BARE_GATE_EXIT=0
```

Three real stops on the way, all mine and all fixed: a `clap_exposes_every_ruled_verb`
roster assertion (adding a verb is meant to fail a test first — it did, and I
updated the roster deliberately rather than treating it as noise), a
`clippy::assertions_on_constants`, and a `clippy::type_complexity` that was fair
comment — the tuple-of-tuples became a named `Arguments`/`Flag` pair.

No TS suite run: this unit's diff is eight files, all under `crates/`. Zero files
under `skills/`, `.claude/` or `.pi/extensions/pij/**` (`git diff --name-only`
filtered — 0). ac-1146 arm A holds for my branch.

## Shape parity — every row derived from the TS SOURCE, with its line

`.pi/extensions/pij/core/cli.ts` unless noted.

| shape | TS source | rs |
|---|---|---|
| `report now "<did>" "<next>"` | `:1631` | honoured |
| `--state <word>` on `now`, written before the card, one caller-visible act | `:1645`, `:1665` | honoured for the six shared words |
| `--note <text>`, only with `--state question\|blocked` | `:1653` | honoured |
| `report state <state>` | `:1708` | honoured for the six shared words |
| `report blocked\|question "<text>"` | `:1689` | honoured |
| `report clear` | `:1746` | honoured |
| `--json` on every leaf | `ALLOWED_FLAGS`, `:887-892` | accepted, no-op (every rs answer is an envelope) |
| positional arity per leaf | `MAX_POS`, `:932-937` | honoured |
| unknown flag is `E-ARG`, not ignored | `ALLOWED_FLAGS`, `:887` | honoured |
| did/next ≤ 280 after collapsing | `:815`, `:824` | honoured — cites `CARD_LIMIT` (`crates/core/src/model.rs:293`), never a copied 280 |
| whitespace collapsed before the limit | `:821` | honoured |
| did/next must be one line | `:819` | honoured — **boundary-only**, see below |
| did/next must not be empty | `:822` | honoured — **boundary-only**, see below |
| note ≤ 200 after collapsing | `REPORT_NOTE_MAX_LENGTH`, `:816`, `:841` | honoured — new named `NOTE_LIMIT` |

### Refused BY NAME, never by near-fit

| shape | why rs cannot honour it | what a near-fit would have cost |
|---|---|---|
| `report state failed` / `cancelled` | in TS's ruled vocabulary (`core/types.ts:110`, eight words); rs `SemanticState` (`model.rs:104`) has six | `failed`→`Done` was one line away and compiles — it records a declaration the seat never made |
| `--assignment <id>` | `:888-892`; rs has no assignment model anywhere in `crates/` | accepted-and-ignored: the report succeeds and the scoping is silently discarded |
| `--refs a,b` | `:890`, same | as above |
| `--project <slug>` | `:887`; rs reports carry no project | as above |
| `--for <seat>` | plan 078 relay, `:1646`; rs has no PA/prime relation to authorise it | an unauthorised relay is exactly the identity borrowing the flag exists to make attributable |
| `report verify <node>` | `:1733` stamps `verifiedBy` on an assignment record | nothing to stamp; also left UNROUTED (your F2 ruling) so it keeps working on legacy |

Each refusal names the flag or word, says why, and names where the verb still
works (`PIJ_DAEMON_GENERATION=legacy`). None is silent and none is a near-fit.

### Where TS and rs core deliberately DISAGREE

Three rules exist only at the rs BOUNDARY, and core is left untouched, per your
F4 ruling. `pij_core::report` documents that an empty card is valid ("a present
empty card and no card are different facts") and collapses newlines silently;
both are right for an in-process caller and neither is what CLI callers hit.
Settling it at the boundary keeps caller-facing parity — which is what ac-1144
actually claims — without overruling a documented deliberate choice.

The 280 rule is the exception and deliberately so: it is NOT re-implemented. The
boundary cites `CARD_LIMIT` and core checks it again on the way through. One
constant, one owner.

## What I consumed rather than re-implemented

`ReportService` had **zero production consumers** before this unit — grep across
`crates/` returned only `crates/core/tests/report.rs`. This is its first wiring,
staleness threshold included (`staleness_is_judged_by_the_threshold_core_specifies`
writes through HTTP and judges with core's reader, so the daemon cannot acquire a
second opinion).

One method added: `ReportService::declare`. `done`/`blocked`/`question`/`clear`
exposed four of the six words `SemanticState` carries — `Ready`, `Waiting` and
`Hold` had **no exposed path at all**. A caller needing one had two options:
re-implement the registry-then-spine sequence beside the service, or map onto a
near-fit that IS exposed. Both are drift, so the sequence is exposed once.
`crates/core/tests/report.rs` covers it, asserting the registry row AND the spine
record move together.

## The split-brain guard, and why it is in the handler

`ReportService::now` appends to the spine **without consulting the registry** —
correct for a service whose caller has already resolved the seat, and the reason
the handler checks. Without it, a card for a legacy-resident seat would land in
the rs spine under a name rs has never heard of, invisible to the store the seat
really lives in, with every surface reporting success.
`a_seat_rs_does_not_hold_is_refused_and_no_card_is_written` asserts both halves:
the named refusal, and that no `report.now` event exists for that seat.

## Your never-bare-404 rule, pinned rather than promised

`refusals_are_never_classifiable_as_route_absence` replays the shim's OWN
classification over all nine refusal shapes the handler can emit: status is not a
bare 404/405, the body decodes as an envelope, `ok` is false, and an `ErrorKind`
is present. It is non-vacuous by construction — it asserts the two facts
`classifyRsResponse` actually branches on, so a handler that started answering a
bare 404 for any of them fails here and only here.

## Honest limits

1. **"Readable via rs" is read through core's `ReportService` over the reopened
   store, not through `pij state <id>`.** That endpoint is u-readback's and does
   not exist on my branch. The claim I prove is "written through the rs HTTP
   surface, durable, and read back by rs's own reader from a REOPENED store" —
   which is the durability claim. The end-to-end `pij state` arm belongs to
   composition, and I am not claiming it.
2. **The `caller` key spelling is a cross-runtime literal seam.** The handler
   accepts `PIJ_SESSION_ID`, `pijSessionId` and `pij_session_id`, and a test
   exercises two of them — but nothing except agreement between two files keeps
   the TypeScript writer and the Rust reader matching. A rename on either side
   presents as a green suite and a fleet that cannot report. Worth one shared
   constant or one cross-surface test at composition; I could not write it from
   here without touching the wave-1 file.
3. **No live-daemon witness.** Everything here is against a daemon this test
   spawns on a fresh store. The live arm needs the seam unit's item 1 (caller
   context on the wire) before a real `pij report now` can reach rs at all.
4. **`--state` on `report now` is not atomic.** TS writes state then status under
   one lock; rs's two ports offer no cross-port transaction, so the order is kept
   and a partial result is reported as the partial result it is — the same choice
   `pij_core::report` already makes, for the same reason. Inventing a rollback
   story would be a second, false account of the same failure.

## Contract flaws raised (all before building)

Six, in `assets/seam-findings-u-report.md` plus F6 by message. F1 (follow-the-seat
declared, tested and unreachable) and F2 (one route row, six sub-verbs, no
leaf-level hold) were ruled and moved into the seam unit; F3/F4/F5 defaults were
approved; F6 (no seat identity on the wire) turned out to be shared with
u-identity, which had reached it first.
