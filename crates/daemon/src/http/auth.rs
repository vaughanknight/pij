use std::sync::Arc;

/// Accepted inbound bearer credentials.
///
/// The first credential is the daemon's per-boot local key. The remaining keys
/// are persistent per-machine-pair credentials established by manual bootstrap.
/// Removing a peer key from this ring is how an operator revokes that machine.
#[derive(Clone)]
pub struct AuthRing {
    tokens: Arc<[String]>,
}

impl AuthRing {
    /// Build the ring from one local key and configured peer keys.
    pub fn new(local_key: String, peer_keys: impl IntoIterator<Item = String>) -> Self {
        let tokens: Vec<String> = std::iter::once(local_key).chain(peer_keys).collect();
        Self {
            tokens: tokens.into(),
        }
    }

    pub(crate) fn accepts(&self, authorization: &str) -> bool {
        let Some(token) = authorization.strip_prefix("Bearer ") else {
            return false;
        };
        self.tokens.iter().any(|accepted| accepted == token)
    }
}
