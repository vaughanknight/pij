# Review round 2 — u-copilot-verify (plan 109, unit 0) @ 2766adcf

**Verdict: REFUSE.** Two load-bearing claims are falsified by reproduction under
the coder's own procedure. The receipt's central value **survives** — see the
framing note at the end, because it matters for the hold on units 1 and 2.

**One finding in this review (R2-5) was raised and then WITHDRAWN as my own
error** — it is kept in place, marked, rather than deleted.

## Instrument state (mine, measured at time of use)

| item | value |
|---|---|
| falsifiers | pre-registered **before** round 1, `00:53:09Z`, sha256 `8afb2910…4a0c13` — **re-verified unchanged at 01:26:29Z**, reused for this round |
| receipt graded | `2766adcf` — unchanged from the file I refused in round 1 |
| branch head at write time | `8ddfbf95` (moved from `009710ef` mid-review; findings-log F0-1-resolved/F0-2/3/4 landed there) |
| my probe instances | 47903 (r1), 47904 + resume-holder (r2), sessions `…09e3/09e4` — all mine, all destroyed |
| retained artifacts | committed alongside this review: `review-verify-R2-1-composer-events.jsonl`, `review-verify-R2-2-ordering-events.jsonl`; originals in `/tmp/s109-review/` |
| coder's instrument | pid 72023 / 47777 — **verified live at 00:53:35Z**; exited before 01:04:57Z and **cannot be re-verified now** |

---

## FINDINGS

### R2-1 — Buffer destruction is FALSE. Reproduced under the coder's own rig, for BOTH modes. **[CRITICAL]**

`u-copilot-verify.md:16, 216, 283, 309, 343`

> ":343  The observed consequence was loss of the unsent buffer, not merely interjection."

I rebuilt their rig exactly — persistent `session.resume` held on one connection,
`session.send` issued from a **separate one-shot** connection, their exact
sentinel strings, both modes — and first **reproduced their "after" observation
precisely**: marker printed, composer rendering `@ files · # issues`, sentinel
not visible. Same shape as their :277-283.

Then I ran the step they never ran: **press Enter.**

```console
$ jq -ce 'select(.type=="user.message") | {t:.timestamp, content:.data.content, delivery:.data.delivery}' \
    evidence/r2-procedure-matched-events.jsonl
{"t":"2026-08-31T01:27:37.660Z","content":"Reply exactly RPC_DURING_COMPOSE and do not use tools.","delivery":"idle"}
{"t":"2026-08-31T01:28:03.268Z","content":"HUMAN_COMPOSER_SENTINEL_DO_NOT_SUBMIT","delivery":"idle"}
{"t":"2026-08-31T01:28:42.447Z","content":"Reply exactly RPC_IMMEDIATE_DURING_COMPOSE and do not use tools.","delivery":"idle"}
{"t":"2026-08-31T01:29:05.140Z","content":"HUMAN_COMPOSER_IMMEDIATE_DO_NOT_SUBMIT","delivery":"idle"}
```

**Both sentinels survived and submitted intact, after the RPC turn, in order.**
`:309` — "No tested send mode preserved the unsent human buffer" — is false for
both tested modes. This closes the scope gap I deliberately left in round 1,
where I refuted `enqueue` and declined to assert `immediate` untested.

**Why their instrument cannot see it** (the PM's first question, answered
directly). Their check is:

```console
$ jq -ce 'select(tostring | contains("HUMAN_COMPOSER_"))' …/events.jsonl
Command exited with code 4
```

Exit 4 is what a **preserved-but-unsubmitted** draft produces, *identically* to a
destroyed one — an unsent composer buffer is in-memory TUI state and is not
written to session state either way. Against my run the same command returns
exit **0** — but only *after* the Enter. So the instrument reports **"has this
text been submitted yet"**, not "does the buffer still hold it". The PTY capture
fails the same way: the placeholder renders over a populated buffer, which I
demonstrated by rendering it and then submitting from it.

**"Could the sentinel have been consumed by something else?"** — the PM's
specific concern, and the answer is clean. In each run the sentinel appears
exactly once, as its own `user.message` with `delivery:"idle"`, at the moment I
pressed Enter, *after* the RPC prompt's separate `user.message`. Nothing else
consumed it and nothing merged it; the RPC prompt and the draft are distinct
records with distinct timestamps.

**On the bounding at `:336`** — the PM asked that "no recovery found" stay a
boundary rather than an absolute, and the coder's wording ("no Copilot-owned
persistence found; the only surviving copy was the external PTY capture") is
**correctly bounded, and I am not raising the wording**. I am raising that it
answers a question that should never have been asked: there was no loss to
recover from. A locally-honest boundary is doing globally-misleading work,
because it presupposes the destruction it is bounding.

**What survives, and it is the important half.** A turn ran while a draft was
pending, in every run, in both modes. That is unconsented interruption — E55's
class, confirmed first-party. So `:344` (a composer/interaction gate is a hard
precondition on the RPC path) **stands**. Only its justification changes: from
*data loss* to *consent*. Unit 2 must still gate; it must not build
draft-recovery machinery for a defect that does not exist.

### R2-2 — The ordering mechanism is refuted by isolation. **[HIGH]**

`u-copilot-verify.md:214, 342` — the PM's third question.

> ":214  established model-turn queueing works, but request dispatch can race
> **before busy state is established**."

**The evidence fits that story; it does not carry it.** The two cases differ in
*two* variables at once:

| case | write shape | session state at dispatch | result |
|---|---|---|---|
| burst (:161-186) | two frames, ONE write | idle | reversed |
| busy control (:190-212) | two separate writes, with delay | turn established | in order |

Nothing isolates which variable produced the difference. I held the session
**busy** and re-ran the *batched* write (A then B, one 487-byte `sendall`):

```console
$ jq -ce '…' evidence/r2-ordering-events.jsonl
{"t":"2026-08-31T01:30:22.083Z","marker":"BUSY_ESTABLISH","delivery":"idle"}
{"t":"2026-08-31T01:30:37.325Z","marker":"ORDER_B","delivery":"queued"}
{"t":"2026-08-31T01:30:39.594Z","marker":"ORDER_A","delivery":"queued"}
```

Both frames were labelled `queued` — so busy state **was** established and
correctly detected for both — **and they still reversed.** The reversal is
therefore *not* "before busy state is established"; it is concurrent handling of
pipelined frames, and it persists regardless of busy state.

**Why it matters more than the wording.** The receipt's mechanism invites the
mitigation "establish a turn first, then send" — which my test shows **does not
work**. The only mitigation the evidence supports is one in-flight send at a
time, awaiting each ack before writing the next. A unit-2 author reading `:214`
would pick the broken one.

The conservative conclusion at `:342` ("no ordering guarantee is safe across a
burst") is correct and should stay. Replace the mechanism, not the verdict.

### R2-3 — The two CONFIRMs are sound; the instrument pin is not. **[MEDIUM]**

The PM's second question: are the CONFIRMs as well evidenced as the DIVERGEs?
**Yes — claim 2 is arguably the best-evidenced item in the receipt.** Neither
rests on an absence:

- **Claim 1** rests on a listening socket and an accepted connection, explicitly
  *not* on launch success — and the receipt says so (`:56`). I independently
  verified **while the instrument was live**, at 00:53:35Z:
  `copilot 72023 … TCP 127.0.0.1:47777 (LISTEN)` — same pid, port and device as
  `:44-47`. I further resolved pid 72023 to the npm native binary, child of node
  wrapper 72013, launched with their own `--session-id`. I also confirmed
  `--ui-server`/`--port` appear nowhere in the 292 lines of `--help`, so the
  flags are hidden yet functional — and the receipt correctly refuses to treat
  that help-absence as evidence either way.
- **Claim 2** covers *both* directions — the server parses `Content-Length`
  (their HTTP probe → `-32700` header error, a real negative discriminator that
  actually ran) and emits it. I reproduced framing independently by a third
  route (`-32601` on a bogus method).

**But**: the instrument pin remains unfixed from round 1. `GitHub Copilot CLI
1.0.82-0` does **not** identify a binary here — two are on `PATH`, both print
that string, different sha256 (`3f7ca3e2…` 146 243 664 B vs `02c95ab4…`
133 777 024 B). The receipt already holds a better pin it never uses: the
endpoint returns **`protocolVersion: 3`** (`:73`) — a wire-level identifier that
survives a `copilot update`. Record that plus the resolved path and package
version `0.0.412-2`.

**Limitation of my own corroboration, stated plainly:** the coder's process has
exited (no listener on 47777 at 01:04:57Z and again at 01:31:46Z). My claim-1
corroboration is anchored to the 00:53:35Z window and **cannot be re-run by
anyone now.** That is exactly why the baseline was timestamped at the moment of
use rather than recalled afterwards.

### R2-4 — The UNDETERMINED is honest; the settled half is undersold. **[MEDIUM]**

The PM's fifth question. **Genuinely unsettleable, not a claim ducked.** A
once-per-session latch is client transport state; with no transport there is no
latch to observe. The receipt scopes this correctly at `:252` and still extracts
the actionable half.

What it undersells: two things *were* settled by observation, and neither
reaches the consequences list.

1. `getForeground` returns **positive pre-resume, when `session.send` is
   guaranteed to fail** — a false ready. That is the false-positive readiness
   result, observed, not inferred.
2. `getForeground` stays positive **during** a live turn: probe at
   `01:00:35.855Z` sits inside the turn interval `01:00:34.891Z → 01:00:52.413Z`,
   both timestamps from the event log. Real positive-during-busy evidence.

The rule at `:252` — never latch a pre-resume positive — is the single most
directly actionable line in the section and belongs in "Consequences for
downstream units", which currently omits it.

**Partially resolved after I drafted this.** At `8ddfbf95` the findings log adds
F0-4, which states the false-positive and the caching rule explicitly. The gap is
now only that the receipt's own consequences list still omits it. Downgrade to
**LOW**.

### R2-5 — WITHDRAWN. My error: the round-1 artifacts were committed, not removed. **[my instrument error, not a finding]**

I originally filed this as a process finding, on this evidence:

```console
$ git status --porcelain      # at 01:26:14Z
                              # empty — no trace of my four untracked files
```

**That inference was wrong.** The files were **committed** in `009710ef`, which
is why they no longer appeared as untracked:

```console
$ git log --oneline -- .../review-verify-round-1.md
009710ef docs(109): cutover pi/OMP phase …
$ git ls-files .../reports/
review-verify-F1-repro-events.jsonl
review-verify-evidence-stamp.txt
review-verify-falsifiers-preregistered.md
review-verify-round-1.md
u-copilot-verify.md
```

My round-1 review, its pre-registered falsifiers, the stamp and the F1 repro
events are all tracked and preserved. **The finding is withdrawn in full and the
recommendation attached to it is void.**

This is the exact defect I am paid to catch, committed by me: I read absence from
**one tool's scope** (`git status` reports *untracked* files) as absence **in the
world**, and did not run the one command that distinguishes "deleted" from
"committed". It is the same shape as R2-1 — an instrument answering a different
question than the one asked — and I made it while writing up R2-1.

What survives from it, as plain fact rather than finding: the receipt at
`2766adcf` is unchanged from the file I refused, so round-1 F1/F2/F3/F4/F6 were
not applied to the receipt itself.

### R2-5b — The false destruction claim has now propagated into a binding for unit 2. **[HIGH — raises R2-1's cost]**

`findings-log.md` F0-2, added at `8ddfbf95` (i.e. *after* my round-1 refusal):

> "`mode:"enqueue"` **DESTROYS** a human's unsent composer text … The sentinel
> was gone. … **It destroys the words a person was still writing, with no record
> anywhere that they existed.**"

and it draws two bindings from that:

> "**The gate is a data-loss guard, not etiquette.**" — which it uses to *close*
> the standing 2026-08-27 operator question on queue-vs-splice.
> "**'Socket is transport, tmux is politeness' DOES NOT HOLD HERE.**"

R2-1 falsifies the premise both rest on. This matters in **both** directions, and
the second is the dangerous one:

- the binding's *conclusion* — gate the RPC path, honour it on the path itself,
  two stable blank observations — is **correct and should stand**;
- but it is now justified by a mechanism that does not exist. A later reader who
  reproduces my result will find the stated justification false and may conclude
  the gate can be **relaxed**. A correct rule resting on a false reason is weaker
  than the same rule resting on a true one, because the reason is what gets
  re-examined.

The true justification is available and sufficient: an RPC send **runs a model
turn in a human's live session while they are mid-sentence, without consent**,
in both modes, every time I tested it. Gate it for that. Also reopen the operator
question F0-2 closed — it was closed on the data-loss finding.

### R2-6 — Carried from round 1, still open. **[LOW]**

- **Claim 3's row grades a CONFIRM as DIVERGE** (`:15`). The `messageId` half is
  confirmed — the request carries none, the response supplies one, and the ids
  are distinct UUIDs. I re-confirmed non-echo (request `compose-1` →
  `0e0862ba-…`). The divergence is *solely* the undocumented resume
  prerequisite. Split the row or unit 2 will cap a grade for the wrong reason.
- **`findings-log.md` F0-1 hypothesis 2** reasons about a "fixture-shaped
  sentinel id" that the coder supplied itself via `--session-id`. Use a random
  UUID for probe sessions.

---

## CHECKED AND NOT RAISED

- **No Jordan-owned seat was touched — verified twice, not accepted.** `ps` at
  00:53:09Z: the probe was its own spawn, own `--session-id`, cwd inside the s109
  worktree, started ~2 min earlier, own session directory created at the same
  time. Registry sweep at 01:31:59Z: **no pij seat owns that session id or port**
  — the `~/.pij` hits are the PM's own inbox messages *about* the probe, not a
  seat registration. **Not a finding.**
- **The resume prerequisite (claim 3's real substance) — independently
  reproduced and its rivals eliminated.** Connect→send fails `-32603`;
  resume→send succeeds. I additionally ruled out two confounds the receipt did
  not need to: it is **not** the folder-trust modal (failure persisted after
  clearing it, proven by `capabilities.extensions` flipping `false`→`true`) and
  **not** session persistence (failure persisted after a completed TUI turn wrote
  a 78 883-byte `events.jsonl`). This finding is correct and is the most valuable
  thing in the receipt.
- **Registration is process-global once resumed — corroborated.** My one-shot
  send at 01:27:37Z succeeded from a *separate* connection while the resume was
  held on another. The receipt's `:144-155` conclusion is right, and its
  "cannot assume per-message connect/send/close" consequence is sound.
- **`jq -e` discipline** (`:178, :313`) correctly turns an empty filter into a
  non-zero exit. My objection at R2-1 is to *which file* is searched, never to
  how.
- **E52 discipline held.** I found no place where an ack is read as evidence a
  turn ran; turn claims cite a rendered marker or an `assistant.message`.
- **Six claims present and separately graded**; none silently merged.
- **Receipt now committed and pushed** — round-1 F5 resolved.
- **`findings-log.md` F0-3's *binding* is right even though its mechanism is
  wrong.** "One in flight per seat, the next sent only after the previous is
  **observed** complete (observed, not acked)" is exactly the mitigation my
  isolation supports, and the observed-not-acked distinction is E52 discipline
  applied correctly. Only the sentence deriving it ("can race before busy state
  exists") needs replacing — **not** the rule.
- **F0-1-resolved ("the id is not the problem; the CONNECTION is")** matches my
  independent reproduction exactly.

## MY OWN INSTRUMENT ERRORS (disclosed; none reached a verdict)

1. **Round 1's F1 rested on an artifact I had deleted** in my own cleanup. I
   flagged it then and re-ran with retention. This round I retained every
   artifact from the start.
2. **Round 1 scoped the refutation to `enqueue`** and explicitly declined to
   assert `immediate` because I had not tested it. Correct but incomplete — I
   closed it this round by testing rather than by extending the inference.
3. **My ordering isolation depends on the session really being busy.** A 6 s
   sleep is not proof, so I did not rely on it: I verified from the
   `delivery:"queued"` label on **both** batched frames. Had either returned
   `idle` the test would have been void, and I checked rather than assumed.
4. **Still applicable from round 1**: my v1 probe read an unsolicited
   `session.lifecycle` notification as a response (the design input warns about
   exactly this); and my "read-only" method sweep called `session.create` and
   created three real sessions — habit 7 violated by the reviewer. All removed by
   explicit path; the coder's session was never touched.
5. **A confounded conclusion withdrawn in round 1** — I briefly read "Session not
   found" for a second instance as proof of connection-scoping, until my own
   control showed neither session was persisted yet.
6. **I filed R2-5 on a false inference and withdrew it.** I read an empty
   `git status --porcelain` as "my artifacts were deleted", when they had been
   **committed** in `009710ef`. `git status` reports *untracked* files; absence
   there is not absence on disk. One command (`git log --` / `git ls-files`)
   distinguishes the two and I did not run it before writing the finding. This
   is the same defect class as R2-1 — an instrument answering a different
   question than the one asked — and I committed it *while writing up R2-1*. The
   finding is withdrawn in the body rather than deleted, so the error stays
   visible.

---

## Framing — what this refusal does and does not do to the hold on units 1 and 2

The hold is **justified**, and the receipt earns it. Three of its four
divergences are real, first-party, and reshape the design:

- `session.send` requires a live `session.resume` registration — the design
  input's wire sequence, used as written, **always** fails. This alone
  invalidates the transport shape units 1-2 would have been built on.
- `getForeground` is a false ready pre-resume and is not a busy gate.
- Ordering is not guaranteed across a burst.

What is **wrong** is not the decision to hold but two inputs to the reshape:

1. the transport does **not** destroy human keystrokes — it interjects; and
2. the ordering mechanism is **not** "before busy state is established", so the
   mitigation it implies does not work.

Both errors push unit 2 toward building the wrong thing — draft-recovery
machinery, and a turn-establishment ordering fix — and both have now been
written into `findings-log.md` as bindings (F0-2, F0-3). Correct those two and
the receipt becomes what the PM hoped: four unchecked claims in an upstream
document brought to ground, with the transport that would have been built on
them not built.

## WHAT WOULD CLEAR THIS ROUND

1. **R2-1**: re-test both modes with the Enter discriminator; correct `:16`,
   `:216`, `:283`, `:309`, `:343`; recast `:336` and consequence #4 from loss to
   interjection. Keep `:344` — the gate — on consent grounds.
2. **R2-2**: replace the mechanism at `:214`; keep the verdict at `:342`; state
   the mitigation as serialize-and-await, not establish-a-turn-first.
3. **R2-3**: pin `protocolVersion: 3` + resolved path + package version.
4. **R2-4**: promote "never latch a pre-resume positive" into the consequences.
5. **R2-6**: split claim 3's row; random UUIDs for probe sessions.
6. **R2-5b**: correct `findings-log.md` F0-2 — the destruction premise, the
   "data-loss guard, not etiquette" binding, and the "socket is transport, tmux
   is politeness DOES NOT HOLD HERE" line. Keep the gate; re-found it on
   consent. **Reopen the 2026-08-27 operator question F0-2 closed**, since it
   was closed on the data-loss finding.
7. **F0-3**: replace the mechanism sentence only. The binding — one in flight,
   next sent only after the previous is *observed* complete — is correct and
   should be preserved verbatim.

Claims 1, 2, 3, and 5 I consider **carried**. Re-review scoped to the above.

---

# ADDENDUM — the two CONFIRMs, probed one layer below

Added after the PM restated that a confirmation gets less scrutiny than a
contradiction. Both CONFIRMs **stand**. Both were also **under-discriminated**,
and probing below them produced one new finding that binds unit 2.

Instrument: my own isolated seat, port **51947**, session `…09f1`, spawned and
destroyed 01:52-01:55Z. The coder's rig was already down (47777 dark since
~01:04Z), so nothing here reuses it and no Jordan-owned seat was involved.

## A2-1 — Claim 1 was true but could not have discriminated its own alternative. **[MEDIUM]**

The receipt proves a listener on 47777 owned by the launched pid. With **one**
port that cannot distinguish *"`--port N` is honoured"* from *"the server always
binds 47777"* — and "the flag is accepted" is precisely the claim. The flag is
undocumented, and an ignored unknown flag is a normal CLI behaviour, so the
alternative is live rather than pedantic.

Supplied here:

```console
$ lsof -nP -iTCP:51947 -sTCP:LISTEN
copilot 8651 … TCP 127.0.0.1:51947 (LISTEN)
$ lsof -nP -iTCP:47777           # nothing — no fallback to the receipt's port
$ lsof -nP -a -p 8651 -iTCP -sTCP:LISTEN
copilot 8651 … TCP 127.0.0.1:51947 (LISTEN)      # exactly one listener, and it is N
```

Five distinct requested ports across this review (47901, 47902, 47903, 47904,
51947), each honoured exactly, one listener each, never a default. **Claim 1 is
CONFIRMED and now discriminated.** No change to the verdict; the receipt should
cite two ports rather than one.

## A2-2 — Claim 2 was true but tested only the happy path; the failure modes are the finding. **[HIGH — new, binds unit 2]**

The receipt shows the endpoint *speaks* `Content-Length` and parses headers
strictly enough to reject an HTTP request line. Neither shows whether framing is
**required**, nor whether a declared length is **enforced** — and unit 2's
"exact framing, byte-for-byte" contract test depends on both.

| probe | sent | result |
|---|---|---|
| A | bare JSON, no header | **silence** — no response, no error |
| B | newline-delimited JSON | **silence** — NDJSON not accepted |
| C | correct framing (control) | correct result, content-dependent |
| D | `Content-Length: 10`, body 76 B | `-32700 "EOF while parsing an object at line 1 column 10"`, **`"id":null`** |
| E | `Content-Length: 126`, body 76 B | **silence** — server blocks awaiting bytes that never arrive |

Framing is mandatory and the declared length is authoritative (D truncates at
exactly column 10). But the **failure modes are the problem**:

1. **A wrong frame is silent, not an error.** Omit the header (A/B) or
   over-declare the length (E) and the server simply never answers. A framing bug
   is therefore indistinguishable, on the wire, from a hung seat, a slow model, or
   an enqueued-but-not-yet-answered send.
2. **An under-declared length answers with `"id":null`.** The error cannot be
   correlated to the request that caused it.

So on this transport a client-side framing defect presents as **either silence or
an uncorrelatable error** — never as "your frame was malformed".

### The realistic form of the bug, observed

`Content-Length` is a **byte** count. TypeScript's `.length` is UTF-16 code
units. pij bodies routinely carry em-dashes and emoji — these plan documents are
full of both.

```
body: {"…","params":{"note":"baton — handoff 🤖"}}
  JS .length (UTF-16 units) = 108      UTF-8 bytes = 113      delta = 5

declared 113 (correct)  -> {"id":"utf8","result":{…}}
declared 108 (.length)  -> {"id":null,"error":{"code":-32700,
                            "message":"EOF while parsing a string at line 1 column 108"}}
```

Under-declare and you get the uncorrelatable `-32700`; over-declare (an emoji
dropped from a body after the header is computed) and you get **silent hang**.

**Binding for unit 2:** compute `Content-Length` with `Buffer.byteLength(body,
'utf8')`, never `body.length`; add a contract test with a **non-ASCII body**
(ASCII-only fixtures cannot fail this — the two lengths coincide by
construction); and give the client its own response deadline, because **the
transport's own silence is one of its failure modes.**

This also sharpens the design input's ambiguous-window rule (§4: a response
timeout ⇒ failure, treated at-least-once). A timeout here has **three** causes —
malformed frame (nothing was ever enqueued), enqueued-but-slow, and dead seat —
and the transport cannot tell them apart. Retrying at-least-once is right for the
second and wrong for the first, which will retry a frame that can never parse.

## Verdict unchanged

**REFUSE**, on R2-1 and R2-2. The two CONFIRMs are sound — claim 2's positive
control is content-dependent (the response echoes the request's own session id),
which is the strongest available shape and cannot be a canned or absent result.
A2-1 and A2-2 are additive: they do not overturn either CONFIRM, and A2-2 should
be carried into unit 2 whatever happens to the rest.

## My instrument error in this addendum (disclosed)

My first UTF-8 test was **void and I nearly reported it**. `json.dumps` defaults
to `ensure_ascii=True`, so the em-dash was escaped to `\u2014` and the two
lengths were identical — delta 0, both arms returning success, which reads as
"no bug here". I caught it only because I printed the delta alongside the result
instead of printing the verdict alone. Re-run with `ensure_ascii=False` (delta 5)
it reproduced immediately. **A null result that would have been published as a
positive — the exact class this plan family paid most for, in my own hand, in a
probe written to check someone else's.** I have since asserted the delta is
nonzero so the test cannot silently pass for the wrong reason.
