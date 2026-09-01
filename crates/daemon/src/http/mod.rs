//! Authenticated daemon HTTP protocol primitives.
//!
//! Each route does one cheap statement or one durable enqueue (R4). Auth wraps
//! the completed router, so adding an endpoint cannot accidentally bypass it.

mod auth;
mod client;
mod exposure;
mod report;
mod types;

use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;
use std::io;
use std::path::Path;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

const INBOX_ACK_EVENT_KIND: &str = "delivery.inbox-ack";
const REVIVE_POSTMORTEM_EVENT_KIND: &str = "seat.revive-postmortem";

use axum::Router;
use axum::body::{Body, Bytes};
use axum::extract::{Extension, Json, Query, State};
use axum::http::{HeaderMap, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use pij_core::error::{PijError, Result};
use pij_core::events::EventFilter;
use pij_core::model::{
    Envelope, ErrorKind, Event, Harness, Msg, SeatDescriptor, SeatId, SemanticState, Seq,
};
use pij_core::names::memorable_pij_id_candidates;
use pij_core::ports::{LaunchCommand, Registry, SeatFilter};
use pij_core::wire;
use pij_harnesses::{SpawnPlanInput, build_spawn_plan};
use serde::Deserialize;
use tokio_stream::{Stream, StreamExt};

use crate::federation::{FederationSendError, FederationService};
use crate::registration::{RegistrationError, RegistrationService};
use crate::{BUILD, Services};
pub use auth::AuthRing;
pub use client::{PeerEndpoint, get_from_peer, post_to_peer, stream_from_peer};
pub use exposure::{Exposure, boot_banner, exposure};
pub use types::{
    CursorResetDetail, FederatedRoster, InboxAckRequest, PeerStreamState, Registration,
    ReviveRequest, SendRequest, SpawnRequest, StreamFrame, UnavailablePeer,
};

#[derive(Clone)]
pub(crate) struct AppState {
    services: Services,
    auth: AuthRing,
    machine_alias: String,
    spawn_lock: Arc<tokio::sync::Mutex<()>>,
    federation: Option<Arc<FederationService>>,
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
    Spawn,
    Revive,
    Send,
    Inbox,
    InboxAck,
    Seats,
    Events,
    /// Producer for the three sidecar consumers. The consumers are queue-backed,
    /// so a sidecar job must be ENQUEUED by something; without this route the
    /// only producer would be hand-written SQL, which proves nothing about the
    /// shipped surface.
    Sidecar,
    /// The whole `report` family, on one path.
    ///
    /// One endpoint rather than six because the shim routes by VERB and hands
    /// the daemon the caller's `argv` untouched; the leaf is the second token of
    /// that argv, not a second path.
    Report,
}

impl Endpoint {
    const ALL: [Self; 11] = [
        Self::Health,
        Self::Register,
        Self::Spawn,
        Self::Revive,
        Self::Send,
        Self::Inbox,
        Self::InboxAck,
        Self::Seats,
        Self::Events,
        Self::Sidecar,
        Self::Report,
    ];

    const fn path(self) -> &'static str {
        match self {
            Self::Health => "/health",
            Self::Register => "/v1/register",
            Self::Spawn => "/v1/spawn",
            Self::Revive => "/v1/revive",
            Self::Send => "/v1/send",
            Self::Inbox => "/v1/inbox",
            Self::InboxAck => "/v1/inbox/ack",
            Self::Seats => "/v1/seats",
            Self::Events => "/v1/events",
            Self::Sidecar => "/v1/sidecar",
            Self::Report => "/v1/report",
        }
    }

    const fn method(self) -> Method {
        match self {
            Self::Register
            | Self::Spawn
            | Self::Revive
            | Self::Send
            | Self::InboxAck
            | Self::Sidecar
            | Self::Report => Method::POST,
            Self::Health | Self::Inbox | Self::Seats | Self::Events => Method::GET,
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
    router_with_optional_federation(services, config, None)
}

/// Build daemon routes with remote-send admission enabled.
pub fn router_with_federation(
    services: Services,
    config: HttpConfig,
    federation: Arc<FederationService>,
) -> Router {
    router_with_optional_federation(services, config, Some(federation))
}

fn router_with_optional_federation(
    services: Services,
    config: HttpConfig,
    federation: Option<Arc<FederationService>>,
) -> Router {
    let state = AppState {
        services,
        auth: AuthRing::new(config.local_key, config.peer_keys),
        machine_alias: config.machine_alias,
        spawn_lock: Arc::new(tokio::sync::Mutex::new(())),
        federation,
    };
    let mut router = Router::new();
    for endpoint in Endpoint::ALL {
        debug_assert_eq!(
            endpoint.method(),
            if matches!(
                endpoint,
                Endpoint::Register
                    | Endpoint::Spawn
                    | Endpoint::Revive
                    | Endpoint::Send
                    | Endpoint::InboxAck
                    | Endpoint::Sidecar
                    | Endpoint::Report
            ) {
                Method::POST
            } else {
                Method::GET
            }
        );
        router = match endpoint {
            Endpoint::Health => router.route(endpoint.path(), get(health)),
            Endpoint::Register => router.route(endpoint.path(), post(register)),
            Endpoint::Spawn => router.route(endpoint.path(), post(spawn_seat)),
            Endpoint::Revive => router.route(endpoint.path(), post(revive_seat)),
            Endpoint::Send => router.route(endpoint.path(), post(send)),
            Endpoint::Inbox => router.route(endpoint.path(), get(inbox)),
            Endpoint::InboxAck => router.route(endpoint.path(), post(ack_inbox)),
            Endpoint::Seats => router.route(endpoint.path(), get(seats)),
            Endpoint::Events => router.route(endpoint.path(), get(events)),
            Endpoint::Sidecar => router.route(endpoint.path(), post(sidecar)),
            Endpoint::Report => router.route(endpoint.path(), post(report)),
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
    mut request: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    let presented = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if let Some(identity) = state.auth.authenticate(presented) {
        request.extensions_mut().insert(identity);
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
    let registration = RegistrationService::new(
        Arc::clone(&state.services.registry),
        Arc::clone(&state.services.liveness),
    );
    match registration.register(claim).await {
        Ok(descriptor) => envelope(StatusCode::OK, &Envelope::ok("pij register", descriptor)),
        Err(RegistrationError::Refused(reason)) => refused("pij register", reason),
        Err(RegistrationError::Runtime(error)) => internal("pij register", error),
    }
}

/// The first memorable name this roster does not already hold.
///
/// Extracted from the route so it can be TESTED (review round 2 found the loop had
/// no coverage at all): the candidate order is deterministic per seed, so a test
/// pre-registers the first candidate and asserts allocation advances — which the
/// inline version could not express, because the seed was minted inside the route.
///
/// `Ok(None)` means the space is exhausted, which is a refusal rather than an
/// error: nothing failed, there is simply no name left.
async fn allocate_memorable_id(registry: &dyn Registry, seed: &str) -> Result<Option<SeatId>> {
    for candidate in memorable_pij_id_candidates(seed) {
        if registry.get(&candidate).await?.is_none() {
            return Ok(Some(candidate));
        }
    }
    Ok(None)
}

/// Read and publish the tombstone that a revive is about to replace. Reading
/// registry truth here makes the ordering load-bearing: moving this call after
/// the overwrite fails because the post-mortem no longer exists.
async fn publish_revive_postmortem(state: &AppState, seat_id: &SeatId) -> Result<()> {
    let previous =
        state
            .services
            .registry
            .get(seat_id)
            .await?
            .ok_or_else(|| PijError::Adapter {
                adapter: "spawn".to_string(),
                message: format!("cannot preserve revive history for absent seat `{seat_id}`"),
            })?;
    if previous.tombstoned_at.is_none() {
        return Err(PijError::Adapter {
            adapter: "spawn".to_string(),
            message: format!("cannot preserve revive history for live seat `{seat_id}`"),
        });
    }
    let payload = serde_json::json!({
        "tombstoned_at": previous.tombstoned_at,
        "reason": previous.tombstone_reason,
        "role": previous.role,
        "semantic_state": previous.semantic_state,
    })
    .to_string();
    state
        .services
        .event_bus
        .publish(Event {
            seq: None,
            v: wire::EVENT_VERSION,
            at: system_time_ms()?,
            kind: REVIVE_POSTMORTEM_EVENT_KIND.to_string(),
            seat: Some(previous.id),
            payload,
        })
        .await?;
    Ok(())
}

#[derive(Clone, Copy)]
pub(crate) struct ExistingSeatPolicy {
    pub(crate) allow_absent: bool,
}

async fn spawn_seat(State(state): State<AppState>, Json(request): Json<SpawnRequest>) -> Response {
    launch_seat(
        &state,
        request,
        ExistingSeatPolicy { allow_absent: true },
        "pij spawn",
    )
    .await
}

/// Relaunch one tombstoned id through the spawn transition.
///
/// Harness, folder, model, effort, parent, and inbound configuration are durable
/// seat identity or launch intent, so they cross the incarnation boundary. The
/// old process identity and RPC-port intent describe resources held by one
/// incarnation; neither is copied. Allocation and stamping stay exclusively in
/// [`launch_seat`].
async fn revive_seat(
    State(state): State<AppState>,
    Json(request): Json<ReviveRequest>,
) -> Response {
    let prior = match state.services.registry.get(&request.id).await {
        Ok(Some(prior)) if prior.tombstoned_at.is_some() => prior,
        Ok(Some(_)) => {
            return refused(
                "pij revive",
                format!(
                    "seat `{}` is live — revive only accepts tombstoned ids",
                    request.id
                ),
            );
        }
        Ok(None) => {
            return envelope(
                StatusCode::NOT_FOUND,
                &Envelope::<SeatDescriptor>::refused(
                    "pij revive",
                    ErrorKind::NotFound,
                    format!(
                        "seat `{}` does not exist — revive requires an existing tombstoned id",
                        request.id
                    ),
                ),
            );
        }
        Err(error) => return internal("pij revive", error),
    };

    let spawn_request = SpawnRequest {
        id: Some(prior.id),
        harness: prior.harness,
        executable: None,
        model: prior.model,
        effort: prior.effort,
        cwd: prior.folder,
        session: request.session,
        caller_pane: request.caller_pane,
        name: request.name,
        parent: prior.parent,
        accept_inbound: prior.cross_session_inbound_accept == Some(true),
    };
    launch_seat(
        &state,
        spawn_request,
        ExistingSeatPolicy {
            allow_absent: false,
        },
        "pij revive",
    )
    .await
}

/// Launch one seat under the spawn lock. Spawn and revive routes share this
/// transition so allocation, argv-derived stamps, rollback, and persistence
/// have exactly one owner.
pub(crate) async fn launch_seat(
    state: &AppState,
    request: SpawnRequest,
    existing_policy: ExistingSeatPolicy,
    command_name: &'static str,
) -> Response {
    if let Some(id) = request.id.as_ref()
        && id.as_str().trim().is_empty()
    {
        return refused(command_name, "--id must be non-empty when supplied");
    }
    if !Path::new(&request.cwd).is_absolute() {
        return refused(
            command_name,
            "--cwd must be absolute so the descriptor cannot depend on daemon cwd",
        );
    }

    let session = match request.session.as_deref() {
        Some(session) if !session.trim().is_empty() => session.to_string(),
        Some(_) => return refused(command_name, "--session must be non-empty"),
        None => {
            let Some(caller_pane) = request.caller_pane.as_deref() else {
                return refused(
                    command_name,
                    "no caller pane was supplied — pass --session <tmux> explicitly",
                );
            };
            let panes = match state.services.tmux.list_panes().await {
                Ok(panes) => panes,
                Err(error) => return internal(command_name, error),
            };
            let Some(pane) = panes.iter().find(|pane| pane.id == caller_pane) else {
                return refused(
                    command_name,
                    format!(
                        "caller pane `{caller_pane}` did not resolve to a tmux session — pass --session <tmux> explicitly"
                    ),
                );
            };
            pane.session.clone()
        }
    };

    // Keep classification, observed launch, and descriptor write in one
    // daemon-local critical section. Registry::put is an upsert; without this
    // lock two requests could both launch before either row existed.
    let spawn_id = match mint_spawn_id() {
        Ok(spawn_id) => spawn_id,
        Err(error) => return internal(command_name, error),
    };
    let _spawn_guard = state.spawn_lock.lock().await;
    let (seat_id, displaced) = match request.id.clone() {
        Some(id) => match state.services.registry.get(&id).await {
            Ok(Some(existing)) if existing.tombstoned_at.is_none() => {
                let reason = if existing_policy.allow_absent {
                    format!(
                        "seat `{id}` already exists and is not tombstoned — choose another --id or tombstone it before respawning"
                    )
                } else {
                    format!("seat `{id}` is live, so it cannot be revived")
                };
                return refused(command_name, reason);
            }
            Ok(Some(existing)) => (id, Some(existing)),
            Ok(None) if existing_policy.allow_absent => (id, None),
            Ok(None) => {
                return refused(
                    command_name,
                    format!("seat `{id}` does not exist, so it cannot be revived"),
                );
            }
            Err(error) => return internal(command_name, error),
        },
        None if existing_policy.allow_absent => {
            match allocate_memorable_id(&*state.services.registry, &spawn_id).await {
                Ok(Some(id)) => (id, None),
                Ok(None) => {
                    return refused(
                        command_name,
                        "every memorable name is taken — pass an explicit --id",
                    );
                }
                Err(error) => return internal(command_name, error),
            }
        }
        None => return refused(command_name, "revive requires an existing seat id"),
    };

    let copilot_rpc_port_intent = if request.harness == Harness::Copilot {
        let mut unavailable = displaced
            .as_ref()
            .and_then(|seat| seat.rpc_port_intent)
            .into_iter()
            .collect::<BTreeSet<_>>();
        let seats = match state.services.registry.list(SeatFilter::default()).await {
            Ok(seats) => seats,
            Err(error) => return internal(command_name, error),
        };
        unavailable.extend(
            seats
                .into_iter()
                .filter(|seat| seat.tombstoned_at.is_none())
                .filter_map(|seat| seat.rpc_port_intent),
        );
        match state.services.rpc_ports.allocate(&unavailable).await {
            Ok(port) => Some(port),
            Err(error) => return internal(command_name, error),
        }
    } else {
        None
    };
    let plan = match build_spawn_plan(SpawnPlanInput {
        seat_id: seat_id.clone(),
        spawn_id: spawn_id.clone(),
        harness: request.harness,
        executable: request.executable,
        model: request.model,
        resolved_provider: None,
        effort: request.effort,
        accept_inbound: request.accept_inbound,
        copilot_rpc_port_intent,
    }) {
        Ok(plan) => plan,
        Err(error) => return refused(command_name, error),
    };
    let command = LaunchCommand {
        executable: plan.executable.clone(),
        args: plan.args.clone(),
    };
    let name = request
        .name
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| seat_id.as_str().to_string());
    let pane = match state
        .services
        .tmux
        .new_window(&session, &name, &request.cwd, Some(&command))
        .await
    {
        Ok(pane) => pane,
        Err(error) => return internal(command_name, error),
    };
    if displaced.is_some()
        && let Err(error) = publish_revive_postmortem(state, &seat_id).await
    {
        let _ = state.services.tmux.kill(&pane.id).await;
        return internal(command_name, error);
    }

    // Carry seat and launch intent into the fresh row; never carry possession.
    // `proc` remains absent until the new incarnation registers.
    let mut descriptor = SeatDescriptor::new(seat_id, plan.harness, request.cwd);
    descriptor.pane = Some(pane.id.clone());
    descriptor.parent = request.parent;
    descriptor.cross_session_inbound_accept = Some(plan.cross_session_inbound_accept);
    descriptor.rpc_port_intent = plan.rpc_port_intent;
    descriptor.spawn_id = Some(spawn_id);
    descriptor.model = plan.model;
    descriptor.provider = plan.provider;
    descriptor.effort = plan.effort;
    if let Err(write_error) = state.services.registry.put(descriptor.clone()).await {
        let rollback = state.services.tmux.kill(&pane.id).await;
        let message = match rollback {
            Ok(()) => format!(
                "observed launch in pane {} but registry write failed ({write_error}); the pane was removed",
                pane.id
            ),
            Err(kill_error) => format!(
                "observed launch in pane {} but registry write failed ({write_error}); rollback also failed ({kill_error})",
                pane.id
            ),
        };
        return internal(
            command_name,
            PijError::Adapter {
                adapter: "spawn".to_string(),
                message,
            },
        );
    }

    envelope(StatusCode::OK, &Envelope::ok(command_name, descriptor))
}

async fn send(State(state): State<AppState>, Json(request): Json<SendRequest>) -> Response {
    if request.to.machine.is_some() {
        let Some(federation) = state.federation.as_ref() else {
            return refused(
                "pij send",
                "remote destinations require configured federation peers",
            );
        };
        return match federation.enqueue_remote(&request).await {
            Ok(receipt) => envelope(StatusCode::OK, &Envelope::ok("pij send", receipt)),
            Err(FederationSendError::Refused(reason)) => refused("pij send", reason),
            Err(FederationSendError::Runtime(error)) => internal("pij send", error),
        };
    }
    // ONE delivery path. This route used to enqueue a payload shape of its own
    // and synthesise a Queued receipt, which meant it consulted no routing
    // policy, no tombstone and no transport, published no event, and wrote a
    // payload the inbox reading that same queue could not decode. Two halves of
    // one round trip, each proven against itself. Found by u-extension.
    let forwarded = request.from_machine.is_some();
    let msg = Msg {
        from: request.from,
        // Carried from the wire: a federation worker forwarding A's message to B
        // stamps it, and a local client simply omits it.
        from_machine: request.from_machine,
        to: request.to.seat,
        body: request.body,
        msg_id: request.msg_id,
        in_reply_to: request.in_reply_to,
        command: None,
    };
    let accepted = if forwarded {
        state.services.delivery.accept_forwarded(msg).await
    } else {
        state.services.delivery.accept(msg).await
    };
    match accepted {
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
#[derive(Deserialize)]
struct InboxQuery {
    seat: SeatId,
    #[serde(default)]
    wait: bool,
}

/// Claim one inbox message without recording delivery.
///
/// This GET is the explicit bounded multi-write exception to R4: every delivery
/// row for a seat shares that seat's serial key, and queue serialization permits
/// only one running claim per serial key, so one request can mutate exactly one
/// row from pending to running. It records no `ReaderRead`. A client that receives
/// the claim and dies before the separate acknowledgement may read it again after
/// claim expiry; that residual duplicate is deliberately preferred to losing a
/// message behind false evidence.
async fn inbox(State(state): State<AppState>, Query(query): Query<InboxQuery>) -> Response {
    match state
        .services
        .delivery
        .claim_inbox(&query.seat, query.wait)
        .await
    {
        Ok(claims) => envelope(StatusCode::OK, &Envelope::ok("pij inbox", claims)),
        Err(error) => internal("pij inbox", error),
    }
}

#[derive(serde::Serialize)]
struct InboxAckAudit {
    job_id: pij_core::model::JobId,
    authenticated_machine: &'static str,
    evidence_grade: &'static str,
    outcome: pij_core::model::DeliveryOrigin,
}

/// Record `ReaderRead` only after the queue authority commits the named job.
///
/// Bearer auth attests to a machine, not `request.seat`; attribution therefore
/// comes from the acknowledged job's serial key. The event carries the committed
/// outcome and is never minted for an invalid job or failed ledger write.
async fn ack_inbox(
    State(state): State<AppState>,
    Extension(authenticated): Extension<auth::AuthenticatedMachine>,
    Json(request): Json<InboxAckRequest>,
) -> Response {
    let acknowledged = match state
        .services
        .delivery
        .acknowledge_inbox(request.job_id)
        .await
    {
        Ok(acknowledged) => acknowledged,
        Err(error) => return internal("pij inbox", error),
    };
    let payload = match serde_json::to_string(&InboxAckAudit {
        job_id: request.job_id,
        authenticated_machine: authenticated.0,
        evidence_grade: "machine",
        outcome: acknowledged.origin,
    }) {
        Ok(payload) => payload,
        Err(error) => return internal("pij inbox", error),
    };
    let at = match system_time_ms() {
        Ok(at) => at,
        Err(error) => return internal("pij inbox", error),
    };
    if let Err(error) = state
        .services
        .event_bus
        .publish(pij_core::model::Event {
            seq: None,
            v: wire::EVENT_VERSION,
            at,
            kind: INBOX_ACK_EVENT_KIND.to_string(),
            seat: Some(acknowledged.recipient),
            payload,
        })
        .await
    {
        return internal("pij inbox", error);
    }

    envelope(StatusCode::OK, &Envelope::ok("pij inbox", request.job_id))
}

#[derive(Default, Deserialize)]
struct SeatQuery {
    harness: Option<Harness>,
    folder: Option<String>,
    parent: Option<SeatId>,
    scope: Option<String>,
}

async fn seats(State(state): State<AppState>, Query(query): Query<SeatQuery>) -> Response {
    if query.scope.as_deref().is_some_and(|scope| scope != "local") {
        return refused("pij seats", "scope must be `local` when supplied");
    }
    let listed = state.services.registry.list(SeatFilter::default()).await;
    let mut local = match listed {
        Ok(seats) => seats,
        Err(error) => return internal("pij seats", error),
    };
    for seat in &mut local {
        seat.machine = Some(state.machine_alias.clone());
    }
    let mut roster = if query.scope.as_deref() == Some("local") {
        FederatedRoster {
            seats: local,
            unavailable: Vec::new(),
        }
    } else if let Some(federation) = &state.federation {
        federation.federated_roster(local)
    } else {
        FederatedRoster {
            seats: local,
            unavailable: Vec::new(),
        }
    };
    roster.seats.retain(|seat| {
        query.harness.is_none_or(|harness| seat.harness == harness)
            && query
                .folder
                .as_ref()
                .is_none_or(|folder| &seat.folder == folder)
            && query
                .parent
                .as_ref()
                .is_none_or(|parent| seat.parent.as_ref() == Some(parent))
    });
    envelope(StatusCode::OK, &Envelope::ok("pij seats", roster))
}

#[derive(Default, Deserialize)]
struct EventQuery {
    /// URL-encoded JSON object: `{\"desktop\":12,\"laptop\":7}`.
    since: Option<String>,
    scope: Option<String>,
}

async fn events(State(state): State<AppState>, Query(query): Query<EventQuery>) -> Response {
    if query.scope.as_deref().is_some_and(|scope| scope != "local") {
        return refused("pij events", "scope must be `local` when supplied");
    }
    let cursors: BTreeMap<String, u64> = match query.since {
        Some(encoded) => match serde_json::from_str(&encoded) {
            Ok(cursors) => cursors,
            Err(error) => {
                return refused(
                    "pij events",
                    format!(
                        "since must be a JSON object mapping machine aliases to cursors: {error}"
                    ),
                );
            }
        },
        None => BTreeMap::new(),
    };
    // REFUSE a cursor for a machine this daemon cannot serve. Ignoring it made a
    // consumer holding a cursor for a renamed or unconfigured machine silently
    // lose that machine's replay, and receive a 200 that presented silence as
    // completeness (review F5). A key we cannot honour is named, not dropped.
    let servable: BTreeSet<&str> = std::iter::once(state.machine_alias.as_str())
        .chain(
            state
                .federation
                .iter()
                .flat_map(|federation| federation.peer_aliases()),
        )
        .collect();
    let unknown: Vec<&str> = cursors
        .keys()
        .map(String::as_str)
        .filter(|machine| !servable.contains(machine))
        .collect();
    if !unknown.is_empty() {
        return refused(
            "pij events",
            format!(
                "since names machine(s) this daemon does not serve: {}. Known: {}",
                unknown.join(", "),
                servable.into_iter().collect::<Vec<_>>().join(", ")
            ),
        );
    }

    let local = match cursors.get(&state.machine_alias).copied() {
        Some(cursor) => match state
            .services
            .event_bus
            .subscribe(Some(Seq(cursor)), EventFilter::all())
            .await
        {
            Ok(subscription) => subscription,
            // A cursor beyond the spine is the CLIENT's stale state, not our
            // failure: 409 with a machine-readable kind, so a consumer branches on
            // the KIND and never on our wording (review F10).
            Err(error @ PijError::CursorBeyondSpine { requested, newest }) => {
                let mut refusal = Envelope::<CursorResetDetail>::refused(
                    "pij events",
                    ErrorKind::CursorReset,
                    error.to_string(),
                );
                // The numbers travel as DATA so a client never reads them out of a
                // sentence, and never has to invent them.
                refusal.data = Some(CursorResetDetail { requested, newest });
                return envelope(StatusCode::CONFLICT, &refusal);
            }
            Err(error) => return internal("pij events", error),
        },
        // Absent cursor means live-only. `subscribe(None, ...)` would replay the
        // whole spine and is forbidden at an attach boundary (COMMON §6).
        None => state.services.event_bus.subscribe_live(EventFilter::all()),
    };
    let local_alias = state.machine_alias.clone();
    let local = local.map(move |event| StreamFrame::Event {
        machine: local_alias.clone(),
        cursor: event
            .seq
            .expect("EventBus subscriptions always assign cursors")
            .0,
        event,
    });
    // `/v1/events` is the explicit streaming exception to R4: the request
    // handler attaches to owned worker/bus streams; peer network IO remains in
    // the federation workers rather than running inline here.
    let frames: Pin<Box<dyn Stream<Item = StreamFrame> + Send>> =
        if query.scope.as_deref() != Some("local") {
            if let Some(federation) = &state.federation {
                Box::pin(local.merge(federation.subscribe_remote(&cursors)))
            } else {
                Box::pin(local)
            }
        } else {
            Box::pin(local)
        };
    let hello = match wire::encode_hello(BUILD) {
        Ok(hello) => hello,
        Err(error) => return internal("pij events", error),
    };
    let frames = frames
        .map(encode_frame)
        .map(|result| result.map(Bytes::from));
    let stream = tokio_stream::once(Ok::<Bytes, io::Error>(Bytes::from(hello))).chain(frames);
    (
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "application/x-ndjson")],
        Body::from_stream(stream),
    )
        .into_response()
}

fn encode_frame(frame: StreamFrame) -> io::Result<String> {
    serde_json::to_string(&frame)
        .map(|line| format!("{line}\n"))
        .map_err(io::Error::other)
}

fn mint_spawn_id() -> Result<String> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes).map_err(|error| PijError::Adapter {
        adapter: "spawn".to_string(),
        message: format!("the OS refused randomness for the spawn id: {error}"),
    })?;
    let mut id = String::with_capacity(34);
    id.push_str("s-");
    for byte in bytes {
        write!(&mut id, "{byte:02x}").expect("writing to a String cannot fail");
    }
    Ok(id)
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
/// What the shim and the rs CLI send to `/v1/report`.
///
/// `argv` is the caller's own `process.argv.slice(2)`, verb included and
/// otherwise untouched. The SEAT is a separate field because `report` is
/// FIRST-PERSON testimony and its subject is never typed: the TypeScript
/// generation resolves the reporting seat from the caller's environment
/// (`resolveReportingSelf`, `.pi/extensions/pij/core/cli.ts:1992`), which is a
/// place the daemon cannot see. So the caller forwards it, and this handler
/// treats it as a CLAIM to check against the registry, never as an identity to
/// trust.
#[derive(Debug, Deserialize)]
struct ReportRequest {
    /// The reporting seat, sent explicitly. This is what `pij-rs report …` uses:
    /// the CLI resolves the seat client-side, where the environment actually is.
    #[serde(default)]
    seat: Option<String>,
    /// The forwarded caller context. The shim sends an allowlisted set of
    /// environment facts rather than a blanket dump; only the session id
    /// identifies the seat, so only it is read here — a field this handler does
    /// not consult is a field it cannot be misled by.
    #[serde(default)]
    caller: Option<CallerContext>,
    argv: Vec<String>,
}

/// The forwarded caller facts this handler reads.
///
/// The alias exists because the field crosses a runtime boundary by NAME: the
/// TypeScript side writes the key, Rust reads it, and nothing but agreement
/// between two files keeps them matching. Accepting both spellings is not
/// tolerance of drift — it is one field with the wire name pinned beside the
/// Rust name where a reader of either can see the other.
#[derive(Debug, Deserialize)]
struct CallerContext {
    #[serde(default, alias = "PIJ_SESSION_ID", alias = "pijSessionId")]
    pij_session_id: Option<String>,
}

/// What a successful report answers with.
///
/// `line` is the human sentence the TypeScript CLI prints today
/// (`reported by <seat>: "<did>" → "<next>" (spine <n>)`). It travels in the
/// payload because the ANSWER is half of "the same shapes callers already type",
/// and the routed path is not in this unit's hands: giving the shim a rendered
/// line means it can print one without re-deriving the wording from fields, and
/// without a second copy of the sentence living on the far side of the wire.
#[derive(Debug, serde::Serialize)]
struct ReportReceipt {
    seat: String,
    seq: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    did: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    next: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    state: Option<SemanticState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<String>,
    line: String,
}

/// `POST /v1/report` — the whole report family (ac-1142, ac-1144).
///
/// Every refusal below answers 400 with an envelope. None answers a bare 404:
/// wave 1's shim reads that shape as ROUTE ABSENCE and falls back to legacy, so
/// a refusal wearing it would not refuse anything — it would write the caller's
/// report into the other generation's store while reporting success.
async fn report(State(state): State<AppState>, Json(request): Json<ReportRequest>) -> Response {
    let command = "pij report";

    // Identity first: nothing else is meaningful without a subject, and a report
    // attributed by guess is worse than no report at all.
    let Some(claimed) = request
        .seat
        .or_else(|| request.caller.and_then(|caller| caller.pij_session_id))
        .filter(|id| !id.trim().is_empty())
    else {
        return refused(
            command,
            "no reporting seat was supplied. `report` is first-person and its subject is never \
             typed, so the caller must forward it: send `seat`, or a `caller` carrying \
             PIJ_SESSION_ID. Refusing rather than attributing this card by guess.",
        );
    };
    let seat = SeatId::from(claimed.trim());

    // The claim, checked. `ReportService::now` appends to the spine WITHOUT
    // consulting the registry — correct for a service whose caller has already
    // resolved the seat, and the reason this check cannot be skipped here: a card
    // for a seat rs does not hold would otherwise land in the rs spine under a
    // name rs has never heard of, invisible to the store the seat really lives
    // in, with every surface reporting success. That is the split-brain this
    // plan exists to prevent.
    match state.services.registry.get(&seat).await {
        Ok(Some(_)) => {}
        Ok(None) => {
            return refused(
                command,
                format!(
                    "reporting seat '{seat}' is not registered in this rs store, so rs has no \
                     card to write for it. If the seat lives in the legacy store, its report \
                     belongs there: PIJ_DAEMON_GENERATION=legacy pij report …"
                ),
            );
        }
        Err(error) => return internal(command, error),
    }

    let call = match report::parse_report(&request.argv) {
        Ok(call) => call,
        Err(refusal) => return refused(command, refusal),
    };

    let clock = match system_time_ms() {
        Ok(now) => now,
        Err(error) => return internal(command, error),
    };
    let reports = pij_core::report::ReportService::new(
        state.services.registry.as_ref(),
        state.services.spine.as_ref(),
        move || clock,
        pij_core::report::ReportConfig::default(),
    );

    match call {
        report::ReportCall::Now {
            did,
            next,
            state: declared,
            note,
        } => {
            // TypeScript writes the state THEN the status, under one lock
            // (`core/cli.ts:1631`). rs's two ports offer no cross-port
            // transaction, so the order is kept and a partial result is reported
            // as the partial result it is — `pij_core::report` makes the same
            // choice for the same reason, and inventing a rollback story here
            // would be a second, false account of the same failure.
            if let Some(declared) = declared
                && let Err(error) = reports
                    .declare(&seat, Some(declared), note.as_deref())
                    .await
            {
                return report_failure(command, error);
            }
            match reports.now(&seat, &did, &next).await {
                Ok(seq) => {
                    let line = format!(
                        "reported by {seat}: \"{did}\" → \"{next}\" (spine {})",
                        seq.0
                    );
                    envelope(
                        StatusCode::OK,
                        &Envelope::ok(
                            command,
                            ReportReceipt {
                                seat: seat.to_string(),
                                seq: seq.0,
                                did: Some(did),
                                next: Some(next),
                                state: declared,
                                note,
                                line,
                            },
                        ),
                    )
                }
                Err(error) => report_failure(command, error),
            }
        }
        report::ReportCall::State(declared) => {
            declaration_response(command, &reports, &seat, Some(declared), None).await
        }
        report::ReportCall::Blocked(note) => {
            declaration_response(
                command,
                &reports,
                &seat,
                Some(SemanticState::Blocked),
                Some(note),
            )
            .await
        }
        report::ReportCall::Question(note) => {
            declaration_response(
                command,
                &reports,
                &seat,
                Some(SemanticState::Question),
                Some(note),
            )
            .await
        }
        report::ReportCall::Clear => {
            declaration_response(command, &reports, &seat, None, None).await
        }
    }
}

/// One answer shape for every state declaration, `clear` included — `clear` is a
/// declaration of `None`, not a different operation, and giving it its own arm
/// would be a second place for the same sentence to be written.
async fn declaration_response<R, S, C>(
    command: &str,
    reports: &pij_core::report::ReportService<'_, R, S, C>,
    seat: &SeatId,
    declared: Option<SemanticState>,
    note: Option<String>,
) -> Response
where
    R: Registry + ?Sized,
    S: pij_core::ports::Spine + ?Sized,
    C: Fn() -> u64,
{
    match reports.declare(seat, declared, note.as_deref()).await {
        Ok(seq) => {
            let line = match declared {
                Some(state) => match &note {
                    Some(note) => format!("{seat} is {state:?}: {note} (spine {})", seq.0),
                    None => format!("{seat} is {state:?} (spine {})", seq.0),
                },
                None => format!("{seat} cleared its declared state (spine {})", seq.0),
            };
            envelope(
                StatusCode::OK,
                &Envelope::ok(
                    command,
                    ReportReceipt {
                        seat: seat.to_string(),
                        seq: seq.0,
                        did: None,
                        next: None,
                        state: declared,
                        note,
                        line,
                    },
                ),
            )
        }
        Err(error) => report_failure(command, error),
    }
}

/// Refusal or adapter fault — told apart, because only one of them is a bug.
///
/// `ReportTooLong` is the caller's mistake and answers 400 with the limit named;
/// a storage failure is ours and answers 500. Collapsing them would either blame
/// the caller for our fault or hide our fault as their mistake.
fn report_failure(command: &str, error: PijError) -> Response {
    match error {
        PijError::ReportTooLong { len, limit } => refused(
            command,
            format!(
                "report text is {len} characters, over the {limit}-character limit after \
                 whitespace collapsing"
            ),
        ),
        PijError::NoRegistryEntry { seat, store } => refused(
            command,
            format!("reporting seat '{seat}' is not registered in {store}"),
        ),
        other => internal(command, other),
    }
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

/// One sidecar job, named by which consumer will claim it.
///
/// The three consumers are queue-backed, so SOMETHING must enqueue their work.
/// Without this the only producer is hand-written SQL, which proves nothing
/// about the shipped surface — a live-fire transcript that bypasses the product
/// is a transcript of the test harness.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "snake_case", tag = "sidecar", content = "request")]
pub enum SidecarRequest {
    /// Outbound Telegram message; also binds the reply target for this seat.
    Telegram(pij_sidecars::telegram::TelegramSend),
    /// Background command start or cancel.
    Bg(pij_sidecars::background::BgRequest),
    /// Chore definition, run, or baseline acknowledgement.
    Chore(pij_sidecars::chore::ChoreRequest),
}

/// Enqueue one sidecar job and report the id the consumer will serialize on.
async fn sidecar(
    State(state): State<AppState>,
    Extension(_authenticated): Extension<auth::AuthenticatedMachine>,
    Json(request): Json<SidecarRequest>,
) -> Response {
    let request_id = format!(
        "{:016x}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |since| since.as_nanos() as u64)
    );
    let job = match &request {
        SidecarRequest::Telegram(send) => pij_sidecars::telegram::send_job(send),
        SidecarRequest::Bg(bg) => pij_sidecars::background::job(bg, &request_id),
        SidecarRequest::Chore(chore) => pij_sidecars::chore::job(chore, &request_id),
    };
    let job = match job {
        Ok(job) => job,
        Err(error) => return refused("pij sidecar", error),
    };
    let serial_key = job.serial_key.clone();
    match state.services.queue.enqueue(job).await {
        // The v1 ENVELOPE, not a bare object: every shipped client decodes
        // `{ok, command, data}` and `DaemonClient` refuses anything else with
        // "JSON is not a envelope (missing field ok)". A new route that invents
        // its own success shape is unreachable through the product even when the
        // daemon side is correct — found by a live-fire attempt, not by a test.
        Ok(job_id) => envelope(
            StatusCode::OK,
            &Envelope::ok(
                "pij sidecar",
                serde_json::json!({ "serial_key": serial_key, "job_id": job_id }),
            ),
        ),
        Err(error) => internal("pij sidecar", error),
    }
}
