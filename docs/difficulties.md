# Difficulties

Friction encountered in pij dev. Each entry has a workaround (immediate)
and an encoded fix (durable). Severity guides priority.

| ID | Date | Severity | Description | Workaround | Encoded fix | Status |
|----|------|----------|-------------|------------|-------------|--------|
| D-001 | 2026-05-09 | low | Subagent returned 18 findings inline instead of writing to disk | manual file write by parent | `/plan-1a-explore` agent prompts assert file-write before reporting count | open |
| D-002 | 2026-05-09 | medium | `await ctx.reload()` runs post-reload code from the *pre-reload* version | always end the handler with `return` after `await ctx.reload()` | template encodes the `return;` pattern; consider biome rule | mitigated |
| D-003 | 2026-05-09 | low | NodeNext requires `.js` on relative TS imports; editors don't auto-add | manual `.js` suffix | tsconfig + biome catch missing extension; templates use `.js` everywhere | encoded |
| D-004 | 2026-05-09 | medium | Pi-bundled deps must be `peerDependencies: "*"` not `dependencies` (else they shadow pi's copies) | manually move them | template `package.json` ships peerDeps already correct | encoded |
| D-005 | 2026-05-09 | high | Unverified: do `customType` entries survive `/compact`? | none yet | smoke scenario adds notes → `/compact` → asserts notes still listable | open |
| D-006 | 2026-05-09 | low | Unverified: does `ctx.ui.setStatus(key, "")` clear, or display empty? | use empty string and observe | smoke scenario inspects status after empty pad | open |
| D-007 | 2026-05-09 | medium | Pi has no file watcher — manual `/reload` after every edit | type `/reload` | optional `npm run watch` (fswatch + tmux send-keys) — stretch | open |
| D-008 | 2026-05-09 | medium | Smoke runner requires tmux + pi binary, so CI can't run it | skip smoke in CI | SDK-driven smoke (no TUI, no tmux) — stretch | open |
| D-009 | 2026-05-09 | medium | Fabricated baselines in upstream design (workshop 004 "5-minute test", spec AC minute targets) flowed into ACs as if measured. Validators echoed them as VPO Outcome without sanity-checking evidence. | replace with measurement-anchored claims; remove fixed minute thresholds as gates | spec § Clarifications 2026-05-09b updates AC-01/AC-11/AC-15 + § Goals; plan + flight plan match; validate-v2 should specifically check OUTCOME for measurement evidence | encoded |
| D-010 | 2026-05-09 | low | biome 2.x renamed `files.ignore` → `files.includes` with negated patterns; workshop 004 used the old syntax. | update biome.json to new syntax | `biome.json` ships with biome 2.x `files.includes` syntax; workshop 004 should be updated next pass | encoded (file fix landed; workshop lag) |
| D-011 | 2026-05-09 | low | Workshop 004 `index.ts.template` called `ctx.sessionManager.entries` (property), but real pi API exposes `getEntries()` (method) on `ReadonlySessionManager` (verified at pi-mono `packages/coding-agent/src/core/session-manager.ts:184`). | `.entries` → `.getEntries()` in template | template fixed; workshop 004 needs the same edit next pass | encoded (file fix landed; workshop lag) |

## Severity

- **high**: blocks all extension authoring, or risks silent data loss.
- **medium**: slows authoring; common case.
- **low**: rare; one-off fix is fine.

## Status

- **open**: known, no mitigation yet.
- **mitigated**: workaround in place; durable fix pending.
- **encoded**: durable fix landed (template, lint, generator).
- **resolved**: fix verified by passing tests/smoke.
