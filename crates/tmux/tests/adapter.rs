use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use pij_core::model::Pane;
use pij_core::ports::TmuxPort;
use pij_testkit::block_on;
use pij_testkit::contract::{TmuxContractFixture, tmux_contract};
use pij_testkit::fakes::FakeTmux;
use pij_tmux::TmuxAdapter;

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
    let tmux = TmuxAdapter::with_binary("/definitely/not/a/tmux-binary");
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
    let tmux = TmuxAdapter::for_server(&session.server);
    let pane = block_on(tmux.list_panes())
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");
    let fixture = Fixture {
        pane,
        initial_capture: "\n".repeat(23),
        sent_keys: "literal | payload".to_string(),
        sent_keys_capture: "literal | payload".to_string(),
        new_window_name: "contract-created".to_string(),
        tap_sink: std::env::temp_dir().join(format!("{}-tap.raw", session.name)),
    };

    block_on(tmux_contract(&tmux, &fixture));
}

#[test]
fn capture_proves_zero_and_more_than_the_pane_contains() {
    let Some(session) = TestSession::start_or_skip("capture") else {
        return;
    };
    let tmux = TmuxAdapter::for_server(&session.server);
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
    let tmux = TmuxAdapter::for_server(&session.server);
    let pane = block_on(tmux.list_panes())
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");
    let sink = std::env::temp_dir().join(format!("{}-tap.raw", session.name));

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
    let first = TmuxAdapter::for_server(&session.server);
    let pane = block_on(first.list_panes())
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");
    let sink = std::env::temp_dir().join(format!("{}-tap.raw", session.name));
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
    let restarted = TmuxAdapter::for_server(&session.server);
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
    let first = TmuxAdapter::for_server(&session.server);
    let pane = block_on(first.list_panes())
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");
    let sink = std::env::temp_dir().join(format!("{}-tap.raw", session.name));
    block_on(first.attach_pane_tap(&pane.id, &sink)).expect("initial attach");
    session.run([
        "set-option",
        "-p",
        "-t",
        &pane.id,
        "@pij-tap-sink",
        "/foreign/sink",
    ]);

    let restarted = TmuxAdapter::for_server(&session.server);
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
fn pane_in_mode_is_the_only_typing_fact_this_adapter_claims() {
    let Some(session) = TestSession::start_or_skip("typing") else {
        return;
    };
    let tmux = TmuxAdapter::for_server(&session.server);
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
    let tmux = TmuxAdapter::for_server(&session.server);

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
}

impl TestSession {
    fn start_or_skip(label: &str) -> Option<Self> {
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
        let session = Self { name, server };
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
            "cat",
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
