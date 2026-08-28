use std::process::{Command, Output};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

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
}

#[test]
fn fake_tmux_honours_the_shared_contract() {
    let pane = Pane {
        id: "%41".to_string(),
        session: "contract-fake".to_string(),
        window: "origin".to_string(),
        title: String::new(),
    };
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
    };

    block_on(tmux_contract(&tmux, &fixture));
    assert_eq!(
        tmux.calls(),
        [
            "list_panes",
            "capture:%41:100",
            "user_typing:%41",
            "send_keys:%41:literal | payload",
            "capture:%41:100",
            "new_window:contract-fake:contract-created",
            "kill:%101",
            "list_panes",
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
    let tmux = TmuxAdapter::for_session(&session.name);
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
    };

    block_on(tmux_contract(&tmux, &fixture));
}

#[test]
fn capture_proves_zero_and_more_than_the_pane_contains() {
    let Some(session) = TestSession::start_or_skip("capture") else {
        return;
    };
    let tmux = TmuxAdapter::for_session(&session.name);
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

#[test]
fn pane_in_mode_is_the_only_typing_fact_this_adapter_claims() {
    let Some(session) = TestSession::start_or_skip("typing") else {
        return;
    };
    let tmux = TmuxAdapter::for_session(&session.name);
    let pane = block_on(tmux.list_panes())
        .expect("list isolated panes")
        .into_iter()
        .next()
        .expect("isolated session pane");

    assert!(!block_on(tmux.user_typing(&pane.id)).expect("plain pane mode"));
    session.run(["copy-mode", "-t", &pane.id]);
    assert!(block_on(tmux.user_typing(&pane.id)).expect("copy mode"));
}

#[test]
fn kill_refuses_an_id_not_freshly_resolved_in_the_owned_session() {
    let Some(session) = TestSession::start_or_skip("kill-brake") else {
        return;
    };
    let tmux = TmuxAdapter::for_session(&session.name);

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
        let session = Self { name };
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
            .args(["kill-session", "-t", &self.name])
            .output();
        if let Ok(output) = output
            && !output.status.success()
            && !std::thread::panicking()
        {
            panic!(
                "failed to tear down isolated tmux session {}: {}",
                self.name,
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }
}
