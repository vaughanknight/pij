# s099 — send-tool-xor

`pij_send` registration schema carries no structural XOR (pij#166). Seat `pij-reasonable-dove`,
claude. Worktree `pij-worktrees/s099-send-tool-xor`, branch `s099/send-tool-xor`.

Rows are s099-specific. Findings this stream contributed that generalised to the whole wave live
in `../evidence-discipline.md` and are not restated here.

---

### F-901 · A registration-boundary assertion cannot prove what the model sees

The obvious test for "the schema now carries an XOR" inspects `send.parameters` at
`registerTool`. **That is the exact surface pij#166 already proved insufficient**: the registered
schema was measured correct on two machines while a live seat read both fields as required.

So a schema fix can serialise correctly, pass every boundary assertion, and change nothing the
model receives — **green at the boundary, inert on the wire**. That is a criterion that cannot
fail, arrived at by testing the wrong surface rather than by writing a weak assertion.

**Consequence for this stream**: C1 is not discharged at the registration boundary. It requires
observing a live seat's rendered tool definition — the method that produced the PROBE-1 evidence
in `docs/plans/099-send-tool-xor/assets/166-investigation.md`, where the *delivery* was the
observable rather than the seat's testimony.

### F-902 · The type layer permits what the wire forbids

`ToolDefinition<TParams extends TSchema>` (`pi-coding-agent` `types.d.ts:335`) bounds the schema
as **`TSchema`, not `TObject`** — so a top-level `Type.Union` type-checks. Tool-calling wire
formats require an object at the schema root, so it would very likely be rejected or mangled
downstream.

**A "can" claim from a type declaration is not permission to ship.** The declaration constrains
what compiles; the provider constrains what works. Two different authorities, and the compiler is
the one that answers instantly, which is why it gets mistaken for the answer.

Decision: `oneOf` on an object schema, keeping `type: "object"` at the root. Also the
conservative choice *because* #166 is an open dispute about registered-vs-rendered schemas —
shipping an unusual root shape would confound the question this stream exists to settle.

### F-903 · Honest labelling halved the evidence table before any code existed

Labelling six acceptance criteria behavioural / new-API / preserved-property / mutation-only gave
**three behavioural of six**. C4–C6 (`{to,message}` valid, `{to,command}` valid, runtime guard
still rejects) are true in **both** worlds and can never be evidence the fix works.

They are also the three most likely to be presented as proof, **because they are the ones that
show the tool still working**. The count dropped by half at labelling time, before an
implementation existed to be wrong about.

### F-904 · A probe must be downstream of the event it claims to detect

Prescribed wait-condition: *"if `ledger/s0NN-<slug>.md` errors, #203 has not landed."*
**Unsatisfiable for s095, s099, s100** — that file is produced by *us*, not by #203, and writing
it is the action the check gates. Sound for the five already-merged streams and for s097 (whose
own PR created its file), so six seats sail through and three wait forever.

The repaired rule, with s100: a probe must be downstream of the event, and among downstream
probes prefer the one with an **exclusive producer**. `ledger/s092-install-blocker.md` is
downstream of #203 and nothing else; the directory, the index table and s097's file are all
downstream of s097 shipping first.

### W-905 · My own instrument returned a reassuring zero from a command that never ran

Regenerating a subprocess-marker census, `grep --include=*.test.ts` unquoted under zsh: no glob
match, command aborts, pipeline prints `0 — index.test.ts is CLEAR`. **A command that never
executed, rendered as a clean negative result confirming what I wanted.** Caught only because 0
was implausible against a known 14; had zero been plausible I would have banked it.

Filed here rather than only in the wave doc because it happened **while checking someone else's
under-enumeration**, which is the condition that made it invisible: attention was on their probe,
not mine.
