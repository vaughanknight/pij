# Research Dossier: `pij chore` — a first-class change-detector + duty roster

**Generated**: 2026-08-02T00:58:00Z
**Query**: "pij chore: first-class change-detector + durable duty roster for PA seats — extensible, with fleet/repo/seat scoped chores"
**Effort**: Standard (lead-only, dual-lane scout)
**Tools**: Standard
**Evidence**: 9 current sources · 3 historical sources

## The Ask

`pij` seats that act as PAs currently hold their duty roster in model context and compute
their own change-detection by transcription — which dies at compaction and produces
composed receipts. The ask is a first-class `pij chore` verb family that stores a roster
durably, runs each chore's probe, and reports either `NO CHANGE — N probed, 0 moved` or
per-chore deltas, so a cheap seat classifies and relays output it cannot have invented.
Two extensions came from Jordan in conversation: it must stay extensible as more chores
are added, and chores must be scopeable to a repo or a specific PA, not just a seat. This
dossier establishes what the existing pij surface already provides, which precedent to
copy, and which precedent would be actively wrong to copy.

The design rationale (why first-class, gate-vs-sensor boundary, survey evidence) is
already settled in `government/briefs/chore-primitive-2026-08-02.md` and is not re-derived
here.

## Answer

1. A new verb family is a small, well-paved change: `cli.ts` dispatches top-level verbs by
   plain string compare on `process.argv[2]` and hands off to a `run<Verb>(argv)` function
   (F-01). Adding `chore` is one branch, one USAGE block, and a module.
2. There are **two** verb-implementation styles in the repo. The newer, testable one —
   pure result objects with injected deps, exercised without spawning a process — is
   `core/agents/cli-verbs.ts` (F-02). It is the correct template; the older inline
   `runWatch` style is not.
3. The per-seat durable sidecar is a solved shape: `~/.pij/<seat>/watchdog.json` written
   via `writeJsonAtomic` with a hand-rolled validator that degrades to `undefined` on
   malformed input (F-03). The chore roster and fingerprint store follow it directly.
4. **Three-tier scoping already exists in pij — but with the opposite merge semantics to
   what chores need.** `pij agent` resolves project → user → built-in and the *first
   source to define a slug wins* (F-04). Chores must **union**, not shadow: a repo
   redefining a fleet chore's name must not silently delete the fleet chore. This is the
   single highest-value thing for the plan to state explicitly, because the nearest
   precedent teaches the wrong rule.
5. Chore state must **not** ride on the session descriptor. The registry write law
   (F-06) exists because contested descriptor fields caused five separate lost-update
   incidents; a standalone sidecar has exactly one writer and sidesteps the whole class.
6. There is no role/permission gating in the CLI at all (F-07). "Let role `pa` run its own
   chores" needs no new grant — the real exposure is the reverse: nothing today would stop
   one seat mutating another seat's roster.
7. Two mechanical traps are already documented in-tree and would otherwise be rediscovered:
   a top-level `.json` under `~/.pij/` is read as a phantom peer (F-05), and verbs placed
   after the `E-NOREG` guard require the registry home to exist (F-09).

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | Top-level verbs dispatch by string compare on `process.argv[2]` → `run<Verb>(argv.slice(3))`; `watch`, `daemon`, `agent`, `orchestration` all follow it | `.pi/extensions/pij/cli.ts:4039-4062` | A `chore` family is an additive branch — no dispatcher refactor | High |
| F-02 | The modern verb style returns result objects (`errResult({code,message})`, `{stdout}`) with deps injected (`deps.cwd`, dirs) and is unit-tested directly | `.pi/extensions/pij/core/agents/cli-verbs.ts:52,81,148,465`; `cli-verbs.test.ts` | Build `chore` as `core/chores/cli-verbs.ts`; CLI branch stays a thin adapter, tests need no process | High |
| F-03 | Per-seat sidecar precedent: `pathFor(id) = ~/.pij/<id>/watchdog.json`, `writeJsonAtomic` on write, `parseSidecar` returns `undefined` on malformed JSON | `.pi/extensions/pij/adapters/watchdog-store.ts:71-88` | Copy verbatim for `chores.json` + fingerprint store; malformed roster must degrade, never throw | High |
| F-04 | 3-tier discovery already exists — project (`./agents`) → user (`~/.pij/agents`) → built-in — with **shadowing**: "the first source to define a slug wins" | `.pi/extensions/pij/core/agents/cli-verbs.ts:107-112`; `core/agents/pack.ts:5`; `core/agents/types.ts:7` | Reuse the discovery shape, **invert the merge rule to union**, and say so in the plan or an implementer will copy shadowing | High |
| F-05 | `FsRegistry.list()` reads `readdirSync(pijHome)` + `.json` filter, so a top-level `.json` there is read as a phantom peer; the global watchdog switch lives in a `pij-watchdog/` subdir to dodge it | `.pi/extensions/pij/adapters/watchdog-store.ts:105-112` | Any fleet-scoped chore store goes in a subdir (e.g. `~/.pij/pij-chores/`), never a top-level file | High |
| F-06 | The registry write law: `RegistryPort.write` merges by default, per-field ownership, written after 5 lost-update incidents (#1–#5 listed in-file) | `.pi/extensions/pij/core/registry-write.ts:1-45` | Keep chore state off `SessionDescriptor` entirely — a separate sidecar has one writer and no contested fields | High |
| F-07 | No role gating exists in `cli.ts` (`E-ROLE` / `allowedRoles` / `requireRole` return no matches); `role` is a descriptor field only | `.pi/extensions/pij/cli.ts` (grep, no hits); `core/types.ts:177` | "Role `pa` may run its own chores" needs no grant; instead decide whether cross-seat roster writes are refused | High |
| F-08 | `pij <verb> [sub] --help` is generic — it filters the single `USAGE` string by the `pij <verb>` token | `.pi/extensions/pij/cli.ts:4076-4082` | Writing USAGE lines as `pij chore …` gets `--help` for the whole family free | High |
| F-09 | Verbs registered *after* the `E-NOREG` check require `~/.pij` to exist; `agent`/`telegram`/`orchestration` are deliberately placed before it | `.pi/extensions/pij/cli.ts:4064-4070` | Decide placement: a repo-scoped `chore run` in a fresh clone with no registry home would `E-NOREG` if placed after the guard | Medium |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | The primitive's design is already argued and its gate-vs-sensor boundary pinned: `ack` advances a baseline and completes nothing; `run` must not auto-commit a fingerprint or an unrelayed delta is lost forever | `government/briefs/chore-primitive-2026-08-02.md#design-points-to-settle`, `#relation-to-builder-chores` | Direct | These are requirements, not open questions — the plan implements them rather than re-deciding |
| H-02 | A truthful `0 deltas` was reported for ~10h across 3 red PRs because reds present at briefing became silent baseline (seahorse) | `government/briefs/chore-primitive-2026-08-02.md` §3 | Direct | The fingerprint store must be readable, and `--full-every N` gives a periodic absolute-state report |
| H-03 | The watchdog verb family did not grant its own subject the verbs it needed — named in the brief as the gap not to repeat | `government/briefs/chore-primitive-2026-08-02.md` §Design points | Partial | Given F-07 (no gating at all), this manifests as an ownership question, not a permission grant |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| Shared baselines would reintroduce delta-blindness | H-02 + the union-scoping ask | If two seats share a fingerprint for a repo-scoped chore, one seat's `ack` silences the other's un-relayed delta — presenting as a truthful `NO CHANGE` | Fix by construction: chore *definitions* may be repo/fleet scoped; fingerprints and un-acked deltas are **always per-seat** |
| Repo-scoped probes are arbitrary shell arriving from the repo | Probe design in H-01; `./agents` precedent (F-04) already executes repo-authored packs | Adopting a repo would begin running its shell on a cadence — no new privilege in practice, but it must be a stated decision | State it in the plan; make probes readable via `chore list --verbose` |
| Worktree keying | 32 worktrees on this machine (operator context); `git-repository.ts` provides repo identity | A repo-wide roster keyed by path fragments per worktree; a branch-scoped probe keyed by repo bleeds across branches | Key the *roster* by repo identity, the *baseline* by worktree; confirm with `GitRepositoryAdapter` |
| Probe fingerprints that can stay identical while the watched thing moves | H-01 §"Fingerprint = superset signal" | A probe whose output is not a superset signal makes the sensor silently blind | Document the probe-authoring rule; verify by driving it (mutate, assert delta) |

## Planning Handoff

- **Preserve**: the `run<Verb>(argv)` dispatch shape (F-01); `writeJsonAtomic` + degrade-to-`undefined` parsing (F-03); the USAGE-token `--help` convention (F-08); chore state off `SessionDescriptor` (F-06).
- **Change carefully**: scope-merge semantics — reuse `pij agent`'s discovery shape but **union, never shadow** (F-04); anything writing under `~/.pij/` top level (F-05); verb placement relative to the `E-NOREG` guard (F-09).
- **Likely files/symbols**: new `core/chores/cli-verbs.ts` + `core/chores/types.ts` (+ tests) modelled on `core/agents/cli-verbs.ts`; new `adapters/chore-store.ts` modelled on `adapters/watchdog-store.ts`; one dispatch branch and one USAGE block in `.pi/extensions/pij/cli.ts`.
- **Decisions still required**: (a) whether a cross-seat roster write is refused or merely recorded (F-07); (b) exact repo-roster file location and repo-vs-worktree key; (c) whether `chore run` in a registry-less clone must work (F-09 placement).
