# Workshop: Inbox CLI Layout

**Type**: CLI Flow
**Plan**: 041-pij-inbox-no-tmux
**Spec**: [pij-inbox-no-tmux-plan.md](../pij-inbox-no-tmux-plan.md)
**Created**: 2026-07-12T10:55:00+10:00
**Status**: Approved

**Value Thesis**: A grouped inbox namespace plus ambient native-session identity
makes pij usable from any agent shell without setup commands, tmux inference, or
persisted shell exports.
**Target Proof Level**: Implementation Ready
**Current Proof Level**: Implementation Ready

**Selected Value Axes**:
- **Operator Usability**: the shortest command handles the common receive path.
- **Agent Readiness**: every invocation can identify its own native agent session.
- **Implementation Readiness**: grammar, resolution order, outputs, and errors are
  fixed before CLI code changes.
- **Migration Safety**: existing top-level verbs and tmux push behavior remain valid.
- **Review Compression**: tests can assert one command table and one identity resolver.

**Related Documents**:
- [research-dossier.md](../research-dossier.md)
- [preamble-checkpoint.md](../preamble-checkpoint.md)
- [pij-inbox-no-tmux-plan.md](../pij-inbox-no-tmux-plan.md)

**Domain Context**:
- **Primary Domain**: `pij-messaging`
- **Related Domains**: `pij-control-plane`, `pij-skill`

---

## Purpose

Define the CLI hierarchy and self-resolution contract for pull inboxes. The
design must make the no-tmux path feel native while preserving every existing
push path and durable native-identity guarantee.

## Fresh Entrant Outcome

A fresh implementer can build the parser, self-registration, and output contracts
without choosing names, precedence, or identity behavior.

They can:

- implement the exact command grammar and aliases;
- resolve the current agent session without tmux or shell mutation;
- distinguish first-use auto-registration from explicit registration;
- write deterministic human/JSON/error tests.

## Key Questions Addressed

- Which noun owns inbox operations?
- Which subcommands ship in v1?
- What does bare `pij inbox` do?
- How does a no-tmux process identify and register itself?
- Does registration require `--harness`, `--session-id`, or `PIJ_SESSION_ID`?
- How do later `pij` commands resolve self in fresh subprocesses?

---

## Governing Concept: Ambient Native Session Identity

**Definition**: an agent's tool shell carries a harness-native session identifier
on every command invocation. pij treats `(harness, nativeSessionId)` as the
authoritative join key and `pij-id` as its durable friendly alias.

This is not a new identity model. pij already persists the two-way binding as its
**durable native identity** contract; Plan 041 exposes the current-session signal
uniformly without a tmux pane.

| Harness | Ambient current-session signal | Existing pij use | Validation |
|---------|--------------------------------|------------------|------------|
| pi | Extension API `ctx.sessionManager.getSessionId()`; extension exports `PIJ_SESSION_ID` into child shells | Pi self-registers and stores `harnessSessionId` | `index.ts:220-310`; pi-mono `SessionManager.getSessionId()` |
| Claude | `CLAUDE_CODE_SESSION_ID` | Adopt/phonehome binding and durable join | `binding.ts:51-62,123-142`; installed Claude 2.1.207 binary embeds the variable |
| Copilot | `COPILOT_AGENT_SESSION_ID` | Validated current-session adoption/phonehome | `core/harness/copilot.ts:51-89`; live session env matched parent `--session-id 6e470b55-…` |
| Codex | `CODEX_THREAD_ID` | Durable joins exist, but adopt currently discovers rollout files instead of reading the ambient variable | OpenAI Codex source `codex-rs/core/src/exec_env.rs` injects it; `process_manager.rs` sets it from `context.session.thread_id` |

**Live process proof**: the workshop's Copilot shell had `PPID=68561`; that parent
command was the long-lived Copilot binary carrying
`--session-id 6e470b55-8474-49d7-87ce-50a325420d64`, equal to
`COPILOT_AGENT_SESSION_ID`.

**Regression proof**: the existing native-identity suites passed 86/86:

```text
binding.test.ts                   36 passed
harness/copilot.test.ts           11 passed
harness/codex.test.ts             17 passed
discovery.test.ts                 22 passed
```

**Gap confirmed**: `resolvePhonehomeSessionId()` handles Claude and Copilot only.
Codex still takes the transcript-discovery path even though `CODEX_THREAD_ID` is
available to every tool command. Plan 041 generalizes the resolver; it does not
invent another identifier.

## Command Summary

| Command | Purpose |
|---------|---------|
| `pij inbox [--wait [ms]] [--json]` | Alias of `pij inbox check`; auto-register, claim, print, and mark unread messages. |
| `pij inbox check [--wait [ms]] [--json]` | Explicit form of the pull receive operation. |
| `pij inbox register [--json]` | Idempotently materialize/show the current ambient native identity's pij binding. |
| `pij adopt --current [--json]` | Compatibility alias of `pij inbox register`; no pane or harness flag required. |

No top-level `pij check`, `pij mail`, or separate `pij inbox wait` ships.

## CLI Tree

```text
pij
├── inbox
│   ├── (default)  → check
│   ├── check      [--wait [ms]] [--json]
│   └── register   [--json]
└── adopt
    ├── <pane> --harness <h> ...   existing tmux path
    └── --current [--json]         alias → inbox register
```

The namespace leaves room for later `list`, `history`, or `gc` verbs without
claiming them in v1.

## Self-Resolution Contract

Every `pij` command that needs "self" uses this order:

```text
1. PIJ_SESSION_ID is set and maps to one descriptor
   └─ return that pij-id

2. Detect ambient native identity
   ├─ CLAUDE_CODE_SESSION_ID  → (claude, value)
   ├─ COPILOT_AGENT_SESSION_ID→ (copilot, validated UUID)
   ├─ CODEX_THREAD_ID         → (codex, validated native id)
   └─ none / more than one    → continue or E-AMBIG

3. Reverse-resolve exact (harness, nativeSessionId) in durable registry
   ├─ one match  → return its pij-id
   ├─ many       → E-AMBIG (corrupt join; never choose)
   └─ zero       → only `pij inbox*` may auto-register

4. Existing compatibility fallbacks
   ├─ registered $TMUX_PANE
   ├─ lone descriptor in cwd
   └─ E-AMBIG with the register guidance
```

Pi normally resolves at step 1 because its extension exports `PIJ_SESSION_ID`.
External agents resolve at steps 2–3 on every fresh subprocess. No `eval`, shell
profile mutation, or cwd-current pointer is required.

## Auto-Registration Contract

`pij inbox` and `pij inbox check` run `ensureCurrentRegistration()` before reading:

```text
ambient identity already bound
  → reuse descriptor; refresh replaceable runtime presence

ambient identity not bound
  → atomically reserve/claim one memorable pij-id
  → write descriptor:
       harnessSessionId = ambient native id
       harness          = detected harness
       deliveryMode     = pull
       lifecycle        = bound
       folder           = cwd
       pid              = long-lived parent agent pid when identifiable
  → continue to check
```

The native tuple owns identity. Parent process metadata is replaceable
observability, never the source of identity and never a reason to reject durable
mailbox delivery.

`pij inbox register` performs the same ensure operation but stops after reporting
the binding. `pij adopt --current` is a parser alias to that operation, not a
second implementation.

## Check Flow

```text
$ pij inbox

ensure current registration
        │
        ▼
claim every unread non-receipt message in lexical id order
        │
        ├── none + no --wait ──→ "(no unread messages)"
        │
        ├── none + --wait ─────→ block; no default deadline
        │                         optional ms = finite deadline
        │
        └── ≥1 ────────────────→ print all claimed messages
                                  emit delivered receipts
                                  exit 0
```

The exclusive read-marker creation is the claim. Two concurrent checkers cannot
both print the same message.

## Human Output

### Empty

```text
$ pij inbox
(no unread messages)
```

### Messages

```text
$ pij inbox
[pij from pij-calm-ibis] review docs/plans/041/…
[pij from pij-bright-otter] done — report at /path/to/report.md
2 message(s) read
```

### Waiting

```text
$ pij inbox --wait
waiting for pij inbox messages…
[pij from pij-calm-ibis] review docs/plans/041/…
1 message read
```

### Finite timeout

```text
$ pij inbox check --wait 5000
waiting for pij inbox messages (timeout 5000ms)…
(timeout; no unread messages)
```

Timeout is a successful empty observation (`exit 0`), matching send-wait's
non-failure timeout posture.

## JSON Output

```json
{
  "self": "pij-concrete-reptile",
  "messages": [
    {
      "messageId": "1752270000000-000001-1234",
      "from": "pij-calm-ibis",
      "body": "review docs/plans/041/…",
      "command": null,
      "attachments": [],
      "readAt": "2026-07-12T00:55:00.000Z"
    }
  ],
  "timedOut": false
}
```

`readAt` is marker metadata for observability; marker existence is authoritative.
Receipt envelopes never appear in `messages`.

## Register Output

```text
$ pij inbox register
registered pij-concrete-reptile ↔ copilot session 6e470b55-8474-49d7-87ce-50a325420d64 (pull)
```

Idempotent repeat:

```text
$ pij inbox register
registered pij-concrete-reptile ↔ copilot session 6e470b55-8474-49d7-87ce-50a325420d64 (pull; existing)
```

## Error Contract

| Code | Condition | Human message |
|------|-----------|---------------|
| `E-ARG` | Unknown inbox subcommand/flag or invalid wait milliseconds | Usage for `pij inbox [check|register]`. |
| `E-AMBIG` | More than one ambient harness identity, duplicate native joins, or no exact self among multiple fallbacks | Name the conflicting signals/ids; never guess. |
| `E-NOID` | A non-inbox self-requiring verb has an ambient identity but no registration | `current <harness> session is not registered; run pij inbox register`. |
| `E-NOREG` | Registry root is absent for a command that cannot auto-create it | Existing contract; inbox registration may create the root. |

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Top-level `pij check` | One short verb | Matches wishlist literally | Pollutes top-level surface; no home for future inbox operations | Rejected |
| `pij mail` | Mailbox metaphor | Familiar noun | Less aligned with existing `inbox/` storage and message terminology | Rejected |
| `pij messages` | Generic message namespace | Explicit | Verbose; overlaps send/tail/event concepts | Rejected |
| `pij inbox check` + bare alias | Grouped namespace; shortest path remains short | Matches storage/domain; extensible | One extra parser level | **Selected** |
| Explicit registration first | `register`, then `check` | Simple state transition | Unnecessary setup; agents already expose identity every command | Rejected |
| Auto-register on first check | Ensure binding, then read | Zero setup; pi-like ergonomics | Read command has an idempotent write seam | **Selected** |
| Require exported `PIJ_SESSION_ID` | Registration prints shell exports | Existing resolver works unchanged | Shell-specific and non-persistent across agent tool calls | Rejected |
| Ambient native reverse lookup | Resolve harness env to durable native tuple | No shell mutation; already pij's identity model | Requires Codex resolver addition | **Selected** |

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Implementation | Choose namespace, aliases, registration flags, and identity precedence while coding. | Exact grammar and resolver order are fixed. |
| Review | Infer whether a new identity system was introduced. | Verify reuse of the durable native join and three ambient env adapters. |
| Testing | Invent output/error scenarios. | Human/JSON/error examples are test vectors. |
| Agent execution | Register, export, and remember an id between subprocesses. | Run `pij inbox --wait`; ambient identity resolves every time. |

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| Existing durable native join | `core/binding.ts:144-190`, `docs/domains/pij-control-plane/domain.md:39-61` | No new identity model | Validated |
| Claude ambient id | `CLAUDE_CODE_SESSION_ID`; installed binary; `binding.ts:123-142` | Auto-detect Claude | Validated |
| Copilot ambient id + parent argv equality | live env/process probe; `core/harness/copilot.ts:51-89` | Auto-detect Copilot | Validated |
| Codex ambient id injection | OpenAI Codex `exec_env.rs`, `process_manager.rs` | Replace rollout scan for current-session self resolution | Validated |
| Pi native id | pi-mono `SessionManager.getSessionId()`; `index.ts:220-310` | Existing pi self registration | Validated |
| Native identity regression suite | 86 targeted vitest cases | Preserve exact join semantics | Validated |

## Validation / Acceptance

This workshop is implementation-ready because:

- the namespace and v1 verbs are selected;
- bare command and alias behavior are specified;
- ambient identity is proven for all supported harnesses;
- the resolver precedence and registration side effects are explicit;
- human/JSON/error outputs are concrete test vectors;
- no CLI-layout question remains open.
