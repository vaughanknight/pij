//! The daemon: composition root #1.
//!
//! Wires `Arc<dyn Port>` from config, serves HTTP on loopback, and does nothing
//! else — wiring, never business logic. At hello depth it serves `/health` and
//! an NDJSON event stream; the verb surface arrives in later waves, and each
//! route's job is to do ONE cheap statement or enqueue a job (R4).

#![deny(missing_docs)]

pub mod admission;
pub mod auth;
pub mod http;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use pij_core::config::{AdapterChoice, Config};
use pij_core::error::{PijError, Result};
use pij_core::ports::{Registry, Spine};
use pij_store::{SqliteRegistry, SqliteSpine};
use pij_testkit::fakes::{FakeRegistry, FakeSpine};

pub use auth::BootKey;

/// The build id reported in the event stream's Hello line.
pub const BUILD: &str = concat!("pij-rs ", env!("CARGO_PKG_VERSION"));

/// Everything the routes are allowed to touch.
#[derive(Clone)]
pub struct Services {
    /// Seat roster.
    pub registry: Arc<dyn Registry>,
    /// Append-only history.
    pub spine: Arc<dyn Spine>,
    /// Whether this daemon is running entirely on fakes.
    pub offline: bool,
}

/// A running daemon.
#[derive(Debug)]
pub struct Daemon {
    /// Where it is actually listening — resolved, so a `:0` config becomes a
    /// real port a client can be told about.
    pub addr: SocketAddr,
    /// The per-boot bearer key.
    pub key: BootKey,
    shutdown: tokio::sync::oneshot::Sender<()>,
    joined: tokio::task::JoinHandle<()>,
}

impl Daemon {
    /// Ask the server to stop, and wait for it.
    ///
    /// # Errors
    /// [`PijError::Adapter`] when the server task panicked.
    pub async fn shutdown(self) -> Result<()> {
        let _ = self.shutdown.send(());
        self.joined.await.map_err(|error| PijError::Adapter {
            adapter: "daemon".to_string(),
            message: format!("the server task did not stop cleanly: {error}"),
        })
    }
}

/// Build the services this config asks for.
///
/// **Fake is the default**, so a fresh checkout boots with no database, no tmux
/// and no network. A real adapter is opted into per port, which means a test can
/// make exactly one thing real.
///
/// # Errors
/// [`PijError`] from whichever real adapter refuses to start.
pub async fn build_services(config: &Config) -> Result<Services> {
    let registry: Arc<dyn Registry> = match config.adapters.registry {
        AdapterChoice::Fake => Arc::new(FakeRegistry::new()),
        AdapterChoice::Real => Arc::new(SqliteRegistry::new(
            pij_store::open(&config.store_path).await?,
        )),
    };
    let spine: Arc<dyn Spine> = match config.adapters.spine {
        AdapterChoice::Fake => Arc::new(FakeSpine::new()),
        AdapterChoice::Real => {
            Arc::new(SqliteSpine::new(pij_store::open(&config.store_path).await?))
        }
    };

    Ok(Services {
        registry,
        spine,
        offline: config.is_fully_offline(),
    })
}

/// Boot the daemon: key first, then bind.
///
/// The order is the security property, not an implementation detail — see
/// [`auth`]. `state_dir` is where the key is written.
///
/// # Errors
/// [`PijError::Adapter`] when the key cannot be written or the port refuses.
pub async fn boot(config: &Config, state_dir: PathBuf) -> Result<Daemon> {
    let services = build_services(config).await?;

    // 1. Key on disk, 0600.
    let key = auth::write_key(&state_dir)?;

    // 2. Only now, a socket.
    let listener = tokio::net::TcpListener::bind(&config.bind_addr)
        .await
        .map_err(|error| PijError::Adapter {
            adapter: "daemon".to_string(),
            message: format!(
                "could not bind {} ({error}) — another daemon may already hold it",
                config.bind_addr
            ),
        })?;
    let addr = listener.local_addr().map_err(|error| PijError::Adapter {
        adapter: "daemon".to_string(),
        message: format!("could not resolve the bound address: {error}"),
    })?;

    let router = http::router(services, key.token.clone());
    let (shutdown, shutdown_rx) = tokio::sync::oneshot::channel();
    let joined = tokio::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await;
    });

    Ok(Daemon {
        addr,
        key,
        shutdown,
        joined,
    })
}
