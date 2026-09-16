# Plan 153 — omp is a harness, not a switch on pi

Prime: pij-far-jackal. Branch `153-omp-first-class`, worktree `/Users/jordanknight/pi-hacking/fs3-omp-first-class`.

## Defect (Jordan, 2026-09-16: "I ask for omp and they launch pi")

The daemon already models them apart: `crates/core/src/model.rs:37` says `Omp` is a distinct variant, `pij-rs spawn --harness omp` works, adapters parse omp's footer separately, the live fleet has 5 omp + 4 pi seats. The agent-facing surfaces do not:

1. **In-process spawn is pi-only by construction.** `.pi/extensions/pij/index.ts:266` `pij_spawn` has NO harness parameter and describes itself as "Spawn a new pij worker session running pi". `core/spawn.ts:711` models omp as `--harness pi --bin omp` — "bin" is the switch. An agent in an omp seat asked to spawn an omp peer has no word for it.
2. **The skill collapses them.** 28 occurrences of `pi/omp`, `OMP/Pi`, `Pi/OMP` across `skills/pij/**` and `docs/how/pij-rs-api.md`; the spawn grammar lists `pi|omp` with no rule for choosing; `pij models` is unported so an agent cannot see which catalog a model belongs to (omp wants provider-qualified ids such as `github-copilot/gpt-6-astra`).
3. **The extension's home is named after pi.** One codebase in `.pi/extensions/pij` serves both binaries via `detectPiRuntime` (`core/discovery.ts:51`); omp honours `.pi/` so it works, but every path an agent reads says pi.

## Rule

**`omp` and `pi` are two harnesses in every surface an agent reads or calls: distinct names, no shared default, no `bin` switch.** A spawn that does not name its harness is refused (the rs CLI already does this: `main.rs:2690`); on this machine `pi` is refused by policy unless explicitly allowed.

## Acceptance criteria — each RED first, outputs in report.md

- **AC1 In-process spawn names the harness.** `pij_spawn` gains a REQUIRED `harness` parameter (`omp|pi|claude|copilot|codex`, no default); description and promptGuidelines rewritten without "running pi". `SpawnRequest.harness` accepts `"omp"`; `bin` becomes an executable-path override only and is refused as a harness selector (`--harness pi --bin omp` → decodable refusal naming the fix). Tests: spawn.test.ts cases at ~1009 flip; a new test that `harness: "omp"` launches the `omp` executable with omp's flag translation (effort, no `--branch`).
- **AC2 Retired-harness policy.** Daemon config (env `PIJ_RETIRED_HARNESSES=pi` default on this machine via `just bounce-rs`; documented) makes `pij-rs spawn --harness pi` and in-process `harness: "pi"` answer a refusal "harness pi is retired on this machine; use omp (or pass --allow-retired)". Rust test RED; the override flag works and is logged as a spine event.
- **AC3 Skill and contract split.** Zero occurrences of `pi/omp|omp/pi|Pi/OMP|OMP/Pi` in `skills/pij/**` and `docs/how/pij-rs-api.md` (grep receipt = 0). Each harness gets its own row where a table exists; one paragraph in `peer.md` and the API doc states the rule and the model-id form per harness with one example each. `~/.claude/skills/pij` is a checkout of `skills/pij` — verify with `readlink -f`, do not edit the copy.
- **AC4 Extension home.** Verify whether omp discovers a project `.omp/extensions/` (global `~/.omp/agent/extensions/pij` exists). If yes: move the project extension to `.omp/extensions/pij` and leave `.pi/extensions/pij` as a symlink; `pij whoami` on an omp seat shows the new `extension_path`. If no: say so with the probe, keep the location, and put a `README.md` in `.pi/extensions/pij` naming both runtimes. Either way the runtime detection stays.
- **AC5 Live proof (isolated daemon).** From an omp seat: `pij_spawn({harness:"omp", model:"github-copilot/gpt-6-astra"})` → child registers with `harness: omp`, `pij whoami` shows omp; `pij_spawn({harness:"pi"})` → policy refusal text; `pij-rs spawn --harness pi --allow-retired` → spawns pi, spine event recorded. Paste envelopes.
- **AC6 `pij models` is out of scope** but the report names the exact gap it leaves (agents still cannot enumerate per-harness catalogs) for the next plan.

## Non-goals

Porting `pij models`; changing omp/pi footers or readiness; touching Copilot/Claude/Codex spawn; production daemon (read-only); plan 151/152 files (`registration.rs`, receiver paths).

## Gates

`~/.cargo/bin/cargo test --workspace`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `npm test` for `.pi/extensions/pij`, `just self-check`. RED pasted before GREEN. Isolated daemon only.
