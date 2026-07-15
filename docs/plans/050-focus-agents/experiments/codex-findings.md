# codex forkability - findings (s050, experiment 4 of 4)

**Verdict: FORKABLE (degraded - resume/copy primitive, no explicit fork flag).**
Codex CLI has no `--fork` flag, but an immutable copied rollout can be resumed
by filename UUID into a fresh continuation rollout that recalls the donor's
context verbatim, leaves the source byte-unchanged, stays isolated from sibling
copies, and works from a pristine `CODEX_HOME`. Unlike pi/claude, the fork id is
not pinned as the running continuation id: `codex exec resume <copied-id>`
selects the copied source, then Codex writes a new generated rollout id for the
continuation.

- **Date**: 2026-07-14 · **codex**: `codex-cli 0.44.0` (`@openai/codex`
  wrapper package 0.144.1)
- **Runner**: pij peer `pij-cloudy-mockingbird`
- **Probe model/auth**: `openai/gpt-4o-mini` through a scratch-only OpenRouter
  provider config (`env_key = "OPENROUTER_API_KEY"`). The isolated `CODEX_HOME`
  had no copied Codex auth; an initial empty-home OpenAI-provider smoke failed
  with 401 as expected.
- **Boot**: s050 worktree
  `/Users/jordanknight/pi-hacking/pij-worktrees/s050-focus-agents`.
  `harness boot` passed (`just typecheck` + `just test` green), and Codex
  probes ran from the worktree without a pi-style worktree boot blocker.
- **Evidence**: `.harness/temp/s050/snapshots/codex/` plus isolated homes
  `.harness/temp/s050/codex-home-*`.

## Mechanism (verified)

- **Storage path**:
  `CODEX_HOME/sessions/<YYYY>/<MM>/<DD>/rollout-<timestamp>-<uuid>.jsonl`.
  The bind/resume selector is the trailing filename UUID.
- **Session file format**: JSONL records with top-level
  `timestamp`, `type`, and `payload`. Observed record types include
  `session_meta`, `response_item`, `event_msg`, and `turn_context`.
- **Resume command**: `codex exec resume <SESSION_ID> <PROMPT>` resumes a prior
  recorded session. Parent `exec` flags such as `--json`,
  `--output-last-message`, and `--skip-git-repo-check` must appear before the
  `resume` subcommand.
- **Copy fork recipe**: copy the donor rollout to the date-nested sessions dir
  with a new trailing UUID in the filename, then run
  `codex exec resume <new-filename-uuid> ...`. No internal JSON rewrite was
  needed. The copied rollout's `session_meta.payload.id` still contained the
  donor id, but Codex resolved the copied rollout by filename UUID.
- **Continuation behavior**: resume does **not** append to the source rollout.
  It writes a new rollout with a generated continuation UUID. Source, copied
  source, and saved snapshot hashes stayed unchanged.

## 9-step ritual - results

Golden token `GOLDEN-s050-codex-r7m4q2`; facts
`ORBIT=indigo | COUNT=847 | MASCOT=lantern`.

| # | Step | Result | Evidence |
|---|------|--------|----------|
| 1 | Locate live session | donor id `019f60a9-867e-76c0-8bf8-031962a6ef9b`, file under isolated `codex-home-ritual/sessions/2026/07/14/` | `03-plant-summary.txt` |
| 2 | Plant golden token + 3-part fact | model returned `STORED GOLDEN-s050-codex-r7m4q2 | ORBIT=indigo | COUNT=847 | MASCOT=lantern` | `03-plant-last-message.txt` |
| 3 | Settle & flush | after 3 seconds, size/mtime/SHA stable; 9 lines, 42,197 B, token present x4 | `04-settle-flush.txt` |
| 4 | Snapshot + SHA-256 | `a444af6f6f876766e0a45b707fe4650fbac416ed079bf6247db08c07505b844a` | `04-donor-snapshot.jsonl`, `.sha256` |
| 5 | Fork | copied snapshot to new filename id `3f29041e-742f-41f0-b868-17753b7b9ced`; resume selected it and created continuation `019f60aa-bc24-7eb3-947d-6b0206cd759d` | `06b-fork1-recall-summary.txt`, `06c-rollout-inventory-after-fork1.txt` |
| 6 | Cold recall canary | `RECALL GOLDEN-s050-codex-r7m4q2 | ORBIT=indigo | COUNT=847 | MASCOT=lantern` verbatim | `06b-fork1-recall-last-message.txt` |
| 7 | Immutability re-hash | snapshot SHA unchanged; copied fork source SHA unchanged | `06b-fork1-recall-summary.txt` |
| 8 | Isolation | fork-2 source copy learned `GOLDEN2-s050-codex-z8p1v5 | ORBIT=teal | COUNT=306 | MASCOT=beacon`; snapshot and fork-1 source hashes unchanged; fork-1 later recalled only the original | `08b-fork2-plant-summary.txt`, `08c-fork1-isolation-last-message.txt`, `05-secret-and-contamination.txt` |
| 9 | Source liveness | donor resume recalled only the original; donor source rollout SHA unchanged | `09-isolation-liveness-summary.txt` |

Contamination counts are clean at the source/copy level:

```text
role                 original token/facts   sibling token/facts
DONOR SOURCE         present                absent
FORK1 SOURCE COPY    present                absent
FORK1 CONTINUATION   present                absent
FORK2 SOURCE COPY    present                absent
FORK2 CONTINUATION   absent                 present
DONOR CONTINUATION   present                absent
```

## FORK vs RESUME

- **Codex resume is source-immutable in these probes.** Resuming either the
  donor id or a copied filename id created a new continuation rollout and did
  not append to the source file. This differs from pi/claude/copilot, where bare
  resume mutates the selected source.
- **No explicit fork flag or deterministic continuation id.** The copied
  filename UUID is the selector, not the id of the new running continuation.
  Codex generated continuation ids such as `019f60aa-bc24-...` and
  `019f60ad-3d10-...`.
- **Filename id beats internal id for selection.** A copied rollout whose
  internal `session_meta.payload.id` remained the donor id still resumed under
  the new filename UUID.
- **Continuation save caveat.** A later probe resuming fork-2's continuation id
  did not reliably recall the sibling token (`11-continuation-resume-summary.txt`).
  Treat the proven primitive as "resume an immutable rollout source into a fresh
  continuation." Do not assume a latest continuation rollout alone is a complete
  focus-save artifact without a canary.

## Portability

A pristine home test passed: copying only the saved snapshot to
`codex-home-fresh/sessions/2026/07/14/rollout-...-ac865313-....jsonl` plus the
scratch provider config was enough for `codex exec resume <copied-id>` to recall
the planted token/facts. No donor process, global index, or pre-existing
`CODEX_HOME` state was required (`12-portability-freshhome-summary.txt`).

## Secret boundary

- **No credential regex hits** in the donor snapshot for API-key, bearer,
  OAuth, GitHub token, password, or access-token patterns
  (`05-secret-boundary-matches.txt`).
- **Probe auth value absent.** The scratch config names `OPENROUTER_API_KEY`
  but does not store its value; the donor snapshot had 0 hits for that env var
  name and 0 hits for `OPENAI_API_KEY`.
- **Instruction/context disclosure is substantial.** The rollout embeds the full
  loaded `AGENTS.md` instructions in `session_meta.payload.instructions`, plus
  absolute `cwd`, sandbox/approval settings, model name, and user prompts.
  It also includes literal env-var names from repo instructions, e.g.
  `PERPLEXITY_API_KEY` appears as prose, not as a value.

## Lifecycle prereqs + relaunch canary

**A cold `pij focus launch` needs:**

1. the source rollout `.jsonl` snapshot;
2. a writable `CODEX_HOME`;
3. the snapshot materialized under
   `CODEX_HOME/sessions/<YYYY>/<MM>/<DD>/rollout-<timestamp>-<selector-uuid>.jsonl`;
4. provider/model auth resolvable at relaunch.

**Not needed:** donor running, an external registry/index, internal id rewrite,
or matching original `cwd` (fresh-home restore worked).

Canary:

```sh
mkdir -p "$CODEX_HOME/sessions/2026/07/14"
cp "$SNAPSHOT" "$CODEX_HOME/sessions/2026/07/14/rollout-<timestamp>-$FORK_SELECTOR.jsonl"
codex --ask-for-approval never --sandbox read-only -C "$LAUNCH_CWD" \
  exec --skip-git-repo-check --output-last-message "$OUT" --json \
  resume "$FORK_SELECTOR" \
  'Cold recall. Output one line exactly: RECALL <golden-token> | <fact1> | <fact2> | <fact3>'
# PASS iff $OUT is the exact planted line; otherwise fall back to degraded replay/summary hand-off.
```

## Containment

- **Probe isolation succeeded.** Every donor/fork/probe Codex invocation used
  `CODEX_HOME` under `.harness/temp/s050/`. The first scratch smoke with an empty
  home wrote a rollout under that scratch home and failed 401; the OpenRouter
  scratch config then succeeded. No probe command wrote a probe rollout to
  `~/.codex`.
- **Real-store byte identity did not hold because of this live peer's own Codex
  transcript.** The before/after real-store inventory had the same file count
  (5,786) but different hashes for Codex state/log/history files and the bound
  peer rollout `019f60a4-c182-7b41-aae1-a4949ab38d2f`
  (`13-real-store-containment.txt`).
- **Own-session leak: yes.** The real `~/.codex` golden-token scan found both
  probe tokens in the bound peer's own rollout, because this research
  conversation and tool calls necessarily contained the tokens. This is not a
  probe `CODEX_HOME` leak, but it violates the desired "real store token-free"
  containment property for a Codex-hosted researcher.
- MAIN checkout was not edited by this worker. The worktree received only the
  allowed report path and `.harness/temp/s050/**` evidence.

## Surprises / notes for roll-up

- Codex is **FORKABLE**, but its primitive is distinctive: copied rollout source
  + `resume`, not an explicit fork flag, and the continuation id is generated.
- Rollout files are source snapshots, not neutral artifacts: they embed loaded
  agent instructions and absolute paths.
- A Codex-hosted research worker cannot keep the real bound Codex session
  token-free if the golden token appears in the prompt/tool transcript. Future
  Codex experiments should either run from a disposable `CODEX_HOME` at the host
  session layer too, or use an out-of-band opaque token file that the parent can
  verify without placing the literal token in the researcher's conversation.
