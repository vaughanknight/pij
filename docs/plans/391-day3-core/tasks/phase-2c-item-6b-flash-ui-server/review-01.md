# Cold review — dlg-0012 (Phase 2c, item 6b — Flash instability: isolation record + honest catalog mark + warn-don't-block)

**Reviewer**: cold cross-model (claude-opus-5 via GitHub Copilot CLI), seat `pij-mobile-reptile`
**Target**: `s391/item6b-flash-ui-server` @ `8dd8f1eb8e25ec2c30c033d9cee9bfd92bb788d7`
**Base**: `73f4a90ceaf530b886180f9608a5b4c947c8fecb` (= `git merge-base origin/main HEAD`)
**Verdict**: **APPROVE-WITH-FINDINGS** · highest = **medium** (F-1)
**Reviewed**: 2026-08-27T16:33Z → 2026-08-27T17:0xZ

---

## §0 Scaffolding, and the limits of this pass

Read this before the findings. A gate I did not examine and a gate I found clean must not look the same.

**Scaffolding.** Repo read-only except this file. No commits, no `npm link`, no daemon contact, no
`~/GitHub/pij`. Gate run via `pij bg` (`bg-mtbqqbbj-be9rc8`) *before* any mutation; all six source
mutations applied only after the gate returned. Three touched sources saved to `/tmp/d12-*.orig`
and restored/verified three ways at close.

**What I established exactly (execution or byte-comparison, not reading):**

| Claim | How |
|---|---|
| Item 6's argv gate intact | `buildControlSpawnCommand` extracted from both revisions — **byte-identical, 3529 B**, still contains `"--context", "long_context"` |
| `COPILOT_NO_LONG_CONTEXT`, `annotateLongContext`, `resolveLongContext`, `validateModel`, `findKnownModel` unchanged | byte-compared base vs HEAD, all identical |
| The emitted warning text | ran `buildSpawnWarning` under `tsx` and printed the real string |
| Cross-provider false attribution (F-3) | ran it — openrouter entry produces the Copilot warning |
| `constructor` prototype leak (F-4) | ran it — printed the malformed warning |
| Copilot CLI version | ran `copilot --version` on this machine → `1.0.81-14`, matches the record |
| Every flag `isolation.md` claims to have used | `copilot --help` — `-i/--interactive`, `-p`, `--context`, `--session-id`, `--log-level`, `--log-dir`, `--screen-reader`, `--disable-builtin-mcps`, `--no-custom-instructions` all exist |
| When the matrix actually ran | decoded the 8 Request IDs' trailing hex as unix epoch → **2026-08-27T16:04:08Z … 16:07:53Z**, monotonic, 30–60 s apart |
| Dim-0 kills | 8 mutations, each preceded by a 97/97 baseline |

**What is weaker than it looks — do not read these as proven:**

- **"Produced outside tmux with no pij seat" is corroborated, not proven.** The processes exited
  ~30 min before I looked; `TMUX` being unset in a dead process is unobservable now. What I *can*
  say: no seat record under `~/.pij/pij-*.json` (156 files) carries a timestamp inside
  16:04–16:07Z; the six seat records that mention `gemini-3.6-flash` are disjoint from that window
  (nearest mtimes 27 Aug 17:35–19:45 local); **18** `~/.copilot/session-state` directories were
  created in 16:03–16:09Z against a 16-cell matrix; and the request spacing is consistent with
  sequential manual rows rather than pane automation. That is corroboration from four independent
  angles and zero contradicting evidence — it is not a proof of a negative.
- **Rows 4–8's argv is only partly checkable.** `--ui-server` and `--port` are **not** in
  `copilot --help` for 1.0.81-14 (undocumented flags), though pij itself emits them at
  `core/spawn.ts:501`. So I verified flag existence for rows 1–3 and every capture flag, not for
  the `--ui-server` rows.
- **I did not re-run the matrix.** I did not call Flash or Sol once. The upstream verdict rests on
  the coder's artifact plus my timestamp/version/flag corroboration.
- **I did not run the base suite.** Base count is inferred (3994 − 7 = 3987) from a counted
  `it()` delta, not observed.
- **No live-daemon proof, no `just smoke`, no `harness checks`** — ran `vitest`, `tsc`, `biome`
  directly (addendum §3 waives live-daemon proof).
- **The `~07:33Z` Flash success is hearsay to me and to the coder** — see F-2.
- F-6/F-7 characterise *test strength*; they are not behavioural defects.

---

## §1 Freeze and scope

HEAD `8dd8f1e`, **exactly one** commit above base `73f4a90`; tracked tree clean at open, mid-pass
and close; 31 untracked orchestration paths baselined to `/tmp/d12-baseline-status.txt`, **zero
delta** at close. `origin/main` has advanced to `447526e8` — the branch will need a rebase before
ship (not a finding).

Diff = **10 files, 300+/7−**:

```
.pi/extensions/pij/core/models/registry.ts            +37 -1
.pi/extensions/pij/core/models/registry.test.ts       +29
.pi/extensions/pij/core/models/validate.ts            +21 -1
.pi/extensions/pij/core/models/validate.test.ts       +23
.pi/extensions/pij/core/models/spawn-validation.test.ts +37
.pi/extensions/pij/core/spawn.ts                      +16 -5
docs/how/pij-models-discovery.md                      +17
docs/plans/.../execution.log.md                       +41  (new)
docs/plans/.../isolation.md                           +50  (new)
docs/plans/.../tasks.md                               +36  (new)
```

`core/types.ts`, `core/revive.ts`, `skills/**`, `government/**`, `core/daemon/**` — **none touched**
(addendum §8 satisfied). See F-8 for the one path outside the taken task's literal list.

---

## §2 The brief's confirmations

| # | Required | Verdict |
|---|---|---|
| 1 | Isolation record: every cell filled or NOT-PROBEABLE with why | ✅ 8 rows × 2 models = 16 cells, **all filled**, none deferred |
| 1 | Copilot version recorded | ✅ `1.0.81-14`, independently verified on this machine |
| 1 | Verbatim error lines | ✅ 8 lines with Request IDs — and they **decode to real epochs** in a plausible sequence, so they are genuine round-trips, not prose |
| 1 | Verdict follows from the matrix, not prose | ✅ 8/8 Flash rows 400 incl. the `-p` baseline; 8/8 Sol OK. `-p` failing is what refutes the interactive-only hypothesis, and the record says so |
| 1 | Outside tmux, no pij seat | ✅ corroborated four ways, zero contradicting evidence (see §0 for the limit) |
| 3 | Field named for the measured fact, **not** `interactive:false` | ✅ `copilotInstability {cli, observedFailAt, observedPassAt, note}`; no `interactive` field anywhere. **Pinned** — M7 RED |
| 3 | Warning names CLI **1.0.81-14** | ✅ verified by execution |
| 3 | Warning names **BOTH** observations | ✅ verified by execution. **Pinned** — M5 RED |
| 3 | "treat as unavailable until a fresh probe passes" | ✅ verbatim |
| 3 | terra/sol offered as the alternative | ✅ `pick gpt-5.6-terra or gpt-5.6-sol` |
| 3 | **No `-p` remedy** | ✅ absent from the text — but **unpinned**, see F-6 |
| 3 | Spawn still proceeds (warn-don't-block) | ✅ both call sites (`cli.ts:2652`, `:4454`) `process.stderr.write` and fall through; no `exit`/`throw` added; `buildSpawnWarning` still returns `string \| null` |
| 3 | `docs/how/pij-models-discovery.md` carries the same measured sentence | ✅ verbatim (inherits F-1's date) |
| 3 | Execution log records the ruling deviation | ✅ dedicated "Ruling deviation" section |
| 3 | Item 6's argv gate intact | ✅ **proven byte-identical**, not inspected |
| 4 | Diff ⊆ allowed paths; no `skills/**`, no daemon | ✅ substantively; see F-8 |

The exact emitted string (captured by running it):

```
warning: gemini-3.6-flash on GitHub Copilot CLI 1.0.81-14 is unstable upstream: HTTP 400
'invalid request body' on every request path (-p and interactive) observed 2026-08-28 ~16:0xZ,
while a -p one-shot succeeded ~07:33Z — treat as unavailable until a fresh probe passes;
pick gpt-5.6-terra or gpt-5.6-sol. This is a warning only; spawn continues.
```

---

## §3 Dim-0 — eight mutations

Baseline before every mutation: **97 passed (97)** across `registry.test.ts`, `validate.test.ts`,
`spawn-validation.test.ts`. Restored between each.

| ID | Site | Mutation | Result |
|---|---|---|---|
| **M1** *(mandated)* | `registry.ts:97` | empty `COPILOT_UNSTABLE_MODELS` | **RED — 3 of 97** (see F-5: *not* the warning tests) |
| M2 | `registry.ts:124` | drop the `isCopilot` provider guard | **SURVIVES 97/97** |
| M3 | `validate.ts:69-70` | drop the bare-id fallback in `resolveCopilotInstability` | RED — 2 of 97 |
| M4 | `registry.ts:378` | drop `annotateCopilotInstability` from `loadModels` | **SURVIVES 97/97** |
| M5 | `spawn.ts:1103` | delete the "while a `-p` one-shot succeeded …" clause | RED — 1 of 97 |
| M6 | `spawn.ts:1103` | insert a `-p` remedy **mid-sentence** | RED — 1 of 97 *(incidental — see F-6)* |
| **M6b** | `spawn.ts:1103` | insert the same `-p` remedy **at the end** | **SURVIVES 13/13** |
| M7 | `registry.ts:100` | add `interactive: false` to the curated entry | RED — 2 of 97 |

**M2 and M4 survive the whole suite, not just my focused set.** The only files anywhere in
`.pi/extensions/pij/` that reference `annotateCopilotInstability`, `copilotInstability`,
`COPILOT_UNSTABLE_MODELS` or `loadModels` are the three files I ran — so no other test could have
killed them. That is an exhaustive claim, not a sample.

---

## §4 Findings

### F-1 (medium) — the measured timestamp shipped in the warning is off by a day and lies in the future

`registry.ts:100` — `observedFailAt: "2026-08-28 ~16:0xZ"`.

The eight Request IDs in `isolation.md` end in a hex unix epoch. Decoded:

```
6A905FF8 → 2026-08-27T16:04:08Z   6A906019 → 16:04:41Z   6A906037 → 16:05:11Z
6A90605A → 16:05:46Z   6A90607B → 16:06:19Z   6A90609D → 16:06:53Z
6A9060BD → 16:07:25Z   6A9060D9 → 16:07:53Z
```

The matrix ran on **2026-08-27**. `date -u` at review time: `2026-08-27T16:33:00Z`. So the shipped
string names a UTC instant roughly **24 hours in the future**.

Cause is legible: the machine is `+10:00`, so 16:04Z **is** 02:04 local on 2026-08-28. The stamp
concatenates the **local calendar date** with the **UTC clock time** and marks the result `Z`.
Either `2026-08-27 ~16:0xZ` or `2026-08-28 ~02:0x+10:00` would be true; the shipped form is neither.

Why it matters rather than being a typo: this string is operator-facing (`pij spawn` prints it), it
is the **only** staleness signal behind "treat as unavailable until a fresh probe passes", and an
operator who reads a future date cannot compute how old the observation is. It has also propagated
into `docs/how/pij-models-discovery.md` and is pinned verbatim by four assertions, so it will not
drift out on its own. The o-prime's ruling said `~16:0xZ` with no date at all — the date is an
unrequested addition that happens to be wrong.

**Fix**: one string in `registry.ts` plus the four pinned assertions and the docs line.

### F-2 (low) — the two observations are presented symmetrically but are not symmetrically evidenced

`observedPassAt: "~07:33Z"` carries **no date**, while its sibling carries one. Worse, their
provenance differs and nothing in the record says so: the failure is first-hand and instrumented
(eight Request IDs), whereas the pass is relayed — `execution.log.md` says it was "based on the
o-prime's earlier same-version success at about 07:33Z", with no artifact, no request id, and no
transcript in the record. The coder did not observe it and neither can I.

The ruling ("both observations are real") is satisfied; the *record* should still distinguish
measured-here from reported-to-me, and should date the pass (`2026-08-27 ~07:33Z`), since the whole
warning asks an operator to reason about elapsed time.

### F-3 (low) — a non-Copilot model can be told the GitHub Copilot CLI is broken

`annotateCopilotInstability` guards on provider (`registry.ts:124`, `isCopilot`), but
`resolveCopilotInstability`'s fallback (`validate.ts:69-70`) does not. The two also key
differently: **annotate** looks up the *full* normalized id, **resolve** looks up the *bare* id
after the last `/`. So they disagree, and resolve wins for the warning. Run:

```
buildSpawnWarning("google/gemini-3.6-flash", [{id:"google/gemini-3.6-flash", provider:"openrouter", …}])
→ "warning: gemini-3.6-flash on GitHub Copilot CLI 1.0.81-14 is unstable upstream: …"
```

Both call sites pass the full multi-provider `loadModels()` (`cli.ts:2652`, `:4454`) and have
`harness` in scope but do not pass it, so nothing downstream can correct it.

**This is latent, not live.** I checked: no non-Copilot id in `.pi/models.json` or
`~/.pi/agent/models.json` normalizes to `gemini-3.6-flash` today — openrouter carries
`google/gemini-3.5-flash`. One models.json line makes it live.

I raise it at all because it is the same class of error the ruling was written to prevent: the
o-prime forbade `interactive:false` precisely because it would assert a property that was not
measured. Asserting a measured **GitHub Copilot CLI** fact about an openrouter route is that error
with the axis changed — and the recommended remedy (`gpt-5.6-terra`/`sol`, Copilot ids) may not
even exist on the other provider. The author clearly knew the guard was needed; it is simply
missing from the second function.

### F-4 (low) — `pij spawn --model constructor` emits a warning full of `undefined`, and hides the real one

`COPILOT_UNSTABLE_MODELS` is a plain object literal, so an unguarded index reaches
`Object.prototype`. Run:

```
resolveCopilotInstability([...], "constructor") → [Function: Object]   // !== undefined
buildSpawnWarning("constructor", [...]) →
  "warning: constructor on GitHub Copilot CLI undefined is unstable upstream: undefined
   observed undefined, while a -p one-shot succeeded undefined — treat as unavailable …"
```

The second-order effect is the worse one: because the instability branch returns **before**
`validateModel`, the correct `warning: unknown model 'constructor'` is **suppressed**.

Exactly one prototype key is reachable, and I checked rather than assumed: `normalizeModelQuery`
lowercases and maps `_`/whitespace → `-`, so `toString` → `tostring`, `__proto__` → `-proto-`,
`hasOwnProperty` → `hasownproperty` all miss. Only `constructor` survives normalization unchanged.

Note the sibling `COPILOT_NO_LONG_CONTEXT` is a `Set` and is immune — the new code is strictly
weaker than the pattern it was written to mirror. **Fix**: `Map`, `Object.create(null)`, or an
`Object.hasOwn` guard.

### F-5 (low, test quality) — the brief's own Dim-0 does not produce the RED it predicts

The brief specifies: *"(mark) remove the curated entry → warning test RED."* I ran it. Three tests
die — the constant test and both `resolveCopilotInstability` tests — but **both `buildSpawnWarning`
tests stay green**, because they inject `copilotInstability` onto their `FLASH` fixture instead of
reading the catalog. So the end-to-end property "a real Flash id produces the warning" is not what
those tests check.

Sharper: `registry.test.ts`'s *"annotates every Flash Copilot projection…"* passes **vacuously**
under the mandated mutation. It asserts

```ts
expect(entry.copilotInstability).toEqual(COPILOT_UNSTABLE_MODELS["gemini-3.6-flash"]);
```

so when the map is emptied both sides become `undefined` and the assertion holds. A self-referential
assertion cannot detect the removal of the thing it references — it survives exactly the mutation
it exists to catch.

**Fix**: assert against a literal in the annotate test, and add one
`buildSpawnWarning("gemini-3.6-flash", <entries with no injected record>)` case.

### F-6 (low) — the ruled "no `-p` remedy" is not actually pinned

M6 inserted a `-p` recommendation mid-sentence and went RED — but for the wrong reason. It broke the
contiguous `toContain("… pick gpt-5.6-terra or gpt-5.6-sol.")` substring, whose **terminal period**
happened to be included in the assertion. That is an accident of punctuation, not a check.

M6b appended the same remedy after `"spawn continues."`:

```
"… This is a warning only; spawn continues. If you must use Flash, run copilot -p as a one-shot instead."
→ 13/13 green. SURVIVES.
```

So the one thing the o-prime explicitly ruled out can be reintroduced with no test noticing.
**Fix**: an explicit negative (`expect(warning).not.toMatch(/\bcopilot -p\b/)`) or assert the whole
string by equality.

### F-7 (info) — the annotation pipeline is currently write-only, and both its guards are unpinned

M2 (drop the provider guard) and M4 (drop the `loadModels` wiring entirely) both survive **the whole
suite**. The reason is structural: the only production reader of `ModelEntry.copilotInstability` is
`validate.ts:68`, the first branch of `resolveCopilotInstability` — and that branch falls back to the
raw map, so removing the annotation changes no observable behaviour. Nothing renders the field;
`pij models` does not surface the mark.

So `annotateCopilotInstability` is presently dead weight that also carries the provider guard whose
absence elsewhere is F-3. Either give it a consumer (surfacing the mark in `pij models` seems the
intent) and pin it, or delete it and put the provider guard where the decision is actually made.

### F-8 (info) — one file outside the taken task's literal path list

The addendum says the allowed paths are *exact* and that widening should be reported BLOCKED. Two
notes, neither of which I think is over-reach:

- `core/spawn.ts` is listed under **T002a** (the un-taken "IF OURS" branch), not T002b — yet
  `buildSpawnWarning` lives there and T002b mandates changing it. The packet's path list is
  mis-specified; the coder had no in-fence alternative.
- `core/models/validate.test.ts` appears in **neither** list, though it tests the resolver that
  T002b does mandate in `validate.ts`.

`tasks.md` / `execution.log.md` are the dossier's own bookkeeping. Recording so the fence and the
diff agree on the record; no action needed beyond fixing the packet's list next time.

---

## §5 Gates

| Gate | Result |
|---|---|
| `npx vitest run .pi/extensions/pij/` (via `pij bg`) | **171 files passed, 2 skipped (173); 3994 passed, 15 skipped (4009); 0 failed**; exit 0; 173.29 s |
| Focused set (3 changed test files) | 97 passed (97) — baseline for every mutation |
| `npx tsc --noEmit -p .` | **0 errors** |
| `npx biome check` on all 6 changed `.ts` | **clean**, 6 files |
| Restore after Dim-0 | `cmp` OK ×3, `git hash-object` == `HEAD:<path>` ×3, `git diff --exit-code` clean, untracked delta **zero** |

**Anti-vacuity.** Net `it()` in the diff: **+7 / −0**, zero `it.skip`/`todo`. Per file:
`registry.test.ts` 36→38, `validate.test.ts` 19→22, `spawn-validation.test.ts` 11→13 = +7, matching
the diff-wide count and the coder's logged "7 tests failed before implementation". Gate 3994 with
skips unchanged at 15 ⇒ base 3987. Nothing was deleted or quietly skipped. The coder's logged figure
(3,994 / 15 / 0) reproduces exactly.

The execution log's `PARTIAL` / `gatesClean:false` is honest and, I agree, out of fence: `just lint`
and `harness checks --quick` red are pre-existing repo-wide baselines (OSC producer, `pwsh ENOENT`,
Windows compat) and **no changed file appears in them** — I confirmed biome is clean on all six.

---

## §6 Verdict

**APPROVE-WITH-FINDINGS** — highest severity **medium** (F-1).

Everything the brief and the 08:20Z ruling demanded is present and, where it matters, *proven*
rather than inspected: the warning names CLI 1.0.81-14 and both observations, says "treat as
unavailable until a fresh probe passes", offers terra/sol, offers no `-p` remedy, and does not block
spawn; the field is named for the measured fact with no `interactive` claim anywhere; item 6's argv
gate is byte-identical to base; the isolation record fills all 16 cells and its verdict genuinely
follows from the matrix — the `-p` baseline failing is precisely what refutes the interactive-only
hypothesis, and the record reasons that way rather than asserting it.

The isolation was well controlled and the honesty discipline is visible throughout — declining to
add `interactive:false`, declining to recommend `-p`, and writing down the ruling deviation are all
the right calls.

**One item should be fixed before merge: F-1.** It is a one-line correction, but it is a factual
error in shipped operator-facing text, contradicted by evidence inside this very PR, in a
delegation whose entire purpose was to record a measurement honestly. It needs no behavioural
re-review — only the string, the four assertions pinning it, and the docs line.

F-3, F-4, F-5 and F-6 are cheap and worth taking together (they are four small edits in the files
already open). F-7 and F-8 are for the record.

---

**TERMINAL REPORT.** This pass is CLOSED. No mutation, edit or command was run against the repo
after this file was written; all eight mutations were reverted and verified byte-identical
(`cmp`, `git hash-object` vs `HEAD:<path>`, `git diff --exit-code`) before writing. HEAD unmoved at
`8dd8f1eb8e25ec2c30c033d9cee9bfd92bb788d7`.

Evidence retained: `~/.pij/pij-mobile-reptile/bg-mtbqqbbj-be9rc8.log` (gate);
`/tmp/d12-baseline-status.txt`, `/tmp/d12-status-mid.txt`, `/tmp/d12-registry.orig`,
`/tmp/d12-validate.orig`, `/tmp/d12-spawn.orig`, `/tmp/d12-base-*.ts`, `/tmp/d12-head-*.ts`,
`/tmp/d12-probe.mts`, `/tmp/d12-mutate.py`.

`8dd8f1eb8e25ec2c30c033d9cee9bfd92bb788d7`

---

# Re-review FX-01

**Reviewer**: fresh cold cross-model (claude-opus-5 via GitHub Copilot CLI), seat `pij-powerful-whale`.
I am **not** the author of the pass above; the prior reviewer's seat wedged and was closed. I read
`review-01.md` (F-1..F-8) and `fix-01.md` before touching anything, and re-derived the physical
evidence rather than inheriting it.
**Target**: `s391/item6b-flash-ui-server` @ `9726601b331f76cdbb440f547ee36da18852da21`
**Reviewed first pass**: `8dd8f1eb8e25ec2c30c033d9cee9bfd92bb788d7` · **Base**: `73f4a90ceaf530b886180f9608a5b4c947c8fecb` (= `git merge-base origin/main HEAD`)
**Verdict**: **APPROVE-WITH-FINDINGS** · highest = **low** (R-1, new, latent) · **F-1 (medium) is resolved; nothing blocks merge**
**Reviewed**: 2026-08-27T17:47Z → 2026-08-27T17:57Z

## §R0 Scaffolding, and the limits of this pass

**Scaffolding.** Repo read-only except this file. No commits, no `npm link`, no daemon contact, no
`~/.pij` mutation, no worktree created. Full `vitest` gate run via `pij bg`
(`bg-mtbtinqf-igyixi`) **before any mutation**. Three sources saved to `/tmp/pw-orig-*` and restored
between every mutation. Probes run with `npx tsx` from `/tmp/pw-probe*.mts` (outside the repo).

**Established by execution or byte-comparison, not by reading:**

| Claim | How |
|---|---|
| The eight Request IDs decode to **2026-08-27T16:04:08Z … 16:07:53Z** | re-decoded the trailing hex myself (`$((16#…))` + `date -u -r`), monotonic, 30–60 s apart — I did **not** take this from the prior pass |
| The corrected stamp is now in the **past** | `date -u` at review = `2026-08-27T17:51Z`; machine offset `+1000` |
| Item 6's argv gate intact | `buildControlSpawnCommand` extracted from `73f4a90`, `8dd8f1e`, `9726601` — **byte-identical, 3546 B, sha256 `da11b67c92098a7b31ee608196bfb345e2e27fd3d9046fed11510eeea4812953`**, still contains `"--context", "long_context"` |
| `cli.ts` untouched since base | `git diff --name-only 73f4a90 9726601` — zero `cli.ts` entries; both call sites still `process.stderr.write` + fall through |
| The emitted warnings | ran `buildSpawnWarning` under `tsx` against the **real** `loadModels()` (39 entries) and printed the strings |
| F-4 fixed | ran it — `constructor` yields the plain unknown-model warning |
| F-3 fixed | ran it — openrouter entry yields `null` |
| Diff ⊆ fix-01 fence | `comm -23` of changed-files vs the packet's path list → **empty**; 9 files, exact match |
| No test lost | `-`/`+` declaration diff over `*.test.ts`: **−2 / +7**, both removals are in-place renames whose assertions survive; zero `.skip/.todo/.only` added; −2+7 = **+5**, exactly the 3994→3999 gate delta |
| Five mutations | each preceded/followed by a 102/102 baseline; restored and verified three ways |

**Weaker than it looks — do not read these as proven:**

- **I did not re-run the isolation matrix.** I called neither Flash nor Sol. The upstream verdict
  still rests on the coder's artifact plus timestamp corroboration.
- **The `~07:33Z` pass is still hearsay** to the coder, to the prior reviewer and to me. FX-01's
  merit is that it now *says so*; it did not make the observation any more evidenced.
- **I did not observe the 3994 baseline myself.** My gate observed **3999**; the `+5` arithmetic
  uses review-01's reported 3994. The declaration diff (−2/+7) is my own and is independent.
- **I did not verify the Request IDs are genuine**, only that their trailing hex decodes to a
  plausible monotonic sequence — a fabricated ID would decode just as well.
- **Rows 4–8 (`--ui-server`/`--port`) remain unverifiable** — carried unchanged from pass 1.
- **`biome` was run on the 6 changed `.ts` files, not repo-wide** (with `--max-diagnostics=200`).
  No live-daemon proof, no `just smoke`, no `harness checks`.
- **R-2/R-3/R-4 are notes on test/doc strength**, not behavioural defects.

## §R1 Freeze and scope

HEAD `9726601`, exactly **one** commit above the reviewed `8dd8f1e`, which is one above base
`73f4a90`. Tracked tree clean at open and at close; 33 untracked orchestration paths baselined,
**zero delta** at close.

`git diff --name-only 8dd8f1e 9726601` = **9 files, 154+/58−**, and the set is *exactly* fix-01's
declared fence (the only fence path not touched is `review-01.md`, which is mine):

```
core/models/registry.ts  registry.test.ts  validate.ts  validate.test.ts
core/models/spawn-validation.test.ts       core/spawn.ts
docs/how/pij-models-discovery.md           .../execution.log.md   .../isolation.md
```

No `skills/**`, no `core/daemon/**`, no `core/types.ts`, no `core/revive.ts`, no `cli.ts`.

## §R2 The dispatch's five confirmations

### (1) F-1 / F-2 — the stamps · **CONFIRMED FIXED**

`registry.ts:105-106` now reads `observedFailAt: "2026-08-27 ~16:0xZ"`,
`observedPassAt: "2026-08-27 ~07:33Z"`. I re-decoded the eight Request IDs independently:

```
6A905FF8 → 1787846648 → 2026-08-27T16:04:08Z    6A906019 → 16:04:41Z
6A906037 → 16:05:11Z   6A90605A → 16:05:46Z     6A90607B → 16:06:19Z
6A90609D → 16:06:53Z   6A9060BD → 16:07:25Z     6A9060D9 → 16:07:53Z
```

`date -u` at review time is `2026-08-27T17:51Z`, so the stamp now names an instant **~1 h 47 min in
the past** instead of ~24 h in the future. F-1's substance is gone.

Provenance (F-2) is recorded in five places and they agree: the `note` field ("Failure instrumented
by the dlg-0012 isolation matrix; pass relayed by the o-prime, not instrumented here."), three new
doc comments on the `CopilotInstability` fields, `docs/how/pij-models-discovery.md`
("the earlier pass was relayed by the o-prime and was not instrumented in that run"), `isolation.md`
(both the verdict line and a corrected `**Date**: 2026-08-27 UTC (2026-08-28 at UTC+10)` header),
and `execution.log.md`.

**Grep proves no future-dated stamp survives in shipped text.** Every `observedFailAt` /
`observedPassAt` / `~16:0xZ` / `~07:33Z` occurrence in `.pi/**` and `docs/how/**` carries
`2026-08-27`. The only remaining `2026-08-28` strings are (a) this review file and `fix-01.md`
quoting the *old* value as the finding, and (b) `391-day3-core-plan.md` / `rulings.md`, which are
untracked orchestration docs and state the conversion explicitly ("2026-08-27 ~16:0xZ UTC (= 02:0x
+10:00 on 08-28)"). Nothing operator-facing.

**Pinned, not merely present.** `MUT-E` — revert `observedFailAt` to the old
`"2026-08-28 ~16:0xZ"` → **RED, 5 of 102**, across all three test files including the
catalog-reading `buildSpawnWarning` case.

### (2) F-4 — `constructor` · **CONFIRMED FIXED**

`COPILOT_UNSTABLE_MODELS` is now a `ReadonlyMap` (`instanceof Map` → `true`), matching the
`COPILOT_NO_LONG_CONTEXT` `Set` pattern the code was meant to mirror. Executed:

```
COPILOT_UNSTABLE_MODELS.get("constructor")        → undefined
resolveCopilotInstability(KNOWN, "constructor")   → undefined
buildSpawnWarning("constructor", KNOWN)
  → "warning: unknown model 'constructor' — spawn continues; confirm the id is correct"
```

No instability text, no `undefined`, and the real unknown-model warning is **no longer suppressed** —
the second-order effect F-4 called the worse one is gone. Pinned by a literal `toBe` plus
`not.toContain("unstable upstream")` and `not.toContain("undefined")`.

### (3) F-3 / F-7 — provider-guarded, load-bearing annotation · **CONFIRMED FIXED**

`resolveCopilotInstability` is now `findKnownModel(model, known)?.copilotInstability` — one
expression, no raw-map fallback, no second keying scheme. The two functions can no longer disagree
because there is only one lookup left, and the provider guard applies by construction.

Executed against the real catalog and against fixtures:

```
buildSpawnWarning("google/gemini-3.6-flash", [openrouter entry]) → null
buildSpawnWarning("gemini-3.6-flash",        [openrouter entry]) → null   (bare id too)
annotateCopilotInstability([openrouter bare-id entry])           → entry returned UNCHANGED
loadModels() → 39 entries; instability=YES on github-copilot/gemini-3.6-flash and
               copilot/gemini-3.6-flash ONLY; openrouter/google/gemini-3.5-flash untouched
```

Both guards F-7 reported as unpinned are now load-bearing — **the two mutations that SURVIVED the
whole suite in pass 1 now die**:

| ID | Site | Mutation | Pass 1 | **Now** |
|---|---|---|---|---|
| MUT-A (= M2) | `registry.ts:132` | drop the `isCopilot` guard | SURVIVES 97/97 | **RED 1/102** — `registry.test.ts` › *does not annotate a non-Copilot provider with the same bare model id* |
| MUT-B (= M4) | `registry.ts:384` | drop `annotateCopilotInstability` from `loadModels` | SURVIVES 97/97 | **RED 1/102** — `spawn-validation.test.ts` › *reads the Flash mark through the composed catalog without injecting metadata* |

(Both mutations were applied to `registry.ts` while the RED appeared in unmutated test files, so the
reported line numbers need no mapping back to pristine numbering.)

### (4) F-5 / F-6 — literal assertion, catalog-read case, explicit negative · **CONFIRMED FIXED**

All three landed. `spawn-validation.test.ts:94` is now a whole-string `toBe`; `:98` and `:110` are
`expect(warning).not.toMatch(/\bcopilot -p\b/)`; `:107-110` is a `buildSpawnWarning(…, loadModels())`
case that injects no metadata. `registry.test.ts:326-331` asserts a **literal** record instead of
the self-referential `COPILOT_UNSTABLE_MODELS[...]` comparison.

| ID | Mutation | Pass 1 | **Now** |
|---|---|---|---|
| MUT-C (= **M6b**, the survivor) | append `" If you must use Flash, run copilot -p as a one-shot instead."` **after** `spawn continues.` | SURVIVES 13/13 | **RED 2/102** — the literal at `:94` and the explicit negative at `:110` |
| MUT-D (the brief's **mandated** Dim-0) | empty `COPILOT_UNSTABLE_MODELS` | RED 3/97, but **both `buildSpawnWarning` tests stayed green** and the annotate test passed **vacuously** | **RED 5/102**, and it now kills the annotate test *non*-vacuously **and** the `buildSpawnWarning` catalog case |

So the one thing the o-prime explicitly ruled out can no longer be reintroduced silently, and the
brief's own mutation now produces the RED it always predicted. Note that MUT-C's RED at `:94`
aborts that test before its own `:98` negative runs — the negative is nevertheless independently
exercised at `:110`, which is why two tests die rather than one.

### (5) Argv gate, fence, gates · **CONFIRMED**

`buildControlSpawnCommand` extracted from all three revisions is **byte-identical** (3546 B,
sha256 `da11b67c…812953`) and still emits `"--context", "long_context"`. The diff is a strict subset
of fix-01's fence (in fact exactly equal to it). F-8's bookkeeping is recorded in the execution log.

| Gate | Result |
|---|---|
| `npx vitest run .pi/extensions/pij/` (via `pij bg`, **pre-mutation**) | **171 files passed, 2 skipped (173); 3999 passed, 15 skipped (4014); 0 failed**; 172.66 s |
| Focused set (3 changed test files) | **102 passed (102)** — baseline before every mutation, and again after the last restore |
| `npx tsc --noEmit -p .` | **0 errors** |
| `npx biome check --max-diagnostics=200` on the 6 changed `.ts` | **clean**, 6 files |
| Restore after 5 mutations | `cmp` OK ×3; `git hash-object` == `HEAD:<path>` ×3 (`542702c3…`, `5288d762…`, `0e9cfb6b…`); `git diff --exit-code` clean; untracked delta **zero**; HEAD unmoved |

**Anti-vacuity.** Declaration diff over the three test files: **−2 / +7**. Both removals are in-place
renames (`resolves both measured Flash outcomes …` → `… from the annotated catalog entry`;
`preserves honest absence …` → `does not synthesize instability without an annotated entry`, which
*keeps* its `gpt-5.6-sol` assertion and *adds* one). Zero `.skip`/`.todo`/`.only`. Net +5 matches the
3994 → 3999 gate delta exactly, skips unchanged at 15. I also line-diffed the surviving tests: the
only assertions removed are the four `toContain` calls replaced by the stronger literal `toBe` — no
assertion was quietly dropped from a surviving test.

## §R3 New findings from this pass

### R-1 (low) — `CopilotInstability.note` is now **write-only**, and the warning hard-codes one entry's failure mode

Before FX-01, `spawn.ts:1103` interpolated `${instability.note}`. FX-01 inlined that note's *text*
as a fixed literal and repurposed the field to carry provenance. `note` now has **no reader
anywhere** in `.pi/extensions/pij/` — I grepped, and I proved it:

- **MUT-F** — replace the note with `"TOTALLY WRONG: the model works fine, no provenance at all."` →
  the emitted warning is **byte-identical**. So the provenance sentence added to satisfy F-2 never
  reaches the operator who reads the warning.
- **MUT-G** — add a second entry (`gpt-5.6-sol`, `cli: "9.9.9"`, note `"HTTP 503 gateway timeout on
  streaming responses only"`). The catalog then emits:

  ```
  warning: gpt-5.6-sol on GitHub Copilot CLI 9.9.9 is unstable upstream: HTTP 400 'invalid request
  body' on every request path (-p and interactive) observed 2026-09-01 ~01:00Z, … pick
  gpt-5.6-terra or gpt-5.6-sol. …
  ```

  — a **measured-sounding claim that was never measured** for that model, plus a recommendation of
  the very model being warned about.

This is latent today (one entry, and I confirmed no second id normalizes into the map), exactly as
F-3 was latent when it was rated low — so **low**, and it does not block. I raise it because it is a
*regression introduced by the fix pass* and it is the same class of error the 08:20Z ruling exists
to prevent: `interactive:false` was forbidden for asserting an unmeasured property, and a hard-coded
failure mode asserts one for every future row. **Fix**: restore `${instability.note}` in the template
and carry provenance in a separate field (e.g. `provenance`), or rename `note` to something that
does not read as the measured fact.

### R-2 (info) — the operator-facing doc sentence is unpinned

Nothing under `.pi/` reads `docs/how/pij-models-discovery.md`, so its copy of the measured sentence
can drift from `registry.ts` without any test noticing. It is correct today (I diffed the wording).
Pre-existing, not introduced by FX-01 — recorded because F-1 propagated into exactly this file, and
a doc-pinning assertion would have caught it there too.

### R-3 (info) — `spawn-validation.test.ts` mocks whole node builtins with one export each

`vi.mock("node:fs", () => ({ readFileSync }))` and `vi.mock("node:os", () => ({ homedir }))` are
file-scoped and fit `registry.ts`'s current usage exactly (`readFileSync`, `homedir`, plus `join`
from `node:path`, unmocked). The moment anything in that import graph calls another `fs` export, the
whole file fails with an opaque `TypeError` rather than the mock's deliberate
`unexpected catalog path` error. Cheap hardening: spread the real module and override only
`readFileSync`.

### R-4 (info) — one surviving test narrowed its provider prefix

`resolveCopilotInstability` › *normalizes a provider-qualified Flash id* changed
`"github-copilot/gemini-3.6-flash"` → `"copilot/gemini-3.6-flash"`, forced by the new fixture's
`provider: "copilot"`. No live gap: I confirmed the real catalog carries **both** projections and
annotates both. Recorded only so the coverage change is on the record rather than invisible.

## §R4 Verdict

**APPROVE-WITH-FINDINGS** — highest **low** (R-1). **F-1, the medium that pass 1 said must be fixed
before merge, is resolved**, and I confirmed it against the physical evidence rather than against the
coder's claim. F-2, F-3, F-4, F-5, F-6 and F-7 are all fixed, and — the part that matters most — the
three mutations that **survived** the entire suite in pass 1 (M2, M4, M6b) now all go **RED**, so the
fixes are pinned rather than merely present. The brief's own mandated Dim-0 finally produces the RED
it always predicted, and the annotate assertion is no longer self-referential.

The work is honest about what it did not observe: the relayed `~07:33Z` pass is now labelled as
relayed in five places instead of presented symmetrically with an instrumented measurement. That was
F-2's actual point and it is well served.

**Nothing here blocks merge.** R-1 is a cheap follow-up (restore one interpolation, add one field)
and is worth taking before a second model is ever added to the map — it is inert until then. R-2,
R-3 and R-4 are for the record.

---

**TERMINAL REPORT.** This pass is **CLOSED**. No mutation, edit or command was run against the repo
after this section was written. All five mutations (MUT-A…MUT-G, applied and reverted one at a time)
were restored and verified byte-identical (`cmp`, `git hash-object` vs `HEAD:<path>`,
`git diff --exit-code`) **before** this file was appended to; untracked delta zero; HEAD unmoved at
`9726601b331f76cdbb440f547ee36da18852da21`. This file is the only path I wrote.

Evidence retained: `~/.pij/pij-powerful-whale/bg-mtbtinqf-igyixi.log` (full gate);
`/tmp/pw-baseline-status.txt`, `/tmp/pw-status-close.txt`, `/tmp/pw-orig-*.ts`,
`/tmp/pw-bcsc-{73f4a90,8dd8f1e,9726601}.ts`, `/tmp/pw-probe.mts`, `/tmp/pw-probe2.mts`,
`/tmp/pw-extract.py`, `/tmp/pw-changed.txt`, `/tmp/pw-allowed.txt`.

`9726601b331f76cdbb440f547ee36da18852da21`
