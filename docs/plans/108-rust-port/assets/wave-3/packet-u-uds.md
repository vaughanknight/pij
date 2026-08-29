# Coder packet — u-uds (wave 3)

**Spawn form (pinned, Jordan)**: `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast-1m --effort high --layout window`
— OMP harness, its own tmux window, never a split pane. **1m tier**: you read a
large first-party design document against a frozen seam.
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w3-uds` · branch `s108/w3-uds`
**Common contract (read FIRST)**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-3/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

The socket transport: get a message to a Claude seat through its Unix domain
socket instead of typing it into a pty. This is the unit that makes delivery
byte-exact and mid-turn rather than keystroke-shaped.

## YOUR PRIMARY SOURCE, and how much to trust each part of it

`/Users/jordanknight/pi-hacking/pij-worktrees/s105-claude-socket-transport/docs/plans/105-claude-socket-transport/assets/u-uds-design-input.md`
(commit `9c9e4b0a`, by `pij-fatal-woodpecker`, s105's PM), plus its companion
`receipt-vocabulary-contract.md` (`dc9d5f02`).

**Read its §10 evidence-class table before you read anything else, and honour it.**
The document is deliberately not uniform in confidence:

| section | class | what that means for you |
|---|---|---|
| §4.1 Claude UDS, the pty-clip measurement, the TS oracle analysis | **first-party** — s105 ran it | build against it |
| §4.2 Copilot RPC, the whole queue-semantics section | **well-sourced report** — read in #311, not run | build, but test the assumption explicitly and say in your report that it is unverified |
| §4.4 codex app-server | **report, and unproven even upstream** | **do not build it.** See "codex" below |

**§4.1 is first-party but MOVING**: Claude Code went 2.1.247 → 2.1.251 during
s105's session. **Re-verify the record shape and the `from-mode` behaviour at
implementation time** rather than trusting the snapshot. If what you observe
differs from the document, your measurement wins and you tell me — that is a
finding, not an inconvenience.

## Scope

* `crates/transport/src/**` — the crate is empty; it is yours.
* your tests, fixtures under `crates/testkit/fixtures/uds/**` (index them),
  allow-list rows, derived files.
* **Not** `crates/daemon/src/lib.rs` — ship the composition recipe; the PM pastes
  it. Yours replaces `not_yet("transport", "u-uds, wave 3")`, the last refusal in
  the tree.

## What to build

### 1. `impl Transport for UdsTransport`

The trait was amended for you before you were dispatched (**R3-AMEND-3**):

```rust
async fn can_deliver(&self, seat: &SeatDescriptor, msg: &Msg) -> Result<bool>;
```

**The message is a parameter because the answer depends on it.** A remote-control
command (`/compact`, `/new`) MUST take the pty path even for a seat with a
perfect socket, because Claude renders a socket-delivered `/compact` as plain
TEXT rather than executing it. With the seat alone, that carve-out would have had
to live outside the trait — invisible to the next reader, and silently absent from
the next transport someone adds.

### 2. Discovery is TWO steps, and step 2 is not optional

1. The session record for the descriptor's pid.
2. **Else scan records for a `tmux` field ending in `.<paneId>`.**

The descriptor pid is the pane's FOREGROUND process, which is frequently a
wrapper shell rather than Claude — s105 hit this first-party, pane pid 13600 was
`zsh` while Claude was 16273. **A single-step implementation silently routes
healthy socket seats to the pointer path**, which is the worst kind of bug: it
works, slower and lossier, and nothing reports it.

### 3. Capability is a STAMPED DESCRIPTOR FIELD, never a send-path probe

`claude` ⇒ a session record carrying `messagingSocketPath`; absent ⇒ next rung.
This is what keeps `can_deliver` cheap and pure enough to order transports
declaratively. **A probe in the send path** — open the socket to find out whether
you can open the socket — is the shape that makes every send slower and flakier.

Note the honest failure mode: the bind can fail silently, leaving a record with
**no** `messagingSocketPath`. **Treat "no socket" as a normal routing outcome
(→ pointer), never an error.**

### 4. Acknowledgement is NEGATIVE-ONLY, and the vocabulary already says so

There is no positive ACK. The fork writes the frame, arms a ~150 ms timer, and
listens for a `peer_message_status` naming its `msg_id` in `dropped_msg_ids`.
Timer wins ⇒ "confirmed" — which means **"no drop report within 150 ms"**, not
"the model read it".

So your outcome is `DeliveryOutcome::Delivered { origin:
DeliveryOrigin::InjectedToTransport }` — already landed, already required by the
type. **You cannot express the lie**: `Delivered` without an origin does not
compile. That is deliberate; s105's tree returns `confirmed` immediately after
pressing Enter having observed nothing **on the claude and codex paths** (copilot
has a real verification path there — a different defect), because their type
permitted it.

Use OUR `msg_id` in the frame so drop reports correlate.

### 5. `from-mode` is PROVENANCE YOU POPULATE TRUTHFULLY, not a lever you pull

A frame asserting `from-mode="bypass"` is delivered to a bypass-permissions seat;
`from-mode="default"` is held behind a 5-minute Deny/Deliver dialog. It is a
**self-assertion, not a security boundary**.

**Do the honest thing from day one**: seats are spawned with
`--settings '{"crossSessionInbound":"accept"}'` so the hold logic is EXPLICIT
rather than bypassed, and `from-mode` is populated with what is actually true.
Asserting `bypass` to get past a gate you did not configure is the kind of thing
that works until the day it matters.

### 6. The ladder — and it is NOT a fallback chain

**The command check comes FIRST, before the socket.** This ordering is the whole
design, and an earlier draft of this packet got it wrong by listing
"socket → pty → pointer", which reads as *try the socket, fall back to the pty* —
body typing wearing a different name. s105 caught it before dispatch.

```
0. not a bound pane seat      -> observe (an in-process consumer owns it)
1. the message is a COMMAND   -> pty. ALWAYS, and ONLY commands. Never a body.
2. a body, seat has a socket  -> byte-exact over the socket
3. a body, no socket          -> composer-idle guard, then ONE pointer line
4. none of the above applies  -> the row STAYS QUEUED and is retried. Never typed.
```

**There is no rung that types a BODY.** The pty appears exactly once, at rung 1,
and only for commands. For a command the pty is not a fallback — it is the first
and only choice, because Claude renders a socket-delivered `/compact` as text.

s105 recommended deleting the typed-body rung and I ruled it gone: it survives
upstream only as an fs-backend escape hatch and it is the single remaining path
that LOSES bodies (their G19 — an "unverified" typed body is marked read, so a
composer cleared by Esc or auto-compact loses it silently). **If a body can use
neither the socket nor a pointer, the row stays queued and is retried.**

If you find yourself building a fallback that writes a body into a composer, stop
and message me — that is the rung, wearing a different name.

### 7. codex: pointer path, and do not port the app-server

The fork has a full codex app-server design with **zero live proof** — frame
builders only, never wired, and it would need a pij-owned supervisor process plus
a codex login on the box. s105's recommendation, which I accepted: **codex stays
on the pointer path for wave 3.** Design without evidence is not inherited
mid-wave.

### 8. Do NOT port these fork behaviours — R4 supersedes them

s105 sent these unsmoothed and they are load-bearing, because the fork's spec is
the more detailed document and is therefore the easier one to copy by accident:

* **Their daemon never calls `claim()`**, so `attempt` never moves, `parked` is
  UNREACHABLE, and a pointer re-announces every 90s forever (their G25, still
  open). **Our terminal claim lease stands.**
* **They split attempt counting** between consumers and the daemon — that split IS
  G25's root cause. **One writer. Do not add a daemon fast-path that skips the
  counter.**
* **They have no tombstone refusal**; their own item 28 records queueing for a
  dead relay seat "with a note". **`SeatIsGone` stands.**
* Their `resetClaimsOnStart` is **unscoped by token**, so boot re-queues another
  process's in-flight claim. Moot while one writer per entity holds — but if this
  unit ever grows a second claimant, scope resets by claim token or claimant
  liveness **from the first line**, not as a retrofit.

Our partial-unique dedupe over live rows is strictly STRONGER than their
insert-time id idempotence. Do not read their weaker guarantee as a requirement.

## Done bar

* Gate six stages green (COMMON § 2).
* **Contract test over a recorded socket fixture** — the frame you write, byte for
  byte, and the negative-ack timer path both proven without a live Claude.
* **The two-step discovery table**: record-by-pid hit; record-by-pid miss with a
  tmux-suffix hit; both miss ⇒ pointer. The middle row is the one that matters.
* **The command carve-out**: `can_deliver(seat, msg)` returns false for a
  command message even when the socket is healthy. This is the reason the trait
  changed; prove it.
* **Held-for-approval decision table** (`from-mode`, the 5-minute hold).
* **Mutation evidence** on the discovery step-2 branch (delete it and watch a
  healthy socket seat fall to the pointer) and on the origin qualifier.
* Re-verification note: which of §4.1's facts you confirmed against the Claude
  build on this machine at implementation time, and anything that had moved.
* Report committed and pushed **before** the done message (COMMON § 5).

## Watch for

* `Msg` carries `msg_id`; use it in the frame so a drop report names something you
  can join on.
* ~1 MB per message, 50-deep receive queue, per-sender rate limit,
  identical-repeat dedupe are **documented by Anthropic and unverified by us** —
  s105 measured none of them, and corrected their own evidence table when this
  packet asked. Confirm before relying on a threshold. A body over the limit is a
  routing decision, not a panic.

  **Single out the 50-deep receive queue** for re-verification: it is the only one
  of the four that is a BACKPRESSURE threshold, so being wrong about it means
  silent drops under load — precisely the class this unit exists to eliminate. The
  1 MB cap fails loudly; a queue depth does not.

* **A silently failed bind is INDISTINGUISHABLE from a legitimately socketless
  seat** — both present as "no `messagingSocketPath`" (s105 §8, trap G22). So
  "normal routing outcome" without observability becomes "silently degraded
  forever, and nobody notices": a Claude seat that should be getting byte-exact
  bodies quietly takes pointers for the rest of its life.

  The distinguishing signal is LONGITUDINAL, not per-send. **Log it when a
  claude-harness seat routes to the pointer**, and treat a seat that keeps doing so
  as a finding worth surfacing. Not an error at the send site — that would be wrong
  for exactly the reason above.
* The socket is off under `--bare`, on Bedrock/Vertex/Foundry, and with several
  telemetry-disabling env vars. Absent capability is normal, not exceptional.
