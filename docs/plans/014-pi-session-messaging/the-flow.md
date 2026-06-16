<!-- GENERATED from the-flow.json — never hand-edit as primary. -->
# Flight plan — pi-session-messaging

```mermaid
flowchart TD
    classDef done fill:#C8E6C9,stroke:#2E7D32;
    classDef wip fill:#FFE0B2,stroke:#EF6C00;
    classDef blocked fill:#FFCDD2,stroke:#C62828;
    classDef known fill:#BBDEFB,stroke:#1565C0;
    classDef assumed fill:#ECEFF1,stroke:#90A4AE,stroke-dasharray:4 3;
    classDef said fill:#FFF9C4,stroke:#F9A825;

    n0["preamble: prototype + minih prior-art"]:::done
    n1["explore: research-dossier"]:::done
    n2["spec: Full, CS-4 (validated)"]:::done
    w1["workshop: pij CLI shape ✓"]:::done
    w2["workshop: parent/worker use cases ✓"]:::done
    n3["architect: plan READY + validated"]:::done
    n4["tasks + build: Phase 1 (NEXT)"]:::known
    n5["merge"]:::assumed

    n0 --> n1 --> n2 --> n3 --> n4 --> n5
    w1 -.-> n3
    w2 -.-> n3

    said0>"🗣 'workshop cli shape + parent/worker use cases'"]:::said
    said0 -.- w1
```

Legend: 🟩 done · 🟧 in progress · 🟥 blocked · 🟦 known · ⬜ assumed · 🗣 user input · `-.->` workshops feed the architect (authoritative)
