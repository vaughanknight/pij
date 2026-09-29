//! `POST /v1/fyi/claim` and `POST /v1/activity` (plan 158).
//!
//! Both are writes a seat's own harness makes about itself: a typed-turn hook
//! claiming its held FYIs, and a turn boundary publishing busy/idle. The machine
//! bearer does not identify a seat, so each request also carries binding
//! evidence (the pane or the harness-native session), which must match the seat.

use axum::extract::{Json, State};
use axum::http::StatusCode;
use axum::response::Response;
use pij_core::error::PijError;
use pij_core::fyi::{HOOK_VIAS, render_block};
use pij_core::model::{Envelope, ErrorKind, SeatDescriptor, SeatId, SystemState};
use pij_core::ports::SeatFilter;
use serde::{Deserialize, Serialize};

use super::{AppState, envelope, internal, refused};

const CLAIM: &str = "pij fyi-claim";
const ACTIVITY: &str = "pij activity";

/// Who is asking, with the evidence that binds the request to the seat.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ClaimRequest {
    #[serde(default)]
    seat: Option<SeatId>,
    #[serde(default)]
    pane: Option<String>,
    #[serde(default)]
    native_session: Option<String>,
    via: String,
}

/// The claimed FYIs, already rendered by the one block definition.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ClaimResponse {
    /// The seat the FYIs were held for.
    pub seat: SeatId,
    /// How many were claimed.
    pub count: usize,
    /// The golden block, or empty when nothing was held.
    pub block: String,
    /// The claimed FYI ids, oldest first.
    pub ids: Vec<String>,
}

pub(crate) async fn claim(
    State(state): State<AppState>,
    Json(request): Json<ClaimRequest>,
) -> Response {
    if !HOOK_VIAS.contains(&request.via.as_str()) {
        return refused(
            CLAIM,
            format!("via must be one of {}", HOOK_VIAS.join(", ")),
        );
    }
    let seat = match bound_seat(
        &state,
        CLAIM,
        request.seat,
        request.pane,
        request.native_session,
    )
    .await
    {
        Ok(seat) => seat,
        Err(response) => return *response,
    };
    let fyis = match state
        .services
        .delivery
        .claim_fyis(&seat.id, &request.via)
        .await
    {
        Ok(fyis) => fyis,
        Err(error) => return internal(CLAIM, error),
    };
    let offset = pij_harnesses::proc::local_utc_offset_minutes().unwrap_or(0);
    envelope(
        StatusCode::OK,
        &Envelope::ok(
            CLAIM,
            ClaimResponse {
                seat: seat.id,
                count: fyis.len(),
                block: render_block(&fyis, offset),
                ids: fyis.into_iter().map(|fyi| fyi.id).collect(),
            },
        ),
    )
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ActivityRequest {
    seat: SeatId,
    #[serde(default)]
    pane: Option<String>,
    #[serde(default)]
    native_session: Option<String>,
    state: String,
}

/// The seat's mechanical state after the publication.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ActivityResponse {
    /// The seat.
    pub seat: SeatId,
    /// `working` or `idle`.
    pub state: String,
    /// Whether this publication changed the stored state.
    pub changed: bool,
}

pub(crate) async fn activity(
    State(state): State<AppState>,
    Json(request): Json<ActivityRequest>,
) -> Response {
    let observed = match request.state.as_str() {
        "working" => SystemState::Working,
        "idle" => SystemState::Idle,
        other => {
            return refused(
                ACTIVITY,
                format!("state must be `working` or `idle`, not `{other}`"),
            );
        }
    };
    let mut seat = match bound_seat(
        &state,
        ACTIVITY,
        Some(request.seat),
        request.pane,
        request.native_session,
    )
    .await
    {
        Ok(seat) => seat,
        Err(response) => return *response,
    };
    let changed = seat.state != observed;
    if changed {
        seat.state = observed;
        if let Err(error) = state.services.registry.put(seat.clone()).await {
            return internal(ACTIVITY, error);
        }
    }
    envelope(
        StatusCode::OK,
        &Envelope::ok(
            ACTIVITY,
            ActivityResponse {
                seat: seat.id,
                state: observed.as_str().to_string(),
                changed,
            },
        ),
    )
}

/// Resolve the live seat a hook speaks for, and check its binding evidence.
async fn bound_seat(
    state: &AppState,
    command: &str,
    seat: Option<SeatId>,
    pane: Option<String>,
    native_session: Option<String>,
) -> std::result::Result<SeatDescriptor, Box<Response>> {
    if pane.is_none() && native_session.is_none() {
        return Err(Box::new(refused(
            command,
            "binding evidence required: pass the seat's pane or native_session",
        )));
    }
    let registry = &state.services.registry;
    let descriptor = match (&seat, &pane) {
        (Some(seat), _) => registry
            .get(seat)
            .await
            .map_err(|error| Box::new(internal(command, error)))?,
        (None, Some(pane)) => {
            let live: Vec<SeatDescriptor> = registry
                .list(SeatFilter::default())
                .await
                .map_err(|error| Box::new(internal(command, error)))?
                .into_iter()
                .filter(|row| row.tombstoned_at.is_none() && row.pane.as_ref() == Some(pane))
                .collect();
            if live.len() > 1 {
                return Err(Box::new(refused(
                    command,
                    format!(
                        "pane {pane} is bound to {} live seats; name the seat",
                        live.len()
                    ),
                )));
            }
            live.into_iter().next()
        }
        (None, None) => {
            return Err(Box::new(refused(
                command,
                "name the seat, or pass the pane that is bound to it",
            )));
        }
    };
    let Some(descriptor) = descriptor else {
        return Err(Box::new(envelope(
            StatusCode::NOT_FOUND,
            &Envelope::<()>::refused(
                command,
                ErrorKind::NotFound,
                match (seat, pane) {
                    (Some(seat), _) => format!("no seat `{seat}` in this store"),
                    (None, pane) => {
                        format!("no live seat is bound to pane {}", pane.unwrap_or_default())
                    }
                },
            ),
        )));
    };
    if descriptor.tombstoned_at.is_some() {
        return Err(Box::new(envelope(
            StatusCode::GONE,
            &Envelope::<()>::refused(
                command,
                ErrorKind::Refused,
                PijError::SeatIsGone {
                    seat: descriptor.id,
                    tombstone_reason: descriptor.tombstone_reason,
                }
                .to_string(),
            ),
        )));
    }
    if let Some(pane) = &pane
        && descriptor.pane.as_ref() != Some(pane)
    {
        return Err(Box::new(refused(
            command,
            format!("pane {pane} is not bound to seat `{}`", descriptor.id),
        )));
    }
    if let Some(session) = &native_session
        && descriptor.harness_session.as_ref() != Some(session)
    {
        return Err(Box::new(refused(
            command,
            format!(
                "native session {session} is not bound to seat `{}`",
                descriptor.id
            ),
        )));
    }
    Ok(descriptor)
}
