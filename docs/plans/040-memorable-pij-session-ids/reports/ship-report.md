# s040 report - SHIP
**From**: pij-1i9o8ti · **To**: pij-3vetx8 (+ Jordan) · **Date**: 2026-07-12 · **Stage**: stream close

**claim**: Plan 040 is complete on local trunk. New pij sessions mint
collision-safe `pij-<adjective>-<animal>` primary ids; existing opaque ids remain
unchanged. Durable native identity, spawn/adopt, filesystem/env/wire/telemetry,
Copilot `/new`, pending phonehome recovery, and mixed-version rollout behavior were
implemented, reviewed through three cold rounds to final **APPROVE**, live-proven under
the daemon-restart baton, documented, and committed in `18b7421` + `9575976`.
Expected-red: **none**. Push-main is intentionally deferred to the consolidated
o-prime/Jordan double gate.

**artifacts[]**:
- production: `.pi/extensions/pij/core/memorable-id.ts`,
  `adapters/fs-registry.ts`, identity/binding/spawn/CLI/Copilot wiring
- tests: candidate-space, real multi-process allocation races, Pi lifecycle, spawn,
  agent spawn, adopt, phonehome, Telegram, and real CLI integration
- package: exact `unique-names-generator@4.7.1` pin and npm lock closure
- operator/domain docs: `docs/how/pij.md`,
  `docs/domains/{pij-messaging,pij-control-plane}/domain.md`
- canonical plan: `docs/plans/040-memorable-pij-session-ids/memorable-pij-session-ids-plan.md`
- research/validation/rulings: plan folder dossier, validator artifact, and seven rulings
- execution: `execution.log.md`
- review: `reviews/review.phase-1.md`, F004 live finding, three frozen patch artifacts
- live proof: `reports/t009-live-proof.md`
- phase handoff: `reports/phase-1-checkpoint.md`
- commit boundary: `reports/commit-manifest.md`
- harness retros:
  `.harness/records/retro/2026-07-11/009-040-memorable-pij-session-ids-review.md`
  and `.harness/records/retro/2026-07-12/001-shared-observations-2026-07-12.md`
  (outside s040 commit fence; prime curation)

**shas[]**:
- feature + plan evidence: `18b7421` - 56 files, `+12294/-303`
- phase completion metadata: `9575976` - 3 files
- final reviewed patch:
  `5e17053e023457184a86605dc36f39c6fe0f442ed5dafe949b512c3709ecc877`
- final review artifact:
  `32532d835ac398627116248164b225fdf857922ed0bdb1ada29c948fd133c6bd`
- T009 live proof:
  `656e704c14c428b45e68e1ebd47c78c9dbfa50a89ace06040a5f4dd527d5df9e`
- phase checkpoint:
  `11776033ca7ed7a2c6ea9ef18b09a9f520dd6295434945ee53b97014020f4dea`
- F004 mutation restore:
  `a833468e1a790c1d3ff132b6da1905839c10129d7a1fe88163c213fda352da0e`

**gates[]**:
- Plan: READY, Simple/CS-5; validate-v2 **VALIDATED WITH FIXES**.
- Review round 1: FIX_REQUIRED - F001 CRITICAL, F002/F003 HIGH.
- Review round 2: APPROVE - synchronized six-process races and adopt output fixed.
- Live F004 superseded acceptance: Copilot `/new` stole an old durable primary id.
- Review round 3: APPROVE - F001-F004 resolved, all 10 dimensions PASS.
- Reviewer Dim-0:
  - allocation descriptor-compatibility mutation RED -> byte-identical restore -> GREEN;
  - Copilot global-fallback mutation RED (2 failures) -> byte-identical restore -> GREEN.
- Reviewer stress:
  - eight synchronized six-process allocation rounds PASS;
  - widened occupied-legacy stress 60/60 callers converged, no occupied-id reuse or
    disappearing identity records.
- F004 delayed-directory proof: old descriptor checksum/tuple unchanged; fresh pending
  memorable id bound only to current Copilot env UUID through phonehome.
- T009 reviewed live:
  - daemon PID `66261` -> `39754`;
  - existing `pij-concrete-reptile` delivery/reply PASS;
  - fresh `pij-medieval-jaguar` spawn/self-id PASS;
  - safe pending `pij-endless-cuckoo` -> autonomous phonehome exact bind PASS.
- Full done gate: `harness checks` PASS typecheck, lint, test, smoke, package audit,
  snapshots.
- Commit hooks passed; exact pathspec staging; o-prime independently verified commit
  path sets and empty index.

**observations[]**:
- F001: by-native publication before live-descriptor compatibility created a real
  same-native race; true multi-process tests and publish ordering closed it.
- F002: the original "concurrent" test was sequential; naming is not proof of overlap.
- F003: adopt persisted a bound native id but rendered outer stale state as null/pending;
  final descriptor is now output authority.
- F004: global Copilot session-directory mtime can reattach a fresh `/new` agent to an
  old primary id. `COPILOT_AGENT_SESSION_ID` is canonical; process argv and
  `inuse.<pid>.lock` remain stale across `/new`.
- Two `cli.integration.test.ts` untangle rounds exposed that pathspec commits protect
  files, not hunks. INC-002 repaired the accidental sweep before push and added
  lint/format to window-commit gates.
- Mixed-version field data:
  - memorable peers `pij-minimal-wasp` and `pij-gigantic-goat` could bind/send outward
    but not receive through the pre-change daemon;
  - reviewed restart restored routing;
  - allocator also generated `pij-concrete-reptile`, `pij-vital-tiglon`,
    `pij-medieval-jaguar`, and `pij-endless-cuckoo`.
- Pending recovery is not terminal after reviewed restart: daemon init/watchdog
  triggered phonehome without manual pane injection.
- `pij send --wait` can time out before eventual delivery and nonce reply; output should
  distinguish late confirmation from hard loss.
- Jordan observed an intermittent Enter/input issue; not reproduced, retained as a
  watch item.
- Flow-pair harness gaps:
  - route-documented model/roster controls are absent from the shipped CLI;
  - Simple plans require a synthetic tasks directory;
  - `observe` cannot scope to delegation-owned paths in a shared dirty tree;
  - mutation recipe does not expose its script's custom test-command argument.
- `harness checks` package audit refreshed report-only vet dates; timestamp churn was
  restored to pre-check bytes.
- Working-tree memorable-id CLI was dogfooded before commit, producing valuable rollout
  data but requiring classic-id review before machine-wide restart.

**open[]**:
- O-1: consolidated push-main is owned by the o-prime behind deconflict + Jordan typed
  go. This stream must not push.
- O-2: `pij-aa756x` remains quarantined; remediation is Jordan-owned.
- O-3: delayed receipt semantics and the intermittent Enter/input issue remain
  follow-up observability work if reproduced.
- O-4: flow-pair CLI/route parity, path-scoped observe, Simple-plan tasks-dir, and
  mutation-command forwarding are harness backlog candidates.
- O-5: shared harness retro records remain outside the s040 fence for prime curation.
