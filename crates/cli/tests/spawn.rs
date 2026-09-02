use std::collections::{BTreeSet, VecDeque};
use std::future::Future;
use std::io::Write;
use std::pin::Pin;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

use pij_core::config::{AdapterChoice, Adapters, Config};
use pij_core::error::{PijError, Result};
use pij_core::model::{
    DeliveryOrigin, DeliveryOutcome, Envelope, Harness, Msg, ProcIdentity, Receipt, SeatDescriptor,
    SeatId, SemanticState, Seq,
};
use pij_core::ports::{Registry, Spine};
use pij_daemon::RpcPortAllocator;
use pij_daemon::events::EventBus;
use pij_daemon::http::{HttpConfig, router_with_config};
use pij_store::{SqliteRegistry, SqliteSpine};
use pij_testkit::fakes::{FakeLiveness, FakeTmux, FakeTransport};
use pij_testkit::fresh_dir;

fn run_cli(state_dir: &std::path::Path, addr: &str, args: &[&str]) -> std::process::Output {
    run_cli_with_env(state_dir, addr, args, std::iter::empty::<(&str, &str)>())
}

fn run_cli_with_env<K, V>(
    state_dir: &std::path::Path,
    addr: &str,
    args: &[&str],
    envs: impl IntoIterator<Item = (K, V)>,
) -> std::process::Output
where
    K: AsRef<std::ffi::OsStr>,
    V: AsRef<std::ffi::OsStr>,
{
    Command::new(env!("CARGO_BIN_EXE_pij-rs"))
        .args([
            "--state-dir",
            state_dir.to_str().expect("UTF-8 state dir"),
            "--addr",
            addr,
            "--json",
        ])
        .args(args)
        .env_remove("PIJ_SESSION_ID")
        .env_remove("TMUX_PANE")
        .envs(envs)
        .output()
        .expect("run shipped CLI")
}

fn run_cli_with_stdin(
    state_dir: &std::path::Path,
    addr: &str,
    args: &[&str],
    input: &str,
    envs: &[(&str, &str)],
) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_pij-rs"))
        .args([
            "--state-dir",
            state_dir.to_str().expect("UTF-8 state dir"),
            "--addr",
            addr,
            "--json",
        ])
        .args(args)
        .env_remove("PIJ_SESSION_ID")
        .env_remove("TMUX_PANE")
        .envs(envs.iter().copied())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn shipped CLI");
    child
        .stdin
        .take()
        .expect("stdin pipe")
        .write_all(input.as_bytes())
        .expect("write stdin");
    child.wait_with_output().expect("wait for shipped CLI")
}

fn launch_env(call: &str, key: &str) -> Option<String> {
    let marker = format!("\"{key}=");
    let value = call.split_once(&marker)?.1.split('"').next()?;
    (!value.is_empty()).then(|| value.to_string())
}
struct ScriptedRpcPorts {
    candidates: Mutex<VecDeque<u16>>,
    seen_unavailable: Mutex<Vec<BTreeSet<u16>>>,
}

impl ScriptedRpcPorts {
    fn new(candidates: impl IntoIterator<Item = u16>) -> Self {
        Self {
            candidates: Mutex::new(candidates.into_iter().collect()),
            seen_unavailable: Mutex::new(Vec::new()),
        }
    }

    fn seen_unavailable(&self) -> Vec<BTreeSet<u16>> {
        self.seen_unavailable
            .lock()
            .expect("port witness mutex")
            .clone()
    }
}

impl RpcPortAllocator for ScriptedRpcPorts {
    fn allocate<'a>(
        &'a self,
        unavailable: &'a BTreeSet<u16>,
    ) -> Pin<Box<dyn Future<Output = Result<u16>> + Send + 'a>> {
        Box::pin(async move {
            self.seen_unavailable
                .lock()
                .expect("port witness mutex")
                .push(unavailable.clone());
            let mut candidates = self.candidates.lock().expect("port candidate mutex");
            while let Some(candidate) = candidates.pop_front() {
                if !unavailable.contains(&candidate) {
                    return Ok(candidate);
                }
            }
            Err(PijError::Adapter {
                adapter: "test/rpc-port".to_string(),
                message: "scripted RPC ports exhausted".to_string(),
            })
        })
    }
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn shipped_spawn_revive_and_registration_transitions_replace_rpc_port_intent() {
    let dir = fresh_dir("pij-spawn-e2e");
    std::fs::write(dir.join("daemon.key"), "spawn-test-key").expect("write client key");
    let pool = pij_store::open(
        dir.join("pij.sqlite")
            .to_str()
            .expect("UTF-8 database path"),
    )
    .await
    .expect("open real store");
    let registry = Arc::new(SqliteRegistry::new(pool.clone()));
    let tmux = Arc::new(FakeTmux::new());
    let spine = Arc::new(SqliteSpine::new(pool));
    let rpc_ports = Arc::new(ScriptedRpcPorts::new([61_001, 61_003, 61_004]));
    let mut live_port = SeatDescriptor::new("pij-live-port", Harness::Copilot, "/abs/tree");
    live_port.rpc_port_intent = Some(61_001);
    registry
        .put(live_port)
        .await
        .expect("seed live port intent");
    let mut dead_port = SeatDescriptor::new("pij-dead-port", Harness::Copilot, "/abs/tree");
    dead_port.tombstoned_at = Some(1);
    dead_port.tombstone_reason = Some("old incarnation".to_string());
    dead_port.rpc_port_intent = Some(61_003);
    registry
        .put(dead_port)
        .await
        .expect("seed tombstoned port intent");
    let first_identity = ProcIdentity {
        pid: 4242,
        proc_start: 20260830112233,
    };
    let successor_identity = ProcIdentity {
        pid: 4343,
        proc_start: 20260830112234,
    };
    let mut services = pij_daemon::build_services(
        &Config::default(),
        std::path::Path::new("/tmp/pij-test-pane-signals"),
    )
    .await
    .expect("build services");
    services.registry = registry.clone();
    services.tmux = tmux.clone();
    services.spine = spine.clone();
    services.event_bus = Arc::new(EventBus::new(spine.clone(), 16).expect("event bus"));
    services.rpc_ports = rpc_ports.clone();
    services.liveness = Arc::new(
        FakeLiveness::new()
            .with_proc(first_identity)
            .with_proc(successor_identity),
    );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind server");
    let addr = listener.local_addr().expect("server address");
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            router_with_config(
                services,
                HttpConfig {
                    local_key: "spawn-test-key".to_string(),
                    peer_keys: Vec::new(),
                    machine_alias: "test-machine".to_string(),
                },
            ),
        )
        .await
        .expect("serve router");
    });
    let addr = addr.to_string();

    let spawn = |id: &str, harness: &str, flag: Option<&str>| {
        let mut args = vec![
            "spawn",
            "--id",
            id,
            "--harness",
            harness,
            "--bin",
            "/path with spaces/agent",
            "--model",
            "provider/model",
            "--effort",
            "high",
            "--cwd",
            "/abs/tree",
            "--session",
            "fleet",
        ];
        if let Some(flag) = flag {
            args.push(flag);
        }
        let output = run_cli(&dir, &addr, &args);
        assert!(
            output.status.success(),
            "spawn failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let envelope: Envelope<SeatDescriptor> =
            serde_json::from_slice(&output.stdout).expect("spawn JSON envelope");
        envelope.data.expect("spawn descriptor")
    };

    let closed = spawn("pij-e2e-closed", "claude", Some("--no-accept-inbound"));
    let accepted = spawn("pij-e2e-open", "claude", Some("--accept-inbound"));
    let defaulted = spawn("pij-e2e-default", "claude", None);
    assert_eq!(closed.cross_session_inbound_accept, Some(false));
    assert_eq!(accepted.cross_session_inbound_accept, Some(true));
    assert_eq!(
        defaulted.cross_session_inbound_accept,
        Some(true),
        "Claude seats accept inbound by default (Jordan's ruling, plan 116)"
    );
    assert_eq!(closed.rpc_port_intent, None);
    assert_eq!(accepted.rpc_port_intent, None);

    let first = spawn("pij-e2e-rpc", "copilot", None);
    assert_eq!(first.proc, None, "spawn writes a pre-bind row");
    let old_port = first
        .rpc_port_intent
        .expect("Copilot spawn stamps argv intent");
    let calls = tmux.calls();
    assert_eq!(
        old_port, 61_003,
        "allocator must skip another live seat's stamped port"
    );
    let allocation_view = rpc_ports.seen_unavailable();
    assert!(allocation_view[0].contains(&61_001));
    assert!(
        !allocation_view[0].contains(&61_003),
        "a tombstoned seat no longer reserves its old port"
    );
    assert_eq!(calls.len(), 4);
    assert!(!calls[0].contains("--ui-server"));
    assert!(calls[1].contains(r#"{\"crossSessionInbound\":\"accept\"}"#));
    assert!(
        calls[2].contains(r#"{\"crossSessionInbound\":\"accept\"}"#),
        "default-path claude spawn must emit the setting in argv, not just the descriptor stamp"
    );
    assert!(calls[3].contains(&format!("\"--ui-server\", \"--port\", \"{old_port}\"")));
    let mut postmortem = first.clone();
    postmortem.role = Some("reviewer".to_string());
    postmortem.semantic_state = Some(SemanticState::Done);
    registry
        .put(postmortem)
        .await
        .expect("stamp displaced post-mortem facts");

    let live_collision = run_cli(
        &dir,
        &addr,
        &[
            "spawn",
            "--id",
            "pij-e2e-rpc",
            "--harness",
            "copilot",
            "--cwd",
            "/abs/tree",
            "--session",
            "fleet",
        ],
    );
    assert!(
        !live_collision.status.success(),
        "a live id must still refuse"
    );
    assert_eq!(tmux.calls().len(), 4, "live collision launches nothing");

    registry
        .tombstone(&first.id, "test transition")
        .await
        .expect("tombstone first incarnation");
    assert_eq!(
        registry
            .get(&first.id)
            .await
            .expect("read tombstone")
            .expect("post-mortem row")
            .rpc_port_intent,
        None,
        "tombstone clearing is an observed act"
    );
    let recycled = std::net::TcpListener::bind(("127.0.0.1", old_port))
        .expect("old intent port is free for the recycled-owner witness");
    let revived = spawn("pij-e2e-rpc", "copilot", None);
    let fresh_port = revived.rpc_port_intent.expect("revive stamps fresh intent");
    assert_ne!(fresh_port, old_port, "revive must replace the old value");
    drop(recycled);
    assert_eq!(
        registry
            .get(&revived.id)
            .await
            .expect("later registry pass")
            .expect("revived row")
            .rpc_port_intent,
        Some(fresh_port),
        "nothing re-stamps the old value on a later pass"
    );
    let revive_event = spine
        .tail(Some(&first.id), Seq(0))
        .await
        .expect("read revive history")
        .into_iter()
        .find(|event| event.kind == "seat.revive-postmortem")
        .expect("revive must preserve the displaced post-mortem");
    let postmortem_payload: serde_json::Value =
        serde_json::from_str(&revive_event.payload).expect("post-mortem payload");
    assert_eq!(postmortem_payload["reason"], "test transition");
    assert_eq!(postmortem_payload["role"], "reviewer");
    assert_eq!(postmortem_payload["semantic_state"], "done");

    let register_same = |spawn_id: Option<&str>| {
        let mut args = vec![
            "register",
            "pij-e2e-rpc",
            "--harness",
            "copilot",
            "--folder",
            "/abs/tree",
            "--pane",
            "%42",
            "--pid",
            "4242",
            "--proc-start",
            "20260830112233",
        ];
        if let Some(spawn_id) = spawn_id {
            args.extend(["--spawn-id", spawn_id]);
        }
        run_cli(&dir, &addr, &args)
    };

    let revive_launch = tmux.calls().last().cloned().expect("revive launch call");
    let launched_spawn_id = launch_env(&revive_launch, "PIJ_SPAWN_ID");
    let first_bind = register_same(launched_spawn_id.as_deref());
    assert!(
        first_bind.status.success(),
        "matching first registration: {}",
        String::from_utf8_lossy(&first_bind.stderr)
    );
    let first_bind: Envelope<SeatDescriptor> =
        serde_json::from_slice(&first_bind.stdout).expect("first-bind envelope");
    assert_eq!(
        first_bind
            .data
            .expect("first-bind descriptor")
            .rpc_port_intent,
        Some(fresh_port),
        "the revived seat's matching first bind must preserve its fresh port intent"
    );
    assert!(
        launched_spawn_id.is_some(),
        "the shipped launcher must hand the correlator to the process that binds"
    );

    for pass in 1..=2 {
        let registered = register_same(None);
        assert!(
            registered.status.success(),
            "unmatched registration pass {pass}: {}",
            String::from_utf8_lossy(&registered.stderr)
        );
        let envelope: Envelope<SeatDescriptor> =
            serde_json::from_slice(&registered.stdout).expect("registration envelope");
        assert_eq!(
            envelope
                .data
                .expect("registered descriptor")
                .rpc_port_intent,
            Some(fresh_port),
            "the same live process must keep its listener intent on re-registration"
        );
    }
    assert_eq!(
        registry
            .get(&revived.id)
            .await
            .expect("read after repeated registration")
            .expect("registered row")
            .rpc_port_intent,
        Some(fresh_port),
        "re-registering the same live process must not free its active port"
    );

    let mut predecessor = SeatDescriptor::new("pij-e2e-predecessor", Harness::Copilot, "/abs/tree");
    predecessor.proc = Some(successor_identity);
    predecessor.rpc_port_intent = Some(60_001);
    registry
        .put(predecessor.clone())
        .await
        .expect("seed predecessor");
    let superseded = run_cli(
        &dir,
        &addr,
        &[
            "register",
            "pij-e2e-successor",
            "--supersedes",
            "pij-e2e-predecessor",
            "--harness",
            "copilot",
            "--folder",
            "/abs/tree",
            "--pane",
            "%43",
            "--pid",
            "4343",
            "--proc-start",
            "20260830112234",
        ],
    );
    assert!(
        superseded.status.success(),
        "supersedes registration: {}",
        String::from_utf8_lossy(&superseded.stderr)
    );
    let retired = registry
        .get(&predecessor.id)
        .await
        .expect("read predecessor")
        .expect("predecessor post-mortem");
    assert!(retired.tombstoned_at.is_some());
    assert_eq!(retired.rpc_port_intent, None);
    assert_eq!(
        registry
            .get(&SeatId::from("pij-e2e-successor"))
            .await
            .expect("read successor")
            .expect("successor row")
            .rpc_port_intent,
        None
    );

    server.abort();
    drop(dir);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn shipped_cli_registers_sends_reads_acks_and_does_not_read_twice() {
    let dir = fresh_dir("pij-inbox-e2e");
    std::fs::write(dir.join("daemon.key"), "inbox-test-key").expect("write client key");
    let config = Config {
        adapters: Adapters {
            registry: AdapterChoice::Real,
            spine: AdapterChoice::Real,
            queue: AdapterChoice::Real,
            ..Adapters::default()
        },
        store_path: dir.join("pij.sqlite").display().to_string(),
        ..Config::default()
    };
    let mut services =
        pij_daemon::build_services(&config, std::path::Path::new("/tmp/pij-test-pane-signals"))
            .await
            .expect("build real inbox services");
    services.liveness = Arc::new(
        FakeLiveness::new()
            .with_proc(ProcIdentity {
                pid: 4242,
                proc_start: 20260830112233,
            })
            .with_proc(ProcIdentity {
                pid: 4343,
                proc_start: 20260830112234,
            }),
    );
    services.transport = Arc::new(FakeTransport::unreachable());
    services.delivery = Arc::new(
        pij_daemon::delivery::DeliveryService::new(
            Arc::clone(&services.registry),
            Arc::clone(&services.queue),
            Arc::clone(&services.transport),
            // The politeness gate now sits on the DIRECT path too, so rebuilding
            // the service carries it — a rebuild that dropped it would test a
            // delivery service the daemon does not compose.
            Arc::new(pij_harnesses::InteractionGate::new(Arc::clone(
                &services.tmux,
            ))),
            Arc::clone(&services.event_bus),
        )
        .expect("rebuild delivery from pull-only transport"),
    );
    let spine = Arc::clone(&services.spine);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind server");
    let addr = listener.local_addr().expect("server address");
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            router_with_config(
                services,
                HttpConfig {
                    local_key: "inbox-test-key".to_string(),
                    peer_keys: Vec::new(),
                    machine_alias: "test-machine".to_string(),
                },
            ),
        )
        .await
        .expect("serve router");
    });
    let addr = addr.to_string();

    let registered = run_cli(
        &dir,
        &addr,
        &[
            "register",
            "pij-reader",
            "--harness",
            "omp",
            "--folder",
            "/abs/tree",
            "--pane",
            "%77",
            "--pid",
            "4242",
            "--proc-start",
            "20260830112233",
        ],
    );
    assert!(
        registered.status.success(),
        "register: {}",
        String::from_utf8_lossy(&registered.stdout)
    );

    let sender_registered = run_cli(
        &dir,
        &addr,
        &[
            "register",
            "pij-sender",
            "--harness",
            "omp",
            "--folder",
            "/abs/tree",
            "--pane",
            "%88",
            "--pid",
            "4343",
            "--proc-start",
            "20260830112234",
        ],
    );
    assert!(
        sender_registered.status.success(),
        "register sender: {}",
        String::from_utf8_lossy(&sender_registered.stdout)
    );

    let mismatched = run_cli_with_env(
        &dir,
        &addr,
        &[
            "send",
            "--from",
            "pij-reader",
            "--to",
            "pij-reader",
            "--body",
            "must not send",
        ],
        [("PIJ_SESSION_ID", "pij-sender")],
    );
    assert!(!mismatched.status.success());
    let mismatch: Envelope<serde_json::Value> =
        serde_json::from_slice(&mismatched.stdout).expect("mismatch refusal");
    let reason = mismatch.meta.expect("mismatch reason");
    assert!(reason.contains("pij-sender"), "{reason}");
    assert!(reason.contains("pij-reader"), "{reason}");

    let missing_body = run_cli_with_env(
        &dir,
        &addr,
        &["send", "--to", "pij-reader"],
        [("PIJ_SESSION_ID", "pij-sender")],
    );
    assert!(!missing_body.status.success());
    assert!(
        missing_body.stderr.is_empty(),
        "missing body must not print usage"
    );
    let missing_body: Envelope<serde_json::Value> =
        serde_json::from_slice(&missing_body.stdout).expect("missing-body refusal");
    let reason = missing_body.meta.expect("missing-body reason");
    assert!(reason.contains("--body"), "{reason}");
    assert!(reason.contains("--body-file"), "{reason}");

    let missing_identity = run_cli(&dir, &addr, &["send", "--to", "pij-reader", "--body", "x"]);
    assert!(!missing_identity.status.success());
    let missing_identity: Envelope<serde_json::Value> =
        serde_json::from_slice(&missing_identity.stdout).expect("missing-identity refusal");
    let reason = missing_identity.meta.expect("missing-identity reason");
    assert!(reason.contains("PIJ_SESSION_ID"), "{reason}");
    assert!(reason.contains("TMUX_PANE"), "{reason}");
    let contradictory_identity = run_cli_with_env(
        &dir,
        &addr,
        &["send", "--to", "pij-reader", "--body", "must not send"],
        [("PIJ_SESSION_ID", "pij-sender"), ("TMUX_PANE", "%77")],
    );
    assert!(
        !contradictory_identity.status.success(),
        "an asserted id must not outrank the observable pane"
    );
    let contradiction: Envelope<serde_json::Value> =
        serde_json::from_slice(&contradictory_identity.stdout).expect("identity refusal");
    let reason = contradiction.meta.expect("identity refusal reason");
    assert!(reason.contains("pij-sender"), "{reason}");
    assert!(reason.contains("pij-reader"), "{reason}");
    let contradictory_report = run_cli_with_env(
        &dir,
        &addr,
        &["report", "now", "did", "next"],
        [("PIJ_SESSION_ID", "pij-sender"), ("TMUX_PANE", "%77")],
    );
    assert!(
        !contradictory_report.status.success(),
        "report must share the same anti-impersonation ladder"
    );
    let contradiction: Envelope<serde_json::Value> =
        serde_json::from_slice(&contradictory_report.stdout).expect("report identity refusal");
    let reason = contradiction.meta.expect("report identity refusal reason");
    assert!(reason.contains("pij-sender"), "{reason}");
    assert!(reason.contains("pij-reader"), "{reason}");
    let contradictory_telegram = run_cli_with_env(
        &dir,
        &addr,
        &["sidecar", "telegram", "--body", "must not send"],
        [("PIJ_SESSION_ID", "pij-sender"), ("TMUX_PANE", "%77")],
    );
    assert!(
        !contradictory_telegram.status.success(),
        "Telegram replies must not bind to an asserted foreign seat"
    );
    assert!(
        contradictory_telegram.stderr.is_empty(),
        "identity refusal must not be replaced by a usage dump"
    );
    let contradiction: Envelope<serde_json::Value> =
        serde_json::from_slice(&contradictory_telegram.stdout).expect("Telegram identity refusal");
    let reason = contradiction
        .meta
        .expect("Telegram identity refusal reason");
    assert!(reason.contains("pij-sender"), "{reason}");
    assert!(reason.contains("pij-reader"), "{reason}");

    let sent = run_cli_with_env(
        &dir,
        &addr,
        &[
            "send",
            "--to",
            "pij-reader",
            "--body",
            "hello through the shipped binary",
        ],
        [("PIJ_SESSION_ID", "pij-sender")],
    );
    assert!(
        sent.status.success(),
        "send: {}",
        String::from_utf8_lossy(&sent.stdout)
    );
    let sent: Envelope<Receipt> = serde_json::from_slice(&sent.stdout).expect("send receipt");
    let receipt_meta = sent.meta.as_deref().expect("derived identity receipt");
    let minted_msg_id = sent.data.expect("receipt data").msg_id;
    assert!(receipt_meta.contains("pij-sender"), "{receipt_meta}");
    assert!(receipt_meta.contains(&minted_msg_id), "{receipt_meta}");
    assert_eq!(
        uuid::Uuid::parse_str(&minted_msg_id)
            .expect("UUIDv7")
            .get_version_num(),
        7
    );

    let refused = run_cli_with_env(
        &dir,
        &addr,
        &["inbox", "--seat", "pij-reader"],
        [("PIJ_SESSION_ID", "pij-sender")],
    );
    assert!(
        !refused.status.success(),
        "cross-seat destructive read must refuse"
    );
    let refusal: Envelope<serde_json::Value> =
        serde_json::from_slice(&refused.stdout).expect("named refusal");
    let reason = refusal.meta.expect("refusal reason");
    assert!(reason.contains("pij-sender"), "{reason}");
    assert!(reason.contains("pij-reader"), "{reason}");

    let peeked = run_cli(&dir, &addr, &["inbox", "--seat", "pij-reader", "--peek"]);
    assert!(
        peeked.status.success(),
        "peek: {}",
        String::from_utf8_lossy(&peeked.stdout)
    );
    let peeked: Envelope<Vec<Msg>> = serde_json::from_slice(&peeked.stdout).expect("peek JSON");
    assert_eq!(
        peeked.data.expect("peek data")[0].body,
        "hello through the shipped binary"
    );

    let read = run_cli_with_env(&dir, &addr, &["inbox"], [("TMUX_PANE", "%77")]);
    assert!(
        read.status.success(),
        "inbox: {}",
        String::from_utf8_lossy(&read.stdout)
    );
    let read: Envelope<Vec<Msg>> = serde_json::from_slice(&read.stdout).expect("inbox JSON");
    let messages = read.data.expect("inbox data");
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0].body, "hello through the shipped binary");

    let second = run_cli_with_env(&dir, &addr, &["inbox"], [("PIJ_SESSION_ID", "pij-reader")]);
    let second: Envelope<Vec<Msg>> =
        serde_json::from_slice(&second.stdout).expect("second inbox JSON");
    assert!(second.data.expect("second inbox data").is_empty());

    let duplicate = run_cli_with_env(
        &dir,
        &addr,
        &[
            "send",
            "--from",
            "pij-sender",
            "--to",
            "pij-reader",
            "--body",
            "hello through the shipped binary",
            "--msg-id",
            &minted_msg_id,
        ],
        [("PIJ_SESSION_ID", "pij-sender")],
    );
    let duplicate: Envelope<Receipt> =
        serde_json::from_slice(&duplicate.stdout).expect("duplicate receipt");
    assert_eq!(
        duplicate.data.expect("duplicate data").outcome,
        DeliveryOutcome::Delivered {
            origin: DeliveryOrigin::ReaderRead
        }
    );
    let audits = spine
        .tail(Some(&SeatId::from("pij-reader")), Seq(0))
        .await
        .expect("spine audit");
    assert!(audits.iter().any(|event| {
        event.kind == "delivery.inbox-ack"
            && event.payload.contains(r#""authenticated_machine":"local""#)
            && event.payload.contains(r#""evidence_grade":"machine""#)
    }));

    let file_body = "f".repeat(5 * 1024);
    let body_path = dir.join("body.txt");
    std::fs::write(&body_path, &file_body).expect("write body file");
    let file_sent = run_cli_with_env(
        &dir,
        &addr,
        &[
            "send",
            "--to",
            "pij-reader",
            "--body-file",
            body_path.to_str().expect("UTF-8 body path"),
        ],
        [("TMUX_PANE", "%88")],
    );
    assert!(
        file_sent.status.success(),
        "file send: {}",
        String::from_utf8_lossy(&file_sent.stdout)
    );
    let file_read = run_cli_with_env(&dir, &addr, &["inbox"], [("PIJ_SESSION_ID", "pij-reader")]);
    let file_read: Envelope<Vec<Msg>> =
        serde_json::from_slice(&file_read.stdout).expect("file read");
    assert_eq!(file_read.data.expect("file message")[0].body, file_body);

    let stdin_body = "--not-a-flag body with $(danger) and `backticks`";
    let stdin_sent = run_cli_with_stdin(
        &dir,
        &addr,
        &["send", "--to", "pij-reader", "--body-file", "-"],
        stdin_body,
        &[("PIJ_SESSION_ID", "pij-sender"), ("TMUX_PANE", "%88")],
    );

    assert!(
        stdin_sent.status.success(),
        "stdin send: {}",
        String::from_utf8_lossy(&stdin_sent.stdout)
    );
    let stdin_read = run_cli_with_env(&dir, &addr, &["inbox"], [("PIJ_SESSION_ID", "pij-reader")]);
    let stdin_read: Envelope<Vec<Msg>> =
        serde_json::from_slice(&stdin_read.stdout).expect("stdin read");
    assert_eq!(stdin_read.data.expect("stdin message")[0].body, stdin_body);

    server.abort();
    drop(dir);
}

/// The SHIPPED `pij-rs state <id>` reads back a seat the SHIPPED `pij-rs
/// register` wrote — through the real sqlite store, the real router, and the
/// real binary (plan 114, u-readback; ac-1142's readback half).
///
/// The in-crate HTTP tests prove the handler. This proves the parts nothing else
/// exercises: `Client::state`, the clap subcommand, and the fact that what the
/// registry actually persisted is what comes back — not what a fake was handed.
// MULTI-THREAD, like the two shipped-CLI tests above it. `run_cli` is a
// synchronous blocking `Command::output()`, so on the default current_thread
// runtime it blocks the only worker and `axum::serve` is never scheduled — the
// real binary then waits forever on a server that cannot answer. The bare
// `#[tokio::test]` here deadlocked rather than failed.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn shipped_cli_reads_one_seat_state_back_from_the_real_store() {
    let dir = fresh_dir("pij-state-e2e");
    std::fs::write(dir.join("daemon.key"), "state-test-key").expect("write client key");
    let config = Config {
        adapters: Adapters {
            registry: AdapterChoice::Real,
            spine: AdapterChoice::Real,
            queue: AdapterChoice::Real,
            ..Adapters::default()
        },
        store_path: dir.join("pij.sqlite").display().to_string(),
        ..Config::default()
    };
    let mut services =
        pij_daemon::build_services(&config, std::path::Path::new("/tmp/pij-test-pane-signals"))
            .await
            .expect("build real state services");
    services.liveness = Arc::new(FakeLiveness::new().with_proc(ProcIdentity {
        pid: 5150,
        proc_start: 20260901090000,
    }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind server");
    let addr = listener.local_addr().expect("server address");
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            router_with_config(
                services,
                HttpConfig {
                    local_key: "state-test-key".to_string(),
                    peer_keys: Vec::new(),
                    machine_alias: "test-machine".to_string(),
                },
            ),
        )
        .await
        .expect("serve router");
    });
    let addr = addr.to_string();

    let registered = run_cli(
        &dir,
        &addr,
        &[
            "register",
            "pij-readback",
            "--harness",
            "claude",
            "--folder",
            "/abs/tree",
            "--pid",
            "5150",
            "--proc-start",
            "20260901090000",
        ],
    );
    assert!(
        registered.status.success(),
        "register failed: {}",
        String::from_utf8_lossy(&registered.stderr)
    );

    let read = run_cli(&dir, &addr, &["state", "pij-readback"]);
    assert!(
        read.status.success(),
        "state failed: {}",
        String::from_utf8_lossy(&read.stderr)
    );
    let envelope: Envelope<serde_json::Value> =
        serde_json::from_slice(&read.stdout).expect("state envelope on stdout");
    assert!(envelope.ok, "state envelope not ok: {envelope:?}");
    let card = envelope.data.expect("state card");
    assert_eq!(card["id"], "pij-readback");
    assert_eq!(card["cwd"], "/abs/tree");
    assert_eq!(card["harness"], "claude");
    assert_eq!(card["pid"], 5150);
    assert_eq!(card["procStart"], 20260901090000u64);
    assert_eq!(card["liveness"], "active");
    assert_eq!(card["machine"], "test-machine");

    // A seat nobody registered is REFUSED, and the refusal carries an envelope —
    // never a bare 404, which wave 1's shim reads as route-absence and answers
    // from the other store.
    let missing = run_cli(&dir, &addr, &["state", "pij-never-registered"]);
    let refusal: Envelope<serde_json::Value> =
        serde_json::from_slice(&missing.stdout).expect("refusal envelope on stdout");
    assert!(!refusal.ok);
    assert_eq!(refusal.command, "pij state");

    server.abort();
}
