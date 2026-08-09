# Spike: can the XOR be a top-level union?

**s099** · `pij-reasonable-dove` · recorded before implementing, per the open risk in
`criteria.md`.

## Question

`criteria.md` recorded an open risk: the natural encoding is
`Type.Union([Type.Object({to, message}), Type.Object({to, command})])`, but `registerTool` may
require `type: "object"` at the root. If it does, the fix may not fit inside this stream's fence.

## Finding 1 — the TYPE layer permits it. This is a "can" claim from the declaration.

`node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:335`:

```ts
export interface ToolDefinition<TParams extends TSchema = TSchema, ...> {
  /** Parameter schema (TypeBox) */
  parameters: TParams;
}
```

The bound is **`TSchema`, not `TObject`**. A `Type.Union(...)` produces a `TUnion`, which extends
`TSchema`, so a top-level union **type-checks**. Nothing in the host's declared interface demands
an object at the root.

**That is not permission to ship it.** The declaration constrains what compiles, not what the
provider accepts.

## Finding 2 — the WIRE format is the real constraint, and it points the other way

Tool-calling APIs require the parameter schema to be an object at the root — Anthropic's
`input_schema` and OpenAI-style `parameters` both do. A top-level `anyOf`/`oneOf` with no
`"type": "object"` is very likely rejected or silently mangled downstream.

This matters more than usual for **this** issue: #166 is *already* a dispute about a schema being
rendered to the model differently from how it was registered. Shipping a root shape that is
unusual for the wire format is the worst possible change to make while that question is open —
it would confound the very thing s099 exists to make unambiguous.

**Not measured.** I have not captured a provider payload, so this is reasoning from the format's
requirements, not an observation. It is the reason to prefer the fallback, not a proof that the
union fails.

## Decision — take fallback (a): `oneOf` on an object schema

Keep `type: "object"` at the root, express exclusivity as a sibling constraint:

```jsonc
{
  "type": "object",
  "properties": { "to": {...}, "message": {...}, "command": {...} },
  "required": ["to"],
  "oneOf": [
    { "required": ["message"], "not": { "required": ["command"] } },
    { "required": ["command"], "not": { "required": ["message"] } }
  ]
}
```

This makes `{to}` and `{to, message, command}` **schema-invalid** — the C2/C3 claims — while the
root stays the shape every provider expects. It is the smallest change that satisfies the
criteria, and it stays inside the fence: the registration schema in
`.pi/extensions/pij/index.ts`, nothing in `core/message.ts` or the send dispatch.

**No prime ruling needed.** The fence holds; splitting the tool is not required.

## The next unknown, and it is now the load-bearing one

**Does anything between `registerTool` and the model strip unrecognised JSON Schema keywords?**
If `oneOf` is dropped in transit, the fix compiles, serialises correctly at the registration
boundary, passes every test that inspects `send.parameters` — **and changes nothing the model
sees.** That is precisely the shape of a criterion that cannot fail: green at the boundary,
inert on the wire.

**So C1 must not be asserted at the registration boundary alone.** Registration-boundary
assertions are exactly what #166 has already proved insufficient — the whole issue is a
divergence between what is registered and what is displayed.

Resolve by observation, not by argument: the parked pi seat `pij-tasty-gabriel` can read its own
rendered `pij_send` definition after the change and report whether the exclusivity survived,
the same method that produced the PROBE-1 evidence in `166-investigation.md`. Canary-verify
first; the seat has been idle and compacted.

If `oneOf` does **not** survive to the model, the finding is that no schema-level fix can reach
the model on this stack, and the tool-splitting option becomes the only structural remedy — which
**is** outside the fence and would need a prime ruling. Recorded now so that outcome reads as a
measured result rather than a late scope change.
