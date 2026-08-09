# Probe brief — does pij#166 reproduce?

**You are**: a pi seat spawned by `pij-reasonable-dove` (claude, pane %3, same repo).
**Reply to**: `pij-reasonable-dove`.
**Repo**: `/Users/jordanknight/pi-hacking/pij` (canonical main).

## The claim under test

Issue #166 says the native `pij_send` tool exposes `message` and `command` as **both
required**, while runtime validation requires **exactly one** — making message-only sends
impossible. Reported on Windows/native Pi, 2026-08-08.

I have already proven the **registered schema is correct**: building the exact `Type.Object`
from `.pi/extensions/pij/index.ts:65-82` emits `required: ["to"]`, with `message` and
`command` both absent from `required`. So if the bug is real, it is introduced **between**
that schema and what you actually receive.

**What I could not do is observe your side.** That is your entire job.

## Do these in order. Report OBSERVATIONS, not conclusions.

### 1. Report your tool signature — and label it honestly

Print the signature/parameter spec you see for `pij_send`, verbatim.

Then state explicitly which of these it is:
- **(a)** something you can actually READ from your tool definitions right now, or
- **(b)** your own paraphrase / recollection of what the tool looks like.

This matters more than the answer. **If it is (b), say so plainly** — the issue's central
evidence may itself be a model paraphrase rather than an observation, and I need to know
which one yours is. Do not dress a recollection as a reading.

### 2. THE DECISIVE TEST — try a message-only native call

Call `pij_send` with **exactly two keys and no third**:

```
to      = pij-reasonable-dove
message = PROBE-1 message-only native call
```

Do **not** include `command`. Do not add any other field.

Then report, verbatim:
- the **exact JSON arguments** you actually emitted (not what you intended — what went out)
- the exact result or error text

The two outcomes mean completely different things, so be precise about which happened:
- **It succeeded** → the bug does not reproduce here.
- **It failed** → tell me WHICH failure it was:
  - **(i)** you were UNABLE TO EXPRESS a message-only call — the schema forced `command` in, or
  - **(ii)** you were able to omit `command`, but something else rejected it.

If a `command` key appeared in your emitted JSON **when you did not intend one**, say so
loudly and quote it. That is the single most important observation in this whole probe.

### 3. Control test — command-only

Call `pij_send` with `to` + `command = compact`, targeting **yourself**, not me.
Report the exact arguments and result. (This proves the other leg of the XOR works.)

### 4. Fallback — only if native sending is broken

If and only if step 2 failed to deliver, use the CLI instead:

```bash
pij send pij-reasonable-dove --body-file <path-to-your-report>
```

**Body safety**: never inline backticks or `$(...)` in a double-quoted send body — your
shell substitutes them before pij sees them. Use `--body-file`, always.

## How to report back

Write your findings to `scratch/i166-probe-result.md` in this repo, then send me the
**path only** plus a one-line verdict. Do not paste the report body over the wire.

Your one-line verdict must be exactly one of:
- `REPRODUCES — could not express message-only`
- `DOES NOT REPRODUCE — message-only succeeded`
- `DIFFERENT FAILURE — <six words>`

## Rules

- **Observation over inference.** "I saw X" beats "X is happening". If you did not observe
  something, say it is unobserved — an honest gap is worth more to me than a confident guess.
- Change no source files. This is a read-and-probe job only.
- Do not fix anything, do not open a PR, do not edit the issue.
- If you get stuck or wedged, say so early rather than burning turns.
