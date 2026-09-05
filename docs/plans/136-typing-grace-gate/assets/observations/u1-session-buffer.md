- id: CONF-001
  kind: confusion
  description: "Plan 136 u1 acknowledgement: pij whoami and the OMP footer report the spawn clone/main while git branch --show-current in the explicit worker cwd reports 136-typing-grace-gate-u1. Absolute file paths and explicit command cwd avoid wrong-tree edits; a worker execution-root receipt distinct from seat registration would remove repeated inference."
  fp: 851ff417769d
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:50:51.609Z"
- id: DL-001
  kind: difficulty
  description: "Plan 136 packet prescribes bun test for rust-runtime.test.ts, which imports vitest and relies on vi.stubEnv/vi.unstubAllEnvs. Bun baseline fails all 8 tests on missing runner APIs, not product behavior. Requested scoped Vitest amendment from PM; dispatch should derive runner from package.json/tests rather than prescribe Bun for OMP."
  fp: 164403148118
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:53:52.712Z"
- id: DL-002
  kind: difficulty
  description: "Plan 136 frozen sensor premise editor.onChange is internal, not a public ExtensionContext hook in installed pi 0.80.6. setEditorComponent overwrites returned editor.onChange. Escalated supported onTerminalInput plus post-dispatch text comparison to PM before sensor implementation; author interface feasibility against installed SDK before fan-out."
  fp: a003b8665e5b
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:55:51.672Z"
- id: CONF-002
  kind: confusion
  description: "Hold inversion changes /v1/hold to pending with not_before=hold-time+grace. AC1 releases at last-key+grace, which may be earlier; /v1/release must therefore explicitly un-defer before normal reclaim. PM asked to freeze this and peek response shape before fake-client implementation; event-only contracts omitted a load-bearing queue-state side effect."
  fp: e0b1666da540
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:03:56.548Z"
- id: DL-003
  kind: difficulty
  description: "During plan 136 u1, two PM rulings were delivered into the active EditorSeam tool-subagent rather than Main; Main remained blocked on stale seam assumptions until the scout forwarded exact text. A directed pij delivery should bind to the owning top-level session, not whichever child currently has the prompt focus; require delivery-owner isolation evidence."
  fp: 0243fd6ba85a
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:10:35.672Z"
- id: DL-004
  kind: difficulty
  description: "harness checks returned test+smoke failure as one long JSON line; the tool's 768-character line truncation discarded all failure details, and the checks extension writes no durable report (failureLogs only returned in ctx.error). Had to rerun failing Vitest sensor with --reporter=json --outputFile to recover names. Encode a durable gate report path in the envelope, not ephemeral inline tail text."
  fp: 721bd83b3ede
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:15:27.082Z"
- id: DL-005
  kind: difficulty
  description: "Plan 136 composition: successful post-restart delivery can leave sender hold evidence stale because the restarted extension lost local notes. RED showed delivered bodies and acks=[1,2] while held evidence stayed [true,true]. Added unconditional release declaration before every ack; daemon declaration event is independent from typed queue no-op. Future contract fixtures should assert sender projections across restarts, not only delivery/ack."
  fp: 2b8c7b988003
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:33:05.334Z"
- id: DL-006
  kind: difficulty
  description: "Plan 136 recovery seam: ordering only eligible rows is not FIFO across deferred held jobs. Natural RED: job1 re-held to t0+120s, job2 due t0+61s, restart t0+61s; both eventually delivered, but order was [newer,older]. Startup recovery needs oldest-LIVE peek then un-defer/reclaim; typing/bypass polling must remain eligible-only claim. Same queue API property is harmful in one path and necessary in another."
  fp: aa375eeccd06
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:45:15.182Z"
- id: DL-007
  kind: difficulty
  description: "Plan 136/main convergence: assertions duplicated old frame strings, while a startup capture filter used startsWith('[pij from ') and silently erased all canonical '[pij-rs from ...]' recovery observations. Reused production frame and parseFrame helpers instead of retyping protocol strings. Added mandatory recovery peek to plan-135 fake clients. Scoped runtime file now passes all 31 tests without production changes."
  fp: e4f1fa53737d
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T01:51:39.326Z"
- id: DL-008
  kind: difficulty
  description: "Plan 136 live AC1 exposed duplicate delivery.released declarations: pre-claim un-deferral and pre-ack assurance both emitted the same fact. Exact-count RED expected 1, got 2. One declaration owner now shares a successful per-job receipt until ack or a new hold; scoped tests preserve FIFO recovery, lost-note release-before-ack, and distinct later hold cycles. Evidence cardinality needs its own assertion, not merely readback-state correctness."
  fp: 42f3724a5116
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T02:13:06.959Z"
