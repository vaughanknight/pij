# The bare `cargo` on this machine is not the rustup shim

`rust-toolchain.toml` pins **1.98.0**. A `cargo` that is not a rustup shim ignores that
pin **silently**, so the gate can run a **1.95.0 compiler with 1.98.0 clippy** and still
look green. Homebrew's rust is first on `PATH` here, which is exactly that case.

Run the gate as:

```sh
~/.cargo/bin/cargo run -p pij-testkit --bin pij-gate
```

or put `~/.cargo/bin` ahead of any other rust on `PATH`.

`pij-gate`'s own `toolchain` stage catches this and says so — it is the one stage that
fails while every other stage passes, which is easy to read as noise and is not:

```
toolchain FAIL  toolchain mismatch: rust-toolchain.toml pins 1.98.0,
                but this gate is running rustc 1.95.0.
```

Observed 2026-08-31 (plan 110). Recorded here rather than only in a dispatch packet
because it will be re-hit by anyone who runs the gate on this machine, and a green
produced by an unpinned compiler is a green that lies.
