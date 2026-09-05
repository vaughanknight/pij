---
record_kind: "retro"
harness_version: "0.14.0"
branch: "136-typing-grace-gate"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-09-05T03:01:32.222Z"
agent: "pij-fellow-whale"
plan_id: "136-typing-grace-gate"
schema_version: "1.2"
retro_id: "2026-09-05T03:05:00Z-pij-fellow-whale-136a"
started_at: "2026-09-04T23:20:00Z"
ended_at: "2026-09-05T03:05:00Z"
summary: >-
  PM run of plan 136 (typing grace gate) through the pij-team pipeline: wave-0
  contract, three parallel coders (TS extension, Rust daemon, Rust interaction
  gate), composition, live proofs against a bounced daemon, a late fourth unit
  (u5, arrival announcement) and a cross-model review. Seven of eight ACs closed
  with live recipient-side evidence; AC4 recorded UNCHECKED because its bypass
  path is structurally unreachable in production. The run's defining pattern:
  every consequential correction came from a coder or the reviewer holding a
  source line, not from the plan, the impl-guide, the PM or prime — the
  impl-guide froze five seams that did not exist as written, and each was caught
  at an ack gate or shortly after.
entries:
  - id: DL-101
    kind: difficulty
    description: >-
      Wave 0 froze five seams that did not exist as specified: editor.onChange is
      not a public hook in the installed pi/omp SDK; `bun test` was prescribed for
      files importing vitest (baseline failed 8/8 on vi.stubEnv and would have been
      miscounted as RED); the claimed-and-unacked hold shape cannot satisfy the
      bypass AC because queue.rs:258 refuses a second claim per serial key;
      Queue::retry is RUNNING-only so it could not serve release; and the PM froze
      a peek-based poll on the false premise that Queue::peek honours not_before.
    target: skill
    severity: degrading
    workaround: >-
      Each was caught by a coder at the ack gate or during implementation and ruled
      on their evidence; the contract was amended six times mid-flight and prime
      overturned the plan's core design (the hold inversion) on u2's source citations.
    suggested_encoding: >-
      wave 0 must emit a FEASIBILITY RECEIPT beside every frozen seam — the installed
      API's type signature and a probe of the real store's behaviour — and must land
      the SYMBOL a signature compiles against, not just its field names.
    disposition: plan
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-09-04T23:55:00Z"
  - id: INS-101
    kind: insight
    description: >-
      The packet's assumption-interrogation instruction paid for the whole pipeline
      in one run. u2 found three defects at seams it did not own — the 300 s claim
      lease double-read, the release race where an unconditional defer(job, 0) would
      revoke a live reader's claim and deliver twice, and the FIFO inversion where an
      older row re-held to a later deadline loses its place. Every one would have
      passed both sides' unit tests and failed only in front of the human.
    target: skill
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-05T00:30:00Z"
  - id: INS-102
    kind: insight
    description: >-
      The live proof's job is not to confirm ACs but to find the unprovable ones.
      AC1 passed and simultaneously exposed a duplicate delivery.released row that
      unit tests could not see, because each declaration site was individually
      correct. AC4 could not be proven at all: the bypass guard checks fields the
      daemon can never populate (rs refuses --command, Msg has no urgent field,
      /v1/send hardcodes command: None), so it shipped unchecked with citations
      rather than ticked on unit evidence.
    target: plan
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-05T02:05:00Z"
  - id: DL-102
    kind: difficulty
    description: >-
      A directed pij message to a working omp seat can be consumed by that seat's
      active tool-subagent instead of its main context. Delivery succeeds, the
      receipt says delivered, the spine agrees, and the intended reader never sees
      it — a silent mis-delivery INSIDE the seat that no daemon-side evidence can
      reveal. Logged independently by u1 and u3; corroborated elsewhere as an omp
      session_switch during a subagent.
    target: project
    severity: blocking
    workaround: >-
      Restate every consequential ruling and commit it to the plan folder, sending
      the PATH, so a seat can recover authority from git rather than from its inbox.
    suggested_encoding: >-
      bind directed delivery to the owning top-level session rather than whichever
      child currently holds the prompt focus.
    disposition: plan
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-05T00:10:00Z"
  - id: DL-103
    kind: difficulty
    description: >-
      `npm install` fails in any fresh worktree: the project .npmrc sets
      min-release-age=7 and npm 11.10 then passes --before to its own child during
      git-dep preparation, which refuses the combination. Neither the CLI flag nor
      the env var reaches that child. The failing dep is the only git dep (minih),
      and because the global pij CLI loads the MAIN checkout's extension, a broken
      main node_modules takes out pij spawn/send/report for every seat in every
      worktree at once.
    target: tooling
    severity: blocking
    workaround: >-
      Temporarily delete the min-release-age line from .npmrc, install, restore it,
      and never commit the lockfile churn; use pij-rs as the peer channel while the
      node CLI is down.
    suggested_encoding: >-
      a bootstrap recipe that owns the cooldown workaround, plus a health check that
      names the missing module instead of an ERR_MODULE_NOT_FOUND stack.
    disposition: plan
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-04T23:21:00Z"
  - id: DL-104
    kind: difficulty
    description: >-
      `harness checks` reports a failing stage by embedding the command tail inside
      one minified JSON line and writes no durable report. Every agent tool surface
      here truncates long lines, so the failing test NAMES are discarded at exactly
      the moment they are needed, forcing a second scoped run just to learn what
      broke.
    target: tooling
    severity: degrading
    workaround: >-
      Re-run the failing sensor with --reporter=json --outputFile, or capture the
      envelope to a file first.
    suggested_encoding: >-
      write a durable gate report path into the envelope rather than returning an
      ephemeral inline tail.
    disposition: plan
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-05T00:15:00Z"
  - id: COORD-101
    kind: coordination
    description: >-
      A wire-format change is a cross-plan event. Plan 135 changed the message frame
      mid-flight; ten of u1's assertions compared the injected string literally and
      all ten moved at once. 135 had ALREADY enumerated every literal it touched for
      its own review, and it occurred to nobody that the same list was advance
      warning for a sibling plan.
    target: skill
    disposition: plan
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-09-05T01:51:00Z"
  - id: WIN-101
    kind: win
    description: >-
      The cross-model reviewer re-derived every claim from the SQL and the live spine
      rather than from the PM's receipts, found two defects in code the PM wrote
      personally (an uncleared counter across lifecycles, and a duplicate arrival
      toast for held messages), refused to accept a CRITICAL it had predicted when
      the source did not support it, and filed a correction AGAINST ITS OWN finding
      after following a promise chain it had first stopped short of — naming it as
      the same scope-limit trap the repo's own AGENTS.md documents.
    target: skill
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-05T02:55:00Z"
  - id: MW-101
    kind: magic-wand
    description: >-
      One shared contract body run over every implementation of a port, enforced at
      review time. defer/release_deferred were pinned by two independent hand-written
      suites and had already drifted — the fake kept sub-second precision while the
      store rounds to whole seconds, so the fake released EARLIER than production
      could and every green test built on sub-second delays was a false negative.
      The fake being more permissive than the store is the worst possible direction.
    target: tooling
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-09-05T02:50:00Z"
---

# Retro — plan 136, typing grace gate

**What shipped.** Pushed messages to omp/pi seats are held while the human has
typed within 60 s and delivered once they stop; Claude/send-keys seats moved
their veto from "a draft exists" to "an edit was observed recently", retiring
plan 134's eight-minute pathology; holds are visible from both ends; and a late
unit made arrival visible immediately on a busy seat, where delivery is instant
but invisible until the step boundary.

**What the run actually taught.** The architecture ruling that mattered was not
in the plan: the original hold shape (claim the row, leave it unacked) could not
satisfy the bypass AC, because the queue refuses a second claim per seat while
one is running. Inverting it — held means *pending and unclaimed* — dissolved
three separate defects instead of working around them, and it was reachable only
because a coder read the SQL and refused the brief.

**The one number worth remembering.** Every ruling of mine that got reversed
today was reversed by someone holding a line number: u1 on the test runner and
the sensor hook, u2 on the queue three times, u3 on the constructor shape, the
reviewer on two defects in my own code. None of them were reversed by argument.
