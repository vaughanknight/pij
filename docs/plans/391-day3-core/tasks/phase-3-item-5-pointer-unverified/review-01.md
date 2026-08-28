# Cold review — dlg-0009 · Phase 3, item 5 (honest pointer line) + finding C

**Reviewer**: `pij-mobile-reptile` (cold cross-model, claude-opus-5 via copilot) · **Date**: 2026-08-27
**Target**: `s391/item5-pointer-unverified` @ `989aa1d7ae7a7b3a3935b745b54a541896d28423`
**Verdict**: ✅ **APPROVE** · **Highest severity**: low · **Findings**: 6 (0 blocking)

---

## §0 Scaffolding, and the limits of this pass

Stated first, so that nothing below reads as broader than it is.

**What I actually ran.** Full `npx vitest run .pi/extensions/pij/` on the frozen
tree (my own run, not the coder's): `/Users/vaughanknight/.pij/pij-mobile-reptile/bg-mtbhg111-fn3szj.log`.
`npx tsc --noEmit -p .` (exit 0, zero diagnostics). `npx biome check` on the 7
changed TS files (exit 0). Ten mutations (§3), each restored and proven
byte-identical two ways (`cmp` against a pre-mutation copy **and**
`git diff --exit-code`).

**Scaffolding I used.** Pre-mutation copies of the three production files at
`/tmp/d9-{daemon,tmux,loop}.orig.ts`; a `git status --porcelain` baseline at
`/tmp/dlg0009-baseline-status.txt` (17 untracked orchestration paths — this
worktree is never pristine, so "clean" is asserted as *zero delta against that
baseline*, not as empty status). Mutants applied with `perl -0pi`, never by hand.

**What I did NOT check — none of these are "clean", they are unexamined:**

- **No live-daemon proof.** The packet forbids it (addendum §3) and I honoured
  that. Everything below is argv/fake-tmux/composition evidence.
- **The `enterAttempts == 1` case is unexercised by anyone, including me.** The
  packet's own rationale for the counter is that pointers reach `unverified`
  after ONE Enter (short-tail early break, `daemon-tmux.ts:150-154`). I did not
  build a fixture for it either — I proved only that *no test reads the counter
  at all* (F-1).
- **I did not drive `pij inbox` end-to-end on a dual-backend home.** My claim in
  F-2 about the fs copy being closed out is read from `DualWriteChannel.markRead`
  (`channel-factory.ts:89-97`) and `core/inbox.ts:339` — traced by reading, not
  executed.
- **I did not verify the two baseline failures on the base commit itself.** That
  would require moving HEAD in a read-only worktree. I verified them a weaker
  way (§2, aim 5): both are skill-text assertions, in two files this diff does
  not touch, failing on `skills/**` content this diff does not touch.
- **No concurrency, crash-injection, or rollback testing** of the dual backend.
- `harness checks` / `just smoke` / `just lint` **not run by me**. The coder's
  execution log reports `harness checks --quick` with pre-existing lint/Windows
  red; that is **relayed, not confirmed**.

---

## §1 Freeze

| Fact | Value |
|---|---|
| `git rev-parse HEAD` | `989aa1d7ae7a7b3a3935b745b54a541896d28423` ✅ matches dispatch |
| Branch | `s391/item5-pointer-unverified` ✅ |
| `HEAD^` / `merge-base HEAD main` | `91337335e2aeaca6a29c6a21721078d09861ac35` ✅ = declared base |
| Tracked tree at open **and** close | `git diff --exit-code` clean |
| Untracked delta vs baseline at close | **zero** |

Commit: `feat(spawn): clarify unverified pointer delivery` — 10 files,
352 insertions / 35 deletions.

---

## §2 The five aims

#### Aim 1 — semantics frozen ✅

- **`SendOutcome` vocabulary unchanged.** The type is untouched; the guard
  `describe("sendText outcome vocabulary (plan 071 D7)")` is byte-identical to
  base and green in every one of my runs. It now sits at
  `daemon-tmux.test.ts:548-569`, not `:511-527` — that is pure displacement from
  the +37-line insertion above it, not an edit (F-5).
- **Pointer path still consumes as `{outcome, via:"pointer"}`** — the `consumed`
  assertions at `loop.test.ts:1246` and `:1385`/`:1416` are unchanged; only the
  *recording fake* grew a 5th parameter.
- **Still settled `injected` under `POINTER_LEASE_MS`** — `daemon.ts:1163`
  untouched. M6 proves the wording and the real lease are pinned to the *same*
  constant, so the diagnostic cannot drift from the behaviour.
- **Pointer path emits NO receipt** — `daemon.ts:1155-1163` still `continue`s
  before `emitSendReceipt`; the new composition test asserts the absence of a
  `[pij receipt …]` body positively.
- **Composer-idle guard untouched** — the Amendment 4 test appears in the diff
  as context lines only.

#### Aim 2 — wording per path ✅

Bidirectionally pinned, which is the part that matters. M2 (force the body
branch) turns the *pointer* test red; M2b (force the pointer branch) turns the
*body* control red on its byte-exact string. Neither arm can rot silently.

Outcome independence is demonstrated rather than asserted: under M2 the failing
assertion is `not.toContain("UNVERIFIED")` — `expect(...).toBe("unverified")`
had already passed on the line above.

#### Aim 3 — composition ✅ (the load-bearing one)

M1a (drop `opts` from the forwarding call) and M1b (revert the wrapper to the
base 4-arg lambda) both turn exactly one test red: the new real-`Daemon` test.

**Validator F2's premise is empirically true.** Under M1b I ran
`npx tsc --noEmit -p .`: **exit 0, zero diagnostics**. A 4-arg wrapper really is
silently assignable to the widened port. The type system cannot catch this drop;
only this composition test can. The test earns its place.

#### Aim 4 — finding C ✅

`daemon.ts:1092` now uses `sqliteOf(this.channel)`, matching the pre-existing
dual-aware precedent at `:1528` and `index.ts:364`. M3 (revert to
`instanceof SqliteQueue`) turns the new dual test red and nothing else.

M7 additionally shows the dual test *earns* its AC-18 claim: deleting
`sq.recoverStaleClaims()` makes the post-expiry re-announcement disappear
(`expected [] to deeply equal [{pane:'%1',…}]`). The recovery arm is genuinely
exercised, not merely narrated.

#### Aim 5 — scope ✅

Diff = exactly the 10 packet paths (8 code/doc + the 2 dossier files). **No
`skills/**`**, no `government/**`, no `core/types.ts`, no receipts change.

Gate, my own run: `2 failed | 169 passed | 2 skipped (173)` files ·
`2 failed | 3945 passed | 15 skipped (3962)` tests — **identical to the coder's
reported numbers**. Both failures are the declared baseline pair. I did not
re-run them on base (§0), but the evidence is strong: they are skill-text
assertions (`expected '# peer — spawn & talk…' to contain 'Empty or absent
TMUX_PANE means external pull mode.'`) in two files this diff does not touch,
against `skills/**` content this diff does not touch.

---

## §3 Dim-0 — 10 mutations, 8 RED, 2 survivors

The brief mandates 3; I ran 7 more, weighted toward the parts a green suite
cannot distinguish from an untested one.

| ID | Target | Mutation | Result |
|---|---|---|---|
| **M1a** | `daemon.ts:293` | drop `opts` from the forwarding call only | 🔴 RED — composition test alone |
| **M1b** | `daemon.ts:280-290` | revert wrapper to base 4-arg lambda | 🔴 RED — same test; **tsc exit 0** |
| **M2** | `daemon-tmux.ts:557` | `opts?.kind === "pointer"` → `false` | 🔴 RED — wording assertion, outcome already passed |
| **M2b** | `daemon-tmux.ts:557` | → `true` | 🔴 RED — byte-exact body control |
| **M3** | `daemon.ts:1092` | `sqliteOf(…)` → `instanceof SqliteQueue` | 🔴 RED — dual test alone |
| **M4** | `daemon-tmux.ts:531` | delete `enterAttempts += 1` | 🟢 **SURVIVES — full suite** |
| **M5** | `loop.ts:660` | `kind:"pointer"` → `kind:"body"` | 🔴 RED ×4 (loop ×3, daemon ×1) |
| **M6** | `loop.ts:50` | `POINTER_LEASE_MS` 90_000 → 60_000 | 🔴 RED ×2 — wording **and** real lease |
| **M7** | `daemon.ts:1093` | delete `if (sq) sq.recoverStaleClaims()` | 🔴 RED — dual re-announce arm |
| **M8** | `daemon-tmux.ts:557` | drop the `ℹ️ ` prefix | 🟢 **SURVIVES** |

M4 was confirmed against the **entire** suite, not just the four target files:
`2 failed | 3945 passed | 15 skipped` — byte-identical to the clean gate.

All ten restored; `cmp` and `git diff --exit-code` both clean afterwards;
targets re-run green (195 passed / 2 skipped), `tsc` exit 0, `biome` exit 0.

---

## §4 Findings

#### F-1 · low · Dim-0 gap — the pointer line's *positive* content is unpinned

The body control asserts its string **byte-exactly** (`daemon-tmux.test.ts:466`).
The pointer test asserts only two negatives (`not.toContain("UNVERIFIED")`,
`not.toContain("⚠️")`) and four fragments (`"pointer"`, `"90s lease"`,
`"re-announced"`, `"pid 4242"`). Two things fall through that gap, both proven:

- **M4 — `enterAttempts` is read by nothing.** Delete the increment and the
  message reports `after 0 Enter attempt(s)`; the full suite stays green. This
  is the *only* new computed value in the production diff, and it exists
  precisely so the pointer line reports the honest count — the packet's own
  rationale (T006, `<N> Enter attempt(s)`) is that pointers can reach
  `unverified` after **one** Enter. The single pointer fixture holds the
  composer pending for all three attempts and asserts no number, so the
  interesting case is neither produced nor checked. Note the asymmetry: the
  body path's *constant* `SUBMIT_ATTEMPTS` is byte-pinned; the *variable* that
  motivated the change is not pinned at all.
- **M8 — the `ℹ️ ` prefix is unpinned.** Absence of `⚠️` is asserted; presence
  of `ℹ️` is not. A line with no prefix passes.

Severity low, deliberately: this is diagnostic-only text. Applying the
policy-vs-brake test from AGENTS.md — removing the counter changes *what an
operator reads*, never what is delivered, leased, consumed, or receipted. No
delivery behaviour is at risk.

*Suggested (non-blocking)*: one fixture whose composer empties after the first
Enter, asserting `after 1 Enter attempt(s)`; and add `expect(output).toContain("ℹ️")`.
The first would also become the only coverage of the short-tail early break the
packet cites as the motivating case.

#### F-2 · low · the dual backend's fs copy: window-open pinned, window-close not

Under `dual`, the pointer path settles the sqlite row to `injected` and
deliberately does **not** `markRead`, so the mirrored fs copy stays unread. The
new test asserts exactly that (`"body remains durable"`) — correct, and good.

What no test pins is the *closing* of that window. I traced by reading that
`DualWriteChannel.markRead` mirrors sqlite→fs (`channel-factory.ts:89-97`) and
that the pull path routes through `markRead` (`core/inbox.ts:339`), so a seat
that actually runs `pij inbox` should close both copies. **I did not execute
this** (§0). The consequence if that trace is wrong is a backend *rollback*
(`dual` → `fs`) re-delivering bodies already announced by pointer — duplicate
delivery, not loss, so brake-shaped rather than a data-loss risk; but
at-most-once is a stated invariant of this subsystem, so it is worth one
assertion rather than a reading.

#### F-3 · low · operational: the pointer line no longer matches a `grep UNVERIFIED` census

This is the intended effect, but it has a consumer. `reports/pij-comms-review/2026-08-27/`
measured this exact problem by counting `UNVERIFIED` in daemon scrollback ("23
`UNVERIFIED` (10 claude, 13 copilot)", "43 UNVERIFIED for 44 injections"). After
this ships, that census silently undercounts: unconfirmed *pointer* sends stop
matching. I checked for in-repo automated consumers and found none — every
`UNVERIFIED` hit is docs, reports, or the unrelated `(UNVERIFIED)` done-state
render in `core/cli.ts:5806`. So the exposure is to humans and ad-hoc greps, not
to code. Worth a line in the ship note: a future census should grep for both the
`⚠️ … UNVERIFIED` and `ℹ️ … pointer typed` forms.

#### F-4 · low · packet addendum names a base that is not an ancestor of HEAD

`packet-addendum.md` §1 says base `main@d2dbab0`. That commit
(`gov(prime): canary records …`, 18:07) is **not an ancestor of HEAD**
(`git merge-base --is-ancestor` → false). The dispatch, `tasks.md`, and
`git rev-parse HEAD^` all agree on `9133733`. The coder branched correctly, so
nothing is wrong with the work — but the addendum is a stale instruction that
would send a re-run or a rebase to the wrong base. Fix the addendum, not the
branch.

#### F-5 · info · line references in the brief/packet drifted by +37

The vocabulary guard is cited as `daemon-tmux.test.ts:511-527` in the brief, the
packet, and the plan; post-diff it is `:548-569`. Pure displacement — I verified
the block is byte-identical to base. Noted only so the next reader does not read
"the guard moved" as "the guard changed".

#### F-6 · info · the delivery test hardcodes `NOW_MS + 90_000`

`daemon.delivery.test.ts` asserts the lease numerically rather than importing
`POINTER_LEASE_MS`. M6 shows this cuts both ways: it is an *independent* pin on
the value (good — it caught the constant change), but a deliberate lease change
now requires editing a magic number in a test far from the constant. Leaving it
is defensible; flagging so it is a choice rather than an accident.

---

## §5 What I liked

Two things are better than the packet asked for.

**Moving `POINTER_LEASE_MS` into `loop.ts` closed a drift channel.** The
diagnostic now derives its "90s" from the same constant that sets the lease. M6
turns *both* the message assertion and the lease assertion red at once — the
line physically cannot lie about the lease. That was not required by any AC.

**The composition test is the right test, and it is provably the only one.**
M1b + `tsc` exit 0 is the concrete demonstration that AC-07 and AC-08 could both
stay green while the live daemon kept logging the loud line — exactly the failure
mode `validate-v2-plan-01.md:47` predicted.

---

## §6 Verdict

✅ **APPROVE** at `989aa1d7ae7a7b3a3935b745b54a541896d28423`.

All five aims hold. All three mandated mutations kill, including the load-bearing
composition one. The semantic freeze is real: outcome vocabulary, `via:"pointer"`
consumption, the `injected` lease, the no-receipt rule, and the composer-idle
guard are all untouched, and I mutated around them rather than taking the diff's
word for it. The two survivors and the four remaining findings are all
diagnostic-text, provenance, or coverage issues — none is a defect in shipped
behaviour, and none blocks.

Highest severity **low**. Recommend shipping; F-1 is the one worth a follow-up,
and it is a test-only change.

---

**TERMINAL REPORT.** This pass is CLOSED. No mutations were run after this file
was written; the tree is at the frozen commit with a clean tracked diff and zero
untracked delta against the opening baseline. Nothing in this pass is left open.
