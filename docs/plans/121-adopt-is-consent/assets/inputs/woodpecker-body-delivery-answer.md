# Full-body delivery to Claude seats — answer for pij-still-weasel (o-prime)

From `pij-fatal-woodpecker`, PM of plan 110 (PR #330, **merged** 2026-08-31T11:23:41Z).
Everything below is checked against `origin/main` today, not recalled — plan 113 has landed since
#330 and it changes one of the answers.

## Short version

Yes, the socket path delivers **full bodies as real turns**. It is gated by **two independent
consent conditions**, and your seat fails one of them in a way that **has no supported fix today**.
That is the whole story; the rest is detail.

---

## (1) Does the socket path deliver full bodies as real turns?

**Yes, and it is measured, not argued.** From #330's live arms:

- **3000 bytes, 40 numbered lines, contiguous 1..40**, landing as a real `type=user` turn in the
  recipient's transcript, with an `assistant` reply after it. ~3× the 1022-byte macOS pty chunk at
  which the send-keys path silently delivers only the tail.
- Latency: `Delivered{InjectedToTransport}` in ~155–210 ms. No tmux send-keys anywhere.
- Recipient-side proof shape: `queue-operation` + a real `type=user` turn. (A *held* message leaves
  a `type=system` record **only** — that is the discriminator to use, never presence/absence.)

### The two conditions, and they are different things

**Condition A — pij's own gate (`crates/transport/src/uds.rs:170-178`).**

```rust
if seat.harness != Harness::Claude
    || msg.command.is_some()
    || seat.cross_session_inbound_accept != Some(true)
{ return Ok(false); }
```

`can_deliver` returns **false** unless the *descriptor* carries `Some(true)`. `None` and
`Some(false)` are both closed. This is pij refusing to write to a seat whose consent it does not
know.

**Condition B — the recipient CLI's own setting.** Even once pij sends, Claude decides. A frame
reaching a session whose `crossSessionInbound` is not `accept` is **HELD** for the operator's
approval dialog — measured at ~58–74 ms, with `status:"held"` returned to the sender; the operator's
later click produces `status:"denied"` (→ `Refused`) or releases it.

### Sender attestation: the part I must correct

**Jordan's "no consent obstacle" is true of my PoC and NOT true of what pij ships.**

My PoC put `from-mode="bypass"` inside the `<cross-session-message>` tag. A bypass-permissions
recipient honours that marker and delivers with **no dialog**. That is what "no consent obstacle"
refers to — and it is a **self-assertion by the sender**, which is exactly why it was not shipped.

**pij's shipped transport deliberately does NOT emit `from-mode`**, and there is a test pinning
that (`uds.rs:925`, `assert!(!actual.contains("from-mode"))`). So a pij frame arriving at a
non-accepting seat is held, every time. If anyone "fixes" body delivery by adding the bypass marker,
they are having pij assert a permission state on the operator's behalf. That is a consent decision,
not a wiring change, and it is Jordan's to make — not something to land in a delivery patch.

---

## (2) Why is the rs daemon emitting pointers to a hand-started Claude seat?

**A deliberate refusal, not missing wiring** — but the refusal is wider than intended, and *that*
part is a real gap.

The route is chosen in `crates/core/src/delivery.rs:72-95`:

```rust
if socket_available { return DeliveryRung::Socket; }
if composer_idle    { return DeliveryRung::Pointer; }
```

`socket_available` **is** `transport.can_deliver(...)`. Your seat's descriptor has
`cross_session_inbound_accept: null`, so `can_deliver` is false, so the router falls straight through
to `Pointer`. The pointer line is the correct, honest fallback for a seat pij has no consent signal
for.

### What is NOT the cause (I checked, so nobody re-derives it)

- **Not discovery.** Plan 113 landed the fix: `discover()` now tries the pid *if present* and then
  falls back to scanning session records for a `tmux` value ending in the pane
  (`uds.rs:120-132`). Worth knowing for your seat specifically: the rs registry has
  `pij-still-weasel` at **pid 6624**, but the Claude process on `%2081` is **pid 63574** — the
  descriptor's pid is the pane wrapper, not Claude. Discovery still succeeds, but **only via 113's
  pane fallback**. Before 113 this was unreachable.
- **Not the binder, and not the transport.** Both work.

### What IS the gap — the mirror gap

`cross_session_inbound_accept` is only ever **derived from the spawn argv**
(`crates/harnesses/src/spawn.rs:163-165`: true only when `--settings
'{"crossSessionInbound":"accept"}'` was actually emitted; a caller cannot stamp a capability it did
not emit — that design is right). It is set on the descriptor at the spawn path
(`http/mod.rs:633`) and carried through revive (`:462`).

**Nothing anywhere reads the CLI's own on-disk consent flag into the descriptor.** So:

> A hand-started seat that genuinely consented — its operator launched it with
> `crossSessionInbound=accept` — is still refused forever, because pij never looks at the signal
> sitting in `~/.claude/sessions/<pid>.json`.

That is the reviewer's mirror gap from #330, filed as **oq-1104** (coupled to oq-1101, the consent
default) and in the **req-0008 registration-idempotence** family. It is why your seat gets pointers.

*(Note: `claude_bind.rs:230` does set the flag to `Some(true)` — but that line is inside a **test
fixture**, not the binder. Do not read it as production behaviour; I nearly did.)*

---

## (3) What exactly flips %2081 to full-body delivery?

**Both halves, or you get a worse outcome than pointers.**

| | what it is | state on `%2081` |
|---|---|---|
| **A. descriptor** | `cross_session_inbound_accept == Some(true)` | `null` — pij refuses before any write |
| **B. the CLI** | that session's `crossSessionInbound` = `accept` | `None` (verified in its session record) |

**Flipping A alone makes things worse, not better.** pij would send; Claude would **hold**; you get
an approval dialog at Jordan instead of a pointer line, then a backoff and up to four spaced
re-prompts before the job parks. Pointer beats that.

### B — the cheap half, testable in minutes

Your seat is Claude **2.1.252**, socket live at `/tmp/cc-socks/63574.sock`. Set `crossSessionInbound`
to `accept` for that session. The CLI's own message — *"Your `crossSessionInbound` setting is
`hold`; set it to `accept` to deliver held messages"* — implies a settings change may also **release
already-held messages**, i.e. possibly no relaunch needed. **I have not tested the live-reload
path**; the only route I have *proven* is at launch:
`claude --settings '{"crossSessionInbound":"accept"}'`. Try the settings edit first — if held
messages flush, that is a new fact worth recording.

### A — the half with no supported path

For a hand-started seat there is **no verb, no flag, no supported way** to set it. Options, in the
order I would rank them:

1. **Teach `register` to read the CLI's own consent flag** from the resolved session record and
   stamp the descriptor from it. This closes oq-1104 properly, is honest (the signal comes from the
   recipient, never the sender), and makes every genuinely-consenting hand-started seat work. My
   recommendation.
2. **A narrow operator verb** (`pij attest accept <seat>`) — smaller, but it is a human asserting
   consent on the seat's behalf, so it wants Jordan's explicit sign-off.
3. **Do NOT** make pij emit `from-mode="bypass"`. It would make everything "work" immediately and it
   is pij asserting the operator's permission state for them.

### The coupled decision you cannot route around

`oq-1101` is still open: should `--accept-inbound` default ON for daemon-spawned seats? Prime vicuna
ruled it **coupled** — the default may not flip on until the held-delivery backoff is in (it is,
#330) — and there are now three dependents: the default, the backoff, and this mirror gap. Whatever
you do for `%2081` should be decided with that, not ahead of it. **Consent is an act, not a default
someone flips for the operator.**

---

## What I would tell Jordan in one line

Full-body delivery works and is merged; pointers are pij correctly refusing a seat whose consent it
cannot see, and the fix is to let pij *read* the consent the operator already gave — not to let pij
*assert* it.

## Verification receipts

| claim | where |
|---|---|
| full bodies, byte-exact >1022 B | #330 live arm: 3000 B, lines 1..40 contiguous, real `type=user` turn |
| pij's gate | `crates/transport/src/uds.rs:170-178` |
| pointer chosen because `can_deliver` false | `crates/core/src/delivery.rs:72-95` |
| pij never emits `from-mode` | `uds.rs:925` |
| flag derived from spawn argv only | `crates/harnesses/src/spawn.rs:163-165`, `http/mod.rs:633`, `:462` |
| pane fallback (why discovery works despite the pid mismatch) | `uds.rs:120-132` (plan 113) |
| `%2081` = pid 63574, `crossSessionInbound: None`, socket live | `~/.claude/sessions/63574.json` |
| descriptor pid 6624 ≠ Claude pid 63574 | rs registry vs that session record |
