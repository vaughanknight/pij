# Review round 1 — u-copilot-verify (plan 109, unit 0)

**Verdict: REFUSE.** One load-bearing claim is falsified by a reproduced
counter-observation; four lesser findings; one new surface fact the six claims
did not cover.

This is a **strong receipt** — claims 1, 2, 3 and 5 are carried by real
observations, the resume prerequisite is a genuine first-party discovery, and
the findings log was written while the finding was fresh. The refusal rests on
claim 6, where two instruments were used that cannot distinguish the outcome
they were asked to distinguish.

## Instrument state (mine, measured at time of use)

| item | value |
|---|---|
| falsifiers pre-registered | `/tmp/s109-review/falsifiers-preregistered.md`, sha256 `8afb2910…4a0c13`, stamped **00:53:09Z** |
| receipt first read by me | **01:05Z**, i.e. after pre-registration and after my independent probes |
| head reviewed | `37785dc6` (pushed; `origin/s109/copilot-rpc` identical) |
| coder binary (resolved by me, not by the receipt) | `…/@github/copilot/node_modules/@github/copilot-darwin-arm64/copilot`, sha256 `3f7ca3e2…bd00b`, 146 243 664 B |
| my probe instances | ports 47901 / 47902 / 47903, sessions `…09e1/09e2/09e3` — all mine, all destroyed |
| coder's process | pid 72023, port 47777, session `…000000000000` — **read-only `lsof` only; never connected to, never sent to** |
| retained artifact | `/tmp/s109-review/evidence/repro-events.jsonl` |

---

## FINDINGS

### F1 — "enqueue discards the unsent human composer buffer" is FALSE. Reproduced opposite. **[HIGH]**

`u-copilot-verify.md:16, 216, 283, 309, 336, 343-344`

The receipt concludes the RPC send **destroys** a human's unsent draft:

> "enqueue is not merely unaware of the composer; it clears it" (:216)
> "The observed consequence was loss of the unsent buffer, not merely
> interjection." (:343)

Two instruments were used, and **neither can tell "preserved" from "lost"**:

1. **A PTY screen capture** (:277-283) showing `@ files · # issues`. That is the
   placeholder; the TUI renders it over a populated buffer.
2. **A search of `~/.copilot` / `events.jsonl`** (:313-334) returning no match. An
   *unsent* draft is in-memory TUI state. It is absent from session state
   **whether it was preserved or destroyed.** The search only detects
   *submitted* text, so its negative result was guaranteed in advance.

This is absence-read-as-observation, and the discriminating test — press Enter
and see whether the draft submits — was never run.

**I ran it.** Fresh instance, port 47903, session `…09e3`, 01:06-01:07Z:

```
01:06:34Z  typed REVIEWER_SENTINEL_MUST_SURVIVE_RPC into composer, NO Enter
01:06:34Z  session.resume + session.send mode:"enqueue"
           -> result {"messageId":"d2aa1592-828b-45be-84c0-b671f5b12d90"}
01:06:45Z  RPC turn ran (assistant printed PONG)
           screen showed "@ files · # issues"  <-- reproduces the receipt's capture
01:06:56Z  pressed Enter
```

`events.jsonl` (retained at `/tmp/s109-review/evidence/repro-events.jsonl`):

```console
$ jq -ce 'select(.type=="user.message") | {t:.timestamp, content:.data.content, delivery:.data.delivery}' repro-events.jsonl
{"t":"2026-08-31T01:06:45.811Z","content":"Reply with exactly: PONG","delivery":"idle"}
{"t":"2026-08-31T01:06:56.109Z","content":"REVIEWER_SENTINEL_MUST_SURVIVE_RPC","delivery":"idle"}
```

**The sentinel survived the RPC delivery intact and submitted afterwards, in
order, from a composer the screen rendered as blank.** I observed the same
sequence earlier on a separate instance (`…09e1`, draft
`HUMAN DRAFT DO NOT LOSE THIS`, submitted 01:02:37Z) before re-running it
cleanly to retain the artifact.

Note the receipt's own instrument, run against my repro *after* submission,
returns a match (`jq` exit 0) where before submission it returned exit 4 — so
that instrument reports **"has this text been submitted yet"**, not "does the
buffer still hold it". It answered a different question and the answer was read
as loss.

**Why it matters.** Consequence #4 is inverted. The transport does **not**
destroy human input; it **interjects**. The E55 requirement for a human-typing
gate *survives* — I confirmed a turn ran at 01:06:45Z while a draft was pending,
which is unconsented interruption — but the justification must change from
*data loss* to *consent*. A downstream unit told the transport eats keystrokes
may over-build recovery/restore machinery for a defect that does not exist.

**Scope of my refutation, stated precisely:** reproduced for `mode:"enqueue"`.
For `mode:"immediate"` (:285-309) the identical instrument defect applies, so
the claim is **unsupported**, but I did not test it and do not assert it false.
Re-test both with the Enter discriminator.

### F2 — Instrument state does not identify the binary. **[MEDIUM-HIGH]**

`u-copilot-verify.md:3, 33-39`

The receipt pins the instrument as `GitHub Copilot CLI 1.0.82-0`. On this
machine that string does not identify a binary — there are two on `PATH` and
they are **different artifacts**:

```console
$ which -a copilot
/Users/jordanknight/.npm-global/bin/copilot     # node shim -> @github/copilot 0.0.412-2
/Users/jordanknight/.local/bin/copilot          # Mach-O arm64, Jan 15 2026

# both answer --version identically: "GitHub Copilot CLI 1.0.82-0."
3f7ca3e28fd9…d00b  …/@github/copilot-darwin-arm64/copilot   (146243664 B, Aug 28)
02c95ab4968b…444c1  /Users/jordanknight/.local/bin/copilot   (133777024 B, Jan 15 2026)
```

A future reader re-running these probes after a `copilot update`, or with a
different `PATH` order, cannot tell whether they are on the same instrument.

Mitigating: the receipt *does* pin pid 72023 via `lsof` (:44-47), and I resolved
that pid to the npm native path — so the binary is recoverable from the
evidence, just not from the receipt. **Fix:** record the resolved executable
path plus `@github/copilot` package version (`0.0.412-2`) and the native sha256.

### F3 — Reverse-order race: observation real, mechanism inferred, n=1. **[LOW-MEDIUM]**

`u-copilot-verify.md:159-186, 214, 342`

The event-log evidence is good and `jq -e` is used correctly so an empty filter
fails loudly. But two things are stated more strongly than they were observed:

- Both frames were written in **one `write`** to the connection (:161-168). The
  reversal is therefore consistent with concurrent handling of batched frames,
  not only with "dispatch racing before busy state is established" (:214). The
  mechanism is **inferred**; say so, or separate the writes and re-observe.
- It is a **single trial**. "No ordering guarantee is safe across a burst"
  (:342) is the conservative direction, so this is low severity — but per the
  wave-7 habit, a race characterised once should be either bounded by repetition
  or explained by a mutation, and labelled accordingly.

### F4 — The probe's session id was fixture-shaped by its own hand. **[LOW]**

`findings-log.md` F0-1 hypothesis 2 speculates that `getForeground` might be
serving a sentinel/absence value, reasoning from the id's zeroed tail:

> "`10900000-0000-4000-8000-000000000000` is a v4-shaped UUID with a zeroed tail
> — fixture-shaped rather than generated."

That id was supplied by the coder's own launch flag
(`--session-id 10900000-…-000000000000`, receipt :27). The server echoed back
what it was given. The hypothesis is self-inflicted and cost a line of enquiry.
**Use a random UUID for probe sessions**, so a returned id can never be confused
with a sentinel. (Harmless here — hypothesis 1/3 territory turned out correct —
but it is exactly the confusion the id choice invited.)

### F5 — The receipt is not committed. **[LOW-MEDIUM]**

Packet acceptance: "Receipt committed and pushed before your done message."

```console
$ git status --porcelain
?? docs/plans/109-copilot-rpc/assets/reports/u-copilot-verify.md
$ git rev-parse HEAD origin/s109/copilot-rpc
37785dc6…  37785dc6…   # identical; findings-log.md IS committed and pushed
```

The findings log made it; the receipt did not. Raised as an open item rather
than a defect — the coder may not have sent a done message yet.

### F6 — Claim 3's verdict conflates a CONFIRM with a DIVERGE. **[LOW]**

`u-copilot-verify.md:15`

The row reads "session.send exists, returns a server-assigned messageId" →
**DIVERGE**. But the receipt's own evidence *confirms* the messageId half: the
request carried no `messageId` and the response supplied one (:153), and the ids
across sends are distinct UUIDs (`17d904fc`, `fd5e02d0`, `30f3a5f8`, `f88fc882`,
`2250f5f8`, `a98284d6`, `0b92ed3f`). I independently confirmed non-echo: request
id `c2` → `messageId 1e0cd01d-…`. The divergence is **solely** the undocumented
resume/connection-lifetime prerequisite. Split the row, or unit 2 will read
"messageId unreliable" and cap a grade for the wrong reason.

### F7 — New surface fact, outside the six claims: the port enumerates the whole machine. **[MEDIUM — information, not a defect]**

Not something the receipt got wrong; something nobody was asked to look for.

`session.list` on a `--ui-server` port returns **every persisted Copilot session
on the machine**, not only the server's own:

```console
$ python3 probe_frame.py 47901 session.list '{}' rev-ctl1
--- RESPONSE (1165968 bytes) ---   # 1,165,941-byte body
{"sessions":[{"sessionId":"10900000-…-000000000000","summary":"Verify Boot with Copilot RPC",
  "context":{"cwd":"/Users/jordanknight/pi-hacking/pij-worktrees/s109-copilot-rpc",
  "repository":"AI-Substrate/pij","branch":"s109/copilot-rpc"}}, …]}
```

That is my instance reading the **coder's** session metadata — cwd, repo,
branch, title. Anything that can reach loopback port N can enumerate it.

Bounded honestly: `session.send` is **not** equally open. It requires the target
to be attached to *that connection* via `session.create` or `session.resume`, so
this is disclosure, not proven cross-session injection. I did **not** attempt a
send at any session I do not own. Whether `session.resume` will attach an
arbitrary foreign live session is **unsettled and worth settling** before unit 1
decides what `rpc_port` implies — if it will, the port is an injection surface
for every seat on the box, not just its own.

---

## CHECKED AND NOT RAISED

- **Claim 1 (flag accepted, port listening) — independently corroborated.** At
  00:53:35Z I observed `copilot 72023 … TCP 127.0.0.1:47777 (LISTEN)`, the same
  pid/port/device the receipt quotes. The CONFIRM rests on an observed listening
  socket and an accepted connection, **not** on launch exit status. I separately
  confirmed `--ui-server`/`--port` appear nowhere in the 292 lines of `--help`,
  so the flags are hidden yet functional — and the receipt correctly declines to
  treat the help-absence as evidence either way (:56).
- **Claim 2 (Content-Length framing) — independently reproduced.** My own framed
  request returned
  `Content-Length: 116\r\n\r\n{… "error":{"code":-32601 …}}`. The receipt's HTTP
  negative discriminator (:79-90) is a genuine discriminator and it actually
  ran. No reliance on `strings`.
- **No production seat touched — verified independently, not taken on trust.** At
  00:53:09Z `ps` showed the probe process launched with its own
  `--session-id 10900000-…-000000000000`, cwd inside the s109 worktree, started
  ~2 min earlier; its session directory was created at the same time. It is a
  dedicated spawn. Nothing in the receipt references a registry seat or a pane
  belonging to a human. **Not a finding.**
- **The resume prerequisite (claim 3's real divergence) — independently
  reproduced.** Connect→`session.send` fails `-32603 Session not found`;
  `session.resume` then `session.send` on the **same** connection succeeds. I
  further confirmed the failure is *not* explained by folder-trust state or by
  session persistence: it persisted across clearing the trust modal (proven by
  `capabilities.extensions` flipping `false`→`true`) and across a completed TUI
  turn that wrote a 78 883-byte `events.jsonl`. The receipt's diagnosis is
  correct and its "not a per-message connect/send/close" consequence (:155, 340)
  is sound and important.
- **Claim 5 (readiness is not a busy gate) — sound.** The probe at
  `01:00:35.855Z` sits inside the observed turn interval
  `01:00:34.891Z → 01:00:52.413Z`, both from the event log. That is a real
  positive-during-busy observation, not an inference.
- **Claim 5's UNDETERMINED is honest** (:252). A once-per-session latch is
  client-side state; with no transport code there is no latch to observe.
  Correctly scoped, and the receipt still extracts the actionable half — latching
  a pre-resume positive would cache a false ready. This is **not** a claim
  nobody attempted.
- **Receipt does not overclaim on turn execution.** Where it says the TUI ran
  the prompt it cites a rendered marker or an event-log `assistant.message`; I
  found no place where an ack is read as proof a turn ran. E52 discipline held.
- **`jq -e` usage** (:178, 313) correctly makes an empty filter exit non-zero
  rather than pass silently — the wave-7 "filter matched nothing" trap was
  avoided. My objection at F1 is to *which file* was searched, not to how.
- **Six claims are all present and separately graded.** None silently merged
  (F6 is a labelling split, not an omission).
- **Tree not mutated by the probe**: worktree clean apart from the untracked
  receipt; no stray listener on 47777 after the coder's instance exited.

---

## MY OWN INSTRUMENT ERRORS (disclosed; none reached a verdict)

1. **My v1 probe read only the first frame.** The endpoint emits unsolicited
   `session.lifecycle` / `host.event` notifications, so my `session.create`
   result was actually a *notification*, which I briefly mis-read as the
   response. The design input warns about exactly this ("skip server
   notifications") and I did not honour it until it bit me. Fixed in `probe2.py`
   by matching on our `id`. No finding rested on the v1 classification.
2. **A "read-only" method sweep mutated state.** `session.create` in my sweep
   created real sessions (`b6bc28a5…`, `27b2bfc5…`, later `49f946d6…`). That is
   habit 7's violation — a check writing to what it judges — committed by the
   reviewer. All three removed by explicit path; the coder's session was never
   touched.
3. **A confounded cross-session conclusion, caught by its own control.** I first
   read "Session not found" for instance B as proof `session.send` is
   connection-scoped. Control 1 showed **neither** B **nor** A appeared in
   `session.list` — they were not yet persisted — so "not found" was
   uninformative. Hypothesis withdrawn before it reached a finding; the true
   mechanism (attach-per-connection) was established afterwards.
4. **My first F1 observation rested on a deleted artifact.** I destroyed session
   `…09e1` during cleanup, leaving that run evidenced only by quoted transcript
   output. Because F1 is load-bearing I re-ran it on a fresh instance and
   retained `repro-events.jsonl` rather than ask anyone to trust the first pass.
5. **I truncated an `lsof` sweep with `head -30`** and port 47777 was not in the
   visible portion. I re-queried the port directly instead of reading its
   absence from a truncated list as absence in the world.

---

## WHAT WOULD CLEAR THIS ROUND

1. **F1**: re-test mid-compose for both `enqueue` and `immediate` using the Enter
   discriminator; correct the claim-6 verdict text, line :216, and consequences
   #4/#5. If the corrected result matches mine, the gate requirement stands on
   consent grounds and should say so.
2. **F2**: pin resolved binary path + package version + sha256.
3. **F3**: label the race mechanism inferred, or separate the writes / mutate.
4. **F4**: random UUID for probe sessions (carry into units 1-2).
5. **F5**: commit and push the receipt.
6. **F6**: split claim 3's row.
7. **F7**: decide whether unit 1 must settle foreign-session `resume` before
   `rpc_port` semantics are fixed. My recommendation: settle it — it changes what
   the field means.

Claims 1, 2, 3 (mechanism), and 5 I consider **carried**. Re-review will be
scoped to the above unless the re-test moves something else.
