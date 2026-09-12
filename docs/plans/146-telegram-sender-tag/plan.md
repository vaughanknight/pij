# Plan 146 — outbound Telegram messages name their sending seat

Owner: pij-minor-unicorn (prime). Ruling: Jordan via Telegram 2026-09-12 — "Your telegram messages are missing which pij agent sent them. Look at ts version then get an agent on it please."

## Problem (verified on main dd5b61fa, daemon 78248)
`crates/sidecars/src/telegram.rs` posts `{"chat_id": …, "text": request.body}` — the body verbatim. The `from` seat is used ONLY to record the reply binding, so every bubble in Jordan's chat is anonymous and he cannot tell which of ~80 seats is talking, nor which one a reply will reach.

The TS bridge solved this and its behaviour is the reference (`.pi/extensions/pij/telegram/bridge.ts`):
- `senderTag(from)` = `[<pij-id>]`, and the comment states WHY it is first: reply parsing depends on the id leading the bubble.
- `senderPrefix(from, context)` = `[<pij-id>] [<repo context>]`, context resolved from the sender's folder (`index.ts:217`, via `resolveRepositoryContext`).
- `prefixedTextParts` chunks the body at `TELEGRAM_TEXT_LIMIT` MINUS the prefix length, so prefix + part always fits; `chunk()` emits `(i/n)` parts (`telegram/chunk.ts`, 4000-char budget under Telegram's 4096 hard cap).
- Every bubble carries the prefix, media captions included.
- `normalizeSenderContent` strips an exact leading tag the body already has, so a seat that tags itself is not double-tagged.
- `boundedSenderPrefix` falls back to the bare tag if prefix + context would exceed the caption limit.

rs also has NO chunker: a body over 4096 chars is rejected by Telegram, and the failure surfaces only as `sendMessage returned HTTP <status>` in the daemon log while the job is marked done. So a long message is lost silently today.

## Acceptance
- AC1 Every outbound bubble begins with `[<sender-seat-id>] `. The tag is FIRST, exactly as TS, because the inbound path and the operator both read the leading id. Verified on a real send.
- AC2 Repo context second when it is known: `[<seat>] [<context>] <body>`. Resolve it from the sending seat's recorded `folder` via the registry rs already has (`Registry::get`); when the seat is unknown or has no folder, emit the bare tag and do NOT fail the send. Do not shell out to git on the send path — derive it from the folder, and say in the code comment what TS did differently and why the cheaper rule is enough.
- AC3 Chunking: a body that would exceed Telegram's 4096-char text limit is split into numbered `(i/n)` parts, each part's prefix counted against the budget so no bubble can exceed the cap. Parts arrive in order (the sidecar already serialises per job; assert ordering in the test). Port the boundary-preferring split from `telegram/chunk.ts` rather than inventing one; cite it.
- AC4 No double tag: if the body already starts with the exact tag (or tag + context prefix), strip it before prefixing, matching `normalizeSenderContent`.
- AC5 Honest failure: a rejected or failed `sendMessage` must not leave the job marked done with no trace. Record the outcome on the spine (kind and payload consistent with the existing telegram events) naming the chat, the msg_id and the HTTP status, and make the job's failure decodable. A per-part failure must name which part failed.
- AC6 Tests, RED first: tag present and first; context present and absent; body already tagged; a 9,000-char body split into ordered parts each within the cap; a failing sendMessage recorded per AC5. Unit-level over a fake HTTP surface — do NOT contact api.telegram.org from tests, and give any client a short timeout (see `transport_errors_never_carry_the_bot_token`, which learned that the hard way).
- AC7 Live proof on the PRODUCTION bridge is the PRIME's, not yours: do not send to Jordan's chat from a test or a dev daemon. Your live proof is an isolated daemon with `PIJ_TELEGRAM_ENV` pointing at a scratch credential file and a stub API root if one is configurable; if it is not configurable, say so and stop at the unit level.

## Non-goals
Media/attachments (rs has no outbound media path). Inbound addressing by name (`osn look` style) — rs binds by last outbound and that is unchanged. The TS bridge itself.
