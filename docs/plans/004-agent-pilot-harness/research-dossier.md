# Research Dossier: Agent Pilot Harness

**Generated**: 2026-05-10
**Research Query**: "Upgrade pij so minih agents can pilot `pi` inside tmux to validate extensions end-to-end. Tmux must be first-class in the harness so agents don't reinvent the wheel. Goal: spawn agents that drive scratch (and future extensions) through real slash commands, capture pane output, decide pass/fail, and report magic-wand wishes for the next harness improvement."
**Mode**: Research — feeds `/plan-1b-specify` for plan 004
**FlowSpace**: pi-mono graph available — used for render-surface findings; pij has no scan.
**Subagents**: 6 in parallel (current state, tmux primitives, pi render surface, minih integration, prior learnings, external patterns)
**Total findings**: 56 (IA×10, TC×12, PR×10, MA×8, PL×12, EX×10, plus 4 cross-cutting)

---

## Executive Summary

### What we're building

A pij-owned **Driver SDK** (`harness/driver/`) that wraps tmux as first-class capability and a pair of **minih agent slugs** (`extension-validator`, `extension-validator-companion`) that consume it. Together they let an autonomous agent boot `pi`, type slash commands, observe rendered output, decide pass/fail, and report magic-wand wishes back into the difficulty ledger. This is **extension #2** in the velocity log — the second real-extension data point that AC-15's compounding hypothesis needs.

### Why it matters

> "The harness is the product." Today, `npm run smoke` lives inside the harness as one monolithic script — the user must run it; an agent cannot. The tmux API surface is rediscovered (badly) every time anyone wants to pilot pi. By turning that surface into a typed, tested module, **every future agent inherits the work** and the velocity loop closes: agent runs → finds friction → human encodes fix → next agent run is faster.

### Three load-bearing insights

1. **Tmux is the right substrate, not a constraint.** The honest alternative (node-pty headless, EX-01) deletes the human-debug affordance — humans currently `tmux attach -t pij-smoke` to watch a flaky run. Keep tmux, fix the brittleness (TC-01..TC-12). Node-pty becomes a future L3 option for CI smoke (D-008 stretch), not a v1 replacement.
2. **Pi has no "ready" sigil — but readiness is detectable.** Output-stable polling + prompt-line regex (`/^>\s/`) + spinner-glyph absence gives a reliable composite signal (PR-07). This retires fixed `sleep(1500)` (D-014) without instrumenting pi.
3. **D-006 is essentially closed by source-read.** `setStatus(key, "")` stores the empty string and renders an empty pill; only `undefined` clears it (PR-04, pi-mono source). The scratch extension currently calls `setStatus("scratch", "")` — that's a bug, not just open evidence. Fold the fix into this plan.

### Quick stats

| Metric | Value |
|--------|-------|
| Open difficulties this plan resolves | D-005 (verifies via pilot smoke), D-006 (already resolved by PR-04 — encode fix), D-008 (partial — SDK-driven layer), D-014 (fully — execFileSync + bounded retry) |
| New difficulties surfaced by research | 0 (D-006 fix is encoded already in this dossier) |
| Recommended phase count | Single-phase Simple Mode (CS-2 to CS-3) — driver SDK + scratch validator pilot |
| Distribution channel | minih pack registry — same shape as `code-review-companion` already in `agents/` |
| Tmux is keepable as substrate | Yes — confirmed by external survey + minih pattern alignment |

---

## The Vision (User's Words, Distilled)

- We operate **exclusively in tmux**.
- minih agents should be able to **drive pi** in tmux: send keystrokes, capture output, validate behavior.
- This must be **first-class in the harness**, not "agents figure it out."
- Workflow: build the SDK → spawn validator agents → agents try to validate scratch → read their **magic-wand wishes** → iterate harness recipes → repeat.
- End state: every future extension ships with a validator agent that runs human-free, with humans reviewing **only the wishes and final verdict**.

This is the harness-is-the-product loop made literal: every wish becomes either an SDK helper, a template change, a lint rule, or a docs fix.

---

## How Today's Harness Works

`harness/scripts/smoke.ts` (~110 LOC) is the only existing tmux automation. It is brittle in ten specific ways (Subagent 1 findings IA-01..IA-10):

| # | Brittleness | File:line | Fix direction |
|---|-------------|-----------|---------------|
| IA-01 | `["tmux", ...args].join(" ")` shell interpolation | smoke.ts:28 | `execFileSync("tmux", args)` (D-014 fix) |
| IA-02 | Fixed `sleep(delay ?? 1500)` + single `capture-pane` | smoke.ts:46 | Output-stable polling (TC-05, PR-07) |
| IA-03 | `SmokeStep { send, expect, delay }` is implicit, untyped | smoke.ts:12 | Driver-SDK `Step` discriminated union |
| IA-04 | Session lifecycle hardcoded inside `runScenario()` | smoke.ts:40 | `Session { boot, sendKeys, waitFor, capture, kill }` class |
| IA-05 | No scrollback (`-S -N`), no status-line capture | smoke.ts:51 | `capture(opts: { scrollback, join, ansi })` |
| IA-06 | No driver-op recorder; only `makeRecorder` for store tests | test-utils.ts | Optional asciinema cast / log writer (TC-06, EX-05) |
| IA-07 | Fixed `bootSeconds`; conflates "pi started" with "pi ready" | smoke.ts:43 | `boot({ readySignal, readyTimeout })` (PR-07) |
| IA-08 | On failure: 800-char tail + immediate kill — context lost | smoke.ts:53 | Structured `AssertionError { step, expected, actual, context }` |
| IA-09 | Tight coupling to `.pi/extensions/*/smoke.ts` filesystem layout | smoke.ts:66 | `Scenario.load(path)` validator |
| IA-10 | No exported module — minih agents can't import the driver | n/a | New `harness/driver/` module + npm export |

The current `smoke.ts` is **not wrong** — it is the right L0 throwaway that proved tmux+regex works. The plan's job is to extract its lessons into a typed SDK and make it the **adapter**, not the kernel.

---

## Tmux Capability Inventory (Subagent 2)

Twelve tmux primitives form the SDK foundation. Highlights:

### Core API surface

```typescript
// harness/driver/tmux.ts (recommended)
export type Target = { session: string; window?: number; pane?: number };
export type Key = "Enter" | "C-c" | "C-d" | "Escape" | "Tab" | "Up" | "Down"
                | "Left" | "Right" | "BSpace" | `F${1|2|3|4|5|6|7|8|9|10|11|12}`;

export function boot(opts: { session: string; cwd: string; cmd: string;
                             cols?: number; rows?: number;
                             env?: Record<string, string> }): Target;
export function teardown(t: Target): void;
export function inspect(t: Target): { paneId: string; pid: number; cmd: string; dead: boolean };

export function type(t: Target, text: string): void;          // send-keys -l (literal)
export function press(t: Target, key: Key, n?: number): void; // send-keys <Key>
export function paste(t: Target, data: string,
                      opts?: { bracketed?: boolean }): void;  // set-buffer + paste-buffer

export function capture(t: Target,
                        opts?: { scrollback?: number; join?: boolean; ansi?: boolean }): string;
export function waitIdle(t: Target,
                         opts?: { promptRe?: RegExp; quietMs?: number; timeoutMs?: number }): Promise<string>;
export function record(t: Target, path: string): { stop: () => void };

export function run(t: Target, input: string, expect: RegExp,
                    opts?: { timeoutMs?: number }): Promise<{ ok: boolean; pane: string }>;
```

### Why each method matters (compressed)

| ID | Method | Tmux command | Why |
|----|--------|--------------|-----|
| TC-01 | every method | `execFileSync("tmux", args[])` | Kills shell-injection (D-014) |
| TC-02 | `type` / `press` | `send-keys -l <text>` vs `send-keys <Key>` | Mixed mode is the #1 source of "Enterfoo" bugs |
| TC-03 | `paste` | `set-buffer` + `paste-buffer -p` | Multi-line / risky payloads bypass quoting |
| TC-04 | `capture` | `capture-pane -p -J -S -<N>` | `-J` joins wrapped lines; `-S` pulls scrollback |
| TC-05 | `waitIdle` | poll `capture-pane` until two byte-equal | Output-stable readiness — retires `sleep()` |
| TC-06 | `record` | `pipe-pane -O 'cat >> log'` | Full transcripts without asciinema dep |
| TC-07 | future | `tmux -CC attach` | Event-driven streaming — defer to L3 |
| TC-08 | every method | `-t session:window.pane` | Explicit targeting, cache `pane_id %N` after boot |
| TC-09 | `boot` | `has-session ; kill-session ; new-session -d -s s -x 200 -y 50` | Wider geometry avoids pi banner wrap |
| TC-10 | — | `wait-for` | **Don't use** — it's a tmux↔tmux semaphore, wrong tool |
| TC-11 | `inspect` | `list-panes -F '#{pane_pid} #{pane_dead}'` | Detects pi crash before sending to a corpse |
| TC-12 | `run` | composes 02 + 04 + 05 | The high-level "type-then-confirm" atomic primitive |

### Argument-array rule (load-bearing)

```typescript
// ❌ today's smoke.ts
execSync(["tmux", ...args].join(" "), { encoding: "utf8" });

// ✅ driver SDK
execFileSync("tmux", args, { encoding: "utf8" });
```

This single change closes D-014 entirely.

---

## Pi Render Surface (Subagent 3 — pi-mono source-read)

What `tmux capture-pane` actually shows when pi is running. Sources cited as `pi-mono:<path>:<line>`.

| ID | What | Pattern an agent should use | Confidence |
|----|------|----------------------------|------------|
| PR-01 | Input prompt is `> ` + cursor | `/^>\s/` on bottom non-empty line ⇒ idle | high |
| PR-02 | Footer = pwd line + stats line + optional status pills line | Anchor on context-percent token `/\d+(\.\d+)?%\//` | high |
| PR-03 | Status pills sorted alphabetically, joined with single space | `/(?:^\|\s)scratch:\s*(\d+)\s+notes?(?:\s\|$)/` | high |
| **PR-04** | **`setStatus(key, "")` does NOT clear — only `undefined` does** | **Pass `undefined` to clear; assert *absence* of `/scratch:/` to detect cleared** | **high** |
| PR-05 | `notify()` writes to chat scrollback (NOT ephemeral toast) | Match message body directly; severity prefix `/^Warning:\s/` or `/^Error:\s/` | high |
| PR-06 | Successive `info` notifies collapse into one line | Re-read pane after delay; don't expect stacked info messages | medium |
| PR-07 | **No "ready" sigil** — readiness is composite | Two byte-equal captures + prompt regex + no spinner glyph in last 3 lines | medium |
| PR-08 | No "command done" marker | Every pij command should `notify` or delta `setStatus` | high |
| PR-09 | `/compact` runs ~30s with only spinner | Replace 30s sleep with output-stable poll, 60s ceiling | medium |
| PR-10 | `capture-pane` only shows rendered output — not customType state | Validate state through pi commands (`/scratch list`), not direct inspection | high |

### PR-04 is a gift

D-006 in the difficulty ledger says "open (evidence pending — observe footer when scratch is empty)." Subagent 3 read the pi-mono source directly:

> **`pi-mono:packages/coding-agent/src/core/footer-data-provider.ts:132-138`** — only `text === undefined` calls `delete`; `""` goes through `extensionStatuses.set(key, "")`.

Translation: scratch's current `setStatus("scratch", "")` (`.pi/extensions/scratch/index.ts:98`) leaves an empty string in the map. The pill key is gone visually because empty strings render as nothing in the join, but the *behavior is wrong*. **Fix**: change scratch to `setStatus("scratch", undefined)` and update D-006 to `encoded`.

This is **the kind of finding the harness loop is supposed to surface** — and it surfaced during research, before the validator agent even ran. Encode it in this plan as a tiny extra task.

### Default `waitForReady()` strategy

Poll `capture-pane -p -S -50` every 250 ms; declare ready when **all three** hold across two consecutive captures:
1. Captures are byte-identical (output-stable).
2. Last non-empty line matches `/^>\s/` and contains no Braille spinner glyph from `[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]`.
3. Footer line still matches context-percent token `/\d+(\.\d+)?%\//`.

Cap timeout at step-configurable ceiling (default 5 s for normal commands, 60 s for `/compact`/`/reload`). On timeout, surface last 800 bytes with a labeled error.

---

## Minih Integration (Subagent 4)

### The five things that matter

| ID | Finding | Implication |
|----|---------|-------------|
| MA-01 | Agents are folders under `agents/<slug>/` with `prompt.md` + schemas | New slug lives at `agents/extension-validator/` — same shape as `code-review-companion/` |
| MA-02 | Minih provides **no tmux primitives** — agents shell out | The pij Driver SDK is the canonical layer; agents `tsx` into it, never `tmux` directly |
| MA-03 | One-shot vs companion are different lifecycles | Ship **two slugs**: `extension-validator` (one-shot, runs N times per release), `extension-validator-companion` (long-running, mirrors `code-review-companion`) |
| MA-04 | Magic-wand wishes flow via `retrospective.magicWand` + auto-harvest, not inbox | Wishes land in `docs/retros/<slug>.md` automatically; difficulties surface via `minih difficulties --agent extension-validator` |
| MA-05 | Inbox grammar is fixed (`briefing` / `task` / `finding` / `summary` / `control`) | Reuse existing protocol verbatim — no new message types |
| MA-06 | `peer.verdict` (`deaf` / `silent` / `dead`) catches protocol drift | Wrap `minih outside inbox send` in driver SDK to surface verdict immediately |
| MA-07 | pij already installs minih agents as packs | Same channel ships ext-validator; distribution is solved |
| MA-08 | `input-schema.json` validates `--param` before agent boots | Validator schema = SDK signature 1:1 — no translation layer |

### Recommended ext-validator shape (sketch)

```yaml
# agents/extension-validator/prompt.md
---
description: "Drive pi in tmux, run extension scenarios, report pass/fail + wishes."
permissions: trusted
timeout: 600
coordination: optional   # one-shot by default
---

1. Read input params: extensionName, scenarios[], piBinary?, tmuxSession?
2. For each scenario: invoke pij Driver SDK
     `npx tsx harness/driver/run.ts --extension $NAME --scenario $JSON`
   (SDK owns tmux + pi readiness + bounded retry + structured errors)
3. Collect { scenario, status, capturedPane, durationMs, errors[] }
4. Write report.json: {
     extension, results[],
     summary: { passed, failed, durationMs },
     retrospective: {
       magicWand: <one specific wish>,
       magicWandTarget: "project",
       difficulties: [<MH-NNN if any>]
     }
   }
5. minih check --file $MINIH_OUTPUT_PATH; exit
```

The agent **never touches tmux directly**. Every "I wish the driver had X" wish becomes a feature request against `harness/driver/`.

---

## Prior Learnings (Subagent 5)

### What this plan inherits

| ID | What | Status | Action |
|----|------|--------|--------|
| **PL-01** | Companion finding pipeline is live (`finding` msgs, `ackOf`, farewell envelope) | encoded | Reuse verbatim for ext-validator; document envelope schema in `docs/how/agent-feedback.md` |
| PL-02 | Difficulty ledger has open / mitigated / encoded statuses + curator gate | encoded | Add `source` column so the ledger shows agent provenance |
| PL-03 | Smoke is local-only; CI runs typecheck/lint/test only (D-008) | open | Validator runs locally for v1; CI variant deferred to D-008 stretch (node-pty path) |
| PL-04 | D-013 (fresh-clone smoke failure) caught by companion; pattern works | encoded | Use D-013 as worked example: agent → finding → encoded fix |
| **PL-05** | D-014 (smoke shell-quoting) is open, deferred to D-008 stretch | open | **This plan's first deliverable** kills it via TC-01 (`execFileSync`) |
| PL-06 | Companion findings → indexed F-NNN; farewell envelope captures retrospective | encoded | Validator uses same envelope; categorize wishes (template / lint / helper / script) |
| PL-07 | Workshops authoritative; companion catches template drift (D-011, D-016, D-018) | encoded | P1–P10 violation checklist becomes part of validator's auto-checks |
| PL-08 | Three plans exist; scratch is ext #1; AC-15 ratio defers to ext #3 | open | This plan IS ext #2 — produces the second velocity data point |
| PL-09 | D-017 minih state enum gap; companion uses inbox to compensate | open (upstream) | Validator doesn't need custom states — inbox is sufficient |
| PL-10 | Pipeline is A→B→C: agent reports → human reviews → encoded fix | encoded | Formalize the curator gate (SLA: findings → decision in N days) |
| PL-11 | Open difficulties: D-005, D-006, D-007, D-008, D-014, D-017 | mixed | Pilot validator addresses D-005 + D-006 evidence; D-014 fully via SDK |
| **PL-12** | Magic-wand loop: farewell + retrospective parsing + curator gate | partial | Build parsing layer: farewell → categorize → top-3 wishes surfaced to curator |

### Difficulties this plan addresses

- **D-005** (high, evidence pending) — `customType` survives `/compact`? Validator pilot will exercise this scenario unattended; either confirms (encoded) or falsifies (T008 snapshot fallback ships).
- **D-006** (low, evidence pending) — `setStatus(key, "")` behavior. **Already resolved by PR-04 source read** — encode in scratch's `index.ts` and update ledger to `encoded`.
- **D-008** (medium, open) — SDK-driven smoke as alternative to tmux. This plan does NOT replace tmux but **does** provide the SDK seam (`harness/driver/run.ts`) where node-pty could later slot in.
- **D-014** (medium, open) — shell-quoting + bounded retry. **Fully resolved** by TC-01 (argv) + TC-05 (output-stable polling). After this plan: status `encoded`.

### Magic-wand loop — final architecture

```
Validator agent runs
   ↓
Inline `finding` messages (real-time, ackOf: <task.id>, severity HIGH/MEDIUM/LOW)
   ↓
At control:stop → farewell envelope to $MINIH_OUTPUT_PATH:
   {
     summary: { extension, passed, failed, durationMs },
     retrospective: {
       magicWand: "specific wish, e.g., 'add Driver.assertStatusPill(key, regex)'",
       magicWandTarget: "project",
       difficulties: [{ id: "MH-001", category: "tmux", severity: "MEDIUM", ... }]
     }
   }
   ↓
minih auto-harvest → docs/retros/extension-validator.md
   ↓
Human curator reviews wishes (SLA: 24h)
   ↓
High-confidence wishes → new D-NNN row OR direct harness recipe edit
   ↓
Next validator run is faster (the wish is now an SDK method)
```

---

## External Patterns (Subagent 6)

### Adopt now (this plan)

| Pattern | What | Source |
|---------|------|--------|
| `execFileSync` + bounded retry | One-day fix that closes injection + magic-sleep flake | EX-08; Node stdlib |
| Pexpect-style helper on top of tmux capture | ~80 LOC `expect(pattern, timeout)` against pane text | EX-03 (idea, not the dep) |
| Asciinema cast as side artifact | Append-mode `pipe-pane` log per validator run | EX-05 |

### Defer (later phases / future plans)

| Pattern | When | Why |
|---------|------|-----|
| node-pty direct (no tmux) | v0.4+ | Tension with user vision ("we operate exclusively in tmux"); revisit if D-008 forces CI smoke |
| GH Actions headless smoke | After node-pty path | EX-07 confirms it works on `ubuntu-latest` |
| tmux control mode `-CC` | L3+ | Event-driven stream is cleaner but nobody has a Node parser; pi-mono doesn't need it |
| xterm-headless grid assertions | L3+ | Overkill for L2 prompt-loop validation |
| Adaptive Claude-Code-style subagent loop | After validator v1 stabilizes | Aligns with minih philosophy; needs agent maturity |

### Reject

| Pattern | Why |
|---------|-----|
| "Playwright for terminals" | Does not exist in 2026 — stop hunting |
| `ht` Rust headless wrapper | Duplicates xterm-headless w/ extra toolchain |

### Tension to flag

Subagent 6 strongly recommends node-pty as the v0.3 driver. The user's framing is "we operate exclusively in tmux." These are reconcilable:

- **v1 (this plan)**: tmux IS the substrate. The Driver SDK wraps tmux primitives. Humans can `tmux attach -t pij-validate-scratch` and watch.
- **v2 (future, only if needed)**: a `Driver.headless()` mode swaps the tmux backend for node-pty when CI demands it. Same surface. Same agent code. Different transport.

The SDK's job is to make this swap possible without callers caring.

---

## Cross-cutting discoveries

### CC-01: The validator IS extension #2 in the velocity log

`docs/velocity.md` row 6 is scratch (ext #1). AC-15's compounding hypothesis is explicitly **deferred to extension #3 retrospective** because ratios need ≥2 data points. This plan produces the second data point: time from "spec accepted" to "validator agent reports first green run on scratch." Velocity table row 7.

### CC-02: D-006 closes during research, not during implementation

Subagent 3 read pi-mono and found the answer: `setStatus(key, "")` does NOT clear; only `undefined` does. The scratch extension has the bug. This plan should land:
- Fix in `.pi/extensions/scratch/index.ts:98` (`""` → `undefined`)
- Comment citing pi-mono path
- Difficulty ledger update: D-006 status → `encoded`

This is a one-line edit that should be folded into the plan as T-A or T-B (low ceremony).

### CC-03: The driver SDK is small — ~300 LOC, single TS file plausibly

Twelve methods (TC-01..TC-12). Most are 5–15 LOC wrappers around `execFileSync("tmux", args)`. The complexity is in `waitIdle()` (output-stable polling) and `run()` (the high-level type-then-confirm composition). Total target: under 400 LOC, fully typed, structurally tested via existing `makeRecorder` patterns.

### CC-04: One agent, two slugs

Don't conflate `extension-validator` (one-shot) with `extension-validator-companion` (Power-On-Mode). Different lifecycles, different prompts, different schemas. Build the one-shot first; companion is a follow-on if it earns its keep during scratch piloting.

---

## Recommended SDK module layout

```
harness/
  driver/
    index.ts         # public exports: Driver, Session, Scenario, Step, Target
    tmux.ts          # primitives: type, press, paste, capture, boot, teardown, inspect
    session.ts       # Session class: lifecycle + waitIdle + run composition
    scenario.ts      # Scenario.load(path) with shape validation
    record.ts        # asciinema-cast or simple log writer
    errors.ts        # AssertionError with structured context
  driver.test.ts     # vitest using execFileSync mocks (real tmux not required)
  scripts/
    smoke.ts         # NOW: thin adapter calling driver.runScenario(scenario)
agents/
  extension-validator/
    agent.json
    prompt.md
    instructions.md
    input-schema.json
    output-schema.json
docs/
  how/
    agent-feedback.md  # NEW: farewell envelope schema + curator gate
```

Existing `harness/scripts/smoke.ts` becomes a 30-line adapter. Existing `harness/test-utils.ts` stays for store testing. The driver introduces zero new runtime deps (uses Node stdlib + existing tsx).

---

## Workshop Opportunities

| # | Topic | Type | Why workshop |
|---|-------|------|--------------|
| 1 | Driver SDK API surface (`Driver`, `Session`, `Scenario`, `Step` types) | API Contract | Locks the public shape before agents consume it; small, paste-ready code matters more than prose |
| 2 | Validator agent prompt + schemas (`extension-validator` slug) | CLI Flow | Concrete prompt, input-schema, output-schema, output examples — paste-ready for `agents/extension-validator/` |
| 3 | Magic-wand farewell envelope + curator gate | Integration Pattern | Defines `docs/how/agent-feedback.md`: schema, SLA, mapping farewell → D-NNN |

Workshops 1 + 2 are **highly recommended** — same pattern as workshop 003 made scratch trivial to ship. Workshop 3 is optional; the loop can be inferred from minih conventions.

---

## Recommended next steps

1. **Optional but recommended**: Run `/plan-2c-workshop --plan 004-agent-pilot-harness "Driver SDK API surface"` to produce paste-ready code for `harness/driver/`.
2. Run `/plan-1b-specify --simple` (Simple Mode is right — single phase, code is small, design is largely settled in this dossier).
3. During plan-3, treat workshops as authoritative (same as workshop 003 → scratch).
4. The implementation phase will likely be six tasks: (a) driver/tmux.ts, (b) driver/session.ts + scenario.ts, (c) driver tests, (d) refactor smoke.ts as adapter, (e) ext-validator agent pack + schemas, (f) D-006 fix in scratch + ledger update. Plus the validator pilot run as the load-bearing acceptance step.

---

## External Research Opportunities

**None.** The 6 subagents covered tmux primitives, pi rendering, minih integration, and external patterns thoroughly. Subagent 3's pi-mono source read closed PR-04/D-006 directly. Subagent 6's external survey returned actionable adopt/defer/reject decisions with citations. There are no remaining "we don't know enough to specify" gaps.

If a `/deepresearch` were warranted, it would be on **node-pty + xterm-headless production patterns for CI smoke** — but that's an L3 problem, not a v1 problem.

---

## See also

- [`docs/project-rules/harness.md`](../../project-rules/harness.md) — current Boot/Interact/Observe contract (this plan upgrades the **Interact** layer)
- [`docs/difficulties.md`](../../difficulties.md) — D-005, D-006, D-008, D-014 are this plan's targets
- [`docs/velocity.md`](../../velocity.md) — row 7 will be this plan's data point
- [`docs/plans/003-scratch/`](../003-scratch/) — first kept extension; the validator's first target
- [`agents/code-review-companion/`](../../../agents/code-review-companion/) — sibling agent pattern; ext-validator mirrors its shape
- minih agent author guide: `minih agent-readme` (run locally) or https://github.com/AI-Substrate/minih/blob/main/AGENTS_README.md
- minih companion-mode: https://github.com/AI-Substrate/minih/blob/main/docs/how/companion-mode.md

---

**Research Complete**: 2026-05-10
**Report Location**: `/Users/jordanknight/pi-hacking/pij/docs/plans/004-agent-pilot-harness/research-dossier.md`
**Stop here** — the user decides what to do next (workshop, specify, or pivot).
