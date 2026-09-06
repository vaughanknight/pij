# Task: remove typing gates on non-tmux delivery paths; prove no step-on with a real-client test

From: pij-minor-unicorn (prime). Reply only via pij_send to pij-minor-unicorn (bodies to disk + pointer when long). Load /pij and /builder first. Worktree `/Users/jordanknight/pi-hacking/pij-remove-typing-gates` (branch `remove-typing-gates`, off main 04532561). `cd` there. Never touch main's checkout/node_modules, the live daemon (pid 45047, port 7461), or global links. Rust via `~/.cargo/bin/cargo`; TS tests via main's binary read-only (`/Users/jordanknight/pi-hacking/pij/node_modules/.bin/vitest`); do NOT npm install. Live proofs on an ISOLATED daemon built from this worktree (`--state-dir`, `PIJ_RS_ADDR`, own port), own tmux server if convenient, own hand-started clients in scratch cwds. Rust-only changes gate on cargo test/clippy/fmt; TS changes gate on the touched vitest files + typecheck via main's binaries.

## Jordan's ruling (2026-09-07), verbatim intent
Claude (UDS socket), Copilot (native extension), omp/pi (extension stream) do not deliver by tmux keystrokes any more, so their typing gates are unnecessary. A message MAY be submitted to the model while the human is typing, as long as it (a) never interrupts the human's typing and (b) never steps on / alters what is in the text box. Any seat that still receives by tmux send-keys (pointer-drain / TypedBody rungs) KEEPS its gate. Known omp bug to fix in the same task: when a message arrives, omp wipes the text box and submits the incoming message instead of the human's draft.

## Keep (not typing gates)
Semantic `Hold` (report state), consent/native-target holds (137), tap-ownership and Unrecognized safety for the send-keys rungs, 134 draft_sha on send-keys rungs. Additive events only; `delivery.held/released` stay for the rungs that still hold.

## Where the gates live (main 04532561)
- Claude socket path: crates/harnesses/src/interaction.rs `fresh_injection_verdict` → crates/daemon/src/pointer/worker.rs (~:236-260, `!verdict.permitted` ⇒ retry) and crates/daemon/src/delivery/mod.rs (~:349-392) feeding `select_rung(…, human_typing, composer_idle)` in crates/core/src/delivery.rs. For the Socket rung the verdict must stop being consulted (baseline capture may still be observed for the send-keys rungs).
- Copilot native: crates/daemon/src/delivery/mod.rs `native_typing_snapshot` (~:631) + `.copilot/extensions/pij/store.mjs` typing hold loop (`typingSnapshot`, `consent-held` human-typing branch ~:775-820). Remove the human-typing hold; keep consent/native-target/semantic holds.
- omp/pi: `.pi/extensions/pij/core/hold-queue.ts`, `adapters/pi-runtime.ts` (input classifier), `adapters/rust-runtime.ts` routeClaim/HOLD_TICK (`⏸ N held · typing`). Remove the hold; keep the arrival toast and `📨` visibility.
- Daemon `/v1/hold` `/v1/release` and `Queue::defer` may stay for semantic/consent holds; delete dead code only if nothing else uses it.

## Step 1 — the test FIRST (it is the classifier)
Build `harness/scripts/step-on-probe.ts` (or Rust equivalent under crates/testkit if cleaner) that, for a given harness in {omp, claude, copilot}:
1. starts an isolated daemon from this worktree and a real client in a scratch cwd, waits for registration (the client's own registration path, no adopt tricks);
2. types an UNSUBMITTED draft into the client's composer with `tmux send-keys` (no Enter), records the composer text (capture-pane) and its sha;
3. sends a pij message to the seat via the isolated daemon;
4. observes for N seconds: composer text after delivery (must equal the draft byte-for-byte), whether the model received the pij message (client transcript / reply), whether the draft was submitted (must NOT be), and the spine rows;
5. prints a verdict: `{harness, transport_rung, draft_intact, message_reached_model, draft_submitted, delivered_within_ms}`.
Run it on main FIRST (gates present) as the control, then after removal. omp is expected to FAIL the control on `draft_intact` (the clobber bug) — capture that as RED.

## Step 2 — fix the omp clobber
Find where the extension injects (`pi.sendUserMessage` immediate vs steer in `adapters/pi-runtime.ts inject`) and why an arrival replaces the editor text. Fix so delivery goes to the model without touching the editor buffer: if pi's API cannot submit a message while a draft is present without clearing it, say so with the API evidence and propose the nearest honest alternative (e.g. steer-only while draft non-empty) before building.

## Step 3 — remove the gates on the three paths, keep them on send-keys rungs
Then re-run the probe on all three harnesses; all must show draft_intact=true, draft_submitted=false, message_reached_model=true, delivered_within_ms ≤ one sweep (5 s). Run the probe once against a send-keys-only seat (pane, no socket) to show the gate still holds there.

## Tests
RED-first unit tests for each removed gate (the old "held on recent input" tests flip to "delivered"), updated 136/137 tests with one-line reasons, and the probe wired as an opt-in real-resource test (env-gated, never in the default vitest/cargo run). Existing suites green.

## Deliver
One commit (Co-Authored-By trailer of your harness). Report: sha; control-vs-after probe verdicts per harness (paste JSON); the omp clobber root cause line and fix; gate tails; what you could not run. No push/PR/merge/bounce.
