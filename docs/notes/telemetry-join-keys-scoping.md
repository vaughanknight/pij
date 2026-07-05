# pij telemetry join-keys — scoping for pij-4s10mb

Scoped against the live code (`.pi/extensions/pij/`), 2026-07-04. Two features requested:
(1) join-key persistence, (2) orchestrator self-identity. **Headline: most of #1 already
exists, and #2 is narrower than the three options imply — both reduce to "read the registry,
don't do env archaeology."**

---

## The reframe (read this first)

pij **already** persists the harness↔pij join key, per peer, on bind:

- `SessionDescriptor.harnessSessionId` (`core/types.ts:81`) **is** the inner-harness session id —
  copilot session uuid, forked-claude session uuid, or codex rollout trailing-uuid.
- Written to `~/.pij/<id>.json` at bind via `applyBinding` → `writeMerged`
  (`core/daemon/loop.ts:303/306` copilot path, `:336/339` claude·codex path; pure mutator
  `core/binding.ts:13`).
- Companions already persisted: `harness`, `boundModel`, `spawnedBy` (the fleet-tree edge),
  `lifecycle`, and — codex only — `transcriptPath` (the **absolute** rollout `.jsonl`; the bare
  uuid can't reconstruct codex's date-nested path, so use this for codex).
- The daemon even keeps a reverse index `byHarnessSession` (`core/daemon/index-state.ts:32`,
  `resolveHarnessSession()` :49).

So fleet cost attribution is **already a deterministic registry lookup**, not env archaeology:
glob `~/.pij/*.json` → each file gives you `{pijId, harness, harnessSessionId, transcriptPath,
boundModel, spawnedBy}` → join `harnessSessionId` (or codex `transcriptPath`) to the harness
ledger, and `spawnedBy` reconstructs the tree. This holds for **read-only reviewer peers too** —
any pij-spawned peer binds and gets the descriptor; they are not trace-less.

---

## Feature #1 — join-key persistence

**Status: the persistence is done.** The only real gap is a **convenient query/export surface**
so telemetry reads a clean join table instead of globbing raw descriptor JSON.

**Shape:** add a first-class `pij sessions --json` (or extend `pij list --json`) that emits one
row per session with exactly the join tuple:
```
{ pijId, harness, harnessSessionId, transcriptPath?, boundModel, spawnedBy, parentId, lifecycle }
```
`pij list` already reads full descriptors, so this is projection + a stable documented contract,
not new capture. Add codex's `transcriptPath` to the row (telemetry keys codex on the abs path,
everything else on `harnessSessionId`).

**Effort: S (~half-day incl. tests).** No schema change, no daemon change — the fields exist.

---

## Feature #2 — orchestrator self-identity

The premise ("adopt sets no env, so the orchestrator's telemetry carries no PIJ_SESSION_ID") is
correct on the code: `runAdopt` (`cli.ts:717-782`) writes **only** the descriptor file — no
`process.env` mutation, no `tmux set-environment` (repo-wide grep for `set-environment|setenv` =
0 hits). But two things reshape the fix:

**(a) adopt already persists the orchestrator's OWN join key.** `runAdopt` resolves the adopting
pane's inner-harness session id (`resolveAdoptSessionId`, `core/binding.ts:47`) and, if resolved,
`applyBinding`s it into the descriptor (`cli.ts:756-766`). So an adopted orchestrator's
`~/.pij/<id>.json` **already carries `harnessSessionId` ↔ `pijId`.** Telemetry can join the
orchestrator's own ledger via the same registry read as #1 — **no env needed.** This is the
robust path and it works for the already-running process (env can't).

**(b) the env options can't retro-tag the running orchestrator.** The three options (eval-able
export line / tmux pane env / `whoami --env`) all set env for **future** processes in that shell
or pane. The orchestrator harness is **already running** (a human started it before `adopt`), so
none of them retroactively put `PIJ_SESSION_ID` into the captured env of the process whose ledger
you're attributing. So env is **not** the telemetry fix for the orchestrator's own cost — the
registry read (a) is.

**What env IS still good for (worth doing, different reason):** `eval "$(pij adopt … --export)"`
fixes **pij's own self-resolution** in that shell going forward — `resolveSelf`
(`core/discovery.ts:69`) reads `PIJ_SESSION_ID`, which an adopted pane never gets set today
(discovery even tells the user to export it manually, `discovery.ts:102`). It also tags any
**children** spawned from that shell. Both are real ergonomic wins; neither is the orchestrator's
own-telemetry fix.

### The actual bug to fix in #2
adopt's session-id resolution is **claude-shaped**: `resolveAdoptSessionId(CLAUDE_CODE_SESSION_ID,
stemsNewestFirst)` (`cli.ts:752`) keys on `CLAUDE_CODE_SESSION_ID` + newest **claude** transcript
stem. For an adopting **copilot** or **codex** orchestrator that resolution won't find the right
inner session id — so (a) silently degrades to a pending/blank `harnessSessionId` exactly for the
non-claude orchestrators telemetry cares about. Make it harness-aware, reusing the daemon's
existing per-harness discovery (`transcriptLayout(harness)` in `core/harness/transcript.ts:59`;
copilot = newest `~/.copilot/session-state/<id>`, codex = newest rollout uuid). *(Confirm the
current copilot/codex adopt behaviour before sizing — I read the claude path in full but inferred
the non-claude degradation from the resolver signature.)*

**Effort:**
- Registry-join path (a): **~0 code** if adopt resolves the id correctly for the harness.
- Harness-aware adopt resolution (the real fix): **S–M (~half-day)**, mostly reusing
  `transcriptLayout`.
- `pij adopt --export` / `pij whoami --env` ergonomic sugar: **XS (~1–2h)**.

---

## What I'd do differently (recommendations)

1. **Don't build env archaeology into telemetry — read `~/.pij/*.json`.** The join key is already
   captured deterministically for every spawned peer AND every adopted orchestrator.
2. **Make `pij sessions --json` the primary mechanism** (feature #1's surface) — it serves both
   features, works for read-only peers, and needs no shell ceremony or running-process env.
3. **Fix adopt's per-harness session resolution** — that's the one genuine code bug blocking
   non-claude orchestrator self-identity, and it's a reuse of daemon code, not new logic.
4. **Add `--export` as sugar, not as the fix** — it repairs pij self-resolution + child tagging in
   the adopted shell, but call out in the docs that it can't retro-tag the running orchestrator.
5. **Codex keys on `transcriptPath` (abs), not the uuid** — already persisted; make sure the
   telemetry join uses it for codex and `harnessSessionId` for the rest.

Net: **#1 is a projection verb (S), #2 is one harness-aware resolver fix (S–M) + optional env
sugar (XS)** — no registry schema change, no daemon bind-flow change. The heavy lifting (capturing
the id at bind, per-harness) already shipped in Plan 019.
