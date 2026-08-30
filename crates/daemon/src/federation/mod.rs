//! Cross-machine delivery owned by one long-lived worker.

use std::collections::BTreeMap;
use std::fmt;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use pij_core::config::PeerDefinition;
use pij_core::error::{PijError, Result};
use pij_core::model::{DeliveryOutcome, Destination, Event, Job, Receipt};
use pij_core::ports::Queue;
use serde::Serialize;

use crate::events::EventBus;
use crate::http::{PeerEndpoint, SendRequest};


/// A peer-configuration refusal.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PeerConfigError {
    /// Two ordered definitions use the same alias.
    DuplicateAlias(String),
    /// A peer claims the local machine's alias.
    LocalAlias(String),
    /// A destination names no configured peer.
    UnknownAlias(String),
}

impl fmt::Display for PeerConfigError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DuplicateAlias(alias) => {
                write!(formatter, "peer alias `{alias}` is configured more than once")
            }
            Self::LocalAlias(alias) => write!(
                formatter,
                "peer alias `{alias}` equals the local machine alias; omit the machine to address this daemon"
            ),
            Self::UnknownAlias(alias) => write!(
                formatter,
                "peer alias `{alias}` is not configured; add it to the ordered peer definitions"
            ),
        }
    }
}

impl std::error::Error for PeerConfigError {}

/// The result of resolving an already-parsed destination.
pub enum ResolvedPeer<'a> {
    /// An unqualified destination, always owned by this daemon.
    Local,
    /// A destination owned by one configured peer.
    Remote(&'a PeerEndpoint),
}

/// Validated peer aliases, preserving one endpoint and one credential per peer.
pub struct PeerTable {
    peers: BTreeMap<String, PeerEndpoint>,
}

impl PeerTable {
    /// Validate ordered definitions before building the lookup map.
    ///
    /// # Errors
    /// Duplicate aliases and aliases equal to the local machine.
    pub fn new(
        local_alias: &str,
        definitions: impl IntoIterator<Item = PeerDefinition>,
    ) -> Result<Self, PeerConfigError> {
        let mut peers = BTreeMap::new();
        for definition in definitions {
            if definition.alias == local_alias {
                return Err(PeerConfigError::LocalAlias(definition.alias));
            }
            let alias = definition.alias;
            let endpoint = PeerEndpoint {
                base_url: definition.url,
                bearer_key: definition.key,
            };
            if peers.insert(alias.clone(), endpoint).is_some() {
                return Err(PeerConfigError::DuplicateAlias(alias));
            }
        }
        Ok(Self { peers })
    }

    /// Resolve a destination without ever treating an unqualified seat as remote.
    ///
    /// # Errors
    /// A qualified destination whose machine alias is not configured.
    pub fn resolve(&self, destination: &Destination) -> Result<ResolvedPeer<'_>, PeerConfigError> {
        let Some(alias) = destination.machine.as_deref() else {
            return Ok(ResolvedPeer::Local);
        };
        self.peers
            .get(alias)
            .map(ResolvedPeer::Remote)
            .ok_or_else(|| PeerConfigError::UnknownAlias(alias.to_string()))
    }
}

const REMOTE_SEND_KIND: &str = "federation.send";
const OUTCOME_EVENT_KIND: &str = "delivery.outcome";

type Clock = dyn Fn() -> Result<u64> + Send + Sync;

/// Remote-send admission and the durable queue consumed by the federation worker.
pub struct FederationService {
    local_alias: String,
    peers: PeerTable,
    queue: Arc<dyn Queue>,
    event_bus: Arc<EventBus>,
    clock: Arc<Clock>,
}

impl FederationService {
    /// Validate peer definitions and build the remote-send service.
    ///
    /// # Errors
    /// Duplicate peer aliases or a peer alias equal to `local_alias`.
    pub fn new(
        local_alias: String,
        definitions: impl IntoIterator<Item = PeerDefinition>,
        queue: Arc<dyn Queue>,
        event_bus: Arc<EventBus>,
    ) -> std::result::Result<Self, PeerConfigError> {
        let peers = PeerTable::new(&local_alias, definitions)?;
        Ok(Self {
            local_alias,
            peers,
            queue,
            event_bus,
            clock: Arc::new(system_time_ms),
        })
    }

    /// The alias stamped on requests forwarded by this daemon.
    pub fn local_alias(&self) -> &str {
        &self.local_alias
    }

    /// Resolve and durably enqueue one remote request.
    ///
    /// The returned receipt says only `Queued`: at this point the request path
    /// has observed local persistence, not the peer or its recipient.
    ///
    /// # Errors
    /// Unknown aliases, serialization failures, queue failures, or audit failures.
    pub async fn enqueue_remote(
        &self,
        request: &SendRequest,
    ) -> std::result::Result<Receipt, FederationSendError> {
        let alias = request
            .to
            .machine
            .as_deref()
            .ok_or_else(|| FederationSendError::Refused("an unqualified destination is local".to_string()))?;
        match self.peers.resolve(&request.to) {
            Ok(ResolvedPeer::Remote(_)) => {}
            Ok(ResolvedPeer::Local) => {
                return Err(FederationSendError::Refused(
                    "an unqualified destination is local".to_string(),
                ));
            }
            Err(error) => return Err(FederationSendError::Refused(error.to_string())),
        }

        let payload = serde_json::to_string(request).map_err(|error| {
            FederationSendError::Runtime(PijError::Adapter {
                adapter: "daemon/federation".to_string(),
                message: format!("could not encode remote message {}: {error}", request.msg_id),
            })
        })?;
        self.queue
            .enqueue(Job {
                kind: REMOTE_SEND_KIND.to_string(),
                serial_key: format!("{}@{alias}", request.to.seat),
                payload,
                dedupe_key: request.msg_id.clone(),
            })
            .await
            .map_err(FederationSendError::Runtime)?;

        let receipt = Receipt {
            msg_id: request.msg_id.clone(),
            outcome: DeliveryOutcome::Queued,
            at: (self.clock)().map_err(FederationSendError::Runtime)?,
        };
        self.publish_outcome(&request.from, alias, &receipt)
            .await
            .map_err(|error| {
                FederationSendError::Runtime(PijError::DeliveryAuditFailed {
                    msg_id: receipt.msg_id.clone(),
                    outcome: "queued".to_string(),
                    audit_error: error.to_string(),
                })
            })?;
        Ok(receipt)
    }

    async fn publish_outcome(
        &self,
        sender: &pij_core::model::SeatId,
        peer: &str,
        receipt: &Receipt,
    ) -> Result<()> {
        let payload = serde_json::to_string(&RemoteOutcome {
            msg_id: &receipt.msg_id,
            outcome: &receipt.outcome,
            transport: "federation",
            peer,
        })
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/federation".to_string(),
            message: format!("could not encode receipt {}: {error}", receipt.msg_id),
        })?;
        self.event_bus
            .publish(Event {
                seq: None,
                v: 1,
                at: receipt.at,
                kind: OUTCOME_EVENT_KIND.to_string(),
                seat: Some(sender.clone()),
                payload,
            })
            .await?;
        Ok(())
    }
}

/// A remote-send refusal or runtime failure.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FederationSendError {
    /// The request names no configured remote destination.
    Refused(String),
    /// Persistence, serialization, clock, or audit failure.
    Runtime(PijError),
}

impl fmt::Display for FederationSendError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Refused(message) => formatter.write_str(message),
            Self::Runtime(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for FederationSendError {}

#[derive(Serialize)]
struct RemoteOutcome<'a> {
    msg_id: &'a str,
    outcome: &'a DeliveryOutcome,
    transport: &'static str,
    peer: &'a str,
}

fn system_time_ms() -> Result<u64> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/federation".to_string(),
            message: format!("system clock is before the Unix epoch: {error}"),
        })?
        .as_millis();
    u64::try_from(millis).map_err(|_| PijError::Adapter {
        adapter: "daemon/federation".to_string(),
        message: "system time does not fit in the event timestamp".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use pij_core::config::PeerDefinition;
    use pij_core::model::Destination;

    use super::{PeerConfigError, PeerTable, ResolvedPeer};

    fn peer(alias: &str) -> PeerDefinition {
        PeerDefinition {
            alias: alias.to_string(),
            url: format!("http://{alias}.example:7461"),
            key: format!("key-{alias}"),
        }
    }

    #[test]
    fn unqualified_destination_is_always_local() {
        let table = PeerTable::new("desktop", [peer("laptop")]).expect("valid peers");
        assert!(matches!(
            table.resolve(&Destination::local("alice")).expect("resolve"),
            ResolvedPeer::Local
        ));
    }

    #[test]
    fn qualified_destination_resolves_its_peer_endpoint() {
        let table = PeerTable::new("desktop", [peer("laptop")]).expect("valid peers");
        let destination = Destination {
            seat: "alice".into(),
            machine: Some("laptop".to_string()),
        };
        let ResolvedPeer::Remote(endpoint) = table.resolve(&destination).expect("resolve") else {
            panic!("qualified destination resolved locally");
        };
        assert_eq!(endpoint.base_url, "http://laptop.example:7461");
        assert_eq!(endpoint.bearer_key, "key-laptop");
    }

    #[test]
    fn duplicate_peer_alias_is_refused_before_collection_erases_it() {
        let error = PeerTable::new("desktop", [peer("laptop"), peer("laptop")])
            .err()
            .expect("duplicate must fail");
        assert_eq!(error, PeerConfigError::DuplicateAlias("laptop".to_string()));
    }

    #[test]
    fn peer_alias_equal_to_local_alias_is_refused() {
        let error = PeerTable::new("desktop", [peer("desktop")])
            .err()
            .expect("collision must fail");
        assert_eq!(error, PeerConfigError::LocalAlias("desktop".to_string()));
    }

    #[test]
    fn unknown_peer_alias_is_a_named_refusal() {
        let table = PeerTable::new("desktop", [peer("laptop")]).expect("valid peers");
        let destination = Destination {
            seat: "alice".into(),
            machine: Some("tablet".to_string()),
        };
        assert_eq!(
            table.resolve(&destination).err(),
            Some(PeerConfigError::UnknownAlias("tablet".to_string()))
        );
    }
}
