# copilot forkability — findings (s050, experiment 3 of 4)

**Verdict: FORKABLE (degraded — filesystem fork, no native flag).** copilot has
**no `--fork`**; a session is resumed in place by `--resume`/`--session-id`/
`--continue`. BUT a session is a **self-contained directory**
(`~/.copilot/session-state/<uuid>/`) and `--resume=<id>` rebuilds context **from
that directory alone** — no global-db row required. So a true immutable-snapshot
fork is achievable as a **filesystem operation**: copy the dir to a new UUID,
**rewrite the internal `sessionId`**, and `--resume=<newid>`. That fork recalls
the donor's full context verbatim, leaves the donor **byte-unchanged**, gets its
**own** global-db identity, stays isolated from sibling forks, and is portable
into a pristine `COPILOT_HOME`. **The one sharp caveat vs pi/claude:** the session
id is embedded *inside* `events.jsonl`; skip the rewrite and the fork's new turns
are mis-attributed to the **donor's** id in the global `session-store.db`.

- **Date**: 2026-07-14 · **copilot**: GitHub Copilot CLI **1.0.71-0** · **Runner**: claude-opus-4.8 (this peer)
- **Probe model**: `claude-haiku-4.5`, headless `-p`, `--available-tools=none`
  (tools OFF → recall is **conversational only**, never a tool-persisted SQL row — see Surprises)
- **Boot**: this peer booted from canonical MAIN `/Users/jordanknight/pi-hacking/pij`.
  **Every probe is isolated via `COPILOT_HOME`** pointed at
  `.harness/temp/s050/copilot-scratch/home-*`, so the real `~/.copilot` store is
  never a probe target. Auth in the isolated home via `GH_TOKEN=$(gh auth token)`.
- **Evidence**: `.harness/temp/s050/snapshots/copilot/` (transcripts, SHA-256s,
  contamination matrix, schemas, canary). File refs below are in that dir.

## Worktree boot (issue #21 question — answered)

**copilot boots fine from the worktree — no pi-style #21 doubling.** A headless
probe with cwd = the s050 worktree **root** returned `WORKTREE-BOOT-OK`, exit 0,
and its `workspace.yaml` recorded `cwd`/`git_root` = the worktree,
`branch: s050/focus-agents`, `repository: AI-Substrate/pij`. copilot has no
pi-style extension loader, so a worktree is just another cwd — not a boot blocker.

## Storage model (verified) — a DIRECTORY, not a file

Unlike pi/claude (one `.jsonl` per session), copilot stores each session as a
**self-contained directory** `~/.copilot/session-state/<uuid>/`:

| Artifact | Role |
|---|---|
| `events.jsonl` | **authoritative** append-only event stream (`session.start`, `user.message`, `assistant.message`, `session.resume`, `session.shutdown`, …). Embeds `data.sessionId`. |
| `session.db` | per-session SQLite — **only** `todos`/`todo_deps`/`inbox_entries` (+ any table the model itself creates). **Not** conversational memory. |
| `workspace.yaml` | metadata: `id`, `cwd`, `git_root`, `repository`, `branch`, `name`, `created_at`, `mc_task_id`, `mc_session_id`. |
| `checkpoints/` `files/` `research/` `rewind-snapshots/` | aux state (empty for simple sessions). |
| `inuse.<pid>.lock` | **liveness marker** — present only while a pid holds the session. |

Separately, a **global** `~/.copilot/session-store.db` (SQLite) is a **lazy index/
mirror** across all sessions: `sessions` (id/cwd/repo/branch/summary), `turns`
(user/assistant per turn), `checkpoints`, `session_files`, `assistant_usage_events`,
and an FTS5 `search_index`. **It is rebuilt/appended on demand and is NOT a
prerequisite for resume** (proven: portability test §Lifecycle). `03-*-schema.sql`.

## Mechanism (verified, not just documented)

- **No fork flag.** Session flags are `-r/--resume[=id|prefix|name]`,
  `--session-id <id>` ("resume existing **or** set the UUID for a new session"),
  and `--continue` (most-recent). All **resume in place**.
- **`--resume=<id>` resolves by the session-state DIR** (dir name = UUID) and
  rebuilds context from that dir's `events.jsonl`. A **copied dir with no
  global-db row still recalls** (`06-mechB-recall.txt`, and the fresh-home
  portability test). `--session-id=<existing-id>` resumes an existing dir
  identically (`06c-sessionid-resume-existing.txt`).
- **The fork recipe** (`fork.sh` in scratch): `cp -R <donor-dir> <newid-dir>` →
  rewrite the donor UUID → new UUID inside `events.jsonl` (the `data.sessionId`
  occurrences) → patch `workspace.yaml: id` → `copilot --resume=<newid>`.
- **`session.db` needs no rewrite** (holds no session id); the donor UUID lives
  in `events.jsonl` as `data.sessionId` (3 occurrences here) — a blind
  string-replace is safe because per-event `id`/`parentId` are distinct UUIDs.

## 9-step ritual — results

Golden token `GOLDEN-s050-copilot-x9k2m7`; facts `ORBIT=amber | COUNT=592 | MASCOT=platypus`.

| # | Step | Result | Evidence |
|---|------|--------|----------|
| 1 | Locate live session | donor id `d0110d0e…0001`, dir `session-state/<id>/`, `events.jsonl` + `session.db` + `workspace.yaml` | `04-donor-workspace.yaml` |
| 2 | Plant golden token + 3-part fact | model confirmed `x9k2m7 \| amber \| 592 \| platypus` (tools OFF) | `02-plant-transcript.txt` |
| 3 | Settle & flush | `events.jsonl` written (`session.shutdown` on `-p` exit); global `turns` row `turn_index=0` | `03-event-type-inventory.txt` |
| 4 | Snapshot + SHA-256 | events `101060e6…9322e`; dir-tar `d49e8af1…7ad81` | `04-donor-events-sha256.txt`, `04-donor-tar-sha256.txt`, `04-donor-snapshot.tar` |
| 5 | Fork (copy dir + rewrite id) | fork **new id** `f0110d0e…f01`, own dir, internal id rewritten (donor-hits=0), **no** global-db row pre-resume | `06b-mechBprime-recall.txt` |
| 6 | Cold recall canary | `RECALL GOLDEN-s050-copilot-x9k2m7 \| ORBIT=amber \| COUNT=592 \| MASCOT=platypus` (verbatim) | `06b-mechBprime-recall.txt` |
| 7 | Immutability re-hash | donor events **unchanged** `101060e6…`; dir-tar byte-identical (89 600 B) after fork ran | `04-donor-events-sha256.txt` |
| 8 | Isolation (2nd fork, diff fact) | fork-2 `f0110d0e…f02` learns `GOLDEN2…f2z8w / teal / 308 / wombat`; fork-1 recall stays `amber/592/platypus` only | `08-fork2-plant2.txt`, `08d-fork1-isolation-recall.txt`, `10-contamination-matrix.txt` |
| 9 | Source-liveness | donor resume recalls **only its own** `amber/592/platypus`; zero fork-2 markers | `09-donor-liveness-recall.txt`, `10-contamination-matrix.txt` |

**Contamination matrix** (`10-contamination-matrix.txt`) — counts of each fact in
each session's `events.jsonl`:

```
role       x9k2m7  amber platypus |    f2z8w  teal wombat
DONOR           3      3        3 |        0     0      0   <- only its own history
FORK1           4      4        4 |        0     0      0   <- donor lineage, no fork-2 bleed
FORK2           3      3        3 |        2     2      2   <- inherits donor + adds its own
x9k2m7/amber/platypus = donor's facts; f2z8w/teal/wombat = fork2-only
```

## FORK vs RESUME (sharp distinction observed)

- **Fork (copy dir + rewrite id)** → new id, new dir, donor dir **byte-unchanged**
  (`101060e6…` held across both forks) and donor's **global-db identity untouched**.
- **`--resume=<donor>` (in place)** → appends to the donor dir: step-9 liveness
  resume grew the donor `events.jsonl`, hash `101060e6…` → `827801ea…`
  (`09-donor-posthash.txt`), while the snapshot tar stayed `d49e8af1…`. **A
  focus-launch must fork (copy+rewrite), never bare-resume the donor**, if the
  source must stay pristine.

## The copilot-specific gotcha — identity leak without the rewrite

Copy the dir but **skip** the `sessionId` rewrite (patch only `workspace.yaml`):
recall still works, and the donor **file** stays byte-identical — **but** the
fork's new turn is written to the global `session-store.db` under the **donor's**
id, not the fork's (`06-mechB-recall.txt` → donor showed a phantom `turn_index=1`).
Because identity is embedded in `events.jsonl` (`data.sessionId`), a clean fork
**must** rewrite it. With the rewrite, attribution is clean: donor keeps `turn 0`,
fork owns its own `turn 0` (`06b-mechBprime-recall.txt`).

## Secret boundary (`05-secret-boundary.txt`)

- **No credential values.** The actual `gh auth token` value appears **0 times**
  anywhere in any session dir. Provider auth is resolved at runtime
  (`GH_TOKEN`/`gh`/keychain), never persisted.
- **But the dir embeds the full context surface:** `events.jsonl` carries the
  entire injected **system prompt + `AGENTS.md`/custom-instruction text** (that is
  why `API_KEY`/`secret` appear — as prose: `…env-var references like
  ${PERPLEXITY_API_KEY}, never plaintext secrets…`), and `workspace.yaml` carries
  `cwd`, `git_root`, `branch`, `repository`, `mc_task_id`, `mc_session_id`.
  `focus save` should treat a copilot session dir as **identity/context disclosure**
  (paths, branch, repo, mission-control ids, and whatever instructions were loaded)
  — no secrets, but not neutral.

## Lifecycle prereqs + relaunch canary (`12-portability-freshhome-recall.txt`)

**A cold `pij focus launch` needs:** (1) the **session-state dir** (self-contained:
`events.jsonl` + `workspace.yaml` + `session.db`) with its internal `sessionId`
**rewritten** to the new UUID; (2) a writable `COPILOT_HOME` to drop it under
`session-state/<newid>/`; (3) `GH_TOKEN`/`gh` auth + the model resolvable at
relaunch. **Not needed:** the donor running, **any global `session-store.db` row**
(copilot lazily creates the whole global db — proven by resuming a dir dropped
into a **pristine, empty `COPILOT_HOME`**), or a matching cwd.

**Relaunch canary** (run before trusting/delivering to a fork):

```
# SNAPDIR = saved session-state dir; SRCID = its old uuid; FORKID = new uuid
cp -R "$SNAPDIR" "$COPILOT_HOME/session-state/$FORKID"
sed -i '' "s/$SRCID/$FORKID/g" "$COPILOT_HOME/session-state/$FORKID/events.jsonl"
sed -i '' "s/^id: .*/id: $FORKID/" "$COPILOT_HOME/session-state/$FORKID/workspace.yaml"
GH_TOKEN=$(gh auth token) copilot --resume="$FORKID" -p \
  'Cold recall. One line: RECALL <golden-token> | <fact1> | <fact2> | <fact3>' \
  --allow-all --model <m> --available-tools=none -s --no-color
# PASS iff stdout == the exact planted line (verbatim token + all 3 facts);
# else NOT-RESTORED -> fall back to transcript replay / summary hand-off.
```

## Containment (`main-baseline-copilot.txt`)

- MAIN checkout non-government tracked-diff SHA **recomputed byte-identical** to the
  pre-run baseline (`749550124f…c1e6`) → `MAIN_UNCHANGED=PASS`. All writes landed
  under the worktree fence (`.harness/temp/s050/**` + this report).
- **Real `~/.copilot` store clean of probes:** zero probe session dirs
  (`d0110/f0110/c0110`), and the **unique** probe tokens (`x9k2m7`, `f2z8w`) match
  **0** rows in the real `search_index`. (A single common-word FTS hit on
  "platypus" is an unrelated real session naming a pij peer `pij-planned-platypus`
  — a false positive, not a probe artifact.)
- **Deviation logged & remediated:** the very first plant attempt ran **without**
  `COPILOT_HOME` set (variable defined but not exported) and created one probe
  session in the **real** store. It was fully removed — dir deleted, and its
  `sessions`/`turns`/`assistant_usage_events`/`search_index` rows deleted from the
  live db via a targeted `BEGIN IMMEDIATE` with `busy_timeout` (verified: all
  counts 0, FTS token gone). Every subsequent probe baked `COPILOT_HOME` into the
  sourced env so it could not recur.

## Surprises / notes for the roll-up

- **FORKABLE, but as a filesystem op, not a flag** — the degraded tier vs pi's
  `--fork` / claude's `--fork-session`. A `focus` adapter for copilot is a
  dir-copy + `sed` id-rewrite + `--resume`, not a CLI passthrough.
- **Two copilot-specific deltas a focus-launch MUST handle:**
  1. **Rewrite the internal `sessionId`** in `events.jsonl` or the fork pollutes
     the donor's global-db identity (phantom turns).
  2. **Save the whole DIRECTORY**, not a file — `events.jsonl` + `workspace.yaml`
     (+ `session.db` if the session used SQL/todos).
- **Tools-off was essential for a clean proof.** With tools ON, haiku answered
  "remember this" by **creating a `memory_canary` SQL table** in `session.db` and
  storing the fact there — recall then came from SQL, not conversation. That still
  forks (the dir carries `session.db`), but it confounds a *conversational*-memory
  claim, so the graded ritual used `--available-tools=none`. **Bonus for focus:**
  because the dir carries `session.db`, a fork inherits the donor's **todos, inbox,
  and any model-authored SQL state** too — higher-fidelity than pi/claude's
  transcript-only fork.
- **Global `session-store.db` is disposable** for restore — the per-session dir is
  the only thing worth saving; copilot rebuilds the index lazily.
- No blockers on the core question; every ritual step passed. Verdict **FORKABLE**
  (live-proven), tempered to "degraded/filesystem" by the absence of a native flag
  and the mandatory id-rewrite.
