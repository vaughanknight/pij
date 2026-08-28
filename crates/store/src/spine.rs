//! The append-only history, on SQLite.
//!
//! Rows are inserted and never updated. `seq` is an AUTOINCREMENT primary key,
//! so it is monotonic for the life of the database and is never reused even
//! after deletion — which is what lets `tail(since)` mean "everything I have not
//! seen" rather than "everything currently present".

use async_trait::async_trait;
use sqlx::{Pool, Row, Sqlite};

use pij_core::error::{PijError, Result};
use pij_core::model::{Event, SeatId, Seq};
use pij_core::ports::Spine;

use crate::migrate::{begin_write, require_current_schema};

/// A [`Spine`] backed by the SQLite store.
pub struct SqliteSpine {
    pool: Pool<Sqlite>,
}

impl SqliteSpine {
    /// Wrap an open pool.
    pub fn new(pool: Pool<Sqlite>) -> Self {
        SqliteSpine { pool }
    }
}

fn adapter_error(error: sqlx::Error) -> PijError {
    PijError::Adapter {
        adapter: "store/spine".to_string(),
        message: error.to_string(),
    }
}

#[async_trait]
impl Spine for SqliteSpine {
    async fn append(&self, event: Event) -> Result<Seq> {
        require_current_schema(&self.pool).await?;
        let mut tx = begin_write(&self.pool).await?;
        let seq: i64 = sqlx::query_scalar(
            "INSERT INTO spine_events (v, at, kind, seat, payload) \
             VALUES (?1, ?2, ?3, ?4, ?5) RETURNING seq",
        )
        .bind(i64::from(event.v))
        .bind(event.at as i64)
        .bind(&event.kind)
        .bind(event.seat.as_ref().map(SeatId::as_str))
        .bind(&event.payload)
        .fetch_one(&mut *tx)
        .await
        .map_err(adapter_error)?;
        tx.commit().await.map_err(adapter_error)?;
        Ok(Seq(seq as u64))
    }

    async fn tail(&self, seat: Option<&SeatId>, since: Seq) -> Result<Vec<Event>> {
        require_current_schema(&self.pool).await?;
        let rows = sqlx::query(
            "SELECT seq, v, at, kind, seat, payload FROM spine_events \
             WHERE seq > ?1 AND (?2 IS NULL OR seat = ?2) ORDER BY seq",
        )
        .bind(since.0 as i64)
        .bind(seat.map(SeatId::as_str))
        .fetch_all(&self.pool)
        .await
        .map_err(adapter_error)?;

        rows.iter()
            .map(|row| {
                Ok(Event {
                    // The read path assigns the cursor the write path could not
                    // know (model::Event::seq).
                    seq: Some(Seq(
                        row.try_get::<i64, _>("seq").map_err(adapter_error)? as u64
                    )),
                    v: row.try_get::<i64, _>("v").map_err(adapter_error)? as u32,
                    at: row.try_get::<i64, _>("at").map_err(adapter_error)? as u64,
                    kind: row.try_get("kind").map_err(adapter_error)?,
                    seat: row
                        .try_get::<Option<String>, _>("seat")
                        .map_err(adapter_error)?
                        .map(SeatId),
                    payload: row.try_get("payload").map_err(adapter_error)?,
                })
            })
            .collect()
    }
}
