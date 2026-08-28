//! Liveness verdicts — pure logic over one observed fact.
//!
//! The rule this module exists to enforce: **a pid is not an identity.** The OS
//! recycles pids, so "is pid 4242 alive?" is the wrong question; the right one is
//! "is the process at pid 4242 the SAME process we bound to?". TS answered the
//! wrong one and produced both failure directions — refusing to revive live
//! seats, and reporting dead ones as healthy.

use crate::error::Result;
use crate::model::{Liveness, ProcIdentity};
use crate::ports::LivenessPort;

/// Judge a recorded process identity against what the machine reports now.
///
/// Three outcomes, never two: a missing process is [`Liveness::Dead`], a
/// matching start time is [`Liveness::Active`], and a DIFFERENT start time at the
/// same pid is [`Liveness::Recycled`] — a distinct verdict, because treating it
/// as `Active` addresses a stranger's process and treating it as `Dead` hides
/// that the pid was reused.
pub async fn alive(proc: ProcIdentity, port: &dyn LivenessPort) -> Result<Liveness> {
    match port.proc_start(proc.pid).await? {
        None => Ok(Liveness::Dead {
            evidence: format!("no process at pid {}", proc.pid),
        }),
        Some(observed) if observed == proc.proc_start => Ok(Liveness::Active),
        Some(observed) => Ok(Liveness::Recycled {
            observed_start: observed,
            recorded_start: proc.proc_start,
        }),
    }
}
