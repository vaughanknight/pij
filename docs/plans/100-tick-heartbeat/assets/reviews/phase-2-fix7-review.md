# Phase 2 fix7 re-review - 6fa07dda

**Verdict: REQUEST_CHANGES**

The terminal-hot correction fixes the round-6 failed-unarchive path. It is
correctly coupled to `isTerminalRecord`, and the archived pre-lifecycle test
restores M31's ability to distinguish hot-only lookup from archive fallback.

One P1 remains: the new predicate calls every non-terminal record a live
incarnation. A hot legacy external descriptor with no lifecycle is
non-terminal, but `pij adopt --id` can replace its unknown native attachment
with a new bound one. The old map stamp then becomes a false receipt for that
new incarnation.

## P1 - legacy external re-adoption inherits a fresh stamp

`isTerminalRecord()` intentionally returns false when `lifecycle` is absent
(`core/archive.ts:33-35`), so `publish()` sees a hot legacy record as
`hadLiveIncarnation` (`adapters/fs-registry.ts:369-370`) and retains its map
entry.

This is reachable rather than a synthetic legacy shape:

1. A legacy Claude/Copilot/Codex descriptor can be hot with
   `harnessSessionId` and `lifecycle` absent. The archive policy keeps
   lifecycle-absent records hot, and bind health calls them `ok`.
2. The daemon stamps every daemon-owned descriptor without a lifecycle filter
   (`daemon.ts:289-304`), so that hot legacy external record receives a map
   stamp.
3. `pij adopt --id` permits the old descriptor when its native id is absent
   (`cli.ts:2780-2790`), then `reattachIdentity()` writes a new
   `harnessSessionId` and `lifecycle: "bound"` through `registry.write()`
   (`cli.ts:2800-2812`, `core/binding.ts:212-230`).
4. The prior descriptor is neither null nor terminal, so the drop is skipped.
   If the daemon stops here, `read()` returns the old fresh stamp for the new
   binding for the full staleness grace.

I proved it with an in-memory `FsRegistry` probe, then removed the probe:

```ts
registry.write(descriptor({
  id: "pij-a", harness: "claude", harnessSessionId: undefined, lifecycle: undefined,
}));
heartbeat().write(["pij-a"], FRESH_TICK);
registry.write(descriptor({
  id: "pij-a", harness: "claude",
  harnessSessionId: "claude-new-session", lifecycle: "bound",
}));
expect(registry.read("pij-a")?.lastTickAt).toBeUndefined();
```

It failed, receiving `2026-06-28T11:59:59.000Z`. Add a permanent regression
through the legacy-adopt path and drop the entry when a legacy attachment is
re-bound. Do not broadly classify every lifecycle-absent record as terminal:
an ordinary legacy state update is not necessarily a new incarnation.

## Adjudications

- **Terminal -> terminal over-drop:** the semantic direction remains
  conservative, but the stated repair premise is too strong. A failed spawned
  peer can call `pij agent report` while the daemon is stopped:
  `executeAgentReport()` admits `failed` (it rejects only missing descriptors)
  and writes `reportedAt` via `registry.write()` (`core/agent-peer.ts:403-448`).
  That is a production failed -> failed write with no next 600 ms repair. It
  is not a separate P1: `bind-failed` sends are blocked, so dropping the
  stopped daemon's old stamp is conservative rather than a false-fresh
  receipt. The comment and test should not claim all such writes are daemon
  latched transitions or guaranteed to re-stamp.
- **Imported terminal predicate:** `isTerminalRecord` is genuinely imported
  and its current definition includes exactly `dissolved` and `failed`. The
  failed-unarchive and archived pre-lifecycle cases are independently pinned.
  The missing distinction is a *hot* pre-lifecycle descriptor whose attachment
  changes, not an archive-fallback or terminal-classification defect.
- **M15-shaped mutation validity:** I re-ran M31's hot-to-fallback edit and
  the failed-only narrowing analogue with mandatory `--expect`. Both compiled,
  changed behavior, and were killed; neither is a swallowed no-op.

## Independent mutation evidence

Every mutation used mandatory `--expect`:

| Reviewer mutation | Required criterion | Result |
| --- | --- | --- |
| Make liveness depend on the incoming descriptor instead of `priorHot` | `P1h: a hot FAILED record left by a public unarchive is not a live incarnation` | Killed; eight criteria failed. |
| Skip the drop for incoming `failed` descriptors | `P1h ROW 2 sub-case: terminal -> terminal ALSO drops - a priced over-drop` | Killed exactly that criterion. |
| `readHot()` -> `read()` | `P1h: an archived LEGACY record with NO lifecycle still drops - hot-only is load-bearing` | Killed exactly that criterion. |
| Treat only `dissolved` as terminal | `P1h: a hot FAILED record left by a public unarchive is not a live incarnation` | Killed three P1h criteria. |

The focused overlay suite passes with 39 tests after the removed probe.
