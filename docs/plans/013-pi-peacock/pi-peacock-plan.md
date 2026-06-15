# Pi Peacock Terminal Footer Chrome Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-05-27
**Spec**: [`pi-peacock-spec.md`](./pi-peacock-spec.md)
**Status**: DRAFT

## Summary

`pi-peacock` will be implemented as a normal project-local Pi extension that colors the full bottom footer/status area using `ctx.ui.setFooter()`. The plan keeps the implementation narrow: a Pi-free store for presets, command parsing, and reload persistence; a tested footer renderer for width-safe colored output; thin Pi wiring for commands/lifecycle; smoke and docs that prove the extension loads, applies colors, preserves statuses, survives `/reload`, and disables cleanly. The accepted product direction is footer mode, based on the validated red prototype; widget mode may exist only as an optional fallback and must not substitute for footer acceptance criteria.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|--------------|------|
| `agent-tooling-interface` | existing | modify | Add `/peacock` command UX, footer/status presentation, smoke-observable outputs, and operator docs. |
| `extension-authoring-harness` | existing capability | consume | Use T2 scaffold, store/render tests, Driver SDK smoke, and `just self-check`. |
| `session-work-state` | existing | consume | Consume append-only custom session-entry replay semantics for settings persistence; no SQLite schema. |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|----------------|-----------|
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/index.ts` | `agent-tooling-interface` | internal | Pi lifecycle, command registration, footer installation/cleanup, and presentation wiring. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/store.ts` | `session-work-state` | internal | Pi-free settings, presets, command parser, and append-only replay semantics. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/ui.ts` | `agent-tooling-interface` | internal | Width-safe footer rendering, token formatting, ANSI background/foreground helpers. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/store.test.ts` | `extension-authoring-harness` | internal | Store-level validation for presets, parser, replay, and persist-before-mutate. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/ui.test.ts` | `extension-authoring-harness` | internal | Renderer validation for full-width footer lines, statuses, contrast, sanitization, and token formatting. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/index.test.ts` | `extension-authoring-harness` | internal | Wiring-boundary validation that the custom footer factory reads `footerData.getExtensionStatuses()` and forwards sanitized statuses to the renderer. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/smoke.ts` | `extension-authoring-harness` | internal | Driver SDK scenario for live Pi command/footer/reload/off behavior. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/AGENTS.md` | `extension-authoring-harness` | internal | Extension-local guardrails for footer replacement and validation. |
| `/Users/jordanknight/pi-hacking/pij/docs/how/pi-peacock.md` | `agent-tooling-interface` | contract | Operator/agent guide for commands, colors, footer mode, persistence, and limitations. |
| `/Users/jordanknight/pi-hacking/pij/README.md` | `agent-tooling-interface` | cross-domain | Quick-start discovery for the new extension. |
| `/Users/jordanknight/pi-hacking/pij/docs/domains/agent-tooling-interface/domain.md` | `agent-tooling-interface` | contract | Domain source locations, concepts, contracts, composition, and history updated for `/peacock`. |
| `/Users/jordanknight/pi-hacking/pij/docs/domains/domain-map.md` | `agent-tooling-interface` | cross-domain | Domain topology/history updated to include Peacock footer/status presentation. |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `setFooter()` is sufficient but replaces the built-in footer; public `footerData` is narrow and does not automatically render built-in model/token/status rows. | Implement a `PeacockFooterSnapshot` and renderer that explicitly preserves P0 fields and all extension statuses, with graceful best-effort P1 usage data. |
| 02 | High | Footer mode is the accepted product path; older workshop wording about widget bars is only a fallback and could miss the user-approved prototype outcome. | Make footer mode the v1 acceptance path. Do not let widget/status-only behavior satisfy footer ACs. |
| 03 | High | The prototype exposed a token formatting bug: `1050k` should render as `1.1M tokens`. | Implement and unit-test a local `formatTokens()` matching built-in scale expectations. |
| 04 | High | Raw ANSI background rendering can break width/padding if escape bytes count as visible width. | Build plain lines to width using `visibleWidth()` / `truncateToWidth()`, then apply background/foreground/reset. |
| 05 | High | T2 persistence must be event-sourced and Pi-free: no placeholder ping tool, no SQLite, no third-party parser. | Scaffold with `just new pi-peacock`, replace starter code, keep parser/palette/replay in `store.ts`, test P9 ordering. |
| 06 | High | Smoke can pass superficially without proving statuses are rendered or reload survives. | Add renderer tests with fake status maps, and smoke visible anchors for preset/footer/reload/off. |
| 07 | High | Domain and docs will become stale if the extension lands without updating `agent-tooling-interface`, README, and docs/how. | Include domain/docs tasks in the Simple implementation. |
| 08 | High | `setFooter()` is a singleton custom-footer slot; if another extension owns a custom footer, `pi-peacock` will overwrite it; v1 now installs a built-in-compatible footer at boot so `/peacock` only toggles background color. | Document v1 footer-mode ownership limitations and built-in-compatible boot footer; make widget/status fallback the compatibility path for environments that need another custom footer. |
| 09 | High | Replacing the built-in footer means `pi-peacock` inherits responsibility for sanitizing status/model/cwd text that may contain newlines, tabs, ANSI escapes, or control characters. | Add sanitization requirements and tests for every external text segment before width calculation and ANSI wrapping. |
| 10 | High | Renderer tests alone do not prove the `setFooter()` factory actually reads `footerData.getExtensionStatuses()` at the wiring boundary. | Add an `index.test.ts` or equivalent fake-footerData wiring test, and include smoke/status anchors where practical. |

## Agent Harness Strategy

- **Current Maturity**: L2 engineering harness plus L2 companion overlay.
- **Target Maturity**: L2 unchanged for this Simple plan.
- **Boot Command**: `just install` for full setup; `pi` from repo root for interactive extension loading.
- **Health Check**: `just self-check` before completion.
- **Interaction Model**: Terminal TUI plus tmux Driver SDK smoke.
- **Evidence Capture**: Vitest output, smoke RunReport/terminal anchors, docs updates.
- **Pre-Phase Validation**: For this Simple plan, run targeted tests and smoke before final `just self-check`.

## Implementation

**Objective**: Rebuild `pi-peacock` cleanly from the spec/workshops as a tested footer-color extension with Peacock presets, reload persistence, and docs.

**Testing Approach**: Hybrid — TDD-style store/render tests first for deterministic contracts, then lightweight live Pi smoke for command/render/reload/off integration.

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|----|------|--------|---------|-----------|-------|
| [x] | T001 | Scaffold `pi-peacock` extension with T2 layout and remove starter ping/tool placeholder. | `extension-authoring-harness` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/` | Extension directory exists with `index.ts`, `store.ts`, `ui.ts`, tests, smoke, and no starter ping tool. | Use `just new pi-peacock`; prototype was removed and should not be copied back wholesale. |
| [x] | T002 | Add store tests for palette, parser, normalization, replay, and P9 ordering. | `extension-authoring-harness` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/store.test.ts` | Tests specify preset exact values, aliases, command union, latest-valid replay, reset, malformed entries, and append-before-mutate before or alongside store implementation. | Test-first slice per Hybrid strategy; gate with `just test`. |
| [x] | T003 | Implement Pi-free store contracts for presets, color normalization, commands, settings, and replay. | `session-work-state` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/store.ts` | Store imports no `@earendil-works/*`; supports nine presets, `#rrggbb`/no-hash hex, `/peacock` parser, settings/reset entries, malformed replay ignore, and append-before-mutate; store tests pass. | Per spec and workshop 003. |
| [x] | T004 | Add UI/render tests for footer lines, status preservation, sanitization, ANSI safety, and token formatting. | `extension-authoring-harness` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/ui.test.ts` | Tests specify widths `1`, `2`, `20`, `80`, `140`; fake status maps; right-side model preservation; `1050k` regression; no line exceeds visible width; status/model/cwd inputs with newlines, tabs, ANSI resets, and control characters are sanitized before rendering. | Test-first slice per Key Findings 01/03/04/09; gate with `just test`. |
| [x] | T005 | Implement footer rendering helpers, sanitizers, and token/context formatting. | `agent-tooling-interface` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/ui.ts` | Renderer sanitizes all external text segments, fills/truncates each line by visible width, includes ANSI reset, sorts statuses, chooses readable foreground, formats `1,050,000` as about `1.1M`, and render tests pass. | Keep `store.ts` Pi-free; `ui.ts` may import `@earendil-works/pi-tui`. |
| [x] | T006 | Wire Pi lifecycle and commands in `index.ts`. | `agent-tooling-interface` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/index.ts` | Registers `/peacock`; one `session_start` installs the built-in-compatible footer and rehydrates color state; `session_shutdown` clears; commands include `list`, apply preset/hex, `surface footer`, `status --json`, `off`, `reset`. | `/peacock` changes background color only; clear status/footer/widgets with `undefined` on shutdown; no hardcoded keybindings; document singleton custom-footer ownership. |
| [x] | T007 | Build footer snapshot from public Pi context and `footerData`. | `agent-tooling-interface` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/index.ts`, `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/ui.ts`, `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/index.test.ts` | Footer mode preserves cwd/branch, model/thinking, and all non-empty extension statuses; usage/context is best-effort; a wiring-boundary test proves the `setFooter()` factory reads `footerData.getExtensionStatuses()` and forwards those statuses to the renderer. | Use `footerData.onBranchChange()` dispose; refresh on relevant lifecycle/model/thinking events only if needed. |
| [x] | T008 | Add deterministic Driver SDK smoke for footer mode. | `extension-authoring-harness` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/smoke.ts` | `npm run smoke -- pi-peacock` proves `/peacock status --json`, apply React Blue, footer surface, `/reload` persistence, and `/peacock off` restore using stable anchors; where feasible, smoke or JSON evidence includes rendered status count derived from the actual render path. | Do not assert raw ANSI bytes or exact rows. |
| [x] | T009 | Add extension-local implementation guidance. | `extension-authoring-harness` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pi-peacock/AGENTS.md` | AGENTS file records footer replacement constraints, singleton custom-footer ownership limitation, status sanitization/preservation, P1–P10, zero-dependency color parsing, and validation commands. | Keeps future agents from reintroducing prototype shortcuts. |
| [x] | T010 | Document user/operator surface. | `agent-tooling-interface` | `/Users/jordanknight/pi-hacking/pij/docs/how/pi-peacock.md`, `/Users/jordanknight/pi-hacking/pij/README.md` | README has a concise pi-peacock section; docs/how covers commands, colors, footer behavior, persistence scope, limitations, singleton custom-footer ownership, widget/status fallback, and troubleshooting. | Hybrid docs per spec. |
| [x] | T011 | Update domain documentation for `pi-peacock`. | `agent-tooling-interface` | `/Users/jordanknight/pi-hacking/pij/docs/domains/agent-tooling-interface/domain.md`, `/Users/jordanknight/pi-hacking/pij/docs/domains/domain-map.md` | Domain doc lists source locations, concepts/contracts/composition/history for `/peacock`; domain map history/labels mention Peacock footer/status presentation. | No new domain. |
| [x] | T012 | Run targeted and final validation gates. | `extension-authoring-harness` | `/Users/jordanknight/pi-hacking/pij` | `just test`, `just typecheck`, `just smoke`, and final `just self-check` pass, or unrelated pre-existing blockers are isolated with exact evidence. | Targeted vitest/smoke commands may be used for local diagnosis, but the agent-facing gates are `just` recipes. |

### Acceptance Criteria

- [x] `pi-peacock` registers `/peacock` and loads from `.pi/extensions/pi-peacock/` without Pi errors.
- [x] Footer mode colors the full bottom footer/status area through `ctx.ui.setFooter()`.
- [x] Footer mode preserves cwd/branch, model/thinking, and all non-empty extension statuses when width permits, with a wiring-boundary test proving statuses come from `footerData.getExtensionStatuses()`.
- [x] Context windows around `1,050,000` tokens render as approximately `1.1M`, not `1050k`.
- [x] `/peacock list` includes all nine VS Code Peacock preset colors with exact hex values.
- [x] `/peacock reactBlue` applies React Blue and `/peacock status --json` reports `#61dafb`.
- [x] `/peacock off` disables Peacock coloring while preserving the same built-in-compatible footer layout; shutdown clears owned UI via `undefined`.
- [x] Selected color/surface survive `/reload` via custom entry replay.
- [x] `store.ts` remains Pi-free and no third-party color dependency is added.
- [x] Store/render tests pass through `just test`; `just typecheck`, `just smoke`, and final `just self-check` pass or blockers are isolated.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Custom footer hides useful built-in/status information | Medium | High | Preserve P0 data and all `footerData.getExtensionStatuses()` in renderer and wiring-boundary tests. |
| Another extension already owns the singleton custom-footer slot | Low | High | Document v1 incompatibility; `pi-peacock` owns the custom footer from boot so color toggles do not change layout; use widget/status fallback when another custom footer must remain active. |
| Untrusted/malformed status text breaks ANSI footer rendering | Low | High | Sanitize every external text segment before width calculation and ANSI wrapping; test newlines, tabs, ANSI escapes, and control characters. |
| Smoke readiness changes with custom footer | Medium | High | Use stable anchors, wide terminal, reload/off checks; inspect pane on failure. |
| Usage/token parity cannot exactly match built-in footer | Medium | Medium | Treat exact token/cost parity as P1 best-effort; document gaps; preserve `1.1M` formatting. |
| ANSI escapes break line width/reset | Medium | Medium | Unit-test plain-line width before applying ANSI and reset on every line. |
| Widget fallback accidentally becomes accepted product path | Low | Medium | Footer mode is explicit in acceptance criteria and smoke. |
| Project persistence is desired but absent | Medium | Low | Keep v1 session/reload scoped; document project persistence as future work. |

## Next Steps

Ready to implement with:

```text
/plan-6-v2-implement-phase --plan "docs/plans/013-pi-peacock/pi-peacock-plan.md"
```

Optional before implementation: run `/plan-4-v2-complete-the-plan` for readiness validation.

---

## Validation Record (2026-05-27)

### Validation Thesis

**Raison d'être**: The plan exists to make implementation of `pi-peacock` safe and repeatable after a prototype proved `ctx.ui.setFooter()` can color the full bottom footer area.

**Value claim**: Future implementation and review should become cheaper, safer, and clearer because the plan sequences store/render/footer/smoke/docs work without losing footer status information.

**Artifact promise**: An implementation agent can build the extension from the plan without re-deciding footer mode, state persistence, color contract, validation gates, or domain updates.

**Intended beneficiaries**: Implementation agents, reviewers, Pi operators, and future maintainers.

**Proof target**: Implementation.

**Evidence standard**: Concrete tasks with paths, domain mapping, acceptance criteria, risks, validation gates, and alignment with spec/workshops.

**Thesis source**: `pi-peacock-spec.md` Summary/Goals/Acceptance Criteria and `workshops/002-bottom-status-bar-contract.md`.

**Thesis verdict**: Advanced.

**Main thesis risk**: The plan is aligned, but implementation must still prove footer singleton ownership, status sanitization, and real `footerData.getExtensionStatuses()` wiring.

---

| Agent | Lenses Covered | Thesis Axes Covered | Issues | Verdict |
|-------|---------------|---------------------|--------|---------|
| Coherence | phase coherence, task order, thesis alignment | Implementation Readiness, Review Compression | 0 | PASS |
| Risk / Constraints | risks, hidden assumptions, technical constraints, edge cases, domain boundaries | Safety to Change, Operational Reliability | 2 HIGH fixed, 1 MEDIUM open | PASS after fixes for HIGH |
| Completeness | acceptance criteria, evidence sufficiency, testing sufficiency, CS challenge | Proof Quality, Implementation Readiness | 1 HIGH fixed, 2 MEDIUM open | PASS after HIGH fix |
| Thesis + Forward Compatibility | thesis alignment, forward compatibility, downstream usefulness | Thesis Alignment, Downstream Usefulness | 0 | PASS |

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| `/plan-6` implementation phase | Ordered task table, concrete paths, done-when criteria, risks, validation gates, no re-decision of footer mode/state/color contracts | N/A | ✅ | T001–T012, Domain Manifest, Key Findings, Acceptance Criteria, Risks. |
| Docs/domain reviewers | Manifest of domain/doc updates, boundary placement, docs/how + README updates, domain-map/domain doc update tasks | N/A | ✅ | Target Domains, Domain Manifest, T010, T011, no-new-domain decision. |

**Thesis alignment**: Value claim advanced at Implementation proof level; main risk is now implementation fidelity around footer ownership, sanitization, and status wiring.

**Outcome alignment**: the plan advances the spec promise that `pi-peacock` helps operators identify the active Pi workspace/session while preserving the footer’s operational value, and it does so through explicit footer renderer, status preservation, and validation tasks.

**Standalone?**: No — downstream `/plan-6` implementation and docs/domain review consume this plan.

Overall: VALIDATED WITH FIXES
