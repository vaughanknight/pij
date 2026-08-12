# Pre-registered discriminator for pij#280 (live capture)

Registered by `pij-continuing-ermine` at 2026-08-11T23:34Z, **before** the next
stalled notice arrived. Serves stream s102 (`stall-notice-discriminator`),
currently blocked at `WAITING_FOR_BUILD_CONFIG`.

## Why this was previously unresolvable

Three earlier attempts tried to catch the flag by probing *after* the notice
arrived (windows of 13.7s / 19.0s / 26.6s; missed by 4.2s, then 0.7s). The
state that distinguishes the two call sites is transient, so a post-hoc probe
cannot see it. A **continuous sampler** removes the race: the evidence is
already on disk when the notice lands.

Sampler: `pij state pij-efficient-bug --json` every 5s (762 bytes/call)
→ `files/stall-samples.jsonl`, recording `lastEventAt`, `ageMs`, `state`,
`activity`.

## The two call sites (both emit byte-identical text)

- `daemon.ts:915` — legacy. Fires only on `state==="working" && lastEventAt > STALE_AFTER_MS` (60_000).
- `daemon.ts:949` — `pushWatchdogResponse`. Fires on `event.response === "stalled"` and **reads neither field**.

Because the emitted text is identical, the notice alone cannot attribute itself.
That is the defect.

## Discriminator (falsifiable)

At the sample nearest a `⏸ gone quiet (stalled)` notice:

| observed in sampler | conclusion |
|---|---|
| `state == "working"` AND `ageMs > 60000` | legacy path; notice is **correct** |
| `state` is `idle`/`done` (any `ageMs`) | legacy path is impossible → notice came from `pushWatchdogResponse` → **#280 reproduced live** |

## Control already banked (2026-08-11T23:33:46–23:34:02Z)

Four consecutive samples show `state=idle`, `activity=done`, `ageMs` rising
74997 → 91599 — i.e. **>60s inactive with NO stall notice emitted**. This
confirms the legacy path is correctly gated on `state==="working"` and is not
firing indiscriminately. Any stall notice observed against an `idle` sample is
therefore attributable to the other call site.

## What would falsify my expectation

If every future notice coincides with `state=="working" && ageMs>60000`, then
`pushWatchdogResponse` is not firing spuriously in practice, and #280 is a
latent defect rather than a live one. That outcome gets recorded as written.

## Control extended — 286 samples, 2026-08-11T23:33:40Z → 2026-08-12T00:00:14Z

| condition | samples |
|---|---|
| `idle`/`done` | 282 |
| `working`/`working` | 4 |
| **legacy trigger** (`working` AND `ageMs>60000`) | **0** |
| idle with `ageMs>60000` (legacy path cannot fire) | 282 |

Maximum inactivity observed: **1,640,681 ms (27.3 min)** while `idle`, with **no
stall notice emitted**. The legacy gate on `state==="working"` is therefore
confirmed correct against a 27-minute idle window — it does not fire on mere
inactivity. The discriminator above stands.

## Withdrawn hypothesis (recorded, not deleted)

I proposed that pij's own commands run longer than `STALE_AFTER_MS` (60s), so a
seat obeying instructions would age past the threshold mid-command and be
reported stalled. **Measured and refuted** on 2026-08-12T00:0xZ:

| command | wall-clock |
|---|---|
| `pij anomalies` | 1.7s |
| `pij list --json` | 0.8s |
| `pij tree --global --all --json` | 0.6s |

All are ~35x under the threshold. The hypothesis is dead.

This also corrects a conflation of my own in **#283**: the 800KB / 798-descriptor
cost of `pij list --json` is a **token-cost** problem (expensive to read into
context), **not a latency** problem (cheap to execute). Those are different
defects with different fixes, and I had been treating them as one.

The stall mechanism therefore remains **unattributed**. The sampler stays armed.

## Non-claims

- This does not establish frequency, only mechanism.
- The PA (`gemini-3.6-flash`, 30m watchdog interval) is one seat; other
  harnesses/models are unsampled.
- No stall notice has yet landed against a banked sample, so the discriminator
  is armed but **unfired** — it has proven nothing about #280 so far.
