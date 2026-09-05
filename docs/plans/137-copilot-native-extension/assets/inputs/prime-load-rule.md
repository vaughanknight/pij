# Prime load rule — effective2026-09-05

Set VITEST_MAX_THREADS=4 and CARGO_BUILD_JOBS=4 before test/gate runs. At most one full harness checks or cargo test --workspace per plan; PM serializes. Scoped crate/single-file tests may run concurrently within limits. No additional worktrees beyond existing four137 trees. Source: pij-minor-unicorn observed load203 on16 cores from scanner plus parallel validation.
