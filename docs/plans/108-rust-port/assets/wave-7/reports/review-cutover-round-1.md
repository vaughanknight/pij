# Reviewer round 1 — u-cutover-controls · **FIX_REQUIRED**

Reviewer `pij-central-crane`. Head reviewed: **`acb1399a`** *feat(rust): add daemon cutover
controls* on `s108/w7-cutover`, branch base `d57dc9f4`. Coder `pij-mere-blackbird`.

Graded against `review-cutover-probe-plan.md` (`d57dc9f4`), which was committed **before this
head existed** so the grading could not be fitted to the implementation. Every row below was
run by me; no number is taken from the receipt.

## Gate — my own run, both ends of the delta

| head | verdict |
|---|---|
| base `d57dc9f4` | toolchain/lock/fmt/clippy/test/arch **all PASS** — `pij-gate: all stages green` |
| unit `acb1399a` | toolchain/lock/fmt/clippy/test/arch **all PASS** — `arch 8 crates, 0 violations` |

Isolated checkout (`/tmp/pij-w7-crane-base`), own `CARGO_TARGET_DIR`, `git status --short`
empty after the run. The coder's tree was never used to run anything and its HEAD was never
moved.

**The earlier base-red report is refuted and was not this unit's**: see the correction already
sent — `pij-sidecars` appears zero times in `crates/testkit/arch-allowlist.toml` at that head,
and the failure came from ostrich's uncommitted allowlist block being live in the shared tree.

## Fence (row D) — clean

Ten files, all inside the packet's fence: `.pi/extensions/pij/**` (4), `crates/cli/src/{lib,
main}.rs`, four transcripts under `wave-7/reports/`. **Nothing** under `crates/tmux/**`,
`crates/store/**`, the sidecars paths, `Cargo.lock`, `Cargo.toml`, `crates/daemon/**`, or the
canonical `/Users/jordanknight/pi-hacking/pij/.pi/**`. None of the five composer-owned shared
paths touched. No production daemon or store contacted by any transcript I read.

---

# Findings

## FIX-1 · The daemon-down refusal is dead code on OMP — and this unit is what made it matter · **high**

`isConnectionRefused` (`adapters/daemon-http.ts`) walks `code`/`cause.code` looking for
`ECONNREFUSED`. Measured, both runtimes, same URL with nothing listening:

```
runtime          : bun                  | runtime          : node
error.name       : Error                | error.name       : TypeError
error.code       : "ConnectionRefused"  | error.code       : undefined
error.cause?.code: undefined            | error.cause?.code: "ECONNREFUSED"
error.message    : Unable to connect. …  | error.message    : fetch failed
```

**OMP runs the extension under Bun** — established by this plan's own wave-3 matrix ("OMP's
launcher runs the extension under Bun, so `process.execPath` is not `omp`"). So on one of the
two hosts this unit must support, `isConnectionRefused` returns false, the
`throw new PijNoDaemonError(...)` branch is unreachable, and the operator receives:

```
Unable to connect. Is the computer able to access the url?
```

No address, no state dir, no `PIJ_RS_ADDR`, no escape hatch.

**Why it matters more after this commit than before it.** At the base, connection-refused fell
through to `hasLegacyFileSurface` and the seat quietly ran on legacy. This commit deletes that
fallback (correctly — the cutover is the point), which converts a silent-but-working path into
a **terminal** one, and on Bun it terminates with an unrecognised error. The unit did not
create the runtime gap; it removed the thing that was hiding it.

**Proof it would fail:** launch an omp host with `PIJ_RS_ADDR` pointing at a dead port and
observe the message. **Proof it is fixed:** the same launch yields `PijNoDaemonError`.

**Why no existing instrument catches it** — `adapters/daemon-http.test.ts:32`:

```ts
const error = new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
```

That is a hand-built **Node-shaped** fake asserted at `:116` to produce `PijNoDaemonError`. It
passes under vitest/Node and cannot fail for the Bun shape, because the fake never produces
it. REVIEWER § 2: *a fake is a claim about the real adapter*. This one claims something false
about the runtime the unit ships to. A witness that discriminates the two shapes is what closes
this, not a wider `catch`.

## FIX-2 · The refusal never names the escape hatch this unit exists to ship · **moderate**

`core/daemon-wire.ts:94-97`, unchanged by this commit:

```
No pij daemon answered at ${addr}. Start pij-rs there or set PIJ_RS_ADDR;
the state directory came from PIJ_RS_STATE_DIR, then HOME/.pij-rs (${stateDir}).
```

It names two of the three controls and omits `PIJ_DAEMON_GENERATION=legacy` — the only one that
gets a stranded seat working again, and the headline deliverable of this packet. Before this
commit the omission was harmless because the code fell back to legacy by itself; now the
message is the entire recovery path. E-023: a consumer cannot act on what it is not told.

Fix is one clause in that constructor. It is inside the fence (`.pi/extensions/pij/**`).

## FIX-3 · `PIJ_RS_STATE_DIR="  "` is refused by TypeScript and accepted by Rust · **moderate**

Same variable, two rules — the packet's own requirement is *"An env var set but malformed is a
LOUD error naming the var and value, never a silent fallback"*.

| runtime | `PIJ_RS_STATE_DIR="  "` |
|---|---|
| TS `daemonLocation` | `THREW: PIJ_RS_STATE_DIR has malformed value "  ": value must not be empty` |
| Rust `pij-rs --json list` | **accepted** → `daemon/auth: could not read the daemon key at   /daemon.key (No such file or directory) — is the daemon running?` |

The Rust error also still misdirects: the daemon *was* answering on the address given. The
cause is internal inconsistency in the new code — `configured_string` (addr, bind) tests
`value.trim().is_empty()`, while `resolve_state_dir` tests only
`path.as_os_str().is_empty()`. A whitespace path is a silent relative directory.

This is the "fix landed in one half" shape (E-029) inside a commit whose subject is the fix.

## FIX-4 · The unit's own report does not exist · **process, blocks close-out**

The packet's write fence and Done section require
`wave-7/reports/done-u-cutover-controls.md` carrying **the control table** for
`PIJ_RS_ADDR` / `--addr`, `PIJ_RS_BIND` / `--bind`, `PIJ_RS_STATE_DIR` / `--state-dir`, plus
`PIJ_DAEMON_GENERATION`. Four transcripts are committed; the report is absent. The table is
packet item 3's deliverable, not a formality — it is the only place the two languages' rules
are stated side by side, which is exactly where FIX-3 would have been visible.

Also outstanding, from the composer: **merge `e17e7488` and re-run the gate**. My six-green is
at `acb1399a`; it does not transfer across that merge.

---

# Verified clean — weighed and NOT raised

Named per REVIEWER § 4, so the next reader knows which known things were checked.

* **Row A1, the falsifier I pre-registered — passes.** `detectDaemonGeneration` returns
  `{kind:"legacy"}` from its **first statement**, before any probe, so forceback works while rs
  is answering. Run live against my throwaway daemon: `A1 legacy-forced, rs answering ->
  legacy`, `A2 unset(rs) -> rust`, `A4 legacy-forced, empty legacy home -> legacy`. The
  implementation avoids the catch-branch trap entirely.
* **Row C3, the other trap — passes.** `--addr` became `Option<String>`, so presence is
  distinguished from value: an explicit `--addr 127.0.0.1:7461` that equals the default still
  beats `PIJ_RS_ADDR`. Verified live (went to 7461 and was refused, while the env pointed at a
  live daemon).
* **Rows B1–B5b all loud and correctly named**: unset→`rs`; `legacy`→`legacy`; `banana`, `""`,
  `" legacy "`, `Legacy` each throw naming variable and value. Strict, no trimming, no case
  folding — consistent with `expected exactly "rs" or "legacy"`.
* **Rows C1, C2, C4, C5, C6 pass** on the Rust side, each naming the source (`--addr`,
  `PIJ_RS_ADDR`, `--state-dir`, `PIJ_RS_STATE_DIR`) and the offending value, and **exiting 1** —
  checked without a pipe, because `head` in a pipeline masks the real status.
* **R7-1 is fixed**: `seats()` is now
  `(await this.get<FederatedRoster>("/v1/seats")).seats`, and the TS `FederatedRoster` mirrors
  `crates/daemon/src/http/types.rs:143-148` rather than being re-derived from a live response.
* **Resolution moved to the binary edge.** `default_state_dir()` no longer reads the
  environment; precedence is resolved once in `run()`. That is why C3 could be fixed at all,
  and it is the right shape.
* **The transcripts carry authority observations**, including the rs authority shown
  *simultaneously empty* during the legacy leg. That is the correct discriminator and it is the
  standard I said I would enforce.
* **Cross-generation `harness` encoding — checked, not a finding.** The transcripts show
  `harness:"omp"` on rs and `harness:"pi"` + `runtimeBin:"omp"` on legacy. That looks like a
  seam and is not: `rust-runtime.ts:240` claims `harness: input.runtimeBin` outbound, and
  `:263-267` translates back, collapsing to `pi` unless claude/copilot/codex. Two spellings of
  one fact with a translation between them.
* **`--bind` requires `IP:port` while `--addr` accepts `host:port`.** Deliberate and defensible
  (a listener binds an interface, a client may resolve a name); not raised, but it belongs in
  the control table so nobody reports it as a bug later.

---

## Verdict

**FIX_REQUIRED** — FIX-1 and FIX-2 are the substantive pair: this commit correctly removed the
silent legacy fallback and, in doing so, made a pre-existing runtime gap load-bearing on OMP
and left the recovery instruction unwritten. FIX-3 is the packet's own loud-error rule landing
in one half. FIX-4 is the missing deliverable.

The core of the unit is right, and the two traps I pre-registered before seeing the code —
forceback consulted inside the refused branch, and explicit-flag-equals-default losing to env —
are both avoided by construction rather than by luck.

**Rig used** (all throwaway; nothing listening on `7461`, no `~/.pij-rs`, so no production rs
daemon exists on this machine): `pij-rs` on `127.0.0.1:17461`, state `/tmp/pij-w7-crane-state`,
legacy homes seeded and empty, scratch worktree `/tmp/pij-w7-crane-base`. Tree restored after
every probe.
