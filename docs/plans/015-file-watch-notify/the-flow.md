# Flight plan — file-watch-notify

> Generated from `the-flow.json` — do not hand-edit as the primary.

```mermaid
flowchart TD
  classDef done fill:#C8E6C9,stroke:#2E7D32;
  classDef wip fill:#FFE0B2,stroke:#EF6C00;
  classDef blocked fill:#FFCDD2,stroke:#C62828;
  classDef known fill:#BBDEFB,stroke:#1565C0;
  classDef assumed fill:#ECEFF1,stroke:#90A4AE,stroke-dasharray:4 3;
  classDef said fill:#FFF9C4,stroke:#F9A825;

  n_start["🏁 Intent captured"]:::done
  said0>"🗗 new research on how we can add an exteion … file watching … notification … no tool call, steered if busy"]:::said
  n_research["🔎 Explore: folder-watch → in-session notification"]:::done
  n_plan["📋 Plan (spec + impl) — Simple, READY"]:::done
  n_build["🛠 Build (Phase 1)"]:::known
  n_review["🔍 Review"]:::assumed
  n_merge["🔀 Merge"]:::assumed

  n_start --> n_research --> n_plan --> n_build --> n_review --> n_merge
  said0 -.- n_start
```

**Legend**: 🟩 done · 🟧 in-progress · 🟥 blocked · 🟦 known (designed) · ⬜ assumed (speculative) · 🗗 user input
