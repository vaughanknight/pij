use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use pij_core::model::Pane;
use pij_core::ports::TmuxPort;
use pij_testkit::block_on;
use pij_testkit::contract::{TmuxContractFixture, tmux_contract};
use pij_testkit::fakes::FakeTmux;
use pij_tmux::{TmuxAdapter, tap_sink_path};

static SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);

struct Fixture {
    pane: Pane,
    initial_capture: String,
    sent_keys: String,
    sent_keys_capture: String,
    new_window_name: String,
    tap_sink: PathBuf,
}

impl TmuxContractFixture for Fixture {
    fn pane(&self) -> &Pane {
        &self.pane
    }

    fn initial_capture(&self) -> &str {
        &self.initial_capture
    }

    fn sent_keys(&self) -> &str {
        &self.sent_keys
    }

    fn sent_keys_capture(&self) -> &str {
        &self.sent_keys_capture
    }

    fn new_window_name(&self) -> &str {
        &self.new_window_name
    }

    fn tap_sink(&self) -> &Path {
        &self.tap_sink
    }
}

#[test]
fn fake_tmux_honours_the_shared_contract() {
    let pane = Pane {
        id: "%41".to_string(),
        session: "contract-fake".to_string(),
        window: "origin".to_string(),
        title: String::new(),
        cursor_x: Some(0),
        cursor_y: Some(0),
    };
    let tap_sink = std::env::temp_dir().join("pij-rs-fake-contract-tap.raw");
    let tmux = FakeTmux::new()
        .with_pane(pane.clone())
        .script_capture("")
        .script_capture("literal | payload");
    let fixture = Fixture {
        pane,
        initial_capture: String::new(),
        sent_keys: "literal | payload".to_string(),
        sent_keys_capture: "literal | payload".to_string(),
        new_window_name: "contract-created".to_string(),
        tap_sink: tap_sink.clone(),
    };

    block_on(tmux_contract(&tmux, &fixture));
    assert_eq!(
        tmux.calls(),
        vec![
            "list_panes".to_string(),
            "capture:%41:100".to_string(),
            "user_typing:%41".to_string(),
            "drain_pane_tap:%41".to_string(),
            "pane_tap_sink:%41".to_string(),
            format!("attach_pane_tap:%41:{}", tap_sink.display()),
            "pane_tap_sink:%41".to_string(),
            "drain_pane_tap:%41".to_string(),
            "detach_pane_tap:%41".to_string(),
            "pane_tap_sink:%41".to_string(),
            "drain_pane_tap:%41".to_string(),
            "send_keys:%41:literal | payload".to_string(),
            "capture:%41:100".to_string(),
            "new_window:contract-fake:contract-created".to_string(),
            "kill:%101".to_string(),
            "list_panes".to_string(),
        ]
    );
}

#[test]
fn missing_tmux_names_the_installation_fix() {
    let tmux = TmuxAdapter::with_binary(
        "/definitely/not/a/tmux-binary",
        std::env::temp_dir().join("pij-missing-tmux-signals"),
    );
    let error = block_on(tmux.list_panes()).expect_err("missing binary must fail");
    let message = error.to_string();
    assert!(message.contains("install tmux"), "{message}");
    assert!(message.contains("PATH"), "{message}");
}

#[test]
fn real_tmux_honours_the_shared_contract_inside_its_own_session() {
    let Some(session) = TestSession::start_or_skip("contract") else {
        return;
    };
    let tmux = TmuxAdapter::for_server(&session.server, &session.tap_root);
    let pane = block_on(tmux.list_panes())
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");
    let tap_sink = tap_sink_path(&session.tap_root, &pane.id);
    let fixture = Fixture {
        pane,
        initial_capture: "\n".repeat(23),
        sent_keys: "literal | payload".to_string(),
        sent_keys_capture: "literal | payload".to_string(),
        new_window_name: "contract-created".to_string(),
        tap_sink,
    };

    block_on(tmux_contract(&tmux, &fixture));
}

#[test]
fn capture_proves_zero_and_more_than_the_pane_contains() {
    let Some(session) = TestSession::start_or_skip("capture") else {
        return;
    };
    let tmux = TmuxAdapter::for_server(&session.server, &session.tap_root);
    let pane = block_on(tmux.list_panes())
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");

    block_on(tmux.send_keys(&pane.id, "boundary-text")).expect("type in isolated pane");
    let zero = block_on(tmux.capture(&pane.id, 0)).expect("zero-line capture");
    assert_eq!(zero, "", "zero requested lines means zero returned lines");

    let overlong = block_on(tmux.capture(&pane.id, u32::MAX)).expect("overlong capture");
    assert!(overlong.contains("boundary-text"), "{overlong:?}");
    assert_eq!(
        block_on(tmux.capture(&pane.id, 1)).expect("one-line capture"),
        overlong.lines().last().unwrap_or_default(),
        "one line returns exactly the final available line"
    );
}

#[tokio::test]
async fn submit_pastes_a_3000_byte_multiline_body_intact() {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock after epoch")
        .as_nanos();
    let output_path = std::env::temp_dir().join(format!(
        "pij-rs-submit-large-{}-{nonce}.bin",
        std::process::id()
    ));
    let body = format!("BEGIN-S122\n{}\nEND-S122", "0123456789abcdef".repeat(190));
    let mut expected = Vec::with_capacity(body.len() + 13);
    expected.extend_from_slice(b"\x1b[200~");
    expected.extend_from_slice(body.as_bytes());
    expected.extend_from_slice(b"\x1b[201~\r");
    let command = format!(
        "stty raw -echo; printf '\\033[?2004h'; dd bs=1 count={} of={} 2>/dev/null; sleep 10",
        expected.len(),
        output_path.display()
    );
    let Some(session) = TestSession::start_or_skip_with_command("submit-large", &command) else {
        return;
    };
    let tmux = TmuxAdapter::for_server(&session.server, &session.tap_root);
    let pane = tmux
        .list_panes()
        .await
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");
    std::thread::sleep(Duration::from_millis(100));

    tmux.submit(&pane.id, &body)
        .await
        .expect("submit large body");

    let deadline = Instant::now() + Duration::from_secs(10);
    let observed = loop {
        match fs::read(&output_path) {
            Ok(bytes) if bytes.len() >= expected.len() => break bytes,
            result if Instant::now() >= deadline => {
                panic!(
                    "large submit did not arrive intact: expected {} bytes, observed {result:?}",
                    expected.len()
                );
            }
            _ => std::thread::sleep(Duration::from_millis(25)),
        }
    };
    assert_eq!(
        observed, expected,
        "chunked bracketed paste preserves every body byte"
    );
    fs::remove_file(&output_path).expect("remove large-submit capture");
}

#[tokio::test]
async fn submit_rejects_bracket_terminator_before_touching_real_pane() {
    let Some(session) = TestSession::start_or_skip("control-body") else {
        return;
    };
    let tmux = TmuxAdapter::for_server(&session.server, &session.tap_root);
    let pane = tmux
        .list_panes()
        .await
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");
    let before = tmux
        .capture(&pane.id, u32::MAX)
        .await
        .expect("capture before");

    let error = tmux
        .submit(&pane.id, "before\u{1b}[201~after")
        .await
        .expect_err("terminal control must be refused before paste");

    let message = error.to_string();
    assert!(message.contains("U+001B"), "{message}");
    assert!(message.contains("inbox pull"), "{message}");
    assert_eq!(
        tmux.capture(&pane.id, u32::MAX)
            .await
            .expect("capture after"),
        before,
        "refusal must not write any fragment into the pane"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn staged_submit_excludes_human_input_mid_body_and_before_enter() {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock after epoch")
        .as_nanos();
    let output_path = std::env::temp_dir().join(format!(
        "pij-rs-submit-owned-{}-{nonce}.bin",
        std::process::id()
    ));
    let body = "0123456789abcdef".repeat(1_250);
    let mut expected = Vec::with_capacity(body.len() + 13);
    expected.extend_from_slice(b"\x1b[200~");
    expected.extend_from_slice(body.as_bytes());
    expected.extend_from_slice(b"\x1b[201~\r");
    let command = format!(
        "stty raw -echo; dd bs=1 count={} of={} 2>/dev/null; sleep 10",
        expected.len(),
        output_path.display()
    );
    let Some(session) = TestSession::start_or_skip_with_command("submit-owned", &command) else {
        return;
    };
    let tmux = Arc::new(TmuxAdapter::for_server(&session.server, &session.tap_root));
    let pane = tmux
        .list_panes()
        .await
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");
    let mut staged = tmux
        .acquire_submit(&pane.id)
        .await
        .expect("acquire pane input");
    assert!(pane_input_off(&session, &pane.id));
    let staging_tmux = Arc::clone(&tmux);
    let staging_body = body.clone();
    let staging = tokio::spawn(async move {
        let result = staging_tmux.stage_submit(&mut staged, &staging_body).await;
        (result, staged)
    });

    for _ in 0..8 {
        session.run(["send-keys", "-t", &pane.id, "-l", "MID-HUMAN"]);
        std::thread::sleep(Duration::from_millis(15));
    }
    let (result, staged) = staging.await.expect("stage task");
    result.expect("stage body");
    session.run(["send-keys", "-t", &pane.id, "-l", "BETWEEN-CLOSE-ENTER"]);
    assert!(pane_input_off(&session, &pane.id));

    tmux.commit_submit(&staged)
        .await
        .expect("commit staged body");
    wait_for_pane_input(&session, &pane.id, false, Duration::from_secs(1));

    let observed = wait_for_file(&output_path, expected.len(), Duration::from_secs(10));
    assert_eq!(
        observed, expected,
        "human input must not join the owned transaction"
    );
    fs::remove_file(&output_path).expect("remove owned-submit capture");
}

#[tokio::test]
async fn abort_leaves_recovery_notice_unsent_and_restores_input() {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock after epoch")
        .as_nanos();
    let output_path = std::env::temp_dir().join(format!(
        "pij-rs-submit-abort-{}-{nonce}.bin",
        std::process::id()
    ));
    let body = "AUTOMATED-BODY";
    let recovery = pij_core::ports::STAGED_SUBMIT_RECOVERY;
    let mut expected = Vec::new();
    expected.extend_from_slice(b"\x1b[200~");
    expected.extend_from_slice(body.as_bytes());
    expected.extend_from_slice(b"\x1b[201~");
    expected.extend_from_slice(b"\x1b[200~\n");
    expected.extend_from_slice(recovery.as_bytes());
    expected.extend_from_slice(b"\x1b[201~");
    let command = format!(
        "stty raw -echo; dd bs=1 count={} of={} 2>/dev/null; sleep 10",
        expected.len(),
        output_path.display()
    );
    let Some(session) = TestSession::start_or_skip_with_command("submit-abort", &command) else {
        return;
    };
    let tmux = TmuxAdapter::for_server(&session.server, &session.tap_root);
    let pane = tmux
        .list_panes()
        .await
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");

    let mut staged = tmux
        .acquire_submit(&pane.id)
        .await
        .expect("acquire pane input");
    tmux.stage_submit(&mut staged, body)
        .await
        .expect("stage body");
    assert!(pane_input_off(&session, &pane.id));
    tmux.abort_submit(&staged).await.expect("abort staged body");
    wait_for_pane_input(&session, &pane.id, false, Duration::from_secs(1));

    let observed = wait_for_file(&output_path, expected.len(), Duration::from_secs(10));
    assert_eq!(observed, expected);
    assert_ne!(
        observed.last(),
        Some(&b'\r'),
        "abort must never press Enter"
    );
    fs::remove_file(&output_path).expect("remove abort capture");
}

#[tokio::test]
async fn stage_deadline_aborts_and_restores_input() {
    let Some(session) = TestSession::start_or_skip("submit-deadline") else {
        return;
    };
    let tmux = TmuxAdapter::for_server(&session.server, &session.tap_root);
    let pane = tmux
        .list_panes()
        .await
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");
    let body = "x".repeat(200_000);
    let mut staged = tmux
        .acquire_submit(&pane.id)
        .await
        .expect("acquire pane input");
    let error = tmux
        .stage_submit(&mut staged, &body)
        .await
        .expect_err("staging beyond the transaction bound must abort");

    assert!(error.to_string().contains("exceeded 1s"), "{error}");
    wait_for_pane_input(&session, &pane.id, false, Duration::from_secs(1));
    let marker = session.run([
        "show-options",
        "-p",
        "-v",
        "-q",
        "-t",
        &pane.id,
        "@pij-submit-owner",
    ]);
    assert!(String::from_utf8_lossy(&marker.stdout).trim().is_empty());
}

#[test]
fn stage_helper_process() {
    let Ok(server) = std::env::var("PIJ_STAGE_HELPER_SERVER") else {
        return;
    };
    let pane = std::env::var("PIJ_STAGE_HELPER_PANE").expect("helper pane");
    let ready = PathBuf::from(std::env::var("PIJ_STAGE_HELPER_READY").expect("helper ready"));
    let tmux = TmuxAdapter::for_server(&server, std::env::temp_dir());
    let mut staged = block_on(tmux.acquire_submit(&pane)).expect("helper acquires pane input");
    block_on(tmux.stage_submit(&mut staged, "DAEMON-DIES-MID-STAGE")).expect("helper stages body");
    fs::write(ready, staged.token).expect("signal staged ownership");
    std::thread::sleep(Duration::from_secs(30));
}

#[test]
fn daemon_death_mid_stage_restores_input_within_bound() {
    let Some(session) = TestSession::start_or_skip("submit-death") else {
        return;
    };
    let pane = block_on(TmuxAdapter::for_server(&session.server, &session.tap_root).list_panes())
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");
    let ready = session.tap_root.join("stage-ready");
    fs::create_dir_all(&session.tap_root).expect("create helper signal directory");
    let mut helper = Command::new(std::env::current_exe().expect("current test binary"))
        .args(["--exact", "stage_helper_process", "--nocapture"])
        .env("PIJ_STAGE_HELPER_SERVER", &session.server)
        .env("PIJ_STAGE_HELPER_PANE", &pane.id)
        .env("PIJ_STAGE_HELPER_READY", &ready)
        .spawn()
        .expect("spawn stage helper");
    wait_for_file(&ready, 1, Duration::from_secs(2));
    assert!(pane_input_off(&session, &pane.id));

    helper.kill().expect("kill staged daemon process");
    helper.wait().expect("reap staged daemon process");
    wait_for_pane_input(&session, &pane.id, false, Duration::from_secs(2));

    wait_for_submit_marker_clear(&session, &pane.id, Duration::from_secs(1));
    let title = session.run(["display-message", "-p", "-t", &pane.id, "#{pane_title}"]);
    assert!(
        String::from_utf8_lossy(&title.stdout).contains("PIJ STAGED UNSENT"),
        "watchdog must leave visible recovery guidance"
    );
    fs::remove_file(ready).expect("remove helper ready file");
}

fn pane_input_off(session: &TestSession, pane: &str) -> bool {
    let output = session.run(["display-message", "-p", "-t", pane, "#{pane_input_off}"]);
    String::from_utf8_lossy(&output.stdout).trim() == "1"
}

fn submit_marker(session: &TestSession, pane: &str) -> String {
    let output = session.run([
        "show-options",
        "-p",
        "-v",
        "-q",
        "-t",
        pane,
        "@pij-submit-owner",
    ]);
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn wait_for_submit_marker_clear(session: &TestSession, pane: &str, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    while !submit_marker(session, pane).is_empty() {
        assert!(Instant::now() < deadline, "submit marker did not clear");
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn wait_for_pane_input(session: &TestSession, pane: &str, off: bool, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    while pane_input_off(session, pane) != off {
        assert!(
            Instant::now() < deadline,
            "pane input state did not converge"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn wait_for_file(path: &Path, bytes: usize, timeout: Duration) -> Vec<u8> {
    let deadline = Instant::now() + timeout;
    loop {
        match fs::read(path) {
            Ok(content) if content.len() >= bytes => return content,
            result if Instant::now() >= deadline => {
                panic!("file {path:?} did not reach {bytes} bytes: {result:?}");
            }
            _ => std::thread::sleep(Duration::from_millis(10)),
        }
    }
}
fn drain_until_quiet(tmux: &TmuxAdapter, server: &str, pane: &str, needle: &str) -> Vec<u8> {
    let started = Instant::now();
    let deadline = started + Duration::from_secs(10);
    let mut observed = Vec::new();
    let mut quiet_after_match = 0;
    loop {
        std::thread::sleep(Duration::from_millis(25));
        let chunk = block_on(tmux.drain_pane_tap(pane)).expect("drain attached tap");
        if chunk.is_empty() && String::from_utf8_lossy(&observed).contains(needle) {
            quiet_after_match += 1;
            if quiet_after_match == 2 {
                return observed;
            }
        } else {
            quiet_after_match = 0;
            observed.extend_from_slice(&chunk);
        }
        if Instant::now() >= deadline {
            let pipe = Command::new("tmux")
                .args([
                    "-L",
                    server,
                    "display-message",
                    "-p",
                    "-t",
                    pane,
                    "#{pane_pipe}",
                ])
                .output()
                .ok()
                .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
                .unwrap_or_else(|| "unobservable".to_string());
            panic!(
                "tap did not settle after {:?}: observed {} bytes ({:?}), pane_pipe={pipe}",
                started.elapsed(),
                observed.len(),
                String::from_utf8_lossy(&observed)
            );
        }
    }
}

#[test]
fn pane_tap_drains_each_raw_byte_once_and_detaches_cleanly() {
    let Some(session) = TestSession::start_or_skip("tap") else {
        return;
    };
    let tmux = TmuxAdapter::for_server(&session.server, &session.tap_root);
    let pane = block_on(tmux.list_panes())
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");
    let sink = tap_sink_path(&session.tap_root, &pane.id);

    assert!(
        block_on(tmux.drain_pane_tap(&pane.id)).is_err(),
        "unattached is absent, not empty"
    );
    block_on(tmux.attach_pane_tap(&pane.id, &sink)).expect("attach tap");
    block_on(tmux.send_keys(&pane.id, "tap-one")).expect("emit first bytes");
    let first = drain_until_quiet(&tmux, &session.server, &pane.id, "tap-one");
    assert_eq!(
        String::from_utf8_lossy(&first).matches("tap-one").count(),
        1,
        "{first:?}"
    );
    assert_eq!(
        block_on(tmux.drain_pane_tap(&pane.id)).expect("quiet drain"),
        Vec::<u8>::new(),
        "bytes are returned once"
    );

    block_on(tmux.send_keys(&pane.id, "tap-two")).expect("emit second bytes");
    let second = drain_until_quiet(&tmux, &session.server, &pane.id, "tap-two");
    assert_eq!(
        String::from_utf8_lossy(&second).matches("tap-two").count(),
        1,
        "{second:?}"
    );

    block_on(tmux.detach_pane_tap(&pane.id)).expect("detach tap");
    assert!(!sink.exists(), "detach owns sink cleanup");
    assert!(block_on(tmux.drain_pane_tap(&pane.id)).is_err());
}

#[test]
fn matching_marker_adopts_restart_pipe_and_detach_clears_ownership() {
    let Some(session) = TestSession::start_or_skip("tap-adopt") else {
        return;
    };
    let first = TmuxAdapter::for_server(&session.server, &session.tap_root);
    let pane = block_on(first.list_panes())
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");
    let sink = tap_sink_path(&session.tap_root, &pane.id);
    block_on(first.attach_pane_tap(&pane.id, &sink)).expect("initial attach");
    let marker = session.run([
        "show-options",
        "-p",
        "-v",
        "-q",
        "-t",
        &pane.id,
        "@pij-tap-sink",
    ]);
    assert_eq!(
        String::from_utf8_lossy(&marker.stdout).trim(),
        sink.to_str().unwrap()
    );

    // A fresh adapter has no process-local tap map. The matching pane marker is
    // the durable ownership fact that lets it replace the orphan safely.
    let restarted = TmuxAdapter::for_server(&session.server, &session.tap_root);
    block_on(restarted.attach_pane_tap(&pane.id, &sink)).expect("restart adoption");
    block_on(restarted.send_keys(&pane.id, "after-restart")).expect("emit after restart");
    let bytes = drain_until_quiet(&restarted, &session.server, &pane.id, "after-restart");
    assert!(String::from_utf8_lossy(&bytes).contains("after-restart"));

    block_on(restarted.detach_pane_tap(&pane.id)).expect("detach adopted tap");
    let marker = session.run([
        "show-options",
        "-p",
        "-v",
        "-q",
        "-t",
        &pane.id,
        "@pij-tap-sink",
    ]);
    assert!(
        marker.stdout.is_empty(),
        "detach must clear durable ownership"
    );
}

#[test]
fn mismatched_marker_refuses_to_replace_a_foreign_pipe() {
    let Some(session) = TestSession::start_or_skip("tap-foreign") else {
        return;
    };
    let first = TmuxAdapter::for_server(&session.server, &session.tap_root);
    let pane = block_on(first.list_panes())
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");
    let sink = tap_sink_path(&session.tap_root, &pane.id);
    block_on(first.attach_pane_tap(&pane.id, &sink)).expect("initial attach");
    session.run([
        "set-option",
        "-p",
        "-t",
        &pane.id,
        "@pij-tap-sink",
        "/foreign/sink",
    ]);

    let restarted = TmuxAdapter::for_server(&session.server, &session.tap_root);
    let error = block_on(restarted.attach_pane_tap(&pane.id, &sink))
        .expect_err("mismatched owner must be refused");
    assert!(
        error.to_string().contains("not owned by this sink"),
        "{error}"
    );

    let pipe = session.run(["display-message", "-p", "-t", &pane.id, "#{pane_pipe}"]);
    assert_eq!(String::from_utf8_lossy(&pipe.stdout).trim(), "1");

    block_on(first.detach_pane_tap(&pane.id)).expect("clean up original tap");
}
#[test]
fn direct_detach_refuses_foreign_marker_and_preserves_its_file() {
    let Some(session) = TestSession::start_or_skip("tap-detach-foreign") else {
        return;
    };
    let tmux = TmuxAdapter::for_server(&session.server, &session.tap_root);
    let pane = block_on(tmux.list_panes())
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");
    let victim = std::env::temp_dir().join(format!("{}-victim.raw", session.name));
    std::fs::write(&victim, b"FOREIGN FILE").expect("create foreign file");
    let pipe_command = format!("cat >> '{}'", victim.display());
    session.run(["pipe-pane", "-O", "-t", &pane.id, &pipe_command]);
    session.run([
        "set-option",
        "-p",
        "-t",
        &pane.id,
        "@pij-tap-sink",
        victim.to_str().expect("UTF-8 victim path"),
    ]);

    let result = block_on(tmux.detach_pane_tap(&pane.id));
    assert_eq!(
        std::fs::read(&victim).expect("foreign file survives"),
        b"FOREIGN FILE",
        "identity mutation must fail on the file, not only the pipe"
    );
    let error = result.expect_err("foreign marker cannot authorize direct detach");
    assert!(error.to_string().contains("foreign tap"), "{error}");
    let pipe = session.run(["display-message", "-p", "-t", &pane.id, "#{pane_pipe}"]);
    assert_eq!(String::from_utf8_lossy(&pipe.stdout).trim(), "1");

    session.run(["pipe-pane", "-t", &pane.id]);
    session.run(["set-option", "-p", "-u", "-t", &pane.id, "@pij-tap-sink"]);
    std::fs::remove_file(victim).expect("remove foreign fixture");
}

#[test]
fn pane_in_mode_is_the_only_typing_fact_this_adapter_claims() {
    let Some(session) = TestSession::start_or_skip("typing") else {
        return;
    };
    let tmux = TmuxAdapter::for_server(&session.server, &session.tap_root);
    let pane = block_on(tmux.list_panes())
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");
    assert!(
        pane.cursor_x.is_some() && pane.cursor_y.is_some(),
        "real tmux must report the cursor as a measured pair: {pane:?}"
    );

    assert!(!block_on(tmux.user_typing(&pane.id)).expect("plain pane mode"));
    session.run(["copy-mode", "-t", &pane.id]);
    assert!(block_on(tmux.user_typing(&pane.id)).expect("copy mode"));
}

#[test]
fn kill_refuses_an_id_not_freshly_resolved_in_the_owned_session() {
    let Some(session) = TestSession::start_or_skip("kill-brake") else {
        return;
    };
    let tmux = TmuxAdapter::for_server(&session.server, &session.tap_root);

    let error = block_on(tmux.kill("%999999")).expect_err("unknown pane must be refused");
    assert!(error.to_string().contains("fresh list-panes"), "{error}");
    assert_eq!(
        block_on(tmux.list_panes())
            .expect("owned session survives")
            .len(),
        1,
        "the refusal is a brake: it cannot destroy the owned session"
    );
}

struct TestSession {
    name: String,
    server: String,
    tap_root: PathBuf,
}

impl TestSession {
    fn start_or_skip(label: &str) -> Option<Self> {
        Self::start_or_skip_with_command(label, "cat")
    }

    fn start_or_skip_with_command(label: &str, command: &str) -> Option<Self> {
        match Command::new("tmux").arg("-V").output() {
            Ok(output) if output.status.success() => {}
            Ok(output) => {
                eprintln!(
                    "SKIP real tmux test: `tmux -V` failed: {}",
                    String::from_utf8_lossy(&output.stderr).trim()
                );
                return None;
            }
            Err(error) => {
                eprintln!("SKIP real tmux test: tmux is unavailable: {error}");
                return None;
            }
        }

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock after epoch")
            .as_nanos();
        let count = SESSION_COUNTER.fetch_add(1, Ordering::Relaxed);
        let name = format!("pij-rs-{label}-{}-{nonce}-{count}", std::process::id());
        let server = format!("{name}-server");
        let tap_root = std::env::temp_dir().join(format!("{name}-signals"));
        let session = Self {
            name,
            server,
            tap_root,
        };
        session.run([
            "new-session",
            "-d",
            "-s",
            &session.name,
            "-n",
            "origin",
            "-x",
            "80",
            "-y",
            "24",
            command,
        ]);
        session.run(["set-option", "-t", &session.name, "allow-rename", "off"]);
        session.run([
            "select-pane",
            "-t",
            &format!("{}:origin.0", session.name),
            "-T",
            "",
        ]);
        Some(session)
    }

    fn run<const N: usize>(&self, args: [&str; N]) -> Output {
        let output = Command::new("tmux")
            .args(["-L", &self.server])
            .args(args)
            .output()
            .expect("tmux became unavailable after fixture creation");
        assert!(
            output.status.success(),
            "isolated tmux fixture command failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        output
    }
}

impl Drop for TestSession {
    fn drop(&mut self) {
        let output = Command::new("tmux")
            .args(["-L", &self.server, "kill-server"])
            .output();
        if let Ok(output) = output
            && !output.status.success()
            && !std::thread::panicking()
        {
            panic!(
                "failed to tear down isolated tmux server {}: {}",
                self.server,
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }
}
