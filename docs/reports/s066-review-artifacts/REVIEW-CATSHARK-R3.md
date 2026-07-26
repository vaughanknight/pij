# s066 session-revive — cross-model verification (round 3, final)

Reviewer: **pij-able-catshark** (Claude Opus 5). Scope: **my R2 verdict items only**, verified on
the rebased tree. Prior passes: `REVIEW-CATSHARK.md` (R1, FIX_REQUIRED),
`REVIEW-CATSHARK-R2.md` (R2, APPROVE_WITH_NOTES). Daemon untouched throughout.

## VERDICT: FIX_REQUIRED — one fixture line. Everything else is verified and clean.

Every R2 item I raised **is** closed, and the two I could only *reason* about in R2 — the pre-bound
`sessionId` and the quoted-modal keypress — are now closed **and regression-locked by tests I tried
to break myself**. My mutation spot-check kills 17 of 18 (the survivor is semantically equivalent).
On the substance I would approve.

I am withholding it for one reason: **the focused suite is red on this machine, and the failing test
is one of this stream's own new revive tests.** Root-caused below (R1) — it is a host-dependent
fixture, a two-line fix, not a design problem. "8/8 **on retry**" in the report is the same
symptom. Fix R1 and re-run; I do not need another full pass to flip this to APPROVE.

## 1. Claim-by-claim

| claim | verified | how |
|---|---|---|
| N1: revival expectations no longer pre-set `sessionId` | **YES** | `runRevive` builds a plain `createSpawnExpectation(...)`; post-launch write adds only `paneId`. Both sites asserted (`prelaunchSnapshots()[0]).not.toContain('"sessionId"')`, `expect(expectation).not.toHaveProperty("sessionId")`). Mutants N1a **and** N1b (reintroducing it at either write) both RED. |
| N1: expectation-expired notices preserved | **YES, by composition** | `reconcileDeaths` no longer skips the revive expectation (`death-reconciler.ts:159` keys on `sessionId`), so the 5-min TTL reaches `expectation-expired` → notice to `creatorId` (the reviver). Generic expiry is unit-covered in `death-reconciler.test.ts`. See §3 note 1. |
| N3: rebased onto current main | **YES** | `352b174`, parent `8ffac67` = `main` exactly. `git log HEAD..main` empty, `git log main..HEAD` = 1 commit, tree clean. The R2 diff contamination is gone. |
| N2 / post-s069 seam landed | **YES** | `actionableHarnessModal = readiness === "booting" && harnessVerdict.label === "session-in-use"`. |
| seam: only-overrides-booting | **YES** | Mutant S1 (drop the `booting` restriction) is RED — the "never answers a quoted resume modal in ready or busy output" test catches it. My R2 PROBE-2 case is now regression-locked. |
| seam: quoted text cannot press keys | **YES for ready/busy** | Probes P2/P3 below: both refuse. Residual: a footer-less pane — §3 note 2. |
| R1 shared-latch note | **CLOSED** | `trustAnswered` boolean → `answeredInterstitials: Set<string>` keyed by label; mutants S3 (shared latch) and S4 (no latch) both RED. A persistent modal now degrades to the named `needs-human` notice, delivered to the reviver — asserted. |
| M15 split-window title rollback | **CLOSED** | `kills a newly split pane when title assignment fails`; mutant RED. |
| M20 REVIVED-init wiring | **CLOSED** | `revived descriptor wires the non-continuation reframe into init` asserts `/REVIVED/` and `/Do NOT continue the old work/i` in the injected text; mutant RED. |
| M22 runtimeBin persistence | **CLOSED** | `persists the selected Pi-family runtime on first boot`; mutant RED. |
| line-anchored trust/login regexes | **YES, and it is real hardening** | `NEEDS_HUMAN_PATTERNS` are now `^…$` line-anchored. Mutants S7 (unanchor folder-trust) and S8 (unanchor login) are both RED, and probe P6 shows ordinary prose containing both phrases mid-sentence now classifies `none` — the same class of defect as my R1 F2, fixed pre-emptively for the other two prompts. |
| 699 focused pass | **NO — 693 passed / 1 failed / 2 skipped (12 files, 1 failed)** | my own run of the focused set; the failure is this stream's own revive test — see §3 |

## 2. Dim-0 spot-check (mine, on this tree)

Harness: `.harness/temp/brief/mutate-catshark-r3.py`. Every patch asserts a single occurrence and
restores from `.bak`.

| # | mutation | site | result |
|---|---|---|---|
| N1a | reintroduce `sessionId` on the **pre-launch** revive expectation | `cli.ts` | RED |
| N1b | reintroduce `sessionId` on the **post-launch** expectation write | `cli.ts` | RED |
| S1 | seam fires at **any** readiness (drop the `booting` restriction) | `loop.ts:284` | RED |
| S2 | seam keys on `action === "answer"` instead of the `session-in-use` label | `loop.ts:284` | **GREEN — equivalent mutant, see §3.4** |
| S3 | revert the per-label latch to one shared boolean | `loop.ts:296` | RED |
| S4 | remove the answer latch entirely (key-spam) | `loop.ts:298` | RED |
| S5 | swap the anchored modal regex for R1's loose one | `interstitial.ts:38` | RED |
| S6 | drop the `harness === "copilot"` guard on the modal | `interstitial.ts:64` | RED |
| S7 | un-anchor the folder-trust regex back to `/Do you trust\|trust the files in/i` | `interstitial.ts:43` | RED |
| S8 | un-anchor the login regex back to `/Select login method\|Log in with\|Sign in/i` | `interstitial.ts:45` | RED |
| M15 | drop the pane rollback when **`split-window`** titling fails | `tmux.ts:148` | RED |
| M20 | daemon passes `revived = false` to `buildInitInjection` | `loop.ts` | RED |
| M22 | stop persisting `runtimeBin` at pi boot | `session.ts:228` | RED |
| G1 | live-prior-attachment refusal → `if (false)` | `revive.ts` | RED |
| G2 | `exactlyOne` stops raising E-AMBIG | `revive.ts` | RED |
| G3 | restore the `pid === existing.pid` resurrection bypass | `fs-registry.ts` | RED |
| G4 | drop the expectation rollback on pane-launch failure | `cli.ts` | RED |
| G5 | drop `killPane` on tombstone-replacement failure | `cli.ts` | RED |

**17 killed / 1 survived (equivalent).** G1–G5 confirm the load-bearing round-2 kills survived the
rebase onto main.

### Probes (pure functions; the seam's rule restated as `readiness === "booting" && label === "session-in-use"`)

| probe | pane | fires? |
|---|---|---|
| P1 | the genuine footer-less modal, harness `copilot` | `booting` → **fires** ✓ (harness `claude` → does not fire ✓) |
| P2 | quoted modal + `◎ Working esc interrupt` | `busy` → **refuses** ✓ (this is R2's PROBE-2, now also covered by their own test) |
| P3 | quoted modal + `/ commands · ? help · tab next tab` | `ready` → **refuses** ✓ |
| P4 | quoted modal inside a replay with **no footer** | `booting` → fires — §3.2 |
| P5 | genuine modal drawn **over** a painted footer | `ready` → refuses — §3.3 (fails closed) |
| P6 | prose containing "Do you trust the files in this folder?" and "Log in with" mid-sentence | `{action:"none"}` ✓ — the anchored regexes work |

### Live probes (read-only; targets chosen so no outcome can mutate anything)

| probe | result |
|---|---|
| `revive pij-able-clam` — terminal-latched, `lifecycle ≠ dissolved`, artifact absent | `E-NOREG: pi-family session '019f9717-…' is absent from both Pi and OMP stores` — eligible, still fail-loud, nothing spawned |
| `revive pij-able-beaver` — live pane | `E-ARG: … still has a live prior attachment; close it before reviving` |

(The R2 probe id `pij-102egj6` now returns `E-NOID` — that descriptor is gone; the
terminal-latched revivable population is 31 today vs 771 in R2, so the registry has been pruned
between passes. Not a code change.)

## 3. R1 — BLOCKING (small): a new revive test's outcome depends on the host's process table

`cli.integration.test.ts:920-948` — `cleans the expectation when revival pane launch fails`

```
FAIL  … > cleans the expectation when revival pane launch fails
AssertionError: expected 64 to be 2
stderr: E-ARG: session 'pij-revive-spawn-failure' still has a live prior attachment; close it before reviving
```

The fixture is `{ pid: 201, lifecycle: "dissolved" }` with **no `paneId` and no `terminal`**. So
`runRevive` computes `priorAttachmentAlive` from the second clause only —
`descriptor.terminal === undefined && isAlive(201)` — and **pid 201 is alive on this host**
(`mdworker_shared`, a transient Spotlight worker). `planRevive` therefore refuses at the eligibility
gate and exits 64 instead of reaching the tmux failure the test is about. Verified directly:

```
pid 201: ALIVE — …/Metadata.framework/…/mdworker_shared
node process.kill(201, 0) → true
```

Because `mdworker_shared` comes and goes, the test passes on some runs and fails on others — which
is why the report says "8/8 on retry", and it is also the true cause of the single failure I
recorded as *flake* in R2 §6. That was wrong: it is not flake, it is this fixture. Correcting it here.

The sibling revive fixtures use `pid: 202/203/204` in the same shape and are passing only because
those pids happen to be free right now — the same latent failure, not a different one.

**Fix (either):** add a `terminal: { … }` observation to the fixture so eligibility comes from the
latch like the neighbouring tests, or use a pid the OS cannot assign. Two lines.

**Worth fixing in production too (this is R2's N4, now demonstrated rather than argued):** for a
descriptor with no `terminal` observation, `pij revive` refuses whenever the OS has recycled that pid
to *any* live process, and there is no override. macOS recycles pids aggressively, so a long-lived
machine will hit this on real seats. The refusal fails in the safe direction, but it is the wrong
answer and the operator cannot proceed. Cheapest hardening: for a `lifecycle: "dissolved"` descriptor
trust the tombstone (a deliberate close already proved it dead) instead of probing a stale pid; or
fingerprint the process (start time / argv), not just pid existence. Not blocking — but it is the
same bug the fixture just exposed.

## 4. Residual notes — none blocking, none new-severity

1. **No end-to-end proof that a revive expectation actually expires into a notice.** The two halves
   are each covered (revive omits `sessionId`; `reconcileDeaths` expires a `sessionId`-less
   expectation) and compose deterministically — I traced the path in R2 and re-checked it here — but
   nothing drives a *revive* expectation through the reconciler in one test. Cheap to add; not a
   defect.
2. **The quoted-modal guarantee rests on a footer being present.** `actionableHarnessModal` requires
   `readiness === "booting"`, and `booting` means *no ready and no busy marker in the capture*. So
   quoted modal text in a footer-less pane still satisfies the seam (probe P4). I judge this
   near-unreachable in practice: copilot's TUI paints `? help` / `tab next tab` from the moment it
   is interactive, so a pane that is replaying prior conversation is `ready` or `busy`, not
   `booting`. Anchoring the option-2 line to the very end of the capture would remove the class
   entirely; the current rule reduces it to "a footer-less pane", which is the same window in which
   a genuine modal appears — and that ambiguity is inherent, not sloppy.
3. **The converse of the same rule: a genuine modal drawn *over* a painted footer would not be
   answered** (probe P5). It would then sit silently (`{kind:"boot"}` forever, still no timeout for
   a `pending` descriptor with a live pid). The live capture in `interstitial.test.ts` is
   footer-less, which is the evidence that the real modal replaces the frame — so this is a drift
   risk to re-check if copilot changes its dialog, not a current defect. It fails *closed* (no
   keypress), which is the right direction.
4. **S2 is an equivalent mutant, not a gap.** Replacing `harnessVerdict.label === "session-in-use"`
   with `harnessVerdict.action === "answer"` survives because every other `answer`-producing prompt
   (copilot folder-trust, codex update) is also in `NEEDS_HUMAN_PATTERNS`, so harness-less readiness
   already returns `interstitial` for them and the `booting` branch is never the one that fires.
   No behavioural difference today. It becomes a real difference the moment an `answer` prompt is
   added that is *not* in the needs-human table — worth a one-line comment on the label check.
5. R2's N4–N7 and N9 (eligibility wording, root-shell expectation orphan, `revivePendingAt`
   asymmetry, `registry.revive` self-authorization, duplicated reframe string) are unchanged and
   remain LOW / accepted. I am not re-raising them.

## 5. Hygiene

- Every mutant restored from `.bak`; no `.bak` or probe file left in the tree; `git status` clean
  against `352b174`. The one focused-suite failure is §3 R1, not a leftover mutation — I reproduced
  it from a clean tree and isolated it to a single test with `-t`.
- The machine-wide daemon was not started, stopped, or restarted at any point in any of the three
  passes. No live seat was spawned.

---

# Round 4 — blocker re-verify (final)

**VERDICT: APPROVE.** Tree `7310f69`, parent `424846d` = `main` exactly, nothing behind, clean.

## The R3 blocker is closed, and I proved it rather than trusting the fixture diff

All four fixtures (pids 201–204) now carry explicit `terminal` observations, which short-circuits
the `descriptor.terminal === undefined && isAlive(pid)` clause. To prove the outcome no longer
depends on the host's process table I forced each fixture's pid to `process.pid` (guaranteed alive)
and re-ran the single test — a genuinely pid-independent fixture stays green:

| probe | fixture | result |
|---|---|---|
| A | `cleans the expectation when revival pane launch fails` (was pid 201) | **PASSES with a live pid → pid-independent** |
| B | `kills the spawned pane … when tombstone replacement fails` (was pid 202) | **PASSES with a live pid → pid-independent** |
| C | `reports the interim Copilot session-in-use action …` (was pid 204) | **PASSES with a live pid → pid-independent** |
| D | `refuses a missing Copilot native artifact before tmux mutation` (**pid 102, no `terminal`**) | **FAILS with a live pid → still host-dependent** |

Harness: `.harness/temp/brief/probe-catshark-r4.py`. My own focused run: **12 files / 698 passed /
2 skipped, green** (their 699 is a slightly different file selection; both green).

## One follow-up, not a merge blocker

**D** is the same latent shape in a fifth fixture I had not checked when I wrote the R3 spec (I named
201–204). It is green today only because pid 102 is free on this host; it is a system-daemon-range pid,
so another host or boot flips it. `cli.integration.test.ts` — the `pij-missing-memory` fixture: add a
`terminal` observation like its neighbours. One line, ideally in this PR since the file is already
open, but it does not gate the merge — the gate is green and the specified fix is done and proven.

The production hardening from R3 (for a `dissolved` descriptor, trust the tombstone rather than
probing a stale pid, or fingerprint the process instead of pid existence) still stands as a
non-blocking improvement — D is that same bug wearing a test costume.

## Hygiene

Every probe restored from `.bak`; `git status` clean; no `.bak` or probe file in the tree. The
machine-wide daemon was not started, stopped, or restarted in any of the four passes; no live seat
was ever spawned.
