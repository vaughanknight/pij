use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use async_trait::async_trait;
use pij_core::error::{PijError, Result};
use pij_core::model::{DeliveryOrigin, DeliveryOutcome, Harness, Msg, SeatDescriptor};
use pij_core::ports::Transport;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;
use tokio::time::{Instant, timeout, timeout_at};

const NAME: &str = "claude-uds";
const ACK_WAIT: Duration = Duration::from_millis(150);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
const DAEMON_ORIGIN: &str = "uds:pij-daemon";

/// Claude Code's Unix-domain-socket message transport.
///
/// Capability discovery deliberately reads Claude's session records on demand in
/// this wave. That is the explicit exception to descriptor stamping: reading a
/// record is cheap and side-effect-free; CONNECTING merely to discover whether a
/// socket exists remains forbidden. Descriptor stamping moves to wave 4.
///
/// This capability says nothing about the caller's human-typing politeness gate.
/// A socket does not corrupt a tmux composer, but interrupting a person who is
/// composing remains gated by pane signals before this transport is called.
///
/// The `peer_message_status` drop/hold decoder is retained but UNPROVEN on this
/// daemon-origin connection shape. On 2026-08-30, Claude Code 2.1.251 visibly
/// held an authenticated frame behind its Deny/Deliver dialog while returning
/// zero socket bytes for two seconds. Silence is therefore not an acknowledgement
/// unless the recipient was explicitly spawned with inbound acceptance stamped.
///
/// # Composition recipe
///
/// In `crates/daemon/src/lib.rs`, add `use pij_transport::UdsTransport;`, then
/// replace `AdapterChoice::Real => return Err(not_yet("transport", "u-uds, wave 3"))`
/// with `AdapterChoice::Real => Arc::new(UdsTransport::new()?),`. Add
/// `pij-transport.workspace = true` to `crates/daemon/Cargo.toml` and the matching
/// reviewed `pij-transport` internal edge to the daemon architecture allow-list.
#[derive(Clone, Debug)]
pub struct UdsTransport {
    sessions_dir: PathBuf,
    ack_wait: Duration,
    connect_timeout: Duration,
}

impl UdsTransport {
    /// Use the current user's Claude session registry.
    ///
    /// # Errors
    /// [`PijError::Adapter`] when the home directory is unavailable.
    pub fn new() -> Result<Self> {
        let home = env::var_os("HOME").ok_or_else(|| PijError::Adapter {
            adapter: NAME.to_string(),
            message: "HOME is unset — set HOME to the account that owns ~/.claude/sessions"
                .to_string(),
        })?;
        Ok(Self::from_sessions_dir(
            PathBuf::from(home).join(".claude/sessions"),
        ))
    }

    fn from_sessions_dir(sessions_dir: PathBuf) -> Self {
        Self {
            sessions_dir,
            ack_wait: ACK_WAIT,
            connect_timeout: CONNECT_TIMEOUT,
        }
    }

    fn discover(&self, seat: &SeatDescriptor) -> Option<Endpoint> {
        let pid = seat.proc?.pid;
        let direct = self.sessions_dir.join(format!("{pid}.json"));
        if let Some(endpoint) = self.endpoint_from_path(&direct) {
            return Some(endpoint);
        }
        let pane = seat.pane.as_deref()?;
        let suffix = format!(".{pane}");
        let mut records = fs::read_dir(&self.sessions_dir)
            .ok()?
            .filter_map(std::result::Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
            .collect::<Vec<_>>();
        records.sort();

        records.into_iter().find_map(|path| {
            let record = read_json::<SessionRecord>(&path)?;
            record
                .tmux
                .as_deref()
                .is_some_and(|tmux| tmux.ends_with(&suffix))
                .then(|| self.endpoint_from_record(record))
                .flatten()
        })
    }

    fn endpoint_from_path(&self, path: &Path) -> Option<Endpoint> {
        self.endpoint_from_record(read_json(path)?)
    }

    fn endpoint_from_record(&self, record: SessionRecord) -> Option<Endpoint> {
        let token = matching_peer_token(&self.sessions_dir, &record)?;
        let socket_path = record
            .messaging_socket_path
            .filter(|path| !path.is_empty())?;
        Some(Endpoint {
            socket_path: PathBuf::from(socket_path),
            token,
        })
    }
}

#[async_trait]
impl Transport for UdsTransport {
    fn name(&self) -> &str {
        NAME
    }

    async fn can_deliver(&self, seat: &SeatDescriptor, msg: &Msg) -> Result<bool> {
        if seat.harness != Harness::Claude || msg.command.is_some() {
            return Ok(false);
        }
        Ok(self.discover(seat).is_some())
    }

    async fn deliver(&self, seat: &SeatDescriptor, msg: &Msg) -> Result<DeliveryOutcome> {
        if seat.harness != Harness::Claude || msg.command.is_some() {
            return Ok(DeliveryOutcome::Queued);
        }
        let Some(endpoint) = self.discover(seat) else {
            return Ok(DeliveryOutcome::Queued);
        };
        let frame = build_peer_frame(msg)?;
        send_frame(&endpoint, &frame, msg, self.connect_timeout, self.ack_wait).await
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionRecord {
    pid: u32,
    proc_start: String,
    pid_domain: String,
    tmux: Option<String>,
    messaging_socket_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PeerKey {
    peer_token: String,
    proc_start: String,
    pid_domain: String,
}

struct Endpoint {
    socket_path: PathBuf,
    token: String,
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn matching_peer_token(sessions_dir: &Path, record: &SessionRecord) -> Option<String> {
    let prefix = format!("{}.", record.pid);
    let mut keys = fs::read_dir(sessions_dir)
        .ok()?
        .filter_map(std::result::Result::ok)
        .map(|entry| entry.path())
        .filter(|path| valid_key_name(path, &prefix))
        .collect::<Vec<_>>();
    keys.sort();

    let mut matches = keys.into_iter().filter_map(|path| {
        let key = read_json::<PeerKey>(&path)?;
        (key.proc_start == record.proc_start
            && key.pid_domain == record.pid_domain
            && !key.peer_token.is_empty())
        .then_some(key.peer_token)
    });
    let token = matches.next()?;
    if matches.next().is_some() {
        return None;
    }
    Some(token)
}

fn valid_key_name(path: &Path, prefix: &str) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    let Some(hash) = name
        .strip_prefix(prefix)
        .and_then(|name| name.strip_suffix(".key"))
    else {
        return false;
    };
    hash.len() == 64 && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[derive(Serialize)]
struct AuthFrame<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    token: &'a str,
}

#[derive(Serialize)]
struct PeerFrame<'a> {
    #[serde(rename = "msgV")]
    msg_v: u8,
    msg_id: &'a str,
    #[serde(rename = "type")]
    kind: &'static str,
    message: UserMessage<'a>,
    priority: &'static str,
    from: &'static str,
}

#[derive(Serialize)]
struct UserMessage<'a> {
    role: &'static str,
    content: &'a str,
}

fn build_peer_frame(msg: &Msg) -> Result<String> {
    let sender = xml_attribute(msg.from.as_str());
    let content = format!(
        "<cross-session-message from=\"{DAEMON_ORIGIN}\" from-name=\"{sender}\">\n[pij from {}] {}\n</cross-session-message>",
        msg.from, msg.body
    );
    serde_json::to_string(&PeerFrame {
        msg_v: 1,
        msg_id: &msg.msg_id,
        kind: "user",
        message: UserMessage {
            role: "user",
            content: &content,
        },
        priority: "next",
        from: DAEMON_ORIGIN,
    })
    .map_err(|error| PijError::Adapter {
        adapter: NAME.to_string(),
        message: format!("could not encode message {}: {error}", msg.msg_id),
    })
}

fn xml_attribute(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

async fn send_frame(
    endpoint: &Endpoint,
    frame: &str,
    msg: &Msg,
    connect_timeout: Duration,
    ack_wait: Duration,
) -> Result<DeliveryOutcome> {
    let Ok(Ok(mut stream)) =
        timeout(connect_timeout, UnixStream::connect(&endpoint.socket_path)).await
    else {
        return Ok(DeliveryOutcome::Queued);
    };

    let auth = serde_json::to_string(&AuthFrame {
        kind: "auth",
        token: &endpoint.token,
    })
    .map_err(|error| PijError::Adapter {
        adapter: NAME.to_string(),
        message: format!("could not encode peer authentication: {error}"),
    })?;
    let payload = format!("{auth}\n{frame}\n");
    if !matches!(
        timeout(connect_timeout, stream.write_all(payload.as_bytes())).await,
        Ok(Ok(()))
    ) {
        return Ok(DeliveryOutcome::Queued);
    }

    let deadline = Instant::now() + ack_wait;
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    loop {
        line.clear();
        match timeout_at(deadline, reader.read_line(&mut line)).await {
            Err(_) => {
                return Ok(DeliveryOutcome::Delivered {
                    origin: DeliveryOrigin::InjectedToTransport,
                });
            }
            Ok(Ok(0)) | Ok(Err(_)) => return Ok(DeliveryOutcome::Queued),
            Ok(Ok(_)) => match classify_status(&line, &msg.msg_id) {
                Status::Dropped => return Ok(DeliveryOutcome::Queued),
                Status::Held => {
                    return Ok(DeliveryOutcome::Held {
                        reason: "from-mode approval".to_string(),
                    });
                }
                Status::Unrelated => {}
                Status::Malformed => return Ok(DeliveryOutcome::Queued),
            },
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Status {
    Dropped,
    Held,
    Unrelated,
    Malformed,
}

fn classify_status(line: &str, msg_id: &str) -> Status {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return Status::Malformed;
    };
    if value.get("type").and_then(Value::as_str) != Some("peer_message_status") {
        return Status::Unrelated;
    }

    if value
        .get("dropped_msg_ids")
        .and_then(Value::as_array)
        .is_some_and(|ids| ids.iter().any(|id| id.as_str() == Some(msg_id)))
    {
        return Status::Dropped;
    }

    let original_matches = value.get("orig_msg_id").and_then(Value::as_str) == Some(msg_id);
    let held = match value.get("wereHeld") {
        Some(Value::Bool(held)) => *held && original_matches,
        Some(Value::Array(ids)) => ids.iter().any(|id| id.as_str() == Some(msg_id)),
        _ => false,
    };
    if held {
        Status::Held
    } else {
        Status::Unrelated
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Duration;

    use pij_core::model::{
        DeliveryOrigin, DeliveryOutcome, Harness, Msg, ProcIdentity, SeatDescriptor, SeatId,
    };
    use pij_core::ports::Transport;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::UnixListener;

    use super::{Status, UdsTransport, build_peer_frame, classify_status};

    static NEXT_DIR: AtomicU64 = AtomicU64::new(0);
    const HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            let id = NEXT_DIR.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!("pij-uds-{}-{id}", std::process::id()));
            fs::create_dir(&path).expect("create test directory");
            Self(path)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn fixture(name: &str) -> String {
        fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../testkit/fixtures/uds")
                .join(name),
        )
        .expect("read UDS fixture")
    }

    fn message(command: Option<&str>) -> Msg {
        Msg {
            from: SeatId::from("pij-sender"),
            to: SeatId::from("pij-recipient"),
            body: "first line\nsecond line".to_string(),
            msg_id: "msg-uds-001".to_string(),
            command: command.map(str::to_string),
        }
    }

    fn seat(pid: u32, pane: Option<&str>, harness: Harness) -> SeatDescriptor {
        let mut seat = SeatDescriptor::new("pij-recipient", harness, "/sanitized/worktree");
        seat.proc = Some(ProcIdentity { pid, proc_start: 1 });
        seat.pane = pane.map(str::to_string);
        seat
    }

    fn write_record(dir: &Path, pid: u32, pane: &str, socket: &Path) {
        fs::write(
            dir.join(format!("{pid}.json")),
            format!(
                "{{\"pid\":{pid},\"procStart\":\"Sat Aug 29 23:56:05 2026\",\"pidDomain\":\"darwin\",\"tmux\":\"sanitized:@1.{pane}\",\"messagingSocketPath\":{}}}\n",
                serde_json::to_string(&socket.to_string_lossy()).expect("encode socket path")
            ),
        )
        .expect("write session record");
        write_key(dir, pid, "Sat Aug 29 23:56:05 2026", "darwin");
    }

    fn write_key(dir: &Path, pid: u32, proc_start: &str, pid_domain: &str) {
        fs::write(
            dir.join(format!("{pid}.{HASH}.key")),
            format!(
                "{{\"peerToken\":\"sanitized-peer-token\",\"procStart\":{},\"pidDomain\":{}}}\n",
                serde_json::to_string(proc_start).expect("encode proc start"),
                serde_json::to_string(pid_domain).expect("encode pid domain")
            ),
        )
        .expect("write peer key");
    }

    fn transport(dir: &Path) -> UdsTransport {
        let mut transport = UdsTransport::from_sessions_dir(dir.to_path_buf());
        transport.ack_wait = Duration::from_millis(30);
        transport.connect_timeout = Duration::from_millis(200);
        transport
    }

    #[tokio::test]
    async fn discovery_is_pid_then_pane_suffix_then_absent() {
        let dir = TestDir::new();
        let nonexistent = dir.0.join("recorded.sock");
        write_record(&dir.0, 4242, "%99", &nonexistent);
        let transport = transport(&dir.0);
        let body = message(None);

        assert!(
            transport
                .can_deliver(&seat(4242, Some("%7"), Harness::Claude), &body)
                .await
                .expect("pid lookup")
        );
        assert!(
            transport
                .can_deliver(&seat(9000, Some("%99"), Harness::Claude), &body)
                .await
                .expect("pane fallback")
        );
        assert!(
            !transport
                .can_deliver(&seat(9000, Some("%100"), Harness::Claude), &body)
                .await
                .expect("both absent")
        );
    }

    #[test]
    fn recorded_2_1_251_registry_pair_resolves_without_probing_the_socket() {
        let dir = TestDir::new();
        fs::write(
            dir.0.join("4242.json"),
            fixture("claude-2.1.251-session.json"),
        )
        .expect("copy recorded session");
        fs::write(
            dir.0.join(format!("4242.{HASH}.key")),
            fixture(&format!("4242.{HASH}.key")),
        )
        .expect("copy recorded key");

        let endpoint = transport(&dir.0)
            .discover(&seat(9000, Some("%99"), Harness::Claude))
            .expect("pane fallback resolves recorded pair");
        assert_eq!(
            endpoint.socket_path,
            PathBuf::from("/tmp/cc-socks/4242.sock")
        );
        assert_eq!(endpoint.token, "sanitized-peer-token");
    }

    #[tokio::test]
    async fn command_and_every_non_claude_harness_refuse_the_socket() {
        let dir = TestDir::new();
        write_record(&dir.0, 4242, "%99", &dir.0.join("recorded.sock"));
        let transport = transport(&dir.0);

        assert!(
            !transport
                .can_deliver(
                    &seat(4242, Some("%99"), Harness::Claude),
                    &message(Some("compact")),
                )
                .await
                .expect("command predicate")
        );
        for harness in [Harness::Copilot, Harness::Codex, Harness::Pi, Harness::Omp] {
            assert!(
                !transport
                    .can_deliver(&seat(4242, Some("%99"), harness), &message(None))
                    .await
                    .expect("harness predicate"),
                "{harness} must not claim Claude's socket"
            );
        }
    }

    #[tokio::test]
    async fn authentication_is_required_and_bound_to_record_identity() {
        let dir = TestDir::new();
        let socket = dir.0.join("recorded.sock");
        write_record(&dir.0, 4242, "%99", &socket);
        let transport = transport(&dir.0);
        let target = seat(4242, Some("%99"), Harness::Claude);
        assert!(
            transport
                .can_deliver(&target, &message(None))
                .await
                .unwrap()
        );

        let duplicate = dir
            .0
            .join("4242.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.key");
        fs::copy(dir.0.join(format!("4242.{HASH}.key")), &duplicate).unwrap();
        assert!(
            transport.discover(&target).is_none(),
            "two identity-matching keys are ambiguous and must fail closed"
        );
        fs::remove_file(duplicate).unwrap();

        write_key(&dir.0, 4242, "different process", "darwin");
        assert!(
            !transport
                .can_deliver(&target, &message(None))
                .await
                .unwrap()
        );

        write_key(&dir.0, 4242, "Sat Aug 29 23:56:05 2026", "linux");
        assert!(
            !transport
                .can_deliver(&target, &message(None))
                .await
                .unwrap()
        );

        fs::write(dir.0.join(format!("4242.{HASH}.key")), b"not json").unwrap();
        assert!(
            !transport
                .can_deliver(&target, &message(None))
                .await
                .unwrap()
        );
        assert_eq!(
            transport.deliver(&target, &message(None)).await.unwrap(),
            DeliveryOutcome::Queued,
            "an unauthenticated write must never become delivered on a silent timer"
        );
    }

    #[test]
    fn recorded_frame_is_byte_exact_and_contains_no_invented_mode() {
        let actual = format!("{}\n", build_peer_frame(&message(None)).expect("frame"));
        assert_eq!(actual, fixture("user-frame.ndjson"));
        assert!(!actual.contains("from-mode"));

        let mut escaped = message(None);
        escaped.from = SeatId::from("a&b\"<c>");
        let escaped = build_peer_frame(&escaped).expect("escaped frame");
        assert!(escaped.contains("from-name=\\\"a&amp;b&quot;&lt;c&gt;\\\""));
    }

    #[test]
    fn status_decision_table_distinguishes_drop_hold_and_unrelated() {
        assert_eq!(
            classify_status(&fixture("status-dropped.ndjson"), "msg-uds-001"),
            Status::Dropped
        );
        assert_eq!(
            classify_status(&fixture("status-held.ndjson"), "msg-uds-001"),
            Status::Held
        );
        assert_eq!(
            classify_status(&fixture("status-held.ndjson"), "another-message"),
            Status::Unrelated
        );
        assert_eq!(
            classify_status("not json", "msg-uds-001"),
            Status::Malformed
        );
    }

    async fn socket_case(response: Option<&str>, close_early: bool) -> DeliveryOutcome {
        let dir = TestDir::new();
        let socket = dir.0.join("listener.sock");
        let listener = UnixListener::bind(&socket).expect("bind fixture socket");
        write_record(&dir.0, 4242, "%99", &socket);
        let transport = transport(&dir.0);
        let response = response.map(str::to_string);
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept transport");
            let mut reader = BufReader::new(stream);
            let mut received = String::new();
            reader.read_line(&mut received).await.expect("read auth");
            reader.read_line(&mut received).await.expect("read frame");
            if let Some(response) = response {
                let midpoint = response.len() / 2;
                reader
                    .get_mut()
                    .write_all(&response.as_bytes()[..midpoint])
                    .await
                    .expect("write first status fragment");
                tokio::task::yield_now().await;
                reader
                    .get_mut()
                    .write_all(&response.as_bytes()[midpoint..])
                    .await
                    .expect("write second status fragment");
            }
            if !close_early {
                tokio::time::sleep(Duration::from_millis(60)).await;
            }
            received
        });

        let outcome = transport
            .deliver(&seat(4242, Some("%99"), Harness::Claude), &message(None))
            .await
            .expect("delivery result");
        let received = server.await.expect("fixture server");
        let expected = format!(
            "{{\"type\":\"auth\",\"token\":\"sanitized-peer-token\"}}\n{}",
            fixture("user-frame.ndjson")
        );
        assert_eq!(received, expected);
        outcome
    }

    #[tokio::test]
    async fn timer_win_means_only_injected_to_transport() {
        assert_eq!(
            socket_case(None, false).await,
            DeliveryOutcome::Delivered {
                origin: DeliveryOrigin::InjectedToTransport
            }
        );
    }

    #[tokio::test]
    async fn correlated_drop_and_hold_statuses_override_the_timer() {
        assert_eq!(
            socket_case(Some(&fixture("status-dropped.ndjson")), false).await,
            DeliveryOutcome::Queued
        );
        assert_eq!(
            socket_case(Some(&fixture("status-held.ndjson")), false).await,
            DeliveryOutcome::Held {
                reason: "from-mode approval".to_string()
            }
        );
    }

    #[tokio::test]
    async fn losing_the_ack_channel_before_the_timer_cannot_confirm_delivery() {
        assert_eq!(socket_case(None, true).await, DeliveryOutcome::Queued);
    }
}
