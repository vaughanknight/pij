# Bootstrap — creating an o-prime from scratch
**Scope**: the day-zero runbook for standing up the o-prime system in ANY repository.
This is the source material for the future "create a new o-prime" skill. Everything
here was done at least once in SecondCrack (run 01) — deviations and gotchas are
inlined where they bit. Companion files: `orient-oprime.md` (lever 0),
`orient-global.md` (lever 1), `orient-local.md` (lever 2 — the only repo-specific
one), `prime-flow.schema.json`, `map.md`, and the per-stream
`government/kickoff-runbook.md`.

## Preconditions

- A git repository; the `harness` CLI on `$PATH` (ambient, like git — no repo
  adoption needed for flows); a pij daemon + tmux for the peer fabric; a human who
  will name the work (the o-prime never invents features).
- One session to take the o-prime seat (spawned by a human or another agent), in a
  tmux window named `o-prime`, registered with pij (`pij phonehome` / `pij adopt`).

## Step 1 — Seat the o-prime

1. Feed it lever 0 (`orient-oprime.md`) + this file, by pointer.
2. Canary it if anything above it will govern it (recursive rule — even the top
   seat's channel gets proven: nonce round-trip, mechanical identity via
   `pij sessions` + pane-footer probe, second send).
3. It runs its boot sequence (lever 0 § boot): channel confirmed, registry hygiene
   (purge its own dead prior descriptors — a stale one wedges delivery globally),
   announce on the human channel.

## Step 2 — Derive the per-repo config (the judgment step — spell it out)

Answer these questions BY INSPECTION of the repo; record answers in the protocol
doc's per-repo block (or the local orient until a protocol doc exists):

| Question | How to answer it | SecondCrack's answer (worked example) |
|---|---|---|
| Cheap quality gate? | Find the fast test/check entrypoint (harness rung, test csproj, npm script) | `harness checks --quick` |
| Full pre-ship gate? | The complete check suite | `harness checks` |
| Exclusive resources (batons)? | What breaks under TWO concurrent users? Build systems with shared lock dirs (obj/bin, node_modules builds); single-instance app/editor windows (verify probe: `pgrep`); shared trunk pushes | ① dotnet build/test ② the Godot/gdUnit window ③ push-to-main |
| Never-stage list? | Generated/local-state paths that must not enter commits (scan gitignore gaps, tool sidecars) | `.fs2/`, `.flow-pair/**`, `scratch/**`, gdunit testadapter, `GdUnitRunner.cfg` |
| Flow-state rule? | Which files only a CLI may mutate, one writer each | `the-flow.json` via `harness flow`, per owning stream |
| Fleet defaults? | Cheapest harness/model that passes the repo's bar + the pairing route | copilot gpt-5.6-sol via `/pij pair` |
| Human status channel? | Where the human reads one-liners | `pij send pij-telegram`, self-identified |
| Ceremony tier? | Cheapest model for add/commit/push | haiku subagents |

## Step 3 — Scaffold the government (all single-writer, o-prime-owned)

Create `<home>/government/` (in SecondCrack: `docs/plans/018-o-prime/government/`;
in production: wherever the deployment homes governance — must be in-repo):

- `spine.md` — header (thesis from the human + Updated stamp from `date -u`, never
  estimated + writer identity), empty roster table, fences sections (per stream,
  added at allocation), allocation ledger (scan existing plan ordinals NOW; record
  next-free), rulings log (seeded with the inception rulings).
- `baton-book.md` — one row per baton from step 2, all free; grant log seeded.
- `briefs/`, `canary-*.md` slots, and (if reporting upward) `reports/`.
- The **prime-flow**: copy `prime-flow.schema.json` (statuses: proposed · deciding ·
  preparing · in_flight · done · folded · dropped · blocked; types: work-item ·
  decision · milestone), then
  `harness flow create prime-flow --slug <project>-portfolio --schema <schema> --path <government>/prime-flow.json --agent o-prime --bare`.
  Gotchas learned live: `--slug` required; add nodes successors-first (no forward
  `next` refs); comments take `--node`; status changes take `--to`; node status is
  the concurrent truth, `nav.now` is just the attention pointer.

## Step 4 — Install the orient levers

- Lever 0 + lever 1 (`orient-oprime.md`, `orient-global.md`): portable — in
  production these come from central storage (out-of-repo schema/template paths are
  supported; only flow instances must be in-repo). Copy verbatim, edit NEVER
  in-repo (improvements go upstream).
- Lever 2 (`orient-local.md`): WRITE FRESH for this repo — what the project is (get
  the product one-liner from the human or the PRD; underselling it cost us a missed
  design pillar), what matters (determinism contracts, doctrine docs, proving
  ladders), the harness surface (discover/prove/capture/encode commands), repo
  mechanics (step 2's table), mandatory orient reads (files that do NOT auto-load:
  PRD, AGENTS.md equivalents), current portfolio context.
- The item-brief template: per work item only — ask verbatim, fences, structure
  tree, prior-art pointers. Everything else lives in the levers; don't restate.

## Step 5 — Open intake

1. Human names work items → prime-flow nodes (status `proposed`/`deciding`), the
   ask recorded verbatim.
2. For each item that graduates to `preparing`: allocate (ordinal + folder + window
   + fences-from-actions, verified on disk; overlap = sequencing decision recorded);
   then spawn or adopt its orchestrator per `government/kickoff-runbook.md`
   (canary → orient stack by pointer → roster → tree-push to all live streams).
3. Hold every assignment provisional until the human preamble (lifecycle:
   adopt → orient → preamble → work). Flip the prime-flow node to `in_flight` when
   the preamble concludes and the stream's preamble checkpoint report lands.

## Step 6 — Steady state (govern)

Verify→relay every report; batons on request (verify-free before grant; reclaim
silent holders only after checking whether their purpose completed — the evidence,
not the silence, decides); route cross-stream asks through the seat; sync the spine
on every event; ledger observations and walk encode candidates up the graduation
path (pane lesson → local orient → global orient/protocol → tooling patch).

## Recovery playbook (all exercised live in run 01)

| Event | Recovery |
|---|---|
| Machine restart / seat death | New session reads lever 0 + inherited government; audits restart drift (dead baton holders — reclaim with evidence; stale roster rows; orphaned descriptors); re-registers with pij (new id is fine — note the identity change in the spine header) |
| Sends queue but never deliver | Suspect a wedged daemon before a broken peer: a stale descriptor of ANY dead pane can head-of-line-block everyone (INC-001). Purge dead descriptors (`pij close <id> --force`), re-verify, report to the pij owner |
| Stream dies mid-work | Its plan folder IS its state — adopt a replacement orchestrator onto the same item (canary → orient stack → it resumes from disk). Proven: two streams resumed post-restart by fresh adoptees with zero handover conversation |
| Stream dissolved by ruling | Stand-down note → `pij close` → verify E-NOID after queue drain (close can be resurrected by queued events — re-run) → strike (not delete) the roster row → tombstone the ordinal → transplant any insights into the absorbing stream's brief |
| Fence gap found mid-flight | Escalation → o-prime verifies independently (grep/read) → grant recorded in spine with constraints → both streams told if a seam moved |

## What "adequate" looks like (the skill's acceptance test)

A fresh session, given ONLY this file + the levers + an empty repo + a human,
stands up a working government and takes its first work item to a briefed,
canaried, preamble-ready orchestrator — without reading any run-01 transcript.
