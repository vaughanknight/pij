//! The daemon: composition root #1.
//!
//! Wires `Arc<dyn Port>` from config, serves HTTP on loopback, and does nothing
//! else — wiring, never business logic. At hello depth it serves `/health` and
//! an NDJSON event stream; the verb surface arrives in later waves, and each
//! route's job is to do ONE cheap statement or enqueue a job (R4).

#![deny(missing_docs)]

pub mod admission;
pub mod auth;
pub mod delivery;
pub mod events;
pub mod federation;
pub mod lifecycle;
pub mod pane_observer;
pub mod pointer;

// u-orchestration's git-facts gatherer: IO belongs at the runtime root, and a
// ninth crate would have been a graph change for one module.
pub mod http;
#[path = "orchestration/repo.rs"]
pub mod orchestration_repo;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use pij_core::config::{AdapterChoice, Config};
use pij_core::error::{PijError, Result};
use pij_core::model::Harness;
use pij_core::orchestration::OrchestrationService;
use pij_core::ports::{HarnessPort, LivenessPort, Queue, Registry, Spine, TmuxPort, Transport};
use pij_harnesses::proc::ProcLiveness;
use pij_harnesses::{HarnessRegistry, InteractionGate};
use pij_store::{SqliteQueue, SqliteRegistry, SqliteSpine};
use pij_testkit::fakes::{
    FakeHarness, FakeLiveness, FakeQueue, FakeRegistry, FakeSpine, FakeTmux, FakeTransport,
};
use pij_tmux::TmuxAdapter;
use pij_transport::UdsTransport;

pub use auth::BootKey;

/// The build id reported in the event stream's Hello line.
pub const BUILD: &str = concat!("pij-rs ", env!("CARGO_PKG_VERSION"));

/// Everything the routes are allowed to touch: ALL SEVEN ports.
///
/// Seven fields, not two. An earlier version wired only `registry` and `spine`
/// while `offline` was computed from all seven config choices, so selecting a
/// real transport reported `offline=false` while constructing no transport at
/// all — a composition root that lies about what it composed. Found in review.
#[derive(Clone)]
pub struct Services {
    /// Seat roster.
    pub registry: Arc<dyn Registry>,
    /// Append-only history.
    pub spine: Arc<dyn Spine>,
    /// Deferred work.
    pub queue: Arc<dyn Queue>,
    /// Message delivery.
    pub transport: Arc<dyn Transport>,
    /// tmux IO.
    pub tmux: Arc<dyn TmuxPort>,
    /// Per-harness adapters, one per `Harness` variant.
    ///
    /// A registry rather than a single `Arc<dyn HarnessPort>`: the wave-0 shape
    /// assumed one fake, but a composite's `kind()` has no truthful value, so
    /// u-harness shipped five adapters and a lookup instead of one adapter
    /// pretending to be all of them.
    /// Wrapped in `Arc` at composition, not in the unit: `Services` is `Clone`
    /// because every route handler holds one, and the registry owns trait
    /// objects that cannot be. Shared ownership is a composition concern.
    pub harnesses: Arc<HarnessRegistry>,
    /// Process liveness.
    pub liveness: Arc<dyn LivenessPort>,
    /// The ONE delivery path.
    ///
    /// `/v1/send` used to enqueue a private payload shape of its own and
    /// synthesise a `Queued` receipt, which meant the route consulted no routing
    /// policy, no tombstone, no transport, and published no event — and the
    /// payload it wrote could not be decoded by the inbox that read the same
    /// queue. Two halves of one round trip, each tested against itself.
    /// Found by u-extension at compose.
    pub delivery: Arc<delivery::DeliveryService>,
    /// The event bus: publish once, fan out to every subscriber, with a durable
    /// leg on the spine so a subscriber can replay what it missed (u-events).
    ///
    /// Not behind an `AdapterChoice`: it is not one of the seven ports, it is a
    /// service composed FROM one (the spine). There was no `not_yet` refusal to
    /// delete here — its coder said so rather than inventing one.
    pub event_bus: Arc<events::EventBus>,
    /// Governance: batons, projects, streams, ordinals, roles — and the
    /// equivalence merge that stops one seat becoming six descriptors.
    ///
    /// Like the bus, not behind an `AdapterChoice`: it composes existing store
    /// and daemon IO rather than implementing an eighth port, so there was no
    /// refusal to delete.
    pub orchestration: Arc<OrchestrationService>,
    /// Whether this daemon is running entirely on fakes.
    pub offline: bool,
}

/// A running daemon.
pub struct Daemon {
    /// Where it is actually listening — resolved, so a `:0` config becomes a
    /// real port a client can be told about.
    pub addr: SocketAddr,
    /// The per-boot bearer key.
    pub key: BootKey,
    shutdown: tokio::sync::oneshot::Sender<()>,
    joined: tokio::task::JoinHandle<()>,
    /// Owned so it cannot outlive the boot that started it: a worker still
    /// forwarding for a daemon that has stopped serving is a process nobody can
    /// see and nothing can stop.
    federation_worker: federation::FederationWorker,
    drain_loop: lifecycle::TickLoop,
}

impl Daemon {
    /// Ask the server to stop, and wait for it.
    ///
    /// # Errors
    /// [`PijError::Adapter`] when the server task panicked.
    pub async fn shutdown(self) -> Result<()> {
        // Stop SERVING first, then the workers: a worker that keeps forwarding for
        // a daemon still accepting requests is fine; the reverse is a daemon
        // taking work nothing will move. Both are awaited, so "shut down" means
        // every task this boot started has ended — a background task that outlives
        // its daemon is a process nobody can see and nothing can stop.
        let _ = self.shutdown.send(());
        let served = self.joined.await.map_err(|error| PijError::Adapter {
            adapter: "daemon".to_string(),
            message: format!("the server task did not stop cleanly: {error}"),
        });
        let drained = self.drain_loop.shutdown().await;
        let forwarded = self.federation_worker.shutdown().await;
        served?;
        drained?;
        forwarded
    }
}

impl std::fmt::Debug for Daemon {
    /// Hand-written because the worker handles are not `Debug` and a boot is a
    /// thing tests `expect_err` on. Prints what an operator would ask.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Daemon")
            .field("addr", &self.addr)
            .field("key", &self.key.path)
            .finish_non_exhaustive()
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
    // ONE pool, shared by every real store adapter (lynx's cross-government
    // comparison, wave-3 compose fix). This opened the store three times: three
    // connection pools, three sets of connections, three boot self-migrations
    // racing each other on first run — for one file.
    //
    // The trait split is unchanged and is the point: Registry, Spine and Queue
    // stay three ports with three implementations. What they share is the
    // CONNECTION, which is a resource, not a contract.
    let pool = if needs_store(config) {
        Some(pij_store::open(&config.store_path).await?)
    } else {
        None
    };
    let pool = |name: &str| -> Result<pij_store::StorePool> {
        pool.clone().ok_or_else(|| PijError::Adapter {
            adapter: format!("daemon/{name}"),
            message: "a real adapter was selected but no store was opened".to_string(),
        })
    };

    let registry: Arc<dyn Registry> = match config.adapters.registry {
        AdapterChoice::Fake => Arc::new(FakeRegistry::new()),
        AdapterChoice::Real => Arc::new(SqliteRegistry::new(pool("registry")?)),
    };
    let spine: Arc<dyn Spine> = match config.adapters.spine {
        AdapterChoice::Fake => Arc::new(FakeSpine::new()),
        AdapterChoice::Real => Arc::new(SqliteSpine::new(pool("spine")?)),
    };
    let queue: Arc<dyn Queue> = match config.adapters.queue {
        AdapterChoice::Fake => Arc::new(FakeQueue::new(config.delivered_id_capacity)?),
        AdapterChoice::Real => Arc::new(SqliteQueue::new(
            pool("queue")?,
            config.claim_lease_secs,
            config.delivered_id_capacity,
        )?),
    };

    // The four seams whose real adapters land in waves 1-3. They wire to fakes
    // and REFUSE explicitly when asked to be real: "not built yet" is a fact the
    // operator should be told at boot, not discovered when a call silently does
    // nothing. Each `Real` arm is also the exact site the wave that implements it
    // replaces — a one-line change at a named place.
    let transport: Arc<dyn Transport> = match config.adapters.transport {
        AdapterChoice::Fake => Arc::new(FakeTransport::reachable()),
        // Real, and deliberately INERT: `UdsTransport` refuses every seat whose
        // descriptor does not carry `cross_session_inbound_accept: Some(true)`,
        // which nothing stamps until wave 4's spawn surface exists. u-uds
        // MEASURED why (Claude 2.1.251): an authenticated daemon-origin frame to
        // a seat without that setting is held behind a Deny/Deliver dialog,
        // reaches the model never, and returns zero socket bytes — so the
        // inherited 150ms silence timer was measuring nothing and reporting
        // success. Shipping closed is the honest ship.
        AdapterChoice::Real => Arc::new(UdsTransport::new()?),
    };
    // WIRED, wave 1 (u-tmux).
    let tmux: Arc<dyn TmuxPort> = match config.adapters.tmux {
        AdapterChoice::Fake => Arc::new(FakeTmux::new()),
        AdapterChoice::Real => Arc::new(TmuxAdapter::new()),
    };
    // WIRED, wave 2 (u-harness). The refusal this replaces is gone.
    let harnesses = Arc::new(match config.adapters.harness {
        AdapterChoice::Fake => HarnessRegistry::new([
            Arc::new(FakeHarness::new(Harness::Claude)) as Arc<dyn HarnessPort>,
            Arc::new(FakeHarness::new(Harness::Copilot)),
            Arc::new(FakeHarness::new(Harness::Codex)),
            Arc::new(FakeHarness::new(Harness::Pi)),
            Arc::new(FakeHarness::new(Harness::Omp)),
        ])?,
        AdapterChoice::Real => HarnessRegistry::real(tmux.clone()),
    });
    // WIRED, wave 1 (u-liveness). The refusal this replaces is gone; the recipe
    // came from the unit's public doc comment, and the PM pastes it — one mind at
    // convergence, four worktrees at edit time.
    let liveness: Arc<dyn LivenessPort> = match config.adapters.liveness {
        AdapterChoice::Fake => Arc::new(FakeLiveness::new()),
        AdapterChoice::Real => Arc::new(ProcLiveness::new()),
    };

    // The bus is composed from the spine, so it is built after it and shares the
    // same Arc — a publish is durable through exactly the store this daemon reads.
    let event_bus = Arc::new(events::EventBus::new(
        Arc::clone(&spine),
        config.event_buffer_capacity,
    )?);

    let orchestration = Arc::new(OrchestrationService::new());

    let delivery = Arc::new(delivery::DeliveryService::new(
        Arc::clone(&registry),
        Arc::clone(&queue),
        Arc::clone(&transport),
        Arc::clone(&event_bus),
    )?);

    Ok(Services {
        registry,
        spine,
        event_bus,
        orchestration,
        queue,
        transport,
        tmux,
        harnesses,
        liveness,
        delivery,
        offline: config.is_fully_offline(),
    })
}

/// Does this config select any adapter that needs the store open?
fn needs_store(config: &Config) -> bool {
    let a = &config.adapters;
    a.registry.is_real() || a.spine.is_real() || a.queue.is_real()
}

// `not_yet` is GONE. It was the refusal a `Real` adapter returned before its wave
// shipped — "this daemon will not pretend to have wired something it has not" —
// and with u-uds composed there is no port left that can be selected and not
// built. All seven are real-capable.
//
// The scaffold is deleted rather than kept "in case": a helper with no callers is
// a claim that some port might still be missing, and the next reader would have to
// check.

fn start_resilient_delivery_drain(
    drain: Arc<pointer::DrainWorker>,
    interval: Duration,
) -> Result<lifecycle::TickLoop> {
    lifecycle::TickLoop::start(interval, move || {
        let drain = Arc::clone(&drain);
        async move {
            // SURVIVE errors, for the same reason the federation worker does
            // (review F2). TickLoop terminates on an Err, and a seat exiting
            // with queued mail is ROUTINE: one dead pane between the registry
            // read and the submit would have ended all below-socket delivery
            // for the daemon's lifetime — no pointers, no commands, no socket
            // bodies — silently, until someone restarted it.
            if let Err(error) = drain.drain_once().await {
                eprintln!("pij-rs drain: {error}");
            }
            Ok(())
        }
    })
}

/// Boot the daemon: stage the key, BIND, build, publish, serve.
///
/// The ORDER is the security property, and it has been sharpened twice.
///
/// Review's first pass: staging before the bind and publishing after means a boot
/// that loses the port race cannot overwrite the running daemon's credential,
/// while the key is still in place before any request is answered (`bind` opens
/// the socket; nothing is served until `axum::serve`). See [`auth`].
///
/// **The second: BIND BEFORE ANY MUTATING STEP** (lynx's row-80 trap, ruled a
/// boot invariant by the prime). `build_services` opens the store, and opening
/// the store RUNS MIGRATIONS — which used to happen before the bind. A second
/// daemon starting against the same store therefore migrated the schema and only
/// then discovered it had lost the port race. Migrations are one-way: a newer
/// binary losing the race would still have upgraded the schema underneath the
/// running older daemon, which had already passed its own version check.
///
/// The bind is the cheapest possible test of "am I allowed to exist", so it goes
/// first. Staging the key stays above it because a staged key is inert — a unique
/// 0600 name nothing reads until `publish`.
///
/// # Errors
/// [`PijError::Adapter`] when the key cannot be written or the port refuses.
pub async fn boot(config: &Config, state_dir: PathBuf) -> Result<Daemon> {
    // 1. Stage the key 0600 under a unique name. NOT published, and NOT a
    //    mutation of any shared resource: a boot that fails below must not touch
    //    a running daemon's credential.
    let staged = auth::stage_key(&state_dir)?;
    let token = staged.token().to_string();

    // 2. Bind. This is the step that fails when another daemon holds the port,
    //    and it comes before anything that changes state on disk.
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

    // 3. This boot owns the port, so it may now touch the store. Migrations run
    //    here, exactly once, by the process that won.
    let services = build_services(config).await?;

    // 4. Resolve this machine's identity. FALLIBLE, and therefore BEFORE the
    //    publish: hostname lookup can fail and a configured alias can be empty.
    //    Review found this placed after the publish, which reopened the exact
    //    hole `auth` documents as closed — a boot that wins the bind and then
    //    fails identity resolution would exit having already overwritten a
    //    healthy daemon's credential. It depends on nothing from `services`, so
    //    there is no reason for it to be down here.
    let identity = lifecycle::MachineIdentity::resolve(config.machine_alias.as_deref())?;

    // 5. Federation and the drain worker. BOTH FALLIBLE, and therefore above the
    //    publish: peer-table validation rejects a duplicate or self-aliased
    //    alias, and DrainWorker rejects a zero cadence.
    //    A config error must never cost a running daemon its credential.
    let federation = Arc::new(
        federation::FederationService::new(
            identity.alias().to_string(),
            config.peers.clone(),
            Arc::clone(&services.queue),
            Arc::clone(&services.event_bus),
            federation::FederationPolicy {
                poll_interval: Duration::from_secs(config.federation_poll_interval_secs),
                max_retry_delay: Duration::from_secs(config.federation_retry_max_secs),
                event_buffer_capacity: config.event_buffer_capacity,
            },
        )
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/federation".to_string(),
            message: error.to_string(),
        })?,
    );

    // 6. The drain worker. Its pointer rung is INERT in this composition: nothing
    //    yet feeds `InteractionGate`, which denies on unknown, so a pointer never
    //    fires. That is deliberate and it is the same honest ship as the socket
    //    transport — the mechanism is real and tested, its precondition does not
    //    exist, and wave 5's `u-tap` is the sensor. Inverting the gate to make the
    //    rung reachable would discard Jordan's politeness ruling while appearing
    //    to honour it.
    let interaction = Arc::new(InteractionGate::new(Arc::clone(&services.tmux)));
    let drain = Arc::new(pointer::DrainWorker::new(
        Arc::clone(&services.registry),
        Arc::clone(&services.queue),
        Arc::clone(&services.transport),
        Arc::clone(&services.tmux),
        Arc::clone(&interaction),
        Arc::clone(&services.event_bus),
        Duration::from_secs(config.pointer_announce_cadence_secs),
    )?);

    // 6. Publish the key atomically. EVERY fallible step is now above this line.
    //    Still before anything is SERVED — `bind` only opens the listen socket;
    //    no request is answered until `axum::serve`.
    let key = staged.publish()?;

    let federation_worker = Arc::clone(&federation).start();
    let drain_loop =
        start_resilient_delivery_drain(drain, Duration::from_secs(config.delivery_interval_secs))?;

    let router = http::router_with_federation(
        services,
        http::HttpConfig {
            local_key: token,
            peer_keys: config.peers.iter().map(|peer| peer.key.clone()).collect(),
            machine_alias: identity.alias().to_string(),
        },
        federation,
    );
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
        federation_worker,
        drain_loop,
    })
}
