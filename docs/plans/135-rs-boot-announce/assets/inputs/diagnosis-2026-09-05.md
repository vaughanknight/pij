---
name: rs-boot-announce-suppressed
description: "Since the rs cutover (c048ebc2, 2026-08-30) omp/pi seats no longer get the boot announce ('You are pij session …'): the rs runtime seeds every rs seat row into the legacy registry BEFORE PijSession.boot, so `fresh = registry.read(id)===null || dissolved` is false and the inject is skipped."
metadata:
  type: project
---

**Symptom (Jordan 2026-09-05)**: omp boots silently — no `announceText` ("You are pij session <id> … pij_send …").
Last session with the announce on disk: 2026-08-28. Cutover commit `c048ebc2 feat(pij): connect extension to rust daemon` is 2026-08-30.

**Mechanism** (`.pi/extensions/pij/`):
- `core/session.ts` `PijSession.boot`: `fresh = liveDescriptor === null || wasDissolved`; announce injected only when `fresh`.
- `adapters/rust-runtime.ts` `RustRuntimeSession.boot`: `for (seat of seats) this.registry.seed(fromRustDescriptor(seat))` runs **before** `this.session.boot(...)`, seeding all rs rows (850, never reaped) — so the chosen id is already present → not fresh.
- `chooseIdentity` reuses ids by samePane / sameProcess / `PIJ_SESSION_ID`; spawn pre-mints the row (2× `seat.put` before `spawn.bound`); a hand-started seat (`pij-grim-gurgeh`, 8× `seat.put`) reuses its id every boot. Either way the row exists at boot.
- `fromRustDescriptor` sets no `lifecycle`, so `wasDissolved` is never true under rs.

**Live proof**: `pij-rs spawn --harness omp --bin omp` → `pij-real-horse`; pane showed `rs·pij-real-horse` status and no announce; spine had seat.put ×2 before `spawn.bound`.

**Coverage gap**: `rust-runtime.test.ts` stubs `PIJ_ANNOUNCE_TO` but never asserts the announce fires on an rs boot; the assertion lives only in legacy `session.test.ts`.

**Fix shape** (not yet done): rs needs its own first-boot signal — e.g. treat "this process's first `session_start` for this id" as fresh (the daemon can say whether `register` created vs re-bound), or seed the registry *after* `session.boot`, or pass `durableDescriptor` and let `liveDescriptor` stay null on first boot. Add an rs-path test that asserts `inject(announceText…)` on a spawned seat.
Related: [[pij-rs-dev-daemon]], [[agreement-confirms-count-not-interpretation]] (the never-reaped rows are the same root).
