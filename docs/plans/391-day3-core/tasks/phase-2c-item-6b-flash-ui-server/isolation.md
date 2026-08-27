# Flash interactive HTTP 400 isolation

**Date**: 2026-08-28

**Copilot CLI**: `GitHub Copilot CLI 1.0.81-14`

**Verdict**: upstream instability — gemini-3.6-flash on GitHub Copilot CLI 1.0.81-14 is unstable upstream: HTTP 400 'invalid request body' on every request path (-p and interactive) observed 2026-08-28 ~16:0xZ, while a -p one-shot succeeded ~07:33Z. Both observations are real. The later all-path failure is not caused by `--yolo`, `--ui-server`, `--session-id`, `--effort`, MCP/custom instructions, or `--context long_context`; it is not evidence of a stable path-specific capability.

## Isolation controls

- Ran in a fresh standalone Terminal.app instance, not a tmux pane.
- `TMUX` and `TMUX_PANE` were both unset in every Copilot process.
- Used an empty scratch working directory.
- Set `PIJ_HOME` to a fresh `mktemp -d` directory.
- Did not invoke `pij spawn`, create a pij seat, or contact/restart the live daemon.
- Interactive rows used `-i "say ok"` to submit the required trivial prompt without tmux or pane automation.
- Applied invariant capture flags `--no-color --screen-reader --log-level debug --log-dir <temp>` to every cell.
- Row 7 also used `--disable-builtin-mcps --no-custom-instructions`; the empty scratch directory removed repository configuration from every row.

## Matrix

| # | Variant under test | `gemini-3.6-flash` | `gpt-5.6-sol` |
|---|---|---|---|
| 1 | `copilot -p "say ok" --model M` | HTTP 400 `invalid request body` | OK: `ok` |
| 2 | `copilot --model M` | HTTP 400 `invalid request body` | OK: `ok` |
| 3 | `copilot --yolo --model M` | HTTP 400 `invalid request body` | OK: `ok` |
| 4 | `copilot --model M --ui-server --port N` | HTTP 400 `invalid request body` | OK: `ok` |
| 5 | `copilot --yolo --session-id <uuid> --model M --ui-server --port N` | HTTP 400 `invalid request body` | OK: `ok` |
| 6 | Row 5 plus `--effort low` | HTTP 400 `invalid request body` | OK: `ok` |
| 7 | Row 5 with repository configuration absent, built-in MCPs disabled, and custom instructions disabled | HTTP 400 `invalid request body` | OK: `ok` |
| 8 | Row 5 plus `--context long_context` | HTTP 400 `invalid request body` | OK: `ok` |

Every Flash cell exited non-zero after about 11 seconds. Every Sol cell returned `ok` and exited zero.

## Verbatim Flash errors

```text
row 1: Execution failed: 400 invalid request body (Request ID: F47A:3F5CC4:1F5C14B:243EEA2:6A905FF8)
row 2: Execution failed: 400 invalid request body (Request ID: F518:C1525:2D05C6:3208EB:6A906019)
row 3: Execution failed: 400 invalid request body (Request ID: F630:237301:2D1CB4:3232B9:6A906037)
row 4: Execution failed: 400 invalid request body (Request ID: F6A5:90A21:1F56B7E:243D54F:6A90605A)
row 5: Execution failed: 400 invalid request body (Request ID: F6FF:3F5CC4:1F7E973:24664E9:6A90607B)
row 6: Execution failed: 400 invalid request body (Request ID: F789:3DC9AF:1F7509D:245D267:6A90609D)
row 7: Execution failed: 400 invalid request body (Request ID: F85D:9324D:1F900DE:247AF5A:6A9060BD)
row 8: Execution failed: 400 invalid request body (Request ID: F8F6:3FEE99:1EF7DC4:23E3CD6:6A9060D9)
```

## Conclusion

The later failure precedes and outlives every pij-specific interactive flag: Flash failed in the one-shot `-p` baseline too, while the Sol control succeeded across the same matrix. The earlier same-version `-p` success rules out a permanent path property and identifies upstream instability instead. There is no spawn-argv fix supported by this evidence. T002 therefore follows the ruled upstream path: mark `gemini-3.6-flash` with both measured outcomes, warn without blocking spawn, preserve item 6's argv gate, and recommend a Terra/Sol seat until a fresh Flash probe passes.
