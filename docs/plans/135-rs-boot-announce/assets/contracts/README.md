# Contract — `/v1/register` `binding` (frozen, plan 135)

**This directory is the seam.** `register-response.json` is the ONE artifact both
runtimes assert against (AC4). Rust (`crates/daemon`) and TypeScript
(`.pi/extensions/pij/core/daemon-wire.ts` consumers) each **READ this file by
path** in their tests. Neither may restate the literals inline — a restated
fixture is two contracts wearing one name.

Path both sides cite:
`docs/plans/135-rs-boot-announce/assets/contracts/register-response.json`

## Vocabulary (frozen — do not widen; a fourth value is stop-and-ask)

`binding` is an **additive optional** field on the `/v1/register` response
descriptor. Nothing is renamed or removed (tenet 6, extras-first).

| value | meaning |
| --- | --- |
| `created` | no row existed for this seat id; the register call inserted it |
| `rebound` | a row existed and its stored `proc` (`pid`/`proc_start`) DIFFERS from the claim — the id is now bound to a new process |
| `same` | a row existed and its stored `proc` matches the claim — same incarnation, a refresh |

Derivation the extension performs, and the only one:

```
fresh := binding !== 'same'          // binding present
fresh := <today's inference>          // binding absent (old daemon) — unchanged
```

`binding` absent MUST keep today's behaviour
(`liveDescriptor === null || wasDissolved`). That is the old-daemon branch and it
is a required test (risk r2).

## Provenance — these are REAL bodies, not invented ones

Captured 2026-09-05 against the live rs daemon (`127.0.0.1:7461`, build
`pij-rs 0.1.0`) by three `POST /v1/register` calls with the daemon key, using two
real live processes so the liveness guard accepted the claims:

1. `created` — id `pij-fixture-135` did not exist; claim proc `34915/20260905092238`.
2. `rebound` — same id, claim proc `41080/20260905092248` (different process).
3. `same` — same id, same proc `41080/20260905092248` (repeat call).

The `binding` key on each entry is the ONLY field added to the captured body —
every other field is exactly what the daemon returns today.

**The observation that motivates the plan**: responses 2 and 3 came back
**byte-identical apart from nothing at all** — the current wire gives the client
no way to tell a re-bind from a refresh, which is precisely why the extension
cannot know a boot is fresh.

## Shape

Top level has exactly three keys — `created`, `rebound`, `same` — each the
**descriptor object** (the `data` member of the envelope), not the whole
envelope. Consumers that need the envelope wrap it themselves.

## Comparison rule for the Rust test

Compare **parsed** `serde_json::Value`, never raw strings: JSON object key order
is not part of the contract, and a formatting-only diff must not fail the gate.
The TS side likewise parses the file (`JSON.parse`) and feeds entries to its fake
client.
