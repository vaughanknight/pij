# s050 forkability experiment protocol
**Stream**: s050 focus-agents · **Seat**: pij-bored-pelican · **Status**: designed, pi-first
**Safety**: `.harness/temp/s050/spawn-safety.md` governs every spawn (3-gate canary; issues #19/#20).

## Approach doctrine — three tiers, cheapest first

1. **Desk research (no spawns).** Each harness's own surface tells us most of the story
   before any tmux session exists: `<cli> --help` flag greps, `~/.<harness>/` state layout,
   and — highest-value — the **pij daemon source** (`.pi/extensions/pij/`), which already
   solved per-harness session-identity discovery to bind peers (claude `--session-id`,
   copilot `--session-id` + events.jsonl, codex rollout trailing-UUID). Read-only, free.
2. **Scripted live probes (tmux, disposable peers).** Prove fork semantics empirically —
   flags are accepted silently and docs lie (§C2 lesson). One peer per harness, the
   9-step ritual below, evidence captured to disk at each step.
3. **Interactive navigation** — only to fill gaps steps 1–2 can't answer (e.g. an
   undocumented picker UI). Never the method, always the fallback.

Perplexity: only where local source + probes are insufficient (per brief), e.g. copilot/codex
resume semantics not discoverable locally.

## Desk findings already banked (2026-07-14)

| Harness | Mechanism (desk-level) | Confidence |
|---|---|---|
| pi | **Native `--fork <path|id>`** ("fork session file into a new session"); `--session-id <id>` (create-if-missing), `--session <path|id>`, `--session-dir <dir>`, `--no-session`, `-n <name>`. Sessions = `~/.pi/agent/sessions/<cwd-encoded>/session.jsonl` (plain jsonl, per-cwd dirs) | High — needs live proof only |
| claude | `--resume <old> --fork-session --session-id <new>` pins forked id deterministically (prior verified fact) | High — needs re-proof on current CLI |
| copilot | `--session-id` = deterministic bind; **unknown**: resume/fork of a copied events.jsonl | Low — desk + perplexity + probe |
| codex | rollout files date-nested, bind id = trailing UUID, **lazy write** (snapshot-timing risk); resume/fork semantics unknown | Low — desk + perplexity + probe |

## The 9-step ritual (per harness)

Evidence dir: `.harness/temp/s050/snapshots/<harness>/` · all sends via pij; peer is a
disposable spawn that passed the 3-gate canary (spawnedBy · pid/pane/spawnId unique · model/no-400).

| # | Step | Pass evidence |
|---|---|---|
| 1 | **Locate** — confirm live session file/id for the spawned peer (desk map → actual path) | path + id recorded |
| 2 | **Plant** — send golden context: unique token `GOLDEN-s050-<harness>-<suffix>` + a 3-part structured fact it must later recall | peer confirms receipt |
| 3 | **Settle & flush** — wait idle (`pij state`); verify session file mtime/size advanced past the plant (codex lazy-write check) | mtime > plant time |
| 4 | **Snapshot** — copy session state to evidence dir; record SHA-256 | hash recorded |
| 5 | **Fork** — boot a NEW session from the copy with a new id (pi: `--fork`; claude: `--resume --fork-session --session-id`; others: per desk findings) | new session boots |
| 6 | **Recall canary** — ask the fork for the token + fact, cold ("What is the golden token and the three facts?") | verbatim recall |
| 7 | **Immutability** — re-hash the snapshot after the fork has run | hash unchanged |
| 8 | **Isolation** — second fork from the same snapshot; teach it a *different* fact; confirm fork-1 and snapshot unaffected | no cross-pollution |
| 9 | **Source-liveness** — original peer still responsive and unpolluted by either fork | original recalls only its own history |

Also recorded per harness: **secret boundary** (does the session file embed tokens/keys? →
what `focus save` must strip or protect), **lifecycle prereqs** (dirs/registries a relaunch
needs), and the **relaunch canary** a future `pij focus launch` must run before delivering work.

## Verdict rubric

- **FORKABLE** — steps 5–9 all pass: true immutable-snapshot + independent-fork semantics.
- **RESUME-ONLY** — restore works but mutates/claims the source (no isolation).
- **NOT-RESTORABLE** — no mechanism restores native context; focus agents would need a
  degraded mode (transcript replay / summary hand-off) for this harness.

## Order & scope

pi (source-owned, native flag — today) → claude (known-good, quick re-proof) → copilot →
codex. One harness fully evidenced before the next starts. Findings land in
`docs/plans/050-focus-agents/experiments/<harness>-findings.md`; the roll-up report is the
phase deliverable, then **STOP for human direction** (Seq 216 boundary).
