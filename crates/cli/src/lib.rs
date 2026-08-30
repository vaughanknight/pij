//! Composition root #2: the CLI.
//!
//! Each verb is a thin function from parsed args to an [`Envelope`] plus a
//! rendering. Two faces — human and `--json` — from ONE value, so they cannot
//! disagree about what happened.
//!
//! The daemon ships inside this same binary, which is why a stale CLI can never
//! meet a newer daemon on one machine: they are the same artifact.

#![deny(missing_docs)]
pub mod address;
pub mod client;

pub use address::{AddressError, parse_destination, render_destination};
pub use client::{
    DaemonClient, EventFrame, Registration, SendRequest, TailError, TailStream, setup_refusal,
};

use std::path::PathBuf;

use pij_core::config::Config;
use pij_core::model::{Envelope, ErrorKind};

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

/// Render an envelope for a human, or as the JSON it already is.
pub fn render<T: serde::Serialize>(envelope: &Envelope<T>, as_json: bool) -> String {
    if as_json {
        return serde_json::to_string(envelope).unwrap_or_else(|error| error.to_string());
    }
    if !envelope.ok {
        return format!(
            "{}: FAILED — {}",
            envelope.command,
            envelope.meta.as_deref().unwrap_or("no reason given")
        );
    }

    match envelope.data.as_ref() {
        Some(data) => format!(
            "{}: ok — {}",
            envelope.command,
            serde_json::to_string(data).unwrap_or_else(|error| error.to_string())
        ),
        None => format!("{}: ok", envelope.command),
    }
}

/// Render one tail frame from the same value for either output face.
pub fn render_frame(frame: &EventFrame, as_json: bool) -> String {
    if as_json {
        return serde_json::to_string(frame).unwrap_or_else(|error| error.to_string());
    }
    format!(
        "{}:{} {}{} {}",
        frame.machine,
        frame.cursor,
        frame.event.kind,
        frame
            .event
            .seat
            .as_ref()
            .map(|seat| format!(" seat={seat}"))
            .unwrap_or_default(),
        frame.event.payload
    )
}

/// Stable process exit code for a daemon envelope.
pub fn exit_code<T>(envelope: &Envelope<T>) -> u8 {
    if envelope.ok {
        return 0;
    }
    match envelope.error {
        Some(ErrorKind::Refused) => 2,
        Some(ErrorKind::NotFound) => 3,
        Some(ErrorKind::Auth) => 4,
        Some(ErrorKind::Skew | ErrorKind::Adapter) | None => 1,
    }
}

/// The config a hello-depth daemon boots with: every port fake, loopback only.
pub fn hello_config(bind_addr: &str) -> Config {
    Config {
        bind_addr: bind_addr.to_string(),
        ..Config::default()
    }
}

#[cfg(test)]
mod tests {
    use pij_core::model::{Envelope, ErrorKind};

    use super::exit_code;

    #[test]
    fn exit_code_contract_is_an_explicit_table() {
        let cases = [
            (Envelope::ok("pij ping", ()), 0),
            (Envelope::refused("pij send", ErrorKind::Refused, "no"), 2),
            (
                Envelope::refused("pij list", ErrorKind::NotFound, "gone"),
                3,
            ),
            (
                Envelope::refused("pij ping", ErrorKind::Auth, "wrong key"),
                4,
            ),
            (Envelope::refused("pij ping", ErrorKind::Skew, "newer"), 1),
            (
                Envelope::refused("pij ping", ErrorKind::Adapter, "offline"),
                1,
            ),
        ];

        for (envelope, expected) in cases {
            assert_eq!(exit_code(&envelope), expected, "{envelope:?}");
        }
    }
}
