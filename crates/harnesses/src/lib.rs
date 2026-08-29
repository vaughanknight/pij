//! `pij-harnesses` — per-harness discovery, binding, readiness, busy-state,
//! and interaction-safety quirks. Drift belongs here, once per harness.

mod adapter;
mod interaction;

pub mod proc;

pub use adapter::{
    BindObservation, ClaudeHarness, CodexHarness, CopilotHarness, HarnessRegistry,
    ObservedBindFacts, OmpHarness, PiHarness,
};
pub use interaction::InteractionGate;
