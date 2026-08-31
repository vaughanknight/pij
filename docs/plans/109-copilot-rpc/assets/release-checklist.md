# Rust release — checklist and evidence trail

Drain order: finish what is in flight, take on nothing new, cut a Rust release.
Unit 2 (`u-copilot-rpc`) is DEFERRED. The parity backlog is FROZEN.

## Blocking items

| # | item | state | evidence |
|---|---|---|---|
| 1 | **unit 1 F1 fixed AND re-verified** | fix pushed, re-verification running | unit head `27a161b1`, gated code `95d86a91`; reviewer contract pre-registered `a1924277` |
| 2 | **`index.test.ts` witness repair** | seat dispatched | branch `s109/ts-witness`, packet `packet-u-ts-witness.md` |
| 3 | environmental test fixes (exact-empty stdout, ENOTEMPTY teardown) | same seat | — |
| 4 | **merge `main` into the integration head** | held deliberately until 1 lands — merge ONCE | proven in scratch to close the three reported TS files |
| 5 | Rust gate green at the merged head, unfiltered, cargo's own exit code | pending 1+4 | — |
| 6 | consume the CI branch | **DRAINED, APPROVED** | `s109/rust-ci` @ `d1499c68` |
| 7 | version tag + PR to `main` for prime review | pending | main is push-protected; Jordan merges |

## Why item 4 is sequenced, not skipped

The integration head was **eight commits behind `main`**. A CI report called three TS
failures "pre-existing"; going to `main` and measuring gave the discriminating numbers:

```
main                         cli-verbs + badmodel  41 passed   index.test.ts  11 passed
integration head + main      cli-verbs + badmodel  41 passed   index.test.ts  10 FAILED
```

So the three named files were a **stale-branch artefact** — closed by the merge — and
what remains is **ours**: a unit fenced to Rust changed a TypeScript contract and its
witness was never consulted. **The report was true and the classification was wrong**,
and only the measurement separated them.

## Standing constraint on item 2

**The coder does not bless drift.** Each failure traces to a **ruled** change before its
witness is touched; anything tracing to nothing ruled returns as a **finding**, not a
test edit. *Updating a witness to match unruled behaviour is how a defect gets a
passport.*

And two failures sharing a **file** is not two failures sharing a **kind** — an id
rendering change and a gate that reversed direction in both arms get traced separately.

## Evidence that travels with the PR

- unit-1 review rounds 0–2 and the pre-registered falsifier amendments on
  `s109/review-spawn-rpc-port`
- the CI unit's verdict + receipt, retained in its worktree
- `reports/findings-log.md` — F0-1 … F0-8 graded, D-1 deferred with its trigger
- `SHAPE.md` Amendments 1–3

## Deferred, with triggers

- **D-1** — three tests assert a negative via a 20ms timeout and pass *because the
  timeout elapsed*. Trigger: first CI flake on any of the three, or post-release cleanup.
- **unit 2** — `u-copilot-rpc`, deferred by drain order; its packet is written.
- **verb parity** — 15% coverage measured, backlog frozen; lifecycle first when it thaws,
  and the `tail` false friend renamed **before** parity completes, while nothing depends
  on it.
