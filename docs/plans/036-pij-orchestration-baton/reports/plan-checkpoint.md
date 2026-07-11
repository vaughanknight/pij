# s036 report — plan checkpoint (SW-1 trigger)
**From**: pij-1khprxk · **To**: pij-3vetx8 · **Date**: 2026-07-11

**claim**: Plan written (Simple, CS-3, READY) and independently validated — an Opus-class cold subagent ran /validate-v2: VALIDATED, zero material findings, all cited code patterns/rulings/manifest coverage proven against disk. SW-1 is triggered: the Domain Manifest exists for your fence-vs-manifest diff.

**artifacts[]**:
- `docs/plans/036-pij-orchestration-baton/pij-orchestration-baton-plan.md` — the unified plan; § Domain Manifest is the fence-diff input
- `docs/plans/036-pij-orchestration-baton/research-dossier.md` — explore output (9 findings, 6 historical)
- `docs/plans/036-pij-orchestration-baton/rulings.md` — #7 added (honor-system posture, v1 scope: +pin +blocked-time, −with −windows; Simple/TDD/fakes/docs-how)
- `docs/plans/036-pij-orchestration-baton/the-flow.json` — flight plan (research ◆, plan ◆, nav → phase-1)

**shas[]**: none yet (no commits — git-index baton not requested; nothing staged)

**gates[]**: plan G1 PASS, G2–G4 N/A, G5–G7 PASS → READY. validate-v2 (Opus cold): VALIDATED. harness boot (pre-flight): HEALTHY.

**observations[]**:
- OBS-4: the builder flow's questions + Jordan's in-pane rulings compose cleanly — ruling #7 (honor system) landed mid-plan-pass and reshaped v1 scope without a re-plan cycle.
- OBS-5: validate-v2 in a cold Opus subagent (Jordan-directed) worked well as an independence upgrade over inline auto-run; the subagent honored read-only and returned file:line proof.

**open[]**:
- O-3: **fence grant request** — expected code fences per the Manifest: `.pi/extensions/pij/core/orchestration/**`, `.pi/extensions/pij/adapters/baton-store.*`, edits to `.pi/extensions/pij/cli.ts`, `.pi/extensions/pij/daemon.ts`, `.pi/extensions/pij/core/daemon/baton-sweep.*`, `.pi/extensions/pij/adapters/fakes.ts`, `docs/domains/pij-orchestration/**`, rows in `docs/domains/registry.md` + `docs/domains/domain-map.md`, `docs/how/pij-orchestration-baton.md`, row in `docs/how/pij.md`; ship-time: `skills/pij/references/prime/rituals/batons.md`.
- O-4: daemon-restart baton will be requested for one batched live-verify window at T011; git-index baton at first commit slot.
