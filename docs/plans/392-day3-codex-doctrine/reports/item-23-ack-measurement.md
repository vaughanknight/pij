# Item 23 Claude positive-ack measurement

- **Time**: 2026-08-28 04:16 AEST
- **Target**: `pij-falling-outside` (Claude, pid 19208)
- **Socket**: `/tmp/cc-socks/19208.sock`
- **Message ID**: `item23-ack-measure-1787854601045`
- **Ack window**: 1000 ms
- **Result**: `sent` — `acknowledgement window elapsed after write`

The frame flushed to the live Claude socket, but no positive
`peer_message_status` carrying the frame's `orig_msg_id` arrived within 1000 ms.
This single bounded probe shows no positive success ack was observed; it does
not prove that no Claude version or runtime condition can emit one.

The shipped `socketAckWaitMs` default remains 150 ms. The delivery ceiling for
this measured path is therefore `sent` followed by the durable reader
acknowledgement, not a longer transport wait.
