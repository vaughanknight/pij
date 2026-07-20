# Twin-descriptor false stall — 2026-07-20

**Observed during closeout**: watchdog/stall notice was attributed to the `pij-prepared-firefly` twin while the actual active seat was responsive as `pij-professional-capybara`.

Mechanical read at capture:

- `pij-professional-capybara`: pid `49627`, `working/active`, `lastEventAt=2026-07-20T00:43:45.301Z` (age ~0.6s).
- `pij-prepared-firefly`: same pid `49627`, `idle/active`, `lastEventAt=2026-07-20T00:42:11.542Z` (age ~95s).

**Conclusion**: one live process is projected through two descriptors; activity advances on one identity while the other appears quiet. A detector operating per descriptor can therefore emit a false stall for a responsive process. This composes the re-key/twin defect with the false-stall class; it is state evidence, not a cause claim.

**Safety**: no close/adopt/register and no watchdog pause/reset was run against either twin; both share a PID and teardown/control mutation is unsafe until identity reconciliation owns it.
