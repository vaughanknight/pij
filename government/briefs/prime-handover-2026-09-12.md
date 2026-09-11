# pij prime handover — pij-relative-panther

Written 2026-09-12 while still live, for a successor seat spawned after the reboot.
Authoritative copy also on origin/main at `government/briefs/prime-handover-2026-09-12.md`.

## Who you are

You are the **pij o-prime**. Scope is **pij only**. Seating brief:
`government/briefs/pij-prime-seating-2026-08-27.md` — read it first, it is the
constitution for this seat.

Standing rules that are not negotiable:

- The daemon serves **every fleet on this machine**. Before restarting or changing
  the live daemon or the live checkout `~/GitHub/pij`, send `pij-vocal-kingfisher`
  a one-line notice and **wait for its ack**. Its old standing docs-only ack has
  LAPSED; restarts are on the baton.
- **Never** touch the perimenocause repo, its worktrees, or its seats.
- **Never write** `.the-flow-state.json`, `the-flow.json`, `the-flow.md`.
- Government is single-writer (you). Publishes go to origin/main **via a scratch
  worktree**; the live checkout moves only on an ack — never
  `git reset --hard origin/main` on it.
- Report cards at both edges of work (`pij report now`), at your own altitude. A
  prime's card is non-optional (Jordan, 2026-07-31).
- Vaughan is reachable by `pij send pij-telegram` (keep it short — he is on a
  phone) and in-pane.

## The fleet

| seat | role | harness/model | pane | notes |
|---|---|---|---|---|
| `pij-relative-panther` | prime | Claude Code, Opus 5 1M | `%45` | this seat |
| `pij-ready-perosteck` | PA | copilot, **gemini-3.6-flash** | `%48` | 20-min sweeps; my watchdog tick IS its wake |
| `pij-compact-heron` | failover standby | copilot, **gpt-6-astra** | `%539` | idle; answers only "standby, idle" |

Model state is post-ruling (2026-09-11, Vaughan via kingfisher, confirmed to me
directly). **`boundModel` in the registry is a spawn-time snapshot and cannot be
re-stamped (E53)** — `pij list` still shows the OLD models. The pane footer is the
only honest verification. Do not "fix" the registry.

**Never widen the PA's watchdog interval past 20m (E51).** The PA has no clock;
your tick is its wake. It went silent for 38 minutes when this was set to 45m.

## The three watch helpers — the part most likely to be lost

They live in `~/.claude/projects/-Users-vaughanknight-GitHub-pij/helpers/`,
**not** the session scratchpad. On 2026-09-05 all three were found running from
files that had been unlinked out of the scratchpad — the processes held the
inodes, two had no disk copy left, and the next restart would have lost them
silently (E57). Cause never established.

| script | tmux session | cadence |
|---|---|---|
| `card-refresh.sh` | `pij-card-refresh` | 480s; also carries the upstream check |
| `pa-chaser.sh` | `pij-pa-chaser` | phases off `pij watchdog status` next-due + 150s |
| `prime-failover.sh` | `pij-prime-failover` | 60s |

Restart all three after a reboot:

```zsh
H=~/.claude/projects/-Users-vaughanknight-GitHub-pij/helpers
tmux new-session -d -s pij-card-refresh   "zsh $H/card-refresh.sh"
tmux new-session -d -s pij-pa-chaser      "zsh $H/pa-chaser.sh"
tmux new-session -d -s pij-prime-failover "zsh $H/prime-failover.sh"
```

Verify each with a single pass before trusting it:
`CARD_ONCE=1 zsh $H/card-refresh.sh` · `CHASE_ONCE=1 zsh $H/pa-chaser.sh` ·
`WATCH_ONCE=1 FAILOVER_DRY=1 zsh $H/prime-failover.sh`, then read the log.

**The card refresh interval (480s) MUST stay below the 600s staleness threshold.**
It was 1200s once and only read "fresh" because the PA sampled mid-cycle.

**The failover promotes only on positive evidence** — a usage-limit string in the
prime's *visible pane frame* (never scrollback) AND quiet ≥600s AND two
consecutive checks. Silence alone never promotes. Do not loosen this.

## Live incident at handover time: gh is broken, and it is not gh

`gh` fails TLS verification to api.github.com machine-wide
(`x509: OSStatus -26276`), REST and GraphQL alike.

**Root cause, established 2026-09-12: the macOS keychain and directory services
are DOWN.**

```
security dump-trust-settings   -> "No keychain is available. You may need to restart your computer."
dscl . -read /Users/... NFSHomeDirectory -> "Operation failed with error: eServerError"
security list-keychains        -> invalid parameters
```

Every Go binary asks macOS to verify certificates and is refused; `curl` uses a
different path and still works. This also explains brew's
"Could not determine home directory for $USER" on every run.

Things that were tried and **do not** fix it, so you need not repeat them: brew
upgrade (crashes with a malloc error after "Verifying checksum", bottle already
downloaded), build-from-source, `brew update-reset`, `go install` (fails the same
way on proxy.golang.org), `SSL_CERT_FILE`, `GODEBUG=x509usefallbackroots=1`,
disabling parallel downloads, and **gh 2.100.0 itself — the version we were
upgrading to fails identically**. The fix is the reboot.

Workaround in place: the upstream watch uses authenticated curl with the gh
token, in both `seat:upstream-head` and `card-refresh.sh`. `repo:pr-board` stays
honestly NOT-PROBEABLE — the PA has been told **not** to substitute another probe,
because a named outage beats an invented reading.

**After the reboot, verify `gh` actually works before reverting anything**, and
only then consider putting the chores back on `gh`.

## Chores

`pij chore list` — `seat:upstream-head` (curl-based, watches AI-Substrate/pij),
`repo:main-head` (the FORK, vaughanknight/pij), `repo:pr-board` (the fork's PRs).

Two traps, both learned the hard way:

1. `repo:main-head` reads `origin`, which is the **fork**. Nothing in the repo
   roster has ever watched upstream (E56). That is what `seat:upstream-head` is for.
2. `ack` only advances to what `run` last computed. Acking without a fresh `run`
   is a no-op that reads like confirmation.

## Open with Vaughan — do not close these yourself

1. **The reboot.** He has the root cause and the recommendation. It kills the
   daemon and every seat across four fleets, so it is his call alone.
2. **pij-rs migration.** Brief: `government/briefs/pij-rs-migration-2026-09-06.md`
   (+3 amendments). Gate has narrowed to one fleet-specific issue: control
   commands are refused for **Copilot** seats, and both the PA and the standby are
   Copilot, so E52's parent-side-compact recovery would not run. Blocker 3 closed
   with production proof; blocker 1 is a rename with stale docs, not a lost
   capability. **Amendment 3 is the one that matters for you**: every helper parses
   legacy *text* shapes, and on rs those `sed`/`grep` expressions match nothing,
   exit zero, and leave the whole standing watch silently blind. Audit and
   re-point every parser with a positive control BEFORE any cutover.
3. **This prime's model move** — folded into post-reboot recovery.
4. **Standby effort** — came back Medium after the astra switch, was spawned high.
   It is the seat that would inherit the government; it should not run degraded.

## Encode candidates

`government/briefs/encode-candidates-2026-08-27.md`, E1–E60. The ones this seat
added, and the reason they exist:

- **E56** — a monitor's NAME is a claim about its scope; verify it against the
  thing named. A sensor NOT-PROBEABLE for more than one cycle is an outage, not
  routine.
- **E57** — "the process is running" is not evidence "the program still exists".
- **E58** — retracts E55. Before filing a missing guard as a defect, name what the
  guard protects and show the path can reach it.
- **E59** — upstream independently re-deriving E22/E23 and the card-refresher
  lesson. Their words: "exit-code laundering, again".
- **E60** — filed against myself: a security sweep that reported CLEAN on a zero
  denominator. **A negative result is worth nothing without its denominator and a
  positive control.**

If you read only one thing from that file, read E60, and then apply it to
everything in this handover.

## Close-out, when this seat ends

```zsh
tmux kill-session -t pij-card-refresh
tmux kill-session -t pij-pa-chaser
tmux kill-session -t pij-prime-failover
pij close pij-compact-heron     # only if the standby is being retired
```

The PA stays. It is a bootstrap deliverable, not optional context.
