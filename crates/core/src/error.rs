//! The error taxonomy.
//!
//! Two rules the TS CLI taught us, both encoded here rather than remembered:
//!
//! 1. **An instrument must separate the states it observes.** `E-NOREG` meant
//!    both "no registry row" and "the native session artifact is gone" — the same
//!    code for two situations with DIFFERENT recoveries, so `revive` could not
//!    tell a repairable seat from an unrecoverable one. They are separate
//!    variants here, permanently.
//! 2. **An error names its own fix.** A refusal that does not say what to do
//!    costs a round trip to interpret, and agents pay that round trip in tokens.

use crate::model::SeatId;

/// Everything this workspace refuses to do, and why.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum PijError {
    /// No registry row for this seat. Recoverable: adopt or register it.
    #[error("{seat}: no registry entry — adopt the seat (`pij adopt`) or spawn it again")]
    NoRegistryEntry {
        /// The seat that has no row.
        seat: SeatId,
    },

    /// The registry row exists, but the harness's own session artifact — the
    /// thing a revive replays — is gone. NOT recoverable by re-registering, and
    /// the reason this is a separate variant from [`PijError::NoRegistryEntry`].
    #[error(
        "{seat}: registry row present but the {harness} session artifact is missing at {path} \
         — this seat cannot be revived; close it and spawn a fresh one"
    )]
    NativeArtifactMissing {
        /// The seat whose artifact is gone.
        seat: SeatId,
        /// Which harness owned the artifact.
        harness: String,
        /// Where it was expected.
        path: String,
    },

    /// The store's schema is older or newer than this binary expects.
    ///
    /// Never limps: a half-understood schema corrupts quietly, and the skew
    /// direction decides the fix, so the message carries both versions.
    #[error("store schema is v{found} but this binary speaks v{expected} — {fix}")]
    StoreSchemaStale {
        /// What the store reports.
        found: u32,
        /// What this binary needs.
        expected: u32,
        /// The direction-specific fix.
        fix: String,
    },

    /// A seat exists but cannot currently receive.
    #[error("{seat}: not deliverable ({reason}) — the message was queued, not lost")]
    NotDeliverable {
        /// The seat.
        seat: SeatId,
        /// Why not.
        reason: String,
    },

    /// A report card exceeded the documented limit.
    ///
    /// The limit is a const with a name, and the error states it: TS defect #7
    /// was an undocumented 280-char truncation that silently ate the end of a
    /// card.
    #[error("report card is {len} characters; the limit is {limit} — shorten it")]
    ReportTooLong {
        /// Actual length after collapsing whitespace.
        len: usize,
        /// The limit, from `report::CARD_LIMIT`.
        limit: usize,
    },

    /// A seat tried to address itself.
    #[error("{seat}: a seat cannot send to itself — use `pij compact-self` for self-compaction")]
    SelfAddressed {
        /// The seat.
        seat: SeatId,
    },

    /// An adapter failed at its boundary. Carries the adapter's own words: a
    /// rewritten cause is a lost cause.
    #[error("{adapter}: {message}")]
    Adapter {
        /// Which adapter.
        adapter: String,
        /// What it said, verbatim.
        message: String,
    },
}

/// The workspace's result type.
///
/// The error parameter is defaulted rather than fixed, so the common call site
/// stays `Result<T>` while a module needing a narrower error can still name one.
pub type Result<T, E = PijError> = std::result::Result<T, E>;
