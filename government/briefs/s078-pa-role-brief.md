# s078 brief — PA role and capability gate · PM: pij-unwilling-butterfly
**Written**: 2026-07-31 · **By**: pij-wee-albatross (o-prime) · **Ruled**: Jordan
("okay then yes lets do pa role", after ruling one PA per prime on 2026-07-30).

## Mission

Make a PA seat **read-only by construction, not by prompt**. Two parts:

1. **`pa` as a fourth `orchestrationRole` value** — same field, same projection sites, no
   migration, absence semantics unchanged.
2. **A capability gate**: authority-bearing verbs refuse a `pa`-roled caller with a clear
   error naming the role and the reason.

## The hard ordering — ratification before code on part 1

`orchestrationRole` is chainglass-projected under JC-2 (`prime|pm|worker|null`). Adding a
value widens a consumed enum, so it is a contract touch. **The ask is already with
cheetah** (`government/briefs/s078-pa-role-ratification-ask.md`); I carry it and relay the
verdict. **Do not land the value until I relay ratification.** Part 2's gate design,
chokepoint analysis, and tests are unblocked and are where your time should go first.

## The verbs to refuse (from the four interviews; argue with this list if it is wrong)

- **Lineage / seat control**: `link`, `adopt`, `close`, `orchestration prime`.
  Roadrunner's framing: `E-OWN` already refuses *primes* on unowned seats, so a PA sits
  below that bar permanently.
- **Obligation and authority**: `task set`, `task close`, `orchestration baton grant`,
  and any `--force`.
- **Testimony**: `report verify`, and any `report state`/`report now` targeting a seat
  other than itself.

Explicitly ALLOWED and must not regress: every `--json` read, `spine events`,
`anomalies`, `send`, and the PA's own card (`report now` on itself).

## BINDING CONSTRAINT added 2026-07-31 — do not build a gate whose input is unobservable

Butterfly's own, accepted verbatim and recorded before any code: catshark found that
`opened.actor` — the input to s075's authority rule — **has no read path** (`pij task` is
`set|close`; `node show` omits `opened`; verified independently by butterfly, mastodon and
me). So a correct rule shipped with an unobservable precondition, and every seat learns
its authorisation by attempting.

**s078 part 2 must therefore specify how a caller determines its own capability BEFORE
attempting a refused verb.** A capability gate that refuses on a property no seat can read
would ship the identical defect twice in two days, in the stream whose entire purpose is
making authority legible.

The `opened` disclosure fix is a **fast follow in its own stream** (butterfly's call,
accepted): different contract touch (node-show projection vs the role enum) and different
shape (disclosure vs refusal), so coupling them would let one ratification block the other
for no benefit.

## The design constraint that matters most

**One predicate at one chokepoint.** Roadrunner's diagnosis of this week's defect cluster
was "rules implemented once and not consulted at a second call site" — and s077 proved
the shape works, where one guard in `resolveTargetAssignment` covered three write paths.
A gate enumerated at ten call sites will drift and is worse than no gate, because it will
be believed. If no single chokepoint exists, say so and propose the smallest set, with
the drift risk named.

Mutation proof per standing doctrine: removing the gate must let a PA-roled caller
through, on a test that names each refused verb.

## Constraints

Worktree `/Users/jordanknight/pi-hacking/pij-worktrees/s078-pa-role`, branch
`s078/pa-role`, base main @ `14f6537`. rsync node_modules from canonical **with an
absolute path** (your own trap from s077). Enrollment registries are in play again —
`DESCRIPTOR_FIELD_OWNER` if any field moves, CLI dispatch/USAGE, the role vocabulary
itself, spine kinds if you audit role changes. Name every one you touch. Per-PR merge
ask to Jordan directly.

## Not in scope

The PA agent itself — its prompt, model, chores, heartbeat. Jordan has ruled that a
separate PM's work. This stream builds the *capability boundary* the PA will run inside,
and nothing else. Do not build chore logic here.
