//! `pij-unisphere` — pij's [`SessionStatusPort`] over the in-process Unisphere SDK.
//!
//! The only crate that names Unisphere. It turns the SDK's harness-neutral
//! session status into pij's [`pij_core::session_status::SeatStatus`], so a
//! Unisphere rename costs one edit here and none in core or the daemon.
//!
//! Until Unisphere plan 029 ships its session-status operation, no harness is
//! readable and every seat answers [`SessionStatusReply::Unsupported`].

use async_trait::async_trait;
use pij_core::error::Result;
use pij_core::ports::SessionStatusPort;
use pij_core::session_status::{SessionStatusReply, SessionTarget};

/// Session facts from harness transcripts, read through `unisphere-sdk`.
#[derive(Debug, Default)]
pub struct UnisphereSessionStatus;

impl UnisphereSessionStatus {
    /// A source with no per-seat read positions yet.
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl SessionStatusPort for UnisphereSessionStatus {
    async fn status(&self, _target: &SessionTarget) -> Result<SessionStatusReply> {
        Ok(SessionStatusReply::Unsupported)
    }
}
