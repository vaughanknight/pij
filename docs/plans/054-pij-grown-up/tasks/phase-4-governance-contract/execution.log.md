# Phase 4 execution log — Governance contract (FINAL)

### [orchestrator] 2026-07-17 — P4 build leg opened
- Dossier T001–T008 generated (surface map: peer-packet render precedent, skill-check gate internals, sweep rig precedents); validate-v2: 1 HIGH + 2 MED + 1 LOW folded (full 12-AC sweep chain spelled out; script anchors :47/:69 corrected incl. the soft_budget trap; pij-skill-check.sh fence amendment RULED for T004 w/ mechanical grep proof; T002 bin-intercept mechanism ruled per cli.ts:2693 precedent). Committed 50a3568.
- boot-4 seam: real pre-flight — HEALTHY (typecheck 0, test 0). Receipted.
- Dispatched to pij-general-llama under the /builder 6 implement mandate. HARD STOPS in packet: R3 (no install/live-daemon/real ~/.pij), R4 (no cutover, prime-flow.json byte-untouched); completion checkpoint must carry the R3/R4 attestation.

### [coder] T001 — pure `render-spine-md.ts` (commit 0ef6839)

- RED first: `core/platform/render-spine-md.test.ts` (15 tests) — module absent, file-level fail confirmed. GREEN: `core/platform/render-spine-md.ts`, `renderSpineMd(events, opts?): string`, peer-packet style (`sections[] → join("\n\n")` + trailing newline), exported `RenderSpineMdOptions`.
- Contract pinned: byte-stable (double render + JSON-round-trip clone + one exact-document pin); empty spine = valid header-only doc; unknown kinds render (WS-5 open vocabulary); **additive fields rendered honestly** (sorted keys, JSON-encoded — the render is a view, never a filter); root-link renders prev without inventing next; all seven current kinds with attribution (actor + provenance suffix), prev/next, refs, peer/project/repo, verifiedBy.
- No clock, no fs — platform boundary sensor picks the module up automatically (platform suite 8 files / 335 green).
- Gates at commit: tsc clean (one cast fixed to `as unknown as Record`), biome clean (formatter folded one array literal).

### [coder] T002 — `pij spine render` verb, bin-owned write (commit 8acd2c6)

- RED first: core parse/dispatch tests (3, appended after the frozen block) + bin integration tests (3) — all failed on the unknown subverb.
- Core (ruled mechanism, Finding 06 two-tier precedent): union gains `spine-render` (parse-row-only doc), family map `append|events|render`, ALLOWED_FLAGS `{json}`, MAX_POS 0, parse case; dispatch case sits in the no-throw containment gate and returns **E-NOREG naming the bin** ("intercept missing: update the pij bin") — core cannot honor the verb because `SpineLogPort` has no markdown-write method by design.
- Bin: intercept AFTER core parseArgs (full E-ARG/flag parity) and BEFORE `dispatch` — `runSpineRender` reads via `FsSpineLog`, calls pure `renderSpineMd`, publishes `join(pijHome,"spine","spine.md")` via new `writeTextAtomic`; `--json` envelope `{path, bytes, events}`; human names count/path/bytes; write failure = `E-NOREG` exit 3 (fs spine-adapter code family). USAGE gained the verb line.
- Atomic write reuse: `adapters/atomic-file.ts` refactored — `writeTextAtomic(path, text)` extracted with the identical temp+fsync+rename+dir-fsync contract; `writeJsonAtomic` now delegates (`JSON.stringify` + delegate). Behavior-preserving; existing atomic-file tests untouched and green.
- Integration proofs (real bin, temp PIJ_HOME): file lands + **byte-identical to `renderSpineMd(new FsSpineLog(HOME).read())`**; envelope counts/bytes match; re-render of an unchanged log byte-stable; empty-spine render in a fresh temp home = header-only doc.
- Gates at commit: tsc clean; fenced core+adapters 1954 passed / 7 skipped; biome clean (import order auto-fixed).

### [coder] T003 — governance migration contract doc (commit 8a7c593)

- `docs/how/pij-governance-migration.md` (docs/how header style): dual-run table (prose spine AUTHORITATIVE for governance meaning; JSON spine = platform truth/telemetry, both true at once in different registers); spine.md pinned as a render never a second log; no automatic cross-copying — manual echoes are attributed writes like any other.
- Cutover section: explicit human ruling artifact ONLY (usage/size/time may never imply one — R4 verbatim); ruling template stub included (authority split, prose disposition, backfill, writer contract, rollback condition); "until the artifact exists the answer is no, categorically."
- prime-flow.json: frozen as-is (E309 fail-closed history, H-06 "hand-cranked JSON rots"), nothing may resume writing it, successor decided AT cutover by the ruling (WS-3 replace posture — pij platform, or a fresh CLI-written harness-flow overlay). **R4 byte-proof at commit: `git hash-object government/prime-flow.json` = `9b7d5b5…` = HEAD blob (identical).**

### [coder] T004 — pij skill `node` route + mechanical gate (commit 713c123)

- `skills/pij/references/routes/node.md` (65 lines, ops.md convention: H1 job line, sibling-blind blockquote, `**Job**:`, bash blocks, diagnosis table): attribution-before-write law, project/task/state/node/spine/anomalies usage (incl. `spine render`), adoption section consuming P3's ADOPTION_HINT contract (unadopted predicate wording, tree --global --json + list boolean, link remedy audited as node-linked, PIJ_SESSION_ID prevention, prime-legal-root), derived-safety anomaly table.
- `SKILL.md` (79 lines): registry row `node` + CLI-verb coverage row for the six platform families.
- `pij-skill-check.sh` (ruled fence amendment, this task only): `node` added to the sibling-blindness route list (**:47**) AND the HARD 150-line budget loop (**:69**) — the soft_budget loop untouched as ruled. ALSO added `project spine task node anomalies` to §4's required coverage list (**:89**) — beyond the two named anchors, same gate-must-enforce rationale; **Noteworthy Discoveries row filed**.
- Proofs: `just pij-skill-check` GREEN in worktree; `grep -n node harness/scripts/pij-skill-check.sh` hits :47, :69 (and :89); **`just pij-skill-install` NEVER run (R3)** — deploy stays a ship-checklist step.

### [coder] T005 + T006 — platform public contract doc + T006c ruling (commit 4e0efb2)

- `docs/how/pij-platform.md`: file-layout table (public vs internal — subdir law + phantom-peer hazard stated); Project/Assignment/SpineEvent field tables **verbatim from `core/platform/types.ts`**; descriptor node-truth block verbatim from `core/types.ts` incl. ownership per field (semanticState externally-owned, systemState daemon-only); ruled vocabularies byte-exact; UI derivation rules (BADGE_SEVERITY 15-word order verbatim + badge rule, effectiveParent incl. the sanctioned `parentId: null` root marker, unadopted predicate + presence-vs-boolean projection split, three-axes independence, done-is-a-claim, gauge semantics, spine.md render law); anomaly query shape/kinds/4h default + once-per-transition latch; consistency notes (coupled journal-FIRST vs uncoupled descriptor-truth doctrine **incl. the P3 LOW link-lock note as documented-no-fix**).
- README pointers landed in BOTH slots: after the `docs/how/pij.md` paragraph + a `## Where things are` row (also pointing at the migration doc).
- **Deterministic field-parity check (scripted, recorded)**: every public field in the doc exists in types and vice versa — Project 7, Assignment 8, SpineEvent 13, node-truth 7, ContextGauge 3, Anomaly 5, both vocabularies, and `BADGE_SEVERITY` order == code order → `missing: NONE`, `badge order matches code: True`.
- **T006c RULING (default upheld — no disproof found)**: models.json join = SOLE contextMax source; rollout `model_context_window` stays unwired (self-reported max lacks a trust story; precedence unruled). Text lives in the platform doc §derivation rules; `gauge.ts` + `context-reader.ts` untouched this leg (`git status` clean on both); Discoveries row filed.

### [coder] T007 — 12-AC acceptance sweep + harness checks (commit 42f4c0f)

- `.pi/extensions/pij/acceptance-sweep.test.ts` — ONE isolated harness, 12 ordered steps, green first run. R3 form: temp `PIJ_HOME` (mkdtemp) + REAL fs adapters over it, `FakeProcess` identity/clock (injected NOW), fake liveness/suspension probes, `RuntimeAxisTracker.tick()` + `AnomalySweep.tick()` single-step (no live daemon), the ONE subprocess = real bin `spine render` against the same temp home. AC→step→assertion map in the file header.
- Chain exactly per dossier: legacy descriptor SEEDED RAW pre-flow (AC-11 load + list + byte-stable round-trip, no fields invented) → project create/list/set incl. `-2` collision + resolved attribution on the audit events (AC-01) → `--peer`/`--project` EXACTNESS vs manual filter incl. `pij-workerx`/`fix-the-cli-2` near-misses (AC-02) → `appendOnce` replay dedupe + prefix immutability, re-proved across the WHOLE sweep at step 11 (AC-03) → implicit `asg-general-pij-stray` + explicit project-joined assignment + denorms + worst-first badges (`waiting` no-verdict; `working` over `done`) (AC-05) → unverified-done card render + anomaly, verify flips `verified/verifiedBy` and clears it (AC-06) → all THREE anomaly kinds with evidence + `AnomalySweep` parent-alert exactly-once latch (unadopted stray latched silently — no parent to alert) (AC-07) → tracker verdicts starting/stopped/unknown(+working) persisted with V-05 `actor: daemon` events + `reason:missing-telemetry` ref (AC-04) → unadopted tree/list projections, evented re-parent (`spineSeq` + refs), flag drops after link, cycle rejected, `spawnedBy` immutable (AC-08) → full card field-by-field incl. axes/badge/gauges/`windowId @7`/`contextMax` 200k join (AC-09) → bin-rendered `spine.md` byte-identical to pure render (AC-10) → shipped contract surfaces exist (AC-12).
- Gates: sweep 12/12 · tsc clean · biome clean · **FULL `npx vitest run`: 159 files passed / 4 skipped — 2832 passed / 11 skipped / 0 failed** (release-age flake did not fire this run).
- **`harness checks` verbatim**: first run — 7/8 pass, `smoke` FAIL (`waitIdle timed out after 30000ms` during pi boot while cold-cloning `.pi/git/github.com/ghoseb/pi-askuserquestion` — environmental: network clone consumed the idle window). Isolated verify: `npm run smoke` → **9/9 scenarios ✓**. Full re-run: `{"ok":true, ran:[local-paths,typecheck,lint,test,windows-compat,smoke,pkg-audit,snapshots] — ALL PASS, "next_action":"All checks green — safe to ship"}`. Noteworthy Discoveries row filed; nothing masked.

### [coder] T008 — ship checklist + phase wrap (final commit)

- `docs/plans/054-pij-grown-up/ship/ship-checklist.md`: six sections, every step R3-annotated as LISTED-not-executed — PR gate (s051 lands FIRST per standing R2, s052 npm ci), SW-7 convergence re-read (read-only: re-run P3 behavior contracts + acceptance sweep on merged tree), daemon-restart baton (no hot-reload memory), live two-peer AC-07 demo incl. windowId select-window proof, `just pij-skill-install` deploy + post-install check, paperwork (squash PR, first REAL-home `pij spine render` debut outside the fence, R4 final-diff confirmation).

## PHASE 4 COMPLETE — build summary (coder pij-general-llama, 2026-07-17)

**Commits (7)**: 0ef6839 T001 · 8acd2c6 T002 · 8a7c593 T003 · 713c123 T004 · 4e0efb2 T005+T006 · 42f4c0f T007 · (this wrap) T008+progress. T001–T008 ALL [x].
**Gates**: tsc clean · fenced core+adapters 1954/7sk/0f · **FULL vitest 2832 passed / 11 skipped / 0 failed** · `just pij-skill-check` green · biome clean · sweep 12/12 · **`harness checks` ALL 8 STAGES PASS** (first-run smoke fail was environmental cold-clone; isolated 9/9 then full re-run green — recorded verbatim above).
**R3 attestation**: `just pij-skill-install` NEVER run; no live daemon started (tracker/sweep single-step tick only; the one subprocess was `spine render` against the temp home); no real `~/.pij` touched (every store under mkdtemp homes).
**R4 attestation**: no cutover; `government/**` untouched; `government/prime-flow.json` byte-identical (`git hash-object` = HEAD blob `9b7d5b5…`).
**SW-6/SW-7**: `git diff --name-only 50a3568..HEAD | grep -cE "core/discovery|core/current-session|core/close|daemon\.ts"` = **0**; all tests outcome-contracts.
**Deferred/Noteworthy digest**: 3 Noteworthy rows (gate-script :89 extension beyond ruled anchors · T006c ruling upheld-default · environmental smoke first-run fail), 0 Deferred, no TODO/FIXME/HACK introduced.
**Post-wrap hygiene**: `harness checks` (pkg-audit) side-effect re-stamped vetting `date:` fields in `.pi/packages.yaml` (timestamps only, scores/rubrics unchanged) — OUT of fence, reverted via `git checkout --`; worktree confirmed CLEAN.
- [orchestrator] 2026-07-17: P4 BUILD VERIFIED: fence audit fec9032..5b7e65c CLEAN (17 files incl. ruled gate-script amendment), tsc clean, FULL 2832/11/0, pij-skill-check green — all re-run personally; R4 byte-proof re-run (prime-flow blob 9b7d5b5 == HEAD); sw-zones 0. Coder compacted + parked; build side of plan 054 DONE. Seams: boot-4 HEALTHY, observe-4 real capture (pkg-audit write side-effect, harness-itself), retro-4 drained (record 003, upstream-issue route deferred to human-present harvest). Flow: phase-4 done + receipted, nav → review-4. PLAN-CLOSING review dispatched: `review-packet-p4-001.md` (sweep-audit weighted highest, R3/R4 independent verification, whole-of-plan attestation required for APPROVE).

---

### [orchestrator] 2026-07-17 — PLAN 054 REVIEW-CLEAN END TO END (P4 cycle-1 APPROVE, whole-of-plan attested)
- `reviews/p4-review-001.md`: APPROVE — sweep verified GENERATIVE for all 12 ACs; R3/R4 independently verified; rulings a–e sound; docs byte-accurate; whole-of-plan attestation: P1–P4 review-clean, all 19 prior findings root-cause dead. LOW → ship §2 note appended to checklist (pij() helper env leak).
- Cycle totals: P1 6 · P2 1 · P3 1 · P4 1. Reviewer pij-immense-antelope thanked + closed (own spawn). Coder parked.
- Ship-harvest seam: real post-flight — insights over 4 records/6 entries; top recurrent cluster = release-age-policy flake family (n=3); improve offer presented to Jordan; lifecycle ops deferred to human.
- Flow: nav at ship. R8 target MET. Ship checklist awaits Jordan's ruling; PR hard-stopped behind s051.
