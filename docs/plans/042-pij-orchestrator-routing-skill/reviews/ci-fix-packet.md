# CI fix packet — duplicate s041 timeout convergence

**Authority**: o-prime after PR #10 failed twice on the same Node 24 test
**Purpose**: apply the byte-identical timeout-only change already present on
`s041/inbox-no-tmux`; do not cherry-pick.
**Scope**: one file
**Commit**: forbidden until review

## Allowed file

`.pi/extensions/pij/adapters/fs-registry.test.ts`

## Exact change

Change the line-365 test declaration from:

```ts
it("overlapping processes skip an unowned legacy attempt zero without changing its bytes", async () => {
```

to the s041-authored options-second-argument form:

```ts
it("overlapping processes skip an unowned legacy attempt zero without changing its bytes", {
	timeout: 30_000,
}, async () => {
```

No other byte may change.

## Proof

- Diff the result against:
  `git diff 18a81918d1b002863c4920149e29bbda3277dd2f..s041/inbox-no-tmux -- .pi/extensions/pij/adapters/fs-registry.test.ts`
- Run the single test file.
- Run `just typecheck`.
- Run `just lint`.
- `git diff --check`.
- Return COMPLETE with file hash and test result; no commit.

Commit note after approval:
`duplicate of s041 branch fix by design; converges at merge`
