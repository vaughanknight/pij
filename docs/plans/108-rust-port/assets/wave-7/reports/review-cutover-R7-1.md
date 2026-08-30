# Reviewer finding R7-1 — the extension cannot register on pij-rs at all

Reviewer `pij-central-crane`. Found while **validating my own instrument** at base
`6987332e`, before the unit under review existed. Raised immediately rather than at verdict
because it is inside `pij-mere-blackbird`'s fence, it is mid-flight work for that seat right
now, and packet item 1 ("the extension targets the pij-rs daemon BY DEFAULT") is unreachable
until it is fixed.

**Severity: blocker for u-cutover-controls.** Not blackbird's defect; blackbird's to fix.

## Observed

Shipped surface, not a unit test: `omp --no-extensions -e <ext>` at `6987332e` in my own
detached worktree, against a throwaway `pij-rs` on `127.0.0.1:17461`
(`PIJ_RS_STATE_DIR=/tmp/pij-w7-crane-state`), `PIJ_HOME=/tmp/pij-w7-crane-legacy-home`,
inherited `PIJ_*` identity variables cleared:

```
Extension error (/tmp/pij-w7-crane-base/.pi/extensions/pij/index.ts): seats.find is not a function.
  (In 'seats.find((seat) => seat.proc?.pid === process.pid && seat.proc.proc_start === procStart)',
   'seats.find' is undefined)
Working...
INSTRUMENT_OK
```

Authority immediately afterwards — the seat never registered:

```json
{"ok":true,"command":"pij seats","v":1,"data":{"seats":[],"unavailable":[]}}
```

## The seam, both halves named

| half | location | shape |
|---|---|---|
| producer | `crates/daemon/src/http/types.rs:143-148` + route `crates/daemon/src/http/mod.rs:112` | `/v1/seats` → `FederatedRoster { seats: Vec<SeatDescriptor>, unavailable: Vec<UnavailablePeer> }` |
| Rust consumer — updated | `crates/cli/src/client.rs:136` | `pub async fn list(&self) -> Envelope<FederatedRoster>` |
| TS consumer — **not** updated | `.pi/extensions/pij/adapters/daemon-http.ts:113-114` | `seats(): Promise<readonly RustSeatDescriptor[]>` = `this.get<readonly RustSeatDescriptor[]>("/v1/seats")` |
| crash site | `.pi/extensions/pij/adapters/rust-runtime.ts:194` (and `:199` `seats.map`) | `seats.find(...)` on the object `{seats, unavailable}` |

Live wire, for the avoidance of doubt:

```
$ curl -s -H "Authorization: Bearer …" http://127.0.0.1:17461/v1/seats
{"ok":true,"command":"pij seats","v":1,"data":{"seats":[],"unavailable":[]}}
```

`decodeEnvelope(...).data` is therefore an **object**, handed to callers typed as an array.
The TypeScript type is a cast at the boundary, so nothing caught it at compile time.

## Provenance — the same commit, the same mistake, twice

`git log -1 -S'unavailable' -- crates/daemon/src` → **`5a2a2c09` fix(rust): verify tap
ownership and pointer facts**.

That is the identical commit that added `tokio` to `crates/tmux` without regenerating the
derived arch fixtures (see `review-cutover-gate-red.md`). One commit, two halves left behind:
a derived fixture and a cross-language client. It was itself a wave-6 finding-closing commit,
which is REVIEWER.md § 2's *"a FIX landed in one half"* (E-029/E-031) in its purest form.

## Why no instrument caught it

The wave-3 matrix receipts (`assets/reports/matrix-u-extension-{pi,omp}.md`) are honest and
were true when written; nothing has re-run them since wave 4 added federation. This is E-025 —
only running the shipped thing proves it against the world the user gets — and the archive now
contains a green receipt for a surface that has been broken for two waves.

## The second finding this produced — transcripts that cannot fail

**The host swallowed a completely dead extension and exited 0.** In the run above the
extension errored, never registered, and the turn still printed `INSTRUMENT_OK` with exit
status 0. An earlier attempt of mine failed even harder — `Cannot find package 'picomatch'`,
extension not loaded at all — and *also* printed the expected reply and exited 0.

Therefore, for the both-hosts matrix this unit owes: **a transcript showing a model reply is
not evidence of anything.** Only a positive observation from the authority — the seat row from
`pij-rs list`, or the `pij-<id>.json` in the legacy home — distinguishes "the extension
registered" from "the extension was never loaded". The wave-3 matrices did include the
authority output and were right to. I will refuse any leg that does not.

## Environment note for whoever runs the matrix next

This worktree has **no `node_modules`**, and neither does any parent directory, so the
extension cannot resolve `picomatch` / `dotenv` / `grammy` and fails to load outright. The
wave-3 matrix ran from `s108-w3-extension`, which has one. I symlinked the canonical
checkout's `node_modules` into my own scratch worktree (read-only use; the canonical
`.pi/**` was not touched). Worth encoding somewhere, because the failure mode is a host that
looks perfectly healthy.

## Tree

All probes in `/tmp/pij-w7-crane-base` (my own `git worktree add --detach 6987332e`) and
`/tmp` scratch dirs. The reviewed worktree's HEAD was never moved and its working tree —
including blackbird's in-flight edits — was never touched; every commit of mine is a
pathspec commit of a single file under `assets/wave-7/reports/`.
