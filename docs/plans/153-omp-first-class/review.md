# Review: plan 153 — omp is a harness, not a switch on pi

Reviewer `pij-sunny-tarsier`. Range `cf08eacd..00f04769` (plan `bddccbe4`, code `f6a0e058`, evidence
`00f04769`), diffed against the **merge-base** throughout. Independent detached worktree
`/Users/jordanknight/pi-hacking/pij-worktrees/s153-rev` at `00f04769`, deps via `worktree-deps.mjs`
(358 links). Every claim below was re-derived; nothing is taken from `report.md`.

## Verdict

**APPROVE-WITH-FIXES** — one blocking, three should-fix, one minor.

The thesis is delivered. `PI_FAMILY_BINS` and `resolvePiBin` are gone, `harness` is required with no
default at every entry point, `--bin` is demoted to an absolute executable path and actively refuses
to name a harness, and omp gets its own flag translation. I mutated all four of those properties and
each one is pinned by a test. The 370-file move is byte-clean where it claims to be. The live
receipts are real.

The blocking finding is not in the harness logic — it is in the move's blast radius. A
production-safety brake was silently disarmed by the rename and no test noticed.

| # | Severity | Location | One line |
|---|---|---|---|
| F1 | **blocking** | `harness/scripts/bounce-daemon.sh:55` | dirty-source brake now scans the symlink, not the source |
| F2 | should-fix | `.omp/extensions/pij/core/generation-routing.ts:55-59` | live agent-facing string still says `pi/omp` |
| F3 | should-fix | `crates/daemon/src/http/revive.rs:302` | retirement has a second door with no audit event |
| F4 | should-fix | `.omp/extensions/pij/core/types.ts:244-246`, `core/state.ts:281` | docs still assert the collapse the plan deletes |
| F5 | minor | `.omp/extensions/pij/core/spawn.test.ts` | deleted OMP env assertion; `PIJ_PI_BIN` is vestigial |

---

## 1. The move is pure

**354 of 354 `R100` renames are byte-identical**, verified by blob hash rather than by eye: for each
pair, `git rev-parse cf08eacd:<old>` equals `git rev-parse 00f04769:<new>`. Zero mismatches.

Sixteen renames scored below `R100`. Every one is the omp/pi split or its retirement policy; **no
unrelated behaviour changed**. One line each:

| file | delta |
|---|---|
| `core/types.ts` | `requestedHarness: HarnessKind` → `HarnessKind \| "omp"` |
| `core/spawn-expectation.ts` | same widening on the input interface |
| `core/watch-subscription.ts` | sibling import repointed `../../file-watch-notify/` → `../../../../.pi/extensions/file-watch-notify/` |
| `core/daemon/watch.ts` | same repoint ×3 |
| `core/daemon/watch.test.ts` | same repoint ×1 |
| `core/daemon/watchdog-manager.test.ts` | `harness: "pi"` added to one spawn-exemption fixture |
| `core/focus.ts` | `harness: "pi"` added at `:310` |
| `core/daemon-wire.ts` | `+retired_harnesses?: readonly Registration["harness"][]` on `HealthPayload` |
| `core/session.ts` | `SpawnOpts.harness` required; local spawn restricted to pi/omp; `requestedHarness: "pi"` → `opts.harness` |
| `core/spawn.ts` | `PI_FAMILY_BINS`/`resolvePiBin` deleted; `bin` becomes an absolute path; harness drives flag translation |
| `core/spawn.test.ts` | bin-switch cases replaced by harness cases (see F5) |
| `adapters/daemon-http.ts` | typed `GET /health` + `POST /v1/spawn` client methods |
| `adapters/rust-runtime.ts` | `spawn()` async; reads health policy; routes non-pi/omp to the daemon |
| `index.ts` | `pij_spawn` schema/description/guidelines; routes through `rustRuntime` |
| `index.test.ts` | +1 test: legacy in-process spawn refuses when it cannot enforce policy |
| `core/session.test.ts` | existing spawn calls gain explicit `harness: "pi"`; assertions unchanged |

Two of these look like planted defaults and are not:

- **`core/focus.ts:310`** adds `harness: "pi"` — but it sits inside `if (manifest.harness === "pi")`
  at `:308`, so it restates a fact the branch already established. Tautological, not a default.
- **`core/types.ts:383`** widens with `| "omp"` rather than adding omp to `HarnessKind`. That is
  deliberate and correct: `HarnessKind` is the *seat/transport* vocabulary (`types.ts:25-31`), while
  `spawn.ts:25` names the spawn-facing union `SpawnHarness = HarnessKind | "omp"`. Two vocabularies,
  both explicit.

### The symlink

```
$ ls -l .pi/extensions/pij
lrwxr-xr-x  ... .pi/extensions/pij -> ../../.omp/extensions/pij
$ git ls-tree 00f04769 .pi/extensions/
120000 blob a300771895220aff834005bd1302f57de25ef245   .pi/extensions/pij
$ git cat-file -p a300771895220aff834005bd1302f57de25ef245
../../.omp/extensions/pij
```

Mode `120000`, target **relative** — no absolute-path portability defect across worktrees or
machines. It resolves to a directory containing `index.ts`.

**The depth is preserved, and that is what makes the sibling imports safe.** `.omp/extensions/pij`
and `.pi/extensions/pij` are each exactly three components below the repo root, so
`../../../../../.pi/extensions/file-watch-notify/store.js` resolves to the same file whether the
importer is reached by its real path or through the symlink. Proven with the real loader, not by
counting:

```
$ node_modules/.bin/tsx -e '… import both paths …'
imported …/s153-rev/.omp/extensions/pij/core/watch-subscription.ts
imported …/s153-rev/.pi/extensions/pij/core/watch-subscription.ts
```

`readlink -f` from the `extension_path` an omp seat actually records
(`report.md:99`, `.../fs3-omp-first-class/.omp/extensions/pij`) resolves inside the repo to a tree
containing `index.ts`. That path is already canonical, so it is a real directory, not a link.

---

## 2. Live-machine transition

**(a) Running seats keep loading.** The global links are absolute into the main checkout's
`.pi/extensions/pij`, which after merge becomes the in-repo relative symlink. Resolution continues
through it; a running seat keeps loading until it restarts, then loads the same code by its new
real path.

**(b) No manual step is required after merge.** `harness/scripts/link-global.ts:421` sources
`join(options.pijRoot, ".pi", "extensions")`, and `enforceOmpPijOnly` (`:158`, linking at `:182`)
receives that same source root. So even after `just link`, **both** global links still point at
`<checkout>/.pi/extensions/pij` rather than directly at `.omp`. Current live state:

```
$ ls -l ~/.omp/agent/extensions/
pij -> /Users/jordanknight/pi-hacking/pij/.pi/extensions/pij
$ ls -l ~/.pi/agent/extensions/
pij -> /Users/jordanknight/pi-hacking/pij/.pi/extensions/pij
```

Both keep working untouched. **Answer: no re-link needed; no command.** Worth stating plainly
because it is the opposite of the intuition — the linker was *not* updated to the new path, and
that is precisely why the transition is safe.

**(c) Path consumers resolve.** `tsconfig.json:19` includes `.omp/extensions/**/*.ts` (`:20` keeps
`.pi/extensions/**/*.ts` for the sibling extensions). `vitest.config.ts:56` collects `.omp` tests
and `:63` **excludes** `.pi/extensions/pij/**` so the symlink cannot double-collect the same suite.
`worktree-deps.mjs` has no hardcoded extension path at all. `just self-check` → `just typecheck` +
`just test`, both of which consume those configs.

**(d) Copilot is untouched.** `git diff -M --stat cf08eacd..00f04769 -- .copilot/` → **no output**.

### F1 (blocking) — the move disarmed a production brake

`harness/scripts/bounce-daemon.sh:55`:

```sh
dirty=$(git -C "$canonical" status --porcelain -- .pi/extensions/pij package.json package-lock.json)
```

After the move that pathspec names **a symlink**, not a source tree. Git matches the single link
entry and never descends into `.omp/extensions/pij`. Measured, not reasoned:

```
$ git status --porcelain            # baseline
0
$ printf '\n// reviewer dirt probe\n' >> .omp/extensions/pij/core/spawn.ts

OLD pathspec (bounce-daemon.sh:55 as written):
    <<<empty — the brake is blind>>>
NEW pathspec (.omp/extensions/pij):
    [ M .omp/extensions/pij/core/spawn.ts]
```

Uncommitted extension source no longer blocks a production daemon bounce.

**This is a brake, not a policy — which is why it is blocking rather than interesting.** Applying
the repo's own test (`AGENTS.md`, "ask what REMOVING it does"): removing this check makes
`bounce-daemon` bounce *more* — it can only ever refuse, never permit. It is one-directional. A
weakened brake does not announce itself; it just stops firing, and the next symptom is a production
daemon running code nobody committed.

Nothing catches it: `harness/scripts/bounce-daemon.test.ts:106` fixtures only
`BOUNCE_DIRTY=" M .pi/extensions/pij/daemon.ts"`, the pre-move spelling, so the suite is green with
the brake disabled.

**Fix** — one line plus its fixture:

```sh
dirty=$(git -C "$canonical" status --porcelain -- .omp/extensions/pij .pi/extensions/pij package.json package-lock.json)
```

and add an `.omp/extensions/pij/**` dirty case to `bounce-daemon.test.ts`. Keeping the `.pi` entry
also catches someone replacing the symlink itself.

(`bounce-daemon.sh:30`, `source_root=${daemon_file%/.pi/extensions/pij/daemon.ts}`, is *correct*
today only because `link-global.ts` still emits the `.pi` spelling — see (b). It is coupled to that
choice; worth a comment, not a fix.)

I checked the rest of the tooling for the same class of miss. Every other surviving
`.pi/extensions/pij` reference is deliberate compatibility use (`harness/driver/*`,
`pane-signals-smoke.ts`, `step-on-probe.ts`, `windows-compat.ts`, `vitest.config.ts:63`) or a
comment. **F1 is the only category-(c) miss.**

---

## 3. AC1 — the harness is named, and the naming is pinned

Verified by mutation. Baseline `npx vitest run .omp/extensions/pij/index.spawn-schema.test.ts
.omp/extensions/pij/core/spawn.test.ts` → **153 passed**.

| mutant | change | result |
|---|---|---|
| **A** | `pij_spawn.harness` → `Type.Optional(… { default: "pi" })`, `params.harness ?? "pi"` | `index.spawn-schema.test.ts:17` **FAILED** — `expected true to be false` |
| **B** | `parseSpawnArgs`: missing `--harness` defaults to `"pi"` | `spawn.test.ts > requires --harness, rejects unknown` **FAILED** |
| **C** | delete the `basename(bin)` harness-selector guard | **2 FAILED** — `refuses a binary harness selector…`, `rejects an executable whose basename names a different harness` |
| **D** | delete the `Array.isArray(health.retired_harnesses)` fail-closed guard | `rust-runtime.spawn.test.ts > refuses spawning when the daemon cannot report retirement policy` **FAILED** |

Mutant A is the one the packet asked for and it lands on exactly the named test. Mutant D is mine:
the interesting failure mode of a policy check is not "does it refuse" but "what does it do when it
cannot ask", and `adapters/rust-runtime.ts:370-374` fails closed with an upgrade instruction rather
than assuming permission. `core/daemon-wire.ts:32` says so in the type: *"Absent on older daemons;
absence is not permission to launch."*

`bin` is refused as a harness selector in both directions — `--harness pi --bin omp` and
`--harness pi --bin /opt/omp` both refuse with a message naming `--harness omp`
(`spawn.test.ts:987`, `:1002`) — while `--harness omp --bin /opt/omp` is accepted. `omp` launches
`omp` with `--auto-approve --model <provider/id> --thinking <effort>` and never `--branch`
(`spawn.test.ts:78`, `:1010`).

---

## 4. AC2 — retirement policy

**Where the machine default lives: `justfile:743`, not `config.rs`.**

```
crates/core/src/config.rs:70   Empty by default; the daemon composition root reads PIJ_RETIRED_HARNESSES.
justfile:743                  (PIJ_RETIRED_HARNESSES="${PIJ_RETIRED_HARNESSES-pi}" … pij-rs daemon …)
```

**Answer to the packet's question: after merge and `just bounce-rs`, `pi` IS actually retired on
this machine, with no hand-set env.** The `${VAR-default}` form supplies `pi` when the variable is
unset. Two consequences worth stating, because both are invisible from the acceptance text:

1. The policy is attached to **the recipe, not the daemon**. A daemon restarted any other way —
   directly, by a supervisor, by an auto-restart — gets the generic empty default and retires
   nothing. Retirement is only as durable as the last `just bounce-rs`.
2. `-` rather than `:-` means `PIJ_RETIRED_HARNESSES= just bounce-rs` *disables* retirement (empty
   is preserved, not replaced). A deliberate escape hatch, and undocumented. `resolve_retired_harnesses`
   (`crates/cli/src/main.rs:1218`) treats empty/whitespace as "none" and hard-errors on an unknown
   harness name, so a typo fails the daemon loudly rather than silently retiring nothing. Good.

Refusal is **before mutation**: `http/mod.rs:886-899` returns from `spawn_seat` ahead of
`launch_seat`. The envelope is decodable and names the fix:

```json
{"ok":false,"command":"pij spawn","v":2,"meta":"harness pi is retired on this machine; use omp (or pass --allow-retired)","error":"refused"}
```

The override is audited — `http/mod.rs:1033-1060` publishes before launching:

```json
{"at":1789533399061,"kind":"spawn.retired-harness-override","payload":"{\"allow_retired\":true,\"harness\":\"pi\",\"spawn_id\":\"s-ef1bf759243061c552e4e4137fae65bc\"}","seat":"pij-honest-mistake","seq":7,"v":1}
```

### F3 (should-fix) — retirement has a second door, and it is silent

`crates/daemon/src/http/revive.rs:302` builds its `SpawnRequest` with `allow_retired: false` and
then calls **`launch_seat_locked` directly** (`:316`), not `spawn_seat`. The refusal lives in
`spawn_seat`; the audit event fires only `if request.allow_retired && retired.contains(…)`. So
reviving a retired `pi` seat is **permitted with no refusal and no spine event at all**.

`report.md:8` declares "Revive semantics intentionally unchanged", so the permission is a decision,
not an oversight — and a defensible one: retiring a harness should not strand seats that already
exist. But the *audit* gap almost certainly is not intended. `--allow-retired` exists so that every
pi process started under a pi-retired policy leaves a trace; revive starts one and leaves none, so
`pij spine events --kind spawn.retired-harness-override` is not the complete list it appears to be.

**Fix** — `allow_retired: true` at `revive.rs:302`. Revive semantics stay identical (it already
bypasses the refusal), and the override event fires, which is the honest description of what a
revive under a retirement policy *is*.

**Minor, same area:** both refusal sites compute `if harness == Omp { "use another harness" } else
{ "use omp" }` (`http/mod.rs:887-891`, `rust-runtime.ts:376-379`). Under
`PIJ_RETIRED_HARNESSES=pi,omp` the pi refusal advises "use omp", which is itself refused. The
envelope stays decodable; only the advice is wrong.

---

## 5. AC3 — the prose split

**Grep receipt reproduces exactly.**

```
$ grep -rniE 'pi/omp|omp/pi' "$R/skills/pij" "$R/docs/how/pij-rs-api.md"
[no stdout]  exit=1
$ grep -rhoiE 'pi/omp|omp/pi' "$R/skills/pij" "$R/docs/how/pij-rs-api.md" | wc -l
0
```

**No meaning drift.** Three substantial rewritten passages compared before/after: the `00-routing.md`
C1 delivery-mode prose and table (now a column per harness), the `peer.md` spawn-selection
paragraph, and the `pij-rs-api.md` recovery wording. Two intentionally *add* plan-153 rules; the
third is a pure wording split. No constraint that applied to both harnesses is now stated for only
one, no `must` weakened, no threshold or default changed. Each harness has its own row where a
table exists, and both `peer.md:48` and `pij-rs-api.md:63,67` state the rule with a model-id form
and one example per harness.

**`~/.claude/skills/pij` was not edited, and the checkout relation is worth spelling out:**

```
$ readlink -f ~/.claude/skills/pij
/Users/jordanknight/pi-hacking/pij/skills/pij
$ ls -ld ~/.claude/skills/pij
lrwxr-xr-x … ~/.claude/skills/pij -> ../../.agents/skills/pij
```

It resolves into the **main checkout's working tree** — not a copy, not a worktree. So branch edits
do not reach it today, and the merge to main rewrites what every live Claude seat reads with no
deploy step and no restart. That is the intended design; it also means the prose split lands on
running agents the instant main moves.

### F2 (should-fix) — a live surface still says `pi/omp`

AC3's scope was `skills/pij/**` plus the API doc. The plan's **Rule** is broader: *"two harnesses in
every surface an agent reads or calls."* One runtime string fails it.

`.omp/extensions/pij/core/generation-routing.ts:55-59`:

```ts
function renderRegister(payload: unknown): string {
  const harness = text(payload, "harness");
  if (harness === "pi" || harness === "omp")
    return "pi/omp seats self-register at boot; you are already reachable — run `pij whoami` to confirm, never adopt";
```

This is emitted, not commented. The `inbox register` route binds it at `generation-routing.ts:213-219`
(`verb: "inbox", leaf: "register", render: renderRegister`) and `cli.ts:173-178` renders and writes
it, so any non-JSON `pij inbox register` shows an agent the collapsed form — while the branch's own
skill text now insists the two are distinct. A grep scoped to prose files structurally cannot see
this; only tracing the renderer finds it.

**Fix**: branch the message per harness, as the rest of the plan does.

For accuracy, the duplicate at `core/spawn.ts:998` is **not** the same problem: its only holder,
`parseAdoptArgs`, has no production callers (definition and tests only), so it is dead-library text.
Worth deleting with F2, not worth claiming as a live surface.

---

## 6. AC4 — probe honesty

**Real binary, synthetic environment, fixture extension — and correctly labelled.**
`home-probe.txt` records `omp v18.1.22 --mode rpc --no-skills --no-rules --no-session --no-lsp`
under a private `HOME`, discovering `.omp/extensions/probe/index.ts`, and the RPC handshake
`{"type":"ready","protocolVersion":1,…}` proves the real binary answered rather than a stub.

The extension is a fixture, not pij. That is the right call: it isolates the capability question
from pij's own boot complexity, and — the part I care about — it deliberately staged **both**
`.omp/extensions/probe` and a `.pi/extensions/probe` symlink and recorded *"Marker emitted once;
both discovery paths deduplicated."* That is the specific hazard this move creates (the same
extension discovered twice, once per path), and the probe tests it rather than assuming it away.

The real-config half of the question is answered separately and honestly by AC5: an actual OMP seat
reports `"extension_path":"…/.omp/extensions/pij"` (`report.md:99`) with `"harness":"omp"`.

---

## 7. Fence

```
$ git diff -M --stat cf08eacd..00f04769 -- crates/daemon/src/registration.rs .copilot/
(no output)
$ git diff -M --stat cf08eacd..00f04769 -- crates/daemon/src/delivery/ crates/daemon/src/pointer/ \
      crates/core/src/delivery.rs crates/store/src/queue.rs
(no output)
```

Plan 151/152 territory is untouched. Eleven files changed under `crates/`, all AC2 work:

```
73   6  crates/cli/src/main.rs          43   1  crates/daemon/src/http/mod.rs
96   0  crates/cli/tests/spawn.rs        2   1  crates/daemon/src/http/native_tests.rs
 6   0  crates/core/src/config.rs        1   0  crates/daemon/src/http/revive.rs
 4   1  crates/harnesses/src/lib.rs    263   5  crates/daemon/src/http/tests.rs
75   2  crates/harnesses/src/spawn.rs    4   1  crates/daemon/src/http/types.rs
                                         3   0  crates/daemon/src/lib.rs
```

`native_tests.rs` (+2/−1) and `types.rs` (+4/−1) are the only receiver-adjacent files with any
delta, and both are spawn-only: a `SpawnRequest` literal gains `allow_retired`, and the struct gains
the field with `#[serde(default)]`. No receiver logic.

**Not a finding:** `plan.md:28` lists "production daemon (read-only)" as a non-goal while six daemon
files changed. That non-goal means the *running* production daemon instance — consistent with the
packet's own "production daemon read-only; isolated daemon for anything live" — not `crates/daemon`
source, which AC2 necessarily modifies. No production daemon was bounced; all live proof ran against
a private daemon on `127.0.0.1:55076` with separate state/HOME/XDG and tmux socket `pij153-9fgk8o_r`.

---

## F4 (should-fix) — the moved code still documents the collapse

`.omp/extensions/pij/core/types.ts:244-246`:

```ts
/** Pi-family executable that owns this native session. Pi and OMP both use
 * `harness: "pi"`, but their persisted session stores and resume argv differ. */
readonly runtimeBin?: "pi" | "omp";
```

`core/state.ts:281` repeats it. Both are **false as shipped**: `adapters/rust-runtime.ts:1068`
registers `harness: input.runtimeBin`, and the live receipt shows `"harness":"omp"`. In a plan whose
entire thesis is that agent-readable surfaces must stop collapsing the two runtimes, the surviving
statements of the collapse are inside the moved extension itself. Two comment edits.

## F5 (minor) — a deleted assertion, and the vestigial env var it guarded

`spawn.test.ts` deletes `"bin 'omp' env threading is identical to pi"` (`cf08eacd:.pi/…/spawn.test.ts:126-134`).
Its input `{bin: "omp"}` is retired, so it could not survive verbatim — but its one
harness-dependent assertion, `expect(r.env.PIJ_PI_BIN).toBe("omp")`, is now covered nowhere:
`spawn.test.ts:114` only asserts the `"pi"` case, and the `revive.test.ts` hits exercise a different
producer (`revive.ts:493`).

The reason this is minor rather than serious is the more interesting half: **`PIJ_PI_BIN` is written
twice and read nowhere.**

```
$ grep -rn "PIJ_PI_BIN" . --exclude-dir=target --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs | grep -v '\.test\.ts'
./.omp/extensions/pij/core/spawn.ts:184:   env.PIJ_PI_BIN = input.harness;
./.omp/extensions/pij/core/revive.ts:493:   PIJ_PI_BIN: runtime,
```

The comment at `spawn.ts:183` calls it "Runtime provenance for existing resume readers" — there are
no readers. A booting child self-detects via `detectPiRuntime` (`index.ts:65`) from `OMPCODE`,
`process.versions.bun` and `execPath`, and a descriptor's `runtimeBin` is derived from the seat
harness (`rust-runtime.ts:1104`), never from this variable. Either add the one-line omp assertion or
delete the variable and its comment; do not keep a comment that names consumers that do not exist.

---

## Gates — re-run on my checkout

| Gate | Result |
|---|---|
| `cargo test --workspace --no-fail-fast -- --test-threads=1` | **exit 0** |
| `cargo fmt --all --check` | **exit 0** |
| `cargo clippy --workspace --all-targets -- -D warnings` | **exit 0** |
| `npx vitest run .omp/extensions/pij` | **exit 0** — 177 files, **4372 passed**, 14 skipped |
| `just self-check` | **exit 0** (warm) — 243 test files, **5306 passed**, 22 skipped; smoke 11/11; `✓ snapshot-check: briefing.md SHA matches snapshots (cdf5f5b25001…)` |

The first `just self-check` exited 1 in `smoke: file-watch-notify` with `waitIdle timed out after
30000ms`. The captured tail shows the scenario mid-`git clone` and `npm install` ("Cloning …",
"audited 1 package in 117ms") — a cold-cache fetch inside a 30 s idle window, not a plan-153
behaviour. Warm re-run of `just smoke` alone: **exit 0, 11/11**. Warm `just self-check`: **exit 0**.
This is the same flake I recorded on plan 151.

All four mutants were reverted immediately after each run and `git status --porcelain` returned
empty each time.

## Commands executed

```bash
git worktree add --detach …/pij-worktrees/s153-rev 00f04769 && node harness/scripts/worktree-deps.mjs
git diff -M --name-status cf08eacd..00f04769      # 370 renames, 17 A, 28 M
# 354 R100 pairs compared by blob hash; 16 sub-R100 diffs read individually
# mutants A–D applied one at a time to index.ts / core/spawn.ts / adapters/rust-runtime.ts, restored after each
# bounce-daemon dirty-pathspec probe: append to .omp/…/spawn.ts, compare both pathspecs, restore
npx vitest run .omp/extensions/pij
cargo test --workspace --no-fail-fast -- --test-threads=1 ; cargo fmt --all --check ; cargo clippy --workspace --all-targets -- -D warnings
just self-check
```

No production daemon was contacted; the production registry was never written.

---

# Round 2 — fix round

Range `7bec9160..a34b8a91` (`7bec9160` is a descendant of round-1 HEAD `00f04769`; the only code
commit is `a34b8a91 fix(pij): restore source brake and audit retired revivals`). 16 files,
**+186 −54**. Fresh detached worktree `/Users/jordanknight/pi-hacking/pij-worktrees/s153-r2` at
`a34b8a91`, deps relinked (358).

## Verdict

**APPROVE.**

All five findings are fixed, and each fix is pinned by a test I drove red by reverting the fix.
One coverage gap remains (**R1** below) — recommended, not blocking, and the fix round *disclosed*
it rather than hiding it.

| # | Round-1 finding | Fix | Red proof |
|---|---|---|---|
| F1 | blind dirty-source brake | `bounce-daemon.sh:55` pathspec + real pathspec-aware fixture | MUTANT-E ✔ |
| F2 | live `pi/omp` string | `renderRegister` branches per harness; 5 more comments swept | see R1 |
| F3 | silent retired revive | `revive.rs:302` `allow_retired: true` | MUTANT-F ✔ |
| F4 | stale collapse comments | `types.ts` / `state.ts` rewritten | grep = 0 ✔ |
| F5 | vestigial `PIJ_PI_BIN` | deleted from `spawn.ts` and `revive.ts` | grep = 0 ✔ |

## F1 — closed

The pathspec is fixed and I re-ran the round-1 probe against the shipped line, with real git:

```
baseline: 0 dirty
$ printf '\n// reviewer r2 dirt probe\n' >> .omp/extensions/pij/core/spawn.ts

NEW pathspec (bounce-daemon.sh:55 as shipped):
     M .omp/extensions/pij/core/spawn.ts
OLD pathspec (round-1 blind form):
    <<<empty>>>
plus dirty package.json — still caught:
     M .omp/extensions/pij/core/spawn.ts
     M package.json
restored: 0 dirty
```

**The fixture repair matters more than the pathspec.** The old stub printed `$BOUNCE_DIRTY`
*regardless of what pathspec git was handed*, so it could never have detected this class of bug —
which is exactly why the round-1 defect shipped green. The new stub
(`bounce-daemon.test.ts:73-78`) iterates `"$@"` and matches ` M $path` or ` M $path/`*, modelling
real `git status --porcelain -- <dir>` descent. I confirmed that descent behaviour against real git
in the probe above, so the stub is faithful rather than merely convenient.

**MUTANT-E** — revert `:55` to the round-1 pathspec, leave everything else:

```
✓ refuses daemon-relevant dirt at .pi/extensions/pij unless --force is explicit
× refuses daemon-relevant dirt at .omp/extensions/pij/core/spawn.ts unless --force is explicit
AssertionError: expected [ 'fetch', 'report', 'stop', 'start' ] to deeply equal [ 'fetch' ]
Tests  1 failed | 3 passed (4)
```

Exactly one test red, on the `.omp` row only — no over-fitting. And the assertion that fires is the
**tmux/pij action log**: under the mutant the script reached `report`, `stop`, `start`. The test
does not merely check an exit code; it proves the daemon was actually bounced with uncommitted
source. That is the production consequence, asserted directly.

Baseline at HEAD: 4 passed. The script itself was never executed for real — it calls
`pij daemon stop` against the production daemon.

## F3 — closed

`revive.rs:302` now sends `allow_retired: true` with the comment *"Reviving an existing seat is an
explicit operator override of retirement."* That is the right framing and the right one-line fix:
revive already bypassed the refusal, so this changes **only** whether the act leaves a trace.

The audit publish sits at `http/mod.rs:1036`, inside `launch_seat_locked` (opens `:932`), not inside
`spawn_seat` (`:886`). So the trace is attached to the shared launch path and every entry point
inherits it — the durable shape, rather than a second copy of the check bolted onto revive.

**MUTANT-F** — restore `allow_retired: false`:

```
test revive_retired_harness_succeeds_and_audits_override ... FAILED
panicked at crates/daemon/tests/revive_http.rs:220:5:
assertion `left == right` failed: retired revival must be audited
test result: FAILED. 11 passed; 1 failed
```

Baseline at HEAD: `ok. 12 passed`. Two things worth noting about *which* assertion failed:

- Only the **audit** assertion broke; the success/tombstone/pane assertions in the same test still
  passed under the mutant. That independently confirms my round-1 reading — revive of a retired
  harness was already permitted, and silently. The fix is audit-only, semantics untouched, exactly
  as `report.md` claims.
- The test also asserts `event.seq < launched.seq` ("audit precedes launch publication"), so a
  future regression that fires the event *after* the mutation is caught too. Persist-before-mutate
  (P9) is pinned, not assumed.

## F4 / F5 — closed

```
$ grep -rniE 'both use .?harness|share the .?pi.? harnesskind|Pi and OMP both' .omp/extensions/pij --include='*.ts'
exit=1   (zero matches)

$ grep -rn "PIJ_PI_BIN" . --exclude-dir=target --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs
exit=1   (zero matches — source and tests)
docs/ retains 10 historical references in plan records, which is correct.
```

F5 was resolved by the stronger of the two options I offered: the variable is deleted at both
producers (`spawn.ts:181`, `revive.ts` `piEnv`), and `piEnv`'s now-unused `runtime` parameter went
with it — so the dead state is gone rather than newly asserted. The two golden-shell-line tests
(`revive.test.ts:808,822`) had their `PIJ_PI_BIN=…` prefixes removed and otherwise still pin the
full command string, so the *rest* of the env threading stays proven.

**One deletion I checked rather than assumed.** `spawn.test.ts` dropped the whole of
`it("always includes required env vars")`, which asserted `PIJ_ANNOUNCE_TO`, `PIJ_SPAWN_ID`,
`PIJ_ROLE` **and** `PIJ_PI_BIN` — only the last had become invalid. The other three survive
elsewhere on the same producer: `session.test.ts:635` (`"env carries PIJ_ANNOUNCE_TO=self,
PIJ_SPAWN_ID, PIJ_ROLE=worker (AC-02)"`, asserting all three) plus 24/21/11 further test
references. No coverage lost.

The new comments are accurate against the code: `types.ts:241` and `state.ts:277` now describe the
TypeScript projection versus Rust registry identity, which matches `rust-runtime.ts:1068`
(`harness: input.runtimeBin`) and the live receipt.

## F2 — fixed, and the fix is correct

`generation-routing.ts:57-58` now branches:

```ts
return `${harness === "omp" ? "OMP" : "Pi"} seats self-register at boot; you are already reachable — run \`pij whoami\` to confirm, never adopt`;
```

I re-derived both outputs from the shipped expression and they match `report.md`'s captured stdout
byte for byte:

```
"Pi seats self-register at boot; you are already reachable — run `pij whoami` to confirm, never adopt"
"OMP seats self-register at boot; you are already reachable — run `pij whoami` to confirm, never adopt"
```

The sweep was correctly widened past AC3's original prose-only scope. The packet's grep reproduces,
and the report's inventory numbers are exact — I recounted them:

```
$ grep -rniE 'pi/omp|omp/pi' .omp/extensions/pij --include='*.ts' | grep -v '\.test\.ts'
exit=1   (zero matches)
$ find .omp/extensions/pij -name '*.ts' | wc -l              → 335
$ find .omp/extensions/pij -name '*.ts' ! -name '*.test.ts'  → 156
```

Six occurrences remain, all in test names and test comments (`revive.test.ts:839,847`,
`typing-guard-contract.test.ts:101,158`, `liveness-cost.test.ts:271`,
`fs-registry.archive.test.ts:365`). Those are developer-facing, not surfaces an agent reads or
calls, so they are out of the rule's scope. Correctly left alone.

`parseAdoptArgs` is still dead library — `grep -rn "parseAdoptArgs" --include='*.ts'` outside tests
returns only its own definition at `spawn.ts:969`. Its string was updated anyway and the report
declines to claim it as a live surface. Accurate.

### R1 (recommended, non-blocking) — the F2 fix ships unpinned

The fix round removed **both** assertions on the string it changed, and added none:

```
$ git grep -n "self-register at boot" 7bec9160 -- '*.test.ts'
7bec9160:.omp/extensions/pij/cli.inbox.integration.test.ts:798
7bec9160:.omp/extensions/pij/core/spawn.test.ts:1272

$ git grep -n "self-register at boot" a34b8a91 -- '*.test.ts'
exit=1   (nothing pins it)
```

`cli.inbox.integration.test.ts:791` went from `expect(taught).toEqual({code, stderr: "", stdout:
"<message>"})` to `expect(taught.code).toBe(0)`, and the test name lost "and human guidance" — a
deliberate scope reduction, not an incidental edit.

**MUTANT-G** — revert `renderRegister` to the collapsed `pi/omp` string, change nothing else:

```
full extension suite:            Test Files 176 passed | 3 skipped     Tests 4354 passed   EXIT 0
```

Green. And this is not just a default-skip artifact — `cli.inbox.integration.test.ts` is gated on
`RS_BINARY_PRESENT` (`:122`), so I built `pij-rs` and re-ran it **enabled**, against its real private
Rust daemon, still carrying MUTANT-G:

```
$ cargo build -p pij-cli --bin pij-rs && PIJ_RS_BIN_REQUIRED=1 npx vitest run …/cli.inbox.integration.test.ts
  ✓ inbox register preserves self-registered pi pane identity
  ✓ inbox register preserves self-registered omp pane identity
Test Files  1 passed (1)      Tests  17 passed (17)      EXIT 0
```

Seventeen live-daemon tests, including both harness rows, pass with the entire F2 fix reverted.

**Why this is recommended rather than blocking.** `report.md` states the choice openly — *"The test
retains identity/no-extra-seat assertions rather than pinning exact prose"* — and that instinct is
correct and matches this repo's own testing rule that tests must not pin wording. I am not asking
for the prose pin back. But the plan's rule is not prose; it is *"the message names the actual
harness, not a collapsed `pi/omp`"*, and that is a behavioural contract you can assert without
pinning a sentence. The test already has `harness` in scope from its `it.each(["pi","omp"])`:

```ts
expect(taught.stdout).toContain(harness === "omp" ? "OMP" : "Pi");
expect(taught.stdout).not.toMatch(/pi\/omp/i);
```

Two lines, doctrine-compliant, and MUTANT-G dies. As shipped the source is right, the behaviour was
observed live and captured in the report, and the residual risk is a silent future regression of one
guidance string — real, bounded, and disclosed. That is a follow-up, not a gate.

## Fence, round 2

Nothing outside the five findings moved. All 16 files map to F1–F5: 11 extension files (9 of them
one-line comment or string edits), `revive.rs` (+1/−1 plus a comment), `revive_http.rs` (+53, the new
test and a retired-harness fixture constructor), `bounce-daemon.sh` (+1/−1),
`bounce-daemon.test.ts` (+16/−4), and `report.md` (+96). No receiver, delivery, heartbeat or
registration behaviour changed; `crates/daemon/src/registration.rs` and `.copilot/` remain at zero
delta from round 1.

## Gates — round 2, my checkout, warm

| Gate | Result |
|---|---|
| `cargo fmt --all --check` | **exit 0** |
| `cargo test -p pij-daemon --test revive_http` | **ok, 12 passed** |
| `npx vitest run .omp/extensions/pij` | **exit 0** — 176 files, **4354 passed**, 31 skipped |
| `cli.inbox.integration.test.ts` (rs binary built, `PIJ_RS_BIN_REQUIRED=1`) | **exit 0** — 17 passed |
| `just self-check` | **exit 0** — typecheck + lint + 243 files / **5306 passed** + smoke 11/11 + `✓ snapshot-check: briefing.md SHA matches snapshots (cdf5f5b25001…)` |

The first `just self-check` in this fresh worktree exited 1 on the same `file-watch-notify`
idle-timeout as round 1. This run captured the cause outright — the scenario is mid-network-clone
when the 30 s idle window expires:

```
Cloning into '…/pij-worktrees/s153-r2/.pi/git/github.com/ghoseb/pi-askuserquestion'...
waitIdle timed out after 30000ms
```

`.pi/git/` is per-worktree, so every new worktree pays a cold clone. Warm re-run: **exit 0, smoke
11/11**. Environmental, not plan-153 — and a standing harness annoyance worth a ticket
(pre-warm the clone, or exempt clone/install phases from the idle clock).

Mutants E, F and G were each reverted immediately after their run; `git status --porcelain` returned
empty after every one, and the worktree was clean at teardown.

