# s099 — acceptance criteria, labelled, with pre-registered mutants

**Stream**: s099 `send-tool-xor` · **Seat**: `pij-reasonable-dove` · **Issue**: pij#166
**Fence**: the `pij_send` tool **registration schema** in `.pi/extensions/pij/index.ts`.
NOT `core/message.ts`, NOT the send dispatch in `core/cli.ts` — s093 holds those.

**Written BEFORE any implementation and before any pre-fix run.** Nothing in this file was
authored with a result in hand.

## The claim

The registered schema expresses no structural exclusivity between `message` and `command`.
`{to}` and `{to, message, command}` are both **schema-valid** and are rejected only at runtime
inside `execute()`. The model is permitted to emit the invalid shape and told afterwards.

Encoding the XOR structurally makes the invalid state **unrepresentable** rather than merely
rejected — which closes the recurrence path regardless of how the separate rendering question
(#166's version/model confound) resolves. See `assets/166-investigation.md`.

## Criteria

Labelled per the fleet's four kinds. **One criterion, one claim, one observable that changes** —
not assertion arithmetic. Each asserts the *claim*, never the setup that makes the claim
reachable.

| # | criterion | label | red available pre-fix? |
|---|---|---|---|
| C1 | The serialized `pij_send` schema carries a structural exclusivity constraint between `message` and `command` | **BEHAVIOURAL** | yes — absent pre-fix |
| C2 | `{to, message, command}` is **not** schema-valid | **BEHAVIOURAL** | yes — accepted pre-fix |
| C3 | `{to}` alone is **not** schema-valid | **BEHAVIOURAL** | yes — accepted pre-fix |
| C4 | `{to, message}` is schema-valid | **PRESERVED-PROPERTY** | **no — true in both worlds** |
| C5 | `{to, command}` is schema-valid | **PRESERVED-PROPERTY** | **no — true in both worlds** |
| C6 | `execute()` still rejects both invalid shapes at runtime | **PRESERVED-PROPERTY** | **no — true in both worlds** |

**Honest count: three behavioural of six.** C4–C6 are regression guards and are **never
evidence that the fix works** — they are the criteria most likely to be paraded as proof,
because they are the ones that show the tool still working. A table of six green ticks here is
worth exactly three.

**No MUTATION-ONLY criterion.** If one appears, it gets named with the mutant that discharges
it in the same line; a criterion whose mutant cannot be named is not a criterion.

## Which assertion must fire — decided before the run, not read off it

Per s094: a pre-fix red proves only the **first assertion that fired**, and which one fires is
otherwise selected by writing order rather than by anyone's decision.

Each of C1–C3 is therefore **its own test with a single claim-bearing assertion**. No shared
setup assertion (`expect(schema).toBeDefined()`, `expect(exitCode).toBe(0)`) precedes the
claim in any of them — that is the precondition-promoted-to-evidence trap, and splitting alone
does not avoid it.

**Also avoided: the mirror hole.** No whole-object `toEqual` over the serialized schema. That
would be a single assertion proving "the object differs" without identifying which field —
evidence narrowed by *conflating* rather than by *aborting*, and unfindable by counting
assertions. An assertion over a set is not evidence about a member, whether the set is rows or
fields.

## Pre-registered mutation ranking

**Committed before the implementation exists and before any mutation runs**, so the targets
cannot be chosen after seeing which went red. Spec is
`.pi/extensions/pij/index.test.ts` — verified in-process (no `execFileSync`/`spawnSync`/
`execSync`/`execPath`/`child_process`), so the Vite transform reaches it. `--expect "<test
name>"` on every run; without it a flake is indistinguishable from a kill.

| rank | mutant | what it would prove |
|---|---|---|
| **1** | Remove the structural constraint from the schema, leaving both fields optional | that C1–C3 perceive the schema shape at all, rather than passing on some neighbouring property. **Rank 1 because it is the whole claim.** |
| **2** | Neuter the runtime XOR guard in `execute()` while leaving the schema correct | that C6 is load-bearing and not satisfied by the schema change alone. This is the criterion I relabelled from behavioural to preserved-property — **and the reclassification is exactly the moment I stopped examining it**, which makes it a suspect, not a settled item. |
| **3** | Make the constraint accept `{to}` (empty payload) while still rejecting `{to, message, command}` | that C3 is independent of C2 and not riding on the same assertion. Two criteria that always fail together are one criterion. |

## Open risk, recorded before it is resolved

**The host may not accept a top-level union.** The natural encoding is
`Type.Union([Type.Object({to, message}), Type.Object({to, command})])`, but `registerTool` may
require `type: "object"` at the root, and the provider-side rendering that #166 is really about
may handle a union worse than it handles optional fields.

**This is a spike, not an assumption.** If a top-level union is not viable, the fallbacks in
order are: (a) `oneOf` attached to an object schema; (b) splitting into two native tools
(`pij_send` / `pij_control`), which is out of my fence and would need a prime ruling.

**It is possible this stream discovers the fix cannot be made within its fence.** Recording that
now so the finding is not read later as scope creep.
