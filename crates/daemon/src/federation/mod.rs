//! Cross-machine delivery owned by one long-lived worker.

use std::collections::BTreeMap;
use std::fmt;

use pij_core::config::PeerDefinition;
use pij_core::model::Destination;

use crate::http::PeerEndpoint;

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
