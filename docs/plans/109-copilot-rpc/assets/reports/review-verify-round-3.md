VERDICT: APPROVE — u-copilot-verify (plan 109, unit 0) @ 2423a681
Scoped re-review. Full report: docs/plans/109-copilot-rpc/assets/reports/review-verify-round-3.md
Reviewer: pij-fluttering-carp. Falsifiers pre-registered 2026-08-31T00:53:09Z
(sha256 8afb2910...4a0c13), unchanged across all three rounds.

Every item on the fix list is applied, and applied correctly rather than nominally.
Unit 1 is clear to dispatch.

================================================================
YOUR QUESTION 1 — IS THE RETRACTION COMPLETE, OR ONLY LOCAL?
================================================================

COMPLETE. I swept for it specifically rather than trusting the summary.

Residue sweep across the whole receipt for destroy/destruct/discard/clear/lost/loss/
data-loss/"not merely interjection"/"no polite mode"/"neither submitted nor restored"/
recovery returned three hits, and all three are legitimate correction language:
  :278  names the misread and both non-discriminating instruments
  :330  "neither tested mode destroyed the pending draft"
  :337  "The pending drafts survived and later submitted intact; no data loss"

The load-bearing surfaces are all recast, not just the prose:
  - verdict row 4: "...but the draft survived"
  - verdict row 6: "Pressing Enter afterwards submitted each preserved draft intact"
  - consequence 4: interjection, explicitly "no data loss was observed"
  - consequence 5: "hard precondition ... Mode selection cannot supply consent"
  - :330: "remains a hard precondition on consent grounds, not data-loss grounds"

AND — the thing I was most alert to — THEY DID NOT OVER-CORRECT. The obvious failure
mode of retracting a data-loss finding is to weaken the guard along with it. "Hard
precondition" still appears twice and consequence 5 still forbids a fast path around
the gate. The rule survived; only its justification changed. That is exactly right.

findings-log F0-2 is corrected too, and better than I asked: "REFUTED then RE-FOUNDED",
retraction left IN PLACE rather than rewritten, on the stated ground that a corrected
claim should show its working. My "half true" framing is preserved verbatim — both
modes interrupt without consent (true), neither destroys the buffer (false). F0-3 is
"verdict upheld, mechanism corrected". A2-2 is logged as F0-5 and credited to the
review. The propagation trail is recorded rather than quietly dropped.

One trivial, NON-BLOCKING observation: verdict row 4 imports claim 6's interjection into
claim 4's justification. Body line 238 disambiguates it explicitly ("enqueue is polite
to an already-established model turn boundary when sends are serialized. It is not
permission to interject into a human's live composer; claim 6 carries that independent
consent hazard"), so no reader acting on the consequences can be misled. Not worth a
round.

================================================================
YOUR QUESTION 2 — DOES THE ENTER EVIDENCE DISCRIMINATE, OR MERELY AGREE?
================================================================

IT DISCRIMINATES. And you were right to ask, because the receipt did not show it —
their probe's negative arm is an ABSENCE (if the draft were destroyed, Enter submits
nothing), and this plan's own standing rule says every falsifier must be demonstrated
capable of failing before its green counts. That demonstration was missing.

So I ran the red arm myself, on my own isolated seat, random session id
8ca9d471-676e-4384-a916-62a6cd552903, port 51949:

  GREEN ARM (draft pending at RPC time)
    02:14:46.868Z  user.message  "Reply with exactly: PONG"        <- RPC turn
    02:15:27.848Z  user.message  "SENTINEL_A_8ca9d471\u0015MARKER_B_8ca9d471"

  RED ARM (composer EMPTY at RPC time -- the state destruction would produce)
    02:16:14.713Z  user.message  "Reply with exactly: PONG"        <- RPC turn
    (Enter pressed ~02:16:45Z)  -> NO user.message produced at all

Two observably different outcomes from the same probe. It is not a formality, and it is
not the session-state-search failure whose negative was guaranteed in advance.

A BONUS FROM AN ACCIDENT, worth carrying: my attempt to clear the composer sent the
literal text "\u0015" instead of a control byte, so the clear did not happen -- and the
submitted content came back CONCATENATED: SENTINEL_A + \u0015 + MARKER_B. That is a
STRONGER discriminator than Enter-alone, because it yields a positive artifact in BOTH
worlds: preserved gives "SENTINEL+MARKER", destroyed gives "MARKER" alone. Enter-alone
distinguishes by presence-vs-absence; this distinguishes by CONTENT.

RECOMMENDATION (non-blocking, for unit 2's regression test rather than this receipt):
use the concatenation form. A witness whose failure mode is silence is precisely the
class this plan has been bitten by repeatedly -- including by me this session.

================================================================
FIX LIST — ALL APPLIED, VERIFIED INDEPENDENTLY
================================================================

R2-1  APPLIED. Retraction complete (above). Their own Enter run on a random-UUID seat
      matches my two independent reproductions.
R2-2  APPLIED. Mechanism restated as concurrent handling of pipelined frames; verdict
      upheld; mitigation is serialize-and-await, one in flight per seat until the turn
      is OBSERVED complete. They cite my committed artifact
      review-verify-R2-2-ordering-events.jsonl -- both ORDER frames delivery=queued and
      still reversed.
R2-3  APPLIED and INDEPENDENTLY CONFIRMED. Resolved path, package 0.0.412-2,
      protocolVersion 3, and SHA-256 3f7ca3e28fd9...bd00b -- byte-identical to the
      digest I computed myself in round 1. They also state plainly that two executables
      print the same display version, so the version string is not an instrument pin.
R2-4  APPLIED. Consequence 2 now carries the prohibition: never latch a positive
      observed before the live resume registration exists.
R2-6  APPLIED. Claim 3 split into 3a CONFIRM (messageId server-assigned) and 3b DIVERGE
      (resume/connection lifetime). Random UUIDs adopted for probe sessions.
A2-1  APPLIED. Two requested ports, 47781 and 51948, each with real lsof LISTEN output
      pinned to the owning copilot pid plus an accepted connection. The "always binds
      47777" alternative is now excluded by their own evidence, not only by mine.
A2-2  APPLIED, AND IMPROVED ON. Correct, under-declared and silently over-declared
      frames, with the byte-length binding in consequence 6. Note their node probe
      carries `if (body.length === Buffer.byteLength(body,"utf8")) process.exit(1)` --
      they encoded a guard against the exact void-test failure I disclosed as my own
      error last round, so an ASCII-only body now makes the test EXIT NONZERO instead of
      passing for the wrong reason. That is the right response to a reviewer's mistake:
      turn it into a check.
R2-5b APPLIED in findings-log (above).

================================================================
CHECKED AND NOT RAISED
================================================================

- NO PRODUCTION SEAT, THIS ROUND OR ANY ROUND. Their re-review used random session ids
  on 47781/51948. Every observation of mine ran on my own seats (47901/2/3/4, 51947,
  51949), all destroyed. Verified across rounds by ps and by a registry sweep showing no
  pij seat owns any probe session id or port.
- HOUSEKEEPING VERIFIED, NOT ACCEPTED. Ports 47781, 51948 and my 51949 are all free; no
  copilot ui-server process remains anywhere on the machine.
- Six claim sections present (1, 2, 3 with 3a/3b, 4, 5, 6); old conclusions absent.
- Claim 5's UNDETERMINED remains correctly scoped -- a once-per-session latch is client
  transport state and there is no client to latch. Still honest, still not a dodge.
- Claim 2's positive control remains content-dependent, which is the strongest available
  shape and cannot be a canned or absent result.
- Their probe session dirs (eb0821f7..., f336e876...) are still on disk. NOT a finding --
  the receipt cites their events.jsonl as evidence, so retaining them is correct.

TWO NON-BLOCKING CARRIES FOR UNIT 1/2, neither worth another round:
  1. The Enter-discriminator's durable form should be the CONCATENATION test, not
     Enter-alone (reasoning above).
  2. The receipt's primary R2-1 evidence is cited at a machine-local absolute path under
     ~/.copilot/session-state/. Its ordering evidence, by contrast, cites a committed
     artifact in the repo. Consider copying the Enter-discriminator events.jsonl into
     assets/reports/ so the correction's evidence is as durable as the claim it
     corrects. (My own reproductions ARE committed, so the corrected claim is not
     currently unevidenced -- it is just evidenced under my name rather than theirs.)

================================================================
MY OWN INSTRUMENT ERRORS THIS ROUND — DISCLOSED
================================================================

1. My composer-clear failed silently: I sent the six-character string "\u0015" expecting
   a Ctrl-U control byte. The clear never happened. I noticed only because the submitted
   CONTENT came back concatenated with the literal escape in it -- i.e. the artifact told
   me, not my expectation. Had I been checking presence-vs-absence rather than content, I
   would have recorded a successful clear that never occurred. It turned into the better
   discriminator, but it was luck rather than design, and it is the same class as the
   error I refuted in round 1.
2. My first delivery-verification grep targeted the read-receipt file instead of the
   message file, because `ls -t | head -1` returned the receipt. Corrected within the
   same step; the message body was then verified directly.
3. Carried and still disclosed from earlier rounds: the void UTF-8 probe
   (ensure_ascii=True, delta 0, both arms passing) that I nearly published as a positive;
   R2-5, which I raised and withdrew after reading an empty git status as deletion when
   the files had been committed; the v1 probe that read a notification as a response; and
   the "read-only" method sweep that created three real sessions.

================================================================
VERDICT
================================================================

APPROVE at 2423a681.

Claims 1, 2, 3a, 3b, 4, 5 and 6 are carried. The two CONFIRMs are now discriminated as
hard as the DIVERGEs -- claim 1 by two ports rather than one, claim 2 by its failure
modes rather than only its happy path. The corrected claim 6 is independently reproduced
three times: twice by me under two different procedures, once by the coder under a
random-UUID seat, with the discriminator now demonstrated capable of returning the other
answer.

The hold on units 1 and 2 was justified and the receipt earns its release. Dispatch
unit 1.

One closing note, since you offered the credit: the keystroke mattered, but what made it
findable was your own rule -- that a divergence is a finding rather than an
inconvenience, applied to the receipt as readily as to the upstream document. The coder
retracted its central claim in place, kept its working visible, and turned my disclosed
mistake into an executable guard. That is the part worth banking.
