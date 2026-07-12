# Phase 3 External Adopt Guard — Cold Review

## Verdict

**FIX_REQUIRED**

This verdict supersedes the earlier approval. Jordan's blind run proved that
the vocabulary hard ban does not control the actual external identity path.

## Findings

### F-001 — External adopt still trusts `whoami` before pull registration

**Severity: CRITICAL**

`skills/pij/references/routes/peer.md:14-19` lists `pij whoami --json` before
`pij inbox register`, while `skills/pij/references/00-routing.md:16` still uses
`whoami` as the self-registration probe. In the blind run with no
`TMUX_PANE`, the agent followed that ordering, accepted
`pij-grieving-gibbon`, and reported itself adopted without ever registering
pull ownership.

Evidence:

- Screenshot:
  `/Users/jordanknight/pi-hacking/pij/scratch/paste/20260712T215356.png`.
- The captured command printed an empty `TMUX_PANE` and then ran
  `pij whoami --json`.
- The matching descriptor had `paneId:"%0"` and no `deliveryMode`.
- `.pi/extensions/pij/core/current-session.ts:65-97` accepts the durable
  ambient identity without validating that an external caller's descriptor is
  paneless and explicitly pull-owned.
- The agent then used `pij tail` and a manual send/ack path instead of
  `pij inbox --wait`.

**Required fix:** after detecting empty/absent `TMUX_PANE`, external adopt
intent must run `pij inbox register --json` as its first identity action,
before `whoami`, `list`, `state`, `tail`, or any pane-related inference.
Outside tmux, `whoami` must reject an existing paned or non-pull descriptor
with an actionable instruction to run inbox registration.

### F-002 — `pij inbox register` preserves the corrupted push attachment

**Severity: CRITICAL**

Calling the documented redirect is not currently sufficient.
`.pi/extensions/pij/core/current-session.ts:130-153` treats any existing
`paneId` as authoritative, preserves the old pane/runtime attachment, and
leaves an absent `deliveryMode` absent. The current regression at
`.pi/extensions/pij/core/current-session.test.ts:89-133` explicitly requires
that behavior.

Therefore the blind run's descriptor would remain `paneId:"%0"` and
non-pull even if the agent had subsequently run `pij inbox register`.

**Required fix:** ambient external registration must repair a matching durable
identity by clearing stale pane/push attachment fields and setting
`deliveryMode:"pull"` while preserving durable identity/history metadata.
Repeat registration must remain idempotent.

### F-003 — The named test is vocabulary-level and misses the failing branch

**Severity: HIGH**

`.pi/extensions/pij/cli.integration.test.ts:192-226` asserts ordered headings,
table text, exact phrases, and negative wording. It does not execute the
external adopt decision against an already registered paned/non-pull
descriptor. The test and all gates stayed green while the machine-wide blind
run violated the contract.

**Required regression:**

1. Seed an ambient native identity whose durable descriptor has a pane and
   missing/non-pull delivery mode.
2. Prove external `whoami` rejects that attachment and points to
   `pij inbox register`.
3. Prove registration clears the pane attachment, sets pull delivery, and
   preserves the durable pij id/history.
4. Prove the external adopt guidance makes registration the first identity
   action and does not use `whoami`, pane discovery, `tail`, or manual
   acknowledgement as substitutes.
5. Mutate that first-action/repair behavior and require the regression to go
   RED, then restore byte-identically to GREEN.

## Prior Dimension 0 and Gates

The prior mutation removed the no-pane command-ban sentence and correctly made
the named test fail, restoring to SHA-256
`0e47700933e57b34792c26101aaf2e7d93aabfeab222e630b539fb7c987dbfb2`.
Focused test, skill check, typecheck, lint, `harness checks --quick`, package
scope audit, and `git diff --check` all passed. Those results prove the text is
present and structurally valid; they do not prove the newly exposed identity
and descriptor-repair behavior.
