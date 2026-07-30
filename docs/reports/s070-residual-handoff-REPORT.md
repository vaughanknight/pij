# s070 watchdog hygiene — coder report (pij-nutty-fox)

Branch `s070/watchdog-hygiene`, 4 commits. All three defects fixed and gated, with one
**residual gap on #3 that needs a re-grant** (§ Residual).

| commit | defect | files |
|---|---|---|
| `e8ee7ac` | #2 stalled flag | `watchdog-manager.ts` (+test) |
| `7ed3e33` | #2 follow-up | `watchdog-manager.ts` (+test) |
| `f3e64c6` | #1 exempt | `watchdog-manager.ts`, `daemon.ts` (+test) |
| `bd0f43e` | #3 close intent | `loop.ts` (+`loop.test.ts`) |

#1 and #3 are in separate commits from #2 per your ruling, and both are independent of the
#2 commits, so they can be reordered or dropped for s069 without stranding anything.

## Gates

- `just typecheck` — clean
- **Full pij suite: 2673 passed, 13 skipped, 0 failed** (126 files). The ~22 pre-existing
  agent-runner failures you told me to ignore did not appear — the suite is fully green here.
- `biome check` clean on all five changed files.

## Dim-0 (each fix RED on revert, verified by actually reverting)

| revert | goes RED |
|---|---|
| `reportSustainedLiveness` call | #2's creator-less test only |
| `isExempt` guard in `pushWholeLifeTransition` | #1's exempt test only |
| the 3 `writeMerged` field entries | both #3 tests |

Every suppression fix ships with a **CONTROL** test of byte-identical setup that proves the
notice really fires in that scenario, so "zero notices" is real suppression and not an
assertion about something that was never going to happen:

- #1 control: same peer, no exemption → 1 owner notice. Plus an **expired-exemption** test
  proving the TTL still releases (a lapsed safety exemption must not become permanent
  blindness).
- #2 control: same peer, event 110ms old → flag correctly KEPT (no blanket amnesty).
- #3 control: same absence, no close intent → still announced `unrequested-by-pij`.

## Two things I got wrong, and how they surfaced

**1. My first #3 tests were vacuous** — they passed with the fix reverted. Cause: I staged the
on-disk descriptor as already `dissolved`, and both registries *already* refuse a stale
non-dissolved write over a dissolved tombstone (`fs-registry.ts:149`, `fakes.ts:171`). The real
exposed window is **before** the dissolve: `pij close` stamps `closeIntent` then `terminal`
while the descriptor is still live and unprotected. Rewritten against that window, they go RED
properly. I only caught this because I reverted to check rather than trusting green.

**2. My first #2 fix used the wrong freshness window** — the watchdog interval (20 min default),
so a peer 65s into silence was called alive. `daemon-push.test.ts` caught it. Window is now
`min(intervalMs, STALE_AFTER_MS)`. Fixed in `7ed3e33`.

I also **dropped** the `lifecycle`-preservation part of your grant. Adding `lifecycle` to
`MUTABLE_EXTERNALLY_OWNED_FIELDS` would be actively dangerous — it is daemon-owned (the
spawn→bind machine computes pending→ready→bound), and a disk-wins rule there would pin a
binding session at its stale value. A narrower one-way dissolve guard turned out to be
redundant with the registry check above, and I could not write a test that went red without it,
so I shipped only what I could prove: the three field entries. A test now pins the reasoning so
nobody "helpfully" adds `lifecycle` later.

## Your question: is there a THIRD notify path blind to exempt?

**Yes.** Full enumeration of owner-facing notices:

| path | consults exempt? | verdict |
|---|---|---|
| `daemon.ts:555` stalled (legacy detector) | **no** → **now yes** | defect #1, fixed |
| `daemon.ts:589` stalled (watchdog detector) | implicitly — `isFireDue` never fires while paused, so no response is derived | safe, but was **only by construction**. **Now pinned by a test** at both the pure seam (`isFireDue` under every pause tier) and the manager (a paused peer far past due derives no response, no fire, no delivery). |
| **`daemon.ts:636` provider-failure dead notice** (`pushProviderFailure`) | **no — deliberately** | **the third one.** RULED: leave it firing. Exempt means "stop nagging me about SILENCE"; a provider failure is a real fault that stays actionable on standby, and swallowing a quota/auth failure would be worse than the noise s070 fixed. `staleAge` only triggers *looking* — the notice needs positively-identified provider-error evidence in the pane. Now carries a comment stating the decision **and** a test proving exempt does not suppress it (verified by simulating the wrong fix: adding an `isExempt` guard there turns that test RED). |
| `death-reconciler.ts:142` terminal absence | no | correct as-is. Exit ≠ silence; exempt should never hide a genuine death. Its bug is close intent (#3), not exempt. |
| **`anomalies.ts` `inbox-poll-stalled` + `spawn-limbo`** (routed by `anomaly-sweep.ts:74` → `effectiveParent`→`spawnedBy`) | n/a — never consulted **`terminal`** | **the fourth one, found by warbler.** Not an exempt gap — the same failure class as #3. `pij close` stamps `terminal: requested` **before** dissolving, and `fs-registry` lists the record throughout that window, so a just-closed seat is still `bound` with a frozen `lastInboxScanAt` — exactly the shape the detector calls a stall. A pij-REQUESTED close false-alerted its own owner. Fixed by excluding terminally-observed descriptors. **warbler named `inbox-poll-stalled`; `spawn-limbo` has the identical exposure** (closing a *pending* seat leaves `lifecycle: "pending"` + `terminal` in that same window), so both are fixed under one rule. |
| `loop.ts:376/409` bound, `loop.ts:456` failed, `loop.ts:295` needs-human | n/a | not stall/exit notices; all evidence-based. Fine. |

I also left `pause`/`compact` deliberately NOT treated as exemptions — "stop nudging" is a
different claim from "silence here is expected". Flagging rather than deciding unilaterally.

## Residual: #3 has a SECOND, independent path I could not fix

`bd0f43e` fixes the descriptor branch. There is a second route to the identical notice, which I
**reproduced executably** before reporting it (scratch test, since deleted):

```
⚠️ spawn-1 has exited; terminal absence: live observation at … (unrequested-by-pij).
```

The **expectation branch** (`death-reconciler.ts:156-211`) fires when:
1. `pij close` dissolves the descriptor → `registry.list()` filters it out, so it is invisible
   to the sweep and the descriptor-branch fix cannot help;
2. the expectation's own `closeIntent` is unset — **`cli.ts:2361-2389` writes close intent to
   the descriptor only, never to the expectation**, whereas `session.ts:436` correctly does
   both. That asymmetry is the bug;
3. `expectation.sessionId` is unset, so the skip-guard misses — and **`bindSpawnExpectation` is
   never called anywhere in production**; only one spawn path (`cli.ts:1664`) stamps
   `sessionId` by hand. The others (`1413`, `1590`, `1620`, `2896`) leave it unset;
4. the 5-minute TTL has expired, which is true of any peer that ran a while.

Tell-apart in the wild: this variant names the **spawnId** (`spawn-1`), the descriptor variant
names the **peer id**. Your report quoted a peer id, so you hit the descriptor path — but this
one is live too and will bite.

Fix is one line in **`cli.ts` (s066)**: mirror `session.ts` and write
`requestClose(expectation, closeIntent)` alongside the descriptor write. The unbound-expectation
gap (3) is arguably a second bug worth its own ticket.

**HANDED TO s066 by orchestrator ruling** — it belongs to their problem space (their F1 blocker is
terminal/closeIntent semantics, so the same owner should hold both). Everything they need is below.

### s066: apply verbatim

`cli.ts`, in the `pij close` handler (~line 2366). The descriptor write already exists; add the
expectation write beside it, mirroring what `session.ts:434-437` already does correctly:

```ts
if (descriptor) {
    // Persist intent before touching tmux so a later observed absence is correctly classified.
    reg.write({ ...descriptor, closeIntent });
    // s070: the DESCRIPTOR write alone is not enough. Once close dissolves the
    // descriptor it is filtered out of registry.list() and the death sweep can no
    // longer see the intent; the sweep then falls through to the EXPECTATION,
    // which has no closeIntent of its own and is classified `unrequested-by-pij`.
    // session.ts:436 already does this; the CLI path was the asymmetry.
    if (descriptor.spawnId) {
        const expectation = expectations.read(descriptor.spawnId);
        if (expectation) expectations.write(requestClose(expectation, closeIntent));
    }
    traceP3("close:intent-write");
}
```

Needs `requestClose` from `./core/spawn-expectation.js` (already exported; `session.ts` imports it)
and whatever expectation-store handle is in scope there. Ideally mirror `session.ts:454-465` too and
`applyTerminalObservation` onto the expectation after the successful kill, so it is latched rather
than merely intent-stamped.

### s066: executable repro (drop into `death-reconciler.test.ts`, currently RED)

```ts
it("does not announce a pij-requested close as unrequested-by-pij", () => {
    const expectation: SpawnExpectation = {
        spawnId: "spawn-1",
        creatorId: "owner",
        requestedHarness: "claude",
        requestedAt: "2026-06-27T12:00:00.000Z",
        deadlineAt: "2026-06-27T12:05:00.000Z",
        paneId: "%1",
        // no sessionId, no closeIntent — exactly what `pij close` leaves behind today
    };
    const sweep = reconcileDeaths({
        descriptors: [],                    // dissolved → filtered out of registry.list()
        expectations: [expectation],
        nowIso: "2026-06-27T13:00:00.000Z", // past the 5-min TTL
        isAlive: () => false,
    });
    expect(sweep.notices).toEqual([]);
});
```

Produces today, verbatim:
```
⚠️ spawn-1 has exited; terminal absence: live observation at 2026-06-27T13:00:00.000Z (unrequested-by-pij).
```

### s066: how to tell the two variants apart in the wild

**This variant names the `spawnId`** (e.g. `spawn-1`); **the descriptor variant names the peer id**
(e.g. `pij-nutty-fox`). `death-reconciler.ts:201` renders `next.sessionId ?? next.spawnId`, and
`sessionId` is unset on these. If a live report quotes a peer id, it is the descriptor path
(fixed here in `bd0f43e`); if it quotes a spawn id, it is this one.

Worth a separate ticket: **`bindSpawnExpectation` is never called in production.** Only
`cli.ts:1664` stamps `sessionId` by hand; `1413`, `1590`, `1620` and `2896` leave it unset. That is
why the `expectation.sessionId !== undefined` skip-guard at `death-reconciler.ts:159` — which
should have caught this — never engages for most spawned peers.

## Fence

No conflicts hit. I touched only the two granted spots; `refreshRenderedComposerHold`, the
delivery gate, `drainTmuxInbox`, pane-signals and all hold/typing logic are untouched. I have
not rebased onto s069 — will stop and report if a conflict appears, per your instruction.
Machine-wide daemon **not** restarted; everything here is unit-level.
