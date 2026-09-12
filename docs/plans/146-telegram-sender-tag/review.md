# Plan 146 — review

Reviewer: `pij-worthy-cheetah`. Prime: `pij-minor-unicorn`.
Reviewed: `fb13a12b` on `146-telegram-sender-tag` vs `main` (`dd5b61fa`), plus the
uncommitted `report.md`. Rust via `~/.cargo/bin/cargo`.

## Verdict: **APPROVE**

No finding degrades a control. The chunk budget holds with 96 units of margin on
every probe, the tag leads every part including 2..n, the double-tag rule
distinguishes exact from lookalike, per-part failure is durable and decodable,
and `--body-file` is one implementation shared with `pij send`. The three
findings below are information-quality issues, not behaviour defects. The known
duplicate-bubble consequence is stated, not hidden. Live production proof
remains the prime's, as AC7 was relaxed.

**No production Telegram send, credential read, or daemon restart was performed.**
All mutation probes ran in a throwaway detached worktree at `/tmp/p146`
(`git worktree add --detach /tmp/p146 fb13a12b`), removed after use. The reviewed
worktree was never modified.

---

## 1. Chunk arithmetic — computed, not argued

Probe: a `#[test]` appended to `crates/sidecars/src/telegram_outbound_tests.rs`
**in `/tmp/p146` only**, calling the real `super::prefixed_text_parts`
(`crates/sidecars/src/telegram.rs:600`) and printing the measured maximum bubble
length. Command:

```
cd /tmp/p146 && ~/.cargo/bin/cargo test --offline -p pij-sidecars --lib probe_max_bubble_lengths -- --nocapture
```

```text
PROBE limit-for-bare-tag=3987
PROBE at-boundary:      parts=1  max_utf16=4000  max_chars=4000  tag_first_all=true  lossless=true  over4096=false
PROBE one-over:         parts=2  max_utf16=4000  max_chars=4000  tag_first_all=true  lossless=true  over4096=false
PROBE 9000-mixed:       parts=3  max_utf16=3999  max_chars=3601  tag_first_all=true  lossless=true  over4096=false
PROBE 9000-oneword:     parts=3  max_utf16=4000  max_chars=4000  tag_first_all=true  lossless=true  over4096=false
PROBE long-prefix:      parts=3  max_utf16=4000  max_chars=4000  tag_first_all=true  lossless=true  over4096=false
PROBE prefix-huge-tag:  REFUSED sidecars/telegram: sender prefix leaves no room for Telegram text
PROBE prefix-3990-tag:  REFUSED sidecars/telegram: sender prefix leaves no room for Telegram text
```

Bodies, in packet order: exactly at the boundary (`3987` chars, the computed
`limit` for the bare tag `[pij-sender]`), one char over (`3988`), a 9,000-char
mixed body (`"é🙂 word\n "` × 1000 — surrogate pairs and multi-byte scalars), a
9,000-char single unbroken word (`"x"` × 9000, no newline or space anywhere),
and a long prefix (204-char seat id + 700-char repo context, body 9,000 chars).

**Measured maximum bubble length across every probe: 4000 UTF-16 units.** The
cap is 4096. The margin is 96 units and is never approached from above.

`max_chars` is reported alongside `max_utf16` because Telegram counts UTF-16
code units, which is what the implementation counts (`encode_utf16().count()`,
`telegram.rs:606,612,618`). The `9000-mixed` row (`max_utf16=3999`,
`max_chars=3601`) is the case that separates the two and confirms the correct
unit is used — counting `chars()` would have under-counted by 398 and permitted
an over-length bubble.

Why 4000 is a hard ceiling and not an average, from the arithmetic at
`telegram.rs:612–642`:

- Single part (`:618-619`): `limit = 4000 − prefix_utf16 − 1`, emitted as
  `{prefix} {text}` ⇒ length ≤ `prefix + 1 + limit` = exactly 4000. The
  `at-boundary` probe sits on that equality.
- Multi part (`:626-641`): `budget = limit − width`, each slice ≤ `budget`
  (`split_on_boundary:656` breaks *before* admitting a char that would exceed
  it, and the newline/space boundary is only ever recorded at an index already
  inside budget, `:660-667`) ⇒ part = `prefix + 1 + width + budget` = 4000.
- `width` is reserved as `format!("({n}/{n}) ").len()` — the *widest* numbering —
  so parts with fewer digits in `i` (e.g. `(9/11) `, 7) consume less than the
  reserved 8. Reserved ≥ actual, always. The convergence loop (`:625-636`)
  terminates because `width` only ever grows and shrinking the budget can only
  increase `n`.
- Off-by-one guard: the loop refuses rather than emits when `budget < 2`
  (`:628`), which is also what makes `split_on_boundary` unable to produce a
  zero-length cut and spin forever — a 2-unit budget always admits at least one
  char, even a surrogate pair.

Overlong prefixes fail closed rather than oversized: `checked_sub` at `:612` and
`:627` return the `"sender prefix leaves no room for Telegram text"` refusal
(both `REFUSED` rows above), which `run_once:314-322` acks as
`Outcome::Failed { reason }`. Between 1024 and that ceiling, the context is
dropped first — probed at the exact `PREFIX_LIMIT` boundary:

```
PROBE ctxlen=1009 prefix_units=1024 context_kept=true  parts=4 max_utf16=4000
PROBE ctxlen=1010 prefix_units=1025 context_kept=false parts=3 max_utf16=4000
```

`≤1024` keeps the context, `1025` falls back to the bare tag — matching TS
`boundedSenderPrefix` (`bridge.ts:519-522`, `TELEGRAM_CAPTION_LIMIT = 1024`).
Regression test: `oversized_context_falls_back_to_the_tag`
(`telegram_outbound_tests.rs:333-350`).

## 2. Tag first on EVERY part, including 2..n — yes

`prefixed_text_parts` has exactly two emission sites and `{prefix}` leads both:
`telegram.rs:619` (single) and `telegram.rs:641`
(`format!("{prefix} ({}/{n}) {slice}")`, i.e. tag *before* the numbering).
`tag_first_all=true` on every probe row above is the measured confirmation.

Tests:
- `telegram_outbound_tests.rs:326-330` — for all 11 parts of a 20,000-emoji body:
  `assert!(part.starts_with(&format!("[pij-sender] ({}/11) ", i + 1)))`.
- `telegram_outbound_tests.rs:203-209` — for every part of the 9,000-char body,
  `strip_prefix("[pij-sender] (i/n) ")` must succeed, which simultaneously pins
  tag-first, numbering, **and arrival order** (the index comes from the order the
  fake API received the bubbles, `Fixture::texts:118-131`) — AC3's ordering
  requirement.

There is one outbound HTTP call site in the whole crate
(`telegram.rs:372`, `grep -rn "sendMessage" crates/ --include=*.rs`), reached
only through `process_send` → `prefixed_text_parts`. No untagged bubble path
exists.

Note for the record: in rs the leading id is operator-facing and TS-compatible,
but rs reply routing does **not** parse it — it binds on the persisted
`BINDING_KIND` record (`telegram.rs:438-455`). The TS comment's "reply parsing
depends on it" is true of TS, not of rs. The ordering requirement is still met;
this only means a regression here would degrade the operator, not break routing.

## 3. Double tag — exact stripped, lookalike preserved

`strip_exact_prefix` (`telegram.rs:591-598`) requires the remainder to be empty
or to begin with a space, applied full-prefix-first then tag
(`telegram.rs:609-611`) — the same two-step and same separator rule as TS
`normalizeSenderContent` / `stripExactLeadingPrefix` (`bridge.ts:529-539`).

Both cases are pinned in the table at
`telegram_outbound_tests.rs:153-189`:

- **Exact tag** — `("/work/my-repo", "[pij-sender] hello")` → `"[pij-sender] [my-repo] hello"` (`:167-171`).
- **Exact tag + context** — `("/work/my-repo", "[pij-sender] [my-repo] hello")` → unchanged `"[pij-sender] [my-repo] hello"` (`:172-176`).
- **Tag-like, not exact** — `("/work/my-repo", "[pij-sender]suffix")` → `"[pij-sender] [my-repo] [pij-sender]suffix"`; the lookalike stays body content (`:177-181`).
- **Another seat's tag** — `("", "[someone-else] hello")` → `"[pij-sender] [someone-else] hello"` (`:182-186`).
- **Body is exactly the tag** — `("[pij-sender]")` → `"[pij-sender] [my-repo] "` (`:176`), matching TS's `if (text === prefix) return ""`.

## 4. AC5a honesty — decodable per part, retry intact, duplicate stated

**Spine record: `telegram.outbound-delivery-failed`** (`telegram.rs:21`,
appended at `:413-424`), written at seat **`pij-telegram-chat-<chat_id>`**
(`conversation_seat`, `:679-681`). Payload (`:403-412`) carries `conversation`,
`from`, `msg_id`, one-based `attempt` (`job.attempt + 1`), **one-based `part`
(`index + 1`)**, `parts` (total), `http_status` (`null` on transport failure)
and a token-free `reason`. The same JSON is the returned adapter message
(`:432-435`), so the failure is decodable from the queue side too; a spine-write
failure adds `persistence_error` rather than being swallowed (`:426-428`).

Per-part identification is asserted, not assumed:
`failed_later_part_stops_and_preserves_whole_job_retry`
(`telegram_outbound_tests.rs:232-249`) fails part 2 of 3 and
`assert_failure(&f, 2, 3, Some(400))` pins `part == 2`, `parts == 3`
(`:251-271`).

**Retry still works, and the policy is unchanged.** `SendOutcome::Retry` →
`queue.retry(id, 100ms)` (`telegram.rs:310-313`) is byte-for-byte the behaviour
on `main` (`git show main:crates/sidecars/src/telegram.rs`, the
`Err(error) => return SendOutcome::Retry(error)` arm). The same test then
advances the clock and asserts the retry **succeeds and acks `Outcome::Done`**.
`assert_failure:265-270` additionally pins "no ack on failure, exactly one
retry".

**The duplicate-bubble consequence is stated, not silently fixed.** The same
test asserts `f.texts().len() == 5` — "two attempted parts plus three on retry"
(`:243-248`), i.e. the test *encodes* the duplication rather than hiding it. It
is stated in `report.md:97` under "Known consequence and proof ceiling" and in
operator docs at `docs/how/pij-telegram.md:24-25`. Correct call: per-part
idempotency is a different change and would have been scope creep here.

**Strengthening not claimed in the plan, worth recording**: on `main`, a Telegram
`{"ok": false}` served with HTTP 200 was treated as success — the job acked
`Done` and a reply binding was written for a bubble that never appeared. That is
now a failure (`telegram.rs:392-398`), pinned by
`ok_false_is_not_a_successful_send` (`telegram_outbound_tests.rs:224-230`). This
closes a silent-loss path AC5 did not name.

## 5. AC8 seam — one implementation

`resolve_send_body` (`crates/cli/src/main.rs:1418-1444`) is the single body
resolver. Three references total
(`grep -rn "resolve_send_body" crates/ --include=*.rs`): the definition, `pij
send` at `:902`, and `sidecar telegram` at `:589`. Both call sites pass
`(body, body_file)` unchanged; `-` routes to stdin at `:1421-1430`, a path to
`std::fs::read_to_string` at `:1431-1434`, and neither transforms bytes.

Clap exclusions are symmetric and declared on both subcommands:
`send` at `main.rs:264-268` and `sidecar telegram` at `main.rs:513-517`, each
with `conflicts_with` in **both** directions plus `allow_hyphen_values` on
`--body`. Test: `telegram_body_sources_are_mutually_exclusive`
(`main.rs:2300-2314`) asserts `ErrorKind::ArgumentConflict`, i.e. the refusal
lands **before stdin is read** — the right place for it.

Byte-exactness is proved end to end, not by inspection:
`crates/cli/tests/spawn.rs:791-824` writes a body containing `"quoted"`,
`'single'`, `$(not-a-command)`, a backtick literal, a trailing backslash,
embedded newlines and `café 🙂` (× 80), runs the **shipped binary** through the
private authenticated daemon router for both `--body-file <path>` and
`--body-file -`, then asserts on the queued payload:

```rust
assert_eq!(payload["body"].as_str().expect("body").as_bytes(), telegram_body.as_bytes());
```

Byte comparison, both input modes, real CLI process. Verified green:
`cargo test --offline -p pij-cli --test spawn shipped_cli_registers_sends_reads_acks_and_does_not_read_twice` → `1 passed`.

## 6. Per-AC guard tests, and two proved by reverting

Baseline first, in the throwaway worktree, clean tree:
`cargo test --offline -p pij-sidecars` → **16 passed / 0 failed** (unit) and
**10 passed / 0 failed** (integration).

| AC | goes RED if the behaviour is removed | location |
|---|---|---|
| AC1 tag first | `tag_is_first_for_an_unknown_sender` | `telegram_outbound_tests.rs:143-150` |
| AC2 context from folder | `context_and_exact_leading_tags_are_normalized` (rows `/work/my-repo/`, `""`, `/`) | `:153-166` |
| AC2 bounded prefix | `oversized_context_falls_back_to_the_tag` | `:333-350` |
| AC3 budget + order + losslessness | `long_body_is_numbered_ordered_and_lossless_with_prefix_in_budget` | `:191-214` |
| AC3 boundary preference + digit growth | `chunk_boundaries_prefer_newlines_and_numbering_accounts_for_digit_growth` | `:303-331` |
| AC4 no double tag | `context_and_exact_leading_tags_are_normalized` (rows `[pij-sender] …`, `[pij-sender]suffix`, `[someone-else] …`) | `:167-186` |
| AC5a decodable per-part failure | `rejected_send_is_retried_with_decodable_spine_evidence`, `ok_false_is_not_a_successful_send`, `failed_later_part_stops_and_preserves_whole_job_retry`, `transport_failure_records_each_attempt_without_leaking_the_token` | `:216-249`, `:273-301` |
| AC8 shared resolver | `telegram_body_sources_are_mutually_exclusive`, `shipped_cli_registers_sends_reads_acks_and_does_not_read_twice` | `main.rs:2300-2314`, `spawn.rs:791-824` |

**Revert proof A — the chunk budget.** In `/tmp/p146`, `telegram.rs:612` changed
from `TEXT_LIMIT.checked_sub(prefix.encode_utf16().count() + 1)` to
`TEXT_LIMIT.checked_sub(0)` — i.e. the prefix stops being charged against the
budget, the classic off-by-prefix that ships a rejected message:

```text
test telegram::outbound_tests::chunk_boundaries_prefer_newlines_and_numbering_accounts_for_digit_growth ... FAILED
test telegram::outbound_tests::long_body_is_numbered_ordered_and_lossless_with_prefix_in_budget ... FAILED
panicked at crates/sidecars/src/telegram_outbound_tests.rs:203:9: budget includes sender and numbering
test result: FAILED. 14 passed; 2 failed
```

**Revert proof B — the tag-first rule.** In `/tmp/p146`, the two emission sites
changed to put the tag last (`"{text} {prefix}"` at `:619`) and after the
numbering (`"({i}/{n}) {prefix} {slice}"` at `:641`):

```text
test telegram::outbound_tests::tag_is_first_for_an_unknown_sender ... FAILED
test telegram::outbound_tests::context_and_exact_leading_tags_are_normalized ... FAILED
test telegram::outbound_tests::long_body_is_numbered_ordered_and_lossless_with_prefix_in_budget ... FAILED
test telegram::outbound_tests::chunk_boundaries_prefer_newlines_and_numbering_accounts_for_digit_growth ... FAILED
test telegram::outbound_tests::oversized_context_falls_back_to_the_tag ... FAILED
test result: FAILED. 11 passed; 5 failed
```

Restored (`git checkout -- crates/sidecars/src/telegram.rs`, tree clean) and
re-verified green: **16 passed / 0 failed**, plus the AC8 CLI test `1 passed` and
`telegram_body_sources_are_mutually_exclusive` `1 passed`. The throwaway
worktree was then removed.

---

## Findings, ranked

### Degrades a control
None.

### Obscures information

**F1 — the `TEXT_LIMIT` comment attributes a margin to TS that TS's text path
does not use.** `crates/sidecars/src/telegram.rs:22` says "Match the TS bridge's
margin below Telegram's 4096-character hard cap" for `TEXT_LIMIT = 4000`. TS's
text path does not use `chunk.ts`'s 4000 default: `prefixedTextParts`
(`bridge.ts:524-527`) computes `budget = TELEGRAM_TEXT_LIMIT(4096) −
prefix.length − 1` and passes it as `chunk`'s `limit`, so a TS bubble reaches
**exactly 4096 with zero margin**. rs at 4000 is strictly safer — the divergence
is in the right direction and nothing behavioural is wrong. The cost is that a
future reader who trusts the comment will believe TS also capped at 4000 and may
"restore parity" by raising rs to 4096, removing the only margin. Suggested
wording: *"4000, not TS's `4096 − prefix − 1` (bridge.ts:525, zero margin): keep
96 units of headroom under the hard cap."* Shown by
`sed -n '519,527p' .pi/extensions/pij/telegram/bridge.ts`.

**F2 — the one terminal outbound failure class that leaves no spine record.**
An unsendable prefix (`telegram.rs:613-617`) returns `SendOutcome::Terminal`,
which `run_once:314-323` acks as `Outcome::Failed { reason }` plus a stderr line
— decodable, but it does **not** append `telegram.outbound-delivery-failed`, so
an operator auditing outbound failures on the spine sees nothing for this class
while every HTTP/API failure is there. AC5 speaks of a "rejected or failed
`sendMessage`" and this is a pre-send refusal, so it is within the letter of the
AC, and it inherits the same shape as the pre-existing wrong-chat refusal
(`telegram.rs:347-355`, unchanged from `main`) — so this is not a regression.
Reachability is negligible: the probe shows it needs a seat id near 4000 chars
(`PROBE prefix-huge-tag: REFUSED`), and real seat ids are `pij-<adjective>-<animal>`.
Recording it so the asymmetry is a known choice rather than an oversight.

**F3 — context enrichment can defer a send on a registry error.**
`telegram.rs:356-359` maps a `Registry::get` error to `SendOutcome::Retry`,
whereas AC2 asks that an unresolvable sender "emit the bare tag and do NOT fail
the send". The AC's literal cases are honoured (unknown seat → `Ok(None)` → bare
tag, proved by `tag_is_first_for_an_unknown_sender`; empty and `/` folders →
bare tag, `telegram_outbound_tests.rs:160-166`); only the *error* case diverges,
and it defers rather than drops. It is also effectively unreachable in the
shipped composition: registry, spine and queue share **one** pool over one
SQLite file (`crates/daemon/src/lib.rs:261-295`), so a `Registry::get` failure
implies the pool that just served `queue.claim` is broken and nothing would have
been claimed to send. No change requested; noting it so a future split of the
pools revisits this line rather than inheriting it.

## Proof ceiling carried forward (not a defect of this change)

No Telegram API or production bridge send was exercised, by design — AC7 was
relaxed by the prime and the live proof is the prime's. `TelegramConfig::api_root`
is injectable only from Rust, while `TelegramConfig::load` hardcodes the public
root, so a scratch credential file alone cannot point an isolated daemon at a
stub. `report.md:18` and `docs/how/pij-telegram.md:28-31` both state this plainly
rather than implying coverage. The coder's proposed follow-up — make the API root
injectable from the same explicit configuration boundary as the credential path,
then add an isolated-daemon-to-stub smoke scenario (`report.md:105`) — is the
right next step and is correctly left out of 146.
