# Live statusline evidence

**Branch**: `129-statusline-generation-badge`  
**Client versions**: Claude Code `2.1.258`; omp `18.0.3`  
**Safety boundary**: after the prime ruling in `ruling-129-statusline-incident.md`, all proof used `/tmp/p129-statusline-proof/`; no further writes were made to `~/.claude`, `~/.claude-alt`, or `~/.pij-rs`.

## Captured real Claude input and segment parity

A hand-started Claude used a temp `--settings` file whose statusline command was a temp `tee` wrapper around the branch script. After one real turn, the captured input hashes were:

```text
20b5370b1d24bd049cdfef87a1e245e696ecc2d2165a55e8631d88a41c63eca9  sl-rs.json
393faa8c466de6c1a5657c14b15aca089143867cc62cc5b760b5497a48c085e8  sl-legacy.json
```

The JSON includes the real model shape `{"id":"claude-opus-5[1m]","display_name":"Opus 5 (1M context)"}`, effort, workspace, context-window, and five-hour rate-limit fields.

The captured rs JSON was piped into both the 2026-09-01 script and the branch script. Removing only the pij segment yielded byte-identical output (`non_pij_byte_equal: true`):

```text
old: 5% fs3-statusline-generation-badge ⎇ 129-statusline-generation-badge • Opus 5 (1M context) • high • 50k/1.0M • 28% ↻16:10
new: 5% fs3-statusline-generation-badge ⎇ 129-statusline-generation-badge rs ⛓ pij-still-weasel • Opus 5 (1M context) • high • 50k/1.0M • 28% ↻16:10
```

The branch script emits ANSI `33` for `rs`, ANSI `2` for `legacy`, and retains ANSI `34` for the chain/id segment.

## AC1 — rs wins when both sources answer

A real hand-started Claude in tmux (`%2912`) loaded only the temp settings and branch script. The temp PATH exposed both a successful rs identity response and a legacy responder; the legacy responder's marker file remained absent, proving it was not invoked after rs answered.

Full footer capture:

```text
5% fs3-statusline-generation-badge ⎇ 129-statusline-generation-badge rs ⛓ pij-rs-fixture • Opus 5 (1M context) • high • 50k/1.0M • 33% ↻16:10 /rc
```

A production dual-present read made before the operator-config rollback independently showed the mapped pair `pij-fierce-xoxarle` → `pij-still-weasel` on real Claude pane `%2081`; its full footer selected the rs id and retained the model:

```text
50% pij ⎇ main rs ⛓ pij-still-weasel • Fable 5.1 • medium • 500k/1.0M • 23% ↻16:10 /rc
```

## AC2 — legacy fallback and unregistered silence

A real hand-started Claude in tmux (`%2910`) loaded only a temp settings file. Its temp PATH made rs return a miss and legacy return `pij-legacy-fixture`.

Full footer capture:

```text
5% fs3-statusline-generation-badge ⎇ 129-statusline-generation-badge legacy ⛓ pij-legacy-fixture • Opus 5 (1M context) • high • 50k/1.0M • 32% ↻16:10 /rc
```

A separate real hand-started Claude (`%2896`) used the same captured-JSON wrapper with no hook and no identity fakes. `pij-rs whoami --pane %2896` refused with `no live seat in the rs store owns pane`; its full footer contained every non-pij segment and no generation/id segment:

```text
5% fs3-statusline-generation-badge ⎇ 129-statusline-generation-badge • Opus 5 (1M context) • high • 50k/1.0M • 28% ↻16:10 /rc
```

## AC3 — real omp footer

A hand-started real omp loaded only this worktree extension:

```text
omp --no-extensions -e .pi/extensions/pij/index.ts --auto-approve
```

Full footer/status capture from pane `%2877`:

```text
pij: detected Rust daemon v1 at 127.0.0.1:7461; registered pij-fun-pheasant
◫ 6.8%/400K ⟲ · rs·pij-fun-pheasant · ⬢ GPT-5.6 Sol Fast (Internal only) · ◒ high · ⑂ 129-statusline-generation-badge *5 ?1 · (sub)
rs pij-fun-pheasant
```

The native segment carries `rs·<id>`; the independent keyed row carries the yellow rs tag in the ANSI capture.

## AC4 — warm timing against the old tsx path

Prime ruled the target as median of 10 warm runs ≤100 ms and at least 10× faster than the old tsx path, with raw values and host load recorded. Both commands consumed the same captured real JSON. The rs run queried production pane `%2081`; the old run forced the legacy tsx CLI with an existing legacy id.

```text
load averages: 154.97 85.95 70.07
new rs ms: 89.15, 212.99, 99.03, 66.32, 126.91, 68.78, 95.05, 73.82, 227.45, 88.97
new median: 92.10 ms
old tsx ms: 1337.34, 3359.70, 2184.44, 2337.04, 2915.99, 5023.98, 3042.62, 1343.85, 3289.93, 2213.90
old median: 2626.52 ms
speedup: 28.52×
```

Verdict: median 92.10 ms ≤100 ms and 28.52× faster than the old path.

## AC5 — installer and regression proof

```text
cargo test -p pij-harnesses statusline_  # 4 passed
cargo test -p pij-harnesses -p pij-cli   # 137 passed, 2 ignored
npx vitest run .pi/extensions/pij/core/session-name.test.ts  # 8 passed
just typecheck  # pass
shellcheck -s sh harness/scripts/claude-statusline-pij.sh  # pass
```

The Rust tests cover additive settings edits, settings and prior-script backups, idempotence, malformed-settings refusal, rs-first short-circuiting, legacy fallback, and preservation of model/effort/context/rate segments from a real-shape payload.

Final `harness checks` ran every sensor. `local-paths`, `typecheck`, `lint`, `windows-compat`, `smoke`, `pkg-audit`, and `snapshots` passed; only the aggregate `test` sensor failed. Prime ruled these two persistent main failures as named baseline exclusions: `harness/scripts/npm-resolution-policy.integration.test.ts` replay status `1` instead of `0`, and `.pi/extensions/pij/core/worktree.test.ts` cleanup `ENOTEMPTY`.

The suite excluding only those two files passed 4,637 tests and hit one unrelated 10-second `beforeEach` timeout in `skills/flow-pair/test/cli-observe.test.ts` under the recorded triple-digit host load. Immediate focused rerun of that file passed 3/3 in 2.80 seconds. The earlier three load-sensitive `caller-truth spawn parent` cases likewise passed 5/5 on focused rerun. No baseline or load-sensitive test was edited.

## Incident and regression

The intermediate script installed before the prime stop ruling lost the model because the JSON-to-shell jq program at `harness/scripts/claude-statusline-pij.sh:21-32` contained escaped string literals inside a shell single-quoted jq program. jq returned no assignments; `PARSED` was empty and `MODEL` fell through to the `?` default at line 35. Prime restored the operator files from the 2026-09-01 backups; the failed attempt remains read-only at the path named in the ruling.

The corrected parser is at `harness/scripts/claude-statusline-pij.sh:21-35`. The real-shape model and rs-miss/legacy-preservation regressions are at `crates/harnesses/src/claude_settings.rs:1605-1656`.
