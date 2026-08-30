//! Detached background-command runner with observed process-group cancellation.

use std::collections::BTreeMap;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[cfg(unix)]
use std::os::unix::process::CommandExt;

use pij_core::error::{PijError, Result};
use pij_core::model::{Job, Outcome, SeatId};
use pij_core::ports::Queue;
use serde::{Deserialize, Serialize};

use crate::common::{LoopHandle, Processed, enqueue_turn, now_ms, start_resilient_loop};

/// Queue kind for background-runner commands.
pub const BG_KIND: &str = "sidecar:bg";
const WORKER_ID: &str = "sidecar-bg";

/// A background runner request.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "action")]
pub enum BgRequest {
    /// Start a detached shell command.
    Start {
        /// Stable job name.
        id: String,
        /// Human title.
        title: String,
        /// Command interpreted by `/bin/sh -c`.
        command: String,
        /// Seat receiving completion/cancellation turns.
        target: SeatId,
    },
    /// Cancel one running command.
    Cancel {
        /// Stable job name.
        id: String,
        /// Seat receiving the cancellation turn.
        target: SeatId,
    },
}

impl BgRequest {
    fn id(&self) -> &str {
        match self {
            Self::Start { id, .. } | Self::Cancel { id, .. } => id,
        }
    }
}

/// Build a durable background-runner queue row.
pub fn job(request: &BgRequest, request_id: &str) -> Result<Job> {
    Ok(Job {
        kind: BG_KIND.to_string(),
        serial_key: request.id().to_string(),
        payload: serde_json::to_string(request).map_err(codec_error)?,
        dedupe_key: request_id.to_string(),
        attempt: 0,
    })
}

/// Durable background command state.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BgRecord {
    /// Stable job name.
    pub id: String,
    /// Human title.
    pub title: String,
    /// Process-group id (the spawned shell is group leader).
    pub pgid: u32,
    /// Target seat.
    pub target: SeatId,
    /// Captured output path.
    pub output_path: PathBuf,
    /// Current observed status.
    pub status: BgStatus,
    /// Pids observed immediately before cancellation; an observed value.
    pub observed_pids: Vec<u32>,
    /// Terminal observation time.
    pub finished_at: Option<u64>,
}

/// Background command lifecycle.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BgStatus {
    /// Process group is observed live.
    Running,
    /// Process group exited normally.
    Done,
    /// Process group was signalled and then observed gone.
    Cancelled,
}

/// Concrete background queue consumer.
pub struct BgWorker {
    queue: Arc<dyn Queue>,
    state_dir: PathBuf,
    children: Mutex<BTreeMap<String, Child>>,
    cancel_deadline: Duration,
}

impl BgWorker {
    /// Construct over a dedicated durable state directory.
    pub fn new(queue: Arc<dyn Queue>, state_dir: PathBuf) -> Result<Self> {
        fs::create_dir_all(&state_dir)
            .map_err(|error| io_error("create state directory", &state_dir, error))?;
        Ok(Self {
            queue,
            state_dir,
            children: Mutex::new(BTreeMap::new()),
            cancel_deadline: Duration::from_secs(5),
        })
    }

    /// Override the bounded cancellation deadline for deterministic tests.
    pub fn with_cancel_deadline(mut self, deadline: Duration) -> Self {
        self.cancel_deadline = deadline;
        self
    }

    /// Start the shipped resilient loop.
    pub fn start(self: Arc<Self>, interval: Duration, limit: usize) -> Result<LoopHandle> {
        start_resilient_loop("bg", interval, move || {
            let worker = Arc::clone(&self);
            async move { worker.run_once(limit).await }
        })
    }

    /// Claim at most `limit` commands and observe every running group once.
    pub async fn run_once(&self, limit: usize) -> Result<Processed> {
        let mut count = 0;
        while count < limit {
            let Some((queue_id, row)) = self.queue.claim(&[BG_KIND.to_string()], WORKER_ID).await?
            else {
                break;
            };
            let request: BgRequest = serde_json::from_str(&row.payload).map_err(codec_error)?;
            let result = match request {
                BgRequest::Start {
                    id,
                    title,
                    command,
                    target,
                } => self.start_command(id, title, command, target),
                BgRequest::Cancel { id, target } => self.cancel_command(&id, &target).await,
            };
            match result {
                Ok(()) => self.queue.ack(queue_id, Outcome::Done).await?,
                Err(error) => {
                    self.queue.retry(queue_id, Duration::ZERO).await?;
                    return Err(error);
                }
            }
            count += 1;
        }
        self.observe_completions().await?;
        Ok(Processed { count })
    }

    fn start_command(
        &self,
        id: String,
        title: String,
        command: String,
        target: SeatId,
    ) -> Result<()> {
        if self.record_path(&id).exists() {
            return Err(PijError::Adapter {
                adapter: "sidecars/bg".to_string(),
                message: format!(
                    "background job `{id}` already exists at {}",
                    self.record_path(&id).display()
                ),
            });
        }
        let output_path = self.state_dir.join(format!("{id}.log"));
        let stdout = File::create(&output_path)
            .map_err(|error| io_error("create output", &output_path, error))?;
        let stderr = stdout
            .try_clone()
            .map_err(|error| io_error("clone output", &output_path, error))?;
        let mut command_process = Command::new("/bin/sh");
        command_process
            .args(["-c", &command])
            .stdin(Stdio::null())
            .stdout(stdout)
            .stderr(stderr);
        #[cfg(unix)]
        command_process.process_group(0);
        #[cfg(not(unix))]
        return Err(PijError::Adapter {
            adapter: "sidecars/bg".to_string(),
            message: "background process groups are unsupported on this platform".to_string(),
        });
        let child = command_process.spawn().map_err(|error| PijError::Adapter {
            adapter: "sidecars/bg".to_string(),
            message: format!("could not spawn /bin/sh for background job `{id}`: {error}"),
        })?;
        let pgid = child.id();
        self.persist(&BgRecord {
            id: id.clone(),
            title,
            pgid,
            target,
            output_path,
            status: BgStatus::Running,
            observed_pids: Vec::new(),
            finished_at: None,
        })?;
        self.children
            .lock()
            .expect("bg children mutex")
            .insert(id, child);
        Ok(())
    }

    async fn cancel_command(&self, id: &str, target: &SeatId) -> Result<()> {
        let mut record = self.load(id)?;
        if record.status != BgStatus::Running {
            return Err(PijError::Adapter {
                adapter: "sidecars/bg".to_string(),
                message: format!("background job `{id}` is not running"),
            });
        }
        let observed = group_pids(record.pgid)?;
        signal_group(record.pgid)?;
        self.await_group_exit(id, record.pgid).await?;
        record.status = BgStatus::Cancelled;
        record.observed_pids = observed;
        record.finished_at = Some(now_ms()?);
        self.persist(&record)?;
        enqueue_turn(
            &self.queue,
            "pij-bg",
            target,
            format!(
                "background job `{id}` cancelled; observed process group {} gone",
                record.pgid
            ),
            format!("bg-{id}-cancelled"),
        )
        .await
    }

    /// Await observed group death. A successful kill command alone never satisfies cancellation.
    pub async fn await_group_exit(&self, id: &str, pgid: u32) -> Result<()> {
        let deadline = Instant::now() + self.cancel_deadline;
        loop {
            self.reap(id)?;
            let survivors = group_pids(pgid)?;
            if survivors.is_empty() {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err(PijError::Adapter {
                    adapter: "sidecars/bg".to_string(),
                    message: format!(
                        "timed out waiting for process group {pgid}; surviving pids: {survivors:?}"
                    ),
                });
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }

    async fn observe_completions(&self) -> Result<()> {
        let entries = fs::read_dir(&self.state_dir)
            .map_err(|error| io_error("read state directory", &self.state_dir, error))?;
        for entry in entries {
            let path = entry
                .map_err(|error| io_error("read state entry", &self.state_dir, error))?
                .path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let mut record: BgRecord = serde_json::from_str(
                &fs::read_to_string(&path)
                    .map_err(|error| io_error("read record", &path, error))?,
            )
            .map_err(codec_error)?;
            if record.status != BgStatus::Running {
                continue;
            }
            self.reap(&record.id)?;
            if !group_pids(record.pgid)?.is_empty() {
                continue;
            }
            record.status = BgStatus::Done;
            record.finished_at = Some(now_ms()?);
            self.persist(&record)?;
            let output = fs::read_to_string(&record.output_path)
                .map_err(|error| io_error("read output", &record.output_path, error))?;
            enqueue_turn(
                &self.queue,
                "pij-bg",
                &record.target,
                format!(
                    "background job `{}` finished\n{}",
                    record.id,
                    output.trim_end()
                ),
                format!("bg-{}-done", record.id),
            )
            .await?;
        }
        Ok(())
    }

    fn reap(&self, id: &str) -> Result<()> {
        let mut children = self.children.lock().expect("bg children mutex");
        let exited = if let Some(child) = children.get_mut(id) {
            child
                .try_wait()
                .map_err(|error| PijError::Adapter {
                    adapter: "sidecars/bg".to_string(),
                    message: format!("could not observe child `{id}`: {error}"),
                })?
                .is_some()
        } else {
            false
        };
        if exited {
            children.remove(id);
        }
        Ok(())
    }

    /// Read one durable record.
    pub fn load(&self, id: &str) -> Result<BgRecord> {
        let path = self.record_path(id);
        serde_json::from_str(
            &fs::read_to_string(&path).map_err(|error| io_error("read record", &path, error))?,
        )
        .map_err(codec_error)
    }

    fn persist(&self, record: &BgRecord) -> Result<()> {
        let path = self.record_path(&record.id);
        let staged = path.with_extension("json.tmp");
        fs::write(&staged, serde_json::to_vec(record).map_err(codec_error)?)
            .map_err(|error| io_error("write record", &staged, error))?;
        fs::rename(&staged, &path).map_err(|error| io_error("publish record", &path, error))
    }

    fn record_path(&self, id: &str) -> PathBuf {
        self.state_dir.join(format!("{id}.json"))
    }
}

fn signal_group(pgid: u32) -> Result<()> {
    let status = Command::new("/bin/kill")
        .args(["-TERM", &format!("-{pgid}")])
        .status()
        .map_err(|error| PijError::Adapter {
            adapter: "sidecars/bg".to_string(),
            message: format!("could not execute /bin/kill for process group {pgid}: {error}"),
        })?;
    if status.success() {
        Ok(())
    } else {
        Err(PijError::Adapter {
            adapter: "sidecars/bg".to_string(),
            message: format!("/bin/kill refused process group {pgid} with {status}"),
        })
    }
}

/// Observe every live (non-zombie) pid currently belonging to `pgid`.
///
/// A zombie is dead and awaiting its parent's `waitpid`; treating that residue as
/// a survivor makes convergence impossible until reaping, despite no process
/// remaining capable of work.
pub fn group_pids(pgid: u32) -> Result<Vec<u32>> {
    let output = Command::new("/bin/ps")
        .args(["-axo", "pid=,pgid=,state="])
        .output()
        .map_err(|error| PijError::Adapter {
            adapter: "sidecars/bg".to_string(),
            message: format!("could not execute /bin/ps for process group {pgid}: {error}"),
        })?;
    if !output.status.success() {
        return Err(PijError::Adapter {
            adapter: "sidecars/bg".to_string(),
            message: format!(
                "/bin/ps failed while observing process group {pgid}: {}",
                output.status
            ),
        });
    }
    let text = String::from_utf8(output.stdout).map_err(|error| PijError::Adapter {
        adapter: "sidecars/bg".to_string(),
        message: format!("/bin/ps returned non-UTF-8 output: {error}"),
    })?;
    let mut pids = Vec::new();
    for line in text.lines() {
        let mut fields = line.split_whitespace();
        let Some(pid) = fields.next().and_then(|value| value.parse::<u32>().ok()) else {
            continue;
        };
        let Some(group) = fields.next().and_then(|value| value.parse::<u32>().ok()) else {
            continue;
        };
        let state = fields.next().unwrap_or_default();
        if group == pgid && !state.starts_with('Z') {
            pids.push(pid);
        }
    }
    pids.sort_unstable();
    Ok(pids)
}

fn io_error(action: &str, path: &Path, error: std::io::Error) -> PijError {
    PijError::Adapter {
        adapter: "sidecars/bg".to_string(),
        message: format!("could not {action} {}: {error}", path.display()),
    }
}
fn codec_error(error: serde_json::Error) -> PijError {
    PijError::Adapter {
        adapter: "sidecars/bg".to_string(),
        message: error.to_string(),
    }
}
