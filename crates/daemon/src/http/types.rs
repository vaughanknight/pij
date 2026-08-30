use pij_core::model::{Event, Harness, SeatId};
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

/// One resumable event frame. The cursor belongs to the stream, not `Event`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct EventFrame {
    /// Machine whose local spine assigned the cursor.
    pub machine: String,
    /// Position in that machine's spine.
    pub cursor: u64,
    /// Event body; its internal `seq` remains absent from serialization.
    pub event: Event,
}
