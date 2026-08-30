use std::process::Command;
use std::sync::Arc;

use pij_core::config::{AdapterChoice, Adapters, Config};
use pij_core::model::{
    DeliveryOrigin, DeliveryOutcome, Envelope, Msg, ProcIdentity, Receipt, SeatDescriptor, SeatId,
    Seq,
};
use pij_daemon::http::{FederatedRoster, HttpConfig, router_with_config};
use pij_store::SqliteRegistry;
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
        .envs(envs)
        .output()
        .expect("run shipped CLI")
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn shipped_cli_spawns_both_capability_rows_through_real_registry() {
    let dir = fresh_dir("pij-spawn-e2e");
    std::fs::write(dir.join("daemon.key"), "spawn-test-key").expect("write client key");
    let pool = pij_store::open(
        dir.join("pij.sqlite")
            .to_str()
            .expect("UTF-8 database path"),
    )
    .await
    .expect("open real store");
    let registry = Arc::new(SqliteRegistry::new(pool));
    let tmux = Arc::new(FakeTmux::new());
    let mut services = pij_daemon::build_services(&Config::default())
        .await
        .expect("build services");
    services.registry = registry;
    services.tmux = tmux.clone();

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

    for (id, accepted) in [("pij-e2e-closed", false), ("pij-e2e-open", true)] {
        let mut args = vec![
            "spawn",
            "--id",
            id,
            "--harness",
            "claude",
            "--bin",
            "/path with spaces/claude",
            "--model",
            "provider/model",
            "--effort",
            "high",
            "--cwd",
            "/abs/tree",
            "--session",
            "fleet",
        ];
        if accepted {
            args.push("--accept-inbound");
        }
        let output = run_cli(&dir, &addr, &args);
        assert!(
            output.status.success(),
            "spawn failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let envelope: Envelope<SeatDescriptor> =
            serde_json::from_slice(&output.stdout).expect("spawn JSON envelope");
        let descriptor = envelope.data.expect("spawn descriptor");
        assert_eq!(descriptor.id.as_str(), id);
        assert_eq!(descriptor.proc, None);
        assert_eq!(descriptor.cross_session_inbound_accept, Some(accepted));
    }

    let listed = run_cli(&dir, &addr, &["list"]);
    assert!(listed.status.success());
    let envelope: Envelope<FederatedRoster> =
        serde_json::from_slice(&listed.stdout).expect("list JSON envelope");
    let roster = envelope.data.expect("listed roster");
    assert!(roster.unavailable.is_empty());
    let seats = roster.seats;
    assert_eq!(seats.len(), 2);
    assert_eq!(seats[0].cross_session_inbound_accept, Some(false));
    assert_eq!(seats[1].cross_session_inbound_accept, Some(true));

    let calls = tmux.calls();
    assert_eq!(calls.len(), 2);
    assert!(!calls[0].contains("crossSessionInbound"));
    assert!(calls[1].contains(r#"{\"crossSessionInbound\":\"accept\"}"#));

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
    let mut services = pij_daemon::build_services(&config)
        .await
        .expect("build real inbox services");
    services.liveness = Arc::new(FakeLiveness::new().with_proc(ProcIdentity {
        pid: 4242,
        proc_start: 20260830112233,
    }));
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

    let sent = run_cli(
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
            "m-shipped-inbox",
        ],
    );
    assert!(
        sent.status.success(),
        "send: {}",
        String::from_utf8_lossy(&sent.stdout)
    );

    let read = run_cli_with_env(&dir, &addr, &["inbox"], [("PIJ_SESSION_ID", "pij-reader")]);
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

    let duplicate = run_cli(
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
            "m-shipped-inbox",
        ],
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

    server.abort();
    drop(dir);
}
