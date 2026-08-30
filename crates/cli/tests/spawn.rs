use std::process::Command;
use std::sync::Arc;

use pij_core::config::Config;
use pij_core::model::{Envelope, SeatDescriptor};
use pij_daemon::http::{HttpConfig, router_with_config};
use pij_store::SqliteRegistry;
use pij_testkit::fakes::FakeTmux;
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
    let envelope: Envelope<Vec<SeatDescriptor>> =
        serde_json::from_slice(&listed.stdout).expect("list JSON envelope");
    let seats = envelope.data.expect("listed seats");
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
