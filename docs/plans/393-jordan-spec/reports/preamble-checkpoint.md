# Preamble checkpoint — jordan-spec (s393)

**Seat**: pij-dependent-ptarmigan · **Date**: 2026-08-28 (AEST; ~2026-08-27T15:2xZ) · **Worktree**: `/Users/vaughanknight/GitHub/pij-worktrees/s393-jordan-spec` · **Branch**: `s393/jordan-spec` · **HEAD**: `4a5cf85` = `origin/main` (rebased twice: `be31e66` → `c0d68da` → `4a5cf85`) · **Card**: spine 26559

## claim
Read-only survey complete; no mutation outside `docs/plans/393-jordan-spec/` yet. Ready to write `docs/specs/claude-copilot-sqlite-sockets-comms.md` from the merged tree. Brief acked (`dispatch-c9aecae5-…`, packet sha b9e057b3…); deliverable definition read from `government/briefs/jordan-spec-deliverable-definition.md` (source sha c38bb2d6…).

## artifacts[]
- `docs/plans/393-jordan-spec/thesis.md` (fit-mode, SKILL.md contract applied by the seat)
- this file

## shas[]
- main/HEAD `4a5cf85` (spec header will cite this sha)
- brief `government/briefs/jordan-spec-brief.md` sha256 b9e057b3dbfec5242ca0471fa558e35f25d6ab72bf8e2e670cdfa3f027166177
- definition sha256 c38bb2d672f88b36a035c41256606bb13ec89eb1bfd31070213697ea18b78a8e

## gates[]
- `git status` clean after rebase; `git log --oneline -1` = 4a5cf85 (o-prime's definition commit on main)
- Read: `reports/pij-comms-review-2026-08-27.md` §1–13 + `{benchmarks,c-durable-queue-design,e-copilot-codex-ipc}.md` + `b-tmux-injection.md` §5; `docs/how/pij.md` §Push/pull, §Delivery routing, §Queue inspection, §Protocol; `docs/how/pij-telegram.md`; s392 plan v1.3.0, `deferred-codex-phase.md`, `reports/finding-C-daemon-instanceof-ticket.md`, `doctrine-amendment-pointer-relaxation.md`, phase-1/2/4 reports; adapters `sqlite-queue`, `channel-factory`, `queue-consumer`, `claude-socket`, `copilot-rpc`, `codex-rpc`, `daemon-tmux`; `core/daemon/loop.ts` + routing-invariant tests; `daemon.ts` drain/startup; `telegram/bridge.ts`, `index.ts` receiver; `core/cli.ts` receipt classification + stdout flush; `core/spawn.ts` copilot argv; `core/inbox.ts`; PR bodies #1–#6, #9, #11–#13; orient-local; the pane-misbind incident record (read-only, for the technical residue only)

## observations[]
- OBS-01 / friction / brief pointed at an uncommitted file in another stream's worktree (`jordan-spec-deliverable.md`); resolved by o-prime committing a verbatim copy to main. Encode: a brief's "read first" path must be on the dispatch base sha (a `pij dispatch` validator could stat the path on the base).
- OBS-02 / insight / finding C (`daemon.ts` `instanceof SqliteQueue` gate) is already FIXED on main (`daemon.ts:1172` uses `sqliteOf`; PR #11) and `docs/how/pij.md` footnote already says dual takes the pointer path — the deliverable definition's gotcha (a) must be written as hit-and-fixed, not open. `daemon.ts:1628` still branches on `instanceof` but only to pick the log label; both branches call `resetClaimsOnStart`.
- OBS-03 / insight / `pij inbox --inject` exists in `core/inbox.ts:128` (parseInboxArgs) — the hook-drain path from PoC day-2 item 5 is on main.
- OBS-04 / win / all report line numbers re-verified against `4a5cf85` before citation (the review cites `b5f1fb1`-era lines; several moved, e.g. `loop.ts:582-653` → `:619-737`).

## open[]
- Q to o-prime (sent 15:2xZ): one-line technical definitions of day-3 items 13/15/16/17/18 for the "outstanding" section. Not blocking; placeholders until answered.
- Reviewer: ONE cold copilot gpt-5.6-sol xhigh via `/pij pair` after the draft exists (standalone-ness, file:line anchors on `4a5cf85`, completeness vs "must cover").
- Issue creation on `AI-Substrate/pij`: only on the o-prime's explicit GO.

## Position / next / decisions
- **Where**: spec not yet started; plan folder seeded.
- **Next**: write the spec (single file, sectioned: overview → store → state machine → routing → per-harness transports + wire frames → consumers → CLI/receipts → benchmarks → doctrine → gotchas → outstanding → test map → glossary), commit on `s393/jordan-spec`, cold review, PR.
- **Open decisions for Vaughan**: none at this point.
