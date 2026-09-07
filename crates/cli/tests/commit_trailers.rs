use std::path::Path;
use std::process::{Command, Output};
use std::sync::Arc;

use pij_core::config::Config;
use pij_core::model::{Harness, SeatDescriptor};
use pij_daemon::http::{HttpConfig, router_with_config};
use pij_testkit::fakes::FakeRegistry;
use pij_testkit::fresh_dir;

fn run_cli(dir: &Path, addr: &str, seat: Option<&str>, args: &[&str]) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_pij-rs"));
    command
        .current_dir(dir)
        .env("PIJ_HOME", dir.join("legacy"))
        .env_remove("PIJ_SESSION_ID")
        .env_remove("TMUX_PANE")
        .env_remove("PIJ_PARENT_ID")
        .env_remove("CLAUDE_CODE_SESSION_ID")
        .env_remove("HARNESS_SESSION_ID")
        .env_remove("COPILOT_AGENT_SESSION_ID")
        .env_remove("CODEX_THREAD_ID")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .args(["--state-dir", dir.to_str().unwrap(), "--addr", addr])
        .args(args);
    if let Some(seat) = seat {
        command.env("PIJ_SESSION_ID", seat);
    }
    command.output().expect("run shipped CLI")
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn shipped_commit_trailers_uses_authoritative_identity_and_keeps_stdout_clean() {
    let dir = fresh_dir("pij-commit-trailers");
    let git = Command::new("git")
        .current_dir(&dir)
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .args(["init", "--initial-branch=no-plan"])
        .output()
        .unwrap();
    assert!(git.status.success());
    std::fs::write(dir.join("daemon.key"), "trailer-test-key").unwrap();
    let mut prime = SeatDescriptor::new("pij-prime", Harness::Omp, dir.to_str().unwrap());
    prime.role = Some("prime".to_string());
    let mut pm = SeatDescriptor::new("pij-pm", Harness::Omp, dir.to_str().unwrap());
    pm.parent = Some(prime.id.clone());
    let mut coder = SeatDescriptor::new("pij-coder", Harness::Omp, dir.to_str().unwrap());
    coder.parent = Some(pm.id.clone());
    let mut orphan = SeatDescriptor::new("pij-orphan", Harness::Omp, dir.to_str().unwrap());
    orphan.parent = Some("pij-missing".into());
    let registry = Arc::new(
        FakeRegistry::new()
            .with_seat(prime)
            .with_seat(pm)
            .with_seat(coder)
            .with_seat(orphan),
    );
    let mut services = pij_daemon::build_services(&Config::default(), &dir.join("signals"))
        .await
        .unwrap();
    services.registry = registry.clone();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap().to_string();
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            router_with_config(
                services,
                HttpConfig {
                    local_key: "trailer-test-key".to_string(),
                    peer_keys: Vec::new(),
                    machine_alias: "test-machine".to_string(),
                },
            ),
        )
        .await
        .unwrap();
    });

    for (id, expected) in [
        ("pij-prime", "Pij-Prime: pij-prime\n"),
        ("pij-coder", "Pij-Seat: pij-coder\nPij-Prime: pij-prime\n"),
        ("pij-orphan", "Pij-Seat: pij-orphan\n"),
    ] {
        let result = run_cli(&dir, &addr, Some(id), &["--json", "commit-trailers"]);
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        assert_eq!(String::from_utf8(result.stdout).unwrap(), expected);
        if id == "pij-orphan" {
            assert!(
                String::from_utf8(result.stderr)
                    .unwrap()
                    .contains("Pij-Prime omitted")
            );
        } else {
            assert!(
                String::from_utf8_lossy(&result.stderr)
                    .contains("Pij-Prime derivation: role=prime")
            );
        }
    }
    let missing = run_cli(&dir, &addr, None, &["commit-trailers"]);
    assert!(!missing.status.success());
    assert!(missing.stdout.is_empty());
    assert!(!missing.stderr.is_empty());
    let bad_config = run_cli(&dir, &addr, None, &["--state-dir", "", "commit-trailers"]);
    assert!(!bad_config.status.success());
    assert!(bad_config.stdout.is_empty());
    assert!(!bad_config.stderr.is_empty());
    assert!(
        registry
            .calls()
            .iter()
            .all(|call| call == "list" || call.starts_with("get:")),
        "trailer reads must never mutate the registry: {:?}",
        registry.calls()
    );
    server.abort();
}
