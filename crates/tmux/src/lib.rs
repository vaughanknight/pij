//! Real tmux adapter. Every Rust-workspace tmux syscall lives in this crate.

mod parse;

use std::collections::BTreeMap;
use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom};
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use pij_core::error::{PijError, Result};
use pij_core::model::{Pane, PaneProcess};
use pij_core::ports::{LaunchCommand, TmuxPort};
use tokio::time::{Instant, sleep};

use crate::parse::{LIST_FORMAT, parse_one_pane, parse_panes};

/// Deterministic sink identity shared by composition and the adapter authority.
#[must_use]
pub fn tap_sink_path(root: &Path, pane: &str) -> PathBuf {
    let safe: String = pane
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect();
    root.join(format!("{safe}.raw"))
}

const TAP_SINK_OPTION: &str = "@pij-tap-sink";

/// The real [`TmuxPort`] implementation.
///
/// A scoped adapter limits pane listings and destructive guards to one tmux
/// session. Tests must use [`TmuxAdapter::for_session`] so they cannot observe
/// or kill the operator's fleet.
///
/// `user_typing` reports only `pane_in_mode`, a fact tmux itself exposes. `false`
/// means "no tmux-observable interaction" and MUST NOT be documented, or read,
/// as "safe to inject". The wave-2 `HarnessPort` adapter must AND this fact with
/// its stateful composer-history and tap-byte gate.
///
/// # Composition recipe
///
/// COMPOSED in `crates/daemon/src/lib.rs`:
/// `AdapterChoice::Real => Arc::new(TmuxAdapter::new(pane_signal_dir)),`.
/// The same root is passed to `PaneObserver`; the adapter derives each exact sink
/// identity from it before attach or marker-fallback detach.
#[derive(Clone, Debug)]
pub struct TmuxAdapter {
    binary: OsString,
    server: Option<String>,
    session: Option<String>,
    tap_root: PathBuf,
    taps: Arc<Mutex<BTreeMap<String, TapState>>>,
}

#[derive(Debug)]
struct TapState {
    path: PathBuf,
    offset: u64,
}

impl TmuxAdapter {
    /// Use `tmux` resolved from `PATH` and permit workspace-wide pane listings.
    pub fn new(tap_root: impl Into<PathBuf>) -> Self {
        Self {
            binary: OsString::from("tmux"),
            server: None,
            session: None,
            tap_root: tap_root.into(),
            taps: Arc::new(Mutex::new(BTreeMap::new())),
        }
    }

    /// Limit listings, new windows, and destructive guards to `session`.
    pub fn for_session(session: impl Into<String>, tap_root: impl Into<PathBuf>) -> Self {
        Self {
            binary: OsString::from("tmux"),
            server: None,
            session: Some(session.into()),
            tap_root: tap_root.into(),
            taps: Arc::new(Mutex::new(BTreeMap::new())),
        }
    }

    /// Inject the executable path while retaining the production argv contract.
    pub fn with_binary(binary: impl Into<OsString>, tap_root: impl Into<PathBuf>) -> Self {
        Self {
            binary: binary.into(),
            server: None,
            session: None,
            tap_root: tap_root.into(),
            taps: Arc::new(Mutex::new(BTreeMap::new())),
        }
    }

    /// Use an isolated named tmux server, invisible to the user's live server.
    ///
    /// Real integration fixtures use this instead of sharing a mutable global
    /// server with production daemons that legitimately attach pane pipes.
    pub fn for_server(server: impl Into<String>, tap_root: impl Into<PathBuf>) -> Self {
        Self {
            binary: OsString::from("tmux"),
            server: Some(server.into()),
            session: None,
            tap_root: tap_root.into(),
            taps: Arc::new(Mutex::new(BTreeMap::new())),
        }
    }

    fn list_args(&self) -> Vec<OsString> {
        let mut args = vec![OsString::from("list-panes")];
        match &self.session {
            Some(session) => {
                args.push(OsString::from("-s"));
                args.push(OsString::from("-t"));
                args.push(OsString::from(session));
            }
            None => args.push(OsString::from("-a")),
        }
        args.push(OsString::from("-F"));
        args.push(OsString::from(LIST_FORMAT));
        args
    }

    fn run(&self, operation: &str, args: &[OsString]) -> Result<Output> {
        let mut command = Command::new(&self.binary);
        if let Some(server) = &self.server {
            command.args(["-L", server]);
        }
        let output = command
            .args(args)
            .output()
            .map_err(|error| self.spawn_error(operation, error))?;
        if output.status.success() {
            return Ok(output);
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let status = output
            .status
            .code()
            .map_or_else(|| "signal".to_string(), |code| format!("exit {code}"));
        Err(self.error(format!(
            "{operation} failed ({status}): {} — run `tmux list-panes -a` to verify the target",
            if stderr.is_empty() {
                "tmux returned no diagnostic"
            } else {
                &stderr
            }
        )))
    }

    fn stdout(&self, operation: &str, args: &[OsString]) -> Result<String> {
        let output = self.run(operation, args)?;
        String::from_utf8(output.stdout).map_err(|error| {
            self.error(format!(
                "{operation} returned non-UTF-8 output: {error} — set tmux output to UTF-8 and retry"
            ))
        })
    }

    fn spawn_error(&self, operation: &str, error: io::Error) -> PijError {
        let fix = if error.kind() == io::ErrorKind::NotFound {
            "install tmux and ensure its executable is on PATH"
        } else {
            "verify the tmux executable and retry"
        };
        self.error(format!(
            "could not start {:?} for {operation}: {error} — {fix}",
            self.binary
        ))
    }

    fn error(&self, message: String) -> PijError {
        PijError::Adapter {
            adapter: "tmux".to_string(),
            message,
        }
    }

    async fn wait_for_pipe_state(
        &self,
        pane: &str,
        sink: &Path,
        expected: &str,
        operation: &str,
    ) -> Result<()> {
        let started = Instant::now();
        let deadline = started + Duration::from_secs(2);
        loop {
            let pipe = self.stdout(
                &format!("verify pipe-pane {operation}"),
                &os_args(["display-message", "-p", "-t", pane, "#{pane_pipe}"]),
            )?;
            let observed = pipe.trim();
            if observed == expected {
                return Ok(());
            }
            if !matches!(observed, "0" | "1") {
                return Err(self.error(format!(
                    "pane_pipe for {pane:?} was {observed:?} while verifying {operation}, expected 0 or 1"
                )));
            }
            if Instant::now() >= deadline {
                return Err(self.error(format!(
                    "pipe-pane {operation} did not converge for pane {pane:?}, sink {sink:?}, within {:?}: expected pane_pipe={expected}, observed {observed} — ownership marker and sink retained; the next observer sweep will retry",
                    started.elapsed()
                )));
            }
            sleep(Duration::from_millis(25)).await;
        }
    }

    fn ensure_session(&self, session: &str) -> Result<()> {
        if self.session.as_deref().is_none_or(|owned| owned == session) {
            return Ok(());
        }
        Err(self.error(format!(
            "refusing new-window in session {session:?}: this adapter is scoped to {:?} — use an adapter scoped to the requested session",
            self.session.as_deref().unwrap_or_default()
        )))
    }

    fn expected_tap_sink(&self, pane: &str) -> PathBuf {
        tap_sink_path(&self.tap_root, pane)
    }
    fn tap_marker(&self, pane: &str) -> Result<Option<String>> {
        let value = self.stdout(
            "show-options tap owner",
            &os_args([
                "show-options",
                "-p",
                "-v",
                "-q",
                "-t",
                pane,
                TAP_SINK_OPTION,
            ]),
        )?;
        let value = value.trim_end();
        Ok((!value.is_empty()).then(|| value.to_string()))
    }

    fn set_tap_marker(&self, pane: &str, sink: &str) -> Result<()> {
        self.run(
            "set-options tap owner",
            &os_args(["set-option", "-p", "-t", pane, TAP_SINK_OPTION, sink]),
        )?;
        Ok(())
    }

    fn clear_tap_marker(&self, pane: &str) -> Result<()> {
        self.run(
            "clear-options tap owner",
            &os_args(["set-option", "-p", "-u", "-t", pane, TAP_SINK_OPTION]),
        )?;
        Ok(())
    }
}

#[async_trait]
impl TmuxPort for TmuxAdapter {
    async fn list_panes(&self) -> Result<Vec<Pane>> {
        let output = self.stdout("list-panes", &self.list_args())?;
        parse_panes(&output)
    }

    async fn pane_process(&self, pane: &str) -> Result<Option<PaneProcess>> {
        // ONE tmux call for both facts, so pid and cwd cannot describe two
        // different moments of the same pane.
        let Ok(output) = self.stdout(
            "display-message pane_pid/pane_current_path",
            &os_args([
                "display-message",
                "-p",
                "-t",
                pane,
                "#{pane_pid}\t#{pane_current_path}",
            ]),
        ) else {
            // tmux failed. Ask the ONE question that separates the two causes: is
            // the pane gone (an answer adoption needs, and a refusal it must make)
            // or did tmux itself fail (an error nothing should swallow)? Same
            // pattern the detach path already uses.
            return if self
                .list_panes()
                .await?
                .iter()
                .any(|listed| listed.id == pane)
            {
                Err(self.error(format!(
                    "could not read pane_pid/pane_current_path for {pane:?} though tmux still lists it"
                )))
            } else {
                Ok(None)
            };
        };
        let line = output.trim_end_matches('\n');
        let Some((pid, cwd)) = line.split_once('\t') else {
            return Err(self.error(format!(
                "display-message for {pane:?} returned {line:?}, expected `<pid>\\t<path>` — update pij-tmux for this tmux wire shape"
            )));
        };
        let pid = pid.trim().parse::<u32>().map_err(|error| {
            self.error(format!(
                "pane_pid for {pane:?} was {pid:?}, which is not a pid: {error}"
            ))
        })?;
        Ok(Some(PaneProcess {
            pid,
            cwd: cwd.to_string(),
        }))
    }

    async fn submit(&self, pane: &str, text: &str) -> Result<()> {
        // Two calls, deliberately: the literal text, then Enter as a NAMED key.
        // `-l` makes tmux treat everything as literal, so an Enter cannot be
        // smuggled inside the text — which is the property that keeps a body
        // containing a newline from submitting itself halfway through.
        self.run("send-keys", &os_args(["send-keys", "-t", pane, "-l", text]))?;
        self.run("send-keys", &os_args(["send-keys", "-t", pane, "Enter"]))?;
        Ok(())
    }

    async fn send_keys(&self, pane: &str, keys: &str) -> Result<()> {
        self.run("send-keys", &os_args(["send-keys", "-t", pane, "-l", keys]))?;
        Ok(())
    }

    async fn capture(&self, pane: &str, lines: u32) -> Result<String> {
        if lines == 0 {
            return Ok(String::new());
        }
        let output = self.stdout(
            "capture-pane",
            &os_args(["capture-pane", "-p", "-J", "-t", pane]),
        )?;
        let rows: Vec<&str> = output.lines().collect();
        let keep = usize::try_from(lines).unwrap_or(usize::MAX).min(rows.len());
        Ok(rows[rows.len() - keep..].join("\n"))
    }

    async fn attach_pane_tap(&self, pane: &str, sink: &Path) -> Result<()> {
        let expected = self.expected_tap_sink(pane);
        if sink != expected {
            return Err(self.error(format!(
                "tap sink {sink:?} does not match this adapter's expected sink {expected:?} for pane {pane:?}"
            )));
        }
        let tracked = {
            let taps = self.taps.lock().expect("tmux tap mutex");
            match taps.get(pane) {
                Some(existing) if existing.path == sink => true,
                Some(existing) => {
                    return Err(self.error(format!(
                        "pane {pane:?} already has a tap at {:?} — detach it before changing sinks",
                        existing.path
                    )));
                }
                None => false,
            }
        };
        let sink_text = sink.to_str().ok_or_else(|| {
            self.error(format!(
                "tap sink {sink:?} is not valid Unicode — choose a UTF-8 state directory"
            ))
        })?;
        let marker = self.tap_marker(pane)?;
        let marker_matches = marker.as_deref() == Some(sink_text);
        match self
            .stdout(
                "display-message pane_pipe",
                &os_args(["display-message", "-p", "-t", pane, "#{pane_pipe}"]),
            )?
            .trim()
        {
            "0" => {}
            "1" if tracked && marker_matches => return Ok(()),
            // A matching pane-scoped marker is durable ownership evidence from a
            // prior daemon. Replacing that orphan is adoption, not clobbering.
            "1" if marker_matches => {}
            "1" => {
                return Err(self.error(format!(
                    "pane {pane:?} already has an output pipe not owned by this sink — refusing to replace it"
                )));
            }
            other => {
                return Err(self.error(format!(
                    "pane_pipe for {pane:?} was {other:?}, expected 0 or 1 — update pij-tmux for this tmux version"
                )));
            }
        }
        if let Some(parent) = sink.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                self.error(format!(
                    "could not create tap directory {parent:?}: {error}"
                ))
            })?;
        }
        let sink_file = OpenOptions::new()
            .create(true)
            .truncate(!tracked)
            .write(true)
            .mode(0o600)
            .open(sink)
            .map_err(|error| self.error(format!("could not create tap sink {sink:?}: {error}")))?;
        sink_file
            .set_permissions(fs::Permissions::from_mode(0o600))
            .map_err(|error| {
                self.error(format!(
                    "could not secure tap sink {sink:?} to mode 0600: {error}"
                ))
            })?;
        drop(sink_file);

        // Persist ownership before creating the resource. A crash after this
        // write but before pipe creation leaves a marker plus pane_pipe=0, which
        // the next daemon can complete. The inverse order leaves an unmarked
        // orphan that no future process may safely adopt.
        self.set_tap_marker(pane, sink_text)?;

        let command = format!("cat >> {}", shell_quote(sink_text));
        // `-o` is intentionally absent. tmux defines it as a toggle: a repeated
        // attach closes an existing pipe. The marker above distinguishes our
        // restart orphan from a foreign pipe before this replacement can happen.
        if let Err(error) = self.run(
            "pipe-pane attach",
            &os_args(["pipe-pane", "-O", "-t", pane, &command]),
        ) {
            let _ = self.clear_tap_marker(pane);
            if !tracked {
                let _ = fs::remove_file(sink);
            }
            return Err(error);
        }
        self.wait_for_pipe_state(pane, sink, "1", "attach").await?;
        if !tracked {
            self.taps.lock().expect("tmux tap mutex").insert(
                pane.to_string(),
                TapState {
                    path: sink.to_path_buf(),
                    offset: 0,
                },
            );
        }
        Ok(())
    }

    async fn pane_tap_sink(&self, pane: &str) -> Result<Option<PathBuf>> {
        Ok(self.tap_marker(pane)?.map(PathBuf::from))
    }

    async fn drain_pane_tap(&self, pane: &str) -> Result<Vec<u8>> {
        let mut taps = self.taps.lock().expect("tmux tap mutex");
        let tap = taps.get_mut(pane).ok_or_else(|| {
            self.error(format!(
                "pane {pane:?} has no attached tap — attach it before draining"
            ))
        })?;
        let mut file = File::open(&tap.path).map_err(|error| {
            self.error(format!("could not open tap sink {:?}: {error}", tap.path))
        })?;
        let length = file
            .metadata()
            .map_err(|error| {
                self.error(format!(
                    "could not inspect tap sink {:?}: {error}",
                    tap.path
                ))
            })?
            .len();
        let offset = tap.offset.min(length);
        file.seek(SeekFrom::Start(offset)).map_err(|error| {
            self.error(format!("could not seek tap sink {:?}: {error}", tap.path))
        })?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).map_err(|error| {
            self.error(format!("could not drain tap sink {:?}: {error}", tap.path))
        })?;
        tap.offset = offset + u64::try_from(bytes.len()).unwrap_or(u64::MAX);
        Ok(bytes)
    }

    async fn detach_pane_tap(&self, pane: &str) -> Result<()> {
        let local_path = self
            .taps
            .lock()
            .expect("tmux tap mutex")
            .get(pane)
            .map(|tap| tap.path.clone());
        let path = match local_path {
            Some(path) => path,
            None => {
                let marker = self.tap_marker(pane)?.map(PathBuf::from).ok_or_else(|| {
                    self.error(format!("pane {pane:?} has no owned tap to detach"))
                })?;
                let expected = self.expected_tap_sink(pane);
                if marker != expected {
                    return Err(self.error(format!(
                        "refusing to detach foreign tap on pane {pane:?}: marker {marker:?} does not match expected {expected:?}"
                    )));
                }
                marker
            }
        };

        let detach = self.run("pipe-pane detach", &os_args(["pipe-pane", "-t", pane]));
        let pane_exists = self
            .list_panes()
            .await?
            .iter()
            .any(|listed| listed.id == pane);
        if let Err(error) = detach
            && pane_exists
        {
            return Err(error);
        }
        if pane_exists {
            self.wait_for_pipe_state(pane, &path, "0", "detach").await?;
            self.clear_tap_marker(pane)?;
        }

        self.taps.lock().expect("tmux tap mutex").remove(pane);
        match fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(self.error(format!("could not remove tap sink {path:?}: {error}"))),
        }
    }

    async fn kill(&self, pane: &str) -> Result<()> {
        // This fresh resolution is a one-directional brake: removing it can only
        // make kill-pane happen more often. It never chooses a different target.
        if !self
            .list_panes()
            .await?
            .iter()
            .any(|listed| listed.id == pane)
        {
            return Err(self.error(format!(
                "refusing kill-pane for {pane:?}: a fresh list-panes did not resolve that id — refresh the pane listing and retry"
            )));
        }
        self.run("kill-pane", &os_args(["kill-pane", "-t", pane]))?;
        Ok(())
    }

    async fn new_window(
        &self,
        session: &str,
        name: &str,
        cwd: &str,
        command: Option<&LaunchCommand>,
    ) -> Result<Pane> {
        self.ensure_session(session)?;
        let output = self.stdout("new-window", &new_window_args(session, name, cwd, command))?;
        parse_one_pane(&output, "new-window")
    }

    async fn user_typing(&self, pane: &str) -> Result<bool> {
        let output = self.stdout(
            "display-message pane_in_mode",
            &os_args(["display-message", "-p", "-t", pane, "#{pane_in_mode}"]),
        )?;
        match output.trim() {
            "1" => Ok(true),
            "0" => Ok(false),
            other => Err(self.error(format!(
                "pane_in_mode for {pane:?} was {other:?}, expected 0 or 1 — update pij-tmux for this tmux version"
            ))),
        }
    }
}

fn os_args<const N: usize>(args: [&str; N]) -> Vec<OsString> {
    args.into_iter().map(OsString::from).collect()
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn new_window_args(
    session: &str,
    name: &str,
    cwd: &str,
    command: Option<&LaunchCommand>,
) -> Vec<OsString> {
    let mut args = vec![
        OsString::from("new-window"),
        OsString::from("-d"),
        OsString::from("-P"),
        OsString::from("-F"),
        OsString::from(LIST_FORMAT),
        OsString::from("-t"),
        OsString::from(format!("{session}:")),
        OsString::from("-n"),
        OsString::from(name),
        OsString::from("-c"),
        OsString::from(cwd),
    ];
    if let Some(command) = command {
        args.push(OsString::from("--"));
        args.push(OsString::from(&command.executable));
        args.extend(command.args.iter().map(OsString::from));
    }
    args
}

#[cfg(test)]
mod tests {
    use super::new_window_args;
    use pij_core::ports::LaunchCommand;

    #[test]
    fn command_reaches_tmux_as_discrete_argv() {
        let command = LaunchCommand {
            executable: "/path with spaces/claude".to_string(),
            args: vec!["--model".to_string(), "selector; not shell".to_string()],
        };
        let actual = new_window_args("session", "worker", "/abs/tree", Some(&command));
        let actual: Vec<_> = actual
            .iter()
            .map(|value| value.to_string_lossy().into_owned())
            .collect();

        assert_eq!(
            &actual[actual.len() - 4..],
            [
                "--",
                "/path with spaces/claude",
                "--model",
                "selector; not shell",
            ]
        );
    }

    #[test]
    fn absent_command_preserves_empty_window_argv() {
        let actual = new_window_args("session", "worker", "/abs/tree", None);
        assert_eq!(actual.last().expect("cwd"), "/abs/tree");
        assert!(!actual.iter().any(|arg| arg == "--"));
    }
}
