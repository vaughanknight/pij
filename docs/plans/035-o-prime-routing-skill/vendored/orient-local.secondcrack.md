# Orient — local (lever 2)
**Scope**: THIS REPO (SecondCrack). Injected after the global orient, before your item
brief. This file is the o-prime's live tuning surface — it is edited between (and
during) runs as we learn what orchestrators keep needing; anything that stops being
repo-specific graduates up to the global orient or the protocol.

---

## What this project is

SecondCrack is a **2D underground factory-RTS** (digging, asymmetric factions with
interlocking waste economies, physics-as-gameplay) built on Godot 4 + C# (.NET),
developed scenario-first: a deterministic **sim core** (`godot/godot-app/src/sim/**` —
pure C#, no Godot types) with a Godot **reality layer** (`godot/godot-app/src/world/**`)
on top. **Design pillar: tunability of all aspects** — the PRD mandates every algorithm
be tunable; no hardcoded tuning numbers (gameplay constants live behind governed TOML;
pins pin literals). Two things are being built at once — the game AND the factory that
builds it (the harness, the flows, this orchestration layer).
Fix-the-loop-before-the-mechanic is standing doctrine.

**Mandatory orient reads (they do NOT auto-load in a claude harness)**: at your
orient/preamble stage, actually READ `docs/PRD/premise.md` (the game vision — the
pillars live there, not in summaries of it) and `AGENTS.md` (repo conventions,
including the no-hardcoded-tuning-numbers rule).

## What matters here (the things every fresh session rediscovers expensively)

- **Determinism is a contract.** World gen is golden-SHA pinned; parity tests pin
  sim-vs-reality routes. Changing gen or movement code means the re-pin workflow in
  `docs/how/cave-generation.md` — structural facts first, GoldenSha LAST. Pinned
  tests should pin explicit literal configs, never tunable defaults.
- **Config doctrine (015)**: TOML families under `config/`, loaders with RequireOnly
  unknown-key guards, checker = actually construct the config, one checker core with
  three surfaces (build rung · reload pre-flight · xUnit smoke). Plan 017 is
  generalising this into the config platform — read its dossier before touching
  config anything.
- **The scenario system is how features prove themselves**: author-once-run-twice
  (fast headless sim → real Godot physics). A green-but-vacuous scenario test is a
  known failure mode.
- **`docs/PRD/premise.md`** = game vision; **`docs/PRD/coming-up.md`** = feature
  runway; **`docs/how/`** = per-system operating guides; prior plans live in
  `docs/plans/` and are the first place to look for prior art.

## The harness here (your second objective's home — see global orient)

This repo HAS an engineering harness; use it as the front door, improve it as you go:

- **Discover**: `harness --help` (and `harness boot` to enter a session properly).
  ⚠️ **`harness boot` RUNS THE QUICK GATE (dotnet build/test) — that is baton
  territory**: hold a dotnet grant/window before booting, or skip boot until you do
  (breach precedent: s021, benign, self-reported; a no-dotnet boot mode is a filed
  encode candidate). Use the CLI, don't guess around it.
- **Prove**: `harness checks --quick` (cheap) / `harness checks` (full). Scenario
  proving ladder: `harness scenario prove <id>`. If your work's done-ness has no
  deterministic check, that gap is itself a finding — say so in your plan.
- **Capture**: `harness observe "<what>" --kind <friction|win|magic-wand|…>` the
  moment anything bites. The builder flow already carries the seams (per-phase
  observe chores, drain at phase ends, harvest at ship) — ride them, don't skip them.
- **Encode**: when a lesson is encodable (a new check, a rung, a fixture, a better
  error), propose it in your report's observations[] with a suggested encoding; the
  o-prime aggregates encode-candidates across streams. Fix-the-check-first applies:
  if a checker passed something a reviewer caught, the checker is the bug.
- Run-01 exemplars: the 6m04s→19.5s boot fix (31792e4) was exactly this loop; the
  017 config plan exists because tuning friction (07a6e49) got treated as
  environment work, not routed around.

## Repo mechanics (per-repo config, binding)

- **Gates**: cheap = `harness checks --quick` (or the UnitTests csproj directly);
  full pre-ship = `harness checks`. Flow state mutates ONLY via `harness flow`.
- **Batons (exclusive, one holder repo-wide)**: ① dotnet build/test ② the Godot/gdUnit
  window (`pgrep -fl "[G]odot"` verifies) ③ push to main. Request from the o-prime.
- **Never stage**: `.fs2/`, `.flow-pair/**`, `scratch/**`,
  `godot/godot-app/SecondCrack.Tests/gdunit4_testadapter_v5/`,
  `godot/godot-app/addons/gdUnit4/GdUnitRunner.cfg`. (`.uid` sidecars ARE committed —
  and are implicitly part of any fence containing their file.)
- **Fleet defaults**: coder + cold reviewer, copilot harness, gpt-5.6-sol, via
  `/pij pair`. Ceremony (add/commit/push) via haiku subagents.
- **Human status channel**: `pij send pij-telegram "agent: <id> <role> — …"`.

## Current portfolio context (update as the prime-flow moves)

- Outer flow: `docs/plans/018-o-prime/map/prime-flow.json` (o-prime's; read-only to you).
- wi-017 config platform: plan produced, suspended at restart — the config seam most
  work will eventually plug into.
- wi-020 destructible terrain: preamble done, suspended; contention seams with 017
  (SimHost.cs, src/world/**) are pre-mapped in the government spine.
- Known live hazards: pane step-on during active turns (state survives; re-read your
  disk artifacts), pij effort/model drift at spawn (canary catches it).
