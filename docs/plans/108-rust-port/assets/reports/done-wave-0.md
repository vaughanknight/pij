# Wave 0 done report — plan 108 phase 1 (the mold)

**PM**: `pij-revolutionary-lungfish` · **Prime**: `pij-dominant-vicuna` ·
2026-08-28 · **Reviewer**: `pij-right-wasp` (copilot/gpt-5.6-sol, high)

## Head, toolchain, disk

```
HEAD=e508cd9704ffdbb9bbb05b62d6acdd4a126eda08
SHORT=e508cd97
PUSHED=e508cd97
CLEAN_LINES=0
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
1.98.0-aarch64-apple-darwin (overridden by '/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/rust-toolchain.toml')
/dev/disk3s5   1.8Ti   1.6Ti   205Gi    89%     10M  2.1G    0%   /System/Volumes/Data
```

Branch pushed to `origin/s108/rust-port`. **No PR** — none opened, and none will
be without a fresh go from the prime (fence, Jordan 2026-08-28).

## Gate

```
pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  lock      PASS  Cargo.lock matches the manifests
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  8 crates, 0 violations

pij-gate: all stages green
```

Six stages, run in one invocation, every stage executed even when one fails.
`cargo test --workspace`: **86 passed, 0 failed**. The canonical invocation is
`cargo run --locked -p pij-testkit --bin pij-gate`; `--locked` is part of the
command, because without it the build that produces the gate can repair a stale
lock before the gate starts. Working tree clean after the
gate — a property the `lock` stage now defends, because a gate that mutates the
tree it judges can report green on something nobody else can compile.

**Reproducibility, executed rather than documented**: `git archive` of the fixed
commit into a clean directory, then `cargo build --locked --workspace` (34.56s)
and `cargo test --locked --workspace` (81 passed, 0 failed).

## Tasks and acceptance

All ten phase-1 tasks (`tk-48f2` … `tk-81b3`) and all ten `done_when` rows are
`checked` via `ddocs set`; `ddocs validate` reports 0 errors / 0 warnings. The
prime checked ac-0001..ac-0008 with the receipts, adding one of their own: an
independent `pij-gate` run that FAILED stage 1 because PATH resolved Homebrew's
1.95.0 — the toolchain assert defending exactly what it was built for.

## What wave 1 inherits

* 8 crates, the ratified R2 graph, enforced by an allow-list where every row
  carries a rationale and an unused row is now itself a violation.
* **Seven** frozen ports (R3-AMEND-1), async (R3-AMEND-2), with the
  "an eighth is stop-and-ask" rule stated at the seam.
* A deterministic, scriptable, RECORDING fake per port; shared contract suites the
  SQLite implementations run unchanged — which caught two real defects in SQL.
* SQLite store with boot self-migration, directional skew refusal, and a schema
  guard on all ten public database operations.
* The queue primitive, built before any consumer, with dedupe and per-entity
  serialization enforced in SQL and four killed mutants.
* `pij-rs`: one binary, two composition roots, all seven ports wired, fakes by
  default, per-boot 0600 key staged-then-published around a successful bind.
* The addressable fixture corpus (real captured traffic, malformed cases, sha256
  and an ANSWER per fixture), the golden mechanism, `FreshStore`, `fresh_dir`.
* `pij-gate` as the single "are we done" question, and `pocs/` as the spike lane.

## Assumptions (the section the impl-guide demands)

1. **The TS wire is not the v1 wire.** `{seq,timestamp,type,data}` vs
   `{v,at,kind,seat,payload}`; ruled R7. If cutover later wants field-name
   continuity, the TS→v1 mapping is confined to two readers and both are unwritten.
2. **`thinking_levels` is a `Vec`, empty means none.** Three upstream encodings
   collapse to one representation. If any consumer ever needs "unknown levels" as
   a distinct state, that is a new variant and a ruling, not a nullable field.
3. **Ports are async everywhere**, including seams whose adapters are synchronous
   today (`LivenessPort`, `TmuxPort`). Reversing that after wave 1 touches every
   adapter.
4. **`AdapterChoice::Real` for transport/tmux/harness/liveness refuses at boot**,
   naming the unit that will ship it. The wave that implements one replaces a
   single named match arm; it must also delete the refusal.
5. **Adapters are empty crates.** `tmux`, `harnesses`, `transport` compile and do
   nothing. The mold is proven, the port is not begun.
6. **The store is single-node SQLite.** WAL, `BEGIN IMMEDIATE` for writers, one
   process assumed to own the file. Multi-writer across machines is not designed
   for and would need R1 revisited.
7. **`user_version` is a cache of sqlx's migration ledger**, reconciled at boot.
   Anything that writes the pragma outside migration is lying to the guard.
8. **The schema guard costs one `PRAGMA` per operation.** Deliberate. If it ever
   shows in a profile, the fix is a cached generation counter invalidated on
   migration — never dropping the check.
9. **Goldens run against committed bytes, never a live binary.** The TS catalog is
   time-varying (599 rows → 125 in ten minutes, measured). Real binary-to-binary
   parity is wave 3 and needs a pinned invocation.
10. **`pocs/` is outside the gate by design.** A spike's evidence is captured
    output; nothing there is compiled, linted, or architecture-checked.
11. **Windows key permissions are unproven.** `0600` is enforced on Unix; on
    Windows the file inherits the directory ACL and the code says so rather than
    claiming semantics it does not have.
12. **`harness checks` cannot run in this worktree** (`tsx/biome/vitest: command
    not found`) — a node-tooling absence, unrelated to the Rust diff, confirmed
    independently by the reviewer. The Rust gate is `pij-gate`; wiring it into
    `just`/`harness checks` is outside this plan's fence and is a named follow-up.

## Reviewer harness — stated honestly, per the prime's standing correction

`pij-right-wasp` ran on the **copilot CLI harness**
(`pij spawn --harness copilot --model gpt-5.6-sol --effort high`), not the OMP
harness Jordan has since made standing for coders and reviewers
(`pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast-1m
--effort high`). The correction arrived mid-review and the prime ruled wasp
finishes as-is. Verdict quality was 11-for-11 with every finding evidence-backed,
so nothing here is contingent on the harness — but wave 1 spawns the ruled way,
and this report says which one produced these findings rather than leaving a
reader to assume.

Model verification also has a caveat worth repeating: `pij canary` timed out twice
(the seat was mid-turn on its bootstrap both times), so the model was confirmed
from the pane footer (`gpt-5.6-sol · high`) — the C2-legitimate fallback. A
timeout was not counted as a pass.

## Named follow-ups the prime owns

* Promote `assets/architecture.md` → `docs/rules-idioms-architecture/`, and decide
  whether the root README mentions `pij-rs` (fence, ruling Q3).
* Wire `pij-gate` into `just` / `harness checks` (outside the fence).
* R5 items 13–14 (registry rows lacking facts other surfaces already hold) are
  wave-1 contract inputs for `u-store`/`u-harness`.
* Candidate defect 12 (the openrouter 479→5 catalog collapse) remains an
  unverified prime-side TS investigation.

## Review — APPROVE

**Four rounds, eleven findings, none refuted.** Final verdict `APPROVE` from
`pij-right-wasp` at `e508cd97`, citing its own re-verification: the clean test,
the exact `#[derive(Clone)]` mutation failing with the intended reason in a
disposable export, and the canonical gate green with `git status --short` and
`git diff --check` both empty afterwards.

Rounds 3 and 4 found the same class as round 2, and it is the most useful thing
this review produced: **a regression that exercises the path without exercising
the property.** The round-1 key fix passed a two-boot test whose second boot died
at the bind, before staging mattered. The round-2 schema regression covered four
operations out of ten. The round-3 `Clone` removal shipped with a test that still
passed when `Clone` was re-added. Each looked like coverage.

Original summary, kept: two rounds, ten findings, **none refuted** — every one was a real defect and every
one is now a regression named for the incident rather than the fix. Two of the ten
were places where my own tests asserted the opposite of a settled ruling, and
three more were promises that held only for the cases I had checked. The full
record, with the reviewer's own measurements kept intact, is in
`assets/reports/review-round-1.md` and `review-round-2.md`.

## Friction

`assets/experiences.md` — 11 entries, each with what it encoded. The two worth the
prime's attention are E-005 (a shared worktree cost an attribution smudge and a
coordination round trip) and E-009 (a negative test that was a tautology because
the system adapts to the variable I mutated).
