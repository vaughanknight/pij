# Review r1 — fix round

## Resolutions

| Finding | Resolution | Change |
|---|---|---|
| F1 MAJOR | fixed | Reconnect attempt increments after every successful attach and resets only after at least one frame is consumed. A server that repeatedly returns Hello then closes now selects 250, 500, 1000, 2000, 4000, 5000… rather than 250 forever. Permanent regression uses successful immediate-close streams. |
| F2 MAJOR | fixed | Stream/decode/consumer failures call `onError`, then the subscription continues its bounded reconnect loop. Protocol-error regression observes the diagnostic and the second attach. |
| F3 MINOR | fixed | `watchEvents` now awaits the frame consumer; the cursor advances only after it resolves. `RustRuntimeSession` returns the raw `consumePushed` promise while keeping its internal chain recovered. A rejected async consumer is diagnosed and the next attach has no advanced `since`. |
| F4 MINOR | fixed | Non-OK event responses preserve `DaemonRefusalError` for cursor fallback and otherwise throw an error naming the HTTP status, including the success-envelope/non-OK case. |
| F5 MINOR | fixed | Runtime restart test is parameterized for daemon-knows-seat false/true; it proves re-registration count 2 when missing and 1 when known. |
| F6 NIT | partly fixed/deferred | Final jittered delay is clamped to 5s. The single displayed cursor remains the maximum across aliases, matching the existing plan wording; cosmetic multi-alias notice redesign is deferred. |
| F7 MINOR / prime | fixed by ruling | Prime authorized preserving every AC id/text, adding minimum `claim`/`state`, and checking rows with receipts. `ddocs validate plan.dd.json` is now clean. Recorded as a prime-authored template defect, not product code. |
| Q1 | answered | Reviewer authority analysis stands: Rust replay is strictly `seq > since`; no code change. |

## New RED witness

Before the fixes, the expanded adapter suite failed four new assertions:

1. immediate-close successful attaches stayed at 300ms instead of ramping to 600ms;
2. protocol errors never reached `onError`;
3. rejected async frame consumption still advanced `since`;
4. HTTP 500 with a success envelope resolved instead of naming the status.

## Green evidence

- `just test .pi/extensions/pij/adapters/daemon-http.test.ts .pi/extensions/pij/adapters/rust-runtime.test.ts .pi/extensions/pij/core/daemon-wire.test.ts .pi/extensions/pij/index.test.ts` → 4 files, 41 tests passed.
- `just typecheck` → exit 0.
- `probe-storm.mts` → distinct delays `[250, 500, 1000, 2000, 4000, 5000]`.
- `probe-skew.mts` → `onError: pij daemon wire v99 is unsupported…` is observable on every failed stream; same bounded delay sequence.
- `ddocs validate docs/plans/124-omp-event-reattach/plan.dd.json` → 0 errors, 0 warnings.

## Re-review ask

Re-run the targeted regressions and update the ddoc with an r2 verdict. Material fixes landed, so a clean/remaining-findings verdict is required before close-out.
