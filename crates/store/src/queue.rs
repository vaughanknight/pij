//! The job queue primitive (workshop 001 R4).
//!
//! The daemon is queue-first: a handler does exactly one cheap statement and
//! everything else becomes a job. So this is the primitive delivery, sidecars,
//! watchdog fan-out and chores all ride on, and it is built before any of them.
//!
//! Three semantics, enforced in SQL rather than process-local state:
//!
//! * **Dedupe** — a partial unique index over LIVE rows. N rapid submits collapse
//!   to one row, and the id every caller gets back is that row's.
//! * **Serialization** — at most one RUNNING job per `serial_key`.
//! * **Terminal claim expiry** — age is policy, not a brake: a claim older than
//!   the configured lease becomes FAILED on the next claim transaction. It is
//!   never returned to pending, so a stale worker cannot race a second execution.

use async_trait::async_trait;
use sqlx::{Pool, Row, Sqlite};

use std::time::Duration;

use pij_core::error::{PijError, Result};
use pij_core::model::{Job, JobId, Outcome};
use pij_core::ports::Queue;

use crate::migrate::require_current_schema;

/// A [`Queue`] backed by the SQLite store.
pub struct SqliteQueue {
    pool: Pool<Sqlite>,
    claim_lease_secs: i64,
}

impl SqliteQueue {
    /// Wrap an open pool with the configured maximum running-claim age.
    ///
    /// # Errors
    /// [`PijError::Adapter`] when `claim_lease_secs` is zero or exceeds SQLite's
    /// signed integer range.
    pub fn new(pool: Pool<Sqlite>, claim_lease_secs: u64) -> Result<Self> {
        let claim_lease_secs = i64::try_from(claim_lease_secs)
            .ok()
            .filter(|seconds| *seconds > 0)
            .ok_or_else(|| PijError::Adapter {
                adapter: "store/queue".to_string(),
                message: "claim_lease_secs must be between 1 and i64::MAX".to_string(),
            })?;
        Ok(SqliteQueue {
            pool,
            claim_lease_secs,
        })
    }

    /// Begin a transaction that intends to WRITE (delegates to the shared rule).
    ///
    /// `BEGIN IMMEDIATE`, never the default `BEGIN DEFERRED`, and this is not a
    /// tuning preference — it is a correctness fix measured here. A deferred
    /// transaction takes a READ lock first and upgrades on its first write; when
    /// two of them try to upgrade at once, SQLite returns SQLITE_BUSY
    /// **immediately and does not invoke the busy handler**, because waiting can
    /// never resolve a deadlock in which both parties already hold read locks.
    /// So `busy_timeout` — 5s by default in sqlx — buys nothing at all, and the
    /// contention test failed with "database is locked" while every retry knob
    /// looked correctly set.
    ///
    /// `BEGIN IMMEDIATE` takes the write lock up front, so the second writer
    /// WAITS (and the busy timeout finally means something) instead of failing.
    async fn begin_write(&self) -> Result<sqlx::Transaction<'_, Sqlite>> {
        crate::migrate::begin_write(&self.pool).await
    }

    /// How many rows are live (pending or running) — the dedupe assertion
    /// surface, and the number an operator actually wants when asking "is the
    /// queue backed up?".
    ///
    /// # Errors
    /// [`PijError::Adapter`] when the count cannot be read.
    pub async fn live_len(&self) -> Result<u64> {
        // A public read of the database is a public database operation. Review
        // found this one outside the guard while every other op had it, which is
        // how "every operation checks" quietly becomes "every operation I
        // remembered to check".
        require_current_schema(&self.pool).await?;
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM jobs WHERE state IN ('pending', 'running')")
                .fetch_one(&self.pool)
                .await
                .map_err(adapter_error)?;
        Ok(count as u64)
    }
}

fn adapter_error(error: sqlx::Error) -> PijError {
    PijError::Adapter {
        adapter: "store/queue".to_string(),
        message: error.to_string(),
    }
}

#[async_trait]
impl Queue for SqliteQueue {
    async fn enqueue(&self, job: Job) -> Result<JobId> {
        require_current_schema(&self.pool).await?;
        // `ON CONFLICT ... DO NOTHING` against the partial index, then read the
        // live row back. Both statements run in ONE transaction so a concurrent
        // enqueue cannot slip between them and leave this caller with no id.
        let mut tx = self.begin_write().await?;

        sqlx::query(
            "INSERT INTO jobs (kind, serial_key, payload, dedupe_key, enqueued_at) \
             VALUES (?1, ?2, ?3, ?4, unixepoch()) ON CONFLICT DO NOTHING",
        )
        .bind(&job.kind)
        .bind(&job.serial_key)
        .bind(&job.payload)
        .bind(&job.dedupe_key)
        .execute(&mut *tx)
        .await
        .map_err(adapter_error)?;

        let id: i64 = sqlx::query_scalar(
            "SELECT id FROM jobs WHERE dedupe_key = ?1 AND state IN ('pending', 'running') \
             ORDER BY id LIMIT 1",
        )
        .bind(&job.dedupe_key)
        .fetch_one(&mut *tx)
        .await
        .map_err(adapter_error)?;

        tx.commit().await.map_err(adapter_error)?;
        Ok(JobId(id as u64))
    }

    async fn claim(&self, kinds: &[String], worker: &str) -> Result<Option<(JobId, Job)>> {
        require_current_schema(&self.pool).await?;
        if kinds.is_empty() {
            return Ok(None);
        }
        // The kind list is data, not SQL: `json_each` expands it, so a caller can
        // never widen the query by choosing a clever kind name.
        let kinds_json = serde_json::to_string(kinds).map_err(|error| PijError::Adapter {
            adapter: "store/queue".to_string(),
            message: format!("could not encode the claim filter: {error}"),
        })?;

        let mut tx = self.begin_write().await?;
        // Claim age is POLICY: removing this statement changes expired work from
        // terminally failed to indefinitely running. Never put the same id back
        // in pending; that would let the old worker and a new worker both act.
        sqlx::query(
            "UPDATE jobs \
             SET state = 'failed', \
                 outcome = printf('claim lease expired after %d seconds for worker %s', \
                                  ?1, COALESCE(worker, '<unknown>')), \
                 acked_at = unixepoch() \
             WHERE state = 'running' \
               AND claimed_at IS NOT NULL \
               AND claimed_at <= unixepoch() - ?1",
        )
        .bind(self.claim_lease_secs)
        .execute(&mut *tx)
        .await
        .map_err(adapter_error)?;

        let row = sqlx::query(
            "SELECT id, kind, serial_key, payload, dedupe_key FROM jobs \
             WHERE state = 'pending' \
               AND not_before <= unixepoch() \
               AND kind IN (SELECT value FROM json_each(?1)) \
               AND serial_key NOT IN (SELECT serial_key FROM jobs WHERE state = 'running') \
             ORDER BY id LIMIT 1",
        )
        .bind(&kinds_json)
        .fetch_optional(&mut *tx)
        .await
        .map_err(adapter_error)?;

        let Some(row) = row else {
            tx.commit().await.map_err(adapter_error)?;
            return Ok(None);
        };

        let id: i64 = row.try_get("id").map_err(adapter_error)?;
        let job = Job {
            kind: row.try_get("kind").map_err(adapter_error)?,
            serial_key: row.try_get("serial_key").map_err(adapter_error)?,
            payload: row.try_get("payload").map_err(adapter_error)?,
            dedupe_key: row.try_get("dedupe_key").map_err(adapter_error)?,
        };

        // The UPDATE re-checks `state = 'pending'`, so two claimers racing on the
        // same row produce one winner and one `None` — never two workers holding
        // the same job.
        let claimed = sqlx::query(
            "UPDATE jobs \
             SET state = 'running', worker = ?2, claimed_at = unixepoch() \
             WHERE id = ?1 AND state = 'pending'",
        )
        .bind(id)
        .bind(worker)
        .execute(&mut *tx)
        .await
        .map_err(adapter_error)?
        .rows_affected();

        tx.commit().await.map_err(adapter_error)?;

        if claimed == 0 {
            return Ok(None);
        }
        Ok(Some((JobId(id as u64), job)))
    }

    /// R4-AMEND-1: pending again, counted, and not before `delay` has passed —
    /// all in ONE transaction, because the whole point is that no crash window
    /// exists between "this attempt failed" and "it will be tried again".
    async fn retry(&self, job: JobId, delay: Duration) -> Result<()> {
        require_current_schema(&self.pool).await?;
        let seconds = i64::try_from(delay.as_secs()).unwrap_or(i64::MAX);

        let mut tx = self.begin_write().await?;
        let affected = sqlx::query(
            "UPDATE jobs \
             SET state = 'pending', worker = NULL, claimed_at = NULL, \
                 attempt = attempt + 1, not_before = unixepoch() + ?2 \
             WHERE id = ?1 AND state = 'running'",
        )
        .bind(job.0 as i64)
        .bind(seconds)
        .execute(&mut *tx)
        .await
        .map_err(adapter_error)?
        .rows_affected();

        tx.commit().await.map_err(adapter_error)?;
        if affected == 0 {
            // Same reasoning as `ack`: retrying a job nobody claimed means a
            // worker believes it holds work the queue does not think is running,
            // which is exactly what a lost claim leaves behind. Reported, never
            // silently ignored — a retry that quietly does nothing is a message
            // that stops moving and says so to no one.
            return Err(PijError::Adapter {
                adapter: "store/queue".to_string(),
                message: format!("job {} is not running, so it cannot be retried", job.0),
            });
        }
        Ok(())
    }

    async fn ack(&self, job: JobId, outcome: Outcome) -> Result<()> {
        require_current_schema(&self.pool).await?;
        let (state, detail) = match &outcome {
            Outcome::Done => ("done", None),
            Outcome::Failed { reason } => ("failed", Some(reason.clone())),
        };

        let mut tx = self.begin_write().await?;
        let affected = sqlx::query(
            "UPDATE jobs \
             SET state = ?2, outcome = ?3, acked_at = unixepoch() \
             WHERE id = ?1 AND state = 'running'",
        )
        .bind(job.0 as i64)
        .bind(state)
        .bind(detail)
        .execute(&mut *tx)
        .await
        .map_err(adapter_error)?
        .rows_affected();

        tx.commit().await.map_err(adapter_error)?;
        if affected == 0 {
            // Acking a job nobody claimed is a fact worth reporting: it means a
            // worker believes it holds work the queue does not think is running,
            // which is exactly the state a lost claim leaves behind.
            return Err(PijError::Adapter {
                adapter: "store/queue".to_string(),
                message: format!(
                    "job {} is not running — it was already acked, or never claimed",
                    job.0
                ),
            });
        }
        Ok(())
    }
}
