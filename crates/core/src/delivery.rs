//! Pure message-routing policy.
//!
//! Runtime delivery belongs in `pij-daemon`; this module decides whether the
//! facts already known about a seat permit a transport attempt, require durable
//! queueing, or make future delivery impossible.

use crate::error::{PijError, Result};
use crate::model::{SeatDescriptor, SeatId, SemanticState};

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
/// immortal queue row. Pre-bind, operator hold, and transport unreachability are
/// temporary and therefore queue honestly.
///
/// **`Working` is deliberately NOT decided here.** It used to be — a busy
/// recipient queued before the transport was ever consulted — and u-uds found at
/// its ack gate that this forecloses the entire reason the socket transport
/// exists: Claude accepts a socket frame BETWEEN TOOL CALLS MID-TURN, which is to
/// say precisely when the seat is `Working`. A correct socket transport could not
/// have overcome a prefilter that ran before it; the unit would have passed every
/// one of its own tests and delivered nothing.
///
/// "Busy" was a pty-era fact: typing races a live composer, so a pty transport
/// declines a working seat — and that is the PTY's judgement to make, in
/// `can_deliver`, where the transport that knows its own medium answers for it.
/// The queue reason is still [`QueueReason::Busy`] when a working seat is
/// declined; what moved is WHO decides, not what the operator is told.
///
/// # Errors
/// [`PijError::SelfAddressed`] when a seat addresses itself.
pub fn route(
    from: &SeatId,
    from_machine: Option<&str>,
    recipient: &SeatDescriptor,
    transport_reachable: bool,
) -> Result<DeliveryRoute> {
    // Self-addressing is a question about ADDRESSES, not names. `alice@laptop`
    // sending to the local `alice` is a stranger with a common name, and the bare
    // comparison refused it — which is the exact collision R7-AMEND-1 exists to
    // solve, still live inside the function that had to answer it (u-federation).
    //
    // A recipient reached through this function is always LOCAL, so a sender with
    // any machine is by construction not it.
    if from == &recipient.id && from_machine.is_none() {
        return Err(PijError::SelfAddressed { seat: from.clone() });
    }
    if recipient.tombstoned_at.is_some() {
        return Ok(DeliveryRoute::Tombstoned {
            reason: recipient.tombstone_reason.clone(),
        });
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
        assert_eq!(
            route(&from, None, &seat, true),
            Ok(DeliveryRoute::Transport)
        );

        // A WORKING seat still routes to the transport: whether a busy recipient
        // can be reached is the transport's judgement, because only it knows
        // whether its medium interrupts (a socket does, a pty does not). The
        // operator still hears `Busy` — the caller supplies that reason when the
        // transport declines a working seat.
        seat.state = SystemState::Working;
        assert_eq!(
            route(&from, None, &seat, true),
            Ok(DeliveryRoute::Transport)
        );
        assert_eq!(
            route(&from, None, &seat, false),
            Ok(DeliveryRoute::Queue(QueueReason::Unreachable))
        );

        seat.state = SystemState::Idle;
        seat.proc = None;
        assert_eq!(
            route(&from, None, &seat, true),
            Ok(DeliveryRoute::Queue(QueueReason::PreBind))
        );

        seat.proc = Some(ProcIdentity {
            pid: 7,
            proc_start: 11,
        });
        seat.semantic_state = Some(SemanticState::Hold);
        assert_eq!(
            route(&from, None, &seat, true),
            Ok(DeliveryRoute::Queue(QueueReason::OperatorHold))
        );

        seat.semantic_state = None;
        assert_eq!(
            route(&from, None, &seat, false),
            Ok(DeliveryRoute::Queue(QueueReason::Unreachable))
        );

        seat.tombstoned_at = Some(42);
        seat.tombstone_reason = Some("process exited".to_string());
        assert_eq!(
            route(&from, None, &seat, false),
            Ok(DeliveryRoute::Tombstoned {
                reason: Some("process exited".to_string())
            })
        );
    }

    #[test]
    fn self_delivery_is_refused_by_address_not_by_name() {
        let seat = bound_recipient();

        // Local, same name: still refused. This is the case the rule is for.
        assert_eq!(
            route(&seat.id, None, &seat, true),
            Err(PijError::SelfAddressed {
                seat: seat.id.clone()
            })
        );

        // SAME NAME, DIFFERENT MACHINE: a stranger with a common name, and it must
        // route. Two machines each holding a seat called `alice` is ordinary, and
        // the bare-name comparison refused `alice@laptop -> alice` as if it were
        // someone talking to themselves — inside the very function R7-AMEND-1 was
        // ratified to unblock (u-federation).
        assert_eq!(
            route(&seat.id, Some("laptop"), &seat, true),
            Ok(DeliveryRoute::Transport)
        );
    }
}
