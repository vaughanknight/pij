# Reviewer round 3 — u-cutover-controls · **APPROVE**

Reviewer `pij-central-crane`. Head reviewed: **`90e49524`** *fix(rust): harden cutover refusal
paths* on `s108/w7-cutover`. Coder `pij-mere-blackbird`.

Every probe below ran against the **extracted commit** in my own detached worktree
(`/tmp/pij-w7-crane-base`), never against the coder's live tree — the discipline round 2 forced
after my own near-miss.

## Round-1 findings — all four closed, each by its own probe

| # | probe at `90e49524` | result |
|---|---|---|
| FIX-1 | `detectDaemonGeneration({addr:"127.0.0.1:17999"},"rs")` under **Bun** | `class: PijNoDaemonError`, `code: PIJ_NO_DAEMON` ✅ |
| FIX-2 | the message that refusal carries | *"…Start pij-rs there or set `PIJ_RS_ADDR`; **set `PIJ_DAEMON_GENERATION=legacy` to use the legacy TS daemon for this seat**. The state directory came from…"* ✅ |
| FIX-3 | `PIJ_RS_STATE_DIR="  " pij-rs --json list` | `configuration: PIJ_RS_STATE_DIR has malformed value "  ": value must not be empty`, exit 1 ✅ |
| FIX-3 (TS) | `daemonLocation({PIJ_RS_STATE_DIR:"  "})` | throws, same wording ✅ |
| FIX-4 | `done-u-cutover-controls.md` | present; control table corrected; negative case now names host **and** runtime ✅ |

The matcher now reads `record.code === "ECONNREFUSED" || record.code === "ConnectionRefused"`
with a comment naming which runtime produces which. Both halves landed together.

**Round 2's finding is closed too**: the coder's working tree is clean (`git status --short`
empty), and the fixes arrived in a commit typed for what it does — `fix(rust): harden cutover
refusal paths` — not buried in a docs commit. The rule from round 0 is holding.

## The mutation witness — re-run by me, not read

The receipt claims dropping the Bun arm yields 1 red / 7 green. I applied the mutation myself
with an anchored edit that asserts its match (COMMON § 1.7), in my own worktree:

```
mutation applied: dropped the Bun ConnectionRefused arm
260:  if (record.code === "ECONNREFUSED") return true;

 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
AssertionError: expected Error: Unable to connect. Is the computer… { code: '…' }
  to be an instance of PijNoDaemonError
  ❯ daemon-http.test.ts:125  "fails loudly instead of falling back when selected Rust is unavailable in bun"
```

Exactly the claimed 1/7, and the failing case is the Bun one. **Restored immediately**;
`git status --short` empty afterwards and the unmutated suite returns `8 passed (8)`.

This also **corrects a suspicion of my own**, which is why running it mattered: I expected
`refused(runtime)` at `daemon-http.test.ts:31` to be gated on the *process* runtime, which would
have made the Bun branch unexercised under vitest/Node. It is an explicit
`runtime: "node" | "bun"` **parameter**, so both shapes are asserted regardless of what the
suite runs on. The witness activates the mechanism it mutates (E-027) — I was wrong and the
test is right.

## Gate — pristine target dir

```
FRESH GATE HEAD: 90e49524  TARGET wiped and recreated
  toolchain PASS   lock PASS   fmt PASS   clippy PASS   test PASS   arch PASS  9 crates, 0 violations
pij-gate: all stages green
```

`rm -rf` on the target dir, `CARGO_TARGET_DIR` unset then repointed at the empty path, cold
build — per the shared-cache withdrawal. `git status --short` empty after the run.

## Fence

Six files `fac07ada..90e49524`: the four fix sites plus the receipt and its gate transcript.
Nothing outside the packet's fence; none of the five composer-owned paths; no `crates/tmux`,
`crates/store`, sidecars paths, `Cargo.lock`, or canonical `.pi/**`.

## Verified clean — the full list, re-run at this head

* **A1**, the falsifier I pre-registered before any code existed: `PIJ_DAEMON_GENERATION=legacy`
  returns `legacy` while a real pij-rs answers on `127.0.0.1:17461`. **A2** returns `rust`.
* **B3/B4**: `banana` and `""` each throw naming the variable and the quoted value.
* **C1** env honoured · **C3** an explicit `--addr` *equal to the default string* still beats a
  live env pointing elsewhere · **C4** malformed env addr loud · **C6/C6b** empty and
  whitespace both loud, exit 1.
* **C7**, run at the previous head and unaffected here: `PIJ_RS_BIND` honoured (17701),
  `--bind` beats it (17703), malformed env / malformed flag / empty env each loud with exit 1.
  At this head `PIJ_RS_BIND="  "` is also refused by name — the trim fix reaches bind too.
* **R7-1** stays closed: `seats()` decodes `FederatedRoster` mirrored from
  `crates/daemon/src/http/types.rs:143-148`.
* **Receipt claims check out**: control-table rows now say *"Empty or whitespace-only values are
  named errors"*, which is what the binary does; the summary bullet that overclaimed in round 2
  is now true rather than narrowed, because the code moved to meet it; the negative case is
  labelled `Host: …/omp (Bun runtime)` and shows the recovery clause.
* **Cross-generation `harness` encoding** — checked again, still not a finding: translation at
  `rust-runtime.ts:240` and `:263-267`.
* **Non-interference**: my throwaway daemons logged *"leaving foreign tap on pane %1566: marker
  …/.pij-rs-dev/… does not match expected …"* — they declined to seize a pane tap owned by
  another instance, so the probes disturbed no other seat.

## Verdict

**APPROVE.**

The unit ships the three controls with the resolution order right in both languages, loud
named refusals on every malformed input I could construct, and a forceback that bypasses a
reachable Rust daemon rather than depending on it being down. The two traps I pre-registered
before seeing a line of the implementation — a forceback consulted inside the refused-connection
branch, and an explicit flag equal to the default losing to the environment — were avoided by
construction, not by luck.

What earned the approval as much as the code: the round-1 fixes were re-verified by re-running
each finding's own probe, the mutation witness failed for the intended reason when I broke it,
and the receipt was corrected where it had overclaimed rather than defended.

**Rig, all throwaway**: `pij-rs` on `127.0.0.1:17461` with `/tmp/pij-w7-crane-state`, legacy
homes seeded and empty, detached worktree `/tmp/pij-w7-crane-base`, target dir
`/tmp/pij-w7-crane-fresh-target`. Nothing listened on `7461` and `~/.pij-rs` never existed, so
no production rs daemon or store was contacted at any point in three rounds. The coder's
worktree was never written to and its HEAD never moved.
