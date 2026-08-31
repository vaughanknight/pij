use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use async_trait::async_trait;
use pij_core::error::{PijError, Result};
use pij_core::model::{DeliveryOrigin, DeliveryOutcome, Harness, Msg, SeatDescriptor};
use pij_core::ports::Transport;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};
use tokio::time::{Instant, timeout, timeout_at};

const NAME: &str = "claude-uds";
const ACK_WAIT: Duration = Duration::from_millis(150);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
/// Prefix for the per-delivery reply socket. The name is arbitrary — measured
/// 2026-08-31: the CLI routes a hold receipt to ANY name inside its own socket
/// namespace, not only `<pid>.sock` — which is what lets every delivery own a
/// private reply address instead of the whole transport serialising on one.
const REPLY_PREFIX: &str = "pij-uds";
static REPLY_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Claude Code's Unix-domain-socket message transport.
///
/// Capability discovery reads Claude's session records on demand. Reading a
/// record is cheap and side-effect-free; connecting merely to discover whether a
/// socket exists remains forbidden.
///
/// Socket reachability is necessary but not sufficient. The descriptor must
/// carry `cross_session_inbound_accept: Some(true)`, stamped by the spawn path
/// only when it actually emitted Claude's explicit inbound-accept setting.
/// `None` and `Some(false)` remain closed before discovery or socket IO.
/// Human-typing politeness is a separate caller gate shared by direct delivery
/// and queued retries.
///
/// The `peer_message_status` drop/hold decoder is retained but UNPROVEN on this
/// daemon-origin connection shape. The done report records the current Claude
/// build re-verification; silence never upgrades the receipt beyond
/// `InjectedToTransport`.
///
/// # Composition recipe
///
/// In `crates/daemon/src/lib.rs`, import `pij_transport::UdsTransport`; construct
/// `AdapterChoice::Real` with `Arc::new(UdsTransport::new()?)`; pass that shared
/// `Arc<dyn Transport>` to both `DeliveryService` and `DrainWorker`. Construct one
/// shared `InteractionGate` before `DeliveryService`, pass it to both consumers,
/// and feed it from `PaneObserver`. No task starts in this adapter; shutdown is
/// unchanged.
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

    /// Use an explicit Claude session registry directory.
    ///
    /// The daemon uses [`Self::new`]; composition tests use this constructor to
    /// exercise the real adapter without reading or mutating the user's registry.
    #[must_use]
    pub fn from_sessions_dir(sessions_dir: PathBuf) -> Self {
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
        if seat.harness != Harness::Claude
            || msg.command.is_some()
            || seat.cross_session_inbound_accept != Some(true)
        {
            return Ok(false);
        }
        Ok(self.discover(seat).is_some())
    }

    async fn deliver(&self, seat: &SeatDescriptor, msg: &Msg) -> Result<DeliveryOutcome> {
        if seat.harness != Harness::Claude
            || msg.command.is_some()
            || seat.cross_session_inbound_accept != Some(true)
        {
            return Ok(DeliveryOutcome::Queued);
        }
        let Some(endpoint) = self.discover(seat) else {
            return Ok(DeliveryOutcome::Queued);
        };
        // The receiver delivers `peer_message_status` by connecting BACK to the
        // address we advertise in `from=`. The previous literal `uds:pij-daemon`
        // is not an address, so the CLI logged "hold-receipt skipped: reply
        // address unshaped or outside our socket namespace" and sent nothing —
        // every held message then timed out into Delivered. Bind a real listener
        // and name it.
        let Some(inbox) = ReplyInbox::bind(&endpoint.socket_path) else {
            // No reply address means no way to observe Held. Refusing to send is
            // the honest outcome: delivering blind would resurrect the very
            // defect this unit exists to remove.
            return Ok(DeliveryOutcome::Queued);
        };
        let frame = build_peer_frame(msg, &inbox.origin())?;
        send_frame(
            &endpoint,
            &frame,
            msg,
            self.connect_timeout,
            self.ack_wait,
            &inbox,
        )
        .await
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
    from: &'a str,
}

#[derive(Serialize)]
struct UserMessage<'a> {
    role: &'static str,
    content: &'a str,
}

fn build_peer_frame(msg: &Msg, origin: &str) -> Result<String> {
    let sender = xml_attribute(msg.from.as_str());
    let from = xml_attribute(origin);
    let content = format!(
        "<cross-session-message from=\"{from}\" from-name=\"{sender}\">\n[pij from {}] {}\n</cross-session-message>",
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
        from: origin,
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

/// A reply address the receiving CLI can actually reach.
///
/// One per delivery, named uniquely inside the recipient's own socket
/// namespace. That is what makes positional correlation SOUND rather than a
/// guess: the status frames carry no correlation id of any kind — no
/// `orig_msg_id`, no `dropped_msg_ids`, and a denial cannot even be paired with
/// its own hold — so the only way to know which message a status describes is
/// for the channel to carry exactly one. A private address per delivery gives
/// that without serialising the transport across seats.
struct ReplyInbox {
    path: PathBuf,
    listener: UnixListener,
}

impl ReplyInbox {
    /// Bind beside the recipient's own socket. `None` when the namespace is
    /// unusable — the caller must then refuse to send rather than deliver blind.
    fn bind(recipient_socket: &Path) -> Option<Self> {
        let dir = recipient_socket.parent()?;
        let unique = REPLY_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = dir.join(format!(
            "{REPLY_PREFIX}-{}-{unique}.sock",
            std::process::id()
        ));
        let _ = fs::remove_file(&path);
        let listener = UnixListener::bind(&path).ok()?;
        Some(Self { path, listener })
    }

    fn origin(&self) -> String {
        format!("uds:{}", self.path.display())
    }

    /// Read status lines until the deadline. One message is in flight on this
    /// address, so the first status line that classifies IS this message's.
    async fn wait_for_status(&self, msg_id: &str, deadline: Instant) -> Option<Status> {
        let (stream, _) = timeout_at(deadline, self.listener.accept())
            .await
            .ok()?
            .ok()?;
        let mut reader = BufReader::new(stream);
        let mut line = String::new();
        loop {
            line.clear();
            match timeout_at(deadline, reader.read_line(&mut line)).await {
                Err(_) | Ok(Ok(0)) | Ok(Err(_)) => return None,
                Ok(Ok(_)) => match classify_status(&line, msg_id) {
                    Status::Unrelated | Status::Malformed => {}
                    decided => return Some(decided),
                },
            }
        }
    }
}

impl Drop for ReplyInbox {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

async fn send_frame(
    endpoint: &Endpoint,
    frame: &str,
    msg: &Msg,
    connect_timeout: Duration,
    ack_wait: Duration,
    inbox: &ReplyInbox,
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
    // Measured: every status line arrived on the REPLY address, none on this
    // connection. Both are read anyway — the connection still reports a hangup,
    // which must never be mistaken for delivery.
    let status = tokio::select! {
        status = inbox.wait_for_status(&msg.msg_id, deadline) => status,
        outcome = same_connection_outcome(stream, msg, deadline) => match outcome {
            SameConnection::Status(status) => Some(status),
            SameConnection::Hangup => return Ok(DeliveryOutcome::Queued),
            SameConnection::Quiet => None,
        },
    };

    Ok(match status {
        Some(Status::Dropped | Status::Malformed) => DeliveryOutcome::Queued,
        Some(Status::Held) => DeliveryOutcome::Held {
            reason: "recipient approval pending".to_string(),
        },
        Some(Status::Denied) => DeliveryOutcome::Refused {
            reason: "the recipient declined the message".to_string(),
        },
        // Silence is never upgraded. The frame reached the socket; nothing in
        // this path can observe a turn, and nothing here may claim one.
        Some(Status::Unrelated) | None => DeliveryOutcome::Delivered {
            origin: DeliveryOrigin::InjectedToTransport,
        },
    })
}

enum SameConnection {
    Status(Status),
    Hangup,
    Quiet,
}

async fn same_connection_outcome(
    stream: UnixStream,
    msg: &Msg,
    deadline: Instant,
) -> SameConnection {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    loop {
        line.clear();
        match timeout_at(deadline, reader.read_line(&mut line)).await {
            Err(_) => return SameConnection::Quiet,
            Ok(Ok(0)) | Ok(Err(_)) => return SameConnection::Hangup,
            Ok(Ok(_)) => match classify_status(&line, &msg.msg_id) {
                Status::Unrelated | Status::Malformed => {}
                decided => return SameConnection::Status(decided),
            },
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Status {
    Dropped,
    Held,
    /// The recipient actively refused. Terminal in the CLI's own words: "it was
    /// not delivered to their Claude session."
    Denied,
    Unrelated,
    Malformed,
}

fn classify_status(line: &str, msg_id: &str) -> Status {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return Status::Malformed;
    };
    let kind = value.get("type").and_then(Value::as_str);
    let action = value.get("action").and_then(Value::as_str);
    // MEASURED wire shape, five arms on Claude 2.1.250/2.1.251, 2026-08-31:
    // `{"type":"control","action":"peer_message_status","status":"held"|"denied",...}`.
    // The bare `type=="peer_message_status"` documented in fork issue #311 was
    // never emitted once. Matching only that form is the SECOND independent
    // reason Held was unreachable — fixing the reply address alone would not
    // have surfaced it. The bare form is still accepted: it costs nothing and a
    // future build may adopt it.
    let is_status = kind == Some("peer_message_status")
        || (kind == Some("control") && action == Some("peer_message_status"));
    if !is_status {
        return Status::Unrelated;
    }

    if value
        .get("dropped_msg_ids")
        .and_then(Value::as_array)
        .is_some_and(|ids| ids.iter().any(|id| id.as_str() == Some(msg_id)))
    {
        return Status::Dropped;
    }

    // POSITIONAL, and it has to be: the measured frames carry their OWN fresh
    // uuid and no correlation id back to the message they describe. The reply
    // address is private to one delivery, which is what makes this sound.
    match value.get("status").and_then(Value::as_str) {
        Some("held") => return Status::Held,
        Some("denied" | "expired") => return Status::Denied,
        _ => {}
    }

    // The id-correlated form, kept for the shape the fork documented.
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
    use tokio::net::{UnixListener, UnixStream};

    use serde_json::Value;

    use super::{
        REPLY_PREFIX, ReplyInbox, Status, UdsTransport, build_peer_frame, classify_status,
    };

    static NEXT_DIR: AtomicU64 = AtomicU64::new(0);
    const FIXTURE_ORIGIN: &str = "uds:/tmp/cc-socks/pij-uds-fixture.sock";
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
            from_machine: None,
            in_reply_to: None,
            command: command.map(str::to_string),
        }
    }

    fn seat(pid: u32, pane: Option<&str>, harness: Harness) -> SeatDescriptor {
        let mut seat = SeatDescriptor::new("pij-recipient", harness, "/sanitized/worktree");
        seat.proc = Some(ProcIdentity { pid, proc_start: 1 });
        seat.pane = pane.map(str::to_string);
        seat.cross_session_inbound_accept = Some(true);
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
    async fn unknown_or_refused_inbound_acceptance_is_closed_before_any_socket_write() {
        let dir = TestDir::new();
        let socket = dir.0.join("must-not-connect.sock");
        let listener = UnixListener::bind(&socket).expect("bind no-connect witness");
        write_record(&dir.0, 4242, "%99", &socket);
        let transport = transport(&dir.0);
        let mut target = seat(4242, Some("%99"), Harness::Claude);

        for stamp in [None, Some(false)] {
            target.cross_session_inbound_accept = stamp;
            assert!(
                !transport
                    .can_deliver(&target, &message(None))
                    .await
                    .unwrap()
            );
            assert_eq!(
                transport.deliver(&target, &message(None)).await.unwrap(),
                DeliveryOutcome::Queued
            );
        }
        assert!(
            tokio::time::timeout(Duration::from_millis(20), listener.accept())
                .await
                .is_err(),
            "a closed capability must not probe or write the socket"
        );
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
        let actual = format!(
            "{}\n",
            build_peer_frame(&message(None), FIXTURE_ORIGIN).expect("frame")
        );
        assert_eq!(actual, fixture("user-frame.ndjson"));
        assert!(!actual.contains("from-mode"));

        let mut escaped = message(None);
        escaped.from = SeatId::from("a&b\"<c>");
        let escaped = build_peer_frame(&escaped, FIXTURE_ORIGIN).expect("escaped frame");
        assert!(escaped.contains("from-name=\\\"a&amp;b&quot;&lt;c&gt;\\\""));
    }

    #[test]
    fn status_decision_table_reads_the_recorded_wire_shape() {
        // Recordings, not constructions — see the fixtures README.
        assert_eq!(
            classify_status(&fixture("status-held.ndjson"), "msg-uds-001"),
            Status::Held
        );
        assert_eq!(
            classify_status(&fixture("status-denied.ndjson"), "msg-uds-001"),
            Status::Denied
        );
        // A denial asked about ANY message id gives the same answer, for the same
        // reason a hold does: the channel correlates, not the payload.
        assert_eq!(
            classify_status(
                &fixture("status-denied.ndjson"),
                "a-completely-different-id"
            ),
            Status::Denied
        );
        // The recorded frames carry NO id tying them to our message, so the
        // decoder must NOT consult one: asking about a different message id has
        // to give the same answer, because the channel — not the payload — is
        // what correlates.
        assert_eq!(
            classify_status(&fixture("status-held.ndjson"), "a-completely-different-id"),
            Status::Held
        );
        assert_eq!(
            classify_status(&fixture("status-dropped.ndjson"), "msg-uds-001"),
            Status::Dropped
        );
        assert_eq!(
            classify_status("not json", "msg-uds-001"),
            Status::Malformed
        );
        // An unrelated control frame must never be read as a verdict.
        assert_eq!(
            classify_status(
                r#"{"type":"control","action":"peer_idle_notice","from":"uds:/tmp/x.sock"}"#,
                "msg-uds-001"
            ),
            Status::Unrelated
        );
    }

    /// The decoder that shipped required `type=="peer_message_status"`. Across
    /// five measured arms the CLI never emitted that; it emits `type=="control"`
    /// with `action=="peer_message_status"`. This pins the discrimination so a
    /// revert to the bare-only matcher fails here rather than silently making
    /// `Held` unreachable again.
    #[test]
    fn the_control_shape_is_what_the_live_cli_actually_emits() {
        let recorded = fixture("status-held.ndjson");
        let parsed: Value = serde_json::from_str(&recorded).expect("recorded status is json");
        assert_eq!(parsed.get("type").and_then(Value::as_str), Some("control"));
        assert_eq!(
            parsed.get("action").and_then(Value::as_str),
            Some("peer_message_status")
        );
        assert!(
            parsed.get("orig_msg_id").is_none() && parsed.get("wereHeld").is_none(),
            "the recorded frame must carry no correlation id — that is why correlation is positional"
        );
    }

    /// Where the fake server sends its status line.
    #[derive(Clone, Copy, PartialEq)]
    enum Reply {
        /// Connect back to the address the frame advertised — what the real CLI does.
        ToAdvertisedAddress,
        /// Answer on the delivery connection instead.
        OnTheSameConnection,
        /// Never answer. This is what an UNROUTABLE `from=` looks like from here,
        /// and it is the pre-fix behaviour the whole unit exists to remove.
        Never,
    }

    struct Exchange {
        outcome: DeliveryOutcome,
        received: String,
    }

    async fn socket_case(response: Option<&str>, close_early: bool, reply: Reply) -> Exchange {
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
            let mut frame = String::new();
            reader.read_line(&mut frame).await.expect("read frame");
            received.push_str(&frame);

            if let Some(response) = response {
                match reply {
                    Reply::Never => {}
                    Reply::OnTheSameConnection => {
                        write_halved(reader.get_mut(), &response).await;
                    }
                    Reply::ToAdvertisedAddress => {
                        let parsed: Value =
                            serde_json::from_str(frame.trim()).expect("frame is json");
                        let advertised = parsed
                            .get("from")
                            .and_then(Value::as_str)
                            .expect("frame advertises a reply address")
                            .strip_prefix("uds:")
                            .expect("reply address is a uds: address")
                            .to_string();
                        let mut back = UnixStream::connect(&advertised)
                            .await
                            .expect("the advertised reply address must be reachable");
                        write_halved(&mut back, &response).await;
                        tokio::time::sleep(Duration::from_millis(60)).await;
                    }
                }
            }
            if !close_early {
                tokio::time::sleep(Duration::from_millis(60)).await;
            }
            received
        });

        let target = seat(4242, Some("%99"), Harness::Claude);
        let outcome = transport
            .deliver(&target, &message(None))
            .await
            .expect("delivery result");
        let received = tokio::time::timeout(Duration::from_millis(800), server)
            .await
            .expect("fixture socket must be reached")
            .expect("fixture server");
        Exchange { outcome, received }
    }

    /// Split every write so a status line that arrives in two chunks is still read
    /// as one line — the real socket does not promise message boundaries.
    async fn write_halved(stream: &mut UnixStream, response: &str) {
        let midpoint = response.len() / 2;
        stream
            .write_all(&response.as_bytes()[..midpoint])
            .await
            .expect("write first status fragment");
        tokio::task::yield_now().await;
        stream
            .write_all(&response.as_bytes()[midpoint..])
            .await
            .expect("write second status fragment");
    }

    #[tokio::test]
    async fn silence_is_never_upgraded_past_injected_to_transport() {
        assert_eq!(
            socket_case(None, false, Reply::Never).await.outcome,
            DeliveryOutcome::Delivered {
                origin: DeliveryOrigin::InjectedToTransport
            }
        );
    }

    #[tokio::test]
    async fn a_held_status_on_the_advertised_address_is_observed_as_held() {
        assert_eq!(
            socket_case(
                Some(&fixture("status-held.ndjson")),
                false,
                Reply::ToAdvertisedAddress
            )
            .await
            .outcome,
            DeliveryOutcome::Held {
                reason: "recipient approval pending".to_string()
            }
        );
    }

    #[tokio::test]
    async fn a_denial_is_terminal_refusal_not_a_pending_hold() {
        assert_eq!(
            socket_case(
                Some(&fixture("status-denied.ndjson")),
                false,
                Reply::ToAdvertisedAddress
            )
            .await
            .outcome,
            DeliveryOutcome::Refused {
                reason: "the recipient declined the message".to_string()
            }
        );
    }

    /// THE GUARD FOR THE WHOLE UNIT. A status the recipient tried to send but
    /// could not route — exactly what an unroutable `from=` produces — must not
    /// become Delivered by default. If the reply address ever stops being
    /// load-bearing, this is the test that notices.
    #[tokio::test]
    async fn a_status_that_never_reaches_us_is_the_pre_fix_defect_and_stays_unclaimed() {
        let held = fixture("status-held.ndjson");
        let unreachable = socket_case(Some(&held), false, Reply::Never).await;
        assert_eq!(
            unreachable.outcome,
            DeliveryOutcome::Delivered {
                origin: DeliveryOrigin::InjectedToTransport
            },
            "an unheard hold receipt is the defect; it must never be an upgrade"
        );
        let reachable = socket_case(Some(&held), false, Reply::ToAdvertisedAddress).await;
        assert_ne!(
            unreachable.outcome, reachable.outcome,
            "routable and unroutable must be DIFFERENT observable outcomes, or the address proves nothing"
        );
    }

    #[tokio::test]
    async fn a_status_arriving_on_the_delivery_connection_is_still_honoured() {
        assert_eq!(
            socket_case(
                Some(&fixture("status-held.ndjson")),
                false,
                Reply::OnTheSameConnection
            )
            .await
            .outcome,
            DeliveryOutcome::Held {
                reason: "recipient approval pending".to_string()
            }
        );
    }

    #[tokio::test]
    async fn losing_the_ack_channel_before_the_timer_cannot_confirm_delivery() {
        assert_eq!(
            socket_case(None, true, Reply::Never).await.outcome,
            DeliveryOutcome::Queued
        );
    }

    /// CONCURRENCY IS REFUSED, NOT RESOLVED. The status frames carry no
    /// correlation id, so a second message on one connection could never be told
    /// apart from the first. The transport therefore writes exactly one frame per
    /// connection and gives it a private reply address. This asserts the wire, so
    /// a future batching "optimisation" fails here instead of silently minting a
    /// verdict for the wrong message.
    #[tokio::test]
    async fn exactly_one_message_is_ever_in_flight_on_one_connection() {
        let exchange = socket_case(None, false, Reply::Never).await;
        let lines: Vec<&str> = exchange.received.lines().collect();
        assert_eq!(
            lines.len(),
            2,
            "expected exactly an auth line and ONE frame, got: {lines:?}"
        );
        let auth: Value = serde_json::from_str(lines[0]).expect("auth line is json");
        assert_eq!(auth.get("type").and_then(Value::as_str), Some("auth"));
        let frame: Value = serde_json::from_str(lines[1]).expect("frame is json");
        assert_eq!(frame.get("type").and_then(Value::as_str), Some("user"));
        let advertised = frame
            .get("from")
            .and_then(Value::as_str)
            .expect("frame advertises a reply address");
        assert!(
            advertised.starts_with("uds:/") && advertised.contains(REPLY_PREFIX),
            "from= must be a routable path in the recipient's namespace, got {advertised}"
        );
    }

    /// Two deliveries at once must NOT share a reply address, or the first status
    /// to arrive would be attributed to whichever message asked first.
    #[tokio::test]
    async fn concurrent_deliveries_do_not_share_a_reply_address() {
        let dir = TestDir::new();
        let first = ReplyInbox::bind(&dir.0.join("listener.sock")).expect("first inbox");
        let second = ReplyInbox::bind(&dir.0.join("listener.sock")).expect("second inbox");
        assert_ne!(first.origin(), second.origin());
    }

    #[tokio::test]
    async fn the_reply_socket_is_removed_when_the_delivery_ends() {
        let dir = TestDir::new();
        let path = {
            let inbox = ReplyInbox::bind(&dir.0.join("listener.sock")).expect("inbox");
            inbox.path.clone()
        };
        assert!(
            !path.exists(),
            "a reply socket must not outlive its delivery"
        );
    }
}
