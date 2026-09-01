# Coder packet — u-route (plan 114, wave 1, ALONE)

**You are the u-route coder.** PM: `pij-printed-peafowl`.
Reply to the PM with: `pij send pij-printed-peafowl "<msg>"`
For any relayed text (logs, output, source excerpts) use
`pij send pij-printed-peafowl --body-file <path>` — a double-quoted body is
expanded by YOUR shell before pij runs, so backticks and $( ) in it execute.

You are pij-blind at boot: the two ids above are the only ones you need.
Do not message anyone else. Escalate to the PM, never to o-prime, never to Jordan.

## 0. Before you write anything

1. Load BOTH skills and act from their contracts, never from CLI `--help`:
   `/pij` and `/builder`. Then run `/builder 6 implement --plan
   "/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/docs/plans/114-ready-on-rs/plan.dd.json"`.
2. Read, in this order:
   - `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/docs/plans/114-ready-on-rs/plan.dd.md` (ACs, esp. ac-1143, ac-1145, ac-1146, ac-1147)
   - `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/docs/plans/114-ready-on-rs/impl-guide.dd.md` (u-route row)
   - `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/docs/plans/114-ready-on-rs/assets/pm-ack-objections.md` (why the contract says what it says)
3. `pij report now "<did>" "<next>"` at the START and END of your unit. A card
   older than 10 minutes makes every pij command warn you on stderr — that line
   is an instruction, not decoration.

## 1. Your workspace — ABSOLUTE PATHS, do not deviate

- Worktree: `/Users/jordanknight/pi-hacking/pij-worktrees/s114-u-route`
- Branch:   `s114/u-route` (already created, off `s114/ready-on-rs`)
- You NEVER merge. The PM composes. Commit and push your branch; that is all.
- Rust builds (if you touch any): `export CARGO_TARGET_DIR=/Users/jordanknight/pi-hacking/pij-worktrees/s114-u-route/.cargo-target`
  and use `~/.cargo/bin/cargo` — the bare `cargo` on this machine is a broken
  homebrew 1.95. u-route is mostly TypeScript; you probably touch no Rust.

## 2. The job

Make the `pij` CLI generation-aware. `harness/scripts/pij-cli.cjs` ->
`.pi/extensions/pij/cli.ts` (4657 lines, one dispatcher). Add:

**(a) Detection — REUSE, do not mint a second.**
`detectDaemonGeneration` already exists at
`.pi/extensions/pij/adapters/daemon-http.ts:77`, is used at
`.pi/extensions/pij/index.ts:285`, and has tests in
`.pi/extensions/pij/adapters/daemon-http.test.ts`. Use it.

**(b) NAMED ADDR RESOLUTION (ruled at the ack — ac-1143).**
rs addr resolution order is `--addr` -> `PIJ_RS_ADDR` -> `127.0.0.1:7461`.
Two rs daemons coexisted on this machine this morning (a stale plan-110 demo on
`:17610` with its OWN state-dir, and the real one on `:7461`); the demo has been
reaped, but BUILD FOR THE GENERAL CASE — the next stale daemon is inevitable.
Detection must resolve a NAMED addr, and the diagnostic must print WHICH ADDR
served, not merely which generation. A detector that asks only "is an rs daemon
live?" can bind a demo store, which is split-brain one layer below the
split-brain this plan exists to prevent.

**(c) The route table is DATA.**
One entry per verb/leaf, consumed by a dispatcher that contains NO per-verb
logic. A verb is routed to rs ONLY when listed; everything unlisted goes legacy.
Adding an rs verb in wave 2 must be a one-row change. If you find yourself
writing `if (verb === ...)` in the dispatcher, stop — that is the table's job.

**(d) THREE distinguishable fallback outcomes — never collapsed (F-1128).**
1. routed-to-rs
2. rs-does-not-implement-the-verb -> legacy
3. seat-lives-in-legacy -> legacy, FOLLOWED (oq-1141 ruling: follow the seat,
   but make the follow VISIBLE, never silent)
Collapsing 2 and 3 into "served by legacy" carries no information.
**An rs ERROR NEVER falls back.** Masking a real rs failure would silently
re-home seats. Not-implemented and errored must be distinguishable at the call site.

**(e) Forceback BOTH directions.**
`PIJ_DAEMON_GENERATION=legacy` already forces legacy — keep it. Add the
symmetric force-rs.

**(f) `tail` is DELIBERATELY NOT ROUTED (ac-1145, ruled — NO RENAME).**
TS `tail` = peer transcript. rs `tail` = daemon event/peer-state frames.
Different objects, same spelling. The unlisted-goes-legacy default already
settles this for free. Your job is to PIN the absence: a test asserting `tail`
is ABSENT from the rs-routed set, so a future row-add is a deliberate act that
fails this test first. Do NOT rename rs's tail.

**(g) The shim has NO name-generation path (ac-1147, FROZEN).**
The minter lives in rs — `allocate_memorable_id` at
`crates/daemon/src/http/mod.rs:290` (called at `:496`), backed by
`pij_core::names::memorable_pij_id_candidates`. The shim NEVER invents a seat
name. Pin it with a test that the shim has no name-generation path.
Two minters would be the headline split-brain by construction.

**(h) ZERO downstream diff (ac-1146) — prove it on BOTH artifacts.**
The impl-guide's u-route cell only names the repo check. The AC is stricter and
the AC governs:
1. repo diff touches zero files under `skills/` or `.claude/`, AND
2. a before/after hash of the INSTALLED tree is identical:
   `~/.claude/skills/pij` is a symlink to `~/.agents/skills/pij`, which is
   OUTSIDE this repo. That installed tree is the skill the operator gesture
   actually runs; the repo copy is not. Hash it before you start and after you
   finish, and put both hashes in your receipt.
If you ever feel you need a skill edit to make routing work, STOP and escalate
to the PM — that would mean the routing design is wrong.

## 3. Red-first is not negotiable

**A compile error is NOT a red witness.** Your red is available
chronologically, so you do not need a substitute: with an rs daemon up and
`adopt` routed to rs, a seat must register into rs — and that FAILS TODAY
because adopt goes legacy. Capture that genuine red BEFORE the fix, in the
output, and cite it in your receipt.

If you ever hit a case where a chronological red is genuinely impossible, say so
PLAINLY, record a mutation proof as a substitute, and NAME ITS LIMITATION. Do
not launder a reconstruction into "genuine".

Table tests required: routed-to-rs · not-implemented-falls-back ·
rs-error-does-NOT-fall-back · both forcebacks · no-rs-daemon-at-all ·
tail-absent-from-routed-set · shim-has-no-minter · addr-named-in-diagnostic ·
the three fallback outcomes distinguishable from each other.

## 4. Gate

```
~/.cargo/bin/cargo run -p pij-testkit --bin pij-gate
```
Read the VERDICT BLOCK. If you read an exit code, read it ADJACENT to the bare
command — a pipe or a trailing command launders the status to the last command's
(exit-code laundering is a real trap on this fleet). Also run the TS test suite
for the files you touched.

## 5. Out of bounds — do not touch

`skills/`, `.claude/`, `~/.agents/skills/`, the-flow files
(`.the-flow-state.json`, `the-flow.json`, `the-flow.md`), `.harness/government/**`,
other plans' folders, the frozen receipt vocabulary
(Delivered/Queued/Held/Refused/SeatIsGone), the `crossSessionInbound` default,
`main`, and the canonical checkout at `/Users/jordanknight/pi-hacking/pij` —
that one is SHARED with every fleet on this machine and a branch swap there
silently swaps the machine-wide daemon source. Never `cd` into it.

## 6. Report back

When done, `pij send pij-printed-peafowl --body-file <path>` with:
- the genuine red (pre-fix output), then green
- the route table as data — show me the table, and show me the dispatcher has
  no per-verb branch
- both ac-1146 hashes (installed tree before/after) and the repo diff check
- gate VERDICT BLOCK
- anything in the contract you found wrong. The last three plans each had a real
  contract flaw found by the executing seat; O3 on this one was a decision
  wearing a port's clothes. If you see one, say so — it is wanted, not tolerated.
