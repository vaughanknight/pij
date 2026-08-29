//! Pure message-routing policy.
//!
//! Runtime delivery belongs in `pij-daemon`; this module decides whether the
//! facts already known about a seat permit a transport attempt, require durable
//! queueing, or make future delivery impossible.

use crate::error::{PijError, Result};
use crate::model::{SeatDescriptor, SeatId, SemanticState, SystemState};

/// Why a message must be durably queued instead of attempted now.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum QueueReason {
    /// The recipient is currently processing another turn.
    Busy,
    /// The recipient exists but has not bound to a process yet.
    PreBind,
    /// The operator deliberately parked the recipient temporarily.
    OperatorHold,
    /// The selected transport cannot currently reach the recipient.
    Unreachable,
}

/// The route selected from registry and transport facts.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DeliveryRoute {
    /// Try the transport now.
    Transport,
    /// Persist the message for later delivery.
    Queue(QueueReason),
    /// The registry row is a post-mortem; this seat will never receive again.
    Tombstoned {
        /// The recorded reason, when one was retained.
        reason: Option<String>,
    },
}

/// The queue kind owned by one recipient's inbox.
///
/// Recipient-specific kinds let `Queue::claim` select one inbox without taking
/// another seat's work. Producers and consumers must call this function rather
/// than formatting the open string independently.
pub fn delivery_kind(seat: &SeatId) -> String {
    format!("delivery:{seat}")
}

/// Select a route without performing IO.
///
/// Tombstones dominate every transient fact: a dead seat is never given an
/// immortal queue row. Busy, pre-bind, operator hold, and transport
/// unreachability are temporary and therefore queue honestly.
///
/// # Errors
/// [`PijError::SelfAddressed`] when a seat addresses itself.
pub fn route(
    from: &SeatId,
    recipient: &SeatDescriptor,
    transport_reachable: bool,
) -> Result<DeliveryRoute> {
    if from == &recipient.id {
        return Err(PijError::SelfAddressed { seat: from.clone() });
    }
    if recipient.tombstoned_at.is_some() {
        return Ok(DeliveryRoute::Tombstoned {
            reason: recipient.tombstone_reason.clone(),
        });
    }
    if recipient.state == SystemState::Working {
        return Ok(DeliveryRoute::Queue(QueueReason::Busy));
    }
    if recipient.semantic_state == Some(SemanticState::Hold) {
        return Ok(DeliveryRoute::Queue(QueueReason::OperatorHold));
    }
    if recipient.proc.is_none() {
        return Ok(DeliveryRoute::Queue(QueueReason::PreBind));
    }
    if !transport_reachable {
        return Ok(DeliveryRoute::Queue(QueueReason::Unreachable));
    }
    Ok(DeliveryRoute::Transport)
}

#[cfg(test)]
mod tests {
    use super::{DeliveryRoute, QueueReason, route};
    use crate::error::PijError;
    use crate::model::{Harness, ProcIdentity, SeatDescriptor, SeatId, SemanticState, SystemState};

    fn bound_recipient() -> SeatDescriptor {
        let mut seat = SeatDescriptor::new("pij-recipient", Harness::Omp, "/abs/tree");
        seat.proc = Some(ProcIdentity {
            pid: 7,
            proc_start: 11,
        });
        seat
    }

    #[test]
    fn receipt_honesty_table_selects_only_recoverable_queue_routes() {
        let from = SeatId::from("pij-sender");
        let mut seat = bound_recipient();
        assert_eq!(route(&from, &seat, true), Ok(DeliveryRoute::Transport));

        seat.state = SystemState::Working;
        assert_eq!(
            route(&from, &seat, true),
            Ok(DeliveryRoute::Queue(QueueReason::Busy))
        );

        seat.state = SystemState::Idle;
        seat.proc = None;
        assert_eq!(
            route(&from, &seat, true),
            Ok(DeliveryRoute::Queue(QueueReason::PreBind))
        );

        seat.proc = Some(ProcIdentity {
            pid: 7,
            proc_start: 11,
        });
        seat.semantic_state = Some(SemanticState::Hold);
        assert_eq!(
            route(&from, &seat, true),
            Ok(DeliveryRoute::Queue(QueueReason::OperatorHold))
        );

        seat.semantic_state = None;
        assert_eq!(
            route(&from, &seat, false),
            Ok(DeliveryRoute::Queue(QueueReason::Unreachable))
        );

        seat.tombstoned_at = Some(42);
        seat.tombstone_reason = Some("process exited".to_string());
        assert_eq!(
            route(&from, &seat, false),
            Ok(DeliveryRoute::Tombstoned {
                reason: Some("process exited".to_string())
            })
        );
    }

    #[test]
    fn self_delivery_is_refused_before_routing() {
        let seat = bound_recipient();
        assert_eq!(
            route(&seat.id, &seat, true),
            Err(PijError::SelfAddressed {
                seat: seat.id.clone()
            })
        );
    }
}
