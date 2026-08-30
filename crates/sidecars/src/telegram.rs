//! Telegram bridge: durable outbound jobs and single-consumer inbound polling.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;

use pij_core::error::{PijError, Result};
use pij_core::model::{Event, Job, Outcome, SeatId};
use pij_core::ports::{Queue, Spine};
use serde::{Deserialize, Serialize};

use crate::common::{LoopHandle, Processed, enqueue_turn, now_ms, start_resilient_loop};

/// Queue kind for outbound Telegram work.
pub const TELEGRAM_SEND_KIND: &str = "sidecar:telegram:send";
const WORKER_ID: &str = "sidecar-telegram";
const BINDING_KIND: &str = "telegram.binding";
const REFUSAL_KIND: &str = "telegram.inbound-refused";

/// Validated Telegram credentials loaded from the legacy file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TelegramConfig {
    /// Bot token.
    pub token: String,
    /// Telegram users allowed to inject turns.
    pub allowed_user_ids: Vec<i64>,
    /// Default outbound conversation.
    pub chat_id: String,
    /// Bot API root; injectable for deterministic tests.
    pub api_root: String,
}

impl TelegramConfig {
    /// Read the legacy `telegram.env` without mutating process environment.
    pub fn load(path: &Path) -> Result<Self> {
        let text = fs::read_to_string(path).map_err(|error| PijError::Adapter {
            adapter: "sidecars/telegram".to_string(),
            message: format!(
                "could not read telegram credentials {}: {error}",
                path.display()
            ),
        })?;
        let value = |key: &str| {
            text.lines().find_map(|line| {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    return None;
                }
                let (found, value) = line.split_once('=')?;
                (found.trim() == key).then(|| value.trim().trim_matches(['\'', '"']).to_string())
            })
        };
        let token = value("TELEGRAM_BOT_TOKEN")
            .filter(|v| !v.is_empty())
            .ok_or_else(|| PijError::Adapter {
                adapter: "sidecars/telegram".to_string(),
                message: format!("TELEGRAM_BOT_TOKEN is missing from {}", path.display()),
            })?;
        let chat_id = value("TELEGRAM_CHAT_ID")
            .filter(|v| !v.is_empty())
            .ok_or_else(|| PijError::Adapter {
                adapter: "sidecars/telegram".to_string(),
                message: format!("TELEGRAM_CHAT_ID is missing from {}", path.display()),
            })?;
        let allowed_user_ids = value("TELEGRAM_ALLOWED_USER_IDS")
            .unwrap_or_default()
            .split(',')
            .filter(|value| !value.trim().is_empty())
            .map(|value| {
                value
                    .trim()
                    .parse::<i64>()
                    .map_err(|error| PijError::Adapter {
                        adapter: "sidecars/telegram".to_string(),
                        message: format!(
                            "invalid TELEGRAM_ALLOWED_USER_IDS entry `{value}` in {}: {error}",
                            path.display()
                        ),
                    })
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(Self {
            token,
            allowed_user_ids,
            chat_id,
            api_root: "https://api.telegram.org".to_string(),
        })
    }
}

/// Durable request submitted by the CLI.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TelegramSend {
    /// Seat whose later reply binding this send establishes.
    pub from: SeatId,
    /// Message text.
    pub body: String,
    /// Stable request id.
    pub msg_id: String,
    /// Conversation override; absent uses the credential file's chat id.
    pub chat_id: Option<String>,
}

/// Build one queue row for an outbound Telegram send.
pub fn send_job(request: &TelegramSend) -> Result<Job> {
    Ok(Job {
        kind: TELEGRAM_SEND_KIND.to_string(),
        serial_key: request
            .chat_id
            .clone()
            .unwrap_or_else(|| "default".to_string()),
        payload: serde_json::to_string(request).map_err(|error| PijError::Adapter {
            adapter: "sidecars/telegram".to_string(),
            message: format!("could not encode Telegram request: {error}"),
        })?,
        dedupe_key: request.msg_id.clone(),
        attempt: 0,
    })
}

#[derive(Debug)]
struct BridgeLock {
    path: PathBuf,
    pid: u32,
}

impl BridgeLock {
    fn acquire(path: PathBuf) -> Result<Self> {
        let pid = std::process::id();
        for _ in 0..2 {
            match OpenOptions::new().write(true).create_new(true).open(&path) {
                Ok(mut file) => {
                    let body = serde_json::json!({"pid": pid, "startedAtMs": now_ms()?});
                    file.write_all(body.to_string().as_bytes())
                        .map_err(|error| PijError::Adapter {
                            adapter: "sidecars/telegram".to_string(),
                            message: format!(
                                "could not write Telegram lock {}: {error}",
                                path.display()
                            ),
                        })?;
                    file.sync_all().map_err(|error| PijError::Adapter {
                        adapter: "sidecars/telegram".to_string(),
                        message: format!(
                            "could not sync Telegram lock {}: {error}",
                            path.display()
                        ),
                    })?;
                    return Ok(Self { path, pid });
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    let holder = fs::read_to_string(&path)
                        .ok()
                        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
                        .and_then(|value| value.get("pid")?.as_u64())
                        .and_then(|value| u32::try_from(value).ok());
                    if holder.is_some_and(process_exists) {
                        return Err(PijError::Adapter {
                            adapter: "sidecars/telegram".to_string(),
                            message: format!(
                                "Telegram getUpdates lock {} is held by live pid {}",
                                path.display(),
                                holder.expect("checked")
                            ),
                        });
                    }
                    fs::remove_file(&path).map_err(|remove_error| PijError::Adapter {
                        adapter: "sidecars/telegram".to_string(),
                        message: format!("could not reclaim stale Telegram lock {} after {error}: {remove_error}", path.display()),
                    })?;
                }
                Err(error) => {
                    return Err(PijError::Adapter {
                        adapter: "sidecars/telegram".to_string(),
                        message: format!(
                            "could not acquire Telegram lock {}: {error}",
                            path.display()
                        ),
                    });
                }
            }
        }
        Err(PijError::Adapter {
            adapter: "sidecars/telegram".to_string(),
            message: format!(
                "could not acquire Telegram lock {} after stale-lock retry",
                path.display()
            ),
        })
    }
}

impl Drop for BridgeLock {
    fn drop(&mut self) {
        let ours = fs::read_to_string(&self.path)
            .ok()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
            .and_then(|value| value.get("pid")?.as_u64())
            == Some(u64::from(self.pid));
        if ours {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn process_exists(pid: u32) -> bool {
    Command::new("/bin/kill")
        .args(["-0", &pid.to_string()])
        .status()
        .is_ok_and(|status| status.success())
}

/// The concrete Telegram queue consumer.
pub struct TelegramWorker {
    queue: Arc<dyn Queue>,
    spine: Arc<dyn Spine>,
    client: reqwest::Client,
    config: TelegramConfig,
    next_update: tokio::sync::Mutex<i64>,
    _lock: BridgeLock,
}

impl TelegramWorker {
    /// Construct and acquire the single-consumer getUpdates lock.
    pub fn new(
        queue: Arc<dyn Queue>,
        spine: Arc<dyn Spine>,
        config: TelegramConfig,
        lock_path: PathBuf,
    ) -> Result<Self> {
        Ok(Self {
            queue,
            spine,
            client: reqwest::Client::new(),
            config,
            next_update: tokio::sync::Mutex::new(0),
            _lock: BridgeLock::acquire(lock_path)?,
        })
    }

    /// Start the shipped resilient loop. A failed pass is logged; later passes continue.
    pub fn start(self: Arc<Self>, interval: Duration, limit: usize) -> Result<LoopHandle> {
        start_resilient_loop("telegram", interval, move || {
            let worker = Arc::clone(&self);
            async move { worker.run_once(limit).await }
        })
    }

    /// Claim at most `limit` outbound rows, then poll inbound once.
    pub async fn run_once(&self, limit: usize) -> Result<Processed> {
        let mut count = 0;
        while count < limit {
            let Some((id, job)) = self
                .queue
                .claim(&[TELEGRAM_SEND_KIND.to_string()], WORKER_ID)
                .await?
            else {
                break;
            };
            match self.process_send(&job).await {
                Ok(()) => self.queue.ack(id, Outcome::Done).await?,
                Err(error) => {
                    self.queue.retry(id, Duration::ZERO).await?;
                    return Err(error);
                }
            }
            count += 1;
        }
        self.poll_inbound().await?;
        Ok(Processed { count })
    }

    async fn process_send(&self, job: &Job) -> Result<()> {
        let request: TelegramSend =
            serde_json::from_str(&job.payload).map_err(|error| PijError::Adapter {
                adapter: "sidecars/telegram".to_string(),
                message: format!("job payload is not a Telegram send: {error}"),
            })?;
        let chat_id = request.chat_id.as_deref().unwrap_or(&self.config.chat_id);
        let response = self
            .client
            .post(format!(
                "{}/bot{}/sendMessage",
                self.config.api_root, self.config.token
            ))
            .json(&serde_json::json!({"chat_id": chat_id, "text": request.body}))
            .send()
            .await
            .map_err(http_error)?;
        if !response.status().is_success() {
            return Err(PijError::Adapter {
                adapter: "sidecars/telegram".to_string(),
                message: format!("sendMessage returned HTTP {}", response.status()),
            });
        }
        self.spine
            .append(Event {
                seq: None,
                v: 1,
                at: now_ms()?,
                kind: BINDING_KIND.to_string(),
                seat: Some(conversation_seat(chat_id)),
                payload: serde_json::to_string(&Binding {
                    target: request.from,
                    outbound_msg_id: request.msg_id,
                })
                .map_err(codec_error)?,
            })
            .await?;
        Ok(())
    }

    async fn poll_inbound(&self) -> Result<()> {
        let offset = *self.next_update.lock().await;
        let response = self
            .client
            .get(format!(
                "{}/bot{}/getUpdates",
                self.config.api_root, self.config.token
            ))
            .query(&[("timeout", "1"), ("offset", &offset.to_string())])
            .send()
            .await
            .map_err(http_error)?;
        if !response.status().is_success() {
            return Err(PijError::Adapter {
                adapter: "sidecars/telegram".to_string(),
                message: format!("getUpdates returned HTTP {}", response.status()),
            });
        }
        let updates: TelegramResponse<Vec<Update>> = response.json().await.map_err(http_error)?;
        if !updates.ok {
            return Err(PijError::Adapter {
                adapter: "sidecars/telegram".to_string(),
                message: "getUpdates returned ok=false".to_string(),
            });
        }
        for update in updates.result {
            *self.next_update.lock().await = update.update_id + 1;
            let Some(message) = update.message else {
                continue;
            };
            if !self.config.allowed_user_ids.contains(&message.from.id) {
                continue;
            }
            let chat = message.chat.id.to_string();
            let Some(text) = message.text else { continue };
            let binding = self
                .spine
                .latest_matching(&conversation_seat(&chat), &[BINDING_KIND])
                .await?;
            let Some(binding) = binding else {
                self.spine.append(Event { seq: None, v: 1, at: now_ms()?, kind: REFUSAL_KIND.to_string(), seat: Some(conversation_seat(&chat)), payload: serde_json::json!({"conversation": chat, "reason": "no persisted outbound binding"}).to_string() }).await?;
                eprintln!(
                    "pij-rs telegram: refused inbound conversation {chat}: no persisted outbound binding"
                );
                continue;
            };
            let binding: Binding = serde_json::from_str(&binding.payload).map_err(codec_error)?;
            enqueue_turn(
                &self.queue,
                "pij-telegram",
                &binding.target,
                text,
                format!("telegram-{}", update.update_id),
            )
            .await?;
        }
        Ok(())
    }
}

fn conversation_seat(chat_id: &str) -> SeatId {
    SeatId::from(format!("pij-telegram-chat-{chat_id}"))
}

#[derive(Serialize, Deserialize)]
struct Binding {
    target: SeatId,
    outbound_msg_id: String,
}

#[derive(Deserialize)]
struct TelegramResponse<T> {
    ok: bool,
    result: T,
}
#[derive(Deserialize)]
struct Update {
    update_id: i64,
    message: Option<TelegramMessage>,
}
#[derive(Deserialize)]
struct TelegramMessage {
    from: TelegramUser,
    chat: TelegramChat,
    text: Option<String>,
}
#[derive(Deserialize)]
struct TelegramUser {
    id: i64,
}
#[derive(Deserialize)]
struct TelegramChat {
    id: i64,
}

fn http_error(error: reqwest::Error) -> PijError {
    PijError::Adapter {
        adapter: "sidecars/telegram".to_string(),
        message: error.to_string(),
    }
}
fn codec_error(error: serde_json::Error) -> PijError {
    PijError::Adapter {
        adapter: "sidecars/telegram".to_string(),
        message: error.to_string(),
    }
}
