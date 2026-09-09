# Review — plan 144, extension build identity per seat

Reviewer: pij-prime-mongo. Reviewed `7e4d10bc` against `5135a0a1`. Mutation probes ran in a throwaway
worktree (`git worktree add /tmp/pij144-probe 7e4d10bc --detach`, `CARGO_TARGET_DIR=/tmp/pij144-target`,
removed after); the branch worktree was never mutated and the production daemon was never contacted.

## Verdict: APPROVE-WITH-FIXES

The behaviour is right and it is real: the live evidence, the daemon round-trip and two independent
mutation probes all hold. What is missing is a **permanent control on the producer**. The extension is
the only thing that puts `extension_build` on the wire, and deleting the two lines that do it leaves the
entire TypeScript suite and `tsc` green — while the daemon then reports `null`, which the plan and the
docs define as the *legitimate* pre-144 state. A regression here does not look like a bug; it looks like
an old extension. Fix F1 before ship. F2–F5 are judgment/nit and may ship as-is if you disagree.

## Findings

### F1 — degrades a control: the register-wire producer has no test; its failure mode is disguised as the documented null

`.pi/extensions/pij/adapters/rust-runtime.ts:872-873` is the single seam that puts build identity on the
wire (`registrationFor`, correctly used by both the boot registration at `:181` and the continuity
re-registration at `:204`). Nothing asserts it.

```
$ cd /tmp/pij144-probe            # 7e4d10bc, lines 872-873 deleted
$ ./node_modules/.bin/tsc --noEmit -p tsconfig.json     → exit 0
$ ./node_modules/.bin/vitest run .pi/extensions/pij/
   Test Files  174 passed | 3 skipped (177)
        Tests  4335 passed | 31 skipped (4366)
```

`Registration.extension_build` is optional (`core/daemon-wire.ts:39-40`), so the drop is not even a type
error. AC5's live proof is a one-shot; after it, the only thing standing between this feature and silent
death is nobody touching that object literal.

**Fix (one line, in a test that already does exactly this):**
`.pi/extensions/pij/adapters/rust-runtime.test.ts:997-998` already asserts
`registrations.every((claim) => claim.pane === "%42")` and `claim.harness_session === "native-session"`.
Add `claim.extension_build === "0123456789"` (and the path) in the same place; that test's boot input
already supplies both fields (`:976`).

### F2 — degrades a control (lesser): AC3's human `whoami` line is unproven on both runtimes

Shim: `.pi/extensions/pij/core/generation-routing.ts:68`. Native: `crates/cli/src/main.rs:1713-1725`.

```
$ # shim: line 68 deleted
$ ./node_modules/.bin/vitest run .pi/extensions/pij/
   Test Files  174 passed | 3 skipped (177)   Tests  4335 passed (4366)
$ grep -rn "render_whoami" crates/
crates/cli/src/main.rs:854   (call site)
crates/cli/src/main.rs:1713  (definition)     # no test names it
```

The whoami surface is proven only by `evidence/shim-whoami.txt` and `evidence/native-whoami.txt`, both
one-shot captures. By contrast the footer IS controlled — `core/session-name.test.ts` ("keeps the dirty
extension build visible…") and the two `index.test.ts` regexes — which is why the footer half of AC3 is
credible and this half is not. A rendering assertion on each side closes it.

Same class, smaller: the adopt path (`crates/daemon/src/http/identity.rs:586-587`) and the CLI's
`--extension-build` flags (`crates/cli/src/main.rs:108-112`, `:162-166`) are plumbed but exercised by no
test — the round-trip test only posts `/v1/register`. Today nothing calls them (the extension posts HTTP
directly), so this is dead-surface risk, not live risk.

### F3 — obscures information: `StateCard` breaks its own camelCase contract for these two fields

`crates/daemon/src/http/types.rs:396` declares `#[serde(rename_all = "camelCase")]` and the type's doc
comment states its whole reason for existing is that "a consumer that already parses either TS surface
parses this one unchanged". Lines `:424-430` override it with explicit `rename = "extension_build"` /
`"extension_path"`. Confirmed in the coder's own capture — `evidence/omp-state.json` emits
`"extension_build"` between `"harness"` and `"role"`, next to `procStart`, `boundModel`, `semanticState`,
`tombstonedAt`.

It is defensible (one wire name on every surface, exactly as the plan spells it) and it is deliberate, not
an accident — but the override carries no comment saying so, and `docs/how/pij-rs-api.md:171` says only
"whoami, seats and state responses" without naming the casing exception. Either add the one-line
justification at the `rename` or name the exception in the doc row.

### F4 — nit: the shim's human whoami column is misaligned

`generation-routing.ts:64-68` pads `folder:`, `state:`, `role:` to 13 columns; `extension: ` is 11, so its
value does not line up. Visible in the delivered evidence, `evidence/shim-whoami.txt:5`.

### F5 — nit / latent: two synchronous `git` spawns on the extension load path with no timeout

`index.ts:48` computes identity at module scope (correct: this is what makes "compute once, cache"
structural rather than a promise), which puts `execFileSync` at `extension-build.ts:18` and `:23` on the
critical path of every pi/omp session start, with `timeout` unset — i.e. unbounded.

Measured on the main checkout, warm: `rev-parse` 0.01–0.02s, `status --porcelain -- <dir>` 0.02–0.03s ×3
runs. Not a present hazard. But the `catch` at `:30` already degrades gracefully to the content hash, so
passing `timeout: 2000` costs one property and converts "a hung git hangs session start" into "we hash the
bytes instead". Cheap; take it or refuse it explicitly.

## Verdict standard — item by item

**1. Per-AC control, with two proven by reversion.**

| claim | test that goes RED | proof |
|---|---|---|
| AC1 clean sha | `extension-build.test.ts` "reports the ten-character HEAD for a clean extension" | passes at HEAD |
| **AC1 dirty marker** | same file, 3 × "marks the extension dirty for %s extension changes" + "resolves symlinks…" | **PROVEN**: dropped `${dirty ? "+dirty" : ""}` at `extension-build.ts:28` → `Tests 4 failed \| 9 passed (13)`; restored → 13 passed |
| AC1 dirty **scope** | "does not mark the extension dirty for unrelated repository changes" | **PROVEN**: dropped the `-- <path>` pathspec at `:25` → `1 failed \| 12 passed` |
| AC1 hash fallback | 5 tests: determinism, per-file content sensitivity, path inclusion, glob scope, length framing | pass |
| AC1 compute-once | none — guaranteed by construction (`index.ts:48` module-scope `const`), not by a test. Honest to say so. |
| **AC2 store + null read-back** | `crates/daemon/src/http/tests.rs::extension_identity_survives_sqlite_registration_readbacks_and_legacy_refresh_clears_it` | **PROVEN**: made `registration.rs:697-698` conditional (`if claim.extension_build.is_some()`) → `left: Some("hash:abcdef123456"), right: Some(Null)` at `tests.rs:2238`; restored → 1 passed |
| AC2 producer (extension → wire) | **none** — see F1 |
| AC3 footer | `session-name.test.ts:160`, `index.test.ts:383,402` | pass |
| AC3 human whoami | **none** — see F2 |
| AC3 list column | deliberately JSON-only; stated in the report, in `docs/how/pij-rs-api.md:179` and in `skills/pij/references/routes/peer.md:23`. AC3 permits this and the choice is named, not silently dropped. |

Baseline before every probe: `vitest run` 4 files / 123 tests passed; `cargo test -p pij-daemon --lib
extension_identity_survives` 1 passed. Each mutation was reverted with `git checkout --` and is not on any
branch.

**2. Cross-runtime literal seam — four literals, and they are not one definition.**

The name `extension_build` is written independently in nine places:
`extension-build.ts:7-8` (identity type, snake_cased so it spreads) → `core/daemon-wire.ts:39` (send) and
`:58` (read) → `crates/daemon/src/http/types.rs:30` (server request) → `crates/cli/src/client.rs:35` (CLI
request) → `crates/daemon/src/http/identity.rs:166` (adopt) → `crates/core/src/model.rs:270` (descriptor,
response + store) → `crates/daemon/src/http/types.rs:425` (StateCard) → `0019_….sql:2` (column).

No generator, no shared schema. **This is the repo's existing convention** — `harness_session` and
`native_extension_delivery` are the same shape — so it is not a new sin. The daemon half of the seam is
genuinely pinned end-to-end by the round-trip test (raw JSON literal → struct → SQLite → whoami/seats/state
JSON literal), which is the right way to hold four literals together. The **TS half is not pinned at all**,
which is F1: the one gap in an otherwise-covered seam is the one that matters, because it is the producer.

**3. Absent vs null.** JSON preserves the distinction correctly: pre-144 daemons omit the keys
(`evidence/production-control.json` — no `extension_build` key at all), the new daemon emits explicit
`null` (`evidence/legacy-null-control.json`), and `SeatDescriptor` uses `#[serde(default)]` without
`skip_serializing_if` (`crates/core/src/model.rs:269-274`) so null is always emitted, never dropped —
unlike `spawn_id`/`model` two rows down, which do skip. Deliberate and correct.

Every **human** reader collapses both to the same word: `unknown` in the shim (`generation-routing.ts:68`,
`?? "unknown"`) and in native (`main.rs:1721-1722`, `unwrap_or("unknown")`); `list` has no column; the
footer only ever shows the seat's own build, which is never absent. That collapse is correct — both states
mean "no build was reported", and `docs/how/pij-rs-api.md:171` documents exactly that including "Older
daemons omit these keys entirely". Machine readers keep the distinction, humans get one honest word. No
finding; the question is answered by the doc row, not by a test (the absent case needs a pre-144 daemon
and cannot be unit-tested).

**4. Frequency and load-path safety.** Once per process, at module load (`index.ts:48`) — structural, not
a discipline. Guard for missing git / non-repo is the `catch` at `extension-build.ts:30`, with the fallback
proven by 5 tests (a plain temp dir with no `.git`, which is the same `catch` arm ENOENT would take).
Missing guard: no `timeout` — F5, measured at 0.04s warm, latent only.

**5. Symlink.** `realpathSync` at `extension-build.ts:12`, before any git call, so both the repo selected
and the dirty pathspec follow the real path. Tested by "resolves symlinks before choosing the source
repository and dirty scope", which builds a symlink from a *second* repo into the first and asserts both
the source repo's sha and its `+dirty` — i.e. it would catch a resolve that picked the linking repo. This
is the production shape (`~/.omp/agent/extensions/pij` → main checkout) and the test would go RED if
`realpathSync` were dropped, since it also asserts `extension_path`. Belt and braces: Node already
realpaths `import.meta.dirname` unless `--preserve-symlinks`; the explicit call means the behaviour does
not depend on that flag.

**6. Migration.** `0019_extension_build_identity.sql` — two nullable `ALTER TABLE seats ADD COLUMN … TEXT`
plus `PRAGMA user_version = 19`; additive, no backfill, no rewrite, no default. Idempotency is the runner's
(`crates/store/src/migrate.rs`: sqlx `_sqlx_migrations` ledger is authoritative, `user_version` is a cache
reconciled at boot), which is how 0015–0018 work; the number is the next free one. `SCHEMA_VERSION` bumped
to 19 and skew stays directional (older binary over a 19 store refuses rather than limps).

Goldens: recomputed, not hand-edited —
`sha256sum` of the three changed fixtures equals `MANIFEST.toml` byte-for-byte
(`bdb5562e…`/490, `e8e1d5ee…`/749, `170ccfb4…`/34124), and the inserted fields sit in struct declaration
order in every one. The historical capture fixtures were left alone and the manifest `answer` rows were
updated to describe the new field rather than silently widened.

**Report honesty.** Verified, not taken on trust: `evidence/harness-checks.json` → nine required sensors
`pass`, `pij-commit-trailers` `warn` (the pre-existing plan-authoring commit lacks a derivable Pij-Prime) —
exactly as reported, including the warn rather than hiding it. `npm-test.txt` tail: 241 files / 5285 tests
passed. `cargo-workspace.exit`, `npm-test.exit`, `fmt.exit` all `0`. `7e4d10bc` carries all three C11
trailers. The AC5 live build `a654d9afb8+dirty` is the *plan-authoring* commit plus dirt, which is right
for a proof taken before the implementation commit existed, and the report says so rather than implying it
proved the shipped sha. The four preserved failed gate attempts and the "isolation ≠ `--offline`" lesson
are the opposite of a green that lies.

## What ships

F1 is a one-line addition to an existing assertion block. With it, every AC has a control that fails when
its behaviour is removed. Without it, the feature's producer is held up by a screenshot.
