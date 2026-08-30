//! Detached background-command runner with observed process-group cancellation.

use std::collections::BTreeMap;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
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
static WORKER_GENERATION: AtomicU64 = AtomicU64::new(0);

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
    /// Boot-local ownership marker; a restarted daemon must never signal this pgid.
    pub owner_id: String,
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
    /// Observed shell exit code; absent for signals and lost ownership.
    pub exit_code: Option<i32>,
    /// Whether the owning direct child exited successfully, persisted even while
    /// grandchildren still keep the process group alive.
    #[serde(default)]
    pub exit_success: Option<bool>,
}

/// Background command lifecycle.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BgStatus {
    /// Process group is observed live.
    Running,
    /// Process group exited successfully and was reaped by this worker.
    Done,
    /// Process group exited non-zero and was reaped by this worker.
    Failed,
    /// No owning child handle survived to establish an exit outcome.
    Lost,
    /// Process group was signalled and then observed gone.
    Cancelled,
}

/// Concrete background queue consumer.
pub struct BgWorker {
    queue: Arc<dyn Queue>,
    state_dir: PathBuf,
    children: Mutex<BTreeMap<String, Child>>,
    cancel_deadline: Duration,
    owner_id: String,
    own_pgid: u32,
}

impl BgWorker {
    /// Construct over a dedicated durable state directory.
    pub fn new(queue: Arc<dyn Queue>, state_dir: PathBuf) -> Result<Self> {
        fs::create_dir_all(&state_dir)
            .map_err(|error| io_error("create state directory", &state_dir, error))?;
        let pid = std::process::id();
        Ok(Self {
            queue,
            state_dir,
            children: Mutex::new(BTreeMap::new()),
            cancel_deadline: Duration::from_secs(5),
            owner_id: format!(
                "{pid}-{}-{}",
                now_ms()?,
                WORKER_GENERATION.fetch_add(1, Ordering::Relaxed)
            ),
            own_pgid: process_group_of(pid)?,
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
        self.observe_completions().await?;
        let mut count = 0;
        let mut first_error = None;
        while count < limit {
            let Some((queue_id, row)) = self.queue.claim(&[BG_KIND.to_string()], WORKER_ID).await?
            else {
                break;
            };
            let result = match serde_json::from_str::<BgRequest>(&row.payload).map_err(codec_error)
            {
                Ok(BgRequest::Start {
                    id,
                    title,
                    command,
                    target,
                }) => self.start_command(id, title, command, target),
                Ok(BgRequest::Cancel { id, target }) => self.cancel_command(&id, &target).await,
                Err(error) => Err(error),
            };
            match result {
                Ok(()) => self.queue.ack(queue_id, Outcome::Done).await?,
                Err(error) => {
                    self.queue.retry(queue_id, Duration::from_secs(1)).await?;
                    if first_error.is_none() {
                        first_error = Some(error);
                    }
                }
            }
            count += 1;
        }
        self.observe_completions().await?;
        if let Some(error) = first_error {
            return Err(error);
        }
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
            owner_id: self.owner_id.clone(),
            target,
            output_path,
            status: BgStatus::Running,
            observed_pids: Vec::new(),
            finished_at: None,
            exit_code: None,
            exit_success: None,
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
        if record.owner_id != self.owner_id {
            return Err(PijError::Adapter {
                adapter: "sidecars/bg".to_string(),
                message: format!(
                    "refusing to signal process group {} for `{id}`: durable owner {} is not this boot {}",
                    record.pgid, record.owner_id, self.owner_id
                ),
            });
        }
        if record.pgid == self.own_pgid {
            return Err(PijError::Adapter {
                adapter: "sidecars/bg".to_string(),
                message: format!(
                    "refusing to signal process group {} for `{id}`: it is the daemon's own group",
                    record.pgid
                ),
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
            let _ = self.reap(id)?;
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
            let owned = self.owns_child(&record.id);
            let exit = self.reap(&record.id)?;
            if let Some(status) = exit {
                // Persist the direct-child observation BEFORE a lingering
                // grandchild can make this pass defer terminal classification.
                // Otherwise the handle is reaped and the next pass mistakes
                // "already observed" for "never ours".
                record.exit_code = status.code();
                record.exit_success = Some(status.success());
                self.persist(&record)?;
            }
            if !group_pids(record.pgid)?.is_empty() {
                continue;
            }
            if owned && record.exit_success.is_none() {
                // The direct child is still ours and `try_wait` said not exited.
                // An empty process-table sample is not evidence of loss.
                continue;
            }
            let (status, exit_code, label) = match record.exit_success {
                Some(true) => (BgStatus::Done, record.exit_code, "finished"),
                Some(false) => (BgStatus::Failed, record.exit_code, "failed"),
                None => (
                    BgStatus::Lost,
                    None,
                    "lost: process exited without an owning completion observation",
                ),
            };
            record.status = status;
            record.exit_code = exit_code;
            record.finished_at = Some(now_ms()?);
            self.persist(&record)?;
            let output = fs::read_to_string(&record.output_path)
                .map_err(|error| io_error("read output", &record.output_path, error))?;
            enqueue_turn(
                &self.queue,
                "pij-bg",
                &record.target,
                format!(
                    "background job `{}` {label}{}\n{}",
                    record.id,
                    exit_code
                        .map(|code| format!(" (exit {code})"))
                        .unwrap_or_default(),
                    output.trim_end()
                ),
                format!("bg-{}-terminal", record.id),
            )
            .await?;
        }
        Ok(())
    }

    fn owns_child(&self, id: &str) -> bool {
        self.children
            .lock()
            .expect("bg children mutex")
            .contains_key(id)
    }

    fn reap(&self, id: &str) -> Result<Option<ExitStatus>> {
        let mut children = self.children.lock().expect("bg children mutex");
        let status = match children.get_mut(id) {
            Some(child) => child.try_wait().map_err(|error| PijError::Adapter {
                adapter: "sidecars/bg".to_string(),
                message: format!("could not observe child `{id}`: {error}"),
            })?,
            None => None,
        };
        if status.is_some() {
            children.remove(id);
        }
        Ok(status)
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

fn process_group_of(pid: u32) -> Result<u32> {
    let output = Command::new("/bin/ps")
        .args(["-o", "pgid=", "-p", &pid.to_string()])
        .output()
        .map_err(|error| PijError::Adapter {
            adapter: "sidecars/bg".to_string(),
            message: format!("could not execute /bin/ps for pid {pid}: {error}"),
        })?;
    let raw = String::from_utf8(output.stdout).map_err(|error| PijError::Adapter {
        adapter: "sidecars/bg".to_string(),
        message: format!("/bin/ps returned non-UTF-8 process-group output: {error}"),
    })?;
    raw.trim()
        .parse::<u32>()
        .map_err(|error| PijError::Adapter {
            adapter: "sidecars/bg".to_string(),
            message: format!("could not resolve process group for pid {pid} from {raw:?}: {error}"),
        })
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
