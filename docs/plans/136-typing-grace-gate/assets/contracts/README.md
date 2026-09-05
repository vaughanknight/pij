# The hold/grace contract moved

`hold-events.json` — the frozen wire contract for plan 136 (delivery.held /
delivery.released, `/v1/hold`, `/v1/release`, the register response carrying
`typing_grace_ms`, the `Queue::defer` / `Queue::release_deferred` seam, and the
invariants each unit defends) — now lives at:

    crates/testkit/fixtures/delivery/hold-events.json

**Why it moved (2026-09-05, prime ruling via plan 135):** four test suites read
it — `crates/harnesses/src/interaction.rs`, `crates/daemon/src/http/tests.rs`,
`.pi/extensions/pij/core/hold-queue.test.ts` and
`.pi/extensions/pij/adapters/rust-runtime.test.ts` — and post-flight ARCHIVES
the plan folder. A fixture that lives in a plan folder is a test suite with an
expiry date; archiving 136 would have broken the branch that shipped it.

The vocabulary reasoning stays here with the plan; the bytes the tests compare
against live with the tests.
