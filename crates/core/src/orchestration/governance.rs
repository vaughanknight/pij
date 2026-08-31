use crate::model::SeatId;

/// A named project governed by one prime.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Project {
    /// Lowercase project slug.
    pub slug: String,
    /// Seat that created the project.
    pub created_by: SeatId,
    /// Caller-supplied creation time.
    pub created_at: u64,
}

/// A baton whose lease serialises access to one shared resource.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BatonDefinition {
    /// Stable baton name.
    pub name: String,
    /// Human-readable protected resource or invariant.
    pub description: String,
    /// Seat that created it.
    pub created_by: SeatId,
    /// Caller-supplied creation time.
    pub created_at: u64,
}

/// A durable orchestration role assignment.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RoleAssignment {
    /// Assigned seat.
    pub seat: SeatId,
    /// Role name.
    pub role: String,
    /// Seat that made the assignment.
    pub assigned_by: SeatId,
    /// Caller-supplied assignment time.
    pub assigned_at: u64,
}

/// The fleet's single current prime designation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PrimeDesignation {
    /// Designated prime.
    pub seat: SeatId,
    /// Seat that made the designation.
    pub designated_by: SeatId,
    /// Caller-supplied designation time.
    pub designated_at: u64,
}

/// Dispatch lifecycle.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DispatchState {
    /// Obligation has been issued but not acknowledged.
    Pending,
    /// Assignee acknowledged it.
    Acknowledged,
}

/// A durable work dispatch.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Dispatch {
    /// Stable dispatch id.
    pub id: String,
    /// Issuer.
    pub from: SeatId,
    /// Assignee.
    pub to: SeatId,
    /// Packet path or concise instruction.
    pub body: String,
    /// Current lifecycle.
    pub state: DispatchState,
    /// Caller-supplied creation time.
    pub created_at: u64,
    /// Assignee acknowledgement time.
    pub acknowledged_at: Option<u64>,
}
