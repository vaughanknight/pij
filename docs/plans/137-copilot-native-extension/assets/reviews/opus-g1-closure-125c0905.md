# G1 closure + local-09 grade — `125c0905`

Reviewer seat `pij-static-rhinoceros`. Read-only. Companion to
`opus-readiness-live-da727fcd.md` (left byte-intact; this is a separate note so
the committed artifact stays reproducible).

**G1: closed, verified independently.** **Local-09: real progress — the disabled
glyph blocker is gone and two more modes are proven.** One new blocker diagnosed
(the `[prompt]` ghost), with a hazard the proposed fix must avoid. **Still no
release verdict:** lifecycle and spawned remain unproven.

---

## G1 — closed

`125c0905` commits 2 762 lines of `pm-native-real-canary-04.json`, 2 370 of
`pm-native-local-08.json`, the harness/Rust logs
(`pm-current-harness-checks.json`, `pm-current-harness-and-rust.log`,
`pm-v4-rust-workspace.log`, `pm-v4-paired-validation.log`), canary-01…03,
local-06/07/09, and all three of my review artifacts.

I did not take this on the diffstat. I recomputed sha256 of the committed blobs
and compared against the on-disk files I actually graded:

| artifact | committed vs graded |
|---|---|
| `pm-native-real-canary-04.json` | **identical** |
| `pm-native-local-08.json` | **identical** |
| `opus-readiness-live-da727fcd.md` | identical |
| `opus-paired-v4-5222f518.md` | identical |
| `opus-correlation-sensor.md` | identical |

So the artifacts are the ones I graded, not regenerated look-alikes, and every
grade in the prior review is now reproducible from committed state. The
constraint collision is gone. **G1 closed.**

---

## Local-09 — the predicate fix worked

`source_commit f14cf56b`, module digests `store.mjs 2cc04cb1` /
`extension.mjs 567fccce` — **byte-identical to the receiver I verified at
`da727fcd`**. So local-09 exercises the already-reviewed receiver; nothing about
the product changed underneath these results.

The drift I flagged as unreviewed landed as `3c2ad795` + `4123ce2c`, replacing
`/❯|>/` with `nativeComposer(...) === ""`. It worked: local-08 died at witness 6,
**local-09 reaches witness 11**. Reusing the proven composer parser instead of a
glyph guess was the right call, and it is now evidenced rather than asserted.

**Missing-consumer (witnesses 7–8) — passed, and the R7 invariant holds.** The
seat registered `native_extension_delivery: false` with argv carrying
`--no-experimental` — a genuinely native-incapable client, not a simulated one.
Daemon outcome: `queued`, `reason: "native-extension-unavailable"`, job 4 left
`pending`. The witness contains **no `keys` array at all** — no `send-keys`, no
control sequence, no degraded path. That is the no-fallback invariant proven
against a real incapable client, which is materially better than proving it
against a mock.

**Key rotation (witness 10) — passed.** Delivery lands on the rotated seat
`pij-copilot-1f1cb6f8…` (sender remains `d67b473e…`), with a real native
`user.message` carrying `interactionId` and `parentAgentTaskId`,
`origin: "reader-read"`, job 5 `done`. Reconnect re-registration does not lose or
misattribute the message.

R2's diagnostic shows up again in a real pane in the rollover `before` capture
(`typing-sensor-wait; … outgoing pij_send remains available`), alongside
`PIJ_NATIVE_OBSERVED` — second independent live sighting.

---

## The `[prompt]` ghost — diagnosis confirmed

Blocker: `PIJ_NATIVE_TIMEOUT: exact native lifecycle command staged`
(`copilot-native-smoke.ts:649`). The staged capture shows the composer as:

```
┃ /new [prompt]
```

with the command palette open above and `❯ /new  Start a new conversation`
highlighted. `driveSmokeLifecycleCommand` sends `/new` literally, then requires
`nativeComposer(terminal) === "/new"`. Copilot renders the command's **argument
placeholder** after the typed text, so the comparison can never succeed and the
wait burns its full timeout. This is a driver-side terminal-reading defect, not a
product defect — agreed.

The cursor is the correct discriminator, and the measurement is unambiguous:
column 0 `┃`, column 1 space, `/new` at columns 2–5, **cursor at column 6**.
Typed text ends where the cursor is; the ghost is rendered beyond it. Nothing
else in the frame separates them — the ghost is ordinary text in the same row.

Worth recording: **this is the R6 capture paying for itself.** The
cursor/viewport pairing existed as a diagnostic; it turns out to be the only
available oracle for typed-vs-rendered. `preserveOutput` is likewise not
incidental here — see hazard 2.

## Hazards the fix must avoid

Endorsing the *scope* ("measured typed prefix / selected command only; no product
parser or policy"). Three specific hazards, because `nativeComposer` has become
the shared oracle for three different questions:

**1. Do not weaken the human-draft guard.** The same function backs
`:645 PIJ_NATIVE_HUMAN_DRAFT: refusing to overwrite composer`, `:776 "same
nonempty composer must remain intact"` (the aged-draft typing proof), and the
emptiness checks at `:821`, `:1390`, `:1470`, `:1596`. If ghost-stripping is
applied inside `nativeComposer` globally, a decorated human draft could reduce to
`""` and the driver would type over a real human's composer — destroying the
consent property the whole typing gate exists to defend, and doing it in the one
place no test would notice. **Ghost handling belongs only in the staging
comparison at `:652`/`:657`.** Emptiness and draft-intactness must keep reading
the full composer content.

**2. Cursor columns are pane-absolute; `nativeComposer` trims.** It does `.trim()`
on the terminal and `.trim()` on every line (`:600–602`, `:618`), which destroys
column alignment — slicing a trimmed line at `cursor_x` misaligns by the leading
`┃ ` plus any padding. The slice must be taken from the **untrimmed** capture,
which is exactly what R6's `preserveOutput` was added for. Do not mix the two.

**3. Only the cursor's row may be sliced.** The cursor gives one row; the
composer can be multi-line (`nativeComposer` joins with `\n`, and a long draft
wraps at 160 columns — local-08's 44-char draft fit on one row, but that is not
guaranteed). Ghost text can only follow the cursor on its own row, so the sound
form is: rows before the cursor row taken whole, cursor row sliced at `cursor_x`,
rows after discarded. Slicing "the composer" as a single string would silently
drop earlier rows of a wrapped draft.

Two smaller notes:

- **`cursor_y` must be validated against the composer row** before `cursor_x` is
  trusted. If a modal owns the cursor, the coordinate refers elsewhere; on
  mismatch return `undefined` (keep waiting), never fall back to the untrimmed
  compare — that would restore the current hang.
- **Selected command must be `AND`, not `OR`, with the typed prefix.** In this
  capture `/new` is both the highlighted row and the *first* row of the palette,
  so a default highlight and a real match are indistinguishable. The highlight
  alone cannot discriminate this command.

Also note `HUMAN_KEYS.exit` (`/exit`) routes through the same staging function, so
the fix must hold for a command with no argument placeholder as well as one with.

## Verification I will want at the next pin

- `git diff --stat` shows **no `crates/` change** from the installer fix.
- `nativeComposer`'s contract for emptiness and draft-intactness is unchanged —
  ideally a test that a decorated non-empty composer is still non-empty.
- Ghost handling is confined to the staging comparison.
- A regression test built from **this** captured frame (`/new [prompt]` with
  cursor 6), not a retyped approximation — the same discipline as the live06
  footer fixture.

---

## Status

- **G1 closed** (verified by digest, not diffstat).
- **G2** stands as an explicit design residual; no silent-retry change requested
  or wanted. Agreed and unchanged.
- **Proven modes:** manual roundtrip, real-model roundtrip, default-60 000 typing
  gate, missing-consumer, reconnect key rotation.
- **ac-0006 — checked, and I concur.** My draft said "AC6 unproven"; that was a
  wrong identifier, corrected on PM challenge. ac-0006 is the recent-typing
  *policy* criterion (daemon-resolved `PIJ_TYPING_GRACE_MS`, 136 hold/release,
  operator Hold retained, admits after grace despite a static draft, no sendkeys
  fallback when unowned) — and local-08 witness 6 is exactly its receipt:
  `typing_grace_ms 60000`, durable `delivery.held`, expiry `retry_after_ms 0`,
  `delivery.released`, one native user message, one reader-read ACK, draft
  unchanged at cursor 50,45 / 160x48. I graded that witness as passing myself, so
  calling ac-0006 unproven contradicted my own finding. The "frozen pending
  Jordan" note carried in my three earlier reviews is also **discharged** — the
  ruling landed as `jordan-ruling-consent-2026-09-05.md` and is the row's cited
  receipt.
- **ac-0007 — partially evidenced, not untouched.** It has three clauses:
  reconnect/key rotation, extension reload / native-session rollover, and
  old-process replacement. **Local-09 witness 10 discharges the first** (rotated
  seat `1f1cb6f8`, real native `user.message` with `interactionId` and
  `parentAgentTaskId`, job 5 `done`, no misattribution). Rollover and old-process
  replacement remain open — witness 11 is where the `/new` ghost stops it.
- **Unproven:** lifecycle (`/new`, `/exit`), spawned, rollover and old-process
  replacement (ac-0007 remainder), cold-host-resume.
- Local-09 remains `provider: deterministic-local-fixture-not-real-inference`;
  the real-provider axis is still covered only by canary-04, in manual mode.

**No release verdict.** Send the pin with the installer fix and the lifecycle /
spawned receipts and I will review the fix and grade the proof together.
