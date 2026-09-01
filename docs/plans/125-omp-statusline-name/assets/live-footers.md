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

## AC1 control — identical launch shape, pre-fix extension

To separate the retry fix from explicit extension loading, ten more hand-started tmux windows used the same `omp --no-extensions -e … --auto-approve` shape but pointed `-e` at the main-checkout pre-fix extension. That file still contains the one-shot `await pi.setSessionName(self)` calls and no OMP status fallback. One of ten controls missed; all windows were closed after capture.

| Control | Registered id | Native footer id |
|---|---|---|
| 1 | `pij-poised-moth` | present |
| 2 | `pij-pretty-fly` | **missing** |
| 3 | `pij-helpless-stork` | present |
| 4 | `pij-thoughtful-gazelle` | present |
| 5 | `pij-conventional-walrus` | present |
| 6 | `pij-melted-penguin` | present |
| 7 | `pij-falling-outside` | present |
| 8 | `pij-like-lark` | present |
| 9 | `pij-objective-tern` | present |
| 10 | `pij-mid-lemming` | present |

Miss capture (`p125b-02`):

```text
You are pij session pij-pretty-fly (PEER). This is context only — no action is required.
◫ 4.7%/1M ⟲ · ⬢ Opus 5 (1M) · ◒ high · ⑂ 125-omp-statusline-name *2 ?1 · S0.26 ★ 1
```

The extension registered `pij-pretty-fly`, but neither the native session-name segment nor a keyed fallback row appears. At the identical explicit-load shape, pre-fix produced 9/10 while this branch produced 10/10 plus the independent fallback row.

## Post-review final-tree smoke

After the R-01/R-03/R-05/R-06 fixes and the final green `harness checks`, one additional hand-started explicit-worktree OMP confirmed the actual final source still renders both surfaces:

```text
pij: detected Rust daemon v1 at 127.0.0.1:7461; registered pij-open-galliform
◫ 4.7%/1M ⟲ · pij-open-galliform · ⬢ Opus 5 (1M) · ◒ high · ⑂ 125-omp-statusline-name *14 ?1 · S0.26 ★ 1
pij-open-galliform
```

The `p125-final` window was closed immediately after capture.
