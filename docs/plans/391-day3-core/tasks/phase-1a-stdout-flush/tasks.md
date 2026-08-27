#### Phase 1a: Item 1a — stdout flush before exit (class fix, ruled 11:40Z)

**Objective**: No `pij` verb can silently truncate its output at 64 KiB when stdout/stderr is a pipe — fixed once at the bin's shared entry seam, pinned by one >64 KiB pipe test through the bin.
**Domain**: pij-control-plane
**Delivers**: blocking stdio on pipes at the top of `main()` (`/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/cli.ts:4440`) — `for (const s of [process.stdout, process.stderr]) { const h = (s as any)._handle; if (h?.setBlocking) h.setBlocking(true); }` — guarded, no-op on TTYs/files; one integration test through the bin.
**Depends on**: None
**Key risks**: none functional (blocking writes are the TTY default; only pipe throughput semantics change). AC-16.
**Branch / PR**: `s391/item1a-stdout-flush` off `main@5445c85`, one tiny PR, lands BEFORE Phase 2.

| Status | # | Task | Domain | Success Criteria | Notes |
|--------|---|------|--------|-----------------|-------|
| [x] | 1a.1 | TEST (RED) `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/cli.integration.test.ts`: seed enough sqlite rows that `pij queue --all`-equivalent unfiltered output exceeds 70 KiB (or use `pij spine events`/any verb that can emit >64 KiB deterministically — pick the cheapest to seed; `pij queue` on the sqlite backend with ~900 tiny deliveries is fine); run the bin via the existing spawnSync harness (stdout is a pipe); assert byte length > 65536 AND the last row/line is present. On base this fails (output is exactly 65536 bytes). | pij-control-plane | RED | AC-16 |
| [x] | 1a.2 | IMPL `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/cli.ts main()` first statement: the guarded `setBlocking(true)` for stdout+stderr with a 4-line comment naming the incident (709/812 rows, 64 KiB, 2026-08-27) | pij-control-plane | 1a.1 GREEN; full suite green | class fix, zero call-site churn |
| [x] | 1a.3 | GATE + PR | — | vitest green; PR → o-prime | AC-10 |

- AC-16 Any bin verb writing >64 KiB to a piped stdout emits it in full and exits with its intended code; proven through the bin with one integration test; `process.exit(` call sites are untouched.
