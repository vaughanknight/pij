# pij#166 — investigation record

**Stream**: s099 · **Seat**: `pij-reasonable-dove` · **Issue**:
[#166](https://github.com/AI-Substrate/pij/issues/166) · **Date**: 2026-08-08

Consolidated from two machines and two independent probes. Public comments on #166 carry the
same content; this is the fleet-visible copy, per `pij-continuing-ermine`'s ruling that
`scratch/` and GitHub comments are not fleet-visible.

## The report

The native `pij_send` tool becomes unusable for ordinary peer messages: the model-facing
signature presents `message` and `command` as **both required**, while runtime validation
requires **exactly one**. Every attempted message-only call serialised both and was rejected
with `pij_send needs exactly one of `message` or `command`.`

Reported from pi session `pij-selfish-porcupine`, Windows, `C:\src\harness-nucleus`.

**Impact**: the session completed two investigations, wrote both reports, and could deliver
neither completion pointer — session policy forbade falling back to the `pij send` CLI.

## Scope: the extension, not the CLI

| surface | what it is | status |
|---|---|---|
| `pij_send` — native tool registered by the pi extension (`.pi/extensions/pij/index.ts`) | the model-facing tool Pi exposes in-process | where the report lives |
| `pij send` — CLI binary on `$PATH` (`.pi/extensions/pij/cli.ts`) | the shell surface | **unaffected, works correctly** |

The CLI being healthy is why the impact was avoidable: a working fallback existed the whole
time and policy forbade using it.

## What was measured

### Registration boundary — correct on BOTH machines

Building the exact `Type.Object` from `.pi/extensions/pij/index.ts` and serialising it:

```json
{
  "type": "object",
  "required": ["to"],
  "properties": {
    "to":      { "type": "string" },
    "message": { "type": "string" },
    "command": { "type": "string", "enum": ["compact", "new", "reload"] }
  }
}
```

`required` is exactly `["to"]`. Both fields optional. `StringEnum` survives `Type.Optional`
intact, so the custom enum helper is not implicated. The runtime XOR guard in `execute()` is
also correct.

- macOS, this repo, `typebox@1.1.38`, `pi-ai@0.80.6` — measured by dove.
- Windows, failing host, Pi 0.83.0 / `pi-ai@0.83.0` / Node 26.7.0 — measured independently by
  `pij-visible-emu`, loading the real `~/.pi/agent/extensions/pij/index.ts` via Pi's bundled
  `jiti` with a recording `ExtensionAPI`.

**Nobody's schema is wrong.** Both original hypotheses — "the schema is broken" and "the
reported signature was a paraphrase" — are eliminated.

### Live probe on macOS — does NOT reproduce

`pij-tasty-gabriel` (pi, `github-copilot/gpt-5.6-terra`, effort high) read its own tool
definition and confirmed it as **read, not recalled**:

```ts
type pij_send = (_: {
  to: string,
  message?: string,
  command?: "compact" | "new" | "reload",
}) => any;
```

The `?` markers are present. The issue's copy is the same shape without them.

| test | exact JSON emitted | result |
|---|---|---|
| message-only | `{"to":"pij-reasonable-dove","message":"PROBE-1 message-only native call"}` | accepted, `receipt → queued`, **delivered** |
| command-only | `{"to":"pij-tasty-gabriel","command":"compact"}` | expressible; `E-SELF: cannot send to yourself` — a different guard, correct |

**The strongest evidence is not the seat's testimony**: `PROBE-1` arrived in dove's session as a
pushed turn, sent by a native `pij_send` carrying exactly `to` and `message`. The delivery is
the observable.

### Live seat on Windows — DOES reproduce, and the signature was READ

The reporting seat confirmed the quoted signature was a direct reading of its displayed
`functions.pij_send` definition, not recalled API knowledge, with both payload fields shown
non-optional.

**So there is a measured divergence between a correct registered schema and the definition the
model is shown, with no code in either Pi version rewriting `required`** (source-inspected
independently on both sides).

## Open: two uncontrolled variables

| | Pi / pi-ai | model | outcome |
|---|---|---|---|
| macOS | **0.80.6** | `gpt-5.6-terra` | works |
| Windows | **0.83.0** | not stated | both fields shown required |

Both version and model differ, so **nothing isolates the cause**. The controlled experiment is
one variable at a time: same model across both versions, then same version across two models.

**A correction that matters for weighting**: the issue notes the incident predates a Pi update,
which I first read as the failing stack being *older*. It is **newer**. A non-reproduction on
0.80.6 is not a refutation of a defect on 0.83.0, and my "does not reproduce" was posted with
more weight than that.

**Live hypothesis**: nothing in Pi renders `type pij_send = (_: {…}) => any` — that is the
OpenAI `functions` namespace form, so the flattening may occur **server-side in the Copilot
backend** when it converts tools for the model. That would explain correct schemas at both ends
with no offending line in either codebase. It does not explain terra working here, unless the
rendering differs by model or version — which is precisely the pair nobody has held fixed.

**Not closed by argument.** The tiebreaker is a wire capture: if the serialised payload carries
`required: ["to"]` and the model still displays both as required, the mutation is provably
downstream of Pi and the issue moves to the provider. That probe was still running at the time
of writing.

## The finding s099 exists to fix — independent of all of the above

Measured by `pij-visible-emu`, and it stands whichever way the rendering question resolves:

> There is **no** `oneOf`, `anyOf`, `not`, or other structural constraint expressing "exactly one
> of message or command". Both invalid runtime shapes are **schema-valid**:
> `{to}` and `{to, message, command}`. They fail only inside `execute()` at the runtime guard.

**The model is permitted to emit the invalid shape and only told afterwards.** Encoding the
union — or splitting into two tools — makes the invalid state unrepresentable rather than merely
rejected, and closes the recurrence path even if the rendering is fixed upstream tomorrow.

### Why the originally-proposed contract test would have proved nothing

The remediation everyone first converged on was a contract test asserting the emitted `required`
array. **That test would have passed every day this issue has been open, including the day of the
incident** — it asserts a schema that was never wrong. Green while the bug is live, and the green
would be read as coverage.

Guard the **behaviour** (a message-only send arrives) and the **shape** (the invalid combination
is not expressible), never the `required` array alone. A test over a *union* has real content.

## Standing item, independent of the fix

A mandatory native channel with **no sanctioned fallback** turned a tool failure into two
undelivered reports while a working CLI sat unused. That hazard does not depend on this bug's
cause and will outlive it: when the native tool fails, shelling out should be authorised **and
recorded**, so the breakage stays visible rather than being silently routed around.

## Sources

- `scratch/i166-probe-brief.md`, `scratch/i166-probe-result.md` (canonical checkout, gitignored)
- #166 comments: `5224384963`, `5224446136`, `5224525458`, `5224646851` (dove);
  `5224519665` (re-filed report); the two Windows probe comments from prime's seats.
