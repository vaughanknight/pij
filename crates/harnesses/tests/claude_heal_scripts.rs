//! Plan 156 AC4 — the Claude status line and SessionStart hook heal a seat.
//!
//! Script-level: a fake `pij-rs` on PATH answers `whoami` with a miss, records
//! every `adopt`, and takes 3 s to do it, so a render that waited on the heal
//! would be visibly slow. `ping` succeeds only once `daemon-up` exists, so the
//! hook's background retry can be shown to outlast a late daemon.
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const FAKE_PIJ_RS: &str = r#"#!/bin/sh
dir=$(dirname "$0")
case " $* " in
  *" whoami "*) printf '%s\n' '{"ok":false,"error":"refused"}'; exit 1 ;;
  *" ping "*|"ping "*) [ -f "$dir/daemon-up" ] ;;
  *" adopt "*|"adopt "*) printf '%s\n' "$*" >>"$dir/adopts"; sleep 3 ;;
esac
"#;

fn script(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../harness/scripts")
        .join(name)
}

fn run(root: &Path, name: &str, payload: &str) -> (String, Duration) {
    let path = format!(
        "{}:{}",
        root.join("bin").display(),
        std::env::var("PATH").unwrap()
    );
    let started = Instant::now();
    let mut child = Command::new("sh")
        .arg(script(name))
        .env("PATH", path)
        .env("HOME", root)
        .env("PIJ_RS_STATE_DIR", root.join("state"))
        .env("TMUX_PANE", "%9")
        .env("PIJ_RS_HOOK_RETRIES", "8")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("run script");
    use std::io::Write as _;
    child
        .stdin
        .take()
        .unwrap()
        .write_all(payload.as_bytes())
        .unwrap();
    // The caller (Claude) reads to EOF: a background job holding stdout would
    // block here, which is exactly the render stall this test forbids.
    let output = child.wait_with_output().expect("script output");
    (
        String::from_utf8_lossy(&output.stdout).into_owned(),
        started.elapsed(),
    )
}

fn adopts(root: &Path) -> Vec<String> {
    std::fs::read_to_string(root.join("bin/adopts"))
        .unwrap_or_default()
        .lines()
        .map(str::to_string)
        .collect()
}

fn eventually(what: &str, mut done: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !done() {
        assert!(Instant::now() < deadline, "timed out waiting for {what}");
        std::thread::sleep(Duration::from_millis(50));
    }
}

#[test]
fn status_line_fires_one_detached_adopt_per_window_and_hook_outlasts_a_late_daemon() {
    let root = pij_testkit::fresh_dir("pij-claude-heal");
    std::fs::create_dir_all(root.join("bin")).unwrap();
    // The legacy CLI is shadowed with a miss: the real one would consult the
    // operator's legacy daemon about pane %9.
    for (name, body) in [("pij-rs", FAKE_PIJ_RS), ("pij", "#!/bin/sh\nexit 1\n")] {
        let fake = root.join("bin").join(name);
        std::fs::write(&fake, body).unwrap();
        let mut permissions = std::fs::metadata(&fake).unwrap().permissions();
        std::os::unix::fs::PermissionsExt::set_mode(&mut permissions, 0o755);
        std::fs::set_permissions(&fake, permissions).unwrap();
    }
    let payload = format!(
        r#"{{"session_id":"S-156","workspace":{{"current_dir":"{}"}},"model":{{"display_name":"Opus"}}}}"#,
        root.display()
    );

    // Three renders inside one window: each is fast, says it is registering,
    // and together they fire exactly one adopt carrying the payload session.
    for _ in 0..3 {
        let (rendered, took) = run(&root, "claude-statusline-pij.sh", &payload);
        assert!(
            took < Duration::from_secs(2),
            "render waited on the heal: {took:?}"
        );
        assert!(rendered.contains("registering"), "{rendered}");
    }
    eventually("the status-line adopt", || !adopts(&root).is_empty());
    std::thread::sleep(Duration::from_millis(300));
    assert_eq!(
        adopts(&root),
        ["adopt %9 --harness claude --harness-session S-156"],
        "one adopt per pane per rate window"
    );

    // The hook, with no daemon yet: returns at once, then adopts once it appears.
    std::fs::remove_file(root.join("bin/adopts")).unwrap();
    let (_, took) = run(&root, "claude-session-start-pij.sh", &payload);
    assert!(
        took < Duration::from_secs(2),
        "hook held Claude's start: {took:?}"
    );
    std::thread::sleep(Duration::from_millis(1500));
    assert!(
        adopts(&root).is_empty(),
        "no adopt before the daemon exists"
    );
    std::fs::write(root.join("bin/daemon-up"), "").unwrap();
    eventually("the hook's retried adopt", || !adopts(&root).is_empty());

    let log = std::fs::read_to_string(root.join("state/hook.log")).unwrap();
    assert!(log.lines().count() >= 1, "{log}");
    for line in log.lines() {
        let stamp = line.split(' ').next().unwrap();
        assert!(
            stamp.len() == 20 && stamp.ends_with('Z') && stamp.as_bytes()[10] == b'T',
            "every line is RFC 3339 stamped: {line}"
        );
    }
    let _ = std::fs::remove_dir_all(root);
}
