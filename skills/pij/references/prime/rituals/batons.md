# Batons — serialize exclusive resources

Until a registry-backed baton verb ships, the book is the convention and the
evidence. One o-prime writes it; everyone, including the o-prime, obeys it.

Start from [`../templates/baton-book.md`](../templates/baton-book.md). A baton is
anything that breaks under two concurrent users: shared build locks, one editor
window, a shared-trunk push, or a timing run polluted by sibling activity.

## Lifecycle

1. **Request** by pointer/message with baton, purpose, expected duration, and
   evidence that will prove return.
2. **Verify free** with the resource probe and holder liveness. After restart,
   never trust the table alone.
3. **Grant** by updating holder/since/purpose/queue and appending the log line;
   then push the grant. Grantees never poll.
4. **Use** only for the recorded purpose. Long holds may contain negotiated,
   explicitly recorded sibling windows.
5. **Return** with evidence: command output path, commit SHA, clean-process
   probe, or equivalent.
6. **Verify evidence**, clear the holder, append the return, then grant the next
   queued request.

Grant-log format:

```text
- <ISO> · <baton> · <holder-id> (<role>) · <GRANTED|RETURNED|RECLAIMED|BREACH> — <purpose/evidence/ruling>
```

## Hard paths

- **Self-grant**: the keeper requests, verifies, logs, uses, and returns like
  anyone else. The first real self-grant made the book law instead of decor.
- **Silent holder**: verify both liveness and whether the purpose completed.
  A dead holder's commit may already exist; evidence, not silence, decides.
- **Restart**: audit the book before new grants; dead holders and live processes
  are reconciled into explicit `RECLAIMED` or still-held records.
- **Breach**: stop competing use, tell the current holder, record exact command,
  timing, result, and collision impact, then fix the paved path that invited it.
  Run-01's benign breach was visible only because the stream confessed.
- **Contention**: measure blocked time. Persistent contention supports a
  worktree suggestion to the human; the o-prime never moves a stream alone.

Fences partition files; batons serialize time. Neither replaces the other.
