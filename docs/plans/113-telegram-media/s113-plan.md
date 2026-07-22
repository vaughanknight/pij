# s113 — rich media over the pij Telegram bridge — PLAN

**Seat**: pij-sacred-porcupine · **Worktree**: `~/GitHub/pij-worktrees/s113-telegram-media` · **Branch**: `feat/telegram-media` (from main @ 497ef1c) · **Status**: EXECUTED — GO received 2026-07-22; W1/W2/W3 + W5 scope-add landed; W4 ratified (grammar stays `--file`, no alias).

## Scope add (W5, prime-ratified mid-run, from live incident)

Media forward failures were silent (daemon-side log only; sender's receipt said "delivered" for the bridge hop). Landed: (a) ONE bounded retry on transient network-shaped failure (`isTransientSendError` — fetch/socket/DNS/timeout/429/5xx by message; deterministic 400s never retried), (b) on final failure an honest echo injected back to the SENDING session — `[pij-telegram] media forward FAILED: sendPhoto network error — /path.png (…)` (`mediaFailureNotice` + `ForwarderDeps.echoFailure`, wired to `channel.deliver` in index.ts), (c) 4 forwarder tests: retry-then-recover (silent), retry-exhausted (echo to sender, not speech), no-retry-on-400 (one attempt), no-echo-seam degrades to log + queue not wedged.

## Gate results (2026-07-22)

- **typecheck**: GREEN (after the ratified out-of-fence one-liner in `producers/conformance.ts` — undefined-guard on a regex group, revert-trivial, marked with an s113 note).
- **tests**: telegram + CLI suites 462 passed / 0 failed (15 new). Full suite: 3263 passed, ONE failure in `harness/scripts/release-age-policy.test.ts` — `spawnSync pwsh ENOENT`: needs PowerShell, not installed on this machine; file untouched by this branch (last touched by #25). Environmental, pre-existing.
- **lint**: telegram module + all s113 files clean (biome). Repo-wide lint FAILS on main baseline (verified via stash) in `producers/*` and two `core/*` test files from 497ef1c — pre-existing, not expanded here (formatting-only churn in files this branch doesn't own was deliberately not applied).

## Headline finding

**The core ask already shipped on main.** Commit `fd1d065` ("Telegram bridge — address sessions from your phone, media both ways", plan 026 Phase 5) plus follow-ups implemented media in both directions, end-to-end, with tests and the how-doc. I verified each brief requirement against the code (not the docs) and ran the suite: telegram + CLI tests are **447 passed / 0 failed** on this branch.

What exists, mapped to the brief:

| Brief req | Status | Where |
|---|---|---|
| 1. Outbound grammar | ✅ shipped | `pij send pij-telegram --file <path> [--caption "…"]` (body + file also allowed; one file per send; `--caption` requires `--file`; `--file` excludes `--command`) — parse in `core/cli.ts:815-831`, tested in `core/cli.test.ts:240-264` |
| 1. ext → bot method | ✅ shipped | `telegram/media.ts` `classifyMedia`: jpg/jpeg/png/webp → sendPhoto, gif/mp4 → sendAnimation, else → sendDocument. Wired in `telegram/index.ts:222` |
| 2. Inbound download | ✅ shipped | Bridge downloads via grammY files to `~/.pij/<session-id>/attachments/<sanitised-name>`; injected turn is a **path pointer** + caption (`buildInboundNotice`); addressing = same precedence as text (swipe-reply → name-prefix → last-speaker) |
| 3. Fences | ✅ shipped | Allowlist is middleware #1 — non-allowlisted media dropped before any download; oversize honest errors (10 MB photo / 50 MB other outbound, fallback text notice; 20 MB inbound pre-checked **before** getFile); token stays in owner-only `~/.pij/telegram.env`, never logged |
| 4. Compat | ✅ shipped | `attachments` key added to the wire **only** when `--file` given — plain text sends round-trip byte-identical; non-telegram peers ignore the field; old daemon + new CLI = unknown-key-tolerant JSON both ways |
| 5. Tests | ✅ shipped | grammar parse, ext→method, caps, sanitisation, allowlist-drop, oversize paths all unit-tested with injected fakes — **no network, no token** anywhere in tests |
| 6. Docs | ⚠️ partial | `docs/how/pij-telegram.md` covers media fully; **`pij telegram --help` does not mention media at all** |
| 2. Bounded size/retention | ❌ missing | Nothing prunes `attachments/` dirs — they grow forever |

## Proposed work (the actual s113 delta)

**W1 — retention policy for inbound media (the one real gap).**
Policy: per-session `attachments/` dir bounded to **200 MB**; after each successful inbound save, prune oldest-mtime files until the dir is back under the cap (never pruning the file just saved). Pure helper `pruneAttachments(entries, capBytes)` in `telegram/media.ts` (decides *which* to delete from a `{name, mtime, size}[]` — exhaustively unit-testable), thin fs wrapper in `telegram/index.ts` where the downloader already owns the fs. Policy stated in the how-doc. Inbound is already hard-capped at 20 MB/file, so the cap ≈ last 10+ files worst-case.

**W2 — extend `pij telegram --help`** (`TELEGRAM_USAGE` in `telegram/index.ts`): add the outbound media grammar + caps and the inbound save-location line. Snapshot-style assertion in `init.test.ts`/`index.test.ts` family.

**W3 — how-doc touch-up**: add the retention policy section to `docs/how/pij-telegram.md`.

**W4 — grammar ruling (no code)**: brief floated `--media`; the shipped, documented grammar is `--file`/`--caption`. I propose **keeping `--file` as the grammar** (adding a `--media` alias = surface without value). Plan states it exactly as: `pij send pij-telegram [--wait[=ms]] ["body"] --file <path> [--caption "text"]`.

**No live-API leg**: existing law already keeps token out of tests; I will not add an env-gated live test unless prime wants one.

## Blocker to flag

`npm run typecheck` **fails on main** (pre-existing, not mine): `producers/conformance.ts(24,50) TS2345 string|undefined` — introduced by 497ef1c (the Producer B PROPOSAL commit). Gate-green report is impossible without either (a) a one-line guard fix in that file rolled into this branch, or (b) prime ruling it out-of-scope/known. **Need a ruling with GO.**

## Gates & report

`npm run typecheck` · `npm run test` (full vitest) · `npm run lint` (biome). On green: report HEAD SHA to prime. **No merge — prime owns it.**

Estimated size: ~120 lines prod + ~150 lines tests + docs. Single commit.
