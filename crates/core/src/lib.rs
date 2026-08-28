//! `pij-core` — Pure domain: types, config, error taxonomy, ports, and the logic that
//! operates on them. NO IO, NO tokio, NO sqlx, NO HTTP — enforced mechanically by
//! the arch allowlist (tk-3a93), not by intent. Everything the daemon and CLI
//! decide is decided here, so it can be tested with zero doubles.
//!
//! Empty at tk-5f1d: this task proves the graph compiles, not that it does
//! anything. Content arrives with the task that owns it.
