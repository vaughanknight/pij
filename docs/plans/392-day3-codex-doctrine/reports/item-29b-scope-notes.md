# 29b — scope notes for the o-prime (from the deps-fold cold review, 5b77c99)

Source: `reviews/item-29b-t001-deps.md` (✅ APPROVE). W1+W2 folded pre-merge by the stream (`reviews/item-29b-t001-w1w2-fold-packet.md`). These three are above the stream's fence — surfaced, not ruled:

## 1. Dim-1 #4 rescope — 29b-rest is NOT "add a runDaemon boot test"
The reviewer corrected the stream's own Dim-1 #4: `runDaemon` is already booted by `daemon.bootstrap.test.ts` (calls it 6×; 7 of 14 bootstrap tests execute `bridgeNotifierDepsForDaemon`). Making the factory throw reds 7 — so they EXECUTE the wiring but ASSERT nothing on it.
→ **29b-rest scope = add a behavioural ASSERTION on the notifier wiring inside the already-booted runDaemon**, not a new boot test. The W1+W2 source pins folded now are an interim call-site guard; the real behavioural sensor is this.

## 2. W3 — deps object under-asserted; silent bridge-log loss on bad pijHome
The `pathFor` test asserts ONE of 6 deps fields (store). `pijHome` is NOT inert — `daemon.ts:254` uses it for the bridge-log tail. Reviewer MEASURED a single-field mutation:
- shipped: notified 1, evidence-in-capture TRUE, capture 99 bytes.
- pijHome bad: notified 1, evidence-in-capture FALSE, **capture 58 bytes — operator's diagnostic silently loses the bridge log**; notice still looks healthy; suite GREEN.
→ Directly relevant to main's PRE-TAG item "bridge log sink dead since item 29." Mitigation exists (the `:255` catch names the wrong path, so runtime is candid) — the gap is test-side. Candidate for 24b/29b-rest hardening.

## 3. Harness observations (second objective)
- **`pij-skill-check.test.ts` is FLAKY under full-suite parallelism** — failed 1 of 5 full runs, passes isolated on both mutated and restored trees. NOT a regression; flag so a future E35 full-suite red on it isn't misread. Encode candidate: isolate or serialize it.
- **`release-age-policy` spawnSync `pwsh` ENOENT** — environmental (pwsh not installed); re-derived on the unmodified worktree (1 failed/9 passed). Not a code failure.
