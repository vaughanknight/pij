# Plan 042 implementation amendments

These amendments are live dogfood findings discovered after the validated plan
froze. They extend `dlg-0001` without rewriting its original packet. The coder
must read this file before resuming; the reviewer treats it as authoritative.

## A-001 — Silent worker recovery

**Observed**: the coder became idle for 45+ minutes mid-packet with an empty
composer and no completion report. Push-not-poll had no worker-silence signal;
the o-prime detected it manually. Jordan then confirmed an intermittent Copilot
API outage: workers can stop after exhausted retries and cannot self-report.

**Required contract**:

- The orchestrator normally relies on daemon pushes and does not poll.
- Worker silence is classified **outage-first**, never misconduct-first.
- If a delegated worker is quiet beyond a bounded local cadence (s042 proved a
  15-minute cadence) and there is no
  completion, blocked, stalled, or dead push, perform one liveness check.
- If the worker is idle with no report, send one status request requiring
  `COMPLETE`, `CONTINUING`, or `BLOCKED`.
- Any new message is a recovery poke for a stalled-but-alive seat; poke before
  considering redispatch.
- Redispatch only when liveness checks and recovery pokes fail.
- A `CONTINUING` report names current work, files, gates, remaining work, and
  the next reporting point.
- Repeated short-interval polling remains forbidden.

**Implementation home**: `skills/pij/references/prime/orchestrator.md`, with a
structural marker in `pij-skill-check.sh`.

## A-002 — Allowed-path alert and known vet-stamp noise

**Observed**: the worktree changed `.pi/packages.yaml` outside the packet
allowlist. The diff contained only `vetted.date` refreshes caused by the
boot/package-audit path; the coder did not author package content.

**Required contract**:

- Any path outside the packet allowlist triggers an immediate stop and
  classification before review.
- Known benign class: timestamp-only `.pi/packages.yaml` `vetted.date` churn
  after pi/harness/package-audit boot in a worktree.
- Benign handling: prove the diff is date-only, restore the file byte-identical
  to branch HEAD, record the cause, then resume.
- Any source, package, enablement, install command, score, override, or other
  content change is NOT benign and remains a scope breach.
- The alert is still valuable when the cause is benign; fast classification is
  part of the doctrine.

**Implementation home**: `skills/pij/references/prime/orchestrator.md`, with
structural marker coverage in `pij-skill-check.sh`.

## Amendment acceptance

- Both contracts appear in the role module without expanding it beyond the
  agreed line budget.
- Structural checks fail if outage-first silence recovery, poke-before-
  redispatch, or
  timestamp-only vet-noise classification is removed.
- Review confirms that the wording does not weaken pointer delivery,
  push-not-poll, or the package hand-edit ban.
