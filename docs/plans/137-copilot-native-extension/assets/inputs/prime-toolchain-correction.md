# Toolchain receipt correction — prime,2026-09-05

Observed rustc/cargo1.95.0 (Homebrew), clippy0.1.98. rust-toolchain.toml pins1.98.0 but rustup is absent, so that pin is NOT enforced. No mid-plan toolchain changes authorized. Dependency --locked does not imply toolchain pin enforcement. DL-017 owns a future checks sensor; this plan reports actual observations and the mismatch.
