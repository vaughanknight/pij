//! `pij-gate` — the one command (ac-0007).
//!
//! ```text
//! ~/.cargo/bin/cargo run -p pij-testkit --bin pij-gate
//! ```
//!
//! Five stages, in the order that fails cheapest first:
//!
//! 1. **toolchain** — the running rustc equals the pin, or nothing below means
//!    anything (workshop 001 R6a as amended).
//! 2. **lock** — `cargo metadata --locked` proves `Cargo.lock` matches the
//!    manifests. Review caught a commit whose lock predated a new dependency:
//!    every local build passed because cargo silently UPDATED the lock, while a
//!    fresh `--locked` checkout could not build at all. A gate that mutates the
//!    tree it is judging can report green on something nobody else can compile.
//! 3. **fmt** — `cargo fmt --check`.
//! 4. **clippy** — `-D warnings`, all targets.
//! 5. **test** — `cargo test --workspace`.
//! 6. **arch** — the crate graph against the committed allow-list.
//!
//! It runs EVERY stage even after one fails, and prints a per-stage verdict at
//! the end: an agent that has to re-run a gate five times to find five problems
//! has been given a worse instrument than one that answers in a single pass. The
//! exit code is still the answer — non-zero means the task is not done.
//!
//! `CARGO_INCREMENTAL=0` is set for the children: incremental artifacts are pure
//! cost on a machine where several agents build the same tree.

use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

use pij_testkit::{arch, toolchain};

struct Stage {
    name: &'static str,
    args: Vec<&'static str>,
}

fn main() -> ExitCode {
    let cargo = toolchain::cargo_path();
    let root = arch::workspace_manifest_path()
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));

    println!("pij-gate: {} · cargo {}", root.display(), cargo.display());

    let mut failures: Vec<&'static str> = Vec::new();
    let mut verdicts: Vec<(&'static str, bool, String)> = Vec::new();

    // Stage 1 — the toolchain, in-process: it decides whether the rest is
    // evidence at all.
    match toolchain::assert_pinned(&root, &cargo) {
        Ok(version) => verdicts.push(("toolchain", true, format!("rustc {version} == pin"))),
        Err(message) => {
            verdicts.push(("toolchain", false, message));
            failures.push("toolchain");
        }
    }

    let stages = [
        Stage {
            name: "lock",
            args: vec![
                "metadata",
                "--locked",
                "--no-deps",
                "--format-version",
                "1",
                "--offline",
            ],
        },
        Stage {
            name: "fmt",
            args: vec!["fmt", "--all", "--check"],
        },
        Stage {
            name: "clippy",
            args: vec![
                "clippy",
                "--workspace",
                "--all-targets",
                "--",
                "-D",
                "warnings",
            ],
        },
        Stage {
            name: "test",
            args: vec!["test", "--workspace"],
        },
    ];

    for stage in &stages {
        let status = if stage.name == "lock" {
            // Its stdout is the whole metadata document; only the exit code matters.
            Command::new(&cargo)
                .args(&stage.args)
                .current_dir(&root)
                .env("CARGO_INCREMENTAL", "0")
                .stdout(std::process::Stdio::null())
                .status()
        } else {
            Command::new(&cargo)
                .args(&stage.args)
                .current_dir(&root)
                .env("CARGO_INCREMENTAL", "0")
                .status()
        };

        match status {
            Ok(status) if status.success() => {
                verdicts.push((stage.name, true, format!("cargo {}", stage.args[0])));
            }
            Ok(status) if stage.name == "lock" => {
                verdicts.push((
                    stage.name,
                    false,
                    format!(
                        "exit {status} — Cargo.lock does not match the manifests; run \
                         `cargo metadata --no-deps >/dev/null` and COMMIT the lock"
                    ),
                ));
                failures.push(stage.name);
            }
            Ok(status) => {
                verdicts.push((stage.name, false, format!("exit {status}")));
                failures.push(stage.name);
            }
            Err(error) => {
                verdicts.push((stage.name, false, error.to_string()));
                failures.push(stage.name);
            }
        }
    }

    // Stage 5 — the architecture, in-process: it is pure over `cargo metadata`,
    // so there is nothing to shell out to.
    match (arch::allowlist(), arch::workspace_graph()) {
        (Ok(allowlist), Ok(graph)) => {
            let violations = arch::check(&graph, &allowlist);
            if violations.is_empty() {
                verdicts.push((
                    "arch",
                    true,
                    format!("{} crates, 0 violations", graph.crates.len()),
                ));
            } else {
                for violation in &violations {
                    eprintln!("  - {violation}");
                }
                verdicts.push(("arch", false, format!("{} violation(s)", violations.len())));
                failures.push("arch");
            }
        }
        (Err(error), _) | (_, Err(error)) => {
            verdicts.push(("arch", false, error.to_string()));
            failures.push("arch");
        }
    }

    println!("\npij-gate verdict");
    for (name, ok, detail) in &verdicts {
        println!(
            "  {:<9} {}  {detail}",
            name,
            if *ok { "PASS" } else { "FAIL" }
        );
    }

    if failures.is_empty() {
        println!("\npij-gate: all stages green");
        return ExitCode::SUCCESS;
    }

    eprintln!(
        "\npij-gate: {} stage(s) failed — {}. The task is not done.",
        failures.len(),
        failures.join(", ")
    );
    ExitCode::FAILURE
}
