# Task: omp/pi anti-step-on must be draft-aware, not activity-aware

From: pij-minor-unicorn (prime). Reply ONLY via the pij_send tool (bodies to disk + path pointer when long). Load skills /pij and /builder first; act from contracts. Worktree: `/Users/jordanknight/pi-hacking/pij-omp-draft-aware-hold` (branch `omp-draft-aware-hold`, off main). `cd` there first. Never touch `/Users/jordanknight/pi-hacking/pij` (main), its node_modules, the live daemon, or global links. Do NOT `npm install`; if node_modules is missing in the worktree, say so and use main's binaries read-only via absolute paths (`/Users/jordanknight/pi-hacking/pij/node_modules/.bin/vitest`).

## Jordan's ruling (2026-09-06)
Observed: Jordan clicked in the omp text area, typed nothing, a pij message arrived (toast shown) and sat unsteered for up to 60 s. Ruling: hold ONLY while the editor holds a non-empty draft. The 60 s recency grace qualifies that draft (an abandoned draft eventually admits delivery). Empty editor ⇒ deliver now, whatever input happened. Mouse/navigation input never counts. Toast + `⏸ N held · typing` status stay.

## Where it lives (plan 136 code)
- Sensor: `.pi/extensions/pij/adapters/pi-runtime.ts` `onEditorChange` wraps `ctx.ui.onTerminalInput` ("all terminal keys count").
- Rule: `.pi/extensions/pij/core/hold-queue.ts` `HoldQueue.shouldHold(at)` = `at - lastEditAt < graceMs`. Nothing reads editor content.
- Consumers: `.pi/extensions/pij/adapters/rust-runtime.ts` (`routeClaim` ~:369/:429 hold decision, `releaseHeld`, `injectAndAck`, HOLD_TICK drain). Daemon side `/v1/hold` `/v1/release` and `Queue::defer` stay as they are; this is extension-side only unless you prove otherwise.
- The Claude gate (plan 134) and the Copilot gate (today, `native_typing_snapshot` in crates/daemon/src/delivery/mod.rs) already implement "recognized blank ⇒ permit; recency only qualifies a non-blank draft". Match that semantics.

## Do
1. Find pi's editor-text read for extensions (the interactive TUI's `ctx.ui.getEditorText()` — the RPC/headless stub returns ""; confirm the interactive implementation returns the composer text; the installed omp is `~/.npm-global/lib/node_modules/@oh-my-pi/pi-coding-agent/dist/cli.js`, read-only). If no reliable read exists, say so with evidence and propose the nearest honest alternative before building.
2. Change the rule: `shouldHold(at, draft)` ⇒ `draft.trim().length > 0 && at - lastEditAt < graceMs`. Sample the draft at decision time (claim routing and each drain tick), not only on input events, so a cleared/submitted editor releases on the next tick.
3. Input classification: only count input that can change the draft. Mouse SGR/X10 sequences, focus events, plain arrow/menu navigation must not arm the timer. Keep it simple and evidence-based: read what pi hands the callback and classify.
4. Tests (RED first): hold-queue unit tests for (a) empty draft + recent input ⇒ no hold; (b) non-empty draft + recent input ⇒ hold; (c) draft cleared ⇒ next drain releases; (d) mouse sequence ⇒ lastEditAt unchanged. Existing 136 tests keep passing; update any whose premise was "any input holds" with a one-line reason.
5. Gates: `vitest run .pi/extensions/pij` (via main's binary if needed), `npx biome check` on touched files, `npm run typecheck`. Then one live proof against the PRODUCTION daemon using your own hand-started omp seat in this worktree (NOT Jordan's): click/arrow in the editor, have a peer (me) send you a message, show it injects within one tick with an empty editor; then type a draft, receive again, show `⏸ 1 held`, clear the draft, show release. Paste the spine seqs (`~/.pij-rs/pij.sqlite` spine_events: delivery.held/released for your msg id) — I will send the probe messages when you ask.
6. Deliver: one commit (Co-Authored-By trailer of your harness), report: sha, gate tails, proof seqs, anything not run. No push, PR, merge, bounce.
