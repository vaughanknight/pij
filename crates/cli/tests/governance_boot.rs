//! Shipped all-real boot, with every native side effect confined to this fixture.
//! Run on Unix with tmux installed; a missing prerequisite is a failure, not a skip.
//! No process-global environment mutation and no production daemon/tmux probes.

#![cfg(unix)]

use std::ffi::{OsStr, OsString};
use std::fs::{self, File};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

use pij_testkit::fresh_dir;
use serde_json::Value;

const STARTUP: Duration = Duration::from_secs(30);
const COMMAND: Duration = Duration::from_secs(10);
const POLL: Duration = Duration::from_millis(20);

struct Environment {
    root: PathBuf,
    path: OsString,
    address: SocketAddr,
    tmux: Option<String>,
    pane: Option<String>,
}

impl Environment {
    fn command(&self, program: impl AsRef<OsStr>) -> Command {
        let mut command = Command::new(program);
        command
            .env_clear()
            .env("PATH", &self.path)
            .env("HOME", self.root.join("home"))
            .env("CLAUDE_CONFIG_DIR", self.root.join("home/.claude"))
            .env("XDG_CONFIG_HOME", self.root.join("home/.config"))
            .env("PIJ_RS_STATE_DIR", self.root.join("state"))
            .env("PIJ_RS_ADDR", self.address.to_string())
            .env("PIJ_RS_BIND", self.address.to_string())
            .env("TMUX_TMPDIR", "/tmp")
            .env("SHELL", "/bin/sh")
            .env("TERM", "xterm-256color")
            .env("LC_ALL", "C")
            .current_dir(&self.root)
            .stdin(Stdio::null());
        if let Some(tmux) = &self.tmux {
            command.env("TMUX", tmux);
        }
        if let Some(pane) = &self.pane {
            command.env("TMUX_PANE", pane);
        }
        command
    }

    fn cli(&self) -> Command {
        let mut command = self.command(env!("CARGO_BIN_EXE_pij-rs"));
        command
            .arg("--json")
            .arg("--state-dir")
            .arg(self.root.join("state"))
            .arg("--addr")
            .arg(self.address.to_string());
        command
    }
}

impl Drop for Environment {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

/// File-backed output cannot deadlock a verbose child on a full pipe.
/// The child handle, not a registry PID, owns every fallback kill and reap.
struct Process {
    child: Child,
    stdout: PathBuf,
    stderr: PathBuf,
}

impl Process {
    fn spawn(command: &mut Command, root: &Path, label: &str) -> Self {
        let stdout = root.join(format!("{label}.stdout"));
        let stderr = root.join(format!("{label}.stderr"));
        let child = command
            .stdout(File::create(&stdout).expect("stdout log"))
            .stderr(File::create(&stderr).expect("stderr log"))
            .spawn()
            .unwrap_or_else(|error| panic!("start {label}: {error}; command={command:?}"));
        Self {
            child,
            stdout,
            stderr,
        }
    }

    fn output(&self) -> String {
        fs::read_to_string(&self.stdout).expect("read stdout")
    }

    fn diagnostics(&self) -> String {
        format!(
            "stdout={}\nstderr={}",
            self.output(),
            fs::read_to_string(&self.stderr).unwrap_or_default()
        )
    }

    fn running(&mut self) {
        assert!(
            self.child.try_wait().expect("child status").is_none(),
            "child exited early: {}",
            self.diagnostics()
        );
    }

    async fn wait(&mut self, bound: Duration) -> ExitStatus {
        let deadline = Instant::now() + bound;
        loop {
            if let Some(status) = self.child.try_wait().expect("child status") {
                return status;
            }
            assert!(
                Instant::now() < deadline,
                "child timed out: {}",
                self.diagnostics()
            );
            tokio::time::sleep(POLL).await;
        }
    }

    async fn wait_for(&mut self, predicate: impl Fn(&str) -> bool) {
        let deadline = Instant::now() + STARTUP;
        loop {
            if predicate(&self.output()) {
                return;
            }
            self.running();
            assert!(
                Instant::now() < deadline,
                "expected output did not arrive: {}",
                self.diagnostics()
            );
            tokio::time::sleep(POLL).await;
        }
    }

    async fn interrupt(&mut self, environment: &Environment, label: &str) {
        self.running();
        // This is our unreaped Child's PID. It cannot be reused between this
        // check and signalling; no registry/process-name lookup chooses a target.
        let mut signal = environment.command("kill");
        signal.args(["-INT", &self.child.id().to_string()]);
        let mut signal = Self::spawn(&mut signal, &environment.root, label);
        assert!(
            signal.wait(COMMAND).await.success(),
            "signal owned child: {}",
            signal.diagnostics()
        );
        assert!(
            self.wait(COMMAND).await.success(),
            "graceful shutdown: {}",
            self.diagnostics()
        );
    }
}

impl Drop for Process {
    fn drop(&mut self) {
        if !matches!(self.child.try_wait(), Ok(Some(_))) {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }
}

/// Own a foreground (-D) tmux server, not a detached server borrowed from a user.
struct PrivateTmux {
    server: Process,
    label: String,
    path: OsString,
    root: PathBuf,
    socket: Option<PathBuf>,
}

impl Drop for PrivateTmux {
    fn drop(&mut self) {
        // Even on panic, first ask OUR named server to close its panes. Bound the
        // control client; Process::drop then kills/reaps the foreground fallback.
        let mut command = Command::new("tmux");
        command
            .env_clear()
            .env("PATH", &self.path)
            .env("HOME", self.root.join("home"))
            .env("TMUX_TMPDIR", "/tmp")
            .args(["-L", &self.label, "kill-server"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if let Ok(mut client) = command.spawn() {
            let deadline = Instant::now() + Duration::from_secs(3);
            while matches!(client.try_wait(), Ok(None)) && Instant::now() < deadline {
                std::thread::sleep(POLL);
            }
            if !matches!(client.try_wait(), Ok(Some(_))) {
                let _ = client.kill();
            }
            let _ = client.wait();
        }
        if !matches!(self.server.child.try_wait(), Ok(Some(_))) {
            let _ = self.server.child.kill();
            let _ = self.server.child.wait();
        }
        if let Some(socket) = &self.socket {
            let _ = fs::remove_file(socket);
        }
    }
}

async fn run_json(environment: &Environment, args: &[&str], label: &str) -> Value {
    let mut command = environment.cli();
    command.args(args);
    let mut process = Process::spawn(&mut command, &environment.root, label);
    assert!(
        process.wait(COMMAND).await.success(),
        "CLI {label}: {}",
        process.diagnostics()
    );
    let value: Value = serde_json::from_str(process.output().trim()).expect("CLI JSON envelope");
    assert_eq!(value["ok"], true, "CLI {label}: {value}");
    assert_eq!(value["v"], 2);
    value
}

fn frames(text: &str) -> Vec<Value> {
    // The writer can be between bytes of its final line. Only complete NDJSON
    // lines are evidence; malformed COMPLETE lines still fail the test.
    text.split_inclusive('\n')
        .filter(|line| line.ends_with('\n'))
        .map(|line| serde_json::from_str(line).expect("complete event frame"))
        .collect()
}

#[tokio::test]
async fn shipped_all_real_daemon_boots_and_streams_on_fully_private_resources() {
    let root = fresh_dir("p139-boot")
        .canonicalize()
        .expect("native fixture directory");
    for path in ["home/.claude", "home/.config", "state"] {
        fs::create_dir_all(root.join(path)).expect("private directory");
    }
    // Keep the reservation until immediately before spawning the daemon. A bind
    // race fails with its real startup log; it never falls back to port 7461.
    let reservation = TcpListener::bind("127.0.0.1:0").expect("reserve private port");
    let address = reservation.local_addr().unwrap();
    assert_ne!(address.port(), 7461);
    let mut environment = Environment {
        root,
        path: std::env::var_os("PATH").expect("PATH for installed tmux and system tools"),
        address,
        tmux: None,
        pane: None,
    };
    let label = environment
        .root
        .file_name()
        .unwrap()
        .to_string_lossy()
        .into_owned();
    let mut start = environment.command("tmux");
    start.args(["-L", &label, "-f", "/dev/null", "-D"]);
    let mut tmux = PrivateTmux {
        server: Process::spawn(&mut start, &environment.root, "tmux-server"),
        label,
        path: environment.path.clone(),
        root: environment.root.clone(),
        socket: None,
    };
    // show-options does not auto-start a server. Wait until OUR foreground
    // server is responsive before issuing new-session, which otherwise can.
    let deadline = Instant::now() + STARTUP;
    loop {
        tmux.server.running();
        let mut probe = environment.command("tmux");
        probe.args(["-L", &tmux.label, "show-options", "-s", "exit-empty"]);
        let mut probe = Process::spawn(&mut probe, &environment.root, "tmux-ready");
        if probe.wait(COMMAND).await.success() {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "private tmux readiness: {}",
            tmux.server.diagnostics()
        );
        tokio::time::sleep(POLL).await;
    }
    let mut create = environment.command("tmux");
    create
        .args([
            "-L",
            &tmux.label,
            "new-session",
            "-d",
            "-s",
            "governance-boot",
            "-n",
            "owned-pane",
            "-P",
            "-F",
            "#{socket_path}|#{pid}|#{pane_id}",
            "-c",
        ])
        .arg(&environment.root)
        .arg("exec /bin/sleep 300");
    let mut create = Process::spawn(&mut create, &environment.root, "tmux-session");
    assert!(
        create.wait(COMMAND).await.success(),
        "create private pane: {}",
        create.diagnostics()
    );
    let identity = create.output();
    let parts: Vec<_> = identity.trim().split('|').collect();
    assert_eq!(
        parts.len(),
        3,
        "actual private socket/server/pane: {identity}"
    );
    let socket = PathBuf::from(parts[0]);
    assert!(socket.exists(), "actual private tmux socket exists");
    tmux.socket = Some(socket.clone());
    assert_eq!(
        parts[1].parse::<u32>().unwrap(),
        tmux.server.child.id(),
        "-D server is the child this fixture owns"
    );
    let pane = parts[2].to_string();
    environment.tmux = Some(format!("{},{},0", socket.display(), parts[1]));
    environment.pane = Some(pane.clone());
    // No -L/-S here: prove the inherited TMUX used by daemon AND clients selects
    // only our private server. We never enumerate the user's default server.
    let mut probe = environment.command("tmux");
    probe.args(["list-panes", "-a", "-F", "#{pane_id}"]);
    let mut probe = Process::spawn(&mut probe, &environment.root, "tmux-environment");
    assert!(
        probe.wait(COMMAND).await.success(),
        "TMUX selection: {}",
        probe.diagnostics()
    );
    assert_eq!(probe.output().trim(), pane);

    let mut boot = environment.command(env!("CARGO_BIN_EXE_pij-rs"));
    boot.arg("--state-dir")
        .arg(environment.root.join("state"))
        .args(["daemon", "--bind", &address.to_string()]);
    drop(reservation);
    let mut daemon = Process::spawn(&mut boot, &environment.root, "daemon");
    daemon
        .wait_for(|text| {
            text.contains(&format!("pij-rs daemon: listening on {address}"))
                && text.contains("offline=false")
        })
        .await;
    TcpStream::connect_timeout(&address, COMMAND).expect("announced private listener accepts TCP");
    let ping = run_json(&environment, &["ping"], "ping").await;
    assert_eq!(ping["data"]["status"], "healthy");
    assert_eq!(ping["data"]["offline"], false);
    assert!(
        environment.root.join("state/pij.sqlite").is_file(),
        "real store exists"
    );
    assert!(
        environment.root.join("state/daemon.key").is_file(),
        "private authentication key exists"
    );

    let adopted = run_json(&environment, &["adopt", &pane, "--harness", "omp"], "adopt").await;
    let seat = adopted["data"]["id"].as_str().expect("adopted seat");
    assert_eq!(adopted["data"]["pane"], pane);
    assert_eq!(
        adopted["data"]["folder"],
        environment.root.to_string_lossy().as_ref()
    );
    assert!(
        adopted["data"]["proc"]["proc_start"].as_u64().unwrap() > 0,
        "real process corroboration"
    );
    let machine = ping["data"]["machine"].as_str().unwrap();
    let mut tail_command = environment.cli();
    tail_command.args(["tail", "--since", &format!("{machine}=0")]);
    let mut tail = Process::spawn(&mut tail_command, &environment.root, "events");
    // CLI tail validates and consumes the real Hello before printing any frame.
    tail.wait_for(|text| {
        frames(text)
            .iter()
            .any(|frame| frame["event"]["kind"] == "seat.put" && frame["event"]["seat"] == seat)
    })
    .await;
    let contract: Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../docs/plans/139-rs-governance-port/assets/contracts/governance-events.json"
    )))
    .unwrap();
    let card = &contract["events"]
        .as_array()
        .unwrap()
        .iter()
        .find(|case| case["id"] == "report-now")
        .unwrap()["decoded_payload"];
    let report = run_json(
        &environment,
        &[
            "report",
            "now",
            card["did"].as_str().unwrap(),
            card["next"].as_str().unwrap(),
        ],
        "report",
    )
    .await;
    let seq = report["data"]["seq"].as_u64().unwrap();
    tail.wait_for(|text| {
        frames(text)
            .iter()
            .any(|frame| frame["cursor"] == seq && frame["event"]["kind"] == "report.now")
    })
    .await;
    let observed = frames(&tail.output());
    let frame = observed
        .iter()
        .find(|frame| frame["cursor"] == seq)
        .unwrap();
    assert_eq!(frame["machine"], machine);
    assert_eq!(frame["event"]["seat"], seat);
    assert!(frame["event"]["at"].as_u64().unwrap() > 0);
    assert_eq!(
        serde_json::from_str::<Value>(frame["event"]["payload"].as_str().unwrap()).unwrap(),
        *card
    );
    let roster = run_json(&environment, &["list"], "list").await;
    let seats = roster["data"]["seats"].as_array().unwrap();
    assert_eq!(
        seats.len(),
        1,
        "fresh private daemon must not acquire foreign seats: {roster}"
    );
    assert_eq!(seats[0]["pane"], pane);

    // Close the event client first so graceful HTTP shutdown can finish, then
    // the daemon (which drains admitted publications), then our private server.
    tail.interrupt(&environment, "interrupt-events").await;
    daemon.interrupt(&environment, "interrupt-daemon").await;
    let mut stop = environment.command("tmux");
    stop.args(["-L", &tmux.label, "kill-server"]);
    let mut stop = Process::spawn(&mut stop, &environment.root, "stop-tmux");
    assert!(
        stop.wait(COMMAND).await.success(),
        "private server teardown: {}",
        stop.diagnostics()
    );
    assert!(
        tmux.server.wait(COMMAND).await.success(),
        "foreground tmux exits cleanly"
    );
    // tmux may leave the pathname after a clean exit; this fixture owns it.
    if let Err(error) = fs::remove_file(&socket) {
        assert_eq!(
            error.kind(),
            std::io::ErrorKind::NotFound,
            "unlink owned socket"
        );
    }
    assert!(!socket.exists(), "owned tmux socket was removed");
}
