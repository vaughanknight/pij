# Consolidated re-review — 047ea0ed

| ID | Severity | Status | Reason | Evidence |
| --- | --- | --- | --- | --- |
| F001 | HIGH | CLOSED | Socketless terminal-control bodies now take the named lossless pull exception; they are not pasted. | VERIFIED |
| F002 | HIGH | CLOSED | Single-adapter acquire→capture→stage→commit excludes tested human input during chunks and before Enter. | VERIFIED |
| F003 | MEDIUM | CLOSED | Acceptance IDs now use registered `ac-<four lowercase hex>` form; E403 is gone. | VERIFIED |
| R001 | HIGH | OPEN | Watchdog can clear its marker before a SIGSTOP-resumed daemon disables input, leaving no recovery owner. | SOURCE ONLY |
| R002 | HIGH | OPEN | Marker cleanup may fail after Enter submits, but delivery reports failure and retries the already-submitted body. | SOURCE ONLY |
| R003a | HIGH | OPEN | Marker read and write are not an atomic pane reservation; concurrent adapters can overwrite ownership. | SOURCE ONLY |
| R003b | HIGH | OPEN | Fresh adapter instances can reuse a PID/counter token, allowing a stale watchdog to match a later transaction. | SOURCE ONLY |
| R004 | HIGH | OPEN | A decorative rounded border can fall through to generic blank-rule recognition and authorize staging into non-composer output. | SOURCE ONLY |
| R005 | MEDIUM | OPEN | A failed control-pointer lookup leaves the original body claimed rather than immediately inbox-readable. | SOURCE ONLY |
| R006 | MEDIUM | OPEN | A timestamp failure after the pull notice submits leaves the original body claimed rather than immediately inbox-readable. | SOURCE ONLY |
| R007 | MEDIUM | OPEN | Complete plan validation is degraded by seven orphan-claim warnings; the zero-warning gate is not green. | VERIFIED |
