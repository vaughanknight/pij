# Coder packet — u-identity (plan 114, wave 2)

**You are the u-identity coder.** PM: `pij-printed-peafowl`.
Reply: `pij send pij-printed-peafowl "<msg>"` — for logs/output/source excerpts
use `pij send pij-printed-peafowl --body-file <path>` (a double-quoted body is
expanded by YOUR shell first, so backticks and $( ) in it execute).
You are pij-blind at boot; those two ids are the only ones you need. Escalate to
the PM, never to o-prime, never to Jordan.

**You are on ac-1141's critical path.** Until your adopt endpoint exists, the
plan's headline gesture cannot go green — u-route proved that and declared it an
honest RED rather than laundering it. You are the unit that closes it.

## 0. Before you write anything

Load BOTH `/pij` and `/builder`; act from their contracts, never CLI `--help`.
Then `/builder 6 implement --plan
"/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/docs/plans/114-ready-on-rs/plan.dd.json"`.
Read plan.dd.md (esp. ac-1142, ac-1147, ac-1148), impl-guide.dd.md (u-identity
row), and assets/pm-ack-objections.md for why the contract says what it says.
`pij report now "<did>" "<next>"` at the START and END of your unit.

## 1. Workspace — ABSOLUTE PATHS

- Worktree: `/Users/jordanknight/pi-hacking/pij-worktrees/s114-u-identity`
- Branch:   `s114/u-identity`
- `export CARGO_TARGET_DIR=/Users/jordanknight/pi-hacking/pij-worktrees/s114-u-identity/.cargo-target`
- Use `~/.cargo/bin/cargo` — the bare `cargo` here is a broken homebrew 1.95.
- You NEVER merge; the PM composes. Never `cd` into
  `/Users/jordanknight/pi-hacking/pij` (canonical, shared with every fleet on
  this machine — a branch swap there swaps the machine-wide daemon source).

## 2. The job

`whoami`, `adopt` (pane form AND the paneless `inbox register` form the ready
route uses), and `phonehome`, in rs.

**(a) THE MINTER IS YOURS AND IT IS A REAL MOVE, NOT A REFERENCE.**
ac-1147 is frozen: the minter lives in rs, the shim never invents a name.
The allocator exists — `pij_core::names::memorable_pij_id_candidates`, wrapped by
`allocate_memorable_id` at `crates/daemon/src/http/mod.rs:290`. **But today it is
seeded by `spawn_id` and is called ONLY at `:496`, inside the SPAWN/REVIVE path —
never from `register`.** Wiring it to adopt is a real small move, not a one-line
reference. Do not expect to just call it. `register` still takes a
caller-supplied id and must KEEP doing so for the explicit case only.

**(b) `phonehome` IS IN SCOPE (ac-1148) AND IT IS INSIDE THE GESTURE.**
An rs-registered seat answered by LEGACY phonehome is the identity violation this
plan exists to prevent. Ruled: rs adopt binds SYNCHRONOUSLY where it can, so
phonehome CONFIRMS rather than polls; where it cannot, phonehome answers honestly
from rs and NEVER falls back.
This is not academic — the plan's own coder seat sat DEGRADED/never-bound for 3
minutes while printing "I'm bound", with both queued messages undeliverable and
no error anywhere. Bind reliability is the fix direction; the queue was fine.

**(c) VERIFY THE WRITE, NEVER THE PRINT.**
The TS route warns that `adopt` on a dissolved descriptor prints a correct-looking
`adopted <id> … (pane %N, bound)` and persists NOTHING. rs must not reproduce
that. **A success line must mean a persisted row, and your test must assert the
ROW, not the OUTPUT.** A print-only success is a FAILURE, not a pass.

**(d) Identity derived, never asserted.**
`whoami` derives from the ambient seat. An invalid or foreign `PIJ_SESSION_ID`
must not mint a phantom seat nor silently impersonate one. For any pid identity,
reuse plan 113's start-time corroboration — pid alone is recycled at boot.

**(e) req-0008: never clear live state on re-register.** Port intents, consent
stamps and the like survive a re-register.

## 3. Red-first — and you can finally close the real one

A compile error is NOT a red witness. Your red-first arms:
- adopt persists a row that whoami then names (red today: no adopt route exists).
- **the end-to-end arm u-route had to leave red**: with the rs daemon up and the
  shim routing adopt to rs, a seat lands in the rs store. Cite u-route's declared
  red and show it going green — that is ac-1141's core.
- discriminating arm: a print-only success FAILS.
If a chronological red is ever genuinely impossible, say so plainly and record a
mutation proof WITH its limitation named. Never launder a reconstruction into
"genuine".

## 4. Gate

`~/.cargo/bin/cargo run -p pij-testkit --bin pij-gate` — read the VERDICT BLOCK.
If you read an exit code, read it ADJACENT to the bare command; a pipe or trailing
command launders the status to the last command's.

## 5. Out of bounds

`skills/`, `.claude/`, `~/.agents/skills/`, the-flow files, `.harness/government/**`,
other plans' folders, the frozen receipt vocabulary
(Delivered/Queued/Held/Refused/SeatIsGone), the `crossSessionInbound` default,
`main`, and the canonical checkout.

## 6. Report back

Genuine red then green · the persisted-row assertion (not output) · the minter
wiring showing register's explicit-id path preserved · phonehome served by rs for
an rs seat, never legacy · gate VERDICT BLOCK · and anything in the contract you
find wrong. Every unit on this plan so far has returned a real contract flaw —
u-route found two, one of which was the PM's. It is wanted, not tolerated.

## 7. ADDENDUM — what wave 1 shipped (read this; the packet above predates it)

Read `assets/composition-wave1.md`. Three things change for you:

1. **The shim ASKS rs what it serves.** Your handler goes live with ZERO shim
   edits — do NOT touch `.pi/extensions/pij/**`; wave 1 owns it. The `adopt`,
   `whoami` and `phonehome` rows already exist and are waiting for you.
2. **rs checks auth BEFORE matching the route**, so a 401 can MASK a route that
   does not exist. Expect that while testing a brand-new endpoint: a missing key
   looks exactly like a missing handler.
3. **ac-1141's end-to-end arm is RED and it is YOURS to close.** u-route declared
   it honestly rather than laundering it. Cite that declared red and show it going
   green — that is the plan's headline row.

Gate note: read the exit code ADJACENT to the bare command with NO pipe. I made
this exact mistake composing wave 1 — piping to `tail` reports `tail`'s status,
not the gate's. Redirect to a file instead.
Known repo property: `tsc --noEmit` EXCLUDES `**/*.test.ts`, so a green typecheck
does NOT cover your tests. Known pre-existing red, NOT yours:
`npm-resolution-policy.integration.test.ts` (npm 11.5.1 vs `.npmrc` min-release-age).
