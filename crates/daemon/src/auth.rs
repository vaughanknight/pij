//! The per-boot bearer key.
//!
//! Three rules, each with a failure behind it. The first two were designed in;
//! the third came out of review, and it is the one that had teeth.
//!
//! * **Per boot, never persisted across restarts.** A key that outlives the
//!   process it authorises becomes a credential nobody rotates.
//! * **Never readable by anyone else.** 0600, and — the review finding —
//!   `OpenOptions::mode()` only applies to a file it CREATES. Opening an existing
//!   0644 `daemon.key` with `.mode(0o600)` silently keeps 0644, so the key was
//!   published world-readable on every restart into an existing state dir. The
//!   file is now created fresh under a unique name (`create_new`, which fails
//!   rather than reusing) and moved into place.
//! * **Published only by a boot that SUCCEEDS.** Also from review: the old code
//!   wrote `daemon.key` before binding, so a second daemon that then failed to
//!   bind had already overwritten the running daemon's key — bricking a healthy
//!   process by starting a doomed one. Staging plus an atomic rename after a
//!   successful bind means a failed boot cannot touch the live credential.
//!
//! The ordering property still holds: the key is in place before the server ever
//! answers a request. `bind` only opens the listen socket — nothing is served
//! until `axum::serve` runs, which happens after publication.

use std::path::{Path, PathBuf};

use pij_core::error::{PijError, Result};

/// A generated bearer key, staged on disk but not yet published.
///
/// Deliberately a distinct type from [`BootKey`]: publication is a step that can
/// be forgotten, and a type that cannot be used as a published key until it has
/// been published makes forgetting it a compile error rather than a review note.
#[derive(Clone, Debug)]
pub struct StagedKey {
    token: String,
    staged_at: PathBuf,
    publish_to: PathBuf,
}

impl StagedKey {
    /// Move the staged key into place, replacing any previous one atomically.
    ///
    /// # Errors
    /// [`PijError::Adapter`] when the rename fails.
    pub fn publish(mut self) -> Result<BootKey> {
        // `rename` within one directory is atomic: a reader either sees the old
        // key or the new one, never a truncated file. It also carries the staged
        // file's 0600 mode, so the published key cannot inherit a laxer mode from
        // whatever was there before.
        std::fs::rename(&self.staged_at, &self.publish_to).map_err(|error| {
            let _ = std::fs::remove_file(&self.staged_at);
            PijError::Adapter {
                adapter: "daemon/auth".to_string(),
                message: format!(
                    "could not publish the boot key to {}: {error}",
                    self.publish_to.display()
                ),
            }
        })?;

        // `Drop` still runs after this (it removes the staging path, which the
        // rename already consumed — a harmless no-op), so the fields are taken
        // rather than moved out.
        Ok(BootKey {
            token: std::mem::take(&mut self.token),
            path: std::mem::take(&mut self.publish_to),
        })
    }

    /// The token, for a caller that needs it before publication (the router is
    /// built before the server runs).
    pub fn token(&self) -> &str {
        &self.token
    }
}

impl Drop for StagedKey {
    fn drop(&mut self) {
        // A staged key whose boot failed is a secret nobody will ever use; leaving
        // it in the state dir is litter that looks like a credential.
        let _ = std::fs::remove_file(&self.staged_at);
    }
}

/// A published bearer key and the file it lives in.
#[derive(Clone, Debug)]
pub struct BootKey {
    /// The secret itself, hex-encoded.
    pub token: String,
    /// Where it was published, 0600.
    pub path: PathBuf,
}

impl BootKey {
    /// The `Authorization` header value a client must send.
    pub fn header(&self) -> String {
        format!("Bearer {}", self.token)
    }
}

/// Generate 256 bits from the OS and stage them 0600, WITHOUT publishing.
///
/// # Errors
/// [`PijError::Adapter`] when randomness or the filesystem refuses.
pub fn stage_key(dir: &Path) -> Result<StagedKey> {
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

    // Unique per attempt, so two racing boots stage into different files and
    // neither can observe the other's half-written key.
    let staged_at = dir.join(format!("daemon.key.staging.{}", std::process::id()));
    let _ = std::fs::remove_file(&staged_at);
    write_private_new(&staged_at, &token)?;

    Ok(StagedKey {
        token,
        staged_at,
        publish_to: dir.join("daemon.key"),
    })
}

/// Create a NEW file with the mode, never adjust an existing one.
///
/// `create_new` is the load-bearing flag: `.mode()` applies only at creation, so
/// opening an existing file with a stricter mode silently leaves the old, laxer
/// one — which is precisely how a 0644 `daemon.key` survived a restart.
#[cfg(unix)]
fn write_private_new(path: &Path, token: &str) -> Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;

    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/auth".to_string(),
            message: format!("could not create {}: {error}", path.display()),
        })?;
    file.write_all(token.as_bytes())
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/auth".to_string(),
            message: format!("could not write {}: {error}", path.display()),
        })
}

#[cfg(not(unix))]
fn write_private_new(path: &Path, token: &str) -> Result<()> {
    // Windows has no mode bits; the file inherits the directory's ACL. Recorded
    // as a known gap rather than silently claiming 0600 semantics we do not have.
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/auth".to_string(),
            message: format!("could not create {}: {error}", path.display()),
        })?;
    file.write_all(token.as_bytes())
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/auth".to_string(),
            message: format!("could not write {}: {error}", path.display()),
        })
}

/// Read a key a running daemon published.
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
