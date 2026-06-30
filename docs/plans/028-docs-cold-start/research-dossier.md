# Research Dossier: cold-start documentation pass (AGENTS_README + README thesis)

**Generated**: 2026-07-01
**Query**: "What must cold-start docs contain so a fresh agent can build pij + update pi on a new machine, and what is the repo's dual thesis? Ground AGENTS_README.md (index) + README.md (thesis) + the new docs/how articles."
**Effort**: Deep (3 parallel survey workers + direct reads of README/justfile/AGENTS.md/RUNBOOK)
**Tools**: Standard
**Evidence**: 9 current sources · 0 historical (greenfield docs, no prior doc-pass plan)

## Answer

1. **`AGENTS_README.md` does not exist yet** — it is a NEW file, distinct from the existing dense `AGENTS.md` (the P1–P10 agent *rules*) and `RUNBOOK.md` (three-command operational runbook). Its job is the cold-start **front door / index**: a short quickstart + signposts (blurb + link) into `docs/how/`. It must NOT dump content that belongs in `docs/how/`.
2. **The build/bootstrap story is already fully encoded in the `justfile`** — `just install` is the single fresh-machine command (6 steps), `just self-check` the gate, `just update-pi` the pi-refresh. The docs job is to *narrate + signpost* these, not invent them. Node engine is **>=24**; npm + committed `package-lock.json`.
3. **`pi` = the official npm binary `@earendil-works/pi-coding-agent`** (`just pi-official-install`). pij layers global state onto `~/.pi/agent/` (prefs `APPEND_SYSTEM.md`, `mcp.json`, extension symlinks, vetted packages). `just pi-doctor` audits it.
4. **Skills fact (must be correct, easy to get wrong)** — VERIFIED on disk: non-Claude agents (copilot, codex, pi) read skills from the shared store `~/.agents/skills/` (installed via `npx skills`, manifest `~/.agents/.skill-lock.json` `version 3`); Claude reads `~/.claude/skills/`, which holds **symlinks back into** `~/.agents/skills/`. The justfile itself documents this (`flow-pair-install`, `install-flow-skills`).
5. **The dual thesis is real but under-framed in the current README.** README *lists* the cross-agent features (pij, flow-pair, telegram) but leads with "Engineering harness for building pi extensions / the harness is the product." The update must **elevate** the "it's BOTH a pi-extensions project AND a cross-agent worker system (agents driving agents across claude/copilot/codex/pi) + more" thesis to the top.
6. **The cross-agent worker system = pij control-plane daemon (transport switchboard) + flow-pair (delegation/ledger) + telegram bridge.** Transport seam is harness-specific: `pi` via in-process inbox, `claude/copilot/codex` via tmux send-keys.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | `just install` = fresh-machine bootstrap: `npm ci` → install/update official pi → sync `.pi/APPEND_SYSTEM.md`+`.pi/mcp.json` to `~/.pi/agent/` → `just link` + `npm link` → `just pkg bootstrap` → `just pi-doctor` | `justfile:41-66` | `build.md` + AGENTS_README quickstart narrate exactly this ordered list | High |
| F-02 | `just` no-arg lists recipes; atomic checks `typecheck/lint/format/test/smoke`; composite `self-check` = typecheck→lint→test→smoke→`PIJ_VET_SKIP_AGENT=1 pkg audit`→snapshots-check | `justfile:16-18,70-123` | `build.md` documents the recipe surface + the gate | High |
| F-03 | `pi` is `@earendil-works/pi-coding-agent@latest`, installed globally by `pi-official-install` | `justfile:210-227` | `update-pi.md` defines "what is pi" + install | High |
| F-04 | `just update-pi` = official pi + prefs sync + link + npm link + pkg bootstrap + `pi update --extensions` + pi-doctor | `justfile:303-330` | `update-pi.md` canonical refresh flow | High |
| F-05 | `just pi-doctor` audits binary, `~/.pi/agent/extensions/` symlinks, `settings.json#packages`, `mcp.json` | `justfile:342-357` | doc the verification step | High |
| F-06 | Node engine `>=24`; npm; committed `package-lock.json`; peer deps `@earendil-works/pi-ai|pi-coding-agent|pi-tui`, `typebox`; runtime deps `grammy`,`@grammyjs/files`,`dotenv`,`picomatch` | `package.json:41-64` + `package-lock.json` | prerequisites block in `build.md`/AGENTS_README | High |
| F-07 | Skills shared store `~/.agents/skills/` + manifest `~/.agents/.skill-lock.json` (v3); `~/.claude/skills/` symlinks INTO it; installed via `npx skills` | disk: `ls ~/.agents/skills ~/.claude/skills`, `head ~/.agents/.skill-lock.json`; `justfile:160-191` | `skills.md` + a MUST-INCLUDE fact block in AGENTS_README | High |
| F-08 | Engineering harness is an **ambient global** `harness` CLI (not a repo dep); `.harness/` substrate is committed; day-to-day `harness boot` (typecheck+test) / `harness checks` (full gate) / `harness doctor` | `AGENTS.md:120-128`; `.harness/engineering-harness.md` | `build.md` covers harness boot/checks alongside `just self-check` | High |
| F-09 | `.pi/extensions/` holds 9 extensions: `pij`, `session-sql`, `todo`, `minih-workbench`, `pi-peacock`, `file-watch-notify`, `image-see`, `ralph-loop`, `skill-runner` | `.pi/extensions/` listing | AGENTS_README "extensions" index; note `image-see` + `skill-runner` lack README sections today | High |
| F-10 | `docs/how/` has 11 articles: agent-feedback, agent-workbench, file-watch-notify, flow-pair, image-see, pi-peacock, pij-telegram, pij, ralph-loop, session-sql, todo | `docs/how/` listing | AGENTS_README index links all 11 + the new articles | High |
| F-11 | pij control-plane: daemon switchboard `pij daemon start|status|stop|kill`; operator verbs `spawn/send/list/tail/state/phonehome/path`; transport seam pi=inbox, claude/copilot/codex=tmux send-keys | `docs/domains/pij-control-plane/domain.md:5-47`; `.pi/extensions/pij/cli.ts:73-125`; `core/harness/*` | `workflow.md` + README cross-agent thesis | High |
| F-12 | flow-pair = 3-session orchestrator/worker/reviewer wrapper over `the-flow` + prompt-learning ledger; packets pointer-delivered via `pij send` | `docs/domains/flow-pair/domain.md:5-18`; `docs/how/flow-pair.md:3-11` | `workflow.md` ties the-flow + flow-pair + pij together | High |
| F-13 | the-flow SDD pipeline: explore→plan→(workshop/adr)→tasks→implement→review→ship | `~/.agents/skills/the-flow/SKILL.md` | `workflow.md` documents the dev/agent loop | High |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| README "already lists both" vs "frames the thesis" | README leads with harness-only thesis (`README.md:3-7`) | Update must REFRAME (elevate dual thesis), not just append a section — easy to under-deliver | Plan task spells out: new top thesis block + keep feature blurbs as signposts |
| AGENTS_README vs AGENTS.md confusion | `AGENTS.md` exists (18KB rules); brief wants a NEW `AGENTS_README.md` | A coder could edit the wrong file or duplicate rules | Plan task names exact file + "index not rules; link to AGENTS.md for rules" |
| Index-not-dump discipline | brief §1 | AGENTS_README must be short blurbs+links, not full procedures | Each AGENTS_README section = 1–3 sentence blurb + link to the docs/how depth article |
| `image-see` + `skill-runner` undocumented in README/how-index | F-09 vs F-10 (image-see.md exists; no skill-runner.md) | AGENTS_README extensions index should still list them; skill-runner has no how article | Plan notes: link image-see.md; mention skill-runner with a one-liner (no new article required this pass) |

## Planning Handoff

- **Preserve**: the `justfile` as the single source of truth for commands (docs *narrate* it, never restate divergent steps); the existing 11 `docs/how/` articles (signpost, don't rewrite); `AGENTS.md` as the rules home and `RUNBOOK.md` as the operational runbook (AGENTS_README links to both, doesn't absorb them).
- **Change carefully**: `README.md` — reframe the top to the dual thesis but keep the accurate feature blurbs + links; don't break the existing relative links.
- **Likely files**:
  - NEW: `AGENTS_README.md` (root), `docs/how/build.md`, `docs/how/update-pi.md`, `docs/how/workflow.md`, `docs/how/skills.md`
  - EDIT: `README.md`
- **Decisions resolved in this dossier** (so the plan can lock them):
  - Cold-start quickstart lives **inside AGENTS_README** (top section); no separate `docs/how/cold-start.md` (would duplicate the front door).
  - New docs/how depth articles = exactly 4: `build.md`, `update-pi.md`, `workflow.md`, `skills.md`. AGENTS_README's MUST-INCLUDE skills fact is stated inline AND linked to `skills.md`.
  - Phase split: **P1** = 4 new docs/how articles + AGENTS_README index; **P2** = README thesis reframe (depends on P1 so README can link the new articles + AGENTS_README).

## External Research
_None material — all answers are in-repo._
