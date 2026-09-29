//! The cold-wake guard on `pij send` (plan 157 phase 2, ruling #446).
//!
//! A BRAKE: it can only refuse. It reads the recipient's session facts through
//! `SessionStatusPort` and the daemon's own busy/idle state, and it never
//! changes what is delivered. Anything it cannot establish in time allows the
//! send and says why in the receipt's `cold_check`. The decision itself is
//! `pij_core::cold_wake::check`, pure and tested there.

use std::time::Duration;

use axum::response::Response;
use pij_core::cold_wake::{COLD_WAKE_CODE, COLD_WAKE_FORCED_KIND, ColdCheck, check, refusal};
use pij_core::model::{Event, SeatId};
use pij_core::session_status::SessionStatusBlock;

use super::{AppState, internal, refused, session_status_block, system_time_ms};

/// How long a send waits for the recipient's session facts before allowing it.
/// A cold first read of a very large transcript can take longer; the brake
/// then stays off for that send rather than delaying it.
const STATUS_WAIT: Duration = Duration::from_secs(3);

/// What the sender asked for about a cold recipient.
pub(crate) struct Override<'a> {
    pub(crate) force: bool,
    pub(crate) reason: Option<&'a str>,
}

/// Check one local recipient before a real (non-FYI, non-control) send.
///
/// `Ok(label)` allows the send; the label goes on the receipt (`None` when the
/// recipient is absent or retired, which delivery refuses on its own). `Err`
/// is the refusal to return instead, and nothing has been sent.
pub(crate) async fn guard(
    state: &AppState,
    command: &str,
    from: &SeatId,
    to: &SeatId,
    msg_id: &str,
    over: Override<'_>,
) -> std::result::Result<Option<String>, Box<Response>> {
    let reason = over
        .reason
        .map(str::trim)
        .filter(|reason| !reason.is_empty());
    if over.force && reason.is_none() {
        return Err(Box::new(refused(
            command,
            format!(
                "{COLD_WAKE_CODE}: --force needs a non-empty --reason saying why the wake is worth it"
            ),
        )));
    }
    // An absent or retired recipient is delivery's refusal to make, not ours.
    let seat = match state.services.registry.get(to).await {
        Ok(Some(seat)) if seat.tombstoned_at.is_none() => seat,
        Ok(_) => return Ok(None),
        Err(error) => return Err(Box::new(internal(command, error))),
    };
    let now_ms = system_time_ms().map_err(|error| Box::new(internal(command, error)))?;
    let block = tokio::time::timeout(
        STATUS_WAIT,
        session_status_block(
            state.services.session_status.as_ref(),
            &seat.id,
            seat.harness,
            seat.harness_session.clone(),
            now_ms,
        ),
    )
    .await
    .unwrap_or_else(|_| SessionStatusBlock::Failed {
        error: format!("no answer within {}s", STATUS_WAIT.as_secs()),
    });
    let verdict = check(seat.state, &block, now_ms);
    if let Some(message) = refusal(to, &verdict)
        && !over.force
    {
        return Err(Box::new(refused(command, message)));
    }
    if let ColdCheck::Cold {
        context_tokens,
        idle_ms,
        model,
        estimate_usd,
    } = &verdict
    {
        // Persist the audit before the wake it records.
        let event = Event {
            seq: None,
            v: pij_core::wire::EVENT_VERSION,
            at: now_ms,
            kind: COLD_WAKE_FORCED_KIND.to_string(),
            seat: Some(to.clone()),
            payload: serde_json::json!({
                "from": from,
                "msg_id": msg_id,
                "reason": reason,
                "context_tokens": context_tokens,
                "idle_ms": idle_ms,
                "model": model,
                "estimate_usd": estimate_usd,
            })
            .to_string(),
        };
        if let Err(error) = state.services.event_bus.publish(event).await {
            return Err(Box::new(internal(command, error)));
        }
    }
    Ok(Some(verdict.receipt_label(over.force)))
}
