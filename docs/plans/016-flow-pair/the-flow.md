# Flight plan — flow-pair

> Generated from `the-flow.json` — do not hand-edit. Re-rendered every guided turn.

```mermaid
flowchart TD
  classDef done fill:#C8E6C9,stroke:#2E7D32,color:#1B5E20;
  classDef wip fill:#FFE0B2,stroke:#EF6C00,color:#E65100;
  classDef blocked fill:#FFCDD2,stroke:#C62828,color:#B71C1C;
  classDef known fill:#BBDEFB,stroke:#1565C0,color:#0D47A1;
  classDef assumed fill:#FFFFFF,stroke:#9E9E9E,color:#616161,stroke-dasharray:4 3;
  classDef said fill:#F5F5F5,stroke:#BDBDBD,color:#424242;
  classDef worker fill:#E1F5FE,stroke:#0277BD,color:#01579B;

  start["Intent captured<br/>(dossier as research seed)"]:::done
  plan["Plan (spec + impl)<br/>CS-4 · Full · READY"]:::done
  p1["P1 · Domain + skill skeleton + resolver<br/>✓ complete · all gates green"]:::done
  p2["P2 · Central ledger writer<br/>✓ complete"]:::done
  p3["P3 · Context-pack compiler<br/>✓ complete"]:::done
  p4["P4 · Worker-packet gen + pij delivery"]:::known
  p5["P5 · Observe + diff capture"]:::known
  p6["P6 · Review + fix loop"]:::known
  p7["P7 · Prompt-learning + clusters"]:::known
  p8["P8 · MVP wiring + dogfood run"]:::known
  merge["Merge"]:::known

  start --> plan --> p1 --> p2 --> p3 --> p4 --> p5 --> p6 --> p7 --> p8 --> merge

  worker>"🤝 implementer: pij-1gzyr0p · Sonnet 4.6 (live)"]:::worker
  reviewer>"🔍 reviewer: pij-5994yi · GPT 5.5 (live)"]:::worker
  worker -. builds .-> p2
  reviewer -. reviews .-> p1

  said_start>"🗣 build flow-pair: orchestrator/worker wrapper around the-flow"]:::said
  said_start -.- start
  said_plan>"🗣 Full · no mocks · skills/flow-pair/ · pij delivery · NEW domain · dogfood in pij"]:::said
  said_plan -.- plan
```

**Legend**: 🟩 done · 🟧 in progress · 🟥 blocked · 🟦 known (designed future) · ⬜ assumed (speculative) · 🗣 your words · 🤝 worker

**Now**: Phase 3 ✓ COMPLETE (context-pack compiler; APPROVE WITH NOTES; tests mutation-proven — worker self-mutation caught a vacuous P9 test; findings in follow-ups.md) · **Next**: Phase 4 — Worker-packet generation + pij delivery (tasks)
