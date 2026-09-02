# False terminal-absence finding

The false terminal-absence notice is outside the Rust spawn wait path.

- `.pi/extensions/pij/core/daemon/death-reconciler.ts:280-281` classifies a missing expectation pane as `terminal` evidence `pane-missing` and emits the notice rendered at `:67`.
- Plan 132 changes `crates/daemon/src/http/mod.rs::launch_seat`; it does not call this reconciler.
- Per G4, no out-of-scope change was made. The spawned-identity fix reduces one cause of unbound OMP seats, but the notice policy remains independently owned by the TypeScript death reconciler.
