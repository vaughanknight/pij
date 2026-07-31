# ops — daemon health, registry & tmux hygiene

> Route module — sibling-blind. Knows only this job; composition is the dispatch's job.
> Conventions cited as § C*n* live in `00-routing.md` § Shared conventions (pull lazily).

**Job**: keep the control plane healthy — the daemon, the session registry (`~/.pij/`), the tmux panes it manages, and the bridges around them.

## Daemon

```bash
pij daemon status   # is it up, pid, tick health
pij daemon start    # idempotent; `pij spawn` also auto-starts it
pij daemon stop     # graceful
pij daemon kill     # last resort
```

**Restart rule (§ C6)**: after ANY edit to daemon/core extension code, `pij daemon stop && pij daemon start` — tsx loads source at start, no hot-reload; a stale daemon silently ignores your fix. Bound peers survive a restart (descriptors are on disk); in-flight sends may need re-sending.

## Registry hygiene

The registry has **THREE tiers**, and only the first is visible to `pij list`, `pij state`
and `pij revive`:

| Tier | Where | Visible to |
|---|---|---|
| hot | `~/.pij/<id>.json` + `~/.pij/<id>/` data dir | `pij list`, `pij state`, `pij revive` |
| archived | `~/.pij/archive/<id>.json` + `~/.pij/archive/<id>/` | **the FILE is the authority**; `pij list --archived` is a FILTERED BROWSE AID, not an existence check |
| — | *(the platform moves a seat here once terminal >48h)* | |

> **A descriptor missing from `~/.pij/` is NOT evidence the seat never existed, and NOT
> data loss — CHECK `~/.pij/archive` FIRST.** This cost a real round-trip on 2026-08-01: a
> repo's o-prime was reported UNREVIVABLE with "neither descriptor nor data dir exists",
> and both were sitting in the archive tier with full terminal evidence. **2,423 archived
> seats** on this box at time of writing.
>
> **AND `pij list --archived` IS NOT THE EXISTENCE CHECK** — it is a filtered view and it
> hides most of the tier. Measured 2026-08-01: **437 rows listed out of 2,423 descriptors
> on disk (18%)**, and for one folder, **2 shown out of 33** — the hidden 31 included that
> repo's own PREDECESSOR PRIME, dissolved and present on disk. `dissolved` is necessary
> but not sufficient to appear; the additional filter is uncharacterised. So an agent that
> runs `--archived`, does not find its id, and concludes "genuinely gone" reaches the same
> wrong answer one tier deeper, now with an authoritative-feeling command behind it.
>
> **Use the filesystem as the authority:**
> ```bash
> ls ~/.pij/archive/<id>.json                                   # existence check
> grep -l '"folder": *"<repo-path>"' ~/.pij/archive/*.json      # every archived seat for a repo
> pij list --archived                                            # browse aid only — incomplete
> ```

Sessions that died without `pij close` leave **corpses** (descriptor present, process gone).

```bash
pij list                      # every known session
pij state <id>                # dead|alive + working/idle for one id
pij path <id> [--events|--state|--dir]   # resolve a session's on-disk paths
```

**The platform archives terminal seats for you** (terminal >48h → the archive tier), so
routine corpse-clearing is NOT your job and NOT a manual delete. Inspect with
`pij list --archived`; archived seats stay reachable by id.

> **Do not hand-delete descriptors as housekeeping.** Hand-editing `~/.pij/**` is
> store-internals surgery and **operator-authorised only** — never routine. A bulk sweep
> on 2026-07-31 found three descriptors whose recorded panes were LIVE, one of them the
> operator's own `%0`; a naive delete would have killed it. If a genuine sweep is ever
> authorised, re-verify liveness against the live system at execution time (never from the
> descriptor), never bulk-mutate, and pipe ids through `while read -r id` (zsh
> `for id in $VAR` does NOT word-split).

## Tmux hygiene

Orphan panes/windows (peer closed but pane lingered, or vice versa): match `pij list` pane ids against `tmux list-panes -a -F '#{pane_id} #{pane_current_command}'`; kill panes that no live descriptor owns (`tmux kill-pane -t %N`). Ownership rule applies — don't kill panes belonging to sessions you didn't spawn without the owner's ask.

## Binding repair

```bash
pij phonehome [--json]   # run INSIDE a peer's pane: confirms a pending binding
```

Use when a spawned peer booted but never bound (daemon log shows pending): the peer confirms its own identity deterministically instead of waiting on transcript discovery.

## Recover a prime after a reboot

The human asks "revive our prime". A reboot kills the tmux server, so every seat
is dead and every recorded pane id belongs to a dead epoch.

```bash
cd /path/to/the/repo && pij daemon status   # daemon dies with its tmux server
pij revive --print                          # NO id — resolves the prime FOR THIS FOLDER
```

`--print` mutates nothing (read-only tmux/ps probes) and prints a paste-able
launch line. **Hand that line to the human — do not run it yourself.** The prime
must come back in the pane the human will drive, and `--print` records the
printer as `PIJ_PARENT_ID` when run from inside a pij seat, so a helper that
prints and is then closed leaves the prime parented to a corpse.

| Result | Meaning / move |
|---|---|
| Prints a line naming a seat | Human pastes it into the target pane. claude/copilot/codex lines carry a `pij revive <id> --attach "$TMUX_PANE" &&` prefix — those harnesses do not self-adopt, and without it the seat returns unaddressable |
| `E-AMBIG: … has 2 prime seats` | Two current primes for one folder. Pass the explicit id; then have the human retire the wrong one (`pij orchestration prime retire <id>`) — never guess which is real |
| `E-AMBIG: … N seats and none is prime` | **The OPPOSITE condition sharing one error code** — ZERO primes, not two. The remedy above is unactionable: there is no id to pass. It usually means the recorded prime is **dissolved and archived**, and the error names the candidate set rather than that fact. **Check `~/.pij/archive/<id>.json` and `pij list --archived` before concluding anything**, then read § Registry hygiene. Verified case, 2026-08-01 |
| `E-NOID`, naming the folder | No seat recorded there. Not a bootstrapper signal on its own — see prime route § Role triage |
| Refuses: native transcript missing | **Not revivable.** `pij revive` requires it and correctly refuses rather than starting a fresh session wearing a dead seat's name. The data dir is inheritance material; the human seats a successor |
| **The two checks fail INDEPENDENTLY** | A present descriptor does not imply a present transcript, and vice versa. A reader who learns about the archive tier will reasonably try to restore a descriptor — **and still be refused at the transcript check.** Confirm BOTH before attempting anything: `~/.pij/archive/<id>.json` for the record, and the `harnessSessionId` it names under `~/.claude/projects/<slug>/`. Both were absent in the 2026-08-01 case, which closed it twice over |

The revived seat is **PENDING CANARY**: ask it a golden-recall question before
assigning work. A session that lost its context looks identical to one that kept
it. A live-but-orphaned session re-bound with `--attach` in the pane it is
already running in is satisfied by continuity instead — the printed "now launch
the harness in it" does not apply there.

## Telegram bridge

```bash
pij telegram init    # one-time bot token setup
pij telegram start   # bridge pij sessions ↔ the bot
pij telegram stop
```

## Diagnosing a sick control plane

| Symptom | Probe | Move |
|---|---|---|
| Spawns hang at "booting" | `pij daemon status`; daemon log | restart daemon (§ C6); re-spawn |
| Peer never binds | daemon log shows discovery pending | `pij phonehome` inside the pane |
| Sends land nowhere | `pij state <id>` dead? | corpse — sweep it; re-spawn |
| Registry bloated with dead ids | `pij list` count vs live panes | **Nothing to do** — the platform archives terminal seats (>48h) itself; inspect with `pij list --archived`. Never hand-delete (see § Registry hygiene) |
