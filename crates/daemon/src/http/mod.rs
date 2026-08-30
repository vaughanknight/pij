//! Authenticated daemon HTTP protocol primitives.
//!
//! Each route does one cheap statement or one durable enqueue (R4). Auth wraps
//! the completed router, so adding an endpoint cannot accidentally bypass it.

mod auth;
mod client;
mod exposure;
mod types;

use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;
use std::io;
use std::path::Path;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

const INBOX_ACK_EVENT_KIND: &str = "delivery.inbox-ack";

use axum::Router;
use axum::body::{Body, Bytes};
use axum::extract::{Extension, Json, Query, State};
use axum::http::{HeaderMap, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use pij_core::error::{PijError, Result};
use pij_core::events::EventFilter;
use pij_core::model::{
    Envelope, ErrorKind, Harness, Msg, ProcIdentity, SeatDescriptor, SeatId, Seq,
};
use pij_core::names::memorable_pij_id_candidates;
use pij_core::ports::{LaunchCommand, Registry, SeatFilter};
use pij_core::wire;
use pij_harnesses::{SpawnPlanInput, build_spawn_plan};
use serde::Deserialize;
use tokio_stream::{Stream, StreamExt};

use crate::federation::{FederationSendError, FederationService};
use crate::{BUILD, Services};
pub use auth::AuthRing;
pub use client::{PeerEndpoint, get_from_peer, post_to_peer, stream_from_peer};
pub use exposure::{Exposure, boot_banner, exposure};
pub use types::{
    CursorResetDetail, FederatedRoster, InboxAckRequest, PeerStreamState, Registration,
    SendRequest, SpawnRequest, StreamFrame, UnavailablePeer,
};

#[derive(Clone)]
struct AppState {
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
    Send,
    Inbox,
    InboxAck,
    Seats,
    Events,
}

impl Endpoint {
    const ALL: [Self; 8] = [
        Self::Health,
        Self::Register,
        Self::Spawn,
        Self::Send,
        Self::Inbox,
        Self::InboxAck,
        Self::Seats,
        Self::Events,
    ];

    const fn path(self) -> &'static str {
        match self {
            Self::Health => "/health",
            Self::Register => "/v1/register",
            Self::Spawn => "/v1/spawn",
            Self::Send => "/v1/send",
            Self::Inbox => "/v1/inbox",
            Self::InboxAck => "/v1/inbox/ack",
            Self::Seats => "/v1/seats",
            Self::Events => "/v1/events",
        }
    }

    const fn method(self) -> Method {
        match self {
            Self::Register | Self::Spawn | Self::Send | Self::InboxAck => Method::POST,
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
                Endpoint::Register | Endpoint::Spawn | Endpoint::Send | Endpoint::InboxAck
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
            Endpoint::Send => router.route(endpoint.path(), post(send)),
            Endpoint::Inbox => router.route(endpoint.path(), get(inbox)),
            Endpoint::InboxAck => router.route(endpoint.path(), post(ack_inbox)),
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
            // A predecessor the roster has never heard of is a REFUSAL, not a
            // silent downgrade to a plain registration. Review found that a
            // typo'd id was accepted and the operator learned about it later
            // through an unrelated #19 collision refusal — an error message about
            // the wrong thing is worse than no error at all.
            None => {
                return refused(
                    "pij register",
                    format!(
                        "seat `{previous}` is not in the roster, so `{}` cannot supersede it",
                        claim.id
                    ),
                );
            }
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
    // A launcher observation is stronger than the process describing its own
    // argv later. Registration fills absent facts; it never downgrades a stamp.
    if descriptor.spawn_id.is_none() {
        descriptor.spawn_id = claim.spawn_id;
    }
    if descriptor.model.is_none() {
        descriptor.model = claim.model;
    }
    if descriptor.provider.is_none() {
        descriptor.provider = claim.provider;
    }
    if descriptor.effort.is_none() {
        descriptor.effort = claim.effort;
    }
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

async fn spawn_seat(State(state): State<AppState>, Json(request): Json<SpawnRequest>) -> Response {
    if let Some(id) = request.id.as_ref()
        && id.as_str().trim().is_empty()
    {
        return refused("pij spawn", "--id must be non-empty when supplied");
    }
    if !Path::new(&request.cwd).is_absolute() {
        return refused(
            "pij spawn",
            "--cwd must be absolute so the descriptor cannot depend on daemon cwd",
        );
    }

    let session = match request.session.as_deref() {
        Some(session) if !session.trim().is_empty() => session.to_string(),
        Some(_) => return refused("pij spawn", "--session must be non-empty"),
        None => {
            let Some(caller_pane) = request.caller_pane.as_deref() else {
                return refused(
                    "pij spawn",
                    "no caller pane was supplied — pass --session <tmux> explicitly",
                );
            };
            let panes = match state.services.tmux.list_panes().await {
                Ok(panes) => panes,
                Err(error) => return internal("pij spawn", error),
            };
            let Some(pane) = panes.iter().find(|pane| pane.id == caller_pane) else {
                return refused(
                    "pij spawn",
                    format!(
                        "caller pane `{caller_pane}` did not resolve to a tmux session — pass --session <tmux> explicitly"
                    ),
                );
            };
            pane.session.clone()
        }
    };

    // Keep the collision check, observed launch, and descriptor write in one
    // daemon-local critical section. Registry::put is an upsert; without this
    // lock two concurrent requests for one id could both launch before either
    // row existed, then silently overwrite one another.
    // Minted BEFORE the lock: it is this launch's identity and it also seeds the
    // memorable allocation below, so the name a spawn gets is a function of the
    // spawn rather than of the clock or the roster's shape.
    let spawn_id = match mint_spawn_id() {
        Ok(spawn_id) => spawn_id,
        Err(error) => return internal("pij spawn", error),
    };

    let _spawn_guard = state.spawn_lock.lock().await;
    let seat_id = match request.id.clone() {
        // An explicit id is taken as given, and a collision REFUSES: spawn never
        // overwrites a roster row.
        Some(id) => match state.services.registry.get(&id).await {
            Ok(Some(_)) => {
                return refused(
                    "pij spawn",
                    format!(
                        "seat `{id}` already exists — choose another --id; spawn never overwrites a roster row"
                    ),
                );
            }
            Ok(None) => id,
            Err(error) => return internal("pij spawn", error),
        },
        // No id: ALLOCATE a memorable one. The generator yields candidates in a
        // deterministic collision-free order, so occupancy is the only reason to
        // advance — the reservation loop is the queue-side half u-names
        // deliberately did not own, held under the same lock as the launch so two
        // concurrent spawns cannot pick one name.
        None => match allocate_memorable_id(&*state.services.registry, &spawn_id).await {
            Ok(Some(id)) => id,
            Ok(None) => {
                return refused(
                    "pij spawn",
                    "every memorable name is taken — pass an explicit --id",
                );
            }
            Err(error) => return internal("pij spawn", error),
        },
    };

    let plan = match build_spawn_plan(SpawnPlanInput {
        seat_id: seat_id.clone(),
        harness: request.harness,
        executable: request.executable,
        model: request.model,
        resolved_provider: None,
        effort: request.effort,
        accept_inbound: request.accept_inbound,
    }) {
        Ok(plan) => plan,
        Err(error) => return refused("pij spawn", error),
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
        Err(error) => return internal("pij spawn", error),
    };

    let mut descriptor = SeatDescriptor::new(seat_id, plan.harness, request.cwd);
    descriptor.pane = Some(pane.id.clone());
    descriptor.parent = request.parent;
    descriptor.cross_session_inbound_accept = Some(plan.cross_session_inbound_accept);
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
            "pij spawn",
            PijError::Adapter {
                adapter: "spawn".to_string(),
                message,
            },
        );
    }

    envelope(StatusCode::OK, &Envelope::ok("pij spawn", descriptor))
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
