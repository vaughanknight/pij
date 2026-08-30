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

/// Compare two secrets without leaking their common prefix length through timing.
///
/// Length is not a secret here (it is fixed by how keys are minted) but the
/// CONTENT is, so the loop always runs over the longer of the two and folds every
/// byte into one accumulator rather than returning at the first difference.
fn constant_time_eq(left: &str, right: &str) -> bool {
    let (left, right) = (left.as_bytes(), right.as_bytes());
    let mut difference = (left.len() ^ right.len()) as u8;
    let width = left.len().max(right.len());
    for index in 0..width {
        let a = left.get(index).copied().unwrap_or(0);
        let b = right.get(index).copied().unwrap_or(0);
        difference |= a ^ b;
    }
    difference == 0
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
        // Constant-time per candidate, and EVERY candidate is compared: no early
        // exit on the first match either, so acceptance time does not reveal a
        // key's position in the ring. The LAN banner says these keys are the only
        // access control, which makes the comparison itself part of the boundary.
        self.tokens.iter().fold(false, |found, accepted| {
            constant_time_eq(accepted, token) | found
        })
    }
}
