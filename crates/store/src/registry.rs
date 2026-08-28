//! The seat registry, on SQLite.
//!
//! The whole point of this crate existing separately: the Registry CONTRACT is
//! `pij_testkit::contract::registry_contract`, and this implementation runs it
//! unchanged. Nothing below is allowed to have its own idea of what `get` means.

use async_trait::async_trait;
use sqlx::{Pool, Row, Sqlite};

use pij_core::error::{PijError, Result};
use pij_core::model::{
    Harness, ProcIdentity, SeatDescriptor, SeatId, SemanticState, Seq, SystemState,
};
use pij_core::ports::{Registry, SeatFilter};

use crate::migrate::{begin_write, require_current_schema};

/// A [`Registry`] backed by the SQLite store.
pub struct SqliteRegistry {
    pool: Pool<Sqlite>,
}

impl SqliteRegistry {
    /// Wrap an open pool.
    pub fn new(pool: Pool<Sqlite>) -> Self {
        SqliteRegistry { pool }
    }
}

fn adapter_error(error: sqlx::Error) -> PijError {
    PijError::Adapter {
        adapter: "store/registry".to_string(),
        message: error.to_string(),
    }
}

fn row_to_descriptor(row: &sqlx::sqlite::SqliteRow) -> Result<SeatDescriptor> {
    let harness_text: String = row.try_get("harness").map_err(adapter_error)?;
    // An unrecognised harness is refused, never coerced to a default: guessing
    // here is how a seat gets bound to the wrong readiness anchor.
    let harness = Harness::parse(&harness_text).ok_or_else(|| PijError::Adapter {
        adapter: "store/registry".to_string(),
        message: format!("unknown harness `{harness_text}` in the seats table"),
    })?;

    let state_text: String = row.try_get("state").map_err(adapter_error)?;
    let state = match state_text.as_str() {
        "idle" => SystemState::Idle,
        "working" => SystemState::Working,
        other => {
            return Err(PijError::Adapter {
                adapter: "store/registry".to_string(),
                message: format!("unknown system state `{other}` in the seats table"),
            });
        }
    };

    let semantic_text: Option<String> = row.try_get("semantic_state").map_err(adapter_error)?;
    let semantic_state = match semantic_text.as_deref() {
        None => None,
        Some("ready") => Some(SemanticState::Ready),
        Some("waiting") => Some(SemanticState::Waiting),
        Some("hold") => Some(SemanticState::Hold),
        Some("blocked") => Some(SemanticState::Blocked),
        Some("question") => Some(SemanticState::Question),
        Some("done") => Some(SemanticState::Done),
        Some(other) => {
            return Err(PijError::Adapter {
                adapter: "store/registry".to_string(),
                message: format!("unknown semantic state `{other}` in the seats table"),
            });
        }
    };

    // The pair, or nothing. A row with a pid and no start time is not half an
    // identity — it is an unusable one, and treating it as usable is the
    // recycled-pid bug wearing a different hat.
    let pid: Option<i64> = row.try_get("pid").map_err(adapter_error)?;
    let proc_start: Option<i64> = row.try_get("proc_start").map_err(adapter_error)?;
    let proc = match (pid, proc_start) {
        (Some(pid), Some(proc_start)) => Some(ProcIdentity {
            pid: pid as u32,
            proc_start: proc_start as u64,
        }),
        (None, None) => None,
        _ => {
            return Err(PijError::Adapter {
                adapter: "store/registry".to_string(),
                message: "seat row has half a process identity (pid without proc_start, or \
                          the reverse) — liveness cannot be judged from it"
                    .to_string(),
            });
        }
    };

    let relay: i64 = row.try_get("relay").map_err(adapter_error)?;
    let parent: Option<String> = row.try_get("parent").map_err(adapter_error)?;

    Ok(SeatDescriptor {
        id: SeatId(row.try_get::<String, _>("id").map_err(adapter_error)?),
        harness,
        pane: row.try_get("pane").map_err(adapter_error)?,
        proc,
        folder: row.try_get("folder").map_err(adapter_error)?,
        state,
        semantic_state,
        role: row.try_get("role").map_err(adapter_error)?,
        parent: parent.map(SeatId),
        relay: relay != 0,
        tombstoned_at: row
            .try_get::<Option<i64>, _>("tombstoned_at")
            .map_err(adapter_error)?
            .map(|at| at as u64),
        tombstone_reason: row.try_get("tombstone_reason").map_err(adapter_error)?,
    })
}

fn semantic_str(state: SemanticState) -> &'static str {
    match state {
        SemanticState::Ready => "ready",
        SemanticState::Waiting => "waiting",
        SemanticState::Hold => "hold",
        SemanticState::Blocked => "blocked",
        SemanticState::Question => "question",
        SemanticState::Done => "done",
    }
}

fn state_str(state: SystemState) -> &'static str {
    match state {
        SystemState::Idle => "idle",
        SystemState::Working => "working",
    }
}

#[async_trait]
impl Registry for SqliteRegistry {
    async fn get(&self, seat: &SeatId) -> Result<Option<SeatDescriptor>> {
        require_current_schema(&self.pool).await?;
        let row = sqlx::query("SELECT * FROM seats WHERE id = ?1")
            .bind(seat.as_str())
            .fetch_optional(&self.pool)
            .await
            .map_err(adapter_error)?;
        row.as_ref().map(row_to_descriptor).transpose()
    }

    async fn put(&self, descriptor: SeatDescriptor) -> Result<Seq> {
        require_current_schema(&self.pool).await?;

        // ONE transaction. Persist-before-mutate orders the two writes; the
        // transaction is what makes them one fact. Review found the split
        // version: a failed second statement left the spine claiming something
        // the registry never did.
        let mut tx = begin_write(&self.pool).await?;

        let seq: i64 = sqlx::query_scalar(
            "INSERT INTO spine_events (v, at, kind, seat, payload) VALUES (1, 0, 'seat.put', ?1, '') \
             RETURNING seq",
        )
        .bind(descriptor.id.as_str())
        .fetch_one(&mut *tx)
        .await
        .map_err(adapter_error)?;

        sqlx::query(
            "INSERT INTO seats (id, harness, pane, pid, proc_start, folder, state, \
             semantic_state, role, parent, relay, tombstoned_at, tombstone_reason, seq) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14) \
             ON CONFLICT(id) DO UPDATE SET \
             harness=excluded.harness, pane=excluded.pane, pid=excluded.pid, \
             proc_start=excluded.proc_start, folder=excluded.folder, state=excluded.state, \
             semantic_state=excluded.semantic_state, role=excluded.role, \
             parent=excluded.parent, relay=excluded.relay, \
             tombstoned_at=excluded.tombstoned_at, \
             tombstone_reason=excluded.tombstone_reason, seq=excluded.seq",
        )
        .bind(descriptor.id.as_str())
        .bind(descriptor.harness.as_str())
        .bind(descriptor.pane.as_deref())
        .bind(descriptor.proc.map(|p| i64::from(p.pid)))
        .bind(descriptor.proc.map(|p| p.proc_start as i64))
        .bind(&descriptor.folder)
        .bind(state_str(descriptor.state))
        .bind(descriptor.semantic_state.map(semantic_str))
        .bind(descriptor.role.as_deref())
        .bind(descriptor.parent.as_ref().map(SeatId::as_str))
        .bind(i64::from(descriptor.relay))
        .bind(descriptor.tombstoned_at.map(|value| value as i64))
        .bind(descriptor.tombstone_reason.as_deref())
        .bind(seq)
        .execute(&mut *tx)
        .await
        .map_err(adapter_error)?;

        tx.commit().await.map_err(adapter_error)?;
        Ok(Seq(seq as u64))
    }

    async fn list(&self, filter: SeatFilter) -> Result<Vec<SeatDescriptor>> {
        require_current_schema(&self.pool).await?;
        // Absent filter fields mean "do not filter" — expressed as an IS NULL
        // guard per field rather than by building SQL strings, so an empty
        // string can never be mistaken for "no filter".
        let rows = sqlx::query(
            "SELECT * FROM seats \
             WHERE (?1 IS NULL OR harness = ?1) \
               AND (?2 IS NULL OR folder = ?2) \
               AND (?3 IS NULL OR parent = ?3) \
             ORDER BY id",
        )
        .bind(filter.harness.map(Harness::as_str))
        .bind(filter.folder.as_deref())
        .bind(filter.parent.as_ref().map(SeatId::as_str))
        .fetch_all(&self.pool)
        .await
        .map_err(adapter_error)?;

        rows.iter().map(row_to_descriptor).collect()
    }

    async fn tombstone(&self, seat: &SeatId, reason: &str) -> Result<Seq> {
        require_current_schema(&self.pool).await?;
        let mut tx = begin_write(&self.pool).await?;

        let seq: i64 = sqlx::query_scalar(
            "INSERT INTO spine_events (v, at, kind, seat, payload) \
             VALUES (1, 0, 'seat.tombstone', ?1, ?2) RETURNING seq",
        )
        .bind(seat.as_str())
        .bind(reason)
        .fetch_one(&mut *tx)
        .await
        .map_err(adapter_error)?;

        let affected = sqlx::query(
            "UPDATE seats SET tombstoned_at = ?2, tombstone_reason = ?3, seq = ?4 WHERE id = ?1",
        )
        .bind(seat.as_str())
        .bind(seq)
        .bind(reason)
        .bind(seq)
        .execute(&mut *tx)
        .await
        .map_err(adapter_error)?
        .rows_affected();

        if affected == 0 {
            // Tombstoning a seat nobody registered is a fact, not a no-op: a
            // silent success teaches the caller nothing. ROLL BACK first — the
            // split version committed the event anyway, so the spine recorded a
            // tombstone for a seat that was never there (review finding 6).
            tx.rollback().await.map_err(adapter_error)?;
            return Err(PijError::NoRegistryEntry { seat: seat.clone() });
        }

        tx.commit().await.map_err(adapter_error)?;
        Ok(Seq(seq as u64))
    }
}
