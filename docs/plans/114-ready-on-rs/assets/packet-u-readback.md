# Coder packet — u-readback (plan 114, wave 2)

**You are the u-readback coder.** PM: `pij-printed-peafowl`.
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

- Worktree: `/Users/jordanknight/pi-hacking/pij-worktrees/s114-u-readback`
- Branch:   `s114/u-readback`
- `export CARGO_TARGET_DIR=/Users/jordanknight/pi-hacking/pij-worktrees/s114-u-readback/.cargo-target`
- `~/.cargo/bin/cargo` — bare `cargo` here is a broken homebrew 1.95.
- You NEVER merge; the PM composes.

## 2. The job — `state <id>` in rs, and the tail inventory

**(a) `state <id>`** returning what callers expect from the TS surface. Derive
the shape from the TS SOURCE and cite the line, not from this packet.

**(b) THE TAIL FALSE FRIEND IS ALREADY SETTLED — DO NOT RE-OPEN IT.**
Ruled: **NO RENAME.** rs keeps `tail` (daemon events); TS keeps `tail` (peer
transcript); the shim DENIES `tail` from routing, so every caller keeps TS
semantics. Wave 1 shipped the deny list and a non-vacuous test that pins `tail`
denied EVEN IF rs advertises it. If an older doc tells you to propose a rename,
that text is superseded — the ruling is in ac-1145.
**Your job on tail is the INVENTORY, not the design**: name every existing
consumer of either spelling you can find — grep the repo AND `~/.agents/skills/`
(read-only; never edit it, ac-1146 forbids any change there) — and put the list
in your findings. That inventory is what makes a future decision to route `tail`
a deliberate act with known blast radius rather than a surprise.

**(c) If you implement anything that makes rs ADVERTISE `tail`, say so loudly**
— wave 1's deny list is what stops that becoming a silent false friend, and I
want to know the day it starts being load-bearing for real rather than
hypothetically.

## 3. Red-first

A compile error is NOT a red witness. Your red: `state <id>` round-trip through
rs — impossible today, no handler exists. If a chronological red is ever
genuinely impossible, say so plainly and record a mutation proof WITH its
limitation named. Never launder a reconstruction into "genuine".

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
