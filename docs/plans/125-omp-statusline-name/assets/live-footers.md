# Live OMP footer evidence

**Build under test**: branch `125-omp-statusline-name`, project-local `.pi/extensions/pij/index.ts`
**Client**: `omp v18.0.3`
**Launch shape**: from the worktree root, hand-started tmux windows using `omp --no-extensions -e .pi/extensions/pij/index.ts --auto-approve`.

`--no-extensions` excludes the globally linked main-checkout copy; each witness therefore loads only this worktree's extension. Every window was closed after capture.

## AC1 — 10/10 back-to-back hand-started OMP sessions

### 1 — `p125l-01`

```text
pij: detected Rust daemon v1 at 127.0.0.1:7461; registered pij-parental-spoonbill
◫ 4.6%/1M ⟲ · pij-parental-spoonbill · ⬢ Opus 5 (1M) · ◒ high · ⑂ 125-omp-statusline-name *1 · S0.26 ★ 1
pij-parental-spoonbill
```

### 2 — `p125l-02`

```text
pij: detected Rust daemon v1 at 127.0.0.1:7461; registered pij-weird-duck
◫ 4.6%/1M ⟲ · pij-weird-duck · ⬢ Opus 5 (1M) · ◒ high · ⑂ 125-omp-statusline-name *1 · S0.26 ★ 1
pij-weird-duck
```

### 3 — `p125l-03`

```text
pij: detected Rust daemon v1 at 127.0.0.1:7461; registered pij-uncertain-pike
◫ 4.6%/1M ⟲ · pij-uncertain-pike · ⬢ Opus 5 (1M) · ◒ high · ⑂ 125-omp-statusline-name *1 · S0.27 ★ 1
pij-uncertain-pike
```

### 4 — `p125l-04`

```text
pij: detected Rust daemon v1 at 127.0.0.1:7461; registered pij-parental-nightingale
◫ 4.6%/1M ⟲ · pij-parental-nightingale · ⬢ Opus 5 (1M) · ◒ high · ⑂ 125-omp-statusline-name *1 · S0.26 ★ 1
pij-parental-nightingale
```

### 5 — `p125l-05`

```text
pij: detected Rust daemon v1 at 127.0.0.1:7461; registered pij-distinct-tapir
◫ 4.6%/1M ⟲ · pij-distinct-tapir · ⬢ Opus 5 (1M) · ◒ high · ⑂ 125-omp-statusline-name *1 · S0.26 ★ 1
pij-distinct-tapir
```

### 6 — `p125l-06`

```text
pij: detected Rust daemon v1 at 127.0.0.1:7461; registered pij-integral-flute
◫ 4.6%/1M ⟲ · pij-integral-flute · ⬢ Opus 5 (1M) · ◒ high · ⑂ 125-omp-statusline-name *1 · S0.26 ★ 1
pij-integral-flute
```

### 7 — `p125l-07`

```text
pij: detected Rust daemon v1 at 127.0.0.1:7461; registered pij-eldest-oscar
◫ 4.6%/1M ⟲ · pij-eldest-oscar · ⬢ Opus 5 (1M) · ◒ high · ⑂ 125-omp-statusline-name *1 · S0.26 ★ 1
pij-eldest-oscar
```

### 8 — `p125l-08`

```text
pij: detected Rust daemon v1 at 127.0.0.1:7461; registered pij-grubby-tiglon
◫ 4.8%/1M ⟲ · pij-grubby-tiglon · ⬢ Opus 5 (1M) · ◒ high · ⑂ 125-omp-statusline-name *1 · S0.27 ★ 1
pij-grubby-tiglon
```

### 9 — `p125l-09`

```text
pij: detected Rust daemon v1 at 127.0.0.1:7461; registered pij-huge-kiwi
◫ 4.6%/1M ⟲ · pij-huge-kiwi · ⬢ Opus 5 (1M) · ◒ high · ⑂ 125-omp-statusline-name *1 · S0.26 ★ 1
pij-huge-kiwi
```

### 10 — `p125l-10`

```text
pij: detected Rust daemon v1 at 127.0.0.1:7461; registered pij-constant-cat
◫ 4.6%/1M ⟲ · pij-constant-cat · ⬢ Opus 5 (1M) · ◒ high · ⑂ 125-omp-statusline-name *1 · S0.26 ★ 1
pij-constant-cat
```

**Verdict**: 10/10 native OMP `session_name` segments show the registered pij id; the extension-status row independently shows the same id.

## AC2 — forced native-name miss

For this one witness only, the worktree seam passed a no-op `setSessionName` and an always-empty readback into the real helper. The client again loaded only the explicit worktree extension. After the bounded 10-second retry window, the capture showed both required fallback signals:

```text
pij: detected Rust daemon v1 at 127.0.0.1:7461; registered pij-liquid-walrus
Warning: pij: could not set omp session name — id is pij-liquid-walrus
◫ 4.7%/1M ⟲ · ⬢ Opus 5 (1M) · ◒ high · ⑂ 125-omp-statusline-name *2 · S0.26 ★ 1
pij-liquid-walrus
```

The native session-name segment is absent, the keyed extension-status row still contains `pij-liquid-walrus`, and the notice appears exactly once. The temporary no-op seam was restored before any subsequent check or commit; the witness window was closed.
