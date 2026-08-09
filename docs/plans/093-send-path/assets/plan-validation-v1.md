# Plan validation — v1, independent review

**Reviewer**: independent subagent (read-only), commissioned by `pij-historical-skunk`
**Target**: `093-send-path-plan.md` v1 + `assets/research-dossier.md`
**Date**: 2026-08-08
**Verdict**: **NOT READY** → plan rewritten as v2. Every blocking issue below was re-verified at
source by the PM before the rewrite; none was accepted on the reviewer's word alone.

## Citation verification

All dossier citations **CONFIRMED** except:

| Citation | Status | Reality |
|---|---|---|
| `core/cli.ts:1084` (empty-string guard) | **WRONG** | The guard is at `:1082-1083`; `:1084` begins `let waitMs`. (The claim it tests `undefined` not `""` was correct.) |
| `core/cli.ts:3034-3040` (plan-071 comment) | DRIFTED | Comment begins at `:3036`. |
| `cli.ts:4214` (help filter) | DRIFTED + **claim understated** | Filter is at `:4216`, and it does more damage than v1 assumed — see BL-5. |
| Dossier F-08 parent-argv probe | UNVERIFIED by reviewer | It was a live probe in the PM's session, not a repo artifact. Moot: ruled out of scope (pij#167). |

## Blocking issues (all confirmed at source by the PM)

| ID | Issue | Evidence | Resolution in v2 |
|---|---|---|---|
| BL-1 | **The `--body-file` safe path is broken.** `body.trimEnd()` destroys trailing bytes, and the body is re-appended as an **argv token** that the lexer then parses — a `--`-leading body becomes a flag, and `--wait` (valued on `send`) can swallow the file's contents. | `.pi/extensions/pij/cli.ts:4253` + `core/cli.ts:707-720` + `core/cli.ts:1084` | Promoted to headline finding ①; new tasks T008/T009 and AC-08/09; design invariant D4. |
| BL-2 | **`E-EMPTY` is not additive.** `EXIT: Record<PijErrorCode, number>` is exhaustive; adding a code without extending it fails typecheck — and that block sits **outside** v1's declared edit fence. | `core/cli.ts:665-678`; `core/types.ts:594` | T001 now names both edits; the edit fence is widened to include `~:665-678` (D3). |
| BL-3 | **A parse-only guard cannot work.** The pinned contract test and the `pij_send` tool both call `dispatch` **directly**, and parse cannot know the target — which the capability rule requires. | `core/cli.test.ts:745-770`; `index.ts:84-103` | Guard moved to `dispatch`, after preflight, before `deliver` (D1, AC-03). |
| BL-4 | **Broadcast never reaches the guard** — its branch returns before it. | `core/cli.ts:1013-1044` vs `:1082` | Separate broadcast check (T004, AC-04). |
| BL-5 | **`pij send --help` cannot show the safety note.** The filter keeps only lines containing `pij send`; the warning is an indented continuation line and is dropped. Editing USAGE alone cannot satisfy the prime's "labelled at the surface" bar. | `.pi/extensions/pij/cli.ts:4216` vs `:325-327` | New task T010 fixes the filter to carry continuation lines; AC-11 asserts real `--help` output. |

## Gaps the review found

| ID | Gap | Evidence | Resolution in v2 |
|---|---|---|---|
| G-1 | `--command` sends carry `body: ""` **legitimately** and would be caught by a naive guard. | `core/cli.ts:3005`; parse auto-routing `:1067-1078` | Explicit exemption row in the D2 table; AC-05 + a regression test. |
| G-2 | pij's **own generated onboarding** teaches the unsafe quoted form to every spawned peer. | `core/harness/claude.ts:152-156` | Promoted to finding ②; T012 + AC-12. |
| G-3 | `--body-file -` (stdin) already works; AC needed integration proof, not new implementation. | `.pi/extensions/pij/cli.ts:4237` | AC-10 reframed as proof; byte-exactness still needs BL-1's fix. |
| G-4 | Caller audit came back clean: no production path sends an intentionally-empty free-text body (daemon, watchdog, canary, dispatch, report, chore all checked with `--hidden`). | hidden sweep | Recorded as evidence the guard is safe to add. |

## Design challenges accepted

1. **Global refusal would have deleted a shipped capability.** Telegram deliberately supports
   attachment-only messages (`telegram/bridge.test.ts:1255-1310`). v1 said "refuse empty bodies";
   the dossier had said "refuse when the target cannot render attachments". **The plan had drifted
   from its own research.** v2 restores the capability-aware rule (D2).
2. **Text + `--file` to a push peer still lies** — the text arrives, the attachment is dropped, the
   receipt succeeds. v1 did not consider it. v2 adds AC-07: deliver, but warn on stderr and in
   `--json`.
3. **Capability cannot be decided in pure parse** — it needs the target descriptor. Reinforces D1.
4. **`E-EMPTY` widens a machine contract.** Accepted deliberately: a wrapper must be able to gate on
   "you sent nothing" separately from "you typed the flags wrong". Exit code fixed at `2` (D3).

## Test critique accepted in full

> *"The proposed control tests are ordinary fixed-behaviour assertions. A mutation comment is not
> evidence that they went RED without the fix."*

v2 replaces the comment-based convention with a **procedural** one: write the test, run it against
the unmodified tree, and paste the observed RED output into `assets/execution.log.md` **before**
implementing. Refusal tests additionally assert **`delivery.outbox` length unchanged**, which is the
assertion that actually distinguishes a refusal from a delivery — and which is RED today.
