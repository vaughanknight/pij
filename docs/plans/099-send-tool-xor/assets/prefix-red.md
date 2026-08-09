# PRE-FIX RED — verbatim, captured before any implementation

**s099** · `pij-reasonable-dove` · 2026-08-08

The fleet bar: *run every behavioural criterion against the pre-fix tree and record the failure
output BEFORE implementing.* This is that record. No implementation exists at this commit.

## Result: the labelling was validated by execution, not by argument

| criterion | label | pre-fix | reading |
|---|---|---|---|
| CONTROL | — | **PASS** | the probe reaches a real schema, so the reds below mean something |
| C1 structural exclusivity present | BEHAVIOURAL | **RED** | available to fail, and failed |
| C2 `{to,message,command}` invalid | BEHAVIOURAL | **RED** | available to fail, and failed |
| C3 `{to}` invalid | BEHAVIOURAL | **RED** | available to fail, and failed |
| C4 `{to,message}` valid | PRESERVED | **PASS** | true in the PRE-FIX world — cannot be evidence |
| C5 `{to,command}` valid | PRESERVED | **PASS** | true in the PRE-FIX world — cannot be evidence |

`Tests  3 failed | 3 passed (6)` — **three behavioural of six**, exactly as pre-registered in
`criteria.md` before this run existed.

**C4 and C5 passing here is the point, not a footnote.** They are green on a tree with no fix in
it. Any table presenting them as proof the fix works would be presenting two criteria that were
already true. That is what the label was for, and execution confirmed it rather than my judgement.

## Which assertion fired — recorded, not inferred

A pre-fix red proves only the **first assertion that fired**, and which one fires is otherwise
selected by writing order. Each behavioural test here holds exactly one claim-bearing assertion
and no preceding setup assertion, so the fired assertion IS the claim in every case:

- C2 fired at `index.send-schema.test.ts:70` — the `Value.Check` result, the claim itself
- C3 fired at `:75` — same
- C1 fired on `s.oneOf ?? s.anyOf ?? s.not` being `undefined` — the claim itself

No criterion's red was supplied by a precondition, a fixture, or a crash.

## Scope limit, stated because it is the whole of pij#166

These assertions observe the **registration boundary**. They cannot prove what the model is
shown — the exact surface #166 proved insufficient. C1 is not fully discharged until a live seat
reads its own rendered `pij_send` definition. See `union-spike.md`.

---

```
$ git rev-parse --short HEAD  ->  38432df5
$ npx vitest run .pi/extensions/pij/index.send-schema.test.ts

 ❯ .pi/extensions/pij/index.send-schema.test.ts (6 tests | 3 failed) 7ms
     ✓ CONTROL: the probe captures a pij_send schema with a `to` property 2ms
     × C1: the schema carries a structural exclusivity constraint 2ms
     × C2: {to, message, command} is NOT schema-valid 2ms
     × C3: {to} alone is NOT schema-valid 0ms
     ✓ C4 [preserved]: {to, message} is schema-valid 0ms
     ✓ C5 [preserved]: {to, command} is schema-valid 0ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  .pi/extensions/pij/index.send-schema.test.ts > pij_send registration schema — structural XOR (pij#166) > C1: the schema carries a structural exclusivity constraint
AssertionError: expected undefined to be defined
 ❯ .pi/extensions/pij/index.send-schema.test.ts:63:39
     61|  it("C1: the schema carries a structural exclusivity constraint", () =…
     62|   const s = sendSchema();
     63|   expect(s.oneOf ?? s.anyOf ?? s.not).toBeDefined();
       |                                       ^
     64|  });
     65|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  .pi/extensions/pij/index.send-schema.test.ts > pij_send registration schema — structural XOR (pij#166) > C2: {to, message, command} is NOT schema-valid
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ .pi/extensions/pij/index.send-schema.test.ts:70:5
     68|   expect(
     69|    Value.Check(sendSchema() as never, { to: "pij-x", message: "hi", co…
     70|   ).toBe(false);
       |     ^
     71|  });
     72|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  .pi/extensions/pij/index.send-schema.test.ts > pij_send registration schema — structural XOR (pij#166) > C3: {to} alone is NOT schema-valid
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ .pi/extensions/pij/index.send-schema.test.ts:75:63
     73|  // --- C3 · BEHAVIOURAL ---------------------------------------------…
     74|  it("C3: {to} alone is NOT schema-valid", () => {
     75|   expect(Value.Check(sendSchema() as never, { to: "pij-x" })).toBe(fal…
       |                                                               ^
     76|  });
     77|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  1 failed (1)
      Tests  3 failed | 3 passed (6)
   Start at  17:20:50
   Duration  642ms (transform 412ms, setup 0ms, import 559ms, tests 7ms, environment 0ms)

```
