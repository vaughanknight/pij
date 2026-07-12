# Phase 1 cold review

**Reviewed diff**: `diff-0001`  
**Verdict**: `FIX_REQUIRED`

Dimensions 0-10 were reviewed. Only material findings are reported.

## Findings

| ID | Severity | Location | Finding | Required fix |
|---|---|---|---|---|
| F-01 | High | `.pi/extensions/pi-peacock/smoke.ts:18-21` | The newly authored `execFileSync("git", ...)` subprocess has no explicit bounded `timeout`. This directly violates `reports/smoke-fence-grant.md:10`, so the grant is not satisfied. The path, branch, context-usage, provider/model, and effort assertions otherwise remain exact. | Add an explicit bounded timeout to the `execFileSync` options without weakening the footer assertions. |
| F-02 | High | `.pi/extensions/pij/telegram/index.ts:181-183`; `.pi/extensions/pij/telegram/index.test.ts:225-262` | AC-03's "most recent successful speaker" replacement is not regression-proved at the production composition seam. The integration test covers A speaking and receiving a bare message, but never B speaking afterward and replacing A. A first-write-only mutation left all mandated tests green. | Extend the production composition test to prove: A speaks, bare routes to A; then B speaks successfully, and the next bare message routes exclusively to B. |

Under the verdict law, F-01 is a grant violation and both findings are High, so the result is `FIX_REQUIRED`.

## Dimension 0 mutation evidence

### Successful-speech guard

The reviewer-brief command was attempted verbatim:

```text
just flow-pair-mutate .pi/extensions/pij/telegram/bridge.ts 's/if \(spoke\) return;/if (true) return;/' 'just test .pi/extensions/pij/telegram/bridge.test.ts .pi/extensions/pij/telegram/index.test.ts'
```

It failed before mutation because the `justfile` recipe accepts only `file` and `expr`; `just` treated the third argument as another recipe name. The underlying reviewed helper supports the third test-command argument, so the equivalent direct invocation was used.

- RED: replacing `if (spoke) return;` with `if (true) return;` produced 6 failed tests.
- Restore: byte-identical SHA-256 before and after:
  `5a7ef60729ad8fb05b6672caca385fcda737c6a763b174ba4bee8c9c2f013c55`.
- GREEN: the same bridge/index suite passed after restoration.

This proves the successful-speech guard is load-bearing.

### AC-03 recency probe

A first-write-only mutation changed the production setter to ignore every speaker after the first:

```ts
if (!lastSpeaker.has(String(chatId))) lastSpeaker.set(String(chatId), from);
```

The bridge/index suite stayed green, proving the missing replacement regression in F-02. `index.ts` restored byte-identically with SHA-256:
`5a50db6330224b3bc866048d2f7345027859a64ae9b1e550793f2d64e24ccb6a`.

### R6 load-bearing assertion

`.pi/extensions/pij/telegram/bridge.test.ts:410-414` is the negative/state proof that selected silent B does not replace prior speaker A:

```ts
expect(deliver.mock.calls[0]?.[0]).toMatchObject({ to: "pij-agent-b" });
expect(deliver.mock.calls[1]?.[0]).toMatchObject({
	to: "pij-agent-a",
	body: expect.stringContaining("what is the status?"),
});
```

The first delivery proves B was explicitly selected; the second proves the subsequent bare message still routes to A.

## Gates rerun

| Gate | Result |
|---|---|
| `harness boot --json` | GREEN: typecheck and full unit-test readiness stages passed |
| Bridge + index tests | GREEN: 78/78 |
| Bridge + index + matcher targeted Telegram subset | GREEN: 91/91 |
| Full Telegram directory | GREEN: 166/166 across 9 files |
| `git diff --check 347b6dd732110bc76b3d421e61a401cc228149d6` | GREEN |
| `harness checks --json` | RED: typecheck, lint, tests, package audit, and snapshots passed; smoke failed because every spawned tmux pane disappeared before capture |
| `just smoke` retry | RED with the same missing-pane failure across all 9 scenarios |
| `.pi/packages.yaml` | Clean |

## Scope check

`diff-0001` contains exactly the eight original Phase 1 fenced files plus the one-file smoke addendum:

```text
.pi/extensions/pi-peacock/smoke.ts
.pi/extensions/pij/telegram/bridge.test.ts
.pi/extensions/pij/telegram/bridge.ts
.pi/extensions/pij/telegram/commands.ts
.pi/extensions/pij/telegram/index.test.ts
.pi/extensions/pij/telegram/index.ts
README.md
docs/domains/pij-control-plane/domain.md
docs/how/pij-telegram.md
```

No package manifest, government, flow-state, matcher, or other forbidden path is present in the snapshot.

## Rulings and noteworthy review

- R1, R3, R5, and R6 behavior is implemented without a material correctness finding.
- R4's hybrid test strategy is incomplete specifically at AC-03's production replacement seam (F-02).
- R2's outage-first fleet rule and R7's separate `gpt-5.6-sol` `xhigh` reviewer profile are reflected in the review packet/evidence.
- Restart state is closure-local. A stopped bridge's late acknowledgement cannot repopulate the new bridge's map; no material restart leak was found.
- The smoke addendum preserves strong exact path/branch/content assertions. Its blocking defect is the missing subprocess timeout, not assertion weakening.
- The reviewer cannot attest a green full done gate: smoke failed twice before scenario assertions with `can't find pane`, across every scenario rather than only pi-peacock. This is recorded separately from the diff-attributed findings.
- Harness observation `DL-004` records the stale reviewer-brief/`just flow-pair-mutate` argument contract.
- Harness observation `DL-005` records the repeated tmux missing-pane smoke failure.
