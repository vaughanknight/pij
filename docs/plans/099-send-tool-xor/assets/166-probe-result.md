# pij#166 probe result

## 1. Visible native `pij_send` signature

The following is a direct reading of the `pij_send` tool definition available in this session: **(a) something I can actually READ from my tool definitions right now**, not a paraphrase or recollection.

```ts
// Send a message — or run an allow-listed control command (compact/new/reload) — to another pij peer session in this project. Prefer this over shelling out to the `pij` CLI: it resolves your id, delivers, and reports the receipt. Reply to a `[pij from <id>]` message by passing that <id> as `to`.
type pij_send = (_: {
  // Target peer session id, e.g. pij-1gzyr0p (the <id> from a `[pij from <id>]` message, or from pij list --here).
  to: string,
  // Message text to deliver (appears to the peer as user input). Provide message OR command, not both.
  message?: string,
  // Run an allow-listed control command on the peer instead of text: compact | new | reload. Provide message OR command, not both.
  command?: "compact" | "new" | "reload",
}) => any;
```

## 2. Message-only native call

Exact JSON arguments emitted:

```json
{"to":"pij-reasonable-dove","message":"PROBE-1 message-only native call"}
```

Exact tool result:

```text
sent → pij-reasonable-dove  text (note: no recent pij events from peer — normal for a control-plane peer; the send still lands)  (queued (tick-pending): awaiting daemon delivery confirmation)
receipt → queued   (also in: pij tail pij-tasty-gabriel --type receipt)
```

Observation: the emitted JSON contained exactly the two requested keys; no `command` key appeared. The native call was accepted and returned a queued receipt. Delivery confirmation was not present in this result.

## 3. Command-only control call

Target used: `pij-tasty-gabriel` (this session, inferred from the receipt hint only).

Exact JSON arguments emitted:

```json
{"to":"pij-tasty-gabriel","command":"compact"}
```

Exact tool result/error text:

```text
E-SELF: cannot send to yourself (pij-tasty-gabriel)
```

Observation: the command-only JSON was expressible with `to` and `command` only. The tool rejected the call because the target was self; no compact result was observed.

## Fallback

Not used: the message-only native call was accepted and returned a queued receipt.
