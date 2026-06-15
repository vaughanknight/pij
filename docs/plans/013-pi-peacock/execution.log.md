# Execution Log — pi-peacock implementation

**Plan**: `docs/plans/013-pi-peacock/pi-peacock-plan.md`
**Mode**: Simple
**Companion**: `code-review-companion` run `2026-05-27T15-38-53-180Z-6d10`

## Harness validation

| Layer | Check | Result | Evidence |
|---|---|---|---|
| Agent harness | `minih --version`; boot/attach; briefing sent | PASS | minih 0.1.6; briefing `01KSKZ5AVNM5EFM8MFA7GAWQJ2` sent via outside inbox. |
| Engineering harness | Loaded `docs/project-rules/harness.md` | PENDING | Full gates run at T012. |

## Discoveries & Learnings

| ID | Task | Severity | Discovery | Disposition |
|---|---|---|---|---|
| D001 | Scope | info | User confirmed CLI-only color selection; no modal/popover picker in v1. | Keep `/peacock list` and `/peacock <preset|hex>`; do not add `/peacock pick`. |
| D002 | Footer UX | high | User observed the prototype implementation changed footer layout, not just background. | Reworked `pi-peacock` to install a built-in-compatible custom footer at boot; `/peacock` now toggles background color only, preserving the same visible layout before/after. |
| D003 | Smoke | medium | Stable footer regexes can pass before slash-command processing finishes, causing subsequent text to concatenate in the editor. | Added explicit `C-u` clears and short sleeps around pi-peacock smoke commands. |
| D004 | Validator | high | `extension-validator` scenario passed, but `minih check` is degraded because the validator output schema and minih system schema require incompatible `/summary` types. | Recorded validator run evidence and schema conflict; scenario result itself is green. |
| D005 | Review | high | Independent final review caught foreground-color overrides and context-window fallback gap. | Removed foreground override so Peacock applies background only; added model context-window fallback and documented auto-compact parity limitation. |

## Companion Findings Reconciliation

| Finding | ackOf | Severity | Task/Commit | Disposition |
|---|---|---|---|---|
| _None received_ | | | | |

## Task Log

### T001–T012 — Implementation landed

- Scaffolded `.pi/extensions/pi-peacock/` and replaced starter ping/tool code.
- Added Pi-free store, command parser, Peacock presets, replay persistence, and tests.
- Added built-in-compatible footer renderer with optional background color, sanitization, width safety, token formatting, and tests.
- Wired `/peacock` and `/pi-peacock`, lifecycle replay, always-installed custom footer, shutdown cleanup, thinking/model refresh, status JSON, and footerData status forwarding test.
- Added deterministic smoke, extension-local AGENTS guidance, README/docs/how updates, and domain docs.
- Important UX correction from user: before/after footer layout must match; color command should alter background only.

Evidence:

| Check | Result |
|---|---|
| `npx vitest run .pi/extensions/pi-peacock/store.test.ts .pi/extensions/pi-peacock/ui.test.ts .pi/extensions/pi-peacock/index.test.ts` | PASS — 20 tests |
| `npm run smoke -- pi-peacock` | PASS |
| `minih run extension-validator -p extensionName=pi-peacock -p cwd=/Users/jordanknight/pi-hacking/pij` | Scenario PASS — run `2026-05-27T16-13-24-613Z-07e1`, 13 passed / 0 failed; report validation DEGRADED due schema conflict on `/summary`. |
| Independent final review (`flowspace-research-v2`) | Initial 2 HIGH findings fixed; re-review reported no remaining HIGH/CRITICAL. |
| `just self-check` | PASS — typecheck, lint, test, smoke, pkg audit, snapshots-check |

### Companion note

`code-review-companion` run `2026-05-27T15-38-53-180Z-6d10` exited on idle budget before implementation review requests arrived, so it produced no code findings. Its farewell reported 0 findings and a coordination magic-wand about briefing-only idle check-ins. A fallback independent review was run with `flowspace-research-v2`; its HIGH findings were fixed and re-reviewed.

