//! `pij-rs` — one binary, two composition roots.

use std::path::{Path, PathBuf};
use std::process::{Command as ProcessCommand, ExitCode};

use clap::{Parser, Subcommand};
use pij_cli::{
    DaemonClient, Registration, SendRequest, SpawnRequest, daemon_config, default_state_dir,
    exit_code, parse_destination, render, render_frame, setup_refusal,
};
use pij_core::error::PijError;
use pij_core::model::{Envelope, ErrorKind, Harness};
use serde_json::Value;

#[derive(Parser)]
#[command(name = "pij-rs", version, about = "pij, in Rust")]
struct Cli {
    /// Emit JSON from the same value used for human output.
    #[arg(long, global = true)]
    json: bool,

    /// Where the daemon keeps its per-boot key.
    #[arg(long, global = true)]
    state_dir: Option<PathBuf>,

    /// Address of the daemon used by client verbs.
    #[arg(long, global = true, default_value = "127.0.0.1:7461")]
    addr: String,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Run the daemon in the foreground until interrupted.
    Daemon {
        /// Address to listen on. A non-loopback address exposes the daemon to
        /// the LAN; the bearer key is then its access boundary.
        #[arg(long, default_value = "127.0.0.1:7461")]
        bind: String,
        /// Boot with every adapter FAKE: no store, no process table, nothing
        /// outside this process. Opt-in, because a daemon that silently persists
        /// nothing is the more dangerous default.
        #[arg(long)]
        offline: bool,
    },
    /// Ask a running daemon whether it is healthy.
    Ping,
    /// Register one seat claim for daemon verification.
    Register {
        /// Requested seat id.
        id: String,
        /// Host harness.
        #[arg(long, value_parser = parse_harness)]
        harness: Harness,
        /// Absolute working folder.
        #[arg(long, value_parser = parse_absolute_path)]
        folder: String,
        /// Tmux pane, when one exists.
        #[arg(long)]
        pane: Option<String>,
        /// Process id; must be paired with --proc-start.
        #[arg(long, requires = "proc_start")]
        pid: Option<u32>,
        /// Packed process start stamp; must be paired with --pid.
        #[arg(long, requires = "pid")]
        proc_start: Option<u64>,
        /// Spawn correlation id.
        #[arg(long)]
        spawn_id: Option<String>,
        /// Requested model selector.
        #[arg(long)]
        model: Option<String>,
        /// Model provider.
        #[arg(long)]
        provider: Option<String>,
        /// Requested reasoning effort.
        #[arg(long)]
        effort: Option<String>,
        /// Governing seat.
        #[arg(long)]
        parent: Option<String>,
        /// Delivery uses a relay.
        #[arg(long)]
        relay: bool,
    },
    /// Launch one pre-bind seat through the daemon.
    Spawn {
        /// Seat id. OMIT IT and the daemon allocates a memorable one
        /// (`pij-<adjective>-<noun>`).
        #[arg(long)]
        id: Option<String>,
        /// Harness to launch.
        #[arg(long, value_parser = parse_harness)]
        harness: Harness,
        /// Executable override.
        #[arg(long)]
        bin: Option<String>,
        /// Exact model selector.
        #[arg(long)]
        model: Option<String>,
        /// Exact reasoning effort.
        #[arg(long)]
        effort: Option<String>,
        /// Absolute working directory; defaults to the caller's directory.
        #[arg(long, value_parser = parse_absolute_path_buf)]
        cwd: Option<PathBuf>,
        /// Target tmux session; defaults from the caller pane.
        #[arg(long)]
        session: Option<String>,
        /// Tmux window name; defaults to the seat id.
        #[arg(long)]
        name: Option<String>,
        /// Governing seat.
        #[arg(long)]
        parent: Option<String>,
        /// Configure Claude to accept cross-session inbound messages.
        #[arg(long)]
        accept_inbound: bool,
    },
    /// Durably enqueue one message.
    Send {
        /// Sending seat.
        #[arg(long)]
        from: String,
        /// `<seat>` or `<seat>@<machine>`; use `@@` for a literal seat `@`.
        #[arg(long, value_parser = parse_destination)]
        to: pij_core::model::Destination,
        /// Literal message body.
        #[arg(long)]
        body: String,
        /// Caller-supplied correlation id.
        #[arg(long)]
        msg_id: String,
        /// Message id being answered.
        #[arg(long)]
        in_reply_to: Option<String>,
    },
    /// List registered seats.
    List,
    /// Follow daemon event frames until interrupted.
    Tail {
        /// Replay after this machine-local cursor before following live events.
        #[arg(long)]
        since: Option<u64>,
    },
}

#[tokio::main]
async fn main() -> ExitCode {
    run(Cli::parse()).await
}

async fn run(cli: Cli) -> ExitCode {
    let state_dir = cli.state_dir.clone().unwrap_or_else(default_state_dir);

    if let Command::Daemon { bind, offline } = &cli.command {
        return run_daemon(bind, state_dir, *offline).await;
    }

    let prepared_spawn = match prepare_spawn_request(&cli.command) {
        Ok(request) => request,
        Err(error) => {
            return emit(&setup_refusal::<Value>("pij spawn", error), cli.json);
        }
    };

    let command_name = cli.command.name();
    let client = match DaemonClient::new(&state_dir, &cli.addr) {
        Ok(client) => client,
        Err(error) => return emit(&setup_refusal::<Value>(command_name, error), cli.json),
    };

    match cli.command {
        Command::Daemon { .. } => unreachable!("daemon returned before client construction"),
        Command::Ping => emit(&client.ping().await, cli.json),
        Command::Register {
            id,
            harness,
            folder,
            pane,
            pid,
            proc_start,
            spawn_id,
            model,
            provider,
            effort,
            parent,
            relay,
        } => {
            let registration = Registration {
                id: id.into(),
                harness,
                folder,
                pane,
                pid,
                proc_start,
                spawn_id,
                model,
                provider,
                effort,
                parent: parent.map(Into::into),
                relay,
            };
            debug_assert!(registration.validate().is_ok());
            emit(&client.register(&registration).await, cli.json)
        }
        Command::Spawn { .. } => emit(
            &client
                .spawn(prepared_spawn.as_ref().expect("spawn request was prepared"))
                .await,
            cli.json,
        ),
        Command::Send {
            from,
            to,
            body,
            msg_id,
            in_reply_to,
        } => {
            let request = SendRequest {
                from: from.into(),
                to,
                body,
                msg_id,
                in_reply_to,
            };
            emit(&client.send(&request).await, cli.json)
        }
        Command::List => emit(&client.list().await, cli.json),
        Command::Tail { since } => match client.tail(since).await {
            Err(envelope) => emit(&envelope, cli.json),
            Ok(mut stream) => loop {
                tokio::select! {
                    frame = stream.next_frame() => match frame {
                        Ok(Some(frame)) => println!("{}", render_frame(&frame, cli.json)),
                        Ok(None) => return ExitCode::SUCCESS,
                        Err(error) => {
                            let envelope = Envelope::<Value>::refused(
                                "pij tail",
                                error.kind,
                                error.message,
                            );
                            return emit(&envelope, cli.json);
                        }
                    },
                    signal = tokio::signal::ctrl_c() => {
                        return if signal.is_ok() {
                            ExitCode::SUCCESS
                        } else {
                            emit(
                                &Envelope::<Value>::refused(
                                    "pij tail",
                                    ErrorKind::Adapter,
                                    "could not install the interrupt handler",
                                ),
                                cli.json,
                            )
                        };
                    }
                }
            },
        },
    }
}

async fn run_daemon(bind: &str, state_dir: PathBuf, offline: bool) -> ExitCode {
    let config = daemon_config(bind, &state_dir.join("pij.sqlite"), offline);
    match pij_daemon::boot(&config, state_dir).await {
        Ok(daemon) => {
            println!(
                "pij-rs daemon: listening on {} · key {} (0600) · offline={}",
                daemon.addr,
                daemon.key.path.display(),
                config.is_fully_offline()
            );
            let _ = tokio::signal::ctrl_c().await;
            println!("pij-rs daemon: shutting down");
            match daemon.shutdown().await {
                Ok(()) => ExitCode::SUCCESS,
                Err(error) => {
                    eprintln!("pij-rs: {error}");
                    ExitCode::FAILURE
                }
            }
        }
        Err(error) => {
            eprintln!("pij-rs: {error}");
            ExitCode::FAILURE
        }
    }
}

fn emit<T: serde::Serialize>(envelope: &Envelope<T>, json: bool) -> ExitCode {
    println!("{}", render(envelope, json));
    ExitCode::from(exit_code(envelope))
}

fn parse_harness(value: &str) -> Result<Harness, String> {
    Harness::parse(value).ok_or_else(|| {
        format!("unknown harness '{value}'; expected claude, copilot, codex, pi, or omp")
    })
}

fn parse_absolute_path(value: &str) -> Result<String, String> {
    if std::path::Path::new(value).is_absolute() {
        Ok(value.to_string())
    } else {
        Err("folder must be an absolute path".to_string())
    }
}

fn parse_absolute_path_buf(value: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    if path.is_absolute() {
        Ok(path)
    } else {
        Err("cwd must be an absolute path".to_string())
    }
}

fn prepare_spawn_request(command: &Command) -> Result<Option<SpawnRequest>, PijError> {
    let Command::Spawn {
        id,
        harness,
        bin,
        model,
        effort,
        cwd,
        session,
        name,
        parent,
        accept_inbound,
    } = command
    else {
        return Ok(None);
    };
    let cwd = match cwd {
        Some(cwd) => cwd.clone(),
        None => std::env::current_dir().map_err(|error| PijError::Adapter {
            adapter: "spawn".to_string(),
            message: format!("could not read the caller directory: {error}"),
        })?,
    };
    if matches!(harness, Harness::Pi | Harness::Omp) && is_linked_worktree(&cwd)? {
        return Err(PijError::Adapter {
            adapter: "spawn".to_string(),
            message: format!(
                "refusing {harness} spawn from linked worktree {}: global and project extension links collide and the peer dies before registration — spawn from the main checkout and cd afterwards",
                cwd.display()
            ),
        });
    }
    let caller_pane = if session.is_none() {
        Some(
            std::env::var("TMUX_PANE")
                .ok()
                .filter(|pane| !pane.trim().is_empty())
                .ok_or_else(|| PijError::Adapter {
                    adapter: "spawn".to_string(),
                    message: "TMUX_PANE is unavailable — pass --session <tmux> explicitly"
                        .to_string(),
                })?,
        )
    } else {
        None
    };
    let cwd = cwd
        .into_os_string()
        .into_string()
        .map_err(|_| PijError::Adapter {
            adapter: "spawn".to_string(),
            message: "cwd is not valid UTF-8 and cannot be stored in a descriptor".to_string(),
        })?;

    Ok(Some(SpawnRequest {
        id: id.clone().map(Into::into),
        harness: *harness,
        executable: bin.clone(),
        model: model.clone(),
        effort: effort.clone(),
        cwd,
        session: session.clone(),
        caller_pane,
        name: name.clone(),
        parent: parent.clone().map(Into::into),
        accept_inbound: *accept_inbound,
    }))
}

fn is_linked_worktree(cwd: &Path) -> Result<bool, PijError> {
    let output = ProcessCommand::new("git")
        .args(["rev-parse", "--git-dir"])
        .current_dir(cwd)
        .output()
        .map_err(|error| PijError::Adapter {
            adapter: "spawn".to_string(),
            message: format!("could not inspect git worktree state: {error}"),
        })?;
    if !output.status.success() {
        return Ok(false);
    }
    let raw = String::from_utf8(output.stdout).map_err(|error| PijError::Adapter {
        adapter: "spawn".to_string(),
        message: format!("git returned a non-UTF-8 git-dir: {error}"),
    })?;
    Ok(git_dir_is_linked(cwd, raw.trim()))
}

fn git_dir_is_linked(cwd: &Path, git_dir: &str) -> bool {
    let path = PathBuf::from(git_dir);
    let path = if path.is_absolute() {
        path
    } else {
        cwd.join(path)
    };
    path.components()
        .any(|part| part.as_os_str() == "worktrees")
}

impl Command {
    fn name(&self) -> &'static str {
        match self {
            Command::Daemon { .. } => "pij daemon",
            Command::Ping => "pij ping",
            Command::Register { .. } => "pij register",
            Command::Send { .. } => "pij send",
            Command::Spawn { .. } => "pij spawn",
            Command::List => "pij list",
            Command::Tail { .. } => "pij tail",
        }
    }
}

#[cfg(test)]
mod tests {
    use clap::{CommandFactory, Parser};

    use super::{Cli, Command, git_dir_is_linked};

    #[test]
    fn clap_exposes_exactly_the_seven_ruled_verbs() {
        let names: Vec<_> = Cli::command()
            .get_subcommands()
            .map(|command| command.get_name().to_string())
            .collect();

        assert_eq!(
            names,
            [
                "daemon", "ping", "register", "spawn", "send", "list", "tail"
            ]
        );
    }

    #[test]
    fn editorial_help_is_shape_checked_not_frozen() {
        let command = Cli::command();
        assert_eq!(command.get_name(), "pij-rs");
        assert!(
            command
                .get_arguments()
                .any(|argument| argument.get_id() == "json")
        );
        assert!(
            command
                .get_arguments()
                .any(|argument| argument.get_id() == "state_dir")
        );
        assert!(
            command
                .get_arguments()
                .any(|argument| argument.get_id() == "addr")
        );
    }

    #[test]
    fn register_requires_a_complete_process_identity() {
        let parsed = Cli::try_parse_from([
            "pij-rs",
            "register",
            "seat",
            "--harness",
            "omp",
            "--folder",
            "/tmp",
            "--pid",
            "42",
        ]);

        assert!(parsed.is_err());
    }

    /// FLIPPED when u-names was wired into `/v1/spawn` (review F4): omitting
    /// `--id` is now how you ASK for a memorable name, not an error. The
    /// assertion flips rather than being deleted, as the refusal tests did in
    /// waves 1 and 3 — deleting it would quietly drop the guarantee that the
    /// argument is optional while the diff looked like tidying.
    #[test]
    fn spawn_without_an_id_parses_and_leaves_allocation_to_the_daemon() {
        let parsed = Cli::try_parse_from(["pij-rs", "spawn", "--harness", "claude"])
            .expect("omitting --id is how a caller asks for a memorable name");
        let Command::Spawn { id, .. } = parsed.command else {
            panic!("expected the spawn command");
        };
        assert!(
            id.is_none(),
            "the CLI must not invent an id: the daemon holds the roster and the lock"
        );
    }

    #[test]
    fn linked_worktree_detection_names_the_git_dir_shape() {
        let cwd = std::path::Path::new("/repo/linked");
        assert!(git_dir_is_linked(cwd, "/repo/main/.git/worktrees/linked"));
        assert!(!git_dir_is_linked(cwd, "/repo/main/.git"));
        assert!(!git_dir_is_linked(cwd, ".git"));
    }
}
