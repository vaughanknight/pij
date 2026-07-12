# Plan 040 rulings

## 1. Memorable name is the actual primary pij session id

**Jordan**: "eh? just the actual pij-session-id? is there a need for more than this?"

**Selected**: Replace the primary key itself everywhere with the memorable name.

**Effect**: Plan 040 will not add a separate `alias`, `displayName`, or hidden opaque pij-id. The memorable `pij-<words>` value becomes the registry key, data-directory key, environment value, wire address, and telemetry join key. The implementation plan must therefore include collision-safe allocation and backward-compatible handling of existing opaque ids.

## 2. Two words, no suffix

**Selected**: Always two words; atomically retry another pair on collision.

**Effect**: Primary ids remain `pij-<word>-<word>`. Allocation must probe deterministic alternate pairs and publish with no-replace semantics until one is claimed; numeric/hash suffixes and three-word ids are out of scope.

## 3. Use the exact-pinned package

**Selected**: `unique-names-generator@4.7.1`.

**Effect**: Keep the exact version pin so seeded dictionary ordering is a compatibility contract. The existing PoC dependency is retained; vendored dictionaries and another package are out of scope.

## 4. No in-place migration of existing ids

**Selected**: Keep existing ids unchanged; only newly created sessions get memorable ids.

**Effect**: Durable tuple lookups, live descriptors, and legacy opaque ids continue to resolve exactly as stored. The memorable allocator runs only when pij is minting a genuinely new identity.

## 5. Validation and implementation fleet

**Jordan**: "when ready /validate-v2 in a suagent on the plan then /pij copilot gpt 5.6 sol coder and a separte reviewer te same model"

**Effect**: Validate the unified plan through a fresh `/validate-v2` peer. Implementation is delegated through pij to a Copilot GPT-5.6 Sol coder and a separate Copilot GPT-5.6 Sol reviewer; the stream orchestrator does not implement product code itself.

## 6. Release the package manifest/lockfile seam to s039

**O-prime ruling (SW-5, spine Seq 26)**: Revert s040's unstaged `unique-names-generator@4.7.1` additions in `package.json` and `package-lock.json` to `HEAD` so s039 can stage its dependency work.

**Effect**: The research dossier retains the evidence. The PoC-only source, test, script, and `just` recipe are also removed because they import the now-unmanifested package and would break after npm prunes extraneous modules. If implementation keeps the pinned package, s040 re-adds the production code and dependency only after s039's lockfile rewrite and an explicit s040 fence grant.

## 7. `pij adopt --id` is reattachment-only

**Selected**: Allow `--id` only to reattach an already-existing id; unknown ids fail `E-NOID`.

**Effect**: Manual first adoption without an existing descriptor omits `--id` and receives an allocated memorable id. `--id` no longer mints arbitrary caller-chosen primary identities; conflicting native tuples remain `E-AMBIG`.

## 8. Push-main authorization

**Jordan, typed in the s040 pane at 2026-07-12T11:06:28+10:00**: "push"

**Scope**: Authorizes the already-deconflicted fast-forward of local `main` commits
`40528df..4bc5ab0` to `origin/main`:

- `18b7421` - memorable session ids
- `9575976` - Plan 040 phase completion
- `4bc5ab0` - government/ship close snapshot

**Effect**: This is the human half of the push-main double gate. The push executes only
after o-prime grants baton request `request-b5138923-f767-4f6d-9378-683c51241cfd`.
