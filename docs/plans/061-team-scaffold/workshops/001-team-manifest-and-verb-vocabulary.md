# Workshop: Team-manifest schema + scaffold verb-family vocabulary

**Type**: Data Model + CLI Flow
**Plan**: 061-team-scaffold
**Spec**: (pre-plan workshop — business source = `original-ask.md` + `research-dossier.md`)
**Created**: 2026-07-20T10:20:00Z
**Status**: Final (2026-07-21) — shipped as selected; naming was never a reserved gate (confirmed with Jordan), so the proposed names stand

**Value Thesis**: settles the contract surface (records, event kinds, verb family, manifest schema) that every scaffold phase builds against, so phases can be planned against a stable vocabulary instead of re-negotiating it mid-build.
**Target Proof Level**: Contract Ready
**Current Proof Level**: Contract Ready (provisional)

**Selected Value Axes**:
- **Agent Readiness**: a prime/PM must drive these verbs from briefs with zero clarification
- **Safety to Change**: additive-only schema posture (036 F-08) + closed vocabularies (WS-6) must survive this extension
- **Proof Quality**: every verb self-evidences (the survey's receipt principle); the manifest is checkable against what was actually created
- **Cross-Domain Coordination**: prime-constructs / PM-inhabits split (original-ask ruling 5) drawn as a hard line in the verb surface

**Related Documents**: `../research-dossier.md` (F-01..F-12, H-01..H-05) · `../inputs/team-scaffold-survey-synthesis-2026-07-20.md` §6/§8

---

## Purpose

Fix the four contracts the scaffold work needs before phasing: (1) the verb family and its split across prime/PM, (2) the store record types + spine event kinds, (3) the team-manifest schema, (4) the transactionality semantics. These are the decisions 054 precedent marks human-ruled.

## Key Questions Addressed

- What verbs exist in v1, and which composes over which?
- What new store records and spine event kinds are minted?
- What does a team manifest carry, and what stays out of it (judgment)?
- What does "transactional" mean concretely for a half-failed scaffold?

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| **D1-A: building-block verbs first** — `stream create`, `canary`, `dispatch` ship as standalone verbs; `team scaffold` composes them in a later phase | survey-recommended sequencing | each verb independently testable, fail-loud in isolation; scaffold inherits proven parts | team scaffold arrives later | **Selected (provisional)** |
| D1-B: monolithic `team scaffold` v1 | one big verb | single deliverable | violates atomic-refuse design; untestable middle states; H-01 risk class | Rejected |
| **D2-A: platform parser** — all new verbs register in `FAMILY_SUBCOMMANDS`/`ALLOWED_FLAGS`/`MAX_POS` (F-07) | ride `core/cli.ts` parseArgs | generic `--help` free; one resolver (kills the F-08 drift class) | three-table lockstep discipline | **Selected (provisional)** |
| D2-B: orchestration-style own resolver | separate subtree parser | freedom | reproduces the documented `--help` drift (F-08) | Rejected |
| **D3-A: two new record types** — `allocations/`, `fences/` subdirs (F-06 law) | store-native from birth | queryable ("who owns path X"), spine-attributed, survives seat death | more surface than prose | **Selected (provisional)** |
| D3-B: allocations as prose in briefs | status quo | zero code | the exact INS-004 divergence class the survey ranks pain #1 | Rejected |
| **D4-A: 3 new spine event kinds** — `allocation`, `fence`, `dispatch` (canary + scaffold acts recorded as `dispatch`/`allocation` refs, not own kinds) | minimal mint | small closed addition; WS-3 log law untouched | granularity loss | **Selected (final) — shipped as `allocation`/`fence`/`dispatch`** |
| D4-B: 6+ kinds (one per verb) | maximal | fine-grained queries | vocabulary sprawl in contract territory | Rejected |
| **D5-A: `autonomy` on Project** — `power-through \| gated`, default `gated`; three-place lockstep edit (F-11) | ruling 4 as data | scaffolded seats inherit policy deterministically | lockstep discipline | **Selected (provisional)** |

## The verb family (v1 surface)

Prime-constructs / PM-inhabits line (original-ask ruling 5): **pij owns git/registry mechanics; deps boot + `/builder` flow setup stay with the PM seat.**

| Verb | Actor | Does (all steps evidenced, atomic-refuse) | Emits |
|---|---|---|---|
| `pij stream create --project <slug> --slug <s> [--base <ref>] [--ordinal N]` | prime | reserve ordinal (tombstone-aware) → `git worktree add -b s<ord>/<s> <root>/s<ord>-<s> <base>` → **resolve base SHA at create-time** → write allocation record → spine `allocation` event | allocation id + worktree/branch/SHA evidence lines |
| `pij stream close <id>` | prime | teardown per never-destroy rules: stash+preserve, tombstone ordinal, strike allocation `state: closed` — never deletes worktree with uncommitted WIP | evidence lines + spine event |
| `pij fence set <stream> --paths a,b --shared x,y` / `pij fence show [--path <p>]` | stream owner | write/read fence record; overlap = derived query, never a block (F-10) | fence id + overlap report |
| `pij canary <id> [--expect-model <m>]` | any parent | leg (a) nonce round-trip via send/receipt machinery + leg (b) registry/descriptor identity read incl. declared-vs-pinned model compare; **refuses (named error) on fail**; leg (c) stays human/agent judgment — explicitly out of scope | canary record ref on the spine |
| `pij dispatch <id> --packet <file> [--wait]` | any parent | persist packet sha → send pointer → await **brief-ack receipt** (W-02 contract) | receipt artifact (packetId+sha+declared runtime) |
| `pij team scaffold --manifest <file>` *(phase 2+)* | prime | manifest loop over the above; stops at `briefed/awaiting-ack`; **never starts work** | per-step evidence journal; resumable |

Spawn/lineage: `stream create` does **not** spawn; seats spawn via existing `pij spawn` from the worktree cwd (F-01 channel carries new optional env `PIJ_STREAM`, `PIJ_REPLY_FORM` — additive descriptor fields per 036 F-08).

## Record schemas (Contract Ready)

```typescript
// ~/.pij/allocations/<id>.json    (subdir law, F-06)
interface Allocation {
  schema_version: 1;
  id: string;                    // alloc-s061-team-scaffold
  project: string;               // project slug
  ordinal: number;               // tombstone-aware, never recycled
  slug: string;
  worktree: string;              // absolute path
  branch: string;                // s<ord>/<slug>
  baseSha: string;               // resolved AT CREATE TIME (survey rule)
  state: "created" | "briefed" | "closed" | "tombstoned";
  steps: { name: string; ok: boolean; evidence: string; ts: string }[];  // the transaction journal
  created: { actor: string; ts: string };   // via resolveActor (F-09)
}

// ~/.pij/fences/<id>.json
interface Fence {
  schema_version: 1;
  id: string;
  allocation: string;            // -> Allocation.id
  touchSet: string[];            // repo-relative path globs
  shared: string[];              // known shared/convergence surfaces
  class: "notify-only";          // descriptive, never enforcing (protocol law)
  updated: { actor: string; ts: string };
}

// Project gains (three-place lockstep: types.ts interface + isProject + PROJECT_FIELD_ORDER, F-11)
autonomy?: "power-through" | "gated";   // absent => gated
```

## Team-manifest schema (consumed by `team scaffold`)

```jsonc
{
  "schema_version": 1,
  "project": "team-scaffold-demo",          // must exist (humans name work)
  "autonomy": "power-through",              // copied to Project on scaffold
  "streams": [{
    "slug": "api-rework",
    "base": "main",                          // SHA resolved at create-time
    "plan": "docs/plans/0NN-api-rework",     // pointer only
    "brief": "government/briefs/s0NN.md",    // judgment content — authored, never generated
    "fence": { "touchSet": ["src/api/**"], "shared": [] },
    "seats": [
      { "role": "pm",       "harness": "claude",  "model": "<judgment>", "effort": "high" },
      { "role": "coder",    "harness": "copilot", "model": "<judgment>", "effort": "xhigh" },
      { "role": "reviewer", "harness": "copilot", "model": "<judgment>", "effort": "xhigh" }
    ]
  }]
}
```

Out of manifest (judgment, per survey matrix): brief content, model choices are *values* the human/prime supplies — the schema carries slots, never defaults; fence negotiation on overlap; leg-(c) acks; teardown decisions.

## Transactionality (D-semantics)

1. Every step appends to `Allocation.steps[]` **before** the next step runs (persist-before-mutate).
2. First failure → named error + `state` stays at last-good; **no dispatch has happened** (dispatch is always the last step class).
3. Re-run with same manifest = resume: completed steps verified-then-skipped (idempotent, expander-style); no step re-executes destructively.
4. Rollback is explicit and non-destructive: `stream close` semantics only; a worktree with any WIP is never removed.
5. Every verb: success = evidence line naming what changed; refusal = named `E-*` code; **no exit-0 no-op path** (H-01 design law; wrong-arg tests mandatory).

## Attention Reduction

| Future Loop | Before | After |
|---|---|---|
| Stream stand-up | 5+ hand steps, 4× repeated, stale-SHA bug class | one evidenced verb |
| "who owns path X" | prime memory / prose tables (INS-004 divergence) | `pij fence show --path X` |
| Post-restart audit | manual eyeball of roster vs live peers | allocations/fences queryable + anomaly classes (F-10 pattern) |
| Policy inheritance | brief prose restating autonomy per stream | `Project.autonomy` read by orchestrator skill |

## Open Questions

### Q1: spine event kind names (`allocation`/`fence`/`dispatch`)?
**RESOLVED (2026-07-21)** — shipped as `allocation`/`fence`/`dispatch`; naming was never a reserved gate, the names stand.

### Q2: does `stream create` also run `pij spawn` for the first seat?
**RESOLVED (provisional)**: No — spawn stays a separate existing verb run from the worktree cwd; scaffold composes both. Keeps stream create pure-git/registry and independently testable.

### Q3: worktree root convention
**RESOLVED (provisional)**: sibling dir `../<repo>-worktrees/s<ord>-<slug>` (matches live s056/s057/s061 practice); overridable per-repo later, not in v1.

## Validation / Acceptance

- A cold reader can implement `stream create` + records from this doc alone
- Every Selected row survives Jordan's review or is amended here (single source)
- Schema examples parse; field names match the lockstep sites named in F-07/F-11
