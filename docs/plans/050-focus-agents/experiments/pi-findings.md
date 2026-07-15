# pi forkability — findings (s050, experiment 1 of 4)

**Verdict: FORKABLE.** pi supports true native-session forking: an immutable
self-contained `.jsonl` snapshot forks into an independent new session (new
UUID) that recalls the donor's full context verbatim, leaves source + snapshot
byte-unchanged, and stays isolated from sibling forks.

- **Date**: 2026-07-14 · **pi**: 0.80.6 · **Runner**: gpt-5.6-sol @ max (this peer)
- **Probe model**: `github-copilot/claude-haiku-4.5`, `--thinking off`, all
  discovery/context/tools disabled (`--no-tools --no-extensions --no-skills
  --no-prompt-templates --no-themes --no-context-files`)
- **Boot**: canonical MAIN checkout `/Users/jordanknight/pi-hacking/pij` (worktree
  pi boot impossible — issue #21). All probe sessions isolated to
  `.harness/temp/s050/pi-sessions/` via `--session-dir` (+ `PI_CODING_AGENT_SESSION_DIR`).
- **Evidence**: `.harness/temp/s050/snapshots/pi/` (command logs, transcripts,
  SHA-256s, session-file diffs). File refs below are in that dir.

## Mechanism (verified, not just documented)

- **Fork flag**: `pi --fork <path|id>` forks a session *file or partial UUID*
  into a **brand-new session with a new id**. Works headless in `--print` mode
  and composes cleanly with `--session-dir` (both forks landed in the isolated
  store).
- **Fork writes a new file**, `<ts>_<new-uuid>.jsonl`, and records
  `parentSession=<absolute path of the forked snapshot>` in its session header
  — a one-way back-pointer to the source. The donor is never opened for write.
- **Session file** = plain JSONL, one dir per encoded cwd, self-contained:
  header (`type=session`; keys `cwd,id,timestamp,type,version:3`) + event lines
  (`model_change`, `thinking_level_change`, `message`…), each with `parentId`
  forming the in-file DAG. `11-fork-lineage.txt`.
- **Recorded cwd travels with the snapshot**: both forks inherited
  `cwd=/Users/jordanknight/pi-hacking/pij` from the donor header; it is recorded,
  not enforced at boot.

## 9-step ritual — results

| # | Step | Result | Evidence |
|---|------|--------|----------|
| 1 | Locate live session | donor id `66748c1e…`, file `…_66748c1e….jsonl` | `03-sessions-after.txt`, `04-donor-file.txt` |
| 2 | Plant golden token + 3-part fact | `STORED GOLDEN-s050-pi-a7f3c9 \| ORBIT=cerulean \| COUNT=731 \| MASCOT=ibis` | `03-plant-transcript.txt` |
| 3 | Settle & flush | file written, 5 lines, 1532 B, mtime past plant start | `03-plant-timing.txt`, `04-donor-file.txt` |
| 4 | Snapshot + SHA-256 | `e158f045b367f8730dc2b7803b334203acef539491321ee296cf68331e123c03` | `04-donor-snapshot.jsonl(.sha256)` |
| 5 | Fork | new session **new id** `019f6027…`, own file, `parentSession=` snapshot | `06-fork1-meta.txt` |
| 6 | Cold recall canary | `RECALL GOLDEN-s050-pi-a7f3c9 \| ORBIT=cerulean \| COUNT=731 \| MASCOT=ibis` (verbatim) | `06-fork1-recall.txt` |
| 7 | Immutability re-hash | snapshot SHA **unchanged**; donor byte-identical to snapshot (source untouched) | `07-immutability.txt` |
| 8 | Isolation (2nd fork, different fact) | fork-2 `019f6028…` learns `vermilion/204/heron`; snapshot + fork-1 hashes unchanged; fork-1 resume still recalls **original** | `08-09-isolation-liveness.txt`, `08-fork1-resume-recall.txt`, `10-contamination-crosscheck.txt` |
| 9 | Source-liveness | donor resumes, recalls **only its own** `cerulean/731/ibis`; zero fork-2 markers | `09-donor-resume-recall.txt`, `10-contamination-crosscheck.txt` |

**Contamination matrix** (`10-contamination-crosscheck.txt`) — clean separation:

```
role   a7f3c9 cerulean  b9d1 vermilion heron
DONOR    3      3         0     0        0     <- only its own history
FORK1    4      4         0     0        0     <- donor lineage, no fork-2 bleed
FORK2    2      2         2     2        2     <- inherits donor + adds its own
```

## FORK vs RESUME (sharp distinction observed)

- **`--fork`** → new id, new file, `parentSession` back-pointer, **source file
  never mutated** (donor stayed at SHA `e158f045…` across both forks).
- **`--session <path>` (resume)** → appends to the *same* file. Confirmed in
  step 9: resuming the donor to prove liveness grew its file (hash changed to
  `981f2a5a…`) — expected, and it still contained only its own history. So a
  focus-launch must **fork, never resume**, if the source must stay pristine.

## Secret boundary (`05-secret-boundary.txt`)

- **No secrets in the session file.** Zero matches for
  api-key/secret/bearer/oauth/`sk-`/`ghp_`/`gho_`/password/authorization/
  access-token. No ALLCAPS env-var-shaped keys. The only two `token`
  occurrences are our own probe token.
- **Plaintext identity present**: header `cwd` (absolute path) and session `id`.
  `focus save` should treat these as identity metadata (path disclosure), but
  there is **no credential leakage** — provider auth is resolved at runtime from
  env/keychain, never persisted to the jsonl.

## Lifecycle prereqs + relaunch canary (`12-lifecycle-prereqs.txt`)

**A cold `pij focus launch` needs:** (1) the snapshot `.jsonl` (self-contained);
(2) a writable `--session-dir` to fork into; (3) model+provider auth resolvable
at relaunch (not in the file). **Not needed:** the donor running/present, any
registry/index entry (pi discovers by path or partial-UUID), or a matching cwd.
**Caveat:** must boot from the canonical main checkout, not a worktree (issue #21).

**Relaunch canary** (run before trusting/delivering to a fork):

```
pi --print --fork <snapshot> --session-dir <iso> <model/tools flags> \
  'Cold recall. Output one line: RECALL <golden-token> | <fact1> | <fact2> | <fact3>'
# PASS iff stdout == the exact planted line (verbatim token + all 3 facts);
# else treat as NOT-RESTORED and fall back to degraded transcript replay.
```

## Containment (`13-containment.txt`, `13b-containment-note.txt`)

- MAIN checkout `git status --porcelain` **byte-identical before/after** →
  `MAIN_DIFF_UNCHANGED=PASS`. All writes landed under the worktree fence
  (`.harness/temp/s050/**` + this report). The lone `s050` name-match in the
  grep (`government/briefs/s050-focus-agents.md`) is a **pre-existing untracked
  brief**, present in the pre-run baseline and unchanged — not a probe artifact.

## Surprises / notes for the roll-up

- `--fork` + `--session-dir` compose without friction; both forks isolated cleanly.
- Fork records `parentSession` (provenance is free — no external index needed).
- Fork inherits the donor's recorded `cwd`; harmless in print mode but worth
  noting if a future launch relies on cwd-derived behavior.
- No blockers hit; every step passed on first execution. Verdict **FORKABLE**
  with high confidence (live-proven, not doc-inferred).
