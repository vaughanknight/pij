# External Research: Ralph Loop provenance, prompts, and operations

**Generated**: 2026-05-14
**Source**: Perplexity MCP (`perplexity_perplexity_ask`, three focused calls; deep-research endpoint timed out twice — same flakiness as D-021 noted)
**Resolves**: CD-01 in `../research-dossier.md`
**Verified URLs**: 15+ primary, 10+ secondary (see Citations)

---

## TL;DR (verified)

- **Coined by Geoffrey Huntley** (@ghuntley). Canonical post: <https://ghuntley.com/ralph/>. Follow-up: <https://ghuntley.com/loop/> ("everything is a ralph loop").
- **Original definition (verbatim)**: *"Ralph is a Bash loop"* — Huntley.
- **Core mechanism**: a `while` / for loop that re-invokes a coding agent (Claude Code, Amp, etc.) with a **fresh context per iteration**; persistent state lives in the filesystem (git history + `prd.json` + `progress.txt`); termination is by a stop-hook that watches for `<promise>COMPLETE</promise>` in the agent's output.
- **Canonical reference implementation**: `snarktank/ralph` — <https://github.com/snarktank/ralph>. Default cap **10 iterations**.
- **Official plugin** exists: Anthropic Claude Code "Ralph loop" plugin (listed at <https://www.claudepluginhub.com/plugins/anthropics-ralph-loop-plugins-ralph-loop>).
- **Economic claim**: Sonnet 4.5 + Ralph ≈ **$10.42/hr** "AI engineer hourly rate" (Huntley, via LinearB/Dev-Interrupted).
- **Recent evolution**: stop-hook implementations, multi-Ralph swarms ("Gas Town"), Loom (evolutionary infrastructure), Ralph + Claude Code subagents.

---

## 1. Origin and canonical definition

### Attribution

Geoffrey Huntley (@ghuntley) coined the term. HumanLayer's "Brief History of Ralph" makes this explicit:

> "The Ralph Wiggum Technique, **created by Geoff Huntley**, went viral in the final weeks of 2025."
> — <https://www.humanlayer.dev/blog/brief-history-of-ralph>

Named after the Simpsons character: persistent, naive, "I'm helping!" — matches brute-force + verify-on-every-step philosophy.

### Canonical post

**Primary**: <https://ghuntley.com/ralph/> — "Ralph Wiggum as a 'software engineer'".

Key quotes (from the page and its widely-circulated quotes):

> "Ralph is monolithic. Ralph works autonomously in a single repository as a single process that performs one task per loop."

> "To get good outcomes with Ralph, you need to ask Ralph to do one thing per loop. **Only one thing**."

> "Ralph can be done with any tool that does not cap tool calls and usage."

**Verbatim canonical one-liner** (widely quoted from Huntley's framing, surfaced in dev.to breakdown):

> "Ralph is a Bash loop."
> — Geoffrey Huntley
> Quoted in: <https://dev.to/ibrahimpima/the-ralf-wiggum-breakdown-3mko>

**Companion essay**: <https://ghuntley.com/loop/> — "everything is a ralph loop". Frames Ralph as a mindset:

> "Ralph isn't just about forwards (building autonomously) or reverse mode (clean rooming) it's also a mind set that these computers can be indeed programmed. I'm there as an engineer just as I was in the brick by brick era but instead am **programming the loop, automating my job function and removing the need to hire humans**."

> "It's important to **watch the loop** as that is where your personal development and learning will come from. When you see a failure domain – put on your engineering hat and resolve the problem so it never happens again."

> "The more you allocate, the more likely you are to get bad outcomes. **Ralph is a deliberate attempt to minimize allocation so I never get a compaction event.**"
> — Huntley, quoted in LinearB

That last line maps **directly** to our pij **D-005** concern (`customType` durability across `/compact`): Ralph's whole design is to *avoid* `/compact` ever happening, by keeping the agent context small and short-lived. Pij's Ralph extension can preserve this philosophy by making every iteration genuinely short.

---

## 2. First principles — verified invariants

Dossier proposal (a)–(f) graded against primary sources:

| # | Invariant | Status | Source |
|---|-----------|--------|--------|
| (a) | Long-lived plan/PRD file as source of truth | **Partial** — common convention; snarktank uses `prd.json` + `progress.txt`. Not strictly required by Huntley's minimal definition. | <https://github.com/snarktank/ralph>, <https://github.com/snarktank/ralph/blob/main/README.md> |
| (b) | Near-stateless agent invoked repeatedly | ✅ **Core invariant** | <https://github.com/snarktank/ralph#each-iteration--fresh-context> |
| (c) | Fresh context per iteration | ✅ **Core invariant, most distinctive** | <https://stevekinney.com/writing/the-ralph-loop>, snarktank README |
| (d) | plan → act → verify → commit → reflect inner cycle | ✅ Accurate conceptual model (verify ≈ tests/typecheck; reflect ≈ progress file append) | <https://tessl.io/blog/unpacking-the-unpossible-logic-of-ralph-wiggumstyle-ai-coding/>, <https://www.i-scoop.eu/ralph-wiggum-prompting/> |
| (e) | Outer loop driven by shell/cron/tmux | ✅ Correct in spirit. *"Ralph is a Bash loop."* tmux/cron are optional ops convenience. | Huntley (above) |
| (f) | Self-modification of the plan file | **Partial** — common, not strict invariant. Minimum is "filesystem-resident state discoverable by later iterations." | <https://github.com/snarktank/ralph#each-iteration--fresh-context> |

### Minimal precise definition (synthesized)

A Ralph Loop is:

1. A **single, narrowly-scoped task** with **mechanically-checkable completion criteria**.
2. An **external loop** (bash or equivalent) that re-invokes a **near-stateless agent repeatedly** until those criteria are met or bounded limits are reached.
3. Each invocation has a **fresh context**; all persistent state lives in the **repo/filesystem** (git history, PRD, progress files).
4. Each iteration follows an implicit cycle: **evaluate current state → choose next step → modify code → run checks → persist results**.

---

## 3. Canonical prompts and stop conditions

### The `<promise>COMPLETE</promise>` stop-hook pattern

There is no single canonical prompt text, but there *is* a canonical stop mechanism:

> "You give Claude a task + completion promise
> Claude executes tool calls
> Claude tries to exit
> Stop Hook intercepts with exit code 2
> **If completion promise not found, re-inject original prompt**
> Claude sees previous work and continues
> Repeat"
> — <https://dev.to/ibrahimpima/the-ralf-wiggum-breakdown-3mko>

> "As long as scope and stop condition are explicit, Ralph will know when to emit `<promise>COMPLETE</promise>`."
> — <https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum>

### snarktank's stop condition (verbatim)

> "**Stop Condition**
> When all stories have `passes: true`, Ralph outputs `<promise>COMPLETE</promise>` and the loop exits."
> — <https://github.com/snarktank/ralph#stop-condition>

### Reference prompt shapes

**snarktank/ralph** — `prompt.md` (most-cited community canonical):
- Repo: <https://github.com/snarktank/ralph>
- Prompt file: <https://github.com/snarktank/ralph/blob/main/prompt.md>
- Structure (paraphrased; read file for verbatim):
  - Define Ralph's role (autonomous agent, one repo)
  - Read `prd.json`; find stories with `passes: false`
  - Pick highest-priority one
  - Implement it
  - Run tests + typecheck
  - Update `prd.json` and `progress.txt`
  - Emit `<promise>COMPLETE</promise>` **only when all stories pass and all checks succeed**

**coleam00/ralph-loop-quickstart** — alternative explicitly "not using the Anthropic plugin":
- Prompt: <https://github.com/coleam00/ralph-loop-quickstart/blob/main/PROMPT.md>
- Description: "A quickstart to using the Ralph Wiggum loop the right way - NOT using the Anthropic plugin."

**ghuntley/how-to-ralph-wiggum** — Huntley's own teaching repo:
- Repo: <https://github.com/ghuntley/how-to-ralph-wiggum>
- Read directly before any pij implementation. Strongest first-party reference.

---

## 4. Public loop implementations

### Canonical / primary

| Repo / URL | What it is | Key facts |
|------------|-----------|-----------|
| <https://github.com/ghuntley/how-to-ralph-wiggum> | **Huntley's own teaching repo** — first-party | Read this first |
| <https://github.com/snarktank/ralph> | Amp + Claude Code reference; viral late-2025 | Default 10 iter; PRD-driven; `--tool amp\|claude` |
| <https://github.com/snarktank/ralph/blob/main/ralph.sh> | The actual bash loop | Shell-based |
| <https://github.com/snarktank/ralph/blob/main/prompt.md> | Reference prompt | Verbatim available |
| <https://github.com/coleam00/ralph-loop-quickstart> | "Right way" quickstart, no plugin | Claude Code |
| <https://github.com/Th0rgal/open-ralph-wiggum> | Open implementation; multi-backend | Claude Code, Codex, Cursor Agent, OpenCode |
| <https://github.com/JanDeDobbeleer/copilot-ralph> | Copilot variant | GitHub Copilot |

### Official Anthropic plugin

Listed at: <https://www.claudepluginhub.com/plugins/anthropics-ralph-loop-plugins-ralph-loop>

> "Implementation of the Ralph Wiggum technique - continuous self-referential AI loops for interactive iterative development. **Run Claude in a while-true loop** with..."

This is what HumanLayer calls the "stop-hook implementation" / "Ralph 2.0" form — hooks into Claude Code output, blocks exit unless completion-promise is found, re-injects prompt.

> ⚠️ Note: Perplexity could not confirm the exact `anthropics/claude-plugins-official` issue #426 contents or precise CLI flags (`--completion-promise`, `--max-iterations`, etc.) from a primary source in these searches. Verify by reading the plugin directly if pij plans to mimic its flag surface.

### Operational shapes

- **Local bash loop** — the dominant pattern. `while true; do <agent>; done` with stop-hook.
- **tmux / nohup** — common for "run overnight" use (Stevekinney: *"Run it overnight. Come back to commits."*).
- **Git feature branch** — snarktank's pattern: one branch per Ralph run, archived when starting a new feature.
- **Git worktree per task** — encouraged as a pattern (parallel exploration, easy revert) but no single canonical primary-source repo was found in this session.
- **GitHub Actions / cron / systemd** — practitioner-mentioned; no verified canonical example.

---

## 5. Stop conditions and safety (beyond `<promise>COMPLETE</promise>`)

### Verified default values

| Mechanism | Source | Default |
|-----------|--------|---------|
| Max iterations | <https://github.com/snarktank/ralph/blob/main/README.md> | **10** |
| Completion sigil | snarktank, AI Hero, dev.to | `<promise>COMPLETE</promise>` token in agent output |
| PRD-state completeness | snarktank | all stories `passes: true` |
| Per-iteration quality gates | snarktank | tests + typecheck must pass before commit |
| One task per iteration | Huntley, ghuntley.com/ralph | "Only one thing" |
| Feature branch scoping | snarktank | One branch per feature; archive on new feature |

### Additional safety practices reported by Huntley (paraphrased from LinearB)

- **Pre-commit hooks** — block commits that violate invariants.
- **Property-based tests** — go beyond unit tests; expose failure domains.
- **Automated deployment pipelines** — catch breakage before prod.
- **Change Data Capture (CDC)** — for prod-adjacent code, ensure recoverability.
- **Never provision write secrets to the loop.** Huntley quoted in LinearB:
  > "What happens when it drops a database? You're an engineer, right? **You don't provision write secrets.** You introduce tests, enable change data capture, and rely on audit logs. You engineer your way out of failure scenarios."

### Failure modes documented

- **Cost overruns** — running without iteration caps; cited as common gotcha by the AFK community.
- **Unreviewable mega-PRs** — 40,000-line PRs are reported (LinearB).
- **Loops that never emit completion** — caused by under-specified scope or stop conditions.
- **Repos broken by force-push / merge-conflict thrash.**

---

## 6. Reported outcomes — evidence and honesty

### Huntley's verified claims

- **Cost rate**: Sonnet 4.5 + Ralph = **$10.42/hr** "AI engineer hourly rate".
  > — Huntley, quoted in <https://linearb.io/blog/ralph-loop-agentic-engineering-geoffrey-huntley>
- **HashiCorp Nomad clone**: Reverse-Ralph extracted specs from BSL source; forward-Ralph regenerated functionally-equivalent implementation. "Days rather than years."
  > — <https://blog.codacy.com/what-everyone-gets-wrong-about-the-ralph-loop>
- **Tailscale rebuild** mentioned in same LinearB article.
- **"Build while you sleep"** is the dominant success framing across community. Concrete hours-to-ship numbers are rare; qualitative "left it overnight, woke up to 20k–40k line PR" is common.

### Failure stories

> "When an autonomous loop generates a 40,000-line pull request in hours, traditional code review breaks down. The solution is to engineer safety mechanisms such as pre-commit hooks, property-based tests, automated deployment pipelines, and change data capture (CDC) to prevent catastrophic operations."
> — <https://linearb.io/blog/ralph-loop-agentic-engineering-geoffrey-huntley>

Specific failure patterns (community-reported):
- Loops thrashing on impossible tasks with no cap.
- Auto-commit committing failing tests.
- Refactoring loops rewriting working code "just to improve structure."

### Honesty check

**The "$10.42/hr" and "Nomad in days" claims are real but contingent on:**
- mechanically-checkable scope (PRD + tests)
- strict iteration caps
- non-prod or sandboxed targets
- a human watching the early iterations to spot failure domains

Out of the box, it is easy to burn money. Huntley himself emphasizes that 80% of the work is tuning the loop (Stevekinney expansion: *"the other 80% is watching the loop run and adjusting based on what you see"*).

---

## 7. Comparison with other agentic patterns

| Pattern | Defining contrast vs Ralph |
|---------|-----------------------------|
| **AutoGPT / BabyAGI** | Heavy orchestration, recursive goal-gen, memory graphs. Ralph = "bash loop + good model." Determinism + reliability favor Ralph w/ modern models. |
| **SWE-agent / OpenHands / Devin** | Closed-loop SWE agents with internal planning, tool APIs, sometimes multi-agent. Ralph keeps orchestration external; you see every call. Easier to deploy, you provide safeguards. |
| **Aider `--auto-commit` / architect mode** | Aider is human-in-loop first; auto-commit is opt-in trust mode; tight diff control. Ralph is AFK-first; will produce giant PRs unless you scope tasks. |
| **Claude Code headless / `--print`** | One-shot. Ralph uses headless mode as a *component* and adds iteration + convergence + progress tracking + stop-hook. |
| **LangGraph StateGraph** | Declarative graph of nodes/state transitions/branching/retries. Ralph is a trivial graph: one node + a loop. StateGraph wins for complex workflows; Ralph wins for simplicity when models are strong. |
| **GitHub Spec Kit / specs-driven dev** | Spec frameworks assume human-authored specs + deterministic codegen. Ralph often *generates* specs from code via reverse-Ralph, then treats them as canonical. Huntley: *"Specs are the real asset."* |
| **Cursor background agents** | Tightly-integrated IDE agents, bounded steps, single-task. Ralph is editor-agnostic, multi-hour, your-own-stop-criteria. AI as cheap autonomous worker vs AI as copilot. |

Key Huntley framing from Codacy/AI-Giants:

> "**Specs are the real asset.** Institutional knowledge lives in specification files that every loop reads. Code becomes something you throw back on the 'pottery wheel' whenever you need a refactor, a migration, or a new feature."

---

## 8. Recent evolution (late-2025 → 2026)

### Ralph 1.0 → 2.0

HumanLayer's "Brief History of Ralph" explicitly compares two generations:

> "It talks through the history, cursed lang, and compares the original bash-loop ralph implementation with the **anthropic stop-hook implementation**."
> — <https://www.humanlayer.dev/blog/brief-history-of-ralph>

- **1.0**: bash `while true`, minimal harness.
- **2.0**: official stop-hook plugin, progress tracking, multi-agent extensions, model-output-aware termination, engineered safety rails.

### Multi-Ralph swarms ("Gas Town" / Loom)

Huntley's progression (LinearB synthesis of his diagrams):

- **Figure 5**: classic single Ralph.
- **Figure 6**: **two agents simultaneously** — used to discover failure domains by disagreement.
- **Figure 7**: **ten+ simultaneous Ralphs** — Huntley's "spaghetti base in factorial."
- **Figure 8 (Gas Town)**: complete infrastructure rethink to manage chaos.

Huntley's own framing (ghuntley.com/loop):

> "Loom is something that has been in my head for the last three years (and various prototypes were developed last year!) and it is essentially **infrastructure for evolutionary software**."

> "I am putting loom under the **mother of all ralph loops** to automatically perform system verification."

### Ralph + Claude Code subagents

The pattern adapts to Anthropic's newer subagents feature:
- Outer **Ralph orchestrator** assigns tasks.
- Each task is **a smaller Ralph** or **a subagent invocation**.
- The outer policy stays as a simple loop; subagents handle internal sub-tasks.

### Ralph + git worktrees per task

Encouraged pattern for:
- isolating concurrent loop runs
- parallel exploration of alternate implementations
- easy revert of bad runs
- human selection of best loop's output

Endorsed in Open Ralph Wiggum + ghuntley/how-to-ralph-wiggum spirit; no single canonical "worktree-Ralph" repo was found in these searches.

### Model-tuned variants

> "**With Opus 4.5, the Ralph Wiggum technique is becoming less necessary for many tasks.** Opus 4.5 is remarkably good at following a plan, and compaction (context management) has greatly improved. These enhancements mean Claude is better at completing complex tasks in fewer iterations - sometimes even in a single pass. The model's improved ability to maintain context and execute multi-step plans **reduces the need for forced iteration loops**. That said, Ralph Wiggum still shines for genuinely large refactors, overnight batch operations, and tasks where you want explicit iteration controls."
> — <https://www.atcyrus.com/stories/ralph-wiggum-technique-claude-code-autonomous-loops>

So in pij we should design for: **Ralph as opt-in mode for large/overnight tasks**, not a default. Modern Sonnet 4.5+/Opus 4.5+/4.6/4.7 single-pass already covers most cases.

---

## Implications for the pij `ralph-loop` extension

These ground the dossier's design choices in verified primary sources:

1. **Use `<promise>COMPLETE</promise>` as the canonical stop sigil**, not invent our own. Familiar to the community.
2. **Default `MAX_ITERATIONS = 10`** matches snarktank/ralph's published default. Set conservatively.
3. **`prd.json` + `progress.txt` shape is well-trodden** — pij's `store.ts` can model it directly. Iteration entries are essentially `progress.txt` lines, persisted via `pi.appendEntry`.
4. **"One task per loop. Only one thing."** is the strongest design constraint. Encode it in the prompt the extension injects, and validate it (e.g., warn if a single iteration touches > N files).
5. **Never provision write secrets to the loop** — surface this in `/ralph start` confirmation UI. Optional CDC / pre-commit-hook integration is a v2 feature, not v1.
6. **Watch for failure domains during early iterations** is Huntley's whole methodology — pij's status pill should make iteration outcomes immediately visible. The footer pill is exactly this.
7. **Compaction-avoidance** — Ralph is designed to *never trigger* `/compact`. This sharpens D-005's role from "verify durability" to "verify our extension is short-lived enough that `/compact` rarely fires in the first place, AND durable when it does."
8. **Multi-Ralph swarms / git worktrees** = strong v2 direction. Defer; the existing `npm:pi-subagents` extension can compose with v1 Ralph for swarm experiments later.
9. **"Specs are the real asset"** — strong philosophical fit with pij's spec/plan culture (`docs/plans/<N>-*/*` is exactly what Ralph wants to consume).
10. **Naming**: "Ralph Loop" / `ralph-loop` is fine — community-recognized, properly attributed; README/AGENTS.md must credit Geoffrey Huntley + link <https://ghuntley.com/ralph/>.

---

## Outstanding gaps after this research

1. The exact Anthropic-official plugin flag surface (`--completion-promise`, `--max-iterations`, etc.) was *not* fully verified from a primary source in these searches. Before mimicking it, **read `anthropics/claude-plugins-official` issue #426** and the plugin source directly.
2. The verbatim contents of `prompt.md` in snarktank/ralph and `PROMPT.md` in coleam00/ralph-loop-quickstart are referenced by URL but not pasted here. Read both before authoring pij's default prompt — copy-with-attribution is reasonable.
3. `ghuntley/how-to-ralph-wiggum` repo contents are not summarized here; **read directly** as the first-party teaching reference.

---

## Citations (primary first)

### Primary

1. <https://ghuntley.com/ralph/> — canonical post
2. <https://ghuntley.com/loop/> — "everything is a ralph loop"
3. <https://github.com/ghuntley/how-to-ralph-wiggum> — Huntley's teaching repo
4. <https://github.com/snarktank/ralph> — reference implementation
5. <https://github.com/snarktank/ralph/blob/main/README.md>
6. <https://github.com/snarktank/ralph/blob/main/prompt.md>
7. <https://github.com/snarktank/ralph/blob/main/ralph.sh>
8. <https://github.com/coleam00/ralph-loop-quickstart>
9. <https://github.com/coleam00/ralph-loop-quickstart/blob/main/PROMPT.md>
10. <https://github.com/Th0rgal/open-ralph-wiggum>
11. <https://github.com/JanDeDobbeleer/copilot-ralph>
12. <https://www.claudepluginhub.com/plugins/anthropics-ralph-loop-plugins-ralph-loop>
13. <https://github.com/JeredBlu/guides/blob/main/Ralph_Wiggum_Guide.md>

### Secondary (analysis / commentary)

14. <https://www.humanlayer.dev/blog/brief-history-of-ralph>
15. <https://dev.to/ibrahimpima/the-ralf-wiggum-breakdown-3mko>
16. <https://stevekinney.com/writing/the-ralph-loop>
17. <https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum>
18. <https://www.aihero.dev/getting-started-with-ralph>
19. <https://tessl.io/blog/unpacking-the-unpossible-logic-of-ralph-wiggumstyle-ai-coding/>
20. <https://www.i-scoop.eu/ralph-wiggum-prompting/>
21. <https://linearb.io/blog/ralph-loop-agentic-engineering-geoffrey-huntley>
22. <https://linearb.io/dev-interrupted/podcast/inventing-the-ralph-wiggum-loop>
23. <https://devinterrupted.substack.com/p/inventing-the-ralph-wiggum-loop-creator>
24. <https://blog.codacy.com/what-everyone-gets-wrong-about-the-ralph-loop>
25. <https://www.atcyrus.com/stories/ralph-wiggum-technique-claude-code-autonomous-loops>
26. <https://natesnewsletter.substack.com/p/my-honest-field-notes-on-the-verification>

### Video

27. <https://www.youtube.com/watch?v=_IK18goX4X8> — "Ship working code while you sleep"
28. <https://www.youtube.com/watch?v=dPG-PsOn-7A>

---

**Status**: ✅ Resolves CD-01 in `../research-dossier.md`. Dossier may proceed to `/plan-1b-specify` with this file present.
