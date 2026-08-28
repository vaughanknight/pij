//! Routes. Each does ONE cheap thing (R4): answer from memory, or enqueue.
//!
//! Auth is middleware over the WHOLE router, not a check each handler remembers
//! to make — a route added later is authenticated because it exists, not because
//! its author was careful.

use axum::Router;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;

use pij_core::model::{Envelope, Event};
use pij_core::wire;

use crate::{BUILD, Services};

#[derive(Clone)]
struct AppState {
    services: Services,
    token: String,
}

/// Build the router for these services, authenticated with `token`.
pub fn router(services: Services, token: String) -> Router {
    let state = AppState { services, token };
    Router::new()
        .route("/health", get(health))
        .route("/v1/events", get(events))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            require_bearer,
        ))
        .with_state(state)
}

/// Reject anything without the boot key — and say what to do about it.
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

    if presented == format!("Bearer {}", state.token) {
        return next.run(request).await;
    }

    // A refusal that does not name its own fix costs a round trip to interpret.
    let body = Envelope::<()>::err(
        "auth",
        "missing or wrong bearer token — read the per-boot key from \
         <state-dir>/daemon.key and send it as `Authorization: Bearer <key>`",
    );
    (
        StatusCode::UNAUTHORIZED,
        serde_json::to_string(&body).unwrap_or_default(),
    )
        .into_response()
}

/// Liveness plus the two facts a caller actually needs: which build answered,
/// and whether it is running on fakes.
async fn health(State(state): State<AppState>) -> Response {
    #[derive(serde::Serialize)]
    struct Health {
        status: &'static str,
        build: &'static str,
        offline: bool,
    }

    let body = Envelope::ok(
        "pij ping",
        Health {
            status: "healthy",
            build: BUILD,
            offline: state.services.offline,
        },
    );
    json(&body)
}

/// The NDJSON event stream: a Hello line first, then events.
///
/// At hello depth this is a snapshot rather than a live tail — the shape is what
/// wave 3 needs frozen (Hello first, one JSON object per line, unknown kinds
/// forwarded), not the streaming implementation.
async fn events(State(state): State<AppState>) -> Response {
    let tail = match state
        .services
        .spine
        .tail(None, pij_core::model::Seq(0))
        .await
    {
        Ok(events) => events,
        Err(error) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                serde_json::to_string(&Envelope::<()>::err("pij events", error.to_string()))
                    .unwrap_or_default(),
            )
                .into_response();
        }
    };

    let mut body = match wire::encode_hello(BUILD) {
        Ok(line) => line,
        Err(error) => return wire_failed(error),
    };
    for event in &tail {
        match wire::encode_event(event) {
            Ok(line) => body.push_str(&line),
            Err(error) => return wire_failed(error),
        }
    }

    // A forward-compatibility marker the reader MUST survive: an event kind this
    // build does not know, emitted deliberately at hello depth so wave 3's
    // consumer is written against a stream that already contains one.
    let unknown = Event {
        v: wire::EVENT_VERSION,
        at: 0,
        kind: "daemon.forward-compat-probe".to_string(),
        seat: None,
        payload: "{}".to_string(),
    };
    match wire::encode_event(&unknown) {
        Ok(line) => body.push_str(&line),
        Err(error) => return wire_failed(error),
    }

    (
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "application/x-ndjson")],
        body,
    )
        .into_response()
}

fn wire_failed(error: wire::WireError) -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        serde_json::to_string(&Envelope::<()>::err("pij events", error.to_string()))
            .unwrap_or_default(),
    )
        .into_response()
}

fn json<T: serde::Serialize>(body: &Envelope<T>) -> Response {
    match serde_json::to_string(body) {
        Ok(text) => (
            StatusCode::OK,
            [(axum::http::header::CONTENT_TYPE, "application/json")],
            text,
        )
            .into_response(),
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}
