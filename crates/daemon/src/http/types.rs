use pij_core::model::{Event, Harness, JobId, SeatDescriptor, SeatId};
use serde::{Deserialize, Serialize};

/// Evidence submitted by a process asking to register as a seat.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Registration {
    /// The seat this registration REPLACES, when a native session boundary
    /// (`/new`, `/fork`) gives one OS process a new seat id.
    ///
    /// Without it the successor is indistinguishable from finding #19's alias:
    /// pi keeps ONE process across `/new`, the extension deliberately assigns a
    /// new seat id, and the collision guard refuses any different id sharing
    /// `(pid, proc_start)` — so the first `/new` from a healthy seat would be
    /// refused forever. Found by u-extension.
    ///
    /// A claim may only supersede ITSELF: the named predecessor must carry the
    /// same `(pid, proc_start)`. That keeps the alias refusal intact, because an
    /// impostor naming someone else's seat is exactly what #19 is about.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<SeatId>,
    /// Claimed seat id.
    pub id: String,
    /// Claimed harness spelling; admission refuses unknown values rather than guessing.
    pub harness: String,
    /// Claimed absolute working folder.
    pub folder: String,
    /// Claimed tmux pane, when the seat has one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pane: Option<String>,
    /// Claimed process id; must travel with `proc_start`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    /// Claimed process start time; must travel with `pid`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proc_start: Option<u64>,
    /// Launch id, absent for manually adopted seats.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spawn_id: Option<String>,
    /// Selected model, when known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Selected provider, when known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Selected thinking effort, when the model has one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    /// Governing seat, when assigned.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<SeatId>,
    /// Whether this seat relays to an external sink.
    #[serde(default)]
    pub relay: bool,
}

/// Request accepted by `POST /v1/spawn`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SpawnRequest {
    /// Seat id. ABSENT means the daemon allocates a memorable one.
    ///
    /// Optional since u-names landed: a caller that has a name uses it, and a
    /// caller that does not gets `pij-<adjective>-<noun>` rather than being told
    /// to invent one. Review found the generator shipped with zero production
    /// callers — the unit existed, the surface it was built for did not (F4).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<SeatId>,
    /// Harness to launch.
    pub harness: Harness,
    /// Executable override from `--bin`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub executable: Option<String>,
    /// Exact requested model selector.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Exact requested reasoning effort.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    /// Absolute working directory stored on the descriptor.
    pub cwd: String,
    /// Explicit target tmux session, when supplied.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<String>,
    /// Calling pane used to resolve the target session when `session` is absent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caller_pane: Option<String>,
    /// Requested tmux window name; the explicit seat id is used when absent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Governing seat, when assigned.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<SeatId>,
    /// Emit Claude's cross-session inbound accept setting.
    #[serde(default)]
    pub accept_inbound: bool,
}

/// Request accepted by `POST /v1/revive`.
///
/// Only placement crosses the wire. The daemon derives durable seat identity
/// and launch intent from the tombstoned descriptor; process identity and the
/// prior incarnation's resource stamps must never be carried forward.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReviveRequest {
    /// Existing tombstoned seat id to relaunch.
    pub id: SeatId,
    /// Explicit target tmux session, when supplied.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<String>,
    /// Calling pane used to resolve the target session when `session` is absent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caller_pane: Option<String>,
    /// Requested tmux window name; the seat id is used when absent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// Request accepted by `POST /v1/send`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SendRequest {
    /// Sender identity.
    pub from: SeatId,
    /// Already-resolved destination. `machine: None` always means this daemon.
    pub to: pij_core::model::Destination,
    /// Message body.
    pub body: String,
    /// Caller-generated stable id used as the queue dedupe key.
    pub msg_id: String,
    /// The machine the sender is on, when it is not this one (R7-AMEND-1).
    ///
    /// The WIRE half of `Msg.from_machine`. Landing the model field without this
    /// left a federation worker unable to transmit the fact at all — the seam
    /// existed in the type and nowhere a message could carry it. Found by
    /// u-federation an hour after I claimed the amendment was landed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from_machine: Option<String>,
    /// Message id being answered, when this is a reply.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub in_reply_to: Option<String>,
}

// `QueuedSend` is GONE. The send route persisted it under `delivery:<seat>` and
// synthesised its own `Queued` receipt, while `DeliveryService::inbox` decoded
// that same queue as `Msg` — a nested shape that could never decode. Each half
// was proven against itself and the round trip was proven by nobody.
//
// The route now calls `DeliveryService::accept`, which is the one path that
// consults routing, tombstones and the transport, and publishes both events.
// Found by u-extension at compose.

/// Acknowledgement for the single inbox claim a client decoded.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct InboxAckRequest {
    /// Recipient named by the caller. Bearer auth attests only to the machine,
    /// not to this seat; the route records that evidence grade on the spine.
    pub seat: SeatId,
    /// Queue claim returned by `GET /v1/inbox`.
    pub job_id: JobId,
}

/// Typed roster payload. `unavailable` distinguishes a down peer from an empty
/// peer while retained seats remain visible as a stale last-known view.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FederatedRoster {
    /// Local authoritative seats plus the last successful view from each peer.
    pub seats: Vec<SeatDescriptor>,
    /// Peers whose last roster poll failed. Their retained rows are stale.
    pub unavailable: Vec<UnavailablePeer>,
}

/// A peer whose current roster could not be observed.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct UnavailablePeer {
    /// Configured machine alias.
    pub machine: String,
    /// Adapter evidence from the failed authenticated request.
    pub reason: String,
}

/// The two numbers behind a [`pij_core::model::ErrorKind::CursorReset`] refusal.
///
/// Carried as DATA rather than left in the message, because the peer client used
/// to re-raise the typed error with fabricated zeroes — so an operator read
/// "requested cursor 0 is beyond this spine's newest 0": the right diagnosis
/// carrying evidence nobody measured. Parsing them back out of the prose was the
/// other option, and this project has just finished removing the last place that
/// branched on wording (review round 4).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CursorResetDetail {
    /// The cursor the consumer asked for.
    pub requested: u64,
    /// The newest sequence the spine actually holds.
    pub newest: u64,
}

/// One line after the stream Hello. The tag makes source state observable
/// without pretending it is an event with a store-assigned cursor.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamFrame {
    /// One source event. Its cursor is scoped to `machine`.
    Event {
        /// Machine whose local spine assigned the cursor.
        machine: String,
        /// Position in that machine's spine.
        cursor: u64,
        /// Event body; its internal `seq` remains absent from serialization.
        event: Event,
    },
    /// An in-band source-state transition; never assigned a fake cursor.
    PeerState {
        /// Configured peer alias.
        machine: String,
        /// State the fan-in worker observed.
        state: PeerStreamState,
        /// Delay before the next reconnect, when retrying.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        retry_in_ms: Option<u64>,
        /// Number of frames skipped for this subscriber, when lagged.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        dropped: Option<u64>,
        /// Adapter evidence, when unavailable.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        reason: Option<String>,
    },
}

/// Observable state of one remote event source.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PeerStreamState {
    /// Authenticated stream connected.
    Connected,
    /// Source is down and the worker will retry.
    Unavailable,
    /// This bounded subscriber buffer dropped frames.
    Lagged,
    /// The peer's cursor went BACKWARDS: its spine was reset while its alias
    /// survived. Distinct from `Lagged` — lag is our buffer falling behind a
    /// peer that is fine, a reset is the peer's history being gone.
    ///
    /// It exists because dropping a backwards cursor silently leaves every
    /// holder of a stale high cursor receiving NOTHING for ever while the status
    /// still reads `Connected` (review F1, wave 5).
    Reset,
}

/// Ask for one seat's state card: `pij state <id>` (plan 114, u-readback).
///
/// Two accepted shapes, because two callers speak to this route and neither
/// should have to pretend to be the other:
///
/// * `{ "id": "pij-b" }` — the NATIVE shape, used by `pij-rs state <id>`.
/// * `{ "argv": ["state", "pij-b"] }` — the SHIM shape. Wave 1's generic call
///   path forwards the operator's argv untouched
///   (`.pi/extensions/pij/adapters/generation-router.ts:203-206`) and has no
///   per-verb knowledge to turn it into a field; giving the verb's own handler
///   that knowledge is correct, because the handler is where verb semantics
///   belong.
///
/// Unknown fields are IGNORED on purpose: the seam unit in flight adds a
/// `caller` block to every routed body, and a `deny_unknown_fields` here would
/// turn that additive change into a fleet-wide 400.
#[derive(Clone, Debug, Default, Deserialize)]
pub struct StateRequest {
    /// The seat asked about, when the caller can name it directly.
    #[serde(default)]
    pub id: Option<SeatId>,
    /// The operator's argv, forwarded verbatim by the routing shim.
    #[serde(default)]
    pub argv: Option<Vec<String>>,
}

impl StateRequest {
    /// The seat this request is about, or `None` when it names none.
    ///
    /// `id` wins. Otherwise the first argv token that is neither the verb itself
    /// nor a flag — the shim forwards `process.argv.slice(2)`, so the leading
    /// token is the verb as typed.
    pub fn seat(&self) -> Option<SeatId> {
        if let Some(id) = &self.id {
            return Some(id.clone());
        }
        self.argv.as_ref()?.iter().find_map(|token| {
            if token.starts_with('-') || token == "state" {
                None
            } else {
                Some(SeatId::from(token.as_str()))
            }
        })
    }
}

/// A TS field this store cannot answer, and why.
///
/// The alternative was emitting it as `null`, which is how a read surface comes
/// to lie: `null` says "we looked and this seat has none", and a caller cannot
/// tell that from "this store has no such concept". Naming the gap is ac-1144's
/// refuse-by-name rule applied to a READ — a shape rs cannot honour is refused
/// by name rather than silently differing.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct UnsupportedField {
    /// The TS field name, so a caller can match it against what it parses.
    pub field: String,
    /// Why rs cannot answer it.
    pub why: String,
}

/// One seat's state, projected for `pij state <id>`.
///
/// Field names are the TS surface's, taken from
/// `.pi/extensions/pij/core/cli.ts:3630-3684` (the `--json` object every caller
/// parses today), so a consumer that reads the legacy shape reads this one.
/// What rs cannot honour is listed in [`Self::unsupported`] rather than nulled.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateCard {
    /// TS `id` (cli.ts:3632).
    pub id: SeatId,
    /// TS `state` (cli.ts:3634) — `idle` or `working`, observed.
    pub state: String,
    /// TS `liveness` (cli.ts:3636).
    ///
    /// rs answers `active`, `dead` or **`recycled`**. That last word is NOT in
    /// the TS vocabulary (`core/state.ts:48-57` yields active/stale/dead, plus
    /// `dissolved` at cli.ts:6073) and it is emitted anyway, deliberately: a pid
    /// whose process start time no longer matches the recorded one is a
    /// DIFFERENT process, and rs separates that case
    /// (`pij_core::liveness::alive`). Spelling it `dead` would be the nearest
    /// existing word for a claim it does not make, and spelling it `active`
    /// would be the recycled-pid bug. A caller that does not know the word gets
    /// something it must handle; a caller told `dead` would get something it
    /// would wrongly trust.
    pub liveness: String,
    /// TS `pid` (cli.ts:3638). `None` for a seat never bound to a process.
    pub pid: Option<u32>,
    /// The recorded process start time — the other half of the identity that
    /// makes `liveness` mean anything. A pid alone cannot be corroborated.
    pub proc_start: Option<u64>,
    /// TS `cwd` (cli.ts:3643), from the descriptor's `folder`.
    pub cwd: String,
    /// TS `harness` (cli.ts:3644).
    pub harness: Harness,
    /// TS `orchestrationRole` (cli.ts:3662), which rs stores as `role`.
    pub role: Option<String>,
    /// TS `parent` (cli.ts:3663).
    pub parent: Option<SeatId>,
    /// TS `boundModel` (cli.ts:3666).
    pub bound_model: Option<String>,
    /// TS `effort` (cli.ts:3667).
    pub effort: Option<String>,
    /// The tmux pane, which the TS card does not carry and rs holds.
    ///
    /// `None` means PANELESS (external pull mode) — a real state, distinct from
    /// "we have not looked", which is the absence of the seat itself.
    pub pane: Option<String>,
    /// The model's provider, which rs records and TS's card does not.
    pub provider: Option<String>,
    /// The seat's DECLARED state, where it has declared one. Observation and
    /// declaration are different facts and are reported separately.
    pub semantic_state: Option<pij_core::model::SemanticState>,
    /// The serving daemon's machine alias, stamped on read like `/v1/seats`.
    pub machine: Option<String>,
    /// When the seat was tombstoned. A live seat has `None`.
    pub tombstoned_at: Option<u64>,
    /// Why it was tombstoned — the row IS the post-mortem.
    pub tombstone_reason: Option<String>,
    // --- the status card (ac-1142's readback half) -------------------------
    //
    // TS spells the card's two halves `statusPrev` (what was done) and
    // `statusNext` (what is next) — `.pi/extensions/pij/core/cli.ts:5752-5753`
    // (`node show`) and `:2878-2879` (`list`). Those names are used verbatim so
    // a consumer that already parses either TS surface parses this one
    // unchanged.
    //
    // A DELIBERATE WIDENING, stated rather than smuggled: TS `state` itself does
    // NOT carry the card (`core/cli.ts:3615`, whose `--json` arm has no status
    // field). ac-1142 nonetheless names `pij state <id>` as the surface that
    // returns it, and rs has no `node show` to carry it instead — so rs `state`
    // answers MORE than its TS twin. That is the opposite of `unsupported`
    // below, which names what rs answers LESS.
    //
    // All five are ALWAYS PRESENT, `null` when the seat has never reported. Null
    // is an honest answer here and only here: rs DID look, through the same
    // `ReportService` the write path uses, and there genuinely is no card —
    // unlike an `unsupported` field, where rs cannot look at all.
    /// TS `statusPrev` (cli.ts:5752) — what the seat last said it did.
    pub status_prev: Option<String>,
    /// TS `statusNext` (cli.ts:5753) — what it said it would do next.
    pub status_next: Option<String>,
    /// TS `statusAt` (cli.ts:5754) — when the card was written, epoch ms.
    pub status_at: Option<u64>,
    /// TS `statusSeq` (cli.ts:5755) — the spine sequence carrying the card,
    /// which is what makes it citable.
    pub status_seq: Option<u64>,
    /// Whether the card is past core's staleness threshold, computed ON READ by
    /// `ReportService` rather than stored. `None` when there is no card: a seat
    /// that never reported does not have a FRESH card.
    pub status_stale: Option<bool>,
    /// The explanation supplied with `report blocked` / `report question`,
    /// which TS renders beside the declared state (cli.ts:5794).
    pub state_note: Option<String>,
    /// Every TS field this store cannot answer, named with its reason.
    pub unsupported: Vec<UnsupportedField>,
}
