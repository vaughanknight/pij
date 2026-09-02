# Backpressure Coverage — pij-rs-send-defaults

**Plan**: `../plan.dd.md`
**Basis (plan SHA-256)**: `39d3d123ac83177b1c77a45f7b46baff6991d6be987ba3229aa830f3b090682f`
**Generated**: 2026-09-02
**Certainty**: Partial

> Advisory selection, not enforcement.

## Existing Sensors

| Sensor | Paved command | Dimension |
|---|---|---|
| Rust workspace tests | `cargo test --workspace` | behaviour |
| Rust lint | `cargo clippy --workspace --all-targets -- -D warnings` | maintainability |
| Engineering gate | `harness checks` | integrated repository signals |
| Isolated real-client proof | plan 130 `assets/live-send-defaults.md` scenario | runtime behaviour |

## Coverage Matrix

| Promise | Selected proof | Status | Tier |
|---|---|---|---|
| Pane-derived sender and minted UUIDv7 | `cargo test -p pij-cli --test spawn shipped_cli_registers_sends_reads_acks_and_does_not_read_twice`; then isolated OMP + Claude transcript | EXTEND | computational + human-observed runtime |
| Literal argument/file/stdin bodies | same shipped-CLI integration test; then isolated stdin and 5 KiB file transcript | EXTEND | computational + human-observed runtime |
| Named identity/body refusals | same shipped-CLI integration test | EXISTS | computational |
| Pane-derived inbox and corrected notices | `cargo test -p pij-cli`; `cargo test -p pij-daemon pointer::tests`; `cargo test -p pij-daemon http::identity_tests` | EXISTS | computational |
| Cross-seat destructive refusal and non-destructive peek | shipped-CLI integration test plus fake/SQLite queue contract suites | EXISTS | computational |
| Repository gates | `cargo test --workspace`; `cargo clippy --workspace --all-targets -- -D warnings`; `harness checks` | EXISTS | computational |

## Proof Plan (selected)

1. `cargo test -p pij-cli`
2. `cargo test -p pij-daemon pointer::tests`
3. `cargo test -p pij-daemon http::identity_tests`
4. `cargo test -p pij-testkit --test contract_over_fakes`
5. `cargo test -p pij-store --test queue`
6. `cargo test --workspace` with req-0044 baseline failures identified by exact test name
7. `cargo clippy --workspace --all-targets -- -D warnings`
8. `harness checks`
9. Isolated daemon with hand-started OMP and Claude panes; paste the AC1/AC2/AC4/AC6 transcript to `assets/live-send-defaults.md`

## Closing Verdict

One thing already done automatically: the plan's machine-checkable promises now have exact commands, so a green result is evidence rather than opinion. One thing still requiring the live run: hand-started OMP and Claude panes must prove pane identity and literal-body delivery against an isolated daemon; unit tests cannot prove the real harness boundary.

If a listed check passes while the live client contradicts it, fix the checker first, then the code.

In summary: targeted Rust tests cover identity, body sources, notice text, queue preservation, and cross-seat refusal; the isolated real-client transcript remains the runtime proof. Proceed with the live scenario after the repository gates finish.
