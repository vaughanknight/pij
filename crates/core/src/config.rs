//! Configuration — which implementation each port gets.
//!
//! **The fake is the default.** A fresh checkout runs, tests, and demonstrates
//! itself with no daemon, no tmux, no network and no database file: offline-first
//! is a property of the default config, not a mode you remember to select. Real
//! adapters are opt-in per port, so a test can make exactly one thing real.

use serde::{Deserialize, Serialize};

/// Which implementation to wire behind a port.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AdapterChoice {
    /// The deterministic fake from `pij-testkit`.
    #[default]
    Fake,
    /// The real adapter, which performs IO.
    Real,
}

impl AdapterChoice {
    /// Is this the real thing?
    pub const fn is_real(self) -> bool {
        matches!(self, AdapterChoice::Real)
    }
}

/// One choice per port. Adding a port adds a field here, which is a second place
/// the "an eighth port is stop-and-ask" rule shows up as work.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Adapters {
    /// Seat roster.
    pub registry: AdapterChoice,
    /// Append-only history.
    pub spine: AdapterChoice,
    /// Job queue.
    pub queue: AdapterChoice,
    /// Message transport.
    pub transport: AdapterChoice,
    /// tmux IO.
    pub tmux: AdapterChoice,
    /// Harness quirks.
    pub harness: AdapterChoice,
    /// Process liveness.
    pub liveness: AdapterChoice,
}

/// Everything the composition roots need to build the world.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    /// Which implementation each port gets.
    pub adapters: Adapters,
    /// Where the daemon listens. Loopback only: the bearer key is a second lock,
    /// not the first one.
    pub bind_addr: String,
    /// Absolute path to the store file. Empty means in-memory, which is what the
    /// all-fake default uses.
    pub store_path: String,
    /// How long a seat may be silent before the watchdog considers a nudge.
    ///
    /// Configured, never a hardcoded constant: TS's fixed threshold declared
    /// healthy long tool calls to be stalls, and "a default is a number nobody
    /// chose" is exactly how that shipped.
    pub watchdog_interval_secs: u64,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            adapters: Adapters::default(),
            bind_addr: "127.0.0.1:0".to_string(),
            store_path: String::new(),
            watchdog_interval_secs: 20 * 60,
        }
    }
}

impl Config {
    /// Does this config touch anything outside the process?
    ///
    /// Used by tests and by the daemon's boot banner: a config that claims to be
    /// offline and is not should say so before it fails at a socket.
    pub fn is_fully_offline(&self) -> bool {
        let a = &self.adapters;
        ![
            a.registry,
            a.spine,
            a.queue,
            a.transport,
            a.tmux,
            a.harness,
            a.liveness,
        ]
        .iter()
        .any(|choice| choice.is_real())
    }
}
