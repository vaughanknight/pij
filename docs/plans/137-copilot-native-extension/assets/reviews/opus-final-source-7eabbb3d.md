# Final independent source/evidence review — pin `7eabbb3d`

Reviewer seat: `pij-static-rhinoceros` (Opus, OMP, `github-copilot/claude-opus-5`, high).
Packet: `assets/inputs/pm-final-review-7eabbb3d.json`.
Pin: `7eabbb3d9b2a92c7c974b7c5ac1a215497762647` — *docs(copilot): record native
lifecycle proofs and active transport ownership*, Sat Sep 5 14:44:59 2026 +1000,
single parent `b3951923a572fa8ed4da48c0c8403a7266105cfa`.

Method unchanged from prior reviews: read committed source at the pin
(`git show <sha>:<path>`), disbelieve receipts and verify the source that
produced them, grade evidence by what it actually exercised rather than by its
label. No builds, tests, lint, launches, or peers. Read-only throughout.

---

## Verdict

**Source: approved.** Every focus item in the packet is satisfied by the
committed source, and two of them are satisfied more strongly than the packet
claims. I found no material defect in the delta.

**No release recommendation.** Three things stand between this pin and one, and
only the first two are the PM's stated blockers:

1. `pm-native-local-10.json` and the final gates postdate the pin and do not
   exist yet. Nothing is graded here that depends on them.
2. **Spawned mode has never been exercised against a real provider.** Every
   spawned receipt in this pin is `deterministic-local-fixture-not-real-inference`.
   The packet's own acceptance line forbids claiming real-provider spawned mode
   unless actually exercised, so this must be stated in the release note rather
   than resolved by full10 (full10 is fixture-provider too, unless run otherwise).
3. G2 remains an explicit design residual, correctly documented.

---

## Pin composition

`125c0905..7eabbb3d` is six commits, linear except one two-parent merge:

```
7eabbb3d  docs(copilot): record native lifecycle proofs and active transport ownership
b3951923  test(copilot): prove whole-host death before native cold resume   [merge: b49c2a5e + 001b9b94]
001b9b94  fix(copilot): prove owned host death before cold resume
b49c2a5e  test(copilot): witness preauthorized tool execution and measured exit ghost  [merge: 51973efc + 0131cd6e]
0131cd6e  fix(copilot): distinguish preauthorized tools and exit ghosts
51973efc  test(copilot): distinguish typed lifecycle command from native ghost text  [merge: 125c0905 + afcdb4c2]
afcdb4c2  fix(copilot): verify measured lifecycle command ghosts
```

30 files, +11 471 / −95. Working tree carries only the untracked review packet;
nothing else is dirty.

### The single most load-bearing fact about this delta

```
$ git diff --stat 125c0905 7eabbb3d -- crates .copilot
(empty)
```

**Not one byte of the Rust workspace or the native Copilot receiver changed.**
Focus item 5 — "all previously accepted product invariants remain" — is therefore
not an argument, it is an identity. No sendkeys body/control fallback,
tuple/target/attempt authority, the native acceptance journal, release-before-ACK,
correlation, the ruled typing policy, and the attachment-only refusal are all
byte-identical to the state I reviewed at `da727fcd` and `5222f518`. I re-derived
the receiver digests at the pin and they match every receipt in the plan:

| module | sha256 at `7eabbb3d` |
|---|---|
| `.copilot/extensions/pij/extension.mjs` | `567fccce84c2c8c5f173123ec46492bb6a79e72af1c1d656a1270ebd334b30a3` |
| `.copilot/extensions/pij/store.mjs` | `2cc04cb1ea7ae7fac481711dad1a088c8fbe072e27a1707c9ea37564b57d7b4c` |

The same two digests appear in `pm-native-real-canary-04.json` (real model, at
`da727fcd`) and in every fixture-provider probe committed here. **The real-model
run and the fixture runs exercised the identical receiver bytes.** That is what
makes the fixture-provider evidence in this pin worth anything at all, and it is
the reason a driver-only delta does not invalidate the older real-model receipt.

The delta is: driver (+353), driver tests (+742), three fixtures (+385), six
evidence receipts, three install taps, docs/skills/domain prose, one TypeScript
doc-comment block, plan/tasks/backpressure rows, and my `125c0905` review — which
I confirm was committed byte-identical to the corrected on-disk copy
(`b02a5927e0f0…`), ac-0006/ac-0007 correction included.

---

## Focus 1 — measured lifecycle ghost handling

**Grade: approved, and the implementation is stronger than the claim.**

`nativeComposer` is untouched (context-only in the diff). The ghost logic lives in
a new closure `stagedCommand(field)` inside `driveSmokeLifecycleCommand`
(`copilot-native-smoke.ts:765`), so the product-shaped parser is not taught about
placeholders. That is the right seam.

Geometry is measured, not inferred. `captureSmokePaneViewport` batches
`display-message -p "#{cursor_x}\t#{cursor_y}\t#{pane_width}\t#{pane_height}"`
with `capture-pane -p` (**no `-J`**) in one tmux invocation and passes
`preserveOutput = true`, so `command()` skips its `.trim()` (`:253`). Both details
matter and both are correct:

- unjoined capture means one output line is one physical pane row, so `cursor_y`
  indexes `terminal.split("\n")` directly;
- untrimmed output means no leading rows are eaten, so that index stays aligned.

This is the exact hazard I flagged before the fix landed (pane-absolute `cursor_x`
against a trimmed string), and it is closed properly rather than papered over.

The acceptance test is the honest one:

```ts
const prefix = `┃ ${command}`;
… cursor_y !== top + 1 || cursor_y >= pane_height || cursor_x >= pane_width ||
   cursor_x !== prefix.length ||
   !/^╹▀+$/.test(lines[cursor_y + 1]?.trim() ?? "") ||
   lines[cursor_y]?.slice(0, cursor_x) !== prefix ||
   lines[cursor_y]?.slice(cursor_x).trimEnd() !== (ghost ? ghostSuffix : "")
```

**`cursor_x === prefix.length` is the whole argument.** Typed input is what lies
*before* the cursor; a ghost is what lies *after* it. A human who literally typed
`/new [prompt]` lands the cursor at `prefix.length + 9` and is refused. Nothing
here trusts the rendered glyphs alone.

Ghost authorization is bounded to the adjacent menu, never the transcript: the
upward scan stops at the first blank-or-scrollbar row (`/^\s*┃?\s*$/`), malformed
rows are deliberately *not* treated as boundaries so they land inside `menu` and
fail `every()`, and the accept condition is a conjunction —
`every(well-formed) && selected.length === 1 && selected[0] command === command`.
`/exit print` is admitted to the menu grammar as a sibling row but can never be
the selection for `/exit`, because the capture regex
`^ {2}❯ (\/[a-z][a-z-]*)(?: {2,}\S.*)?$` yields `/exit` only from an exact
`❯ /exit` row. Prefix collisions (`/newer` for `/new`) are refused by string
equality on the captured group.

Every failure path returns `false` into `until(...)` or throws — the driver never
reaches `send-keys Enter` on a doubtful frame — and the pre-submit recheck was
upgraded from a bare `nativeComposer` compare to the full geometry check
(`assert.equal(stagedCommand("before_submit"), true, …)`).

The test matrix is the strongest part of this delta: 17 rejection cases, each run
twice (at stage and at recheck), each asserting *exactly one* `send-keys` — the
typed command — and `witness.command_submitted === undefined`. It covers cursor
before command end, cursor inside placeholder, **placeholder actually typed**,
cursor on a suggestion row, cursor outside the pane, missing measured cursor,
unknown ghost text, wrong selection, prefix-only selection, plain command with a
stale wrong selection, missing selection, duplicate selection, malformed selection
indentation, two flavours of *hidden duplicate selection* smuggled across
malformed or unknown menu rows, incomplete composer repaint, and historical
selection only. The positive cases submit `/new` at `cursor_x 6` and `/exit` at
`cursor_x 7` — precisely `"┃ /new".length` and `"┃ /exit".length`.

Both command fixtures are provenance-stamped to real receipts and carry an
explicit honesty note: *"Retained final capture, not an atomic capture of the
earlier failed stage read."* Correct and worth preserving — the unit tests prove
the recognizer accepts a genuine ghost frame; they do not prove staging succeeds
live. `pm-native-lifecycle-probe-03` and `pm-native-spawned-lifecycle-01` supply
the live half, and they pass.

---

## Focus 2 — preauthorized spawned tool path

**Grade: approved. The `--yolo` provenance is the point, and it is clean.**

The driver contains exactly one occurrence of the string `yolo`, and it is a read:

```ts
assert(/(?:^|\s)--yolo(?:\s|$)/.test(launch.process), `${fail}: existing launch policy unavailable`);
```

The flag itself is emitted by **product** spawn code — `crates/harnesses/src/spawn.rs:123`
and `.pi/extensions/pij/core/spawn.ts:439`. The driver grants nothing; it observes
what pij already does when it spawns a Copilot worker. `launch.process` is the
`ps` line captured at launch and stashed in `launchProofs`, and it is cross-checked
against the seat (`ps` PID field equals `seat.proc.pid`, pane equals, harness
`copilot`, `native_extension_delivery === true`). The committed receipt shows the
real argv:

```
… copilot --no-custom-instructions --disable-builtin-mcps --no-remote
          --no-auto-update --allow-tool=pij_send --yolo
```

Absence of a dialog proves nothing here, and the code says so structurally. It
demands positive evidence in this order:

1. `session.start` whose `sessionId` equals the launched seat's session;
2. the incoming `user.message` located by `incomingEventId`;
3. exactly one `tool.execution_start` **after** it (`starts.length <= 1`);
4. a `session.permissions_changed` strictly **before** that start — the loop
   `for (…) { if (event === start) break; … }`, commented *"A later grant cannot
   authorize an invocation that has already started"* — with
   `allowAllPermissions === true` and `allowAllPermissionMode === "on"`;
5. `toolName === "pij_send"` and `deepEqual(arguments, {to, message})`;
6. exactly one `tool.execution_complete`, distinct id, later index, matching
   `toolCallId`, `success === true`, parseable result with `ok === true`;
7. the result's `receipt.msg_id` joined to exactly one durable job row —
   `dedupe_key`, positive integer id, `serial_key`, `kind === delivery:<to>`, and
   payload `from`/`to`/`body`/`msg_id` all exact.

`keys: []` is recorded on the witness, `assert(approval !== true)` refuses any
approval dialog appearing under preauthorization, and a fresh capture re-checks
that no dialog appeared before completion. A revocation would arrive as a later
`permissions_changed` with `allowAllPermissions: false` and fail the assert.

The grade string is honest and I want it preserved verbatim:
`native-tool-executed-not-human-approved-not-model-complete`.

Staleness check: `pm-native-spawned-probe-02` was produced at `b49c2a5e`, two
commits behind the pin's parent. I checked the intervening diff — 113 driver lines,
**zero** of them touching `confirmSmokeToolInvocation` — and in any case
`pm-native-spawned-lifecycle-01` carries the same `preauthorized-executed` witness
at `b3951923`. No staleness gap.

---

## Focus 3 — `/exit` is submission-only; owned whole-host teardown

**Grade: approved. The brake/policy framing in the code is correct.**

`stopSmokeNativeHost` (`:867`) opens with `// These checks are brakes: removing one
could only broaden destructive teardown.` That is the right classification under
the repo's own test — remove any of them and the sweep kills *more*, never
something *different* — and it saves the next reviewer from hunting for a
retention policy behind a `kill-pane`.

Ownership is proven, not assumed:

- `previous.harness === "copilot"`, `launch.harness === "copilot"`,
  `launch.native_extension_delivery === true`;
- `previous.pane === launch.pane`, `/^%\d+$/`;
- `deepEqual(proc, launch.proc)` — the process being killed is the one *this
  fixture launched*, not merely one occupying the pane;
- `tmux display-message -p "#{socket_path}"` must equal the expected private
  socket, and the pane must appear in that socket's `list-panes -a`. Ownership of
  the socket plus membership of the pane is what makes `kill-pane` narrow.

Submission and death are kept apart, which is the substantive finding. `observe()`
runs **before** teardown and is stored as `witness.after_native_exit`. The
committed receipt shows exactly the behaviour the docs describe:

```
after_native_exit : { pid 1662, state "alive"  }   ← /exit submitted, host survived
last_liveness     : { pid 1662, code "ESRCH"   }   ← after kill-pane
host_death        : { pid 1662, evidence "kill(pid, 0): ESRCH" }
```

Only `ESRCH` releases the resume path; any other `kill` error rethrows; PID reuse
would report *alive* and time out, so the failure direction is conservative. The
status string `host-death-proven-not-resume-proven` refuses to overclaim.

Failed teardown cannot be concealed: on `kill-pane` failure the pane list is
re-read; if the pane is still there the original error is rethrown; if the
re-read itself fails, the original error is rethrown. The one narrow allowance —
pane vanished during a failed close — still rethrows the teardown error unless
`ESRCH` is independently observed, retains `teardown_error` on the witness, and is
covered by the test *"accepts a natural exit racing closure only with subsequent
ESRCH"*. I accept it as a tested, bounded exception rather than concealment.

The resume half is real. The receipt shows same pij id and same native session
across the restart with a **new** process tuple (`pid 1662 → 9317`,
`proc_start 20260905144259 → 20260905144307`), the resume argv carrying
`--resume=03e8dab9-…`, and a subsequent delivered message with a reader-read ACK
and job `state: done`. Grade: *"native-accepted-not-model-complete; real host
death observed before fresh manual resume."*

---

## Focus 4 — docs describe native ownership; legacy stays truthful

**Grade: approved.**

`selectTransport` still exists and its **body is unchanged** — only the doc
comment moved, from "how a message reaches a session" to "Legacy TypeScript
transport classification, not current native routing… callers must never use it
as a Copilot fallback." Nothing was quietly rewired; a stale description was
corrected. `domain.md` adds the `.copilot/extensions/pij/` row and demotes the
old seam entry the same way. `pij.md` and `workflow.md` now say Copilot is
native-only, that missing capability queues or refuses, and that the tmux pane is
"a presentation and consent-observation surface, never its message transport."

On the `/pij ready` requirement specifically — a Copilot seat with the native
`pij_send` tool is extension-owned and must "Reply `Ready.` and STOP — run NO
competing identity/adopt/inbox command"; without the tool it must report native
setup unavailable and stop, with an explicit statement that adopting or starting
a CLI pull receiver **is not a delivery fallback**; and the `pij adopt --harness`
list is narrowed from `claude|copilot|codex` to `claude|codex`. **No competing
Copilot inbox consumer can be created by following these docs.** Route table row
E gives native `pij_send` first precedence, and row F says never re-adopt an
extension-owned seat.

Attachment-only refusal is unchanged by construction — it lives in `crates/`,
which has no diff.

---

## Focus 5 — retained product invariants

**Grade: approved by identity.** See the empty `crates`/`.copilot` diffstat above.

---

## Evidence grades

All six new receipts are committed at the pin. All ran the **real GitHub Copilot
CLI 1.0.84-0**, `copilot_sha256 8ba28908…`, identical to the binary in the
real-model canary — the *provider* is a local deterministic fixture
(`startFixtureProvider`), the *host* is genuine. That distinction is what these
receipts are worth: real CLI composer geometry, real tmux panes, real process
tuples, real daemon, deterministic tokens.

| receipt | mode | src | status | what it actually proves |
|---|---|---|---|---|
| `pm-native-lifecycle-probe-03` | manual | `b3951923` (pin parent) | passed | `/new` rollover, old-context exclusion, owned pane close, ESRCH, cold `--resume` + delivery |
| `pm-native-spawned-lifecycle-01` | spawned | `b3951923` | passed | spawned `/new` with retained spawn correlation, old-context exclusion, preauthorized execution |
| `pm-native-spawned-probe-02` | spawned | `b49c2a5e` | passed | daemon spawn/prebind/initial task/roundtrip + second receive, preauthorized execution |
| `pm-native-lifecycle-probe-01` | manual | `51973efc` | failed | historical: staging timeout; source of the `/exit` frame fixture |
| `pm-native-lifecycle-probe-02` | manual | `b49c2a5e` | failed | historical: host survived `/exit` — the observation that motivated `stopSmokeNativeHost` |
| `pm-native-spawned-probe-01` | spawned | `51973efc` | failed | historical: approval-dialog timeout under `--yolo`, i.e. the bug |

The two retained failures are the right thing to commit: `probe-02`'s
`PIJ_NATIVE_TIMEOUT: actual native host exits before resume` is the measured
evidence that `/exit` closes a conversation and not the host, and `probe-01`'s
approval-dialog timeout is the measured evidence that a preauthorized spawn never
shows one. The fixes follow the observations rather than the other way round.

### ac-0007 — two of three clauses now discharged live

My `125c0905` review listed rollover and old-process replacement as open. **Both
have moved.**

- *Reconnect / key rotation* — already discharged (local-09 witness 10).
- *Reload / native-session rollover* — **now discharged.** `/new` staged at
  measured cursor `6,45,160x48`, submitted, producing a new pij id and new native
  session on the **same PID 1662**; the retired seat is tombstoned; the old
  session's inbox claim is refused `400 native-extension-unavailable: Copilot
  requires current native registration`; fresh delivery lands on the successor.
  Spawned mirror at PID 2442 with spawn correlation retained.
- *Old-process replacement* — **now discharged** by the teardown/ESRCH/resume
  chain above.

Grades on both rollover witnesses honestly note *"private abort signal not
observed."*

---

## Findings

**F1 — real-provider coverage is manual-mode-only, and nothing in this pin
changes that. (Material to the release note, not to the source.)**
Every spawned receipt, including the preauthorized-execution proof, is
`deterministic-local-fixture-not-real-inference`. The only `real-model` receipt in
the plan is `pm-native-real-canary-04.json` — manual mode, at `da727fcd`, model
`auto`, `gpt-5.6-luna`. The packet's cover note reads "all scoped
manual/spawned/lifecycle/cold-host **and real-model** receipts now committed and
passed", which is true clause-by-clause but invites the reading that spawned mode
has real-model backing. It does not. The mitigation is real and I state it
plainly: the receiver digests are identical across the real-model run and every
fixture run, and the entire `da727fcd..7eabbb3d` delta is test-harness-only, so
the fixture receipts test the same shipping bytes. Requested action: no code
change; the release note must say *real-provider coverage: manual mode only;
spawned mode proven against the real CLI host with a deterministic provider.*
This is also the packet's own acceptance clause, so I expect no disagreement.

**F2 — `cursor_x` is a tmux cell column used as a JS string index. Observation,
not a defect.** `lines[cursor_y].slice(0, cursor_x) !== prefix` assumes one
character per cell. True for every frame in evidence (box-drawing plus ASCII, all
single-width), false in principle for wide or combining characters. It is a
one-directional brake: misalignment makes the slice comparison fail, so the driver
*refuses* to submit. Removing the check would broaden submission, never redirect
it. No action needed; recording it so a future East-Asian-locale or emoji frame is
diagnosed in seconds instead of hours.

**F3 — documentation regression on a non-Copilot path. Low.** Route table row F
in `skills/pij/references/00-routing.md` previously ended *"external registration
repairs stale push attachment before any other identity/view action (C1)"*. The
rewrite replaced that clause with Copilot-specific guidance, and the string now
appears nowhere in `skills/`. Claude/Codex external pull peers lose the hint about
repairing a stale push attachment. Product behaviour is unchanged (`crates/` has no
diff) — this is prose only. Suggest restoring the clause for the remaining pull
harnesses in a later docs pass; it does not gate this pin.

---

## Residuals carried forward

- **G2** — post-claim unavailable remains an explicit safe terminal hold, no
  silent retry introduced. Confirmed unchanged: no receiver diff. Correctly
  recorded as a design residual, not a defect.
- **F-C** (from the v4 adjudication) — timer/unblock policy still excluded;
  accepted residual, not closed.
- Box-geometry recognizer redesign is prime-approved future work; this pin adds
  no third footer variant. Confirmed — `is_copilot_footer` is in `crates/`, which
  has no diff.
- No global rollout, public push, or main merge is authorized or attempted here.

---

## What a release recommendation still needs

1. `pm-native-local-10.json` — canonical both-mode driver at this pin, committed,
   digest-checked, `status: passed`.
2. `harness checks` plus the Rust workspace at this pin, committed.
3. A release note that states F1 in the PM's own words: no claim of real-provider
   spawned mode, because it was not exercised.

I will append the final evidence adjudication to this file when those land. Until
then:

## Status

- **Source at `7eabbb3d`: approved.** No material defect found in the delta.
- Focus items 1–5: all satisfied; items 1 and 5 exceed their claims (measured
  cursor binding with a 17-case rejection matrix; product invariants preserved by
  byte identity rather than by argument).
- ac-0006: checked, concurred, ruling discharged.
- ac-0007: rollover and old-process replacement now discharged live; the criterion
  is satisfied on the evidence in this pin.
- Open: canonical full10 and final gates (do not exist yet); real-provider spawned
  mode (never exercised); G2 (accepted design residual).
- **No release verdict.**

---

## Addendum — closeout narrowed (appended, nothing above rewritten)

Jordan narrowed closeout after this review was written: do not over-test, do not
make contracts via tests, no new review cycles or test requests; finish only an
already-in-progress material source finding, otherwise freeze.

Nothing was in progress. The source review above is complete and stands.

**"What a release recommendation still needs" is withdrawn as a request.** Items
1 and 2 in that list were asks for future receipts; under the narrowed closeout I
am not asking for them and will not grade them. Item 3 was never a test — it is a
wording accuracy point and it survives as F1.

What this means for the record, stated precisely so nobody has to reconstruct it:

- **Source at `7eabbb3d`: approved.** Unchanged. It never depended on the pending
  runs — it rests on committed source, and on `crates`/`.copilot` having an empty
  diffstat across the whole range.
- **ac-0006 and ac-0007: satisfied on committed evidence.** Also unchanged, and
  also independent of the pending runs.
- **F1 stands and is now the only thing I would put in a release note.** Not a
  test request: real-provider coverage is manual mode only; spawned mode was
  proven against the real Copilot CLI host with a deterministic provider. Say it
  that way and the record is accurate.
- **F2 and F3 stand as recorded** — an observation and a docs nit. Neither asks
  for a test or a cycle.
- **No release verdict, and I am not withholding one pending further evidence.**
  I reviewed source; a release call is the PM's and Jordan's, on the gate
  resolution they are finishing. This artifact should not be read as a blocker.

I am not reviewing the fixture `HOME` contamination fix or the final smoke/gate
resolution. Frozen here.
