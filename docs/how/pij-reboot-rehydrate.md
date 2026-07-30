# Coming back after a reboot

The machine restarted. You open a fresh tmux, `cd` into the repo — and you know
the **path**, not the pij id. `pij revive` now starts from the path.

```bash
cd /path/to/the/repo
pij revive --print
```

That prints one line. Paste it into the pane you already opened. The seat comes
back with its prior conversation, under its original pij id, addressable again.

## What `--print` does

| | |
|---|---|
| Resolves the seat | from the **current folder** when you give no id |
| Prints | the launch command, env prefix included, ready to paste |
| Mutates | **nothing** — no tmux pane, no daemon, no unarchive, no descriptor change |
| Reads | one **read-only** tmux query (`display-message -p`) to report whether the old attachment is still alive, plus one `ps -o lstart=` when that pane's pid matches |

`--print` is a safety contract about *writes*, not about silence: it asks tmux
one read-only question so the printout can tell you whether the seat you are
about to resurrect might still be running. It also works when there is **no tmux
at all** — no binary, no server, which is the real state of a just-rebooted box.
A probe that cannot run degrades to `unprobed` and is reported as such; it is
never an error.

`--json` gives the machine form: `{ id, harness, model, effort, cmd, args, env,
shellLine, launchLine, attachLine, selfAdopts, tier, folder, artifactPath,
priorAttachment, priorPane }`. `shellLine` is exactly what a human would paste.

## Resolving the seat from the folder

`pij revive` with no id compares **realpath'd** folders (a worktree, a symlinked
home, or `/tmp` vs `/private/tmp` on darwin never match as raw strings), then:

1. the seat designated **prime** for that folder wins;
2. exactly one non-prime seat is used, and the output says it was not prime;
3. no seat → `E-NOID`, naming the folder it searched;
4. two or more with no prime → `E-AMBIG`, listing each candidate's id, harness,
   model and last activity. It never guesses — pass the id you want.

The **hot tier** is searched first, then `~/.pij/archive/` (a reboot can outlast
the 48h archive window). The output says which tier the answer came from, and
`--print` leaves an archived record archived.

## Self-adopt: who re-registers, and who doesn't

**pi and omp self-adopt.** A resumed pi re-derives its own pij identity from the
native session artifact it was resumed from, finds the dissolved descriptor
already on disk, and calls `registry.revive()` itself (`core/session.ts` →
`boot()`, the `wasDissolved` branch). So the printed line is just the launch
command. (`PIJ_SESSION_ID` is *produced* at boot; it is not what does the
re-registration.)

**claude, copilot and codex do not.** Nothing inside them writes the pij
registry, so a bare resume brings the harness back while pij still points at the
pane that died — a live session nobody can message. For those three the printed
line is prefixed with the re-bind:

```bash
pij revive <id> --attach "$TMUX_PANE" && PIJ_SESSION_ID=<id> … claude --dangerously-skip-permissions --resume <native-id> …
```

`--attach [%pane]` binds an **existing** pane (default `$TMUX_PANE`) to the seat
instead of spawning one. You can run it on its own if you have already launched
the harness by hand.

The human-readable `--print` output always states which of the two applies.

## "Is that old attachment dead?"

After a reboot the descriptor still claims `bound`, with a pane id from a tmux
server that no longer exists and a pid the OS has long since handed to somebody
else. `pij revive` classifies it:

**Every identifier in this problem is recycled.** The OS re-issues pids from the
bottom after a restart (pid 101 is a system daemon on any darwin box), and tmux
re-issues pane ids from `%0` in *every new server* — kill a tmux server, start
another, and the first pane is `%0` again. So neither a live pid nor a live pane
id proves anything on its own.

**And a recycled identifier can never be corroborated by another recycled
identifier.** Checking `#{pane_pid}` against the recorded pid draws both halves
of the "proof" from the same well: after a reboot both allocators have reset, so
the two agree precisely in the case this feature exists to survive. Only evidence
that is *monotonic or absolute in time* breaks the tie, and there are two kinds:

- **host boot time** — if the machine booted *after* the seat's last recorded
  activity, nothing of that seat survived, whatever any identifier says;
- **process start time** — `ps -o lstart=` for the process now sitting in the
  pane. A process that started *after* our seat's last recorded event cannot be
  the process that produced that event, so a matching pid is a recycled one.
  (tmux has no equivalent format: `#{pane_start_time}` was probed on tmux 3.6a
  and returns empty.)

Both are evaluated **before** anything is allowed to read as `live`.

**And a tolerance may only ever widen the *uncertain* band, never the confident
one.** `ps -o lstart=` resolves whole seconds, so a process that started in the
same second as our last recorded activity is indistinguishable from one that
started just after it. That imprecision makes us *less* sure, so it is spent on
`uncertain`: the pane process must have started **at least one full second
before** our last recorded activity to read as `live`. Same second, or later, is
`uncertain` — an `--assume-dead` away, never a corpse.

| pane | time evidence | verdict |
|---|---|---|
| any | host booted **after** the seat's last activity | **stale** — nothing of it survived |
| `#{pane_pid}` is this seat's | pane process started **≥ 1s before** our last event, or the seat was active in this boot epoch | **live** — refused; close it first |
| `#{pane_pid}` is this seat's | pane process started in the **same second as, or after,** our last event | **uncertain** — the pid may be recycled |
| `#{pane_pid}` is this seat's | none available at all | **uncertain** — nothing non-recycled to lean on |
| exists but is running **something else** (reused `%N`) | any | **uncertain** — never `live` |
| tmux **unreachable**, so the pane was never checked | pid dead | **uncertain** |
| gone | pid dead | **stale** — proceed |
| gone or unprobed | pid alive, but pij already **observed** this seat end | **stale** — the pid belongs to a stranger |
| gone | pid alive, no corroboration | **uncertain** |

One direction is deliberately forbidden: nothing here may call a genuinely live
pane dead. That is why a reused pane id stops at `uncertain` instead of falling
through to the pid axis, and why a missing signal is `uncertain` rather than
`stale`. The cost of over-caution is one `--assume-dead`; the cost of
under-caution is stomping a live seat.

A terminal observation of `unavailable` means pij could not look. It proves
nothing and does not count.

`uncertain` blocks anything that writes. Two ways forward, both explicit:

- `pij revive --print` — allowed, because it mutates nothing; the output says
  plainly that the attachment could not be proven dead;
- `pij revive <id> --assume-dead` — the operator override.

There is no silent guess. This matters most on exactly the path this feature is
for: `live` is refused *before* `--assume-dead` is considered, so if a recycled
identifier could read as `live` the override would not rescue you. It cannot —
`uncertain` is the worst any recycled identifier can produce.

(Background: `pij-revive-pid-liveness-gap`, open since s066; the pane half was
found in cross-model review of s072, and the pane-pid half — corroborating one
recycled identifier with another — in the round-2 re-review.)

## Caveats

- The printed line names bare `pij`, which resolves to whatever `pij` is on your
  `PATH`.
- `--print` records the *printer* as the parent (`PIJ_PARENT_ID`) when it is run
  from inside a pij seat. From a plain operator shell there is no parent, which
  is what you want after a reboot.
- The seat comes back **pending canary**: ask it a golden-recall question before
  you assign work. A resumed session that lost its context looks identical to one
  that kept it until you check.
