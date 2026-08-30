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

use async_trait::async_trait;
use pij_core::error::{PijError, Result};
use pij_core::model::Pane;
use pij_core::ports::{LaunchCommand, TmuxPort};

use crate::parse::{LIST_FORMAT, parse_one_pane, parse_panes};

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
/// COMPOSED (wave 1), in `crates/daemon/src/lib.rs`:
/// `AdapterChoice::Real => Arc::new(TmuxAdapter::new()),`, with
/// `use pij_tmux::TmuxAdapter;`. No config field is required, and the wave-0
/// refusal this replaced no longer exists in the tree.
#[derive(Clone, Debug)]
pub struct TmuxAdapter {
    binary: OsString,
    session: Option<String>,
    taps: Arc<Mutex<BTreeMap<String, TapState>>>,
}

#[derive(Debug)]
struct TapState {
    path: PathBuf,
    offset: u64,
}

impl TmuxAdapter {
    /// Use `tmux` resolved from `PATH` and permit workspace-wide pane listings.
    pub fn new() -> Self {
        Self {
            binary: OsString::from("tmux"),
            session: None,
            taps: Arc::new(Mutex::new(BTreeMap::new())),
        }
    }

    /// Limit listings, new windows, and destructive guards to `session`.
    pub fn for_session(session: impl Into<String>) -> Self {
        Self {
            binary: OsString::from("tmux"),
            session: Some(session.into()),
            taps: Arc::new(Mutex::new(BTreeMap::new())),
        }
    }

    /// Inject the executable path while retaining the production argv contract.
    pub fn with_binary(binary: impl Into<OsString>) -> Self {
        Self {
            binary: binary.into(),
            session: None,
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
        let output = Command::new(&self.binary)
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

    fn ensure_session(&self, session: &str) -> Result<()> {
        if self.session.as_deref().is_none_or(|owned| owned == session) {
            return Ok(());
        }
        Err(self.error(format!(
            "refusing new-window in session {session:?}: this adapter is scoped to {:?} — use an adapter scoped to the requested session",
            self.session.as_deref().unwrap_or_default()
        )))
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

impl Default for TmuxAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl TmuxPort for TmuxAdapter {
    async fn list_panes(&self) -> Result<Vec<Pane>> {
        let output = self.stdout("list-panes", &self.list_args())?;
        parse_panes(&output)
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
        let path = self
            .taps
            .lock()
            .expect("tmux tap mutex")
            .get(pane)
            .map(|tap| tap.path.clone())
            .ok_or_else(|| self.error(format!("pane {pane:?} has no attached tap to detach")))?;

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
