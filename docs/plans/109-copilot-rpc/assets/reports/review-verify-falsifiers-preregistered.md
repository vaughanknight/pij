# Reviewer falsifiers — u-copilot-verify (plan 109, unit 0)

**PRE-REGISTERED.** Written before opening any coder result file, receipt, commit
message, or branch diff. At the time of writing I had read only: `SHAPE.md`,
`packet-reviewer-verify.md`, `packet-u-copilot-verify.md`,
`108-rust-port/assets/REVIEWER.md`, and the s105 design input @ `63dbe9ae`
(§§0–9). I had NOT read `assets/reports/u-copilot-verify.md` nor `git log` on
`s109/copilot-rpc` beyond the head SHA printed by `git worktree list`
(`833c1d2f`, which I saw incidentally while confirming the worktree existed).

Falsifier = **the observation that would prove the receipt's verdict unsound.**
Not a test that would pass.

---

## Class A — the null-result-as-positive class (the plan's most expensive lesson)

**RF1.** Any claim graded CONFIRM whose supporting observation is an *absence*:
process did not exit, no error printed, launch returned 0, log had no complaint.
Falsifier: the cited command's output contains no positive artefact (no accepted
connection, no bytes read, no socket in LISTEN). Severity: **critical** — this is
the discriminator-that-never-ran defect.

**RF2.** A capture cited as evidence that is **zero-length or absent**, read as
success. Falsifier: byte count of the cited capture is 0, or the file named does
not exist. Severity: critical.

**RF3.** A probe reported as run whose command could not have produced the quoted
output (wrong flag, wrong port, tool not installed). Falsifier: re-running the
literal command yields a different shape, or the tool is absent from PATH.
Severity: critical.

## Class B — verified against the wrong thing

**RF4 (claim 1, listening).** A port shown LISTEN but **not owned by the spawned
Copilot PID**. Falsifier: `lsof -nP -iTCP:<N> -sTCP:LISTEN` PID ≠ the launched
process, or receipt never pins the owning PID. A port that something else owns is
the recycled-identifier class arriving early. Severity: high.

**RF5 (claim 2, framing).** Framing "confirmed" from `strings`/binary greps/docs
rather than a byte exchange. A token present in a binary proves the token is in
the binary. Falsifier: no request bytes written AND no response frame with a real
`Content-Length` header quoted. Severity: high.

**RF6 (claim 3, server-assigned messageId).** `messageId` called server-assigned
without excluding that it echoes the client's `id` or a client-supplied field.
Falsifier: the request quoted contains the same value the response returns, or
only ONE call is shown (one sample cannot distinguish assigned from echoed).
Minimum honest evidence: two sends, distinct ids, neither supplied by client.
Severity: high.

**RF7 (claim 4, enqueue politeness).** CONFIRM that `mode:"enqueue"` is polite to
the MODEL's turn queue based only on the send succeeding. The two candidate
targets (model turn queue vs human composer buffer) are **indistinguishable from
a successful ack** — separating them requires observing composer/pane state.
Falsifier: verdict is CONFIRM/DIVERGE with no observation of composer contents or
turn boundary. Correct verdict absent that observation is UNDETERMINED.
Severity: high.

**RF8 (claim 5, readiness latched).** Latching is a property of a *client* that
remembers. Falsifier: LATCHED graded CONFIRM from server responses alone, with no
client state to latch. Without transport code this is UNDETERMINED for the latch
half even if the call's *answer* is observable. Watch for one half of the claim
being answered and the whole claim being graded.

**RF9 (claim 6, mid-compose).** CONFIRM/DIVERGE without a genuinely non-empty
composer held on the pane at the moment of send. Falsifier: no evidence the
composer was non-blank (no pane capture before/at send). Severity: high — this is
E55's exact incident.

**RF10.** An ack read as proving a layer above the one that acked (turn ran,
model saw it, human saw it). Severity: high.

## Class C — instrument state

**RF11.** Receipt does not pin: binary path, version string, PID, port, and the
wall-clock of the run. Falsifier: any of these missing for a claim that depends on
it. A test whose instrument state is not pinned reports the environment.
Severity: medium, rising to high where a verdict turns on it.

**RF12.** Version drift: the binary version named in the receipt ≠ the version
installed now. Falsifier: `--version` mismatch. Note this can be innocent (they
ran earlier) but it must be *stated*, and a stale baseline fails silently toward
a pass.

## Class D — production seat

**RF13.** Any evidence the probe attached to, sent to, or read from a seat in the
live pij registry or a tmux pane owned by a human/peer session. Falsifier: a
session id / pane id in the receipt that also appears in the live registry or
`tmux list-panes`, without an explicit spawn of its own. **A finding regardless
of outcome** (packet rule, and the Telegram precedent). Severity: high.

**RF14.** The probe mutated what it judged: wrote config, touched
`~/.config`/state of a real Copilot install, regenerated a lock, left a process
running. Falsifier: dirty tree, stray listener, or modified user state after the
run. Severity: medium–high (habit 7).

## Class E — honesty of the verdict set

**RF15.** An UNDETERMINED that is in fact cheaply determinable **without**
transport code. Falsifier: I can settle it myself with an off-the-shelf client
(`nc`, python socket) in one command. That is a claim not attempted, dressed as a
limit. Severity: medium.

**RF16.** A CONFIRM that could only have come from writing the transport the
packet forbade. Falsifier: transport code in the diff. Note: evidence may still
be sound; the rule breach is the finding. Severity: medium.

**RF17.** Six claims required; fewer than six graded, or a claim silently merged
into another. Severity: medium.

**RF18.** Receipt not committed+pushed before the done message (packet
acceptance). Falsifier: receipt absent from origin, or commit timestamp after the
done message. Severity: low–medium.

## Class F — my own conduct

**RF19.** I must not move HEAD in the coder's worktree, must restore anything I
probe, and must disclose every instrument error of my own. If I spawn a Copilot
to check something, it must be my own instance on my own port, and I must kill it
and say so.

---

## Baseline commitments

Baseline values (installed binary, version, live seats, live listeners) are to be
measured **at the moment I use them** and stamped with wall-clock in the review,
because a stale before-value fails silently in the direction of a pass. I will not
carry a number measured now into a later section without re-measuring or saying
it was not re-measured.
