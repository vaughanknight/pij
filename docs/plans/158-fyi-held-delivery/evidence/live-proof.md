# Plan 158 live proof (production daemon at 5b61a4cf, 2026-09-29)

## Setup
- **Merge and bounce:** PR #452 merged as `5b61a4cf`. The canonical checkout was pulled, then `just bounce-rs` ran. The daemon installed the Claude `UserPromptSubmit` hook into `~/.claude` and `~/.claude-alt` (`claude prompt hook: …=touched`).
- **Proof seats:** three fresh seats, spawned from the merged tree so they loaded the new hooks and extensions:
  - Claude `pij-happy-yak` (`sonnet`, pane `%116`)
  - OMP `pij-sparkling-carp` (`github-copilot/claude-sonnet-5.5`, `%117`, extension build `5b61a4cf59`)
  - Copilot `pij-neighbouring-hookworm` (`gpt-5.6-sol`, `%118`, native extension)
- **Driver:** a throwaway script (not committed) drove each seat with real `pij send` / `pij send --fyi` from `pij-yelling-trout`, plus a typed prompt through `tmux send-keys`. It read the harness's own transcript and the daemon's spine read-only.

## Results

| check | Claude | OMP | Copilot |
|---|---|---|---|
| `pij send --fyi` receipt | `held (fyi)` | `held (fyi)` | `held (fyi)` |
| no turn opened: transcript bytes grew | 0 | 0 | 0 |
| no turn opened: pane unchanged | yes | yes; the only diff is the new `✉1` footer line | yes |
| `pij state` `pendingFyis` after hold | 1 | 1 | 1 |
| `✉1` shown | status-line script renders `✉1`[^1] | footer `✉1` live | status-line script renders `✉1`[^1] |
| (a) typed prompt: FYI injected | once: one `hook_additional_context` / UserPromptSubmit attachment | once: one `custom_message` (`pij-fyi`) | once: one `user.message` with the hook context |
| (a) spine receipt | `fyi.delivered` via `hook:claude` | via `hook:omp` | via `hook:copilot` |
| (a) `✉` cleared, pending 0 | yes | yes | yes |
| (b) real message: receipt | `queued — fyi-ride-along` (pane-bound, drained) | `queued — extension-stream` | `queued — extension-stream` |
| (b) FYI appended to the same message, after its body | yes: `Reply with only the word ACK2.\n\nAlso, 1 FYI was queued for you:\n1. [from pij-yelling-trout, 19:28] …` | yes | yes |
| (b) spine receipt | `fyi.delivered` via `message:<carrier id>` | same | same |
| (b) pending after | 0 | 0 | 0 |
| busy/idle during the typed turn (Addendum 3) | not published: Claude has no producer, reads `idle` | **`working` observed, then `idle`** | **`working` observed, then `idle`** |

[^1]: Claude and Copilot re-run their status-line command only on their own render events, so an idle seat shows `✉N` at its next status-line refresh, not immediately. `whoami` returns `pending_fyis`, and each script run by hand against the live daemon printed `… ⛓ <seat> ✉1 …` while one FYI was held. OMP's footer updates live from the event stream.

## Also observed
- **Governance observer:** at boot, both bounces logged `governance delivery observer stopped: store/orchestration: pool timed out`, under the fleet's reconnect burst at load average ~40–90. It first appeared on 2026-09-26 and is not caused by this plan. `follow_deliveries` stops for good on its first error and is not restarted. The daemon itself is healthy (`pij ping` ok). A follow-up is needed to make that observer resilient, as the drain and bind loops are.
- **Existing seats:** they keep their old extension builds until they `/reload`, so they neither publish busy/idle nor claim FYIs on typed turns yet. Held FYIs still ride along to them on the next real message.

## Raw driver output (ids and numbers)
```
{"step": "hold", "seat": "pij-happy-yak", "stdout": "pij send: held (fyi) \u2014 a9df25bb4fbfec9d-0000000000000000", "rc": 0, "t": 1790674081.1}
{"step": "after-hold", "seat": "pij-happy-yak", "state": ["idle", 1], "transcript_grew": 0, "pane_unchanged": true, "envelope_badge": false, "marker_in_transcript": 0, "t": 1790674096.2}
{"step": "typed", "seat": "pij-happy-yak", "observed_working": false, "turn_secs": 21.2, "state": ["idle", 0], "marker_in_transcript": 2, "block_header_in_transcript": 2, "envelope_badge": false, "fyi_events": [["fyi.held", {"held_at_ms": 1790674081100, "id": "a9df25bb4fbfec9d-0000000000000000", "sender": "pij-yelling-trout"}], ["fyi.delivered", {"ids": ["a9df25bb4fbfec9d-0000000000000000"], "via": "hook:claude"}]], "t": 1790674120.9}
{"step": "hold-2", "seat": "pij-happy-yak", "stdout": "pij send: held (fyi) \u2014 a9df25bb4fbfec9d-0000000000000001", "t": 1790674121.1}
{"step": "before-real", "seat": "pij-happy-yak", "state": ["idle", 1], "envelope_badge": false, "t": 1790674124.2}
{"step": "real-send", "seat": "pij-happy-yak", "stdout": "sent (rs) \u2014 msg a9df25bb4fbfec9d-0000000000000002 \u2014 receipt queued \u2014 fyi-ride-along", "t": 1790674124.5}
{"step": "ride-along", "seat": "pij-happy-yak", "observed_working": false, "turn_secs": 20.6, "state": ["idle", 0], "marker_in_transcript": 3, "envelope_badge": false, "fyi_events": [["fyi.held", {"held_at_ms": 1790674121137, "id": "a9df25bb4fbfec9d-0000000000000001", "sender": "pij-yelling-trout"}], ["fyi.delivered", {"ids": ["a9df25bb4fbfec9d-0000000000000001"], "via": "message:a9df25bb4fbfec9d-0000000000000002"}]], "t": 1790674148.2}
{"step": "hold", "seat": "pij-sparkling-carp", "stdout": "pij send: held (fyi) \u2014 a9df25bb4fbfec9d-0000000000000003", "rc": 0, "t": 1790674173.8}
{"step": "after-hold", "seat": "pij-sparkling-carp", "state": ["idle", 1], "transcript_grew": 0, "pane_unchanged": false, "envelope_badge": true, "marker_in_transcript": 0, "t": 1790674188.9}
{"step": "typed", "seat": "pij-sparkling-carp", "observed_working": true, "turn_secs": 4.5, "state": ["idle", 0], "marker_in_transcript": 1, "block_header_in_transcript": 1, "envelope_badge": false, "fyi_events": [["fyi.held", {"held_at_ms": 1790674173827, "id": "a9df25bb4fbfec9d-0000000000000003", "sender": "pij-yelling-trout"}], ["fyi.delivered", {"ids": ["a9df25bb4fbfec9d-0000000000000003"], "via": "hook:omp"}]], "t": 1790674197.2}
{"step": "hold-2", "seat": "pij-sparkling-carp", "stdout": "pij send: held (fyi) \u2014 a9df25bb4fbfec9d-0000000000000004", "t": 1790674198.1}
{"step": "before-real", "seat": "pij-sparkling-carp", "state": ["idle", 1], "envelope_badge": true, "t": 1790674201.3}
{"step": "real-send", "seat": "pij-sparkling-carp", "stdout": "sent (rs) \u2014 msg a9df25bb4fbfec9d-0000000000000005 \u2014 receipt queued \u2014 extension-stream", "t": 1790674201.6}
{"step": "ride-along", "seat": "pij-sparkling-carp", "observed_working": false, "turn_secs": 20.1, "state": ["idle", 0], "marker_in_transcript": 1, "envelope_badge": false, "fyi_events": [["fyi.held", {"held_at_ms": 1790674198066, "id": "a9df25bb4fbfec9d-0000000000000004", "sender": "pij-yelling-trout"}], ["fyi.delivered", {"ids": ["a9df25bb4fbfec9d-0000000000000004"], "via": "message:a9df25bb4fbfec9d-0000000000000005"}]], "t": 1790674224.9}
{"step": "hold", "seat": "pij-neighbouring-hookworm", "stdout": "pij send: held (fyi) \u2014 a9df25bb4fbfec9d-0000000000000006", "rc": 0, "t": 1790674234.2}
{"step": "after-hold", "seat": "pij-neighbouring-hookworm", "state": ["idle", 1], "transcript_grew": 0, "pane_unchanged": true, "envelope_badge": false, "marker_in_transcript": 0, "t": 1790674249.4}
{"step": "typed", "seat": "pij-neighbouring-hookworm", "observed_working": true, "turn_secs": 6.4, "state": ["idle", 0], "marker_in_transcript": 3, "block_header_in_transcript": 3, "envelope_badge": false, "fyi_events": [["fyi.held", {"held_at_ms": 1790674234232, "id": "a9df25bb4fbfec9d-0000000000000006", "sender": "pij-yelling-trout"}], ["fyi.delivered", {"ids": ["a9df25bb4fbfec9d-0000000000000006"], "via": "hook:copilot"}]], "t": 1790674259.4}
{"step": "hold-2", "seat": "pij-neighbouring-hookworm", "stdout": "pij send: held (fyi) \u2014 a9df25bb4fbfec9d-0000000000000007", "t": 1790674259.7}
{"step": "before-real", "seat": "pij-neighbouring-hookworm", "state": ["idle", 1], "envelope_badge": false, "t": 1790674262.7}
{"step": "real-send", "seat": "pij-neighbouring-hookworm", "stdout": "sent (rs) \u2014 msg a9df25bb4fbfec9d-0000000000000008 \u2014 receipt queued \u2014 extension-stream", "t": 1790674263.0}
{"step": "ride-along", "seat": "pij-neighbouring-hookworm", "observed_working": true, "turn_secs": 4.2, "state": ["idle", 0], "marker_in_transcript": 7, "envelope_badge": false, "fyi_events": [["fyi.held", {"held_at_ms": 1790674259651, "id": "a9df25bb4fbfec9d-0000000000000007", "sender": "pij-yelling-trout"}], ["fyi.delivered", {"ids": ["a9df25bb4fbfec9d-0000000000000007"], "via": "message:a9df25bb4fbfec9d-0000000000000008"}]], "t": 1790674270.2}
```
