# Phase 1 — Honest receipt + safe body channel

Plan: `docs/plans/093-send-path/093-send-path-plan.md` (read it in full — the AC table, the
D2 verdict table and the Constraints section are load-bearing).
Issues: pij#128, pij#132. Out of scope: pij#167.

## Read first, in order

1. `docs/plans/093-send-path/093-send-path-plan.md`
2. `docs/plans/093-send-path/assets/research-dossier.md`
3. `docs/plans/093-send-path/assets/plan-validation-v1.md`

## Non-negotiables

- **Test-first with a recorded RED.** For every guard, write the test, run it against the
  current tree, and paste the **actual failure output** into
  `docs/plans/093-send-path/assets/execution.log.md` before implementing. A comment claiming a
  mutation would fail is not evidence. Refusal tests must assert **`delivery.outbox` length
  unchanged** — that is the assertion that is RED today.
- **Edit fence.** `core/cli.ts` is co-owned with another stream working the `whoami` region.
  Edit ONLY: `~:665-678` (EXIT map), `~:1011-1100` (`case "send"` parse), `~:2107-2140`
  (classify/sendSuccess — comment only), `~:3000-3060` (send dispatch). In the bin
  `.pi/extensions/pij/cli.ts` edit ONLY `~:325-327`, `~:4212-4219`, `~:4220-4253`.
  **No reformatting, no import reordering, no tidying anywhere else in either file.**
- Repo rules: no `any`; no inline/dynamic imports; `.js` on relative imports; tagged-union
  returns, not throws; tests target the pure core + `adapters/fakes.ts`.
- `rg` needs `--hidden` in this repo or `.pi/` is invisible to it.
- Do not touch `the-flow.json`, `the-flow.md`, `.the-flow-state.json`, or `.flow-pair/`.

## Tasks

| ID | Task | Files | AC |
|---|---|---|---|
| T001 | Add `E-EMPTY` to `PijErrorCode` **and** to the exhaustive `EXIT` map (exit code `2`). The map is exhaustive — omitting it fails typecheck. | `core/types.ts:594`, `core/cli.ts:665-678` | AC-01 |
| T002 | Pure helper: effective delivery mode (`deliveryMode ?? (paneId ? "push" : "pull")`) + `targetRendersAttachments(descriptor)` = mode is `pull`. | `core/cli.ts` near `:2107` | AC-06 |
| T003 | **The guard.** In send dispatch, after target preflight, **before** `deps.delivery.deliver` — refuse per the plan's D2 verdict table. Add a comment at `classifySendReceipt` pointing at it. | `core/cli.ts:3000-3060`, `:2107-2140` | AC-01/02/03/05/06 |
| T004 | Broadcast: refuse an empty text body **before** the broadcast branch's early return at `~:1035-1044`. | `core/cli.ts:1013-1044` | AC-04 |
| T005 | Warn (stderr + a field in `--json`) when a delivered message carries an attachment the target cannot render. Deliver the text; never drop the reference silently. | `core/cli.ts:3000-3060` | AC-07 |
| T006 | Rewrite the pinned contract test: attachment-only to a **push** target now refuses; attachment-only to a **pull** target still delivers; text-only still round-trips with no `attachments` key. Comment the contract change. | `core/cli.test.ts:745-770` | AC-01/06 |
| T007 | Control tests for AC-01/02/03/04/05/06/07. Record the observed RED before T003. | `core/cli.test.ts` | AC-14 |
| T008 | **Fix `--body-file`.** Remove `trimEnd()`. The body must **never** be re-appended as an argv token (today a `--`-leading body is lexed as a flag, and `--wait` can swallow it). Parse the remaining argv without the body, then attach the literal body to the parsed send command. Also: explicit error if `--body-file` is combined with `--command`. | `.pi/extensions/pij/cli.ts:4220-4253` | AC-08/09 |
| T009 | Real-bin integration test (`spawnSync` on the wrapper) for `--body-file <path>` and `--body-file -`. Fixture body must contain trailing newlines AND trailing spaces, backticks, `$( )`, `${ }`, single and double quotes, a `;`, and a **first line beginning `--wait`**. Compare the delivered inbox JSON byte-for-byte. Record RED first. | new spec | AC-08/09/10/14 |
| T010 | Fix the `--help` filter so an indented continuation line following a matched USAGE line is kept. Today `pij send --help` silently drops the only shell-safety note that exists. Assert on real `pij send --help` output. | `.pi/extensions/pij/cli.ts:4212-4219` | AC-11 |
| T011 | USAGE: document `--file` distinctly from `--body-file`; recommend `--body-file`/stdin for relayed or untrusted content; label the quoted-body form unsafe for text the caller did not author; show the `<<'PIJ'` heredoc form. | `.pi/extensions/pij/cli.ts:325-327` | AC-11/13 |
| T012 | The spawn boot message currently teaches every peer the unsafe quoted form. Teach the safe form for relayed content. | `core/harness/claude.ts:152-156` | AC-12 |
| T013 | Same wording in the user guide. | `docs/how/pij.md` | AC-11 |

## Definition of done for this phase

`just typecheck && just lint && just test` all green, plus `npx vitest run .pi/extensions/pij`
on the touched specs. `docs/plans/093-send-path/assets/execution.log.md` shows a RED line and a
GREEN line for every acceptance criterion with a guard. Do **not** open a PR — the PM does that.
