//! `pij-rs` — one binary, two composition roots.
//!
//! `pij-rs daemon` runs the server; every other verb is a client of it. Shipping
//! both in one artifact is what makes "stale CLI meets newer daemon" impossible
//! on a single machine: they are the same file.

use std::process::ExitCode;

use clap::{Parser, Subcommand};

use pij_cli::{default_state_dir, hello_config, ping, render};

#[derive(Parser)]
#[command(name = "pij-rs", version, about = "pij, in Rust — plan 108 wave 0")]
struct Cli {
    /// Emit the raw envelope instead of a human line.
    #[arg(long, global = true)]
    json: bool,

    /// Where the daemon keeps its per-boot key.
    #[arg(long, global = true)]
    state_dir: Option<std::path::PathBuf>,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Run the daemon in the foreground until interrupted.
    Daemon {
        /// Address to listen on. Loopback only — the bearer key is the second
        /// lock, not the first.
        #[arg(long, default_value = "127.0.0.1:7461")]
        bind: String,
    },
    /// Ask a running daemon whether it is healthy.
    Ping {
        /// Address the daemon is listening on.
        #[arg(long, default_value = "127.0.0.1:7461")]
        addr: String,
    },
}

#[tokio::main]
async fn main() -> ExitCode {
    let cli = Cli::parse();
    let state_dir = cli.state_dir.clone().unwrap_or_else(default_state_dir);

    match cli.command {
        Command::Daemon { bind } => {
            let config = hello_config(&bind);
            match pij_daemon::boot(&config, state_dir.clone()).await {
                Ok(daemon) => {
                    println!(
                        "pij-rs daemon: listening on {} · key {} (0600) · offline={}",
                        daemon.addr,
                        daemon.key.path.display(),
                        config.is_fully_offline()
                    );
                    // Ctrl-C is a normal exit for a foreground daemon, not a
                    // crash: it shuts the server down and returns success.
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
        Command::Ping { addr } => match ping(&state_dir, &addr).await {
            Ok(envelope) => {
                println!("{}", render(&envelope, cli.json));
                if envelope.ok {
                    ExitCode::SUCCESS
                } else {
                    ExitCode::FAILURE
                }
            }
            Err(error) => {
                eprintln!("pij-rs: {error}");
                ExitCode::FAILURE
            }
        },
    }
}
