//! Real tmux adapter. Every Rust-workspace tmux syscall lives in this crate.

mod parse;

use std::ffi::OsString;
use std::io;
use std::process::{Command, Output};

use async_trait::async_trait;
use pij_core::error::{PijError, Result};
use pij_core::model::Pane;
use pij_core::ports::TmuxPort;

use crate::parse::{LIST_FORMAT, parse_one_pane, parse_panes};

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
}

impl TmuxAdapter {
    /// Use `tmux` resolved from `PATH` and permit workspace-wide pane listings.
    pub fn new() -> Self {
        Self {
            binary: OsString::from("tmux"),
            session: None,
        }
    }

    /// Limit listings, new windows, and destructive guards to `session`.
    pub fn for_session(session: impl Into<String>) -> Self {
        Self {
            binary: OsString::from("tmux"),
            session: Some(session.into()),
        }
    }

    /// Inject the executable path while retaining the production argv contract.
    pub fn with_binary(binary: impl Into<OsString>) -> Self {
        Self {
            binary: binary.into(),
            session: None,
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

    async fn new_window(&self, session: &str, name: &str, cwd: &str) -> Result<Pane> {
        self.ensure_session(session)?;
        let target = format!("{session}:");
        let output = self.stdout(
            "new-window",
            &[
                OsString::from("new-window"),
                OsString::from("-d"),
                OsString::from("-P"),
                OsString::from("-F"),
                OsString::from(LIST_FORMAT),
                OsString::from("-t"),
                OsString::from(target),
                OsString::from("-n"),
                OsString::from(name),
                OsString::from("-c"),
                OsString::from(cwd),
            ],
        )?;
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
