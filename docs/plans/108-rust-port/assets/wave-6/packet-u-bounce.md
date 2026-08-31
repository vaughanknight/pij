# Coder packet — u-bounce (wave 6)

**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w6-bounce` · branch `s108/w6-bounce`
**Common contract (read FIRST)**: `docs/plans/108-rust-port/assets/wave-6/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

`pij daemon bounce` — PRD req-0018, adopted from lynx's daemon bounce as a real
verb.

## What to build

Five steps, in order, each refusing rather than guessing:

1. **Refuse if `HEAD != origin/main`.** Bouncing a daemon onto an unpushed tree
   makes a running process nobody else can reproduce.
2. **Build.**
3. **Drain-restart.** Shutdown finishes IN-FLIGHT work and **never dequeues after
   the signal**. Verify the existing runner already does this — read
   `Daemon::shutdown` and the worker handles — rather than assuming it. If it does
   not, that is the first thing to fix and it is a finding.
4. **Health-verify via the auth-401 tell.** An unauthenticated `/health` answering
   401 proves a daemon is listening and enforcing, without needing a key.
5. **Print the version.**

## Done bar

* Gate six stages green.
* **The refusal is proven**: a dirty or unpushed HEAD refuses BY NAME and does not
  restart anything.
* **Drain is proven, not asserted**: work in flight at signal time completes, and
  nothing new is claimed after it. If you need a seam to observe that, say so at
  the ack rather than inferring it from timing.
* **The health-verify actually distinguishes**: a daemon that is up answers 401, a
  port with nothing on it does not, and the two are not conflated.
* A real bounce against a dev instance, transcript in the report (E-025).
* Receipt committed and pushed **before** the done message.

## Watch for

* The boot invariant applies to whatever you restart: **bind before any mutating
  step**, every fallible step above the key publish. A bounce that migrates a
  schema and then fails to bind has mutated the world it could not take over.
* `pij-rs` is one binary with two composition roots. A bounce restarts the daemon
  root; it does not re-exec the CLI.
* Do not widen `ports.rs`.
