//! `pij-core` — the functional core.
//!
//! Domain types, configuration, the error taxonomy, the seven frozen ports, and
//! the pure logic over them. **No IO, no tokio, no SQL, no HTTP** — enforced
//! mechanically by `crates/testkit/arch-allowlist.toml`, not asserted here.
//!
//! Everything the daemon and CLI DECIDE is decided in this crate, which is what
//! lets those decisions be tested with zero doubles: give the function the facts,
//! check the verdict.

#![deny(missing_docs)]

pub mod admission;
pub mod anomalies;
pub mod background;
pub mod config;
pub mod control;
pub mod decisions;
pub mod delivery;
pub mod error;
pub mod events;
pub mod framing;
pub mod liveness;
pub mod model;
pub mod names;
pub mod orchestration;
pub mod ports;
pub mod report;
pub mod watchdog;
pub mod wire;
