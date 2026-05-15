# PLAN: Build `docs/difficulties-summary.md` (Ralph Loop trial #1)

This is the first real-flight plan for `ralph-loop`. The work is bounded,
pure-derivative (we DO NOT modify `docs/difficulties.md`), and every task
is small enough to fit in one iteration.

The source data is the table in `docs/difficulties.md` (rows D-001 to D-028).

The output is a NEW file at `docs/difficulties-summary.md` that gives at-a-glance
views without forcing the reader to scroll the wide source table.

## Constraints

- Do NOT modify `docs/difficulties.md` (read-only source).
- One small task per iteration. Use `edit` to add sections to the summary
  file incrementally; don't re-write the whole file each iteration.
- Use ISO date format (YYYY-MM-DD) for the "last regenerated" stamp.
- Sort count tables by count descending.

## Tasks

- [x] Create `docs/difficulties-summary.md` with: a top-level `# Difficulties — summary` heading, then a 2-line preamble noting (a) this is a derived view of `docs/difficulties.md` and (b) a "Last regenerated: YYYY-MM-DD" line using today's UTC date. No other content yet.
- [x] Add a `## By severity` section with a 2-column markdown table (Severity | Count) listing each unique severity value found in `docs/difficulties.md` and how many rows carry it. Sort by count descending. Normalise variants (e.g. `**high** — escalated from D-017` counts as `high`).
- [x] Add a `## By status` section with a 2-column markdown table (Status | Count). Group canonically: `open (upstream)` and `open (skill-side encoding pending)` both fold under `open`. Sort by count descending.
- [x] Add a `## High-severity entries (still open)` section listing each row whose severity is `high` AND whose status starts with `open` (i.e. NOT `encoded` or `mitigated`). Format each entry as `- **D-NNN**: <truncated description, ≤ 80 chars>`. If there are zero matches, write `_None — all high-severity items resolved or mitigated._`
- [x] Add a `## Recurring themes` section with 3 to 5 bullet themes that recur across the ledger. Each bullet is one sentence and cites 2-3 example D-row IDs. Look for patterns like minih schema drift, workshop lag, fresh-clone fragility, smoke-runner brittleness, planning-skill friction.
