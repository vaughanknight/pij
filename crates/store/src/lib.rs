//! `pij-store` — persistence behind the Registry, Spine and Queue ports.
//!
//! SQLite through sqlx (workshop 001 R1), with the migrations compiled into the
//! binary and run at boot. The only crate in the workspace that speaks SQL: if
//! another crate needs data, it needs a port, not a connection.

#![deny(missing_docs)]

pub mod migrate;
pub mod orchestration;
pub mod queue;
pub mod registry;
pub mod spine;

pub use migrate::{SCHEMA_VERSION, open, require_current_schema, schema_version};
pub use orchestration::{
    BatonLease, DispatchAck, LeaseClaim, SpawnRecordOutcome, SqliteOrchestration, StreamReservation,
};
pub use queue::SqliteQueue;
pub use registry::SqliteRegistry;
pub use spine::SqliteSpine;
