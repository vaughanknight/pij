use serde::Serialize;
use serde::de::DeserializeOwned;

use pij_core::error::{PijError, Result};
use pij_core::model::Envelope;
use pij_core::wire;

/// A manually bootstrapped peer daemon.
#[derive(Clone, PartialEq, Eq)]
pub struct PeerEndpoint {
    /// Peer daemon base URL, such as `http://workstation.local:7463`.
    pub base_url: String,
    /// Persistent per-machine-pair bearer key configured on both machines.
    pub bearer_key: String,
}

/// POST one JSON request to a peer and decode its versioned envelope.
///
/// This primitive deliberately performs exactly one request. Retry, discovery,
/// peer selection, and long-lived federation workers belong to `u-federation`.
///
/// # Errors
/// Network failures, unreadable responses, and malformed or future envelopes.
pub async fn post_to_peer<Request, Response>(
    client: &reqwest::Client,
    peer: &PeerEndpoint,
    path: &str,
    request: &Request,
) -> Result<Envelope<Response>>
where
    Request: Serialize + ?Sized,
    Response: DeserializeOwned,
{
    let url = format!(
        "{}/{}",
        peer.base_url.trim_end_matches('/'),
        path.trim_start_matches('/')
    );
    let response = client
        .post(&url)
        .bearer_auth(&peer.bearer_key)
        .json(request)
        .send()
        .await
        .map_err(|error| peer_error(&url, error))?;
    let body = response
        .text()
        .await
        .map_err(|error| peer_error(&url, error))?;
    wire::decode_envelope(&body).map_err(|error| PijError::Adapter {
        adapter: "daemon/http-peer".to_string(),
        message: format!("peer {url} returned an unreadable envelope: {error}"),
    })
}

fn peer_error(url: &str, error: reqwest::Error) -> PijError {
    PijError::Adapter {
        adapter: "daemon/http-peer".to_string(),
        message: format!("peer request to {url} failed: {error}"),
    }
}
