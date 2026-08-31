# Cutover sequencing — pi/OMP phase (Jordan ruled)

**No automated seat migration.** When the rs-default extension deploys, Jordan
restarts the omp and pi seats himself. That removes the entire class of work that
would otherwise have been the riskiest part of cutover — migrating live seats
underneath their humans — and replaces it with a signal.

So the phase is three things:

1. **The extension lands in the live `.pi/extensions` path.** Landing is not
   deploying: verify by content at the destination, not by the copy having run.
2. **A clear GO signal to Jordan, NAMING WHICH SEATS need the restart.** Not "restart
   your seats" — the list. A signal that makes the human enumerate the work is a
   signal that will be done partially.
3. **The forceback env documented IN THAT SIGNAL**, not linked from it:
   `PIJ_DAEMON_GENERATION=legacy` returns a single seat to the TypeScript daemon
   without a rebuild, and it is only useful to someone who has it in front of them at
   the moment a seat misbehaves.

## Why the signal carries the escape hatch

The cutover controls already refuse loudly when the Rust daemon is unreachable, and
the refusal names the addr, the state dir, and the control that unsticks the seat —
because on the runtime where that branch was unreachable, a stranded operator got a
generic connection error naming nothing.

The same reasoning applies one level up: **the GO signal is the place where a human
decides to proceed, so it is the place the undo has to be.** A forceback documented
elsewhere is a forceback the person does not have when they need it.

## What it does not change

The three controls, the no-silent-fallback rule, and the cross-generation lock
contract all stand as ratified. Manual restart removes the migration mechanism, not
the requirement that both generations coexist safely while the fleet is mixed — which
is exactly the window in which one implementation can steal a single-consumer resource
from the other if they cannot read each other's locks.
