# Coder brief — plan 112: pij verb usage ranking (o-prime authored)

From: pij-dominant-vicuna (o-prime). Reply form: `pij send pij-dominant-vicuna "<msg>"`.
ACK with objections or "ack clean" BEFORE building. Load BOTH the /pij and /builder skills.

## Mission
One re-runnable script + one report answering: **of the TS pij verbs that pij-rs does NOT
yet implement, which are actually used most, in real usage on this machine?** Output = a
ranked implement-next table Jordan can read in one screen.

## Scope
- Worktree: /Users/jordanknight/pi-hacking/pij-worktrees/s112-verb-usage, branch s112/verb-usage-telemetry.
- Deliverables (committed): `tools/verb-usage/scan.py` (or .sh+py; no new deps beyond
  python3 stdlib + sqlite3), `docs/plans/112-verb-usage/report.md` (the ranked table +
  method + caveats), this brief updated with receipts.
- Done bar: PR open against main, GitHub CI green. Do NOT merge.
- Forbidden: everything outside tools/verb-usage/ + docs/plans/112-verb-usage/; never
  touch crates/, .harness/, the-flow files. READ-ONLY access to the telemetry stores —
  open the SQLite DBs read-only (`file:...?mode=ro`); never write to ~/.pij, ~/.git-ai, ~/.omp.

## Method (from pij-respectable-clam's interview, 2026-08-31 — treat as the map, verify each store exists before relying on it)
Full detail: /Users/jordanknight/substrate/harness-engineering/scratch/answers/pij-verb-usage-telemetry-brief.md (read it).
Sources, ranked:
1. PRIMARY: `~/.pij/<seat>/events.ndjson` — pij's own ledger, per seat, first-class events, harness-independent.
2. Cross-check: `~/.git-ai/internal/bash-checkpoints-db` (SQLite, `bash_checkpoint_calls`, verbatim `pij ...` strings, 30-day window).
3. Deep history: `~/.git-ai/internal/metrics-db` (SQLite 3.7GB, `metrics` where event_kind=5; claude dialect `v0.message.content[].input.command`; copilot dialect `v0.type=="tool.execution_start"`, name under `v0.data.toolName`). Back to 2026-04.
4. omp transcripts `~/.omp/agent/sessions/**/*.jsonl` — pij calls are IN-PROCESS tools disguised as `{name:"write", arguments.path:"xd://pij_send"}`: decode name==write && path startswith xd:// -> real verb = path suffix. Miss this and omp usage counts ZERO.
Skip refs/harness-telemetry/* (counts-only, frozen, no pij data).

MUST-HANDLE gotchas (each one silently corrupts the ranking):
- Claude metrics-db duplicates: same message.id up to 4x — first-occurrence dedupe.
- Invalid/guessed flags print help and exit 0 — filter obvious help-print invocations where detectable (e.g. bash-db rows whose output starts with usage text, if output is captured; otherwise note the limit).
- Nothing is repo-scoped: report BOTH machine-wide counts AND a pij-fleet-filtered view (cwd under ~/pi-hacking/pij*), labeled.
- Parse the VERB (and subcommand leaf where present): `pij send`, `pij orchestration baton grant`, etc. Normalize `pij-rs` invocations separately (they tell us what rs already absorbs).
- Prior art: flowspace3 `scratch/reconstruct/scripts/reconvo.py` + `tool-costs.py` have working readers for all four stores (claude dedupe, copilot dialect, xd:// remap). EXTEND/crib their parsing, do not reinvent; cite what you took.

## The comparison list
- TS verb inventory: derive from `.pi/extensions/pij/core/cli.ts:760` (FAMILY_SUBCOMMANDS), `:848` (ALLOWED_FLAGS), `.pi/extensions/pij/cli.ts:4286-4373` — cross-check against `scratch/pij-rs-verb-parity.md` (fresh 2026-08-31) in the MAIN checkout /Users/jordanknight/pi-hacking/pij (scratch/ is git-ignored, read it from there).
- rs verb inventory: derive from CURRENT `crates/cli/src/main.rs` in YOUR worktree (do NOT trust the parity doc's rs column — it predates the revive verb landing).
- Report table columns: verb/leaf | total uses | uses last 30d | distinct seats | in rs today? | rank. Ranked view filtered to NOT-in-rs is the headline table.

## Honesty rules
- Every count in the report names the store(s) it came from; where stores disagree, show both numbers, do not average.
- A store you could not read (missing, locked, too big to scan in time) is a LABELED gap in the report, not a silent zero. For metrics-db (3.7GB) an indexed/LIMITed scan strategy is fine — say what you scanned.
- The script must be re-runnable by anyone: `python3 tools/verb-usage/scan.py --out report.md`, no hardcoded seat names.
