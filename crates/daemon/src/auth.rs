//! The per-boot bearer key.
//!
//! Two rules, both of which have a failure this exists to prevent:
//!
//! * **Per boot, never persisted across restarts.** A key that outlives the
//!   process it authorises becomes a credential nobody rotates.
//! * **Written 0600 BEFORE the socket binds.** The window between "listening" and
//!   "key readable only by me" is a window in which an unauthenticated local
//!   caller can reach the daemon, and on a shared machine that is every other
//!   user. Ordering is the whole mechanism, so `write_key` returns the key and
//!   the caller binds afterwards — the types make the order hard to get wrong.

use std::path::{Path, PathBuf};

use pij_core::error::{PijError, Result};

/// A freshly generated bearer key and the file it was written to.
#[derive(Clone, Debug)]
pub struct BootKey {
    /// The secret itself, hex-encoded.
    pub token: String,
    /// Where it was written, 0600.
    pub path: PathBuf,
}

impl BootKey {
    /// The `Authorization` header value a client must send.
    pub fn header(&self) -> String {
        format!("Bearer {}", self.token)
    }
}

/// Generate 256 bits from the OS, write them 0600, and return the key.
///
/// # Errors
/// [`PijError::Adapter`] when randomness or the filesystem refuses.
pub fn write_key(dir: &Path) -> Result<BootKey> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|error| PijError::Adapter {
        adapter: "daemon/auth".to_string(),
        message: format!("the OS refused randomness for the boot key: {error}"),
    })?;
    let token: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();

    std::fs::create_dir_all(dir).map_err(|error| PijError::Adapter {
        adapter: "daemon/auth".to_string(),
        message: format!("could not create {}: {error}", dir.display()),
    })?;
    let path = dir.join("daemon.key");

    // Create with the mode, rather than creating then chmod-ing: the two-step
    // version leaves the key world-readable for however long the gap lasts.
    write_private(&path, &token)?;

    Ok(BootKey { token, path })
}

#[cfg(unix)]
fn write_private(path: &Path, token: &str) -> Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;

    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/auth".to_string(),
            message: format!("could not write {}: {error}", path.display()),
        })?;
    file.write_all(token.as_bytes())
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/auth".to_string(),
            message: format!("could not write {}: {error}", path.display()),
        })
}

#[cfg(not(unix))]
fn write_private(path: &Path, token: &str) -> Result<()> {
    // Windows has no mode bits; the file inherits the directory's ACL. Recorded
    // as a known gap rather than silently claiming 0600 semantics we do not have.
    std::fs::write(path, token).map_err(|error| PijError::Adapter {
        adapter: "daemon/auth".to_string(),
        message: format!("could not write {}: {error}", path.display()),
    })
}

/// Read a key a running daemon wrote.
///
/// # Errors
/// [`PijError::Adapter`] naming the path, so "the daemon is not running" and
/// "you cannot read its key" stay distinguishable.
pub fn read_key(path: &Path) -> Result<String> {
    std::fs::read_to_string(path)
        .map(|text| text.trim().to_string())
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/auth".to_string(),
            message: format!(
                "could not read the daemon key at {} ({error}) — is the daemon running?",
                path.display()
            ),
        })
}
