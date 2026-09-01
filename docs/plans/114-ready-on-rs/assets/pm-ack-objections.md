# PM ack — plan 114 objections (pij-printed-peafowl → pij-dominant-vicuna, 2026-09-01)

Verified on tree/machine before ack. Seven objections, ordered by cost-of-late.

## O1 — ac-1141 cannot be witnessed from this worktree (BLOCKING, needs your ruling)

`which pij` → `~/.npm-global/bin/pij` → `/Users/jordanknight/pi-hacking/pij/harness/scripts/pij-cli.cjs`
— the CANONICAL checkout (HEAD = `main`), not this worktree. The shim built on
`s114/ready-on-rs` governs **nothing** the operator types until it lands there.
That checkout is shared with every other fleet on this machine, so a branch swap
to witness the gesture swaps the machine-wide `pij` for all live seats.

The plan has no ruling on this and the done bar (d1) demands a LIVE witness.
Recommendation: witness under a per-seat `PATH`/entry override pointing at this
worktree's `pij-cli.cjs`, and state in the receipt that the SKILL was unmodified
but the seat's `pij` resolution was overridden — do not launder that into
"unmodified environment". Fleet-quiesce + canonical branch swap is the honest
alternative and it is your call, not mine.

## O2 — `phonehome` is in the gesture and in no unit, AC, or route row

`/pij ready` step 2 verifies with BOTH `pij whoami` AND `pij phonehome` says
`(bound)`. TS `adopt` itself prints "run `pij phonehome` in that pane to confirm
the binding" (`.pi/extensions/pij/cli.ts:3264`) whenever the bind is pending.
So the gesture's own success criterion runs through a verb u-identity does not
own, ac-1142 does not name, and the route table has no row for. A seat that
registers into rs and then phonehomes to legacy violates identity-is-per-seat at
exactly the moment we are witnessing it.
Ask: put `phonehome` in u-identity's scope, or rule explicitly that rs `adopt`
must return bound-never-pending so the verb is unreachable — either way it is an
rs behavioural requirement that must be written down now.

## O3 — rs `register` is not `adopt`: the id-minting seam is unassigned (FROZEN-SEAM CLASS)

`pij-rs register --harness <h> --folder <f> <ID>` takes a **caller-supplied** seat
id and requires `--pid` paired with `--proc-start`. TS `adopt` **mints** the
friendly id. u-identity is therefore not a port; it must decide where the mint
lives. Two minters = two namespaces = split-brain by construction, which is the
plan's own headline risk arriving through the back door.
Recommendation: the mint lives in **rs** (single writer per store); the shim calls
it and never invents a name. Settle it at the ack — u-report and u-readback both
build on the id this decision produces, and the window closes the moment they do.

## O4 — TWO live rs daemons right now; detection has no addr discipline

    pij-rs 42595  127.0.0.1:17610  ./target/release/pij-rs daemon --state-dir /tmp/pij110-demo   <- stale plan-110 demo
    pij-rs 47938  127.0.0.1:7461   ~/.npm-global/bin/pij-rs daemon                                <- the real one

rs addr resolution is `--addr` → `PIJ_RS_ADDR` → `127.0.0.1:7461`. A detector that
asks "is an rs daemon live?" can bind a demo store. That is split-brain one layer
BELOW the split-brain the plan guards, and it is live on the machine today.
Ask: detection resolves a NAMED addr, and the diagnostic prints which ADDR served,
not only which generation. One extra field, cheap now.

## O5 — the `tail` false friend: recommend refusal-by-absence, not a rename

rs `tail` is already a top-level verb ("follow daemon event and peer-state frames").
TS `tail` is the peer transcript and is the /pij skill's documented peer-route verb.
u-route's default — unlisted verbs go legacy — already settles ac-1145 for free:
`tail` simply never gets a route-table row, and the pin is a test asserting `tail`
is absent from the rs-routed set AND that the routed CLI's `tail` reaches the
transcript. A rename is a breaking change to rs's own surface that buys nothing
the table does not already give. Recommend: no rename.

## O6 — oq-1141: agree FOLLOW THE SEAT, with one hardening

Follow, but the diagnostic must distinguish THREE outcomes, not two:
routed-to-rs / rs-does-not-implement→legacy / seat-lives-in-legacy→legacy(followed).
Collapsing the last two into "served by legacy" is precisely the F-1128 family the
plan already cites: a notice that cannot tell its cases apart carries no information.

## O7 — ac-1146's zero-diff proves the wrong artifact

The skill the gesture actually executes is `~/.claude/skills/pij` →
`~/.agents/skills/pij` — OUTSIDE this repo. A repo diff over `skills/` proves the
repo's copy unchanged and says nothing about the installed one.
Ask: ac-1146's mechanical check = repo diff zero under `skills/` AND a
before/after hash of the installed `~/.agents/skills/pij` tree.

## Not objections — confirmed sound

- Detection prior art is real and importable: `detectDaemonGeneration` in
  `.pi/extensions/pij/adapters/daemon-http.ts:77` (used at `index.ts:285`), with
  tests. Reuse stands; do not mint a second.
- u-route's red-first is chronologically achievable (adopt-goes-legacy is today's
  observable behaviour), so i5's substitute clause should not be needed for wave 1.
- Wave 1 = u-route alone is right: `.pi/extensions/pij/cli.ts` is 4657 lines and
  one dispatcher; parallel edits there would collide.
