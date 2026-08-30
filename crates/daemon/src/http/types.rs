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
