# Wave 3 — done report

**APPROVED** by `pij-experimental-fish` (openrouter/z-ai/glm-5.3-flash) at
`f4e1bbb3`, after three rounds and ten findings. None refuted.

## What shipped

Six units, composed in dependency order onto `s108/rust-port`:

| unit | what it is |
|---|---|
| `u-daemon-http` | routes, whole-router auth ring, one-request peer-forward primitive |
| `u-daemon-lifecycle` | boot/shutdown, machine identity, tick scheduler, second-daemon guard |
| `u-models` | five harness adapters, folded level encodings, corpus fold |
| `u-cli` | six verbs, ErrorKind exit table, `@`-escaping, incremental tail |
| `u-uds` | Claude socket transport — **shipping closed** |
| `u-extension` | the TS extension on the new wire, proven on two hosts |

**233 tests, gate six-for-six** (toolchain, lock, fmt, clippy, test, arch),
`cargo metadata --locked` clean at the committed head, 8 crates / 0 arch
violations. The last `not_yet` refusal is gone: **all seven ports are
real-capable.**

## PM seams landed mid-wave

`WIRE-CONTRACT.md` · `Destination` · `ErrorKind` + `Envelope::refused` ·
`Msg.command` · `Msg.in_reply_to` · `SeatDescriptor.cross_session_inbound_accept`
(schema 5) · `Registration.supersedes` · one shared `StorePool` across three store
adapters · bind-before-any-mutating-step boot order · `Config.machine_alias` /
`peer_keys`.

## First light, against the shipped binary

Register with a false `proc_start` → **refused**, naming the observed start.
Register truthfully → bound descriptor. Send → real queued receipt from the real
delivery path. Seats → from SQLite. **Kill, restart on another port → the seat is
still there.**

The two-host matrix ran the same extension source against plain Pi and OMP with a
throwaway production daemon: both received `message.pushed`, both replied, the
store survived a restart, and Rust mode created no legacy `PIJ_HOME`.

## The defect class this wave was made of

Nearly every finding — from coders at the ack gate, from compose, and from review
— was one shape: **two halves, each internally consistent, wired to different
worlds.**

* `/v1/send` persisted `QueuedSend`; `inbox` decoded `Msg`. Neither could decode
  the other and both had passing tests.
* `message.pushed` was consumed by a client and published by nobody.
* `ErrorKind` was announced as landed while three helpers emitted no discriminator.
* Real adapters existed and the shipped binary never selected them (E-025).
* `daemon_config` fixed that and had no test, so reverting it left 231 tests green
  (review F2).
* A fix for an accepted review finding was never applied, and the build stayed
  green because **removing nothing compiles** (review R2-F1, E-026).

Four of `u-extension`'s five findings were invisible to a green 231-test suite.
The common cause is stated in E-025: a unit test proves a part against the world
the test builds; only running the shipped thing proves it against the world the
user gets.

## What we learned that outlives the wave

* **A silence-based receipt is only honest if silence is a signal** (E-023). The
  inherited 150 ms negative-ack timer reported `delivered` for messages Claude was
  visibly holding. A mechanism ported across a shape change must re-verify its
  precondition.
* **A residue is not a state** (E-024). Legacy files record that an old build once
  ran here, not that one is running here.
* **The default was true in the wave that wrote it** (E-025).
* **Removing nothing compiles** (E-026) — now encoded in COMMON, not just written
  down.

## Deliberately not built

Socket capability defaults **closed** until wave 4 can stamp an accept
precondition — the daemon can never truthfully attest a permission mode, so this
is the only honest open we control. Federation, the pointer rung and drain worker,
`from-mode` provenance, the spawn surface, and `pij daemon bounce` (req-0018) are
allocated in `assets/wave-4/SHAPE.md`.
