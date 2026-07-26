# s072 cross-model review

**Reviewer:** pij-exciting-mammal (copilot / GPT-5.6 Terra)  
**Base:** `41f350d`  
**Verdict:** **FIX_REQUIRED**

## Findings

### F-001 — HIGH: a recycled tmux pane ID is treated as proof that the old seat is live

`classifyAttachment()` unconditionally returns `live` for `paneLive`
([`revive.ts:177`](../../../.pi/extensions/pij/core/revive.ts#L177)). The CLI
sets that boolean from only `tmux.isPaneLive(descriptor.paneId)`
([`cli.ts:1241`](../../../.pi/extensions/pij/cli.ts#L1241)), which in turn
only queries `#{pane_dead}` by pane ID
([`adapters/tmux.ts:222-228`](../../../.pi/extensions/pij/adapters/tmux.ts#L222-L228)).
It does not corroborate the pane against the recorded pane PID, a start time,
the old tmux server, or any seat identity.

I created and stopped a private tmux server twice:

```text
$ tmux -L s072-review-pane-reuse ... #{pane_id}
%0
$ tmux -L s072-review-pane-reuse ... #{pane_id}    # after kill-server/restart
%0
```

I also evaluated the production classifier with `paneLive: true`,
`pidAlive: false`, `terminalObserved: true`, and boot-time corroboration; its
result was `live`. `planRevive()` then refuses `live` before considering either
`--print` or `--assume-dead` ([`revive.ts:440-445`](../../../.pi/extensions/pij/core/revive.ts#L440-L445)).

Consequently, after the host-reboot scenario this feature is for, a newly
created unrelated `%N` in the new tmux server can make the old descriptor
unrevivable, including with the documented override. This is a common
reboot-path failure, not merely stale observability. Corroborate a live pane
with attachment identity (or conservatively classify it `uncertain`) and add a
restart/reused-pane regression case.

### F-002 — HIGH: `--print` still calls tmux despite its explicit no-tmux contract

The brief requires `--print` to exit without touching tmux, and the review
packet makes that unambiguous: **no tmux call**. The implementation probes the
prior attachment before the print branch
([`cli.ts:1515-1517`](../../../.pi/extensions/pij/cli.ts#L1515-L1517)); that
probe calls `tmux.isPaneLive()` ([`cli.ts:1238-1249`](../../../.pi/extensions/pij/cli.ts#L1238-L1249)).
The print return is later at
[`cli.ts:1571-1623`](../../../.pi/extensions/pij/cli.ts#L1571-L1623)).

The new integration test confirms the call rather than preventing it:
[`cli.integration.test.ts:988-993`](../../../.pi/extensions/pij/cli.integration.test.ts#L988-L993)
expects a `display-message ... #{pane_dead}` entry. This is not a write, and
the review independently mutation-tested that `--print` does not unarchive,
but it violates the stated read-only/no-tmux operational contract. Skip
attachment probing in print mode (and report it as unprobed) or amend the
accepted contract explicitly.

### F-003 — MEDIUM: mutation evidence is asserted, not recorded

The brief requires each mutation and its red output to be printed
([`brief.md:114-115`](brief.md#L114-L115)). The execution log records only
the aggregate claim “15 Dim-0 mutations” ([`execution.log.md:62`](execution.log.md#L62));
it does not identify the guard, mutation expression, target suite, or red
output. This made the claimed G11b/G12 history unauditable; the independent
mutations below establish current coverage but cannot verify the claimed
historical runs.

## Dimension 0 — independent mutation evidence

Each command used `just flow-pair-mutate`, which rejects an unmatched mutation,
requires the target suite to go red, restores the source byte-for-byte, and
requires green after restoration. The Vitest output reported failed **tests**
(not a TypeScript compile failure) in every mutant.

| Guard mutated | Target suite | Mutant result |
|---|---|---|
| `paneLive => live` changed to false | `core/revive.test.ts` | RED, 2 failed tests; restored GREEN |
| `!pidAlive => stale` inverted | `core/revive.test.ts` | RED, 2; restored GREEN |
| terminal-observation corroboration removed | `core/revive.test.ts` | RED, 1; restored GREEN |
| host-boot comparator inverted | `core/revive.test.ts` | RED, 2; restored GREEN |
| uncertain-write guard removed | `core/revive.test.ts` | RED, 1; restored GREEN |
| uncertain-write guard partially bypassed (`... && false`) | `core/revive.test.ts` | RED, 1; restored GREEN |
| no-guess resolver changed to select the first ambiguous seat | `core/revive.test.ts` | RED, 1; restored GREEN |
| `--print` archive guard changed to always unarchive | `cli.integration.test.ts` | RED, 1; restored GREEN |
| `--print` archive guard inverted (print-only unarchive) | `cli.integration.test.ts` | RED, 1; restored GREEN |

The two alternate mutants are distinct shapes of the G11b uncertain-write and
G12 print-mode violations. The targeted assertions are load-bearing for those
guards. They do **not** cover F-001 (reused tmux identity) or F-002 (no tmux
call), so the test-quality dimension cannot approve the change.

## Other review evidence

* **Resolver:** `resolveSeatForFolder()` refuses multi-seat ambiguity and uses
  realpath values supplied for both cwd and descriptors
  ([`revive.ts:228-257`](../../../.pi/extensions/pij/core/revive.ts#L228-L257));
  the CLI resolves both sides before comparison
  ([`cli.ts:1192-1227`](../../../.pi/extensions/pij/cli.ts#L1192-L1227)).
* **PID corroboration:** terminal observations outrank a recycled PID only
  after the pane is considered gone; `unavailable` is excluded
  ([`cli.ts:1243-1248`](../../../.pi/extensions/pij/cli.ts#L1243-L1248)).
  A genuine currently live pane remains `live`, so this path does not silently
  declare it dead. The pane-identity bug above is a false-positive `live`, not
  an unsafe false-dead result.
* **`--assume-dead`:** it cannot override an actual `live` classification
  because the live guard precedes it. The usage and docs state its PID-recycle
  blast radius. It does not cure F-001 because a reused pane is misclassified
  as live.
* **Shell quoting:** pure probes of spaces, quotes, `$`, backticks, command
  substitution text, and newlines all produced POSIX single-quoted output;
  single quotes use the standard `'\''` sequence. No injection defect found
  in `shellQuote()` ([`revive.ts:261-274`](../../../.pi/extensions/pij/core/revive.ts#L261-L274)).
* **Five golden lines:** all five are asserted verbatim
  ([`revive.test.ts:544-604`](../../../.pi/extensions/pij/core/revive.test.ts#L544-L604)).
  The pi/omp no-attach split is real: resumed Pi derives its stable identity
  from its native session, finds the dissolved descriptor, and calls
  `registry.revive()` ([`session.ts:207-242`](../../../.pi/extensions/pij/core/session.ts#L207-L242)).
  The human-facing explanation at `cli.ts:1612` inaccurately says it reads
  `PIJ_SESSION_ID`; that variable is produced at boot rather than supplied by
  the pi/omp line. This is a **low-severity documentation rationale issue**,
  not a demonstrated self-adoption failure.
* **`--attach` root relation:** a plain operator shell deliberately has no
  `reviverId`, so `buildRevivedDescriptor()` clears `spawnedBy`/`parentId`
  ([`revive.ts:549-551`](../../../.pi/extensions/pij/core/revive.ts#L549-L551)).
  For the requested rebooted prime this is correct; for a non-prime it loses
  historical tree linkage. **LOW / accepted design trade-off**, not a release
  blocker.
* **Fakes versus reality:** the CLI integration suite uses real CLI code,
  filesystem registry/archive records, and native-artifact lookup. It does not
  simulate a new tmux server reusing `%N`, which is precisely the missed
  identity boundary in F-001. The real archive test and the two print archive
  mutations do prove the former hardcoded-tier blind spot is now covered.

## Gates

| Command | Observation |
|---|---|
| `just typecheck` | exit 0 |
| `just lint` | exit 0; 9 pre-existing warnings, 0 errors |
| `just test` (run 1) | exit 1: unrelated `packages-bootstrap.test.ts` 5s timeout |
| `just test` (run 2, serial) | exit 1: the same package-bootstrap timeout plus the known unrelated `daemon-push.test.ts` 5s timeout |
| `npx vitest run harness/scripts/packages-bootstrap.test.ts` | exit 0; 2/2 |
| `npx vitest run .pi/extensions/pij/daemon-push.test.ts` | exit 0; 19/19, 2 skipped |
| `harness checks` | exit 1: every stage except smoke passed (including its full test stage); smoke lost tmux pane `%2717` while its spawned package-bootstrap flow was idle |

The observed full-suite failures are timeout flakes outside this diff; their
isolated runs pass, and the completion gate subsequently passed its test
stage. I cannot prove their root cause or that the full suite is stable. The
completion gate is still nonzero because its smoke scenario failed.

## Coverage limits

* **NOT OBSERVABLE:** an actual OMP descriptor/paste round-trip; none is
  available on this machine.
* **NOT OBSERVABLE:** real pasted copilot, codex, pi, or OMP resumption. The
  static pi/omp resurrection path is coherent, but it is not an end-to-end
  paste proof.
* **NOT OBSERVABLE:** an actual host reboot. The private tmux restart directly
  demonstrated the relevant pane-ID reuse mechanism.

`1b97738` remains docs + `.gitignore` only relative to the specified base, so
rebasing would not change the reviewed runtime behavior.

## Fix round 01 re-review (2026-07-26)

### Verdict: FIX REQUIRED

F-002 and F-003 are closed under the amended `--print` contract, but F-001 is
only closed for the common pane-ID-only collision. A reboot can recycle the
pane PID too, and the new equality check promotes that collision to irrevocable
`live`.

### F-001 remains HIGH — pane PID is another recycled identifier

The new shape correctly preserves the requested properties:

* `pane: "ours"` is `live`, preserving the no-false-dead direction
  ([`revive.ts:200-205`](../../../.pi/extensions/pij/core/revive.ts#L200-L205)).
* `pane: "not-ours"` stops at `uncertain` before terminal/boot-time evidence
  can fall through to `stale`.
* In an actual private tmux restart, `%0|78922` became `%0|78986`. The real
  CLI printed `priorAttachment: "uncertain"` and `priorPane: "not-ours"`;
  `revive --attach %0 --assume-dead --json` then reached
  `pending-canary`.

However, `observePane()` identifies an old pane solely by equality of
`#{pane_pid}` and the descriptor PID
([`cli.ts:1250-1267`](../../../.pi/extensions/pij/cli.ts#L1250-L1267)).
PIDs also restart and recycle across the host reboot this feature serves. I
re-ran the real CLI against the fresh `%0` server with a descriptor whose
recorded activity predated this host boot but whose recorded PID equalled that
fresh pane's PID. It failed before `--assume-dead` with:

```text
E-ARG: session 'pij-reused' still has a live prior attachment; close it before reviving
```

That is a false `ours` verdict: the host-boot evidence proves the old process
cannot be alive, but it is considered only after the unconditional `ours =>
live` return. This is the same recycled-identifier class as the original
finding, only less frequent. The fix must include non-recycled identity
evidence (for example, process/pane start time) or let host-boot evidence
override a matching pane PID when the descriptor predates the boot. Add a
regression for matching `%N` **and** matching recycled PID after a restart.

### F-002 closed — read-only print mode tolerates absent tmux

The amended contract is implemented consistently: print mode makes one
read-only identity query, never mutates registry/tmux state, and maps tmux
execution failure to `unprobed`. The integration runner invokes the real
`cli.ts` subprocess. Its no-binary case overrides `PATH` with an empty
directory plus only the Node executable directory, so it cannot use either the
fake shim or the host tmux; that case passed and preserved the descriptor
byte-for-byte. The no-server shim exits nonzero, exercising the same
`execFileSync` failure branch. The classifier test also proves an unprobed
pane with a dead PID remains `uncertain`.

### F-003 closed — sampled post-fix mutations

I independently reran three mutations not used in the first review, each with
`just flow-pair-mutate` and a single Vitest worker. All applied, produced a
test failure, restored the file byte-identically, and passed after restore:

| Guard | Mutation | Result |
|---|---|---|
| G17 no-false-dead | remove `not-ours => uncertain` | RED (1 test), restored GREEN |
| G18 unprobed safety | make dead PID sufficient without `pane === "gone"` | RED (1 test), restored GREEN |
| G24 pi/omp rationale | replace native-artifact derivation wording with the retracted `PIJ_SESSION_ID` claim | RED (1 test), restored GREEN |

The G17/G18 failures target the respective reused/unprobed liveness assertions;
G24 targets the human-readable pi explanation. The new execution log is now
specific enough to audit the full 24-guard run.

### Gate explanation: supported, but not a clean proof

The host was at load averages above 200 on 16 CPUs during this re-review.
`harness boot` type-checked successfully but its full test stage timed out in
multiple unrelated tests. A diagnostic `npx vitest run --maxWorkers=3` still
timed out once in `core/worktree.test.ts` (3589 passed, 1 timeout, no assertion
failure). The focused s072 suites ran all relevant new cases successfully, but
the larger integration file later timed out in an unrelated `adopt --id` case.

This strongly supports CPU over-subscription as the mechanism for the observed
red gates and gives no direct indication of a defect in this diff. It does not
fully prove the explanation: the claimed constrained-green full suite was not
reproducible here, and a timeout can mask a later assertion. The completion
gate therefore remains NOT PROVEN until it runs cleanly on a sufficiently
available host. This gate uncertainty is not the basis for the verdict; the
remaining PID-reuse false-live path is.

## Fix round 02 re-review (2026-07-26)

### Verdict: FIX REQUIRED

The host-reboot half of FIX-6 is repaired: a matching fresh `%0` pane and
matching pane PID no longer outrank boot-time evidence. However, the new
`PANE_START_SKEW_MS = 5_000` deliberately restores an irrevocable false-`live`
window for an otherwise indistinguishable recycled process. F-002 and F-003
remain closed and were not re-opened.

### FIX-6 host-reboot repair: verified

I created a fresh private tmux server, whose initial pane was `%0` with PID
`33151`, and wrote a descriptor with exactly that pane ID and PID but
`startedAt: 2020-01-01T00:00:00.000Z`. The current host boot is later than that
activity. The real CLI returned a print plan with:

```json
{"priorAttachment":"stale","priorPane":"ours"}
```

It did not return the prior `E-ARG: ... still has a live prior attachment`.
This is the reviewer's original compound reproduction, now through the
revised production CLI.

`tmux 3.6a` on this host reports an empty `#{pane_start_time}`:

```text
%0|2448||0
```

so the claimed `ps -o lstart=` fallback is necessary. `ps` returns a parseable
wall-clock start here. I also ran the real CLI with `ps` absent from `PATH`,
while a wrapper still connected `tmux` to a private real server. A current-boot
matching pane/PID returned the expected unoverrideable live error, proving the
boot-epoch fallback is actually wired. The no-time-evidence unit case remains
`uncertain`; mutating its fallback to unconditional `true` made the focused
suite RED and restored byte-identically.

The `not-ours` branch before time evidence is deliberately more conservative:
with `pane: "not-ours"` and `hostBootAtMs > lastActivityAtMs`, it returns
`uncertain` rather than the safe-but-more-actionable `stale` a time-first
ordering would produce. This is worse only in that it requires
`--assume-dead`; it cannot create a false live/dead result and preserves the
previous strict no-false-dead rule. G31 was independently mutated (removing
that early return), went RED with one failed test, restored byte-identically,
then went GREEN.

### FIX-6 remains HIGH: the five-second tolerance makes a recycled process live

The new start-time comparison is not a proof during its permitted slack:

```ts
paneProcessStartedAtMs <= lastActivityAtMs + PANE_START_SKEW_MS
```

I ran the real CLI against another private fresh `%0` server. Its pane process
started at `2026-07-26T03:30:25Z`; I supplied an otherwise matching descriptor
whose newest activity was `2026-07-26T03:30:21Z`, four seconds earlier and
after this host boot. The CLI returned:

```text
E-ARG: session 'pij-skew' still has a live prior attachment; close it before reviving
```

This is an intentionally constructed observational equivalent, not a claim
that the kernel happened to recycle PID `86267` during the run. But a real
recycled process born in that four-second interval has exactly these observable
facts, and receives the same irrevocable `live` result. The new literal
four-second test explicitly requires that result, so this is deliberate rather
than untested.

Whole-second `ps lstart` granularity can justify a conservative `uncertain`
near a boundary; it cannot justify treating an ambiguous later process as
proof of life. Five seconds also exceeds that granularity. `PANE_START_SKEW_MS
= 0` would still leave same-second ambiguity because the parsed process start
is rounded to seconds. To safely use this signal, require the rounded process
start to be at least one full second before recorded activity (otherwise
`uncertain`), or record a durable incarnation identity. The former preserves
no-false-dead: it converts borderline genuine live seats to an operator
override rather than calling them dead.

### Integrity questions

**A — survival.** The repaired slack test uses a literal `+4_000`, not the
constant it checks. I independently changed `PANE_START_SKEW_MS` to zero:
the focused core suite went RED with one failed test, restored
byte-identically, then went GREEN. I swept constants referenced by all added
test code in this diff; no other changed test derives its asserted input from
the constant it is intended to pin. The superficially similar
`DEFAULT_SPAWN_EXPECTATION_TTL_MS` assertion is present unchanged in base
`41f350d`, outside this diff.

**B — `pij-still-live` fixture.** The fixture identifier appears in exactly
one test. Its first assertion still correctly models `pane: gone, pid: alive`
as `uncertain`; its second puts that actual current process in the recorded
pane, where its process start predates the new `startedAt`, and correctly
asserts `live`. Replacing a date two days behind the current process with
`new Date().toISOString()` repairs the fixture's meaning without changing any
other test's fixture.

**C — fake tmux focus PID.** `FAKE_TMUX_FOCUS_PID` is used only for a
single-field `#{pane_pid}` request made by `focusPanePid()` for the new attach
target. The ordered `#{pane_dead},#{pane_pid}` identity probe remains bound to
the old recorded pane and uses `FAKE_TMUX_PID`. Real tmux reports distinct
PIDs for distinct panes; the override therefore corrects the fake's
one-PID-for-every-pane impossibility rather than merely accepting the new
test.

Focused verification passed: `core/revive.test.ts` (59 tests) and
`cli.integration.test.ts` (73 passed, 1 skipped).

### Observability limit

No actual kernel PID reuse or host reboot was performed. The false-live
finding uses the exact observable state a real collision would produce; the
classifier has no remaining signal that can distinguish it from the
four-second genuine-start case it deliberately accepts.
