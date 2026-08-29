use pij_core::model::{DeliveryOutcome, Event, Receipt, SeatId};
use serde::{Deserialize, Serialize};

/// Evidence submitted by a process asking to register as a seat.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Registration {
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
    /// Message id being answered, when this is a reply.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub in_reply_to: Option<String>,
}

/// The body persisted by the request path for a delivery worker.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct QueuedSend {
    /// The accepted request.
    pub request: SendRequest,
    /// Acceptance time in milliseconds since the Unix epoch.
    pub accepted_at: u64,
}

impl QueuedSend {
    pub(crate) fn receipt(&self) -> Receipt {
        Receipt {
            msg_id: self.request.msg_id.clone(),
            outcome: DeliveryOutcome::Queued,
            at: self.accepted_at,
        }
    }
}

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
