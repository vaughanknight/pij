# peer — spawn and talk to an rs colleague

> Route module — sibling-blind. Conventions cited as § C*n* live in `00-routing.md` § Shared conventions (pull lazily).

**Job**: converse with existing colleagues or stand up a new harness session. [Unsupported status](../../../../docs/how/pij-rs-api.md#unsupported-status) is the stable shim/native ledger: `pij` serves rs or refuses, even with explicit legacy forcing. Do not replay unsupported legacy grammar against another store.

## Identity and views

Follow § C1 delivery-owner detection first. Native OMP/Pi/Copilot extensions own registration/receiving; never re-adopt them or run a competing inbox consumer. Other tmux seats adopt only their exact nonempty current-process pane:

```bash
pij adopt "$TMUX_PANE" --harness <h> ${PIJ_PARENT_ID:+--parent "$PIJ_PARENT_ID"} [--role <asserted-role>] --json
pij whoami --json
pij phonehome --json
pij list --json
pij sessions --json
pij state <seat> --json
pij node show <seat> --json
```

`--json` forwards the complete original v2 envelope; ids live in its real `data`, not a legacy rewrapped object. Shim list forwards exact `--harness <h>`, `--folder <path>`, `--parent <seat>` and `--scope local`; sessions and native `pij-rs list` have no filters, and sessions never unions TS telemetry. Legacy `--here`, `--role`, `--prime` and `--archived` remain refused. Node show supplies the rs subtree and linked records. RoleService supplies string or null; omitted role preserves existing assertion, explicit unset uses `pij role <seat> --unset`.

Parent is the rs descriptor's recorded `parent`, not a spawnedBy fallback. Supply `--parent` when creating/adopting within its supported admission contract. `pij link`/`tree` refuse: no existing-seat reparent/root-placement port exists, and a role change cannot stand in for a structural link.

Verified external/paneless seats use `pij inbox register --json`, then `pij inbox --wait` from the same native host/session (C1). Native admission derives the matching long-lived host incarnation, never the short-lived CLI's pid; missing/conflicting evidence refuses. Paneless adopt remains unported. Never guess/discover a pane or start a competing extension receiver.

## Spawn and revive: native grammar, not shim fallback

```bash
pij-rs spawn --harness <claude|copilot|codex|pi|omp> --model <exact-model> [--effort <level>] [--cwd <absolute-path>] [--parent <seat>] [--session <tmux-session>] [--name <window-name>] --json
pij attest <new-seat> --plan-id <plan-id> --json
pij dispatch <new-seat> --packet <path> --wait --json
pij-rs revive <seat> [--session <tmux-session>] [--name <window-name>] --json
pij-rs revive <seat> --assume-dead --evidence 'Describe why the recorded process binding is stale' --json
```

The shim's `spawn`/`revive` are named refusals because their grammar differs. Native spawn also supports `--id`, `--bin`, `--no-wait`, `--wait-seconds` and Claude inbound-consent flags; it has no legacy `--layout`, `--task`, `--branch` or `--plan-id`. Use its reported pane/window for explicit, owner-controlled tmux placement (§ C5); do not claim a legacy side-stack default. Send a packet after real binding; attest separately. Native revive requires an explicit id; `--print` and `--attach` remain unsupported.

Revive accepts a tombstone **or** `Dead` process observation with the recorded pane absent, without a preliminary close. It records `revive-observed-dead` retirement before relaunch under one spawn lock and cites the tombstone in `details.seq`. `Recycled`/`Unknown` observations require `--assume-dead` plus nonempty `--evidence`: only the recorded parent may override, or a caller with authoritative role `prime` **when the target is parentless**. An unrelated prime has no override on a parented seat. The `revive.assumed-dead` event retains evidence and observation (`details.assumed_dead_seq`); no replacement pid is signalled. `E-RS-REVIVE-LIVE` names the observation and exact override command. An `Active` process or a present recorded pane still vetoes revival, even with the override.

An in-process host spawn tool is a separate, explicitly available capability; it does not make an unported CLI flag work. Discover model ids from the host's actual catalog; `pij models` is unported. Canary every new/provided/revived peer before trust (§ C2), using runtime footer/round-trip evidence, never a ready-ping alone. Name every owned pane/window, seed § C10 in its packet, and apply § C11 at commit boundaries.

Focus save/list/launch and watch/unwatch are unported; do not silently route them to TS.

## Converse

```bash
pij send <seat> 'literal message text'
pij send <seat> --body-file <path>
pij send <seat> --command compact            # compact | new | reload; no body
pij compact-self                             # daemon-resolved self
pij-rs send --to <seat> --command compact     # same control admission
pij inbox --json                             # manual claims; not a competing extension receiver
```

Double-quoted backticks/`$(...)` execute in the sending shell before pij runs. Use single quotes or a literal body file (`-` = stdin) for code/untrusted text. Pointer delivery: persist large content, then send its path. No attachment or broadcast/fan-out substitute is implied by the shim route; unsupported options refuse. Messages follow § C10; let pushed turns wake you rather than polling state.

**Remote controls on rs** ([full contract](../../../../docs/how/pij.md#remote-session-control)):
commands carry no body; OMP/Pi handles claims in-process and acknowledges `executed` or
`refused` + reason. Acceptance is NOT completion. Native extension delivery bypasses typing
grace; Claude PTY keeps it (human drafts hold commands). Copilot refuses with
`E-RS-CONTROL-UNSUPPORTED: use Copilot's native user controls`; paneless seats also refuse.
Never replace refusal with literal `/compact` or send-keys. Any registered peer may compact,
without arming. Destructive `new`/`reload` require self or target-recorded parent, resolved
from daemon caller evidence — prime flags/roles confer no authority (no rs target-prime relation).
OMP/Pi's human must run `/pij` in the target to arm `new`/`reload`; unarmed requests refuse, never defer: arm and resend. Pi reload needs re-arming; installed OMP reload reopens the native session, NOT extension/skill resources.
Expired claims terminate with unknown-outcome/missing-ack, never replay; refused ids stay refused. Intentional retry after arming requires a new message id.

`compact-self` takes no legacy instruction/pane override; it remains a shipped structured daemon operation. `pij bg create/list/tail/kill` remains shipped unchanged in semantics (§ C7): detached runner, completion injected from `pij-bg`, bounded output and owner/recorded-parent recovery. Neither introduces answer queue withdrawal.

## Transcript versus events

`pij tail <seat>` refuses `E-RS-UNPORTED`: native `pij-rs tail` follows **daemon event frames**, not a peer transcript. Never substitute one for the other. For runtime/footer evidence use the actual host's supported transcript or an owner-scoped tmux capture, not an invented rs transcript API.

```bash
pij-rs tail --since <machine>=<cursor>    # event replay, not a transcript
```

The API is NDJSON: Hello `{build,hello:true,v:1}`, not `type=hello`; Event payload is a JSON **string**. Replay uses per-machine exclusive cursor maps over HTTP; the native CLI uses repeated `--since MACHINE=CURSOR`. See the stable API and canonical event fixture before decoding.

## Retirement and failure boundaries

```bash
pij close <seat> [--reason <text>] --json
pij reap --dry-run --json
```

Close requires self or the current recorded parent. It tombstones the seat and preserves history, **not pane/process teardown**; no `--force`. Healthy peers should be compacted/reused. A separately authorized owner handles terminal teardown after actual liveness evidence; reap is conservative stale-record repair (ops route), not a killer.

The daemon's **death sweep** runs every **5s** by default (`PIJ_RS_DEATH_SWEEP_MS`, milliseconds). It applies the same conservative rule as `pij-rs reap --dry-run`: `Dead`/`Recycled` process plus recorded pane absent; unknown evidence is not death. It writes one `seat.tombstone` with `reason: "observed-dead"` and the process/pane observation, then **pushes an obituary to the recorded parent** through the existing delivery service. The sender is the same daemon-owned `pij-bg` virtual actor used for bg completion (`pij_core::BG_ACTOR`), not a second identity. Do not poll for child death.

A tombstoned parent or one observed-dead in the same sweep receives no notice; the daemon logs the withheld count instead, avoiding reboot floods. Queued delivery does not prove parent observation. The pinned obituary says `pij revive <id>`; use the supported native `pij-rs revive <id>` spelling above until the shim is ported. See [Death sweep](../../../../docs/how/pij-rs-api.md#death-sweep) for the exact template and [Revive](../../../../docs/how/pij-rs-api.md#revive) for the override boundary.

| Observation | Move |
|---|---|
| Self cannot resolve | Respect extension ownership; non-extension tmux seats may adopt only their exact current pane |
| Tombstoned self still has a live pid | Identity must refuse; inspect tombstone evidence, not a legacy descriptor |
| Unsupported flag/leaf or legacy force | Read the stable refusal ledger; no hidden fallback |
| Reboot / stale pane or pid | Re-observe; native revive accepts a tombstone or `Dead` + pane absent; `Recycled`/`Unknown` needs the authorized evidence-bearing override |
| A new peer is ready but its first inference fails | Inspect actual model/footer/runtime; canary before dispatch |
| Send acceptance without execution | Inspect the actual receipt/control outcome; acceptance is not completion |

Examples here are operating grammar, not executed smoke receipts. Canonical API/event examples are in `crates/testkit/fixtures/golden/api/`; PM/prime own runtime and production/chainglass proof.
