//! `pij-harnesses` — per-harness discovery, binding, readiness, busy-state,
//! and interaction-safety quirks. Drift belongs here, once per harness.

mod adapter;
mod claude_settings;
mod composer;
mod interaction;
mod models;
mod spawn;

pub mod proc;

pub use adapter::{
    BindObservation, ClaudeHarness, CodexHarness, CopilotHarness, HarnessRegistry,
    ObservedBindFacts, OmpHarness, PiHarness,
};
pub use claude_settings::{
    ClaudeInboundState, EnsurePlan, EnsureReport, claude_homes, claude_homes_from,
    ensure_claude_inbound_accept, inspect_claude_inbound, plan_inbound_accept,
};
pub use composer::{ComposerRegion, composer_region};
pub use interaction::InteractionGate;
pub use models::ModelCatalog;
pub use spawn::{SpawnPlan, SpawnPlanInput, build_spawn_plan};
