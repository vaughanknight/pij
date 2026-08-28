//! Composition root #2: the CLI.
//!
//! Each verb is a thin function from parsed args to an [`Envelope`] plus a
//! rendering. Two faces — human and `--json` — from ONE value, so they cannot
//! disagree about what happened.
//!
//! The daemon ships inside this same binary, which is why a stale CLI can never
//! meet a newer daemon on one machine: they are the same artifact.

#![deny(missing_docs)]

use std::path::PathBuf;

use pij_core::config::Config;
use pij_core::error::{PijError, Result};
use pij_core::model::Envelope;

/// Where a daemon keeps its per-boot key and, later, its store.
pub fn default_state_dir() -> PathBuf {
    std::env::var_os("PIJ_RS_STATE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(
                // No HOME is a real environment (some launchd and CI contexts).
                // A temp dir keeps the binary usable and, crucially, says so
                // rather than silently writing the key somewhere surprising.
                || std::env::temp_dir().join("pij-rs-no-home"),
            );
            home.join(".pij-rs")
        })
}

/// Ask a running daemon whether it is healthy.
///
/// Reads the per-boot key from `state_dir`, calls `/health`, and returns the
/// daemon's own envelope — the CLI does not invent a verdict, it relays one.
///
/// # Errors
/// [`PijError::Adapter`] when the key is unreadable, the daemon is unreachable,
/// or the reply is not an envelope this build understands.
pub async fn ping(state_dir: &std::path::Path, addr: &str) -> Result<Envelope<serde_json::Value>> {
    let token = pij_daemon::auth::read_key(&state_dir.join("daemon.key"))?;

    let response = reqwest::Client::new()
        .get(format!("http://{addr}/health"))
        .header(reqwest::header::AUTHORIZATION, format!("Bearer {token}"))
        .send()
        .await
        .map_err(|error| PijError::Adapter {
            adapter: "cli".to_string(),
            message: format!("could not reach the daemon at {addr}: {error}"),
        })?;

    let status = response.status();
    let body = response.text().await.map_err(|error| PijError::Adapter {
        adapter: "cli".to_string(),
        message: format!("could not read the daemon's reply: {error}"),
    })?;

    if status == reqwest::StatusCode::UNAUTHORIZED {
        // Relay the daemon's own words: it already knows the fix, and rewriting
        // the cause here is how a diagnosis gets lost in translation.
        return Err(PijError::Adapter {
            adapter: "cli".to_string(),
            message: format!("the daemon refused this key ({body})"),
        });
    }

    pij_core::wire::decode_envelope(&body).map_err(|error| PijError::Adapter {
        adapter: "cli".to_string(),
        message: error.to_string(),
    })
}

/// Render an envelope for a human, or as the JSON it already is.
pub fn render<T: serde::Serialize>(envelope: &Envelope<T>, as_json: bool) -> String {
    if as_json {
        return serde_json::to_string_pretty(envelope).unwrap_or_else(|error| error.to_string());
    }
    if envelope.ok {
        format!(
            "{}: ok{}",
            envelope.command,
            envelope
                .data
                .as_ref()
                .and_then(|data| serde_json::to_value(data).ok())
                .and_then(|value| value
                    .get("status")
                    .and_then(|s| s.as_str())
                    .map(String::from))
                .map(|status| format!(" — {status}"))
                .unwrap_or_default()
        )
    } else {
        format!(
            "{}: FAILED — {}",
            envelope.command,
            envelope.meta.as_deref().unwrap_or("no reason given")
        )
    }
}

/// The config a hello-depth daemon boots with: every port fake, loopback only.
pub fn hello_config(bind_addr: &str) -> Config {
    Config {
        bind_addr: bind_addr.to_string(),
        ..Config::default()
    }
}
