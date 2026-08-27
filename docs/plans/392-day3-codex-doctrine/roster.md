# Fleet roster — s392-day3-codex-doctrine (durable configuration truth; persisted before use — P9)

**Build config** (o-prime ruling 5, pre-confirmed): coder = copilot `gpt-5.6-sol` @ xhigh; reviewer = cross-model cold reviewer @ xhigh (acquired lazily at first REVIEW); effort canaried mechanically.

**flow-pair run**: `2026-08-27T08-21-56Z-github.com-vaughankn` · ledger `.flow-pair/runs/2026-08-27T08-21-56Z-github.com-vaughankn/` (gitignored) · engine `~/GitHub/pij/skills/flow-pair/lib/cli.ts`

| role | pijId | pane | window | harness | model | effort | spawnedByUs | canary | status |
|------|-------|------|--------|---------|-------|--------|-------------|--------|--------|
| coder | pij-gunboat-diplomat | %54 | s392-day3-codex-doctrine (right of PM %51) | copilot | gpt-5.6-sol | xhigh | true | PASS 08:23Z — process args `--model gpt-5.6-sol --effort xhigh --ui-server --port 56697`; canary dispatch-de34e194 acked by the seat (CLI wait timed out first); footer GPT-5.6 Sol | ALL coder work delivered (Phase2 35f9aff, FX001 246f234✓, FX002 f21269f, Phase4 cb6a9eb, FX003 4dca931) → compacted; idle |
| reviewer | pij-pale-araminta | %90 | s392-day3-codex-doctrine (below coder %54) | copilot | claude-opus-5 | xhigh | true | PASS 09:23Z — `pij canary` model matched (footer), args `--effort xhigh --ui-server --port 49778`, dispatch-aaeacd1f | verdicts (disk-reconciled): FX001 APPROVE · Phase2 rereview APPROVE · Phase4 rereview FIX_REQUIRED(pij.md residual) → fixed a6d94f4 → rereview2 IN FLIGHT (last) |
| validator (one-shot) | pij-civil-locust | %52 | s392-validate | copilot | gpt-5.6-sol | xhigh | true (`--once`, dissolved) | n/a | DONE — v1.0.0 sha 29abeee3…: NEEDS ATTENTION (5 HIGH) → reports/validate-v2-plan.md |
| re-validator (one-shot, narrow) | pij-cheap-sparrow | %55 | s392-revalidate | copilot | gpt-5.6-sol | xhigh | true (`--once`) | n/a | DONE — v1.1.0: NEEDS ATTENTION (1 HIGH, 2 MED) → reports/validate-v2-plan-v1.1.md |
| re-validator #3 (one-shot, narrow) | pij-loose-thorn | %57 | s392-revalidate-2 | copilot | gpt-5.6-sol | xhigh | true (`--once`) | n/a | DONE — v1.2.0: semantic PASS, 1 MED anchor → fixed in v1.3.0 → reports/validate-v2-plan-v1.2.md |
