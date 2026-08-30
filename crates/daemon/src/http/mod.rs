//! Authenticated daemon HTTP protocol primitives.
//!
//! Each route does one cheap statement or one durable enqueue (R4). Auth wraps
//! the completed router, so adding an endpoint cannot accidentally bypass it.

mod auth;
mod client;
mod exposure;
mod types;

use std::io;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::Router;
use axum::body::{Body, Bytes};
use axum::extract::{Json, Query, State};
use axum::http::{HeaderMap, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use pij_core::error::{PijError, Result};
use pij_core::events::EventFilter;
use pij_core::model::{
    Envelope, ErrorKind, Harness, Msg, ProcIdentity, SeatDescriptor, SeatId, Seq,
};
use pij_core::ports::SeatFilter;
use pij_core::wire;
use serde::Deserialize;
use tokio_stream::StreamExt;

use crate::{BUILD, Services};

pub use auth::AuthRing;
pub use client::{PeerEndpoint, post_to_peer};
pub use exposure::{Exposure, boot_banner, exposure};
pub use types::{EventFrame, Registration, SendRequest};

#[derive(Clone)]
struct AppState {
    services: Services,
    auth: AuthRing,
    machine_alias: String,
}

/// HTTP configuration supplied by the daemon composition root.
#[derive(Clone)]
pub struct HttpConfig {
    /// Per-boot credential used by clients on this machine.
    pub local_key: String,
    /// Persistent credentials for manually bootstrapped peer machines.
    pub peer_keys: Vec<String>,
    /// This machine's configured alias, defaulted from hostname by lifecycle.
    pub machine_alias: String,
}

impl HttpConfig {
    /// Local-only compatibility config used until lifecycle composition lands.
    pub fn local(local_key: String) -> Self {
        Self {
            local_key,
            peer_keys: Vec::new(),
            machine_alias: "local".to_string(),
        }
    }
}

#[derive(Clone, Copy, Debug)]
enum Endpoint {
    Health,
    Register,
    Send,
    Seats,
    Events,
}

impl Endpoint {
    const ALL: [Self; 5] = [
        Self::Health,
        Self::Register,
        Self::Send,
        Self::Seats,
        Self::Events,
    ];

    const fn path(self) -> &'static str {
        match self {
            Self::Health => "/health",
            Self::Register => "/v1/register",
            Self::Send => "/v1/send",
            Self::Seats => "/v1/seats",
            Self::Events => "/v1/events",
        }
    }

    const fn method(self) -> Method {
        match self {
            Self::Register | Self::Send => Method::POST,
            Self::Health | Self::Seats | Self::Events => Method::GET,
        }
    }
}

/// Build the local-only router used by the current composition root.
pub fn router(services: Services, token: String) -> Router {
    router_with_config(services, HttpConfig::local(token))
}

/// Build all daemon routes under one authentication ring.
///
/// # Composition recipe
///
/// In `crates/daemon/src/lib.rs`, import
/// `crate::http::{HttpConfig, PeerEndpoint, boot_banner, router_with_config}`.
/// After binding, print `boot_banner(&addr)`. Build `HttpConfig` from the local
/// per-boot token, persistent configured peer keys, and lifecycle's hostname-
/// defaulted machine alias, then call `router_with_config(services, http_config)`.
/// The wave-4 federation worker owns a `BTreeMap<String, PeerEndpoint>` plus one
/// `reqwest::Client`; it resolves a machine alias and calls `post_to_peer` once.
/// Removing a configured peer key from `HttpConfig::peer_keys` revokes inbound
/// access for that machine.
pub fn router_with_config(services: Services, config: HttpConfig) -> Router {
    let state = AppState {
        services,
        auth: AuthRing::new(config.local_key, config.peer_keys),
        machine_alias: config.machine_alias,
    };
    let mut router = Router::new();
    for endpoint in Endpoint::ALL {
        debug_assert_eq!(
            endpoint.method(),
            if matches!(endpoint, Endpoint::Register | Endpoint::Send) {
                Method::POST
            } else {
                Method::GET
            }
        );
        router = match endpoint {
            Endpoint::Health => router.route(endpoint.path(), get(health)),
            Endpoint::Register => router.route(endpoint.path(), post(register)),
            Endpoint::Send => router.route(endpoint.path(), post(send)),
            Endpoint::Seats => router.route(endpoint.path(), get(seats)),
            Endpoint::Events => router.route(endpoint.path(), get(events)),
        };
    }
    router
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            require_bearer,
        ))
        .with_state(state)
}

async fn require_bearer(
    State(state): State<AppState>,
    headers: HeaderMap,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    let presented = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if state.auth.accepts(presented) {
        return next.run(request).await;
    }
    envelope(
        StatusCode::UNAUTHORIZED,
        &Envelope::<()>::refused(
            "auth",
            ErrorKind::Auth,
            "missing or wrong bearer token — local clients read <state-dir>/daemon.key and send `Authorization: Bearer <key>`; peer machines use their manually bootstrapped configured key",
        ),
    )
}

#[derive(serde::Serialize)]
struct Health {
    status: &'static str,
    build: &'static str,
    offline: bool,
    machine: String,
}

async fn health(State(state): State<AppState>) -> Response {
    envelope(
        StatusCode::OK,
        &Envelope::ok(
            "pij ping",
            Health {
                status: "healthy",
                build: BUILD,
                offline: state.services.offline,
                machine: state.machine_alias,
            },
        ),
    )
}

async fn register(State(state): State<AppState>, Json(claim): Json<Registration>) -> Response {
    let proc = match (claim.pid, claim.proc_start) {
        (Some(pid), Some(proc_start)) => {
            let observed = match state.services.liveness.proc_start(pid).await {
                Ok(observed) => observed,
                Err(error) => return internal("pij register", error),
            };
            if observed != Some(proc_start) {
                return refused(
                    "pij register",
                    format!(
                        "the payload is a claim, but the daemon observed process {pid} start as {observed:?}, not {proc_start}"
                    ),
                );
            }
            Some(ProcIdentity { pid, proc_start })
        }
        (None, None) => None,
        _ => {
            return refused(
                "pij register",
                "pid and proc_start must travel together or not at all",
            );
        }
    };

    let seats = match state.services.registry.list(SeatFilter::default()).await {
        Ok(seats) => seats,
        Err(error) => return internal("pij register", error),
    };
    let claimed_id = SeatId::from(claim.id.clone());

    // A native session boundary (`/new`, `/fork`) keeps ONE process and takes a
    // NEW seat id, so the successor looks exactly like an alias to the #19 guard.
    // A claim may only supersede ITSELF — the named predecessor must carry the
    // same `(pid, proc_start)` — which keeps the refusal intact for an impostor
    // naming someone else's seat, the case #19 is actually about.
    let predecessor = match (claim.supersedes.as_ref(), proc) {
        (Some(previous), Some(identity)) => match seats.iter().find(|seat| &seat.id == previous) {
            Some(seat) if seat.proc == Some(identity) => Some(seat.clone()),
            Some(_) => {
                return refused(
                    "pij register",
                    format!(
                        "seat `{previous}` does not share this process, so it cannot be superseded by `{}` — a claim may only supersede itself",
                        claim.id
                    ),
                );
            }
            None => None,
        },
        (Some(_), None) => {
            return refused(
                "pij register",
                "an unbound claim cannot supersede a seat: without a process identity there is nothing that proves the successor is the same session",
            );
        }
        (None, _) => None,
    };

    let collision = proc.and_then(|identity| {
        seats.iter().find(|seat| {
            seat.proc == Some(identity)
                && seat.id != claimed_id
                && predecessor.as_ref().is_none_or(|prev| prev.id != seat.id)
        })
    });
    let bound = proc.is_some();
    match crate::admission::from_registration(
        &claim.id,
        Some(&claim.harness),
        Some(&claim.folder),
        bound,
        collision.map(|seat| seat.id.as_str()),
    ) {
        pij_core::admission::Admission::Admit => {}
        pij_core::admission::Admission::Refuse(reason) => {
            return refused("pij register", reason);
        }
    }
    let Some(harness) = Harness::parse(&claim.harness) else {
        return refused("pij register", "unrecognised harness after admission");
    };
    let mut descriptor = seats
        .iter()
        .find(|seat| seat.id == claimed_id)
        .cloned()
        .unwrap_or_else(|| SeatDescriptor::new(claimed_id, harness, claim.folder.clone()));
    descriptor.harness = harness;
    descriptor.folder = claim.folder;
    descriptor.pane = claim.pane;
    descriptor.proc = proc;
    descriptor.spawn_id = claim.spawn_id;
    descriptor.model = claim.model;
    descriptor.provider = claim.provider;
    descriptor.effort = claim.effort;
    descriptor.parent = claim.parent;
    descriptor.relay = claim.relay;
    // Tombstone the predecessor BEFORE writing the successor, and name the
    // successor in the reason. Not a delete: queued work and history for the old
    // id must not silently vanish, and `SeatIsGone` carrying "superseded by X" is
    // a post-mortem a human can actually follow. Persist-before-mutate (P9), so a
    // crash between the two leaves a dissolved predecessor rather than two live
    // rows sharing one process.
    if let Some(mut previous) = predecessor
        && previous.tombstoned_at.is_none()
    {
        {
            previous.tombstoned_at = Some(match system_time_ms() {
                Ok(at) => at,
                Err(error) => return internal("pij register", error),
            });
            previous.tombstone_reason = Some(format!(
                "superseded by `{}` at a native session boundary (same process)",
                claim.id
            ));
            if let Err(error) = state.services.registry.put(previous).await {
                return internal("pij register", error);
            }
        }
    }
    if let Err(error) = state.services.registry.put(descriptor.clone()).await {
        return internal("pij register", error);
    }
    envelope(StatusCode::OK, &Envelope::ok("pij register", descriptor))
}

async fn send(State(state): State<AppState>, Json(request): Json<SendRequest>) -> Response {
    if request.to.machine.is_some() {
        return envelope(
            StatusCode::BAD_REQUEST,
            &Envelope::<()>::refused(
                "pij send",
                ErrorKind::Refused,
                "remote destinations are refused in wave 3: federation routing lands in u-federation (wave 4); forward the local form to the destination daemon",
            ),
        );
    }
    // ONE delivery path. This route used to enqueue a payload shape of its own
    // and synthesise a Queued receipt, which meant it consulted no routing
    // policy, no tombstone and no transport, published no event, and wrote a
    // payload the inbox reading that same queue could not decode. Two halves of
    // one round trip, each proven against itself. Found by u-extension.
    let msg = Msg {
        from: request.from,
        to: request.to.seat,
        body: request.body,
        msg_id: request.msg_id,
        command: None,
    };
    match state.services.delivery.accept(msg).await {
        Ok(receipt) => envelope(StatusCode::OK, &Envelope::ok("pij send", receipt)),
        Err(error @ PijError::SeatIsGone { .. }) => envelope(
            StatusCode::GONE,
            &Envelope::<()>::refused("pij send", ErrorKind::Refused, error.to_string()),
        ),
        Err(error @ PijError::NoRegistryEntry { .. }) => envelope(
            StatusCode::NOT_FOUND,
            &Envelope::<()>::refused("pij send", ErrorKind::NotFound, error.to_string()),
        ),
        Err(error @ PijError::SelfAddressed { .. }) => envelope(
            StatusCode::BAD_REQUEST,
            &Envelope::<()>::refused("pij send", ErrorKind::Refused, error.to_string()),
        ),
        Err(error) => internal("pij send", error),
    }
}

#[derive(Default, Deserialize)]
struct SeatQuery {
    harness: Option<Harness>,
    folder: Option<String>,
    parent: Option<SeatId>,
}

async fn seats(State(state): State<AppState>, Query(query): Query<SeatQuery>) -> Response {
    let listed = state
        .services
        .registry
        .list(SeatFilter {
            harness: query.harness,
            folder: query.folder,
            parent: query.parent,
        })
        .await;
    match listed {
        Ok(seats) => envelope(StatusCode::OK, &Envelope::ok("pij seats", seats)),
        Err(error) => internal("pij seats", error),
    }
}

#[derive(Default, Deserialize)]
struct EventQuery {
    since: Option<u64>,
}

async fn events(State(state): State<AppState>, Query(query): Query<EventQuery>) -> Response {
    let subscription = match query.since {
        Some(cursor) => match state
            .services
            .event_bus
            .subscribe(Some(Seq(cursor)), EventFilter::all())
            .await
        {
            Ok(subscription) => subscription,
            Err(error) => return internal("pij events", error),
        },
        None => state.services.event_bus.subscribe_live(EventFilter::all()),
    };
    let hello = match wire::encode_hello(BUILD) {
        Ok(hello) => hello,
        Err(error) => return internal("pij events", error),
    };
    let machine = state.machine_alias;
    let frames =
        subscription.map(move |event| encode_frame(machine.clone(), event).map(Bytes::from));
    let stream = tokio_stream::once(Ok::<Bytes, io::Error>(Bytes::from(hello))).chain(frames);
    (
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "application/x-ndjson")],
        Body::from_stream(stream),
    )
        .into_response()
}

fn encode_frame(machine: String, event: pij_core::model::Event) -> io::Result<String> {
    let cursor = event.seq.ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "EventBus yielded an event without its assigned stream cursor",
        )
    })?;
    serde_json::to_string(&EventFrame {
        machine,
        cursor: cursor.0,
        event,
    })
    .map(|line| format!("{line}\n"))
    .map_err(io::Error::other)
}

fn system_time_ms() -> Result<u64> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/http".to_string(),
            message: format!("system clock is before the Unix epoch: {error}"),
        })?
        .as_millis();
    u64::try_from(millis).map_err(|_| PijError::Adapter {
        adapter: "daemon/http".to_string(),
        message: "system clock exceeds the supported millisecond range".to_string(),
    })
}
fn refused(command: &str, reason: impl std::fmt::Display) -> Response {
    envelope(
        StatusCode::BAD_REQUEST,
        &Envelope::<()>::refused(command, ErrorKind::Refused, reason.to_string()),
    )
}

fn internal(command: &str, error: impl std::fmt::Display) -> Response {
    envelope(
        StatusCode::INTERNAL_SERVER_ERROR,
        // An adapter failed at its boundary and its own words travel in `meta`.
        // Every failure route now carries a discriminator: u-cli proved no honest
        // exit-code table can be built from prose, and u-extension found this
        // helper still emitting an envelope with no `error` at all.
        &Envelope::<()>::refused(command, ErrorKind::Adapter, error.to_string()),
    )
}

fn envelope<T: serde::Serialize>(status: StatusCode, body: &Envelope<T>) -> Response {
    match serde_json::to_string(body) {
        Ok(text) => (
            status,
            [(axum::http::header::CONTENT_TYPE, "application/json")],
            text,
        )
            .into_response(),
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}

#[cfg(test)]
mod tests;
