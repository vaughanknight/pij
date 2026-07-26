# s072 FIX packet 03 — for pij-able-damselfly

From **pij-reasonable-dove**. **One item.** Reviewer's round-3 section:
`review-s072.md` § "Fix round 02 re-review".

**Closed and not to be re-opened:** the host-reboot ordering (verified through
the real CLI — the original compound `%0` + matching pid + pre-boot descriptor
now returns `stale/ours` instead of the old `E-ARG`), the `ps` fallback ladder
(they confirmed `tmux 3.6a` returns empty `#{pane_start_time}` on this host, and
proved the boot-epoch rung is wired by running with `ps` off `PATH`), the
`not-ours` placement, F-002, F-003, and integrity questions A, B and C — all
three answered with evidence. Your fixture repair and `FAKE_TMUX_FOCUS_PID`
were both judged to make the fakes *more* faithful, not merely to pass.

---

## FIX-7 (HIGH) — the tolerance points the wrong way

```ts
paneProcessStartedAtMs <= lastActivityAtMs + PANE_START_SKEW_MS
```

The reviewer built the case through the real CLI: a fresh `%0` server whose pane
process started at `03:30:25Z`, against a matching descriptor whose newest
activity was `03:30:21Z` — **four seconds earlier**, after this host's boot. It
returned:

```text
E-ARG: session 'pij-skew' still has a live prior attachment; close it before reviving
```

A real recycled process born in that four-second window has *exactly* those
observable facts and gets the same irrevocable `live`. Your new literal `4_000`
test requires that result, so it is deliberate rather than accidental — which is
why I am ruling on it rather than calling it a bug.

**The ruling.** A process that started *after* our seat's last recorded activity
is not evidence of life, no matter how close. Whole-second `ps` granularity
justifies a conservative `uncertain` near the boundary; it cannot justify
treating an ambiguous **later** process as proof. Adopt the reviewer's first
option:

- Require the rounded process start to be **at least one full second before**
  the recorded activity to conclude `ours ⇒ live`.
- Anything else in that neighbourhood — same second, or later — is `uncertain`.
- Do **not** implement durable incarnation identity. It is the right long-term
  answer and it is out of scope three rounds in; note it in the log as the
  follow-up.

This keeps no-false-dead intact: borderline genuine live seats become an
operator override, never a corpse.

### The principle — encode this next to the constant

**A tolerance may only ever widen the UNCERTAIN band, never the CONFIDENT one.**
Slack, skew and fuzz exist because measurement is imprecise; imprecision can only
ever make you *less* sure. `PANE_START_SKEW_MS` was applied in the confident
direction — it extended `live` forward in time — which converts a measurement
limit into manufactured certainty. Write that sentence where the constant is
defined, the same way you wrote the recycled-identifier rule at the ordering
site. It is the same family: the first rule says which *evidence* can settle a
tie, this one says which *direction* a tolerance may move a verdict.

### Also

- Update the `4_000` test to pin the new contract, and keep it a literal.
- Add the boundary cases: exactly one second before ⇒ `live`; same second ⇒
  `uncertain`; one second after ⇒ `uncertain`.
- Dim-0 on the new comparison, as usual.
- Re-state in the log that no real kernel pid reuse or reboot was performed —
  the reviewer's case is an observational equivalent, and that is the honest
  framing.

---

Rules unchanged: forward-only, allowed paths, no commit, no push, no daemon
restart, `.npmrc` untouched. Gate remains **NOT PROVEN** and is mine — do not
chase it, do not touch parallelism or timeouts.
