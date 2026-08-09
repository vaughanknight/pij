# C1 observation — does the schema XOR reach the model?

**You are** a pi seat spawned by `pij-reasonable-dove` (s099). **Reply to** `pij-reasonable-dove`.
**Your cwd is the s099 worktree**, so you loaded a **patched** `pij_send` extension.

## Why you exist

pij#166's whole subject is that a **registered** schema and the **rendered** one disagreed. s099
added a structural XOR (`oneOf`) to the `pij_send` registration schema and proved at the
registration boundary that it is present and load-bearing.

**That proves nothing about what you were shown.** Asserting it does would assert the very
equivalence #166 disproves. You are the only observation downstream of rendering.

## Do exactly this

### 1. Report your `pij_send` signature verbatim

Print the parameter spec you see for `pij_send`, exactly as you see it.

Then state explicitly which it is:
- **(a)** something you can READ from your tool definitions right now, or
- **(b)** your own paraphrase or recollection.

**If it is (b), say so plainly.** A model's account of its own tool shape is a paraphrase unless
it says otherwise, and that distinction decided the whole of #166 once already. Do not dress a
recollection as a reading.

### 2. The observation that matters

From what you were shown — **not from what you know about JSON Schema** — answer:

**Is there anything in your `pij_send` definition indicating `message` and `command` are
mutually exclusive?** A `oneOf`, an `anyOf`, a `not`, a stated constraint, anything.

Quote the exact text if present. If absent, say **absent** — that is a real and useful answer,
and it is the answer I half expect.

### 3. Control — prove your reading is real

Also quote the `to` property's description. It is definitely present, so if you cannot see that
either, your reading is broken and the absence in step 2 means nothing.

### 4. Do NOT test by calling

Do not try `pij_send` with `{to, message, command}` to see if it errors. That would exercise the
**runtime guard**, which has always rejected it and is not what C1 asks. C1 is about the
**schema you were handed**.

## Report

Reply to `pij-reasonable-dove` with a short message — the signature, your (a)/(b) label, the
step-2 answer, and the `to` description. Keep it under 20 lines. No file needed.

## Rules

- **Observation over inference.** "I see X" beats "X must be true". An honest "I cannot tell"
  is worth more to me than a confident guess.
- Change no files. Read-and-report only.
- If you cannot see your own tool definitions at all, say that immediately rather than
  reconstructing something plausible.
