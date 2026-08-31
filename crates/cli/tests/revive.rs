use std::process::Command;
use std::sync::Arc;

use pij_core::config::Config;
use pij_core::model::{Envelope, ErrorKind, Harness, ProcIdentity, SeatDescriptor, SeatId};
use pij_core::ports::Registry;
use pij_daemon::http::{HttpConfig, router_with_config};
use pij_store::SqliteRegistry;
use pij_testkit::fakes::{FakeLiveness, FakeTmux};
use pij_testkit::fresh_dir;

fn run_cli(state_dir: &std::path::Path, addr: &str, args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_pij-rs"))
        .args([
            "--state-dir",
            state_dir.to_str().expect("UTF-8 state dir"),
            "--addr",
            addr,
            "--json",
        ])
        .args(args)
        .output()
        .expect("run shipped CLI")
}

fn launched_environment(call: &str) -> Vec<String> {
    let (_, args) = call
        .split_once(":env:")
        .expect("fake tmux must record the env launcher and argv");
    serde_json::from_str(args).expect("recorded discrete argv must remain parseable")
}

fn required_environment_value(args: &[String], name: &str) -> String {
    let prefix = format!("{name}=");
    args.iter()
        .find_map(|arg| arg.strip_prefix(&prefix))
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| panic!("launched process was not given {name}"))
}

async fn serve(
    key: &str,
    registry: Arc<SqliteRegistry>,
    tmux: Arc<FakeTmux>,
    live_procs: Vec<ProcIdentity>,
) -> (std::net::SocketAddr, tokio::task::JoinHandle<()>) {
    let mut services = pij_daemon::build_services(
        &Config::default(),
        std::path::Path::new("/tmp/pij-test-pane-signals"),
    )
    .await
    .expect("build services");
    services.registry = registry;
    services.tmux = tmux;
    let mut liveness = FakeLiveness::new();
    for identity in live_procs {
        liveness = liveness.with_proc(identity);
    }
    services.liveness = Arc::new(liveness);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind server");
    let addr = listener.local_addr().expect("server address");
    let key = key.to_string();
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            router_with_config(
                services,
                HttpConfig {
                    local_key: key,
                    peer_keys: Vec::new(),
                    machine_alias: "test-machine".to_string(),
                },
            ),
        )
        .await
        .expect("serve router");
    });
    (addr, server)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn shipped_revive_refuses_absent_and_live_ids_without_launching() {
    let dir = fresh_dir("pij-revive-refusal");
    std::fs::write(dir.join("daemon.key"), "revive-test-key").expect("write client key");
    let pool = pij_store::open(
        dir.join("pij.sqlite")
            .to_str()
            .expect("UTF-8 database path"),
    )
    .await
    .expect("open real store");
    let registry = Arc::new(SqliteRegistry::new(pool));
    let tmux = Arc::new(FakeTmux::new());
    let (addr, server) = serve(
        "revive-test-key",
        registry.clone(),
        tmux.clone(),
        Vec::new(),
    )
    .await;
    let addr = addr.to_string();

    let absent = run_cli(
        &dir,
        &addr,
        &["revive", "pij-never-existed", "--session", "fleet"],
    );
    assert!(!absent.status.success(), "an absent id cannot be revived");
    let absent: Envelope<SeatDescriptor> =
        serde_json::from_slice(&absent.stdout).expect("absent JSON envelope");
    assert_eq!(absent.command, "pij revive");
    assert_eq!(absent.error, Some(ErrorKind::NotFound));
    let absent_reason = absent.meta.expect("absent refusal reason");
    assert!(absent_reason.contains("pij-never-existed"));
    assert!(absent_reason.contains("does not exist"));

    registry
        .put(SeatDescriptor::new(
            SeatId::from("pij-still-live"),
            Harness::Copilot,
            "/abs/live",
        ))
        .await
        .expect("seed live row");
    let live = run_cli(
        &dir,
        &addr,
        &["revive", "pij-still-live", "--session", "fleet"],
    );
    assert!(!live.status.success(), "a live id cannot be revived");
    let live: Envelope<SeatDescriptor> =
        serde_json::from_slice(&live.stdout).expect("live JSON envelope");
    assert_eq!(live.command, "pij revive");
    assert_eq!(live.error, Some(ErrorKind::Refused));
    let live_reason = live.meta.expect("live refusal reason");
    assert!(live_reason.contains("pij-still-live"));
    assert!(live_reason.contains("live"));
    assert!(live_reason.contains("only accepts tombstoned ids"));
    assert!(tmux.calls().is_empty(), "refusals must not launch a pane");

    server.abort();
    drop(dir);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn shipped_revive_derives_identity_and_launches_one_prebind_incarnation() {
    let dir = fresh_dir("pij-revive-transition");
    std::fs::write(dir.join("daemon.key"), "revive-test-key").expect("write client key");
    let pool = pij_store::open(
        dir.join("pij.sqlite")
            .to_str()
            .expect("UTF-8 database path"),
    )
    .await
    .expect("open real store");
    let registry = Arc::new(SqliteRegistry::new(pool));
    let tmux = Arc::new(FakeTmux::new());

    let mut old = SeatDescriptor::new(
        SeatId::from("pij-returning-seat"),
        Harness::Copilot,
        "/abs/prior-folder",
    );
    old.model = Some("provider/prior-model".to_string());
    old.effort = Some("high".to_string());
    old.parent = Some(SeatId::from("pij-parent"));
    old.cross_session_inbound_accept = Some(false);
    old.pane = Some("%old".to_string());
    old.proc = Some(ProcIdentity {
        pid: 4242,
        proc_start: 20260831030000,
    });
    old.tombstoned_at = Some(20260831030100);
    old.tombstone_reason = Some("prior process exited".to_string());
    old.rpc_port_intent = Some(47_777);
    registry.put(old).await.expect("seed tombstoned row");

    let registered_proc = ProcIdentity {
        pid: 4343,
        proc_start: 20260831030200,
    };
    let restarted_proc = ProcIdentity {
        pid: 4444,
        proc_start: 20260831030300,
    };
    let (addr, server) = serve(
        "revive-test-key",
        registry.clone(),
        tmux.clone(),
        vec![registered_proc, restarted_proc],
    )
    .await;
    let output = run_cli(
        &dir,
        &addr.to_string(),
        &[
            "revive",
            "pij-returning-seat",
            "--session",
            "fleet",
            "--name",
            "returned",
        ],
    );
    assert!(
        output.status.success(),
        "revive failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let response: Envelope<SeatDescriptor> =
        serde_json::from_slice(&output.stdout).expect("revive JSON envelope");
    assert_eq!(response.command, "pij revive");
    let returned = response.data.expect("revived descriptor");
    let persisted = registry
        .get(&SeatId::from("pij-returning-seat"))
        .await
        .expect("read revived row")
        .expect("revived row exists");
    assert_eq!(returned, persisted, "response must report persisted state");
    assert_eq!(persisted.harness, Harness::Copilot);
    assert_eq!(persisted.folder, "/abs/prior-folder");
    assert_eq!(persisted.model.as_deref(), Some("provider/prior-model"));
    assert_eq!(persisted.effort.as_deref(), Some("high"));
    assert_eq!(persisted.parent, Some(SeatId::from("pij-parent")));
    assert_eq!(
        persisted.proc, None,
        "revive creates a pre-bind incarnation"
    );
    assert_eq!(persisted.tombstoned_at, None);
    assert_eq!(persisted.tombstone_reason, None);
    let fresh_port = persisted
        .rpc_port_intent
        .expect("Copilot revive must stamp fresh RPC launch intent");
    assert_ne!(fresh_port, 0);
    assert_ne!(fresh_port, 47_777, "revive must replace the old port");
    let fresh_spawn_id = persisted
        .spawn_id
        .clone()
        .expect("revive must mint a fresh spawn id");

    let calls = tmux.calls();
    assert_eq!(calls.len(), 1, "one revive must launch exactly one pane");
    assert!(
        calls[0].starts_with("new_window:fleet:returned:env:"),
        "unexpected launch record: {}",
        calls[0]
    );
    assert!(calls[0].contains("copilot"));
    assert!(calls[0].contains("--ui-server"));
    assert!(calls[0].contains("--port"));
    let launched_args = launched_environment(&calls[0]);
    let launched_seat_id = required_environment_value(&launched_args, "PIJ_SESSION_ID");
    let launched_spawn_id = required_environment_value(&launched_args, "PIJ_SPAWN_ID");
    assert_eq!(launched_seat_id, persisted.id.as_str());
    assert_eq!(launched_spawn_id, fresh_spawn_id);

    let first_bind = run_cli(
        &dir,
        &addr.to_string(),
        &[
            "register",
            &launched_seat_id,
            "--harness",
            "copilot",
            "--folder",
            "/abs/prior-folder",
            "--pane",
            "%new",
            "--pid",
            "4343",
            "--proc-start",
            "20260831030200",
            "--spawn-id",
            &launched_spawn_id,
        ],
    );
    assert!(
        first_bind.status.success(),
        "first binding registration failed: {}",
        String::from_utf8_lossy(&first_bind.stderr)
    );
    let after_first_bind = registry
        .get(&SeatId::from("pij-returning-seat"))
        .await
        .expect("read after first bind")
        .expect("bound row exists");
    assert_eq!(
        after_first_bind.rpc_port_intent,
        Some(fresh_port),
        "the revived seat's own matching first bind must preserve fresh launch intent"
    );

    let later_incarnation = run_cli(
        &dir,
        &addr.to_string(),
        &[
            "register",
            "pij-returning-seat",
            "--harness",
            "copilot",
            "--folder",
            "/abs/prior-folder",
            "--pane",
            "%later",
            "--pid",
            "4444",
            "--proc-start",
            "20260831030300",
        ],
    );
    assert!(
        later_incarnation.status.success(),
        "later incarnation registration failed: {}",
        String::from_utf8_lossy(&later_incarnation.stderr)
    );
    let after_later_incarnation = registry
        .get(&SeatId::from("pij-returning-seat"))
        .await
        .expect("read after later incarnation")
        .expect("later incarnation row exists");
    assert_eq!(
        after_later_incarnation.rpc_port_intent, None,
        "a later incarnation with no matching allocation must not inherit port intent"
    );
    assert_ne!(
        after_later_incarnation.rpc_port_intent,
        Some(47_777),
        "the old pre-revive port must remain unreachable"
    );

    server.abort();
    drop(dir);
}
