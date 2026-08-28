//! `FreshStore` — a real database per test, destroyed with the value.
//!
//! Shared state between tests is the cheapest way to make a suite lie: order
//! dependence, a passing test that only passes second, a failure nobody can
//! reproduce alone. Every test that wants a store takes one of these instead.
//!
//! Entropy-named so parallel tests cannot collide, and removed on `Drop` —
//! including the `-wal` and `-shm` sidecars, which a naive cleanup leaves behind
//! and which then confuse the NEXT run that happens to reuse the name.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// A temporary SQLite database that deletes itself.
pub struct FreshStore {
    path: PathBuf,
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

impl FreshStore {
    /// Create a fresh, unique database path. Nothing is written until something
    /// opens it.
    pub fn new() -> Self {
        // Time + pid + a process-local counter: unique across parallel test
        // binaries (pid), across threads inside one (counter), and across runs
        // that reuse a pid (time).
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock is after 1970")
            .as_nanos();
        let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "pij-test-{}-{}-{}.sqlite",
            std::process::id(),
            nanos,
            unique
        ));
        FreshStore { path }
    }

    /// The absolute path to hand to `pij_store::open`.
    pub fn path(&self) -> String {
        self.path.to_string_lossy().to_string()
    }

    /// Does the database file exist yet?
    pub fn exists(&self) -> bool {
        self.path.exists()
    }

    /// Leak the file deliberately, for a test that wants to inspect a corpse.
    /// Returns the path that will now survive; use it and say why.
    pub fn keep(mut self) -> PathBuf {
        let path = std::mem::take(&mut self.path);
        std::mem::forget(self);
        path
    }
}

impl Default for FreshStore {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for FreshStore {
    fn drop(&mut self) {
        for suffix in ["", "-wal", "-shm"] {
            let mut path = self.path.clone().into_os_string();
            path.push(suffix);
            // Best effort: a test that already removed the file is not a failure,
            // and a failure to clean up must never mask the test's own verdict.
            let _ = std::fs::remove_file(PathBuf::from(path));
        }
    }
}
