# Research Dossier: Memorable pij session identities

**Generated**: 2026-07-11T11:12:00Z
**Query**: "How should pij introduce deterministic, memorable human-readable session names while preserving stable identity, collision safety, compatibility, and migration behavior?"
**Effort**: Standard
**Tools**: Mixed
**Evidence**: 13 current sources · 4 historical sources

## Answer

The safest design is to keep the existing opaque `pij-id` as the immutable machine
identity and add a memorable alias as additive descriptor metadata. The machine id is
already a filesystem key, environment value, wire address, telemetry join key, and
durable native-identity owner; replacing it would turn a naming feature into a registry
and storage migration.

Generate the alias deterministically from the stable machine id, not directly from a
harness-native id. This works before control-plane binding, preserves `/reload` and
restart behavior, and avoids renaming a peer after `spawn` has already returned its id.
Persist the selected alias in the descriptor snapshot so collision resolution and future
dictionary changes cannot rename an existing peer.

The current two-word proof of concept is not collision-safe by itself: its
adjective-animal corpus has 426,710 combinations. Under the birthday approximation,
100 identities have about a 1.15% chance of at least one collision and 331 identities
about 12%. Alias ownership therefore needs an atomic claim or a deterministic suffix;
the existing two-way durable identity machinery is the model to reuse.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | Current ids are deterministic from Pi's native session id, stable across `/reload` and `/resume`, fresh across `/new` and `/fork`, and namespaced by harness for adoption. | `.pi/extensions/pij/core/discovery.ts:12-47`; `.pi/extensions/pij/index.ts:220-281` | Any visible name must preserve those lifecycle semantics. | High |
| F-02 | Restart identity is the exact `(harness, harnessSessionId)` tuple; existing bindings win, occupied candidates fail with `E-AMBIG`, and reattachment preserves durable metadata. | `.pi/extensions/pij/core/binding.ts:130-195`; `.pi/extensions/pij/adapters/fs-registry.ts:149-312` | Alias generation must not replace or weaken the native tuple-to-machine-id join. | High |
| F-03 | The registry already proves concrete collisions in the legacy 32-bit derivation and refuses two native tuples sharing one `pij-id`. | `.pi/extensions/pij/adapters/fs-registry.test.ts:201-225` | A finite word space requires explicit collision ownership, not an assumption that seeded output is unique. | High |
| F-04 | The primary id is structural: it names descriptor files and data directories, is exported as `PIJ_SESSION_ID`, and is used for event, inbox, and state paths. | `.pi/extensions/pij/adapters/fs-registry.ts:1-112`; `.pi/extensions/pij/index.ts:272-310`; `.pi/extensions/pij/core/types.ts:46-84` | Keep filesystem/storage keyed by the machine id; make the memorable value additive. | High |
| F-05 | CLI operations resolve `send`, `tail`, `state`, and `path` by exact registry id; `list` and `sessions` expose the id as their stable contract. | `.pi/extensions/pij/core/cli.ts:490-507`; `.pi/extensions/pij/core/cli.ts:626-684`; `.pi/extensions/pij/core/cli.ts:841-959`; `.pi/extensions/pij/core/session-join.ts:1-47` | Add a shared address resolver that accepts exact id first, then unique alias; do not silently change telemetry's `pijId`. | High |
| F-06 | A control-plane id is allocated before the pane exists and before Claude/Codex native identity discovery, then returned and injected through `PIJ_SESSION_ID`. | `.pi/extensions/pij/core/spawn.ts:233-246` | Deriving an alias from the already-known machine id avoids post-bind rename and harness-specific generation paths. | High |
| F-07 | Human surfaces embed the id in peer frames and boot guidance; Telegram builds prefix forms from the id and chooses the newest match when prefixes collide. | `.pi/extensions/pij/core/message.ts:1-68`; `.pi/extensions/pij/telegram/match.ts:18-79` | Display aliases can improve messages and lists, but ambiguous shorthand must fail or follow an explicit documented policy. | High |
| F-08 | `SessionDescriptor` is migration-oriented: control-plane fields are optional and legacy descriptors remain valid. | `.pi/extensions/pij/core/types.ts:46-123`; `government/orient-local.md:13-17` | Add `displayName?: string` or `alias?: string`; old descriptors can fall back to their machine id and be upgraded lazily. | High |
| F-09 | The PoC exact-pins `unique-names-generator@4.7.1`, seeds it deterministically, and exposes a fixed 426,710-name adjective-animal space. | `package.json:65-73`; `package-lock.json:7535-7543`; `.pi/extensions/pij/core/memorable-id.ts:1-16`; `.pi/extensions/pij/core/memorable-id.test.ts:1-25` | Pinning is necessary because dictionary order affects seeded output; collision handling remains mandatory. | High |
| F-10 | The installed package adds no transitive dependency entry, and the before/after audit retained the repo's existing 34-finding baseline. | `package-lock.json:7535-7543`; `.harness/records/retro/2026-07-11/004-pij-memorable-id-poc.md:10-20` | Supply-chain surface is small, but package age and corpus ownership still need a deliberate decision. | Medium |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | T029 made identity collision isolation, exact tuple ownership, metadata snapshots, and `/new`/`/fork` freshness reviewed acceptance criteria. | `docs/plans/019-pij-tmux-control-plane/reviews/t029-restart-identity-review.md:8-32` | Direct | Reuse its fail-loud, first-writer-wins pattern for aliases rather than weakening it. |
| H-02 | Plan 031 established `pijId` as a stable telemetry join key and made harness-specific native-session resolution load-bearing. | `docs/plans/031-pij-telemetry-join-keys/pij-telemetry-join-keys-plan.md:185-210`; `docs/plans/031-pij-telemetry-join-keys/validations/pij-telemetry-join-keys-plan-validation.md:18-48` | Direct | Keep `pijId` stable; expose alias as an optional additional projection if consumers need it. |
| H-03 | Telegram's original plan already recorded first-token/address collisions as a medium risk and preserved an explicit-address option. | `docs/plans/026-pij-telegram-bridge/pij-telegram-bridge-plan.md:66-72`; `docs/plans/026-pij-telegram-bridge/pij-telegram-bridge-plan.md:292` | Direct | Alias lookup needs ambiguity tests across CLI and Telegram, not only generation tests. |
| H-04 | Session-scoped state defines same-session persistence and new/fork independence by native session identity. | `docs/domains/session-work-state/domain.md:20-31` | Partial | The alias must mirror identity lifecycle, but must not become the source of session-state identity. |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| Two-word collisions | F-03, F-09 | A friendly name can block session creation or address the wrong peer if treated as unique without ownership. | Decide atomic alias claim plus deterministic retry/suffix behavior; test a forced collision. |
| Existing peers and durable snapshots | F-02, F-04, F-08 | Recomputing aliases from a newer dictionary could rename peers between restarts. | Persist the chosen alias; old descriptors use id fallback until a safe lazy claim succeeds. |
| Address ambiguity | F-05, F-07, H-03 | Exact machine ids are unique; memorable prefixes are not. | Exact id wins; exact alias next; ambiguous partial alias returns `E-AMBIG` with candidates. |
| Package and corpus age | F-09, F-10 | The package's latest release is 4.7.1 from 2022, and its vocabulary may contain undesirable or unstable words. | Decide between exact-pinned dependency, vendored curated dictionaries, or another maintained corpus. |
| Identifier versus display semantics | F-04-F-08 | Replacing `SessionDescriptor.id` expands scope across storage, telemetry, government, messages, and every command. | Plan an additive alias first; only reconsider primary-id replacement with a separately justified migration. |

## Domain Impact

| Domain / boundary | Relationship | Contract or constraint | Evidence |
|-------------------|--------------|------------------------|----------|
| `pij-messaging` | Owns machine identity and wire framing | Preserve `SessionId`, `PIJ_SESSION_ID`, descriptor compatibility, and `/new`/`reload` semantics. | F-01, F-04, F-07 |
| `pij-control-plane` | Owns durable native identity and pre-bind allocation | Alias must be known before launch or persisted independently; exact tuple reuse remains authoritative. | F-02, F-03, F-06 |
| pij CLI / Telegram | Consumes addresses and renders human identity | Resolve exact id and alias consistently; ambiguity is explicit. | F-05, F-07, H-03 |
| telemetry / orchestration consumers | Treat `pijId` as a join and ownership key | Alias is additive metadata, never a replacement join key in the first version. | F-05, H-02 |

## Planning Handoff

- **Preserve**: exact native tuple ownership, immutable machine `pijId`, first-writer-wins claims, descriptor/data paths, `PIJ_SESSION_ID`, lifecycle semantics, and exact-id command compatibility.
- **Change carefully**: add an optional persisted alias; generate from the stable machine id; claim aliases atomically; resolve exact id before alias; reject ambiguous shorthand.
- **Likely files/symbols**: `core/types.ts::SessionDescriptor`; a new pure naming/address module; `adapters/fs-registry.ts`; `core/session.ts`; `core/cli.ts`; `core/session-join.ts`; `telegram/match.ts`; `core/message.ts`; spawn/adopt/index wiring; focused tests and `docs/how/pij.md`.
- **Decisions still required**: `displayName` versus `alias` terminology; two words plus collision suffix versus three words; exact-pinned dependency versus vendored corpus; whether aliases appear in telemetry JSON; lazy alias allocation for existing descriptors.

## External Research

| Question | Why repo evidence is insufficient | Planning impact | Prompt |
|----------|-----------------------------------|-----------------|--------|
| Which maintained Node/TypeScript corpus best supports stable, moderated adjective-noun aliases? | The repo proves `unique-names-generator` works and is dependency-free, but cannot establish current maintenance, vocabulary quality, or stronger alternatives. | Chooses dependency versus vendored dictionaries and determines whether seeded output can be a durable compatibility contract. | "Compare maintained Node/TypeScript human-readable name generators for a durable CLI identifier alias. Require deterministic seeding, custom/moderated dictionaries, no install scripts, small dependency surface, stable corpus/versioning, and adjective-noun output. Include publish dates, licenses, transitive dependencies, and migration risks." |
