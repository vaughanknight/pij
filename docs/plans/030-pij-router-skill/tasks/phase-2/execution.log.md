# Phase 2 — Execution Log (dlg-0001)

**Run**: 2026-07-04T06-07-18Z-github.com-AI-Substr · **Delegation**: dlg-0001
**Coder**: pij-okel90 (copilot claude-opus-4.8) · **Phase**: 2 — Pair port + delegate + deprecation

---

## T2.1a — Reconcile the deployed fork → repo

### Forensic finding (premise of finding 01 was dead on disk)

Finding 01 assumed `~/.agents/skills/flow-pair` was a **331-line fork ahead** of a 299-line
repo (5 files diverged), carrying unique invariants (*orchestrator sanity pass*,
*own-the-deliverable*, *trust-but-verify*). On inspection at run time:

| Probe | Result |
|-------|--------|
| `diff -rq ~/.agents/skills/flow-pair skills/flow-pair` | **clean — zero divergence** |
| `wc -l` both `SKILL.md` | **300 / 300, byte-identical** (20633 B) |
| store `SKILL.md` mtime | **2026-07-04 13:23** — redeployed from repo |
| `git log -S"own the deliverable"` / `-S"sanity pass"` on `skills/flow-pair/` | **no hits** — prose never existed in repo git |
| session-store `turns`/`events`/`tool_requests` verbatim capture | none (only the plan doc's finding-01 *summary*) |

**Conclusion**: a `just flow-pair-install` redeploy on 4-Jul 13:23 overwrote the 331-line
deployed fork with the 300-line repo copy, destroying the ~31-line fork-add. The literal
`diff -rq … merge the 5 diverged files` step specified by T2.1a was therefore **moot** (diff
already clean), and porting from the on-disk copy would have silently dropped the exact
invariants finding 01 warned about. Surfaced to the orchestrator (pij-z4bt25) rather than
porting the stale copy.

### Recovery + decision (orchestrator-confirmed)

The orchestrator recovered the **verbatim** fork delta from its own session context (the
flow-pair skill was loaded there *before* the 13:23 redeploy) →
[`recovered-fork-delta.md`](./recovered-fork-delta.md). Confidence: **HIGH (verbatim)**.

**Path (confirmed)**:
- **Port base = the current 300-line repo `skills/flow-pair/SKILL.md`** — it carries the newer
  side-stack layout language the 331 fork lacked; do **not** wholesale-revert to 331.
- **Graft** the two verbatim sections from `recovered-fork-delta.md` into `pair.md`.
- AC-04 rows for those three invariants marked **`recovered-verbatim (orchestrator session
  context, pre-redeploy)`** — no user wording-confirmation needed (real text, not a
  reconstruction).
- **AC-09**: `diff -rq` is already clean; the shim redeploy (T2.4) keeps it clean. The 331
  prose is captured in repo git via `recovered-fork-delta.md` + its graft into `pair.md`.

> **Caveat carried forward**: only `SKILL.md`'s delta was recovered (that's what was in the
> orchestrator's context). The *other* files finding 01 counted as "diverged" were not
> separately recovered; T2.2 below inspected the surviving repo `references/*` and found no
> further material protocol delta requiring recovery (the load-bearing protocol prose is all
> in the recovered SKILL.md delta).

---

## T2.2 — References disposition

### Grep evidence: does the engine runtime-read `references/`?

`grep -rn "references" skills/flow-pair/lib/*.ts` + per-file name grep:

| Reference file | Read by `lib/`? | Evidence |
|----------------|-----------------|----------|
| `templates/worker-implement.md` | **YES** | `lib/packet.ts:97,110` |
| `templates/worker-fix.md` | **YES** | `lib/review.ts:66,292,295` |
| `templates/` (dir) | **YES** | `lib/cli.ts:219,222,351` (`templateDir = join(__dirname,"..","references","templates")`) |
| `harness-modes.md` | no | 0 hits in `lib/` |
| `review-rubrics.md` | no | 0 |
| `ledger-schema.md` | no | 0 |
| `context-packs.md` | no | 1 hit = `CONTEXT_PACKS_DIR = "context-packs"` const (`lib/context-pack.ts:44`) — **not** an fs-read of the doc |
| `architecture.md` | no | 0 |
| `prompt-taxonomy.md` | no | 0 |
| `orchestrator-worker-protocol.md` | no | 0 in `lib/`; **but** live inbound from runtime-read `templates/worker-fix.md:68` |

**Rule honoured**: `templates/*` are runtime-read → **zero template content moved**; they stay
in place and `pair.md` cites them.

### Disposition table (every `references/*` file has a live inbound pointer or a retire decision)

| File (lines) | Disposition | Rationale / inbound pointer after |
|--------------|-------------|-----------------------------------|
| `harness-modes.md` (164) | **RETIRE (absorbed)** | Content is now sole-owned by `00-routing.md § C1` (Phase-1 design: "absorbs harness-modes.md as sole owner"). No live inbound survives the T2.4 shim (only historical plan/exec logs reference it — append-only records, fine to leave). Keeping it would duplicate C1 prose. |
| `orchestrator-worker-protocol.md` (5, stub) | **KEEP + CITE** ⚠ *deviation from packet's "retire"* | It is a vestigial "_Stub — filled in Phase 4_" placeholder, **but** the runtime-read template `worker-fix.md:68` tells every fix-worker to "Reply with a Worker Report per … `references/orchestrator-worker-protocol.md`". Retiring dangles a live template I may not edit (runtime-read). Kept and cited from `pair.md`; inbound = `worker-fix.md` + `pair.md`. |
| `review-rubrics.md` (243) | cite in place | `pair.md` § Verdict law / Procedure (the 10-dim rubric + Dim-0) |
| `ledger-schema.md` (156) | cite in place | `pair.md` § References |
| `context-packs.md` (220) | cite in place | `pair.md` § Procedure (context-pack extraction) |
| `architecture.md` (133) | cite in place | `pair.md` § Invocation (CLI→lib→ledger call chain) |
| `prompt-taxonomy.md` (41) | cite in place | `pair.md` § Procedure (cluster taxonomy for `learn`) |
| `templates/worker-implement.md` (117) | cite in place — **must stay** (runtime-read) | `pair.md` § Procedure + `lib/packet.ts` |
| `templates/worker-fix.md` (70) | cite in place — **must stay** (runtime-read) | `pair.md` § Procedure + `lib/review.ts` |
| `templates/orchestrator-stage.md` (5) | cite in place | `pair.md` § Procedure |
| `templates/review-synthesis.md` (74) | cite in place | `pair.md` § Procedure |
| `templates/learning-synthesis.md` (44) | cite in place | `pair.md` § Procedure |

---

## T2.7 — CLI help-text truth (finding 03 confirmed)

`lib/cli.ts` dispatch (L469–477): `review → runReview`, `fix → runFix` (both **real**,
Phase-6 functional); only `accept` falls through to `runStub` (L272–274,
`status: "stub — not yet implemented"`). `runReview`'s verdict (`lib/review.ts:134–141`,
`determineVerdict`) is computed from finding **severity** — an artifact/contract gate, **not**
a code-correctness reader.

**Fix**: relabel `review` (real; artifact/contract gate) and `fix` (real) — drop their stale
`[stub — Phase 6]` tags; leave `accept` labelled `[stub …]` (it is the only true stub).

---

## AC-04 source→target parity checklist

**Source** = the reconciled deployed SKILL.md = the current 300-line repo `skills/flow-pair/SKILL.md`
(port base) **+** the recovered fork delta (`recovered-fork-delta.md`). **Target** = `pair.md`
section or a `00-routing.md § C*` shared convention (single-owner — pair.md *cites*, never copies).
**Zero rows unmapped.**

| # | Source (reconciled SKILL.md section / recovered delta) | Target | Provenance |
|---|--------------------------------------------------------|--------|------------|
| 1 | Intro — wrap the-flow, delegation *wrapper* not replacement | pair.md **Job** | repo base |
| 2 | Hard Invariant 1 — flow-state non-write | pair.md **Hard invariants #1** | repo base |
| 3 | Hard Invariant 2 — pointer delivery | pair.md **Hard invariants #2** | repo base |
| 4 | Hard Invariant 3 — forbidden paths in every packet | pair.md **Hard invariants #3** | repo base |
| 5 | Hard Invariant 4 — bounded scope | pair.md **Hard invariants #4** | repo base |
| 6 | Hard Invariant 5 — persist before mutate (P9) | pair.md **Hard invariants #5** | repo base |
| 7 | Hard Invariant 6 — cluster isolation | pair.md **Hard invariants #6** | repo base |
| 8 | Orchestrator Decision Protocol — FSM (ASK_USER/RUN_LOCAL/DELEGATE/REVIEW/FIX/APPROVE) | pair.md **Decision Protocol** FSM table | repo base |
| 9 | DELEGATE — whole-phase-per-packet + completion discipline | pair.md FSM **DELEGATE** row | repo base |
| 10 | REVIEW — compact worker first · acquire/canary reviewer · verdict+Dim-0 by reviewer | pair.md FSM **REVIEW** row | repo base |
| 11 | FIX — compact reviewer first · narrowed fix packet → coder | pair.md FSM **FIX** row | repo base |
| 12 | APPROVE — compact reviewer first · record · ledger · advance | pair.md FSM **APPROVE** row | repo base |
| 13 | **You own the deliverable / trust-but-verify** (intro under `## Orchestrator Decision Protocol`) | pair.md **Decision Protocol intro para** (Section-1 graft) | **recovered-verbatim** (orchestrator session context, pre-redeploy) |
| 14 | **The orchestrator sanity pass — last gate before APPROVE** (re-read hunk · confirm Dim-0 · sniff rubber-stamp) | pair.md **### The orchestrator sanity pass** (Section-2 graft) | **recovered-verbatim** (orchestrator session context, pre-redeploy) |
| 15 | Worker context hygiene — compact EARLY (reflex); confirm `executed:true`; no-poll after dispatch | § C3 (owner) + § C7 — cited from FSM REVIEW/FIX/APPROVE + Pipeline | repo base → shared-convention citation |
| 16 | Buggy-extension reload-before-compact safety | pair.md **Fleet lifecycle → Buggy-extension safety** | repo base |
| 17 | Harness mode (pi vs control-plane) — detect once · self-adopt · per-mode command map | § C1 (owner) — cited from pair.md Preconditions + Fleet lifecycle | repo base → shared-convention citation |
| 18 | Model discovery via `pij models`; names differ per harness; blanket-permission flag | § C4 + § C1 — cited from Roles table | repo base → shared-convention citation |
| 19 | Fleet roster in `run.json` (`role→{pijId,paneId,model,spawnedByUs}`), persist before use (P9) | pair.md **Fleet lifecycle** intro | repo base |
| 20 | Roles & default models (coder `…claude-sonnet-4.6:xhigh`@first-DELEGATE; reviewer `…gpt-5.5:xhigh` cross-model@first-REVIEW) | pair.md **Roles & default models** table | repo base |
| 21 | Acquire lazy · provided-or-spawn · **do NOT pre-spawn the reviewer** (cache-cost rationale) | pair.md Fleet lifecycle **Acquire** | repo base |
| 22 | Canary-verify — ready-ping ≠ proof; wrong model 400s silently; provided peers too | § C2 (owner) — cited from Fleet lifecycle **Canary** | repo base → shared-convention citation |
| 23 | Reuse across phases — compact, never close | § C3 (owner) — cited from Fleet lifecycle **Reuse** | repo base → shared-convention citation |
| 24 | Heal — dead/stale/canary-fail → close+respawn; persist roster before re-deliver (P9) | pair.md Fleet lifecycle **Heal** | repo base |
| 25 | Teardown end-only — close only `spawnedByUs`; ownership-aware | pair.md Fleet lifecycle **Teardown** + § C1 | repo base |
| 26 | Real peers, not builtin subagents (read-blind) | pair.md Fleet lifecycle **blockquote** | repo base |
| 27 | Placement — side-stack default, uncapped | § C5 (owner) — cited from Acquire | repo base → shared-convention citation |
| 28 | Pipeline while busy — dispatch → independent prep; daemon pushes; no poll; broken-transport spot-check | § C7 (owner) — pair.md **Pipeline** section cites § C7 | repo base → shared-convention citation |
| 29 | Invocation grammar (start/dispatch/observe/review/fix/accept/ledger/learn) | pair.md **Invocation** | repo base |
| 30 | Shells to `flow-pair` CLI · never imported into pi (P2) · architecture.md | pair.md Invocation + References | repo base |
| 31 | Procedure — 7 steps | pair.md **Procedure** (1–7) | repo base |
| 32 | Procedure 2 — context pack same-cluster only; context-packs.md | pair.md Procedure #2 | repo base |
| 33 | Procedure 3 — render packet from templates (worker-implement/worker-fix) | pair.md Procedure #3 (+ runtime-read note) | repo base |
| 34 | Procedure 4 — dispatch one-line pointer; lib never sends, orchestrator sends | pair.md Procedure #4 | repo base |
| 35 | Procedure 5 — review via reviewer peer; rubric; **Dim-0 mandatory for CODE** | pair.md Procedure #5 + **Verdict law** | repo base |
| 36 | Procedure 6 — learn: candidate note, no auto-promote | pair.md Procedure #6 | repo base |
| 37 | Procedure 7 — end-of-work gate: `harness checks` (all sensors) | pair.md Procedure #7 | repo base |
| 38 | **Deployed `## References` index** (harness-modes · architecture · orchestrator-worker-protocol · ledger-schema · prompt-taxonomy · context-packs · review-rubrics · templates/*) | pair.md **References** (harness-modes → § C1 absorbed; all others cited in place — see T2.2 disposition table) | repo base → T2.2 |
| + | Verdict law — CLI `review`=contract gate, `accept`=stub, reviewer verdict is law (finding 03) | pair.md **Verdict law** | **NEW** (finding 03 — an addition, not a source rule) |

**Result: 38/38 load-bearing source rules mapped, zero dropped.** The two recovered-fork invariants
(rows 13–14) are grafted **verbatim** and marked `recovered-verbatim` — HIGH confidence, no user
wording-confirmation required (per orchestrator, they are the real pre-redeploy text). Row `+` is a
finding-03 *addition*, not a ported rule. Shared-convention rows (15, 17, 18, 22, 23, 27, 28) live
solely in `00-routing.md § C*` (single-owner) and are **cited**, never copied — satisfying AC-02 and
the dup-prose gate.

## Validation results

| Gate | Command | Result |
|------|---------|--------|
| AC-01/02/03/05 structural | `just pij-skill-check` | ✅ all green (registry parity, sibling-blind, budgets pair 192/350 · delegate 78/150, CLI-verb coverage, dup-prose single-owner) |
| AC-06 engine untouched | `just flow-pair-test` | ✅ **148/148** (16 files) |
| Type safety | `just typecheck` | ✅ clean (`tsc --noEmit`) |
| Lint | `just lint` | ✅ exit 0 (10 pre-existing warnings, **none** in `skills/flow-pair/lib/cli.ts`; my diff = 3 help-text lines) |
| AC-09 store reconciled | `diff -rq ~/.agents/skills/flow-pair skills/flow-pair` | ✅ **clean** after `just flow-pair-install` redeploy |
| AC-07 live smoke | peer-route verbatim (control-plane) | ✅ spawn `pij-19p80br` (claude-haiku) → canary (booted+bound, real inference "ok" = no-400) → `pij close` (pane %659 + descriptor gone, `E-NOID` confirms) |

### Harness gaps surfaced (encode-don't-document candidates — outside this delegation's scope)

1. **`just flow-pair-install` COPIES, it doesn't symlink** (justfile:175-176). This is the root cause
   of the store fork that triggered the whole T2.1a recovery: `pij-skill-install` (justfile:195-199)
   was already given an explicit `rm + ln -sfn` symlink-swap after the `npx skills` copy (comment cites
   DL-001 "copies drift, flow-pair forked that way"), but `flow-pair-install` never got the same fix.
   **Fix**: mirror the symlink-swap into `flow-pair-install` so the deployed store tracks the repo
   live and cannot silently fork again. (justfile is `extension-authoring-harness` domain — outside
   this packet's allowed scope; flagged for the orchestrator.)
2. **SKILL.md frontmatter YAML `": "` trap** — a plain-scalar `description:` containing `flow-pair
   run: an expensive …` breaks `npx skills` parsing (skill silently "not found"). Hit live this run;
   fixed by using the `|` block scalar. **Encode candidate**: `pij-skill-check` (or a pre-deploy step)
   could lint every SKILL.md frontmatter parses + `name` matches the dir, so a bad-YAML shim fails a
   gate instead of a deploy.

