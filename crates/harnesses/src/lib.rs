//! `pij-harnesses` — per-harness discovery, binding, readiness, busy-state,
//! and interaction-safety quirks. Drift belongs here, once per harness.

mod adapter;
mod interaction;
mod models;
mod spawn;

pub mod proc;

pub use adapter::{
    BindObservation, ClaudeHarness, CodexHarness, CopilotHarness, HarnessRegistry,
    ObservedBindFacts, OmpHarness, PiHarness,
};
pub use interaction::InteractionGate;
pub use models::ModelCatalog;
pub use spawn::{SpawnPlan, SpawnPlanInput, build_spawn_plan};
