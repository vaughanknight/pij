# pij#19 trigger falsifier — protocol (ermine, 2026-08-28), banked for execution
1. Spawn a disposable OMP seat; snapshot its registry attachment group.
2. Trigger an action known to start __omp_worker_daemon_broker / __omp_worker_lsp_mux
   (likely first LSP diagnostics).
3. Record process starts and registry events concurrently.
4. PASS the trigger hypothesis only if a new pij identity appears AFTER worker creation
   on the same parent PID/pane/spawnId.
5. Negative control: identical seat, no worker feature.
Constraints: never on a live coder; close no alias. Evidence base: yielding-sparrow/
coloured-xoxarle (aliased, workers present) vs shallow-boa (clean, no workers), n=2.
