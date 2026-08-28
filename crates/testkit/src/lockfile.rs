//! The lockfile check — gate stage 2.
//!
//! `Cargo.lock` must already describe the manifests, because a build that
//! *repairs* the lock proves nothing about the commit: every local build passes
//! while a fresh `--locked` checkout cannot compile at all. That is not
//! hypothetical — it is what shipped in this plan until review caught it.
//!
//! **`--no-deps` makes this check useless, and it is the obvious flag to reach
//! for.** `cargo metadata --locked --no-deps` returns 0 against a lock that is
//! missing a dependency, because without resolving the graph there is nothing to
//! disagree with. Measured on a two-crate fixture: `--no-deps` → 0, full resolve
//! → 101. The first version of this stage used `--no-deps` and therefore passed
//! the exact incident it was written to catch.

use std::path::Path;
use std::process::{Command, Stdio};

/// Is the lockfile already current for these manifests?
///
/// # Errors
/// A message naming what cargo said, and what to do about it.
pub fn check(workspace_root: &Path, cargo: &Path) -> Result<(), String> {
    let output = Command::new(cargo)
        // Full resolve, deliberately: see the module note on `--no-deps`.
        .args(["metadata", "--locked", "--format-version", "1"])
        .arg("--manifest-path")
        .arg(workspace_root.join("Cargo.toml"))
        .current_dir(workspace_root)
        .env("CARGO_INCREMENTAL", "0")
        .stdout(Stdio::null())
        .output()
        .map_err(|error| format!("could not run `{}`: {error}", cargo.display()))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(format!(
        "Cargo.lock does not match the manifests.\n  cargo said: {}\n  Fix: run `cargo metadata \
         >/dev/null` to regenerate it and COMMIT the result. A build that repairs the lock \
         proves nothing about the commit — the next person's `--locked` checkout still fails.",
        stderr.trim().lines().next().unwrap_or("(no output)")
    ))
}
