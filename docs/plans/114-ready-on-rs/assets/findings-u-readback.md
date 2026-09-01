# Findings — u-readback (plan 114, wave 2)

Coder `pij-loyal-roadrunner`, branch `s114/u-readback`, 2026-09-01.
Code deliverable: `c61a62e4` — rs `state <id>` (POST `/v1/state`).
This file is the OTHER deliverable: the `tail` consumer inventory that makes any
future decision to route `tail` a deliberate act with known blast radius.

**The ac-1145 ruling is NOT re-opened here.** No rename; rs keeps `tail` (daemon
events), TS keeps `tail` (peer transcript), the shim denies `tail` from routing.
This unit implemented nothing that makes rs advertise `tail`. The inventory is
the record, not a proposal.

---

## 1. Four senses of one spelling

The plan and the ack both describe two. There are four. The third and fourth are
not CLI verbs, which is exactly why they are the ones a reader trips over.

| # | sense | object | where |
|---|---|---|---|
| 1 | TS `pij tail <id>` | a peer's **transcript** | parse `.pi/extensions/pij/core/cli.ts:1248`; execute `:3587`; follow loop `.pi/extensions/pij/cli.ts:978`; bound-session path `cli.ts:4535` |
| 2 | rs `pij-rs tail` | daemon **event + peer-state frames** | clap `crates/cli/src/main.rs:188` (doc: "Follow daemon event and peer-state frames"); execute `:483`; wire `crates/cli/src/client.rs:213` over `GET /v1/events` |
| 3 | rs `Spine::tail(seat, since)` | the durable **event spine**, as a store port | `crates/core/src/ports.rs:77`; consumed `crates/core/src/report.rs:240` and across `crates/testkit/src/contract.rs:160,201,219,249,255`, `fakes.rs:208,302` |
| 4 | `pij bg tail <job>` | a bounded **log snapshot** of a detached job | `~/.agents/skills/pij/references/00-routing.md:149,161` |

Sense 3 is the one an rs-side reader hits FIRST when grepping the Rust tree, and
it is not a verb at all. Sense 4 lives only in the skill docs and has no relation
to either daemon.

## 2. Consumers of sense 1 (TS peer transcript)

**Installed skill tree** — `~/.agents/skills/pij` → `pij/skills/pij` (tracked in
this repo; read-only for this unit, ac-1146 forbids editing it). 13 sites, ALL
TS-transcript semantics:

`SKILL.md:40,45` · `references/00-routing.md:37,44,50,131,142,149,156,161` ·
`references/routes/peer.md:6,17,101,130,155` · `routes/agent.md:52` ·
`routes/skill.md:42` · `routes/delegate.md:78` · `routes/ready.md:45`.

(`00-routing.md:149,156,161` are sense 4, `pij bg tail` — counted here only
because they share the word in the same document.)

**In-repo code.** Implementation and per-harness readers:
`core/harness/claude.ts:35,43` · `copilot.ts:18,92,103` · `codex.ts:19,109` ·
`core/binding.ts:85` (codex rollout path).
Callers and renderers: `telegram/commands.ts:176` (the `/tail` bot command) and
`:118` (mirrors tail's renderer) · `core/chores/cli-verbs.ts:312` (verb roster) ·
`core/cli.ts:665-666,3387` (receipt hints) · `adapters/fs-registry.ts:391,952` ·
`core/archive.ts:21` · `core/types.ts:251,256`.

**Two sites that matter more than their count suggests**, because they do not
merely USE the verb — they hand it to somebody:

- `.pi/extensions/pij/core/message.ts:130` — the peer-observation line injected
  into **every peer's boot packet**: *"pij tail <id> / pij state <id> (watch
  one)"*. Every seat on the fleet is told this verb by name at boot.
- `.pi/extensions/pij/cli.ts:2573` (spawn) and `:4061` (dispatch) — human lines
  that tell an operator `track: pij state <id> · pij tail <id>`.

**Blast radius if `tail` were ever routed:** none of these would ERROR. Every one
of them would quietly receive daemon event frames where it asked for a
transcript. That silence is the whole reason the deny list exists.

## 3. THE FALSE FRIEND THAT SURVIVES ac-1145 ENTIRELY

`crates/cli/src/main.rs:909`:

```rust
Command::Tail { .. } => "pij tail",
```

rs **labels its own envelopes** `"pij tail"`. So an rs event-stream refusal
already emits the TS verb's name against the rs object, in the `command` field
of a pij envelope, **with no shim involved and no routing decision taken**.

The deny list governs **routing**. It cannot reach a **label**. ac-1145 is
therefore silent on this instance, and always was: nothing in the plan, the ack,
or wave 1 records it. A human reading an rs receipt — or a log scraper keyed on
`command` — sees `pij tail` and has no way to tell which object produced it.

Not fixed here: renaming rs's own envelope label is a change to rs's public
receipt vocabulary, which is out of this unit's bounds. Recorded so it is a known
edge rather than a discovery.

## 4. Method warning — how the inventory can silently come back empty

Stated in its **corrected** form. My first version of this warning was wrong in a
way that would make someone distrust a correct command; the PM measured it.

- `grep -r <the symlink itself>` → **5 hits**. `-r` DOES follow a symlink given
  **as the argument**.
- `grep -r <the parent directory>` → **0 hits**. `-r` does NOT follow a symlink
  **encountered during recursion**.
- `grep -R <the parent directory>` → **5 hits**.

So the trap is about the symlink being **encountered during recursion**, not
about `-r` versus `-R` per se. `~/.agents/skills/pij` IS a symlink, so a sweep
rooted at `~/.agents/skills/` returns a confident, clean-looking **zero**. It did
for me on the first pass of this very inventory.

For ac-1146 arm B: the PM's tree hash used `find -L`, which follows, so the
recorded `04e9a319…` is sound — re-verified rather than assumed.

## 5. Delivery failure mode 3 — the wedged composer, and the recovery gesture

My pane wedged **twice** during this unit. The recurrence is part of the record.

Messages ARRIVED, sat unsubmitted in the composer (*"Press up to edit queued
messages"*), and I sat idle while three PM broadcasts went unread — the seam
state, the rulings, and the item-3 drop. Meanwhile `pij state` read
`done · active`, which reads as "finished".

**Recovery gesture, verbatim:**

- Enter alone: did **not** submit.
- Up: loaded the queued text into the composer, but Enter **still** did not
  submit.
- Escape to clear, then `tmux send-keys` with literal text + Enter: **worked
  immediately**.

**Two rules it produced:**

1. **Converge on the ARTIFACT, not the surface.** The branch told the truth — six
   modified files, nothing committed — when the pane, `pij state`, and the send
   receipts all agreed with each other and were all wrong. Mutually agreeing
   surfaces are not corroboration when they are all downstream of the same
   wedge.
2. **`done` from a seat that has never sent a receipt is SUSPECT, not complete.**
   The absence of any receipt is the discriminator; the state word is not.

Filed by o-prime as delivery failure mode 3 on PRD req-0012 — distinct from
never-bound and from `--task`-dropped-at-spawn, because it is invisible from
BOTH ends. Tied to `DeliveryOrigin` (`crates/core/src/model.rs:547-556`): bytes
into a composer are `InjectedToTransport`, and only a reader-read class origin
may be reported as reaching the agent.

## 6. Contract flaws raised at the seam (all five ruled by the PM)

Recorded here only as pointers; the rulings live in the PM's broadcasts and the
amended plan.

| id | finding | outcome |
|---|---|---|
| S1 | a GET route row carries NO arguments — `pij state <id>` reached rs with the id dropped (`adapters/generation-router.ts:199-207`) | RULED: POST canonical. Built POST-only. u-identity's F-U6 (a pane id starts with `%`) independently confirms the body over a query string |
| S2 | follow-the-seat keys on the AMBIENT seat (`generation-router.ts:152,274`), but `state <id>` is a CROSS-SEAT read — `pij state <legacy-id>` from an rs seat would exit 4 | CONFIRMED; shim-side, now item 5 of the seam unit. Deliberately NOT papered over with a 200-and-null, which would launder a miss into a hit |
| S3 | "the shim ASKS rs what it serves" is false on tree — `RS_ROUTE_TABLE` is a 5-row literal; the only asking is per-call classification of an empty-bodied 404 | CONFIRMED; impl-guide re-frozen v3, ac-1145's stated reason corrected. A verb WITHOUT a row is `legacy-unrouted` forever — wave 3's rows are hand-added |
| S4 | the tail inventory | this document |
| S5 | the grep/symlink trap | §4, in its corrected form |

## 7. Open, not claimed

- **The shipped-CLI e2e test has no receipt.** `shipped_cli_reads_one_seat_state_back_from_the_real_store`
  (`crates/cli/tests/spawn.rs`) is committed but its run was interrupted twice by
  the pane wedge before completing. The 8 daemon HTTP tests and `-p pij-cli` are
  green at bare exit 0; **`pij-gate` has not been run on this branch.** Neither is
  claimed green.
- **rs `state` is a WEAKER claim than TS `state` in one place, by design.** rs
  cannot compute `stale` (no `lastEventAt` on the descriptor; deriving it is a
  full spine scan per single-row read), so an rs `active` covers both the TS
  `active` and the TS `stale` case. Named in the card's `unsupported[]` rather
  than silently differing.
- **`recycled` is a fifth liveness word** the TS vocabulary does not have
  (`core/state.ts:48-57` yields active/stale/dead; `cli.ts:6073` adds
  dissolved). Emitted deliberately: `dead` would be the nearest existing word for
  a claim rs does not make, and `active` would be the recycled-pid bug. A
  consumer that does not know the word gets something it must handle, rather than
  something it would wrongly trust.
