//! `pij-testkit` — test substrate shipped as a crate, not copied per unit.
//!
//! Fakes for every port, the addressable fixture corpus, the `FreshStore`
//! primitive, and the gate binaries (`pij-arch-check`, `pij-gate`) live here so
//! no unit re-invents them. Never a dependency of production code: every crate
//! that uses it declares it `@dev`, and the arch check enforces that.

pub mod arch;
