# u-sidecars done — Telegram · bg · chore

## Result

All three sidecars ship as queue consumers over the seven existing ports. No port or core-config field was added.

- **Telegram**: legacy credential-file reader; single-consumer lock; outbound binding persisted by conversation; allowlist-first inbound routing; durable cursor advanced only after the reply is durably enqueued; delivery-failure spine signal; restart-safe replay; terminal handling after external-send/binding failure; cross-generation lock compatibility.
- **bg**: detached shell as its own process-group leader; real output delivery; TERM→grace→KILL full-group cancellation; one-directional ESRCH fast path plus zombie-excluding observation; cancelled receipt only after observed death; distinct Done/Failed/Lost/Cancelled outcomes; boot-local ownership and own-group brakes; duplicate retries cannot starve unrelated work.
- **chore**: durable named probes; run re-reports pending deltas without advancing baseline; only ack promotes pending to baseline; failed probes remain visible as NOT-PROBEABLE.

Public composition API: `pij_sidecars::Sidecars::new(queue, spine, state_dir, telegram_env)?.start()`. The composed daemon owns `SidecarHandles` and joins shutdown with its other workers. The shipped producer is `POST /v1/sidecar` plus the six `pij-rs sidecar` actions.

## Code and review heads

- Initial implementation: `6ad2abbc`
- Round-1 durability/outcome repairs: `9db95e7f`
- Queue-progress repair: `8f1d52ba`
- Durable direct-child exit: `16309f2e`
- Pending-vs-lost discriminator + multi-record witness: `73c413e8`
- Inbound spine evidence: `db45515c`
- Symmetric Telegram lock schema: `4f8fc844`
- Loaded-machine cancellation convergence: `83f6d041`
- Numeric errno signalling: `0f252a86`
- Pre-SIGKILL `getpgid` ownership brake: `2979c670`
- Positive survivor-kill witness + pinned Telegram egress: `e73f96bd`
- Reviewer: **CODE APPROVE** through round 8; composed `--locked` gate green and errno/getpgid brakes verified. Final verdict targets `a64c8773`.
- PM terminal composition: `a64c8773`, all six gate stages green; F10 and M7 positive witness verified by content.

## Deterministic proof

Receipt: [`u-sidecars-gate.txt`](./u-sidecars-gate.txt).

Final private cold target `/tmp/pij-w7-sidecars-final5`:

```text
toolchain PASS  rustc 1.98.0 == pin
lock      PASS  Cargo.lock matches the manifests, and the tree
fmt       PASS  cargo fmt
clippy    PASS  cargo clippy
test      PASS  cargo test
arch      PASS  9 crates, 0 violations
pij-gate: all stages green
```

Toolchain and host:

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
Avail: 155 GiB on /System/Volumes/Data
```

Sidecar suite: 11 passed, 0 failed. Each long-lived consumer's transient-failure test drives the shipped `start_resilient_loop`. Observed count assertions use limits 9/17 against actual counts 2/1. The multi-record Failed/Lost witness starts three distinct failing commands and one healthy command together, asserts every outcome independently, and passed 20/20 exact runs.

## Mutation evidence

Receipt: [`u-sidecars-mutations.txt`](./u-sidecars-mutations.txt).

- Making chore `run` advance baseline fails `chore_run_never_advances_baseline_ack_does_and_failed_probe_stays_visible` with left `Some("alpha")`, right `None`.
- Removing `await_group_exit` fails `bg_cancel_observes_the_full_process_group_dead_before_cancelled_receipt`: cancelled receipt exists while live group members remain.
- Independent reviewer mutations also proved the shipped-loop survival and observed-count witnesses, plus the send-once terminal outcome.

## Live-fire proof

Transcript: [`u-sidecars-live-fire.txt`](./u-sidecars-live-fire.txt). Store excerpts: [`u-sidecars-spine-excerpts.jsonl`](./u-sidecars-spine-excerpts.jsonl).

### Telegram — full phone round trip

- Announced every window over the legacy channel before stopping it.
- First attempt exposed the producer's bare-202/envelope mismatch. The enqueue had landed while the CLI confidently reported failure. The attempt was aborted without retry, Rust stopped, and legacy restored/reacquired before investigation.
- Accepted attempt sent `pij-rs telegram bridge live-fire 2026-08-30T23:39:37Z` through the real Rust bridge. Jordan swipe-replied `hi` from his phone.
- Real Claude pane `%1876` received: `Message from @pij-telegram: [pij from pij-telegram] hi`.
- Rust evidence: binding spine seq 10 to `pij-sidecars-live`; delivery job 21 with msg-id `telegram-459814436`, body `hi`, state done; cursor seq 11 advanced to 459814437 only after durable enqueue succeeded.
- Legacy falsifier: the legacy bridge was stopped for the receive window; independent review found zero matching legacy-path deliveries.
- Restore: stopped Rust; legacy reacquired with pid **93025**, descriptor returned (`pij state pij-telegram`: idle/active), and a post-restore send delivered. PM independently verified zero Rust daemons and the live legacy process/descriptor.

The original pre-registered claim remained useful; its numbers did not. Reviewer withdrew a “pre-window” baseline captured after the accepted reply had already landed. The lesson: pre-register the claim, re-measure the baseline. Content-addressed rows saved the verdict where stale counts would have produced a false negative.

### bg — completion and cancellation

- Real `cargo --version` command completed with exit 0 and output `cargo 1.98.0 (797e8a9bc 2026-08-05)`.
- Real Claude pane received the `pij-bg` completion as an injected turn.
- Cancellation tree: shell leader pid/pgid 8499 plus child pid 8504. The durable receipt records `observed_pids:[8499,8504]`, status `cancelled`; a post-receipt process scan found no live/non-zombie member of pgid 8499.
- A later cold gate exposed a real 5-second TERM-only timeout under load. `83f6d041` replaces 20ms full-table scans with a one-directional ESRCH fast path, 100ms zombie-excluding observation, and SIGKILL escalation after a 2-second grace. The timeout still names real survivors. Full-workspace stress: 20/20 after the fix.

### chore — run/ack asymmetry

- Live probe: `printf live-probe-v1`.
- Run 1: baseline null, pending `live-probe-v1`, changed.
- Run 2 before ack: identical state; run did not advance baseline.
- Ack: baseline `live-probe-v1`, pending null, unchanged.

## Review findings closed

F1 nonzero reported finished; F2 restart orphan reported finished; F3 offset-before-delivery loss; F4 in-memory cursor; F5/F9 stuck retry starvation; F6 unowned pgid signal; F8 duplicate Telegram send after binding failure; F10 unconstrained credential egress; F12 bare producer response; loaded-machine TERM-only cancellation timeout; prose-based signal policy; scan-to-SIGKILL PID ownership window. The Failed/Lost repair discriminates rather than suppresses: owned-but-not-yet-exited remains Running; persisted observed nonzero becomes Failed; a planted stale-owner/dead-group record remains reachable as Lost.

The destructive guards are **brakes**, not policies: ESRCH alone proves absence; EPERM/success fall through zombie-excluding observation; boot ownership, own-pgid, and immediate `getpgid` mismatch/error checks only spare targets. Removing a guard allows signalling strictly more processes, never a different target. The per-PID fallback has both witnesses: an out-of-group pid is spared, while a matching live survivor exits by signal 9. Telegram egress is pinned to the configured operator chat; an override names requested/configured values and reaches the bot API zero times.

## Cross-generation Telegram lock

The live run found Rust wrote `{pid,startedAtMs}` while legacy requires `{pid,startedAt}` and treats an unparseable file as reclaimable. That would let legacy delete a live Rust lock and steal the single-consumer poll.

`4f8fc844` makes the writer legacy-compatible and the Rust reader symmetric:

- legacy `{pid, startedAt:string}` with a live pid → refuse;
- transitional Rust `{pid, startedAtMs:number}` with a live pid → refuse;
- unrecognised lock → refuse, because unknown ownership is not absence;
- parsed dead holder → reclaim.

Legacy's reclaim-on-unparseable is a **policy**, not a brake: removing it makes legacy do less (refuse) rather than choose another owner. It inherited the wrong input interpretation: “cannot parse” was read as “nobody holds it.”

## Shared/derived files

- Unit-owned: `Cargo.toml` member line; `crates/sidecars/**`; `[crates.pij-sidecars]` allowlist block.
- Derived, separate typed commit: both architecture metadata fixtures (`7a8e392c`).
- Composer-owned: `Cargo.lock`, daemon dependency/wiring, CLI/HTTP producer and its end-to-end instrument.

Dependencies declared by `pij-sidecars`: `pij-core`, `nix` 0.30 with only `process` + `signal`, `reqwest`, `serde`, `serde_json`, `tokio`; dev-only `async-trait`, `axum`, `pij-store`, `pij-testkit`.

## Assumptions and disclosures

1. Telegram is opt-in only through explicit `PIJ_TELEGRAM_ENV`; no `$HOME` fallback may seize the production poll from a dev daemon.
2. Missing/held Telegram configuration disables that optional loop without taking down the daemon's other paths.
3. Telegram reply binding is the persisted fact from the latest successful outbound for that conversation; unbound inbound is loudly refused, never inferred.
4. A zombie process-table row is residue, not liveness. Direct child status comes from `try_wait`; grandchildren are observed excluding state `Z`.
5. A boot-local ownership mismatch and the daemon's own pgid veto cancellation. These one-directional brakes prefer an undeleted job over signalling an unowned process group.
6. Process-group absence branches on numeric errno, never command prose: ESRCH=3 alone converges; EPERM=1 proves nothing; SIGKILL tolerates both before observed scans decide. Per-PID fallback rechecks current group ownership immediately before signalling.
7. `harness boot` remained red before work because the unrelated TypeScript typecheck omitted diagnostics; the packet's Rust `pij-gate` is green.
8. The mandated shared Cargo target produced a false red by serving another worktree's unpushed artifacts. Final gates used private cold targets after the PM withdrew that mandate.
9. The live Claude seat later self-adopted under a different legacy id, exposing a pre-existing asserted-vs-derived identity mismatch. Rust delivery to its registered descriptor still arrived; this unit did not modify identity policy.
