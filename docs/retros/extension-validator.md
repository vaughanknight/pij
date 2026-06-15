
## 2026-05-27T06:08:28.487Z — extension-validator / 2026-05-27T16-06-01-915Z-e0ce

- runId: 2026-05-27T16-06-01-915Z-e0ce
- runDir: /Users/jordanknight/pi-hacking/pij/agents/extension-validator/runs/2026-05-27T16-06-01-915Z-e0ce
- summary: Ran the pi-peacock smoke scenario once through the Driver SDK. The SDK reported 7 passed steps and 0 failed steps, but the final capture showed "Error: pi-peacock: unknown color or command status/peacock", so the scenario appears to be a false-positive smoke because it asserts stable footer rendering rather than extension-specific behavior. Full aggregate counts are in runSummary because minih system validation requires summary to be a string while the extension-validator output schema requires it to be an object.
- **magicWand** (target: project): I wish harness/driver/run.ts added resolved command metadata to RunReport.sessionMetadata, specifically the pi executable path, pi version, tmux version, and any preflight stderr, so a validator can explain PATH/version mismatches without running separate probes.
- difficulties:
  - [medium] scenario-author: The pi-peacock smoke scenario can pass while the extension reports "unknown color or command status/peacock" because every extension command assertion checks only the stable footer, not command-specific output or absence of an Error line. (workaround: Recorded the final capture and called out the false-positive risk in the envelope instead of repairing the scenario.)
  - [low] driver-sdk: The validator had to run separate preflight probes for tmux and pi metadata, and the Driver SDK run exposed a different pi version than the shell preflight, but RunReport did not include enough command-resolution metadata to diagnose why. (workaround: Included both observed versions in notes and targeted the magic-wand wish at Driver SDK metadata.)

## 2026-05-27T06:12:40.117Z — extension-validator / 2026-05-27T16-09-05-416Z-2ece

- runId: 2026-05-27T16-09-05-416Z-2ece
- runDir: /Users/jordanknight/pi-hacking/pij/agents/extension-validator/runs/2026-05-27T16-09-05-416Z-2ece
- summary: Ran the pi-peacock smoke scenario through the pij Driver SDK in tmux. The scenario itself passed with 11 executed steps, 11 passed, 0 failed, and durationMs 4464; however, minih validation cannot be made fully green because the extension-validator output schema requires /summary to be an aggregate object while the minih system schema requires /summary to be a string.
- **magicWand** (target: coordination): I wish the extension-validator system envelope and output-schema.json did not reuse /summary for incompatible meanings; make the human-readable string summary live at /summaryText or the aggregate counts live at /scenarioSummary so minih check can validate both layers at once.
- difficulties:
  - [medium] scenario-author: Default discovery found smoke.ts, but the CLI contract only accepts JSON files; native RegExp values in the TypeScript scenario are not directly consumable by extension-validator without conversion. (workaround: Materialized an equivalent temporary JSON scenario using the documented { source, flags } regex wire format, then invoked npx tsx harness/driver/run.ts --scenario <tmpfile>.)
  - [low] driver-sdk: The scenario passed, but the final capture includes an extension error line for /peacock status even though the stable footer regex satisfied every step, so the current scenario asserts shell stability rather than command correctness. (workaround: Recorded the final capture verbatim so the curator can decide whether the smoke assertion should be tightened around pi-peacock command output.)
  - [high] minih-coordination: The run-specific output-schema.json requires top-level summary to be the aggregate { passed, failed, durationMs } object, but minih check enforces a system-level string at /summary, creating an impossible single-field contract for a passing file. (workaround: After two incompatible validation attempts, wrote this failure envelope using the minih-required summary string and preserved aggregate counts under scenarioSummary and results[0].summary.)

## 2026-05-27T06:16:09.401Z — extension-validator / 2026-05-27T16-13-24-613Z-07e1

- runId: 2026-05-27T16-13-24-613Z-07e1
- runDir: /Users/jordanknight/pi-hacking/pij/agents/extension-validator/runs/2026-05-27T16-13-24-613Z-07e1
- summary: Validated pi-peacock with one discovered smoke scenario through harness/driver/run.ts; the scenario passed 13 steps with no failed assertions in 4473ms. minih check could not be made fully valid because the system schema requires top-level summary as a string while extension-validator's output schema requires it as an object.
- **magicWand** (target: project): I wish harness/driver/run.ts could accept a TypeScript smoke module path directly (or expose a --smoke-module flag that serializes RegExp fields itself) so extension-validator would not need a bespoke tsx materialization step before passing JSON to --scenario.
- difficulties:
  - [medium] driver-sdk: Discovered smoke scenarios are TypeScript modules with native RegExp values, but the validator invocation contract only accepts JSON scenario files, so a separate serialization step was required before running harness/driver/run.ts. (workaround: Used npx tsx to import .pi/extensions/pi-peacock/smoke.ts and recursively encode RegExp values as { source, flags } before invoking the Driver CLI.)
