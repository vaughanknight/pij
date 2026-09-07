# OMP steering timing — measured mechanism

## Baseline and matrix

Runtime: OMP 18.0.10, github-copilot/gpt-5-mini; all live clients were owned scratch tmux windows. No installed runtime, global links, main checkout, or production daemon configuration was modified.

Full receipts: `steer-matrix.json`. The `prior_instrumentation_contaminated` rows mixed parent and child extension events and are not parent-consumption proof. Subsequent unguarded parent-only observation showed no ACK within 150 seconds despite message.pushed seq **16022** and delivery.inbox-ack seq **16025**. The parent draft remained intact. The incoming message was consumed by a child, not the parent.

The 15 rows with `root_handler_guard:true` use a temporary wrapper suppressing non-UI extension callbacks to isolate injection semantics. Each row contains timestamps, exact draft, snapshot samples, pane captures, parent-only events, and message.pushed/inbox-ack spine receipts. These are controlled mechanism experiments, not proof of the unmodified product.

| Variant | Idle ACK ms | Bash ACK ms | Fan-out ACK ms | Draft at ACK |
|---|---:|---:|---:|---|
| custom steer | 2015 | 31181 | 46344 | intact all |
| custom followUp | 2070 | 47467 | 48911 | intact all |
| user steer | 2928 | 32530 | 46717 | clobbered all |
| custom attribution:user + queue chip | 7801 | 31375 | 47490 | intact all |
| manual Enter control | 2478 | 31415 | 46695 | intact all |

Busy bash is a foreground sleep30; fan-out is two sleep30 children plus a parent sleep45. The original work requests additional work after the blocking call. Manual controls submit the steering text, then type an independent draft 300ms later; the manual submission necessarily consumes its own editor input. API rows type the draft before sending. Arrival-toast visibility is distinct from transcript message_start and model ACK; the raw pane samples preserve both.

## Mechanism citation (before fix)

1. **The PM defect is inbox ownership theft.** Installed `src/task/executor.ts:3213-3217` creates children with their own session manager and `hasUI:false`, in-process at `:3258`. The bundled equivalent is `dist/cli.js:18586` (`sessionManager:Qt,hasUI:!1,...taskDepth:F`), followed by child runtime initialization and `emit({type:"session_start"})` at **`:18588`**. Factories rebind against fresh child runtimes, not a shared parent sender.
2. Pij's only child suppression was `.pi/extensions/pij/index.ts:55`, `isSubagentChild(process.env)`, whose implementation in `core/discovery.ts:67-73` recognizes only `PI_SUBAGENT_CHILD`/`PI_SUBAGENT_DEPTH`. In-process OMP children set neither. Consequently `index.ts:320-393` starts another `RustRuntimeSession`, passing the inherited **same TMUX_PANE/process** with the child's native session (`:365-375`). Child registration acquires the parent's peer identity/inbox. The parent-only timeout and the successful guarded matrix distinguish this from a queue latency issue.
3. **Custom steer already reaches the native steering queue.** Bundled **`dist/cli.js:17381`**, `async sendCustomMessage(e,t)`, normalizes the payload, then `if(this.isStreaming) ... if(t?.deliverAs==="followUp") this.agent.followUp(r); else this.agent.steer(r)`. Source equivalent `src/session/agent-session.ts:6701-6743`. The matrix's inject timestamp followed by custom message_start at the first tool boundary is the exercised busy branch; idle triggerTurn exercises `:6768-6774`.
4. **Attribution controls user queue classification.** Bundled **`dist/cli.js:1224`** `hasSteeringMessages` returns `{queued:true,source:"user"}` for `attribution==="user"`; otherwise a custom message is system-source. Source equivalent `pi-agent-core/src/agent.ts:1494-1513`. `src/session/agent-session.ts:6873-6875` filters queue display through `isUserQueuedMessage`. Attribution belongs in the custom payload, not options. The measured configuration does not interrupt a running foreground bash even for typed steering; all steer variants consumed at the first tool boundary. No claim of mid-sleep ACK is made.
5. **User-role messages clobber drafts; custom-role messages do not.** Bundled **`dist/cli.js:19099`** message_start checks local submission signatures and executes `if(!e.message.synthetic){if(!l)this.ctx.editor.setText("")...}` in the user-role branch. Custom rendering takes the separate role branch. All three user-API rows clear the draft; all custom rows preserve it without editor writes.
6. **User attribution has an additional editor side effect.** `src/modes/controllers/input-controller.ts:1518,1566-1577` clears user-restorable queues and prepends their text to the current draft on Escape. `src/session/agent-session.ts:6850-6858` and `src/session/queued-messages.ts:60-63` include displayed custom messages attributed to user. The owned `escape-control.json` proves the pij envelope was prepended to the draft. The final `escape-final.json` proves byte-identical draft preservation after removing attribution. `pi-agent-core/src/agent-loop.ts:2427-2452` interrupts on any queued steering source; user attribution is not needed.

Exact bundled excerpts are in `cli-mechanism.json`.

## Chosen extension-only change

- **Retain original custom steer + triggerTurn, default agent attribution.** Keep the exact pij envelope and arrival toast. No editor snapshot/restore workaround. The user-attribution experiment was rejected by the live Escape regression, then pinned RED by three adapter assertions before removal (`artifact://62`).
- **Use PR #376's exact child discriminator.** Reconciled from `3248f4874c4f4d6304ba85dfa2645a5249721eee` by jakkaj (Copilot coauthor): OMP `mode:"print"` plus pre-start `session_init`. Skip child boot/shutdown and reject child Pij send/spawn/close/command operations. No daemon, installed OMP, global, or main-checkout modifications.
- **The deciding matrix cell is an independently hosted headless root.** `headless-context.jsonl`: `mode:"print", hasUI:false`, entries `model_change,thinking_level_change` only. `reconciled-contexts.json`: interactive root `tui` has no `session_init`; every observed child has `print` plus `session_init`. Installed `executor.ts:3348` writes this metadata before `:3434` emits session_start. The broader no-UI guard/PIJ_HEADLESS_SEAT opt-in was removed, not combined.
- PR #376's unique classifier/root-preservation regressions were retained; this task adds two-child lifecycle and all three child peer-tool denial cases. Their four expected failures against the broad guard were observed (`artifact://72`) before reconciliation. Final focused selection: **118 passed, 4 intentionally skipped opt-in live tests** (`artifact://77`).

## Verification status

Fresh reconciled product, no experimental guard: root `pij-rising-bovid`, native session `01a0797f-7170-7000-8f96-684fad2ec90b`, two-child fan-out ACK 46,344 ms at first tool boundary; draft intact. `message.pushed` **16434** / `delivery.inbox-ack` **16437**. Exact classification and Escape controls passed; independent reviewer reported no material findings.

Canonical `just step-on-probe` now has `--state idle|bash|subagents`, original-parent transcript and identity proof, real work completion markers, and an ACK-before-remaining-work-completes gate. `--thinking minimal` is recorded explicitly: ambient high effort originally exhausted the model's tool-start deadline. A second discovered fixture defect (inline compound shell commands violating OMP bash constraints) was corrected with host-written fixture scripts invoked as one `/bin/sh` binary. Failed attempts are retained, not counted as delivery passes.

Final canonical probe receipts and full gate result are appended below when settled. Baseline harness boot initially failed `file-watch-notify`; the first full `harness checks` run later passed all nine sensors. Final candidate is re-gated after reconciliation. Observation DL-001 is preserved in `docs/retros/omp-steer-timing.md` and the busy proof encoding.

## Accepted canonical receipts

All commands use `PIJ_STEP_ON_REAL=1 just step-on-probe --harness omp`, the installed read-only `--pij-bin`, and an owned isolated daemon/tmux server. The exact fixed system prompt, model, and effort are recorded under `omp_configuration`; these are controlled delivery probes, not unrestricted coding-agent instruction-following benchmarks.

| State | Model / effort | Context ms | Model reply ms | Draft | Native root stable | Push / ACK | Receipt |
|---|---|---:|---:|---|---|---|---|
| idle | gpt-5.4-mini / low | 236 | observed | intact | n/a | 5 / 8 | `step-on-idle-green.json` |
| bash | gpt-5-mini / minimal | 30037 | 32060 | intact | yes | 5 / 8 | `step-on-bash-verified.json` |
| subagents | gpt-5.4-mini / low | 45161 | 46620 | intact | yes | 5 / 8 | `step-on-subagents-accepted.json` |

Each seq pair belongs to its receipt's isolated daemon, not the production spine. The final subagent parent was `pij-ideal-skellor` / `01a07999-a25c-7000-a9b1-c5f3221faef4`. Busy proof requires the direct native `custom_message` / `customType:pij` entry with the exact sender envelope, preceded by the original parent blocking toolCall and no intervening terminal assistant response. Child-result forwarding and early-yield followUp cannot satisfy this criterion.

The injected ACK instruction may legitimately replace unfinished work; no unrelated requirement to resume superseded work is imposed. Model-only failures/refusals and the one unreadable redraw sample are retained in prior attempt receipts. Unreadable composer frames are reacquired within one second and counted; changed or empty readable drafts fail. This proves sampled readable-frame preservation, supplemented by the native editor-event matrix and Escape control, not continuous screen monitoring.

Final focused tests: **119 passed, 4 opt-in skipped**, six files (`artifact://129`). Final independent review: **no material findings**, including direct-delivery provenance, first-tool-boundary discrimination, and bounded snapshot reacquisition.

## Final gate

Serial `harness checks` after all source/test/doc changes exited **0**. All nine sensors passed: local-paths, typecheck, lint, test, copilot-native, windows-compat, smoke, pkg-audit, snapshots. Full emitted gate envelope and stderr: `checks-final.log`. Earlier intermittent smoke/windows-compat failures are not presented as final passes; the final serial invocation is green.

Only owned probe clients were started/closed. The installed runtime, live daemon configuration, main checkout, global links, and Jordan's seats were untouched. Existing OMP processes retain their loaded extension closures and child subscribers; production activation should use a safely checkpointed fresh/resumed Main process, not a registry session id already contaminated by a child. No production activation is claimed.

## Delivery

One local commit on `omp-steer-timing`: **`f7210a2011cd05dbc48d95a98c76c21d7c6abf0a`** (`fix(omp): keep parent steering out of in-process subagents`). Credits PR #376 / jakkaj in the body and carries jakkaj, Copilot, and OMP (GPT-6 Astra) coauthor trailers. No push, PR creation, or merge performed.
