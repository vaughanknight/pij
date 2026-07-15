# claude forkability — findings (s050, experiment 2 of 4)

**Verdict: FORKABLE.** claude supports true native-session forking: an immutable
self-contained `.jsonl` transcript forks (via `--resume … --fork-session
--session-id <new>`) into an independent new session that recalls the donor's
full context verbatim, leaves the source **byte-unchanged**, and stays isolated
from sibling forks. **One sharp caveat vs pi:** claude has *no* absolute-path
fork — `--resume` is scoped to the launch **cwd's** project dir, so a cold
relaunch must first **materialize** the snapshot into that dir (recipe below).

- **Date**: 2026-07-14 · **claude**: 2.1.209 (Claude Code) · **Runner**: opus-4.8 (this peer)
- **Probe model**: `claude-haiku-4-5-20251001`, headless `-p/--print`, stdin `</dev/null`
- **Boot**: this peer booted from canonical MAIN `/Users/jordanknight/pi-hacking/pij`.
  All probe sessions run from scratch cwds under `.harness/temp/s050/` so they land
  in dedicated `~/.claude/projects/<enc>/` dirs, never real sessions (all removed after).
- **Evidence**: `.harness/temp/s050/snapshots/claude/` (transcripts, SHA-256s, hash
  diffs, contamination matrix, canary). File refs below are in that dir.

## Worktree boot (issue #21 question — answered)

**claude boots fine from the worktree — no pi-style #21 doubling.** A headless
probe run with cwd inside the s050 worktree returned `WORKTREE-BOOT-OK`, exit 0.
claude does not use pi's extension system, so it has no worktree-doubling problem;
cwd only affects which per-project session dir is used, never boot itself.

## Mechanism (verified, not just documented)

- **Fork flag**: `claude --resume <id> --fork-session --session-id <new>` boots a
  **brand-new session (new id, new file)** seeded with the donor's full transcript.
  `--fork-session` alone = "When resuming, create a new session ID." Composes with
  headless `-p`. Deterministic: `--session-id` pins the fork's id exactly.
- **Fork does NOT mutate the source** — donor `.jsonl` stayed at SHA `2b0ae703…`
  across **two** independent forks (`07-immutability.txt`, `08-post-fork2-hashes.txt`).
- **Fork rewrites lineage — no back-pointer.** Every line in the fork file carries
  the **fork's own** `sessionId`; the donor id appears **0 times** (`grep`=0). Unlike
  pi's `parentSession=` provenance record, **claude forks keep no reference to the
  donor** — provenance must be tracked externally if focus needs it.
- **Session file** = plain JSONL, one dir per **cwd-encoded** project path,
  self-contained. Observed top-level keys: `type, sessionId, uuid, parentUuid,
  leafUuid, cwd, gitBranch, message, content, timestamp, version, entrypoint,
  permissionMode, promptId, userType, isSidechain, …`. Line `type`s seen: `user`,
  `assistant`, `attachment`, `queue-operation`, `ai-title`, `last-prompt`
  (`05-secret-boundary.txt`).
- **Resolution is by FILENAME uuid, not internal `sessionId`.** A snapshot whose
  internal `sessionId` differs from its filename still resumes by the **filename**
  id (`11e-filename-vs-internal.txt`) — focus can rename snapshots freely.

## 9-step ritual — results

| # | Step | Result | Evidence |
|---|------|--------|----------|
| 1 | Locate live session | donor `d153f3a4…`, file under `…/<enc>/d153f3a4….jsonl` | `01-donor-id.txt`, `03-donor-file-path.txt` |
| 2 | Plant golden token + 3-part fact | `STORED GOLDEN-s050-claude-k4d8e2 \| ORBIT=marigold \| COUNT=418 \| MASCOT=quokka` | `02-plant-transcript.txt` |
| 3 | Settle & flush | file written, 10 lines, 17 970 B, token present ×4 | `03-plant-timing.txt` |
| 4 | Snapshot + SHA-256 | `2b0ae703b875a181bed8afc365f939ecf3e0dec07b785ae1073108e0286dfac5` | `04-donor-snapshot.jsonl(.sha256)` |
| 5 | Fork | fork-1 **new id** `345d39fa…`, own file, source id absent from it | `05-fork1-*`, `06-fork1-recall.txt` |
| 6 | Cold recall canary | `RECALL GOLDEN-s050-claude-k4d8e2 \| ORBIT=marigold \| COUNT=418 \| MASCOT=quokka` (verbatim) | `06-fork1-recall.txt` |
| 7 | Immutability re-hash | source SHA **unchanged** (`2b0ae703…`); byte-identical to snapshot | `07-immutability.txt` |
| 8 | Isolation (2nd fork, diff fact) | fork-2 `570d05b0…` learns `viridian/205/numbat`; snapshot + donor still `2b0ae703…`; fork-1 still recalls **original** | `08-*`, `10-contamination-matrix.txt` |
| 9 | Source-liveness | donor resume recalls **only its own** `marigold/418/quokka`; zero fork-2 markers | `09-donor-resume-recall.txt` |

**Contamination matrix** (`10-contamination-matrix.txt`) — clean separation
(counts = occurrences of each fact-set in the session `.jsonl`):

```
role      GOLD1  marigold  quokka    GOLD2  viridian  numbat
DONOR         4         4       4        0         0       0   <- only its own history
FORK1         4         4       4        0         0       0   <- donor lineage, no fork-2 bleed
FORK2         3         3       3        3         3       3   <- inherits donor + adds its own
GOLD1/marigold/quokka = donor's own facts; GOLD2/viridian/numbat = fork2-only
```

## FORK vs RESUME (sharp distinction observed)

- **`--fork-session`** → new id, new file, **source byte-unchanged** (donor held
  SHA `2b0ae703…` across both forks).
- **`--resume <id>` without `--fork-session`** → appends to the *same* file. Proven
  in step 9: resuming the donor to prove liveness changed its SHA
  `2b0ae703…` → `0f36a1dd…` (`09-donor-hash-before/after.txt`), while still
  containing only its own history. **A focus-launch must fork, never bare-resume,**
  if the source must stay pristine.

## Cross-cwd portability — the key claude-specific constraint

Unlike pi's cwd-agnostic `--fork <absolute-path>`, **claude keys sessions by
project dir (cwd)** and `--resume <id>` resolves **only within the current cwd's
project dir**:

- Bare `--resume <donor>` from a *different* cwd → `No conversation found with
  session ID …` (`11-crosscwd-resume.txt`).
- **Workaround verified** (`11d-relocate-correct-enc.txt`): copy the snapshot into
  the launch-cwd's project dir and it forks with verbatim recall. The project-dir
  encoding maps **both `/` and `.`** to `-` (e.g. `/a/.b` → `-a--b`). Getting this
  encoding wrong (dot preserved) silently fails as "No conversation found"
  (`11c` — my first wrong-encoding attempt).

## Secret boundary (`05-secret-boundary.txt`)

- **No secrets in the session file.** Zero matches for
  `sk-ant / sk- / ghp_ / gho_ / api[_-]?key / secret / bearer / oauth / password /
  authorization / access[_-]?token / ANTHROPIC_API_KEY`. Provider auth is resolved
  at runtime from `~/.claude/.credentials.json` / env / keychain — never persisted
  to the jsonl.
- **Plaintext identity present**: `cwd` (absolute path) and `gitBranch` are embedded
  per event. `focus save` should treat these as identity/path-disclosure metadata
  (esp. `gitBranch` — a leak pi's session file does not carry), but there is **no
  credential leakage**.

## Lifecycle prereqs + relaunch canary (`12-lifecycle-canary.txt`)

**A cold `pij focus launch` needs:** (1) the snapshot `.jsonl` (self-contained);
(2) it **materialized into the launch-cwd project dir**
`~/.claude/projects/<enc>/<uuid>.jsonl` (enc = launch cwd with `/` **and** `.` → `-`;
resolves by **filename** uuid); (3) model + provider auth resolvable at relaunch.
**Not needed:** donor running, a matching internal `sessionId`, or the original cwd.

**Relaunch canary** (run before trusting/delivering to a fork):

```
ENC=$(printf '%s' "$LAUNCH_CWD" | sed 's/[\/.]/-/g')
cp "$SNAPSHOT" ~/.claude/projects/$ENC/$SRCID.jsonl
cd "$LAUNCH_CWD" && claude -p --resume "$SRCID" --fork-session \
  --session-id "$FORKID" --model "$MODEL" \
  'Cold recall. One line: RECALL <golden-token> | <fact1> | <fact2> | <fact3>' </dev/null
# PASS iff stdout == the exact planted line (verbatim token + all 3 facts);
# else NOT-RESTORED -> fall back to transcript replay / summary hand-off.
```

## Containment (`13-containment.txt`)

- MAIN checkout `git status --porcelain` **byte-identical before/after** →
  `MAIN_DIFF_UNCHANGED=PASS`. All writes landed under the worktree fence
  (`.harness/temp/s050/**` + this report).
- All 3 probe project dirs I created under `~/.claude/projects/` were **removed**
  after the run; no pre-existing session was touched. Evidence retained in
  `snapshots/claude/`.

## Surprises / notes for the roll-up

- **FORKABLE, same tier as pi** — steps 5–9 all passed first try; immutable-snapshot
  + independent-fork semantics confirmed live.
- **Two claude-specific deltas from pi that focus-launch MUST handle:**
  1. **No absolute-path fork** — snapshot must be materialized into the exact
     cwd-encoded project dir (`/` and `.` → `-`) before `--resume` sees it.
  2. **No `parentSession` back-pointer** — fork rewrites all `sessionId`s to its own;
     provenance/lineage must be tracked by focus externally, not read from the file.
- **`gitBranch` is embedded** in the session file (pi's is not) — extra path/context
  disclosure for `focus save` to consider, though still no credentials.
- claude **boots fine from a worktree** (no #21) — cwd choice is purely a
  session-scoping decision, not a boot blocker.
