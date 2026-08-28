//! `pij-daemon` — Composition root #1: wires Arc<dyn Port> from config, serves HTTP, runs the tick
//! loop and the job workers. Wiring, never business logic.
//!
//! Empty at tk-5f1d: this task proves the graph compiles, not that it does
//! anything. Content arrives with the task that owns it.
