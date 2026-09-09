# Review: plan 141 — accept a replaced Copilot executable on Linux (issue #397)

Reviewer: pij-principal-dragon. Branch `141-copilot-replaced-executable` @ `efd95d2f` vs main `7e9bf2b1`.
Line citations are the branch tree. Every mutation probe ran in a throwaway detached worktree
(`git worktree add --detach /tmp/141-probe efd95d2f`); the shared worktree and the production
daemon (127.0.0.1:7461) were never mutated.

## Verdict: APPROVE-WITH-FIXES

The control surface is intact. Normalization happens at observation only, once per side; no matcher
grew a second opinion; every enumerated forgery is still refused, proven by live `/proc` tests; the
terminal banner no longer promises a retry it will not perform. Three independent mutation probes
confirm the new behaviour is load-bearing, not decorative.

The two fixes are record-grade, not control-grade: the shipped banner contract no longer matches
plan.md's AC4 text, and the only record of the approved amendment is an **untracked** file.

## Mutation proofs — the behaviour is load-bearing

Baseline first, restore after, in `/tmp/141-probe` only.

| # | mutation | witness | result |
|---|---|---|---|
| 1 | `registration.rs:1173` → `let executable_replaced = false;` (normalization removed) | `registration::tests::replaced_executable_accepts_only_the_actual_copilot_host` | **RED**, exit 101 |
| 2 | `store.mjs:1099-1100` deleted (advice split reverted) | 3 reporter tests in `store.test.mjs` | **RED**, exit 1 |
| 3 | `extension.mjs:35` → raw `readlink` (extension normalization removed) | `Linux replaced host reaches native registration and message acknowledgement` | **RED**, exit 1 |

Probe 1 (Docker Linux/arm64, `rust:1.98.0`, container-local `CARGO_TARGET_DIR`):

```
docker run --rm --platform linux/arm64 -v /tmp/141-probe:/w -w /w -v pij141target:/t \
  -e CARGO_TARGET_DIR=/t rust:1.98.0 /usr/local/cargo/bin/cargo test -p pij-daemon --lib
```

```text
thread 'registration::tests::replaced_executable_accepts_only_the_actual_copilot_host' panicked at
crates/daemon/src/registration.rs:1695:13:
assertion `left == right` failed: copilot, argv0=copilot
  left: false
 right: true
test result: FAILED. 366 passed; 1 failed
```

This is the same failure shape report.md cites as its pre-fix RED (there at `:1664`), so the
report's RED claim is corroborated by an independent route even though the pre-fix tree itself was
not re-checked out.

Probe 2:

```
node --test .copilot/extensions/pij/store.test.mjs
✖ terminal registration failure replaces retry advice without exposing raw diagnostics
✖ terminal registration failure without safe identity detail never projects an arbitrary error
✖ terminal banner projects only structured host refusal and redacts the daemon key
ℹ pass 135  ℹ fail 3
```

Probe 3:

```
docker run --rm --platform linux/arm64 -v /tmp/141-probe:/w -w /w node:24.13.0 \
  node --test --test-name-pattern='Linux replaced host' .copilot/extensions/pij/extension.test.mjs
✖ Linux replaced host reaches native registration and message acknowledgement (5015.7ms)
```

## AC → the test that goes RED if the behaviour is removed

| AC | witness | grade |
|---|---|---|
| AC1 (Rust helper) | `registration.rs:1645` `kernel_executable_normalization_strips_only_the_exact_trailing_marker` — 4 cases incl. `"/a/copilot (deleted) "` and `"(deleted)"` unchanged | unit |
| AC1 (JS helper) | `identity.test.mjs:62` — same cases plus `C:\Tools\copilot.exe` and `/opt/copilot.exe` unchanged | unit |
| AC1 (Rust call site) | `registration.rs:1661` (probe 1) | live `/proc` |
| AC1 (JS call site) | `extension.test.mjs:359` (probe 3) | real subprocess, stubbed `readlink` |
| AC2 | `registration.rs:1661` — copies `/bin/sh`, `arg0`, waits for `ready`, **unlinks**, observes | live `/proc`, real unlink |
| AC3 | `identity.test.mjs:75` (marker flips between observations → still resolves), `:91` (lookalike refused), `:107-124` (ppid and proc_start incarnation refusals still fire) | unit |
| AC4 (banner) | `store.test.mjs:450,473,484` (probe 2); `extension.test.mjs` terminal-bootstrap regression | unit + integration |
| AC4 (daemon text) | `registration.rs:1704` `native_host_refusal_names_observed_basename_and_replacement`, both `replaced` values | unit |
| AC5 | docs only — no test, correctly so | prose |

AC2's test carries its own witness assertion: `registration.rs:1700` asserts `executable_replaced`
in **all three** tuples, so a run where the unlink silently failed to produce a ` (deleted)` link
fails rather than passing vacuously. That is the right shape — the witness cannot never-fail.

## Packet question 2 — one strip site per side

Yes. `grep -rn "deleted)" --include=*.rs --include=*.mjs --include=*.ts crates .copilot .pi`
returns exactly two production sites:

- Rust: `registration.rs:1147-1154` `normalize_kernel_exe`, called once at `registration.rs:1173`
  inside `read_native_process` (Linux cfg). `parse_native_process` (macOS, `:1318`) hardcodes
  `executable_replaced: false` and strips nothing.
- JS: `store.mjs:33-38` `normalizeExecutable`, called once at `extension.mjs:35` inside
  `inspectProcess` (Linux branch).

No matcher grew a second opinion. `is_copilot_host` (`registration.rs:1119-1136`) and the extension
regex (`store.mjs:1052`) are byte-identical to main.

## Packet question 3 — does the change widen trust? No.

`executable_replaced` is never an input to a decision. Its only non-test read in the whole crate is
the diagnostic string at `registration.rs:391` (`grep -n executable_replaced` → 391, 1044, 1173,
1199, 1318, then tests only). Normalization can therefore only change *which basename is matched*,
and the basename rule is unchanged.

| forgery | still refused? | citation |
|---|---|---|
| forged argv0 — real `copilot` exe, argv0 `sh`, unlinked | yes | `registration.rs:1670` tuple `("copilot","sh",false)`, live `/proc` |
| lookalike — `copilot-evil` exe, argv0 `copilot`, unlinked | yes | `registration.rs:1669`; fixture `registration.rs:1572`; JS side `identity.test.mjs:91` |
| `node …/npm-loader.js` host | yes | `registration.rs:1568,1575` — `is_copilot_host` `Some("node")` still requires `argv[1]` ending `@github/copilot/index.js` (`:1128-1130`) |
| the extension child itself | yes | `registration.rs:1569,1576` (`node …/extension.mjs`), fixture `/opt/pij/pij` at `:2860` |
| double marker `…/copilot (deleted) (deleted)` | yes — one strip leaves basename `copilot (deleted)` | `registration.rs:1149-1152` strips exactly one; conservative by construction |
| trailing space `…/copilot (deleted) ` | yes — not stripped | `registration.rs:1651`, `identity.test.mjs:66` |

Residual, and it is not a widening — see finding F2.

## Packet question 4 — incarnation check cannot compare raw to normalized

No. Both sides of the comparison come from the same injected `inspectProcess`
(`store.mjs:1049` for `host`, `store.mjs:1061` for `confirmed`), and `extension.mjs:33-36`
normalizes unconditionally on Linux before returning. The compared fields are
`proc_start`, `ppid`, `command` (`store.mjs:1063-1065`); `replaced` is deliberately **excluded**,
which is correct — an upgrade flipping `replaced` mid-observation is the legitimate case and must
not refuse. `identity.test.mjs:75-89` encodes exactly the marker-flip acceptance and
`identity.test.mjs:107-124` proves a real `ppid`/`proc_start` change still refuses.

## Packet question 5 — no path still promises a retry it will not perform

`grep -rn "retrying" .copilot/extensions/pij/*.mjs` → two production hits:

- `store.mjs:1101` "retrying when available" — reachable only for `registration-wait` /
  `reconnecting`, which genuinely do retry (`extension.mjs:150-159`, exponential to `MAX_RETRY_MS`).
  Honest.
- `store.mjs:271` "retrying with refreshed credentials" — a retryable `NativeError` **message**;
  its new `safeDiagnostic` is the bland `"Pij transport unavailable"` (`store.mjs:273`), so this
  string can never reach a terminal banner.

Terminal paths, both checked:

- outer `catch` (`extension.mjs:164-169`) → `extension-unavailable` with `safeDiagnostic` →
  `store.mjs:1099-1100` "no retry is scheduled — restart the Copilot CLI (/restart or relaunch)".
- top-level `.catch` (`extension.mjs:177-182`) → `extension-unavailable` with **no**
  `safeDiagnostic` → the `?? "native initialization failed"` fallback, same no-retry advice.
  Correct, and I checked it specifically because the packet named it.
- the no-session branch (`extension.mjs:171`) prints "no fallback transport is enabled" — no retry
  promise.

The suppression relaxation at `store.mjs:1092` is what makes the terminal notice survive a prior
`registration-wait`; probe 2's third failure (`1 !== 2`) is its witness.

The AC4a projection is fail-closed. The Rust side formats the basename with `{:?}`
(`registration.rs:390`), so any basename containing `"` or `\` is emitted escaped, and the
extension's anchored regex excludes `"` `\` `/` CR LF (`store.mjs:304`) — an escaped basename fails
the match and the banner degrades to `Pij HTTP <status>` rather than projecting attacker text.
`envelope.meta.replaceAll(key, …)` at `store.mjs:313` cannot degenerate: an empty key already threw
at `store.mjs:249`. The `native Copilot registration refused:` prefix the regex assumes is pinned
end-to-end by `http/native_tests.rs:444`.

## Findings

Ranked: nothing in the "degrades a control" band. Both entries obscure information.

### F1 — plan.md AC4 no longer describes what shipped, and the approving amendment is untracked

`docs/plans/141-copilot-replaced-executable/plan.md:16` specifies the banner projects
`<diagnostic>`. What shipped projects `event.safeDiagnostic` under a narrow allow-list
(`store.mjs:297-314`, `store.mjs:1100`), which is a *stronger* rule and a deliberate scope change.
Its only record is `report.md:12` ("AC4a amendment, approved by pij-minor-unicorn") — and that file
is **untracked on the branch**:

```
$ git status --short
?? docs/plans/141-copilot-replaced-executable/report.md
```

So the branch ships a control tightening whose rationale, approval, and evidence exist nowhere in
its own history. Fix: amend plan.md AC4 to state the safe-projection rule and commit report.md (or
fold its receipt into plan.md) before ship. Cheap, and it is the difference between a reviewable
change and one that has to be re-derived.

### F2 — a binary literally *named* `copilot (deleted)` is normalized, and reports `replaced=true`

`/proc/<pid>/exe` renders an unlinked `…/copilot` and a live file literally named
`…/copilot (deleted)` identically; the kernel offers no disambiguator at the observation point.
`registration.rs:1649` encodes `("/a/copilot (deleted)", "/a/copilot", true)` without a comment
saying that collision is knowingly accepted.

**Control impact: none.** Basename `copilot` with argv0 `copilot` is already the accept rule, so an
attacker who can drop a file gains nothing by naming it `copilot (deleted)` rather than `copilot`.
The only wrong output is the `replaced` fact — i.e. the refusal banner at `registration.rs:390-392`
and the docs' "replaced executable" framing can be wrong about *why*. Fix: one comment at
`registration.rs:1147` naming the ambiguity as accepted-and-bounded, and a sentence in
`docs/how/copilot-native-extension.md:57-71`.

### F3 (note, no action) — the extension's `replaced` fact has no consumer

`extension.mjs:35` produces `replaced` and nothing reads it: `resolveNativeHost` returns only
`pid`/`proc_start`/`pane` (`store.mjs:1068-1072`) and correctly excludes it from the incarnation
comparison. AC1 mandates the field, so this is compliance, not waste — recorded so a later reader
does not "clean it up" and quietly remove the observation's honesty.

## Packet question 6 — report honesty

Independently re-run, all in `/tmp/141-probe` @ `efd95d2f`:

| report claim | my result |
|---|---|
| Docker `cargo test -p pij-daemon` (unfiltered) exit 0, 367 lib tests | **reproduced**, 14 further repeats green (6 serial + 8 concurrent), lib `367 passed; 0 failed` plus all integration targets |
| Docker node contracts green | **reproduced**, `172 pass / 0 fail / 0 skipped` across `extension`+`identity`+`store` .mjs |
| macOS `just copilot-native-test` green with 3 Linux-only skips | **reproduced**, `169 pass / 0 fail / 3 skipped` |
| `cargo fmt --all -- --check` clean | **reproduced**, exit 0 |
| Biome clean on changed JS | **reproduced**, exit 0 |
| pre-fix Docker RED predates the fix | **honestly self-flagged** at `report.md:27` (the field assertion was added afterwards so the pre-fix test would compile). Corroborated indirectly by probe 1's identical panic shape. I did not check out the pre-fix tree; that specific run remains the coder's word. |
| `harness checks` aggregate is **not** green (`windows-compat` → `cli.inbox.integration.test.ts` exit 4) | **not re-run by me.** Structurally unrelated: nothing in the diff touches `.pi/extensions/pij/`. The report does not claim the gate is green (`report.md:202`), which is the honest posture — but the gate is still owed at ship. |
| CI ubuntu `rust` job | not run; requires the prime's authorized push. Correctly deferred. |
| live Linux `extensions_reload` receipt | correctly declared unavailable (`report.md:14`); the Linux extension test stubs `readlink` via a loader hook (`extension.test.mjs:67-72`) with **no production env hook** (`PIJ_NATIVE_TEST_EXECUTABLE` appears only in the test file), so nothing test-only leaks into the shipped path |

One internal inconsistency, already explained by the report itself: the Linux node GREEN block cites
`171 tests` (`report.md:118`) but the tree now has 172 because a terminal-bootstrap regression was
added afterwards (`report.md:128`) and only re-run filtered. I ran the full three-file set on Linux:
172/172. No gap remains.

A methodological note for whoever repeats this: I briefly recorded the AC2 test as flaky after two
failures on a supposedly-restored tree. It was my probe tooling, not the code — `sed -i.bak` + `mv`
restores the file's **original mtime**, so cargo skipped the rebuild and I was running the mutated
binary. Reproduced deterministically (restore content, `touch -t` the old mtime → still RED, no
`Compiling pij-daemon` line). 23 green runs, 0 unexplained failures. Restore probe files with
`git checkout --`, never `mv` from a `.bak`.

## Scope

`git diff --stat 7e9bf2b1..efd95d2f` touches 11 files; production surface is
`registration.rs`, `store.mjs`, `extension.mjs` only. No legacy TypeScript edit, no daemon restart,
no push, no global install. Commit `efd95d2f` carries C11 trailers (`Pij-Seat: pij-excited-unicorn`,
`Pij-Prime: pij-minor-unicorn`, `Pij-Plan: 141-copilot-replaced-executable`).
`docs/how/pij-rs-api.md` is correctly unchanged — `grep -rn "not an actual Copilot host executable"`
shows it pins no such string.
