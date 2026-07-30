# s072 FIX packet 01 — for pij-able-damselfly

From **pij-reasonable-dove**. Verdict `FIX_REQUIRED`. Reviewer report:
`docs/plans/072-reboot-rehydrate/review-s072.md` — read it, it is well evidenced.

Scope is **only** what is below. Do not re-open anything the reviewer cleared
(shellQuote, the resolver, the five golden lines, `--assume-dead` blast radius,
the `--attach` tree-root trade-off — all accepted).

---

## FIX-1 (HIGH, F-001) — a recycled pane id must not be proof of life

`classifyAttachment()` returns `live` unconditionally on `paneLive`
(`revive.ts:177`), and `paneLive` comes from a bare `tmux.isPaneLive(paneId)`
(`cli.ts:1241`) which only asks `#{pane_dead}`. The reviewer reproduced the
reuse directly — private tmux server, kill, restart, `%0` → `%0` — and confirmed
the production classifier returns `live` even with `pidAlive:false`,
`terminalObserved:true`, and boot-time corroboration all pointing the other way.
`planRevive()` refuses `live` before `--print` or `--assume-dead` are considered
(`revive.ts:440-445`), so **the documented override cannot rescue it**.

This is the same recycled-identifier class you already fixed on the pid axis.
Apply the same discipline to the pane axis:

- A live pane is proof only if it can be corroborated as **our** pane — e.g.
  `#{pane_pid}` matching the descriptor's recorded pid, or a pane/server start
  time older than the descriptor's last recorded activity. Pick what tmux will
  actually give you and say which signal you used.
- **Cannot corroborate ⇒ `uncertain`, never `live`.** `uncertain` already gates
  writes and is already overridable with `--assume-dead`, so this restores the
  operator's escape hatch on the reboot path.
- Never the other way: nothing here may classify a genuinely live pane as dead.
  The reviewer explicitly confirmed today's code has no false-dead path — keep
  that property.
- Regression test: a reused pane id (fresh server, same `%N`, different seat)
  must classify `uncertain` and must be revivable with `--assume-dead`.

## FIX-2 (HIGH, F-002) — the contract, amended; and a printed statement that is false

The reviewer is right that the implementation contradicts the contract I wrote.
**I am amending the contract, and I want that on the record rather than quietly
restated.** The purpose of "`--print` touches nothing" is *safety* — no registry
write, no unarchive, no spawn, no send-keys, no descriptor mutation. A read-only
`display-message` query violates none of that, and knowing whether the old
attachment is still alive is genuinely useful *before* you paste. So:

**Amended contract.** `--print` MUST NOT mutate anything. It MAY issue read-only
tmux queries. It MUST work when tmux is absent entirely — no server, no
`$TMUX` — because that is the actual reboot case; a failed or impossible probe
degrades to `unprobed` and is reported as such, never an error, never a crash.

What is actually broken, and must be fixed:

1. `cli.ts:1614` prints to the operator **"nothing was written: --print touches
   neither tmux nor the descriptor"** — while `cli.integration.test.ts:992`
   asserts a tmux call *does* happen. The output states a falsehood and the test
   encodes the contradiction. Make the printed line say what the code does.
2. Add the tmux-absent path and a test for it: `--print` with no tmux server
   available must still emit the shell line, reporting the attachment as
   unprobed.
3. Update the test's comment and the docs to the amended contract, so the next
   reader is not told "no tmux" by one artifact and shown a tmux call by another.

## FIX-3 (MEDIUM, F-003) — make the mutation evidence durable

Your G1–G15 detail exists — you sent it to me in full, per guard, with the RED
reason. It is not in `execution.log.md`, which records only the aggregate "15
Dim-0 mutations", so it was unauditable to the reviewer. Transcribe it: guard,
mutation expression, target suite, RED output, restore confirmation. Include the
G11b and G12 first-run **survivals** and what you changed in response — a
mutation that survived and was then genuinely fixed is the most valuable entry
in the log, not an embarrassment to smooth over.

## FIX-4 (LOW) — a rationale that misstates the mechanism

`cli.ts:1612` tells the operator pi/omp "reads `PIJ_SESSION_ID` at boot". The
reviewer traced the real path: resumed pi derives identity from its native
session, finds the dissolved descriptor, and calls `registry.revive()`
(`session.ts:207-242`). `PIJ_SESSION_ID` is produced at boot, not supplied by
the pi/omp line. The behaviour is correct; the stated reason is wrong. Correct
the wording.

## FIX-5 — own the whole gate

`harness checks` exits **1**: every stage passed except smoke, which "lost tmux
pane %2717 while its spawned package-bootstrap flow was idle". Two full `just
test` runs also failed on timeouts (`packages-bootstrap.test.ts`, and once
`daemon-push.test.ts`) that pass in isolation.

Determine whether any of it is caused by this diff. If it is, fix it. If it is
not, prove that — name the mechanism, not "unrelated". A red gate is ours to
own even when we did not cause it; do not hand it back as pre-existing without
evidence. If you cannot establish cause, say exactly that and say what you ruled
out. **Do not** make a flake green by loosening a timeout without saying so.

---

## Rules unchanged

Forward-only, never `git revert`. Allowed paths as before. Do not commit or
push. Do not restart the daemon. Do not weaken `.npmrc`.

Re-run all three gates plus `harness checks`. Report per-fix: what you changed,
the evidence, and anything you could not prove — `NOT OBSERVABLE` with a reason
is a valid answer and the reviewer used it well.
