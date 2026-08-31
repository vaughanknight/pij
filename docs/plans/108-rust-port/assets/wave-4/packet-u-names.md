# Coder packet — u-names (wave 4)

**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w4-names` · branch `s108/w4-names`
**Common contract (read FIRST)**: `docs/plans/108-rust-port/assets/wave-4/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

Port the memorable seat-name allocator. `pij-familiar-gant`, not
`pij-a3f9c21b0e77`.

This unit exists because u-spawn asked to mint seat ids from hex and I ruled
against it: **memorable names are a product surface, not cosmetics.** Every
message in this fleet addresses seats by name; a hex roster would be a visible
regression in the thing pij is for. But the TS generator is not a wordlist
lookup, and squeezing a port of it into a launcher packet is how you get a subtly
wrong port that passes its own tests. So it gets its own unit.

## Your source, and why it is more than it looks

`/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/memorable-id.ts`
and its corpus `core/name-corpus.ts`. **Read the comments; they record
measurements, not intentions.**

Properties that were TUNED and must survive the port:

* **The id space is a grid PLUS a tail.** `adjective × noun` pairs, with
  standalone ship names appended after them. `index < PAIR_SPACE` yields
  `pij-<adjective>-<noun>`; beyond it, `pij-<ship>`.
* **Strided probing**, so the whole space stays reachable and collisions resolve
  without clustering. A naive "retry on collision" loses this.
* **An avalanche mix before ANY modulus.** FNV-1a mixes its low bits weakly, and
  `hash % n` is badly biased on the structured seeds pij actually generates
  (`s<epoch>-<pid>`, `adopt\0…\0<panePid>`). Their own comment records the
  measurement: **10 ship starts in 405 real-shaped seeds against a designed ~68.**
  If you port the modulus without the mix, the bug is invisible in a unit test and
  shows up as a fleet that keeps drawing the same names.
* **Resume-safe determinism** — no clock, no RNG. The same seed yields the same
  name after a restart, which is what makes adoption idempotent.
* **A curated corpus.** Words were REMOVED deliberately (the file explains which
  and why — slang collisions in the noun slot). Port the corpus as data, do not
  regenerate it from any other list, and do not "improve" it.

## What to build

1. The generator in `pij-core` (pure, no IO) with the corpus as committed data.
2. **Golden vectors taken from the TS implementation**: run the TS generator over
   a fixed set of seeds, commit the outputs, and assert the Rust port reproduces
   them exactly. This is the only proof that matters — the port is correct iff it
   agrees with the thing already naming seats in production.
3. Wire it into `/v1/spawn` as the default when `--id` is absent (u-spawn keeps
   its explicit `--id` and its collision refusal; you supply the default, you do
   not replace the check).

## Done bar

* Gate six stages green (COMMON § 2).
* **Golden agreement with TS across a seed corpus that includes the real seed
  SHAPES**, not just pretty inputs — `s<epoch>-<pid>` and the adopt form are the
  ones that exposed the bias.
* **A distribution assertion**: over a few hundred real-shaped seeds, ship starts
  land near the designed rate. This is the test that fails when the avalanche mix
  is missing, and it is the reason this unit is not a wordlist lookup.
* **Mutation witnesses**: remove the mix and watch the distribution test fail;
  replace strided probing with naive retry and watch reachability fail.
* `MEMORABLE_PIJ_ID_SPACE` agrees between implementations.
* Report committed and pushed **before** the done message (COMMON § 5).

## Watch for

* **Do not port the TS seeding SOURCE**, only its algorithm: Rust already has
  `getrandom` for entropy and the daemon owns the seed it passes in. What must
  match is the mapping from seed to name.
* The corpus is DATA. If a word looks odd, it is probably deliberate — check the
  removal comments before touching it.
* `pij-core` is additive-only and allocated to you for this wave; say at the ack
  exactly what you intend to add.
