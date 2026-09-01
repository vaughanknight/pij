# Coder packet — u-report (plan 114, wave 2)

**You are the u-report coder.** PM: `pij-printed-peafowl`.
Reply: `pij send pij-printed-peafowl "<msg>"`; for logs/output/source excerpts use
`--body-file <path>` (a double-quoted body is expanded by YOUR shell first, so
backticks and $( ) in it execute). You are pij-blind at boot; those two ids are
all you need. Escalate to the PM, never to o-prime, never to Jordan.

## 0. Before you write anything

Load BOTH `/pij` and `/builder`; act from their contracts, never CLI `--help`.
Then `/builder 6 implement --plan
"/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/docs/plans/114-ready-on-rs/plan.dd.json"`.
Read plan.dd.md, impl-guide.dd.md (your unit row), assets/pm-ack-objections.md
(why the contract says what it says) and assets/composition-wave1.md (what wave 1
actually shipped, and what it left RED).
`pij report now "<did>" "<next>"` at the START and END of your unit.

## Wave 1 gives you this for free

The shim ASKS rs what it serves rather than carrying a copy of the answer. When
your handler lands, its route goes live with **ZERO shim edits** — do not touch
`.pi/extensions/pij/**`. If you believe you need a row that is not already there,
tell me; it is one `{verb, rsPath, method, why}` object and no dispatch change.
Wave 1 also proved rs auth is checked BEFORE route matching, so a 401 can MASK a
route that does not exist. Keep that in mind when you test your new endpoint.

## 1. Workspace — ABSOLUTE PATHS

- Worktree: `/Users/jordanknight/pi-hacking/pij-worktrees/s114-u-report`
- Branch:   `s114/u-report`
- `export CARGO_TARGET_DIR=/Users/jordanknight/pi-hacking/pij-worktrees/s114-u-report/.cargo-target`
- `~/.cargo/bin/cargo` — bare `cargo` here is a broken homebrew 1.95.
- You NEVER merge; the PM composes.

## 2. The job — the report family in rs (ac-1144)

`report now/state/blocked/clear/verify/question`, with the SAME argument shapes
callers already type TODAY. This is the #1 most-used missing verb by a wide
margin, so the shapes must be exactly right.

- **Derive the shapes from the TS SOURCE, not from this packet and not from the
  plan.** Name the TS source line each shape came from, in your receipt. A packet
  is a description; the source is the thing callers actually hit.
- **A shape rs cannot honour REFUSES BY NAME** rather than silently differing.
  A near-fit that type-checks is the worst outcome available here.
- `crates/core` ALREADY has report semantics (ReportService, card field rules,
  staleness). CONSUME them; do not re-implement. A second implementation of a
  rule is how the two drift.
- Cards are durable and readable back. Include the stale-card threshold behaviour
  core already specifies.
- Real constraint you can feel: `pij report now` rejects a "did" over 280 chars
  after whitespace collapsing (E-ARG). I hit it live. Match the real limit, and
  make sure the limit you enforce is the one core defines rather than a number
  you copied.

## 3. Red-first

A compile error is NOT a red witness. Your red: a card written via rs is readable
via rs — impossible today, no handler exists. Shape-parity tests derived from the
TS surface, each citing its source line. If a chronological red is ever genuinely
impossible, say so plainly and record a mutation proof WITH its limitation named.
Never launder a reconstruction into "genuine".

## Gate

`~/.cargo/bin/cargo run -p pij-testkit --bin pij-gate` — read the VERDICT BLOCK.
If you read an exit code, read it ADJACENT to the bare command with NO pipe. I
made this exact mistake composing wave 1: piping to `tail` reports `tail`'s
status, not the gate's. Redirect to a file instead.

Known repo property, so you are not misled: `tsc --noEmit` EXCLUDES `**/*.test.ts`.
A green typecheck does NOT cover your test code. Only vitest exercises it.
Known pre-existing red: `npm-resolution-policy.integration.test.ts` fails on this
machine (npm 11.5.1 does not understand `.npmrc`'s `min-release-age`). NOT yours,
do not fix it, do not let it stop you.

## Out of bounds

`skills/`, `.claude/`, `~/.agents/skills/`, the-flow files, `.harness/government/**`,
other plans' folders, `.pi/extensions/pij/**` (wave 1 owns it), the frozen receipt
vocabulary (Delivered/Queued/Held/Refused/SeatIsGone), the `crossSessionInbound`
default, `main`, and the canonical checkout `/Users/jordanknight/pi-hacking/pij`
(shared with every fleet — never `cd` there).

## Report back

Genuine red then green · gate VERDICT BLOCK read bare · and anything in the
contract you find wrong. Every unit on this plan has returned a real contract
flaw; u-route found three, two of which were the PM's. It is wanted, not
tolerated — raise it at the seam, before you build, not after.
