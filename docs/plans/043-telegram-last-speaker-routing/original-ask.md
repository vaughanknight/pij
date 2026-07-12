# Original ask — plan 043: telegram bare-message last-speaker routing

**From**: Jordan, via the Telegram bridge (voice-typed, live), 2026-07-12. Two messages, verbatim:

> Please collect a new issue on Mum. It's for telegram so when I respond to when I don't respond when I don't reply to a particular message and I just type into the chat I want to automatically address the last agent that spoke in the chat at the moment it addresses the last agent that I directly addressed by putting even a partial name matching whereas it should just respond to whoever spoke last unless of course I actually use the telegram's proper reply to thing which is the current behaviour is working correctly.

> Yeah I think far up a new orchestra using Copilot GPT 5.6 soul as the main orchestra have it work up The Builder flow and then have it wait for me once it gets past the plant stage please if it's got any questions you can ask me here on telegram

## O-prime reading (bound context)

- The work item is **GitHub issue #8** (filed from the first message): bare Telegram chat messages (no reply-to, no name/partial-name match) route to the **last agent that spoke** in the chat; Telegram's reply-to feature and explicit name matching keep current behavior.
- Orchestrator: copilot gpt-5.6-sol ("GPT 5.6 soul"), /builder flow ("The Builder flow"), **hard stop after plan stage** ("wait for me once it gets past the plant stage") — the WAITING_FOR_BUILD_CONFIG stop, same as s042's dogfood ruling.
- Clarify questions route to Jordan **on Telegram** via the o-prime (stream → o-prime → pij-telegram bridge).
- Worktree era (spine Seq 44): planning is plan-folder-only; worktree + branch allocated at implementation fence time.
- Likely surface: the telegram bridge routing logic (`.pi/extensions/pij/telegram/**` — `telegram/match.test.ts` exists; note s040 recently touched it for memorable-id matching).
