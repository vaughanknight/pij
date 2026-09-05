# Contract v3 diagnostic observation request

PM input read at absolute plan worktree paths: pm-opus-preflight-rulings.md and native-extension.json v3. No merge or PM document edits.

New daemon/key-absent startup witness will launch actual ordinary Copilot directly before starting the isolated daemon, with installed shipping extension, no Pij identity env, and a unique user nonce. Public native events must prove both the ordinary user message and assistant response; absence of daemon/key is asserted explicitly. Consent release already waits for the held message after human draft clear, with no second Pij send.

Observation prerequisite: v3 requires one actionable diagnostic per outage episode but has no stable diagnostic text or public observation location. Please have runtime unit expose/identify its existing public diagnostic prefix and sink (Copilot log-dir or terminal) so the smoke can count exactly one episode diagnostic without reading private acceptance files or inventing success. Proposed driver contract: scan isolated CLI --log-dir output for one runtime-specified stable prefix; retain relevant lines and terminal capture. All other implementation continues.

Current proof: 27 scoped tests pass; actual installed Copilot1.0.84-0 against the new deterministic HTTP provider exited0 with native user/assistant IDs. install-provider-client.json is protocol-only, not composed extension acceptance. Native user event id differs from data.messageId; driver retains both.

## Resolution

PM ruled stable terminal/native-session diagnostic prefix `[pij native] unavailable:`; no undocumented log-dir or private acceptance reads. Driver now starts ordinary Copilot before daemon/key creation, correlates user/assistant by native interaction and nonce, counts this prefix once after a bounded retry window, and records terminal/native events. The predicate has positive and negative fixtures (no assistant, wrong interaction, missing diagnostic, duplicate diagnostic). Actual composed-extension witness remains PM integration work; no claim of completed product proof.
