# Stage B canonical live-tree canary

**Merge**: PR #13 squash `7d0ae9de4637d1df0cc82e25cd03fb216bbcbb29`
**Canonical deploy**: `/Users/jordanknight/pi-hacking/pij-canonical-deploy`
**Daemon**: pid `320`, tmux window `@1102`, source
`/Users/jordanknight/pi-hacking/pij-canonical-deploy/.pi/extensions/pij/daemon.ts`
**Baton**: `lease-bbfadaf5-f161-460d-a1ee-064f6c1d7cb2` returned

## Links applied

```json
{"id":"pij-condemned-cockroach","parentId":"pij-primary-carp","changed":true}
{"id":"pij-pregnant-dragon","parentId":"pij-primary-carp","changed":true}
{"id":"pij-concrete-roadrunner","parentId":"pij-condemned-cockroach","changed":true}
```

No already-correct edge was rewritten. `pij-minimal-whale` already resolves under
`pij-concrete-roadrunner` through `spawnedBy`.

## Final primary tree

```text
P pij-primary-carp  done/active/bound
    pij-condemned-cockroach  working/active/bound
      pij-concrete-roadrunner  done/active/bound
        pij-minimal-whale  done/active/bound
    pij-pregnant-dragon  done/active/—
```

## Mutation proof

- s046 seat: `parentId null -> pij-primary-carp`; `spawnedBy null -> null`.
- s048 seat: `parentId null -> pij-primary-carp`; `spawnedBy null -> null`.
- coder: `parentId null -> pij-condemned-cockroach`; `spawnedBy null -> null`.
- Reviewer and o-prime structural data unchanged.
- Concurrent daemon-owned `lastTickAt` / `lastEventAt` changes were observed and
  excluded from the structural mutation claim.
- No descriptor was removed, dissolved, or historically rewritten.

## Evidence bundle

`reports/stage-b-live/` contains:

- before/after descriptor snapshots;
- source hashes;
- link command JSONL;
- primary/global tree before/after JSON;
- final human tree/current-session output;
- field-diff summary.

## Deployment note

Canonical local main carried legitimate local government commits and dirty evidence, so
it was not reset or overwritten. Machine CLI, pij extension, and skill links point to the
clean detached canonical deployment checkout at the exact merged SHA.

## s046 fleet teardown

- `pij-minimal-whale` force-close was explicitly authorized by Seq 190; descriptor is
  `lifecycle:dissolved`, still visible under coder history.
- `pij-concrete-roadrunner` force-close was explicitly authorized by Seq 190; descriptor is
  `lifecycle:dissolved`, still visible under s046 history.
- Final prime tree retains both closed historical nodes.
- The adopted human-operated `pij-condemned-cockroach` pane remains for this final relay;
  the worktree remains until prime ingests the uncommitted post-merge evidence bundle.
