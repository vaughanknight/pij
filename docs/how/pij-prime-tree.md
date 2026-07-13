# pij prime hierarchy — canonical tree and examples

The canonical ownership chain is:

```mermaid
flowchart TB
    H["Human<br/>names work · gives binding rulings · approves merges"]
    O["o-prime<br/>one governance seat per repo<br/>single writer of government"]

    S1["Stream orchestrator 1<br/>owns one plan + worktree + branch"]
    S2["Stream orchestrator 2<br/>owns one plan + worktree + branch"]
    SN["Stream orchestrator N<br/>owns one plan + worktree + branch"]

    C1["Coder / implementer"]
    R1["Cold reviewer"]
    P1["Other bounded peer<br/>validator · researcher · live-test client"]

    C2["Coder / implementer"]
    R2["Cold reviewer"]

    H --> O
    O --> S1
    O --> S2
    O --> SN

    S1 --> C1
    S1 --> R1
    S1 --> P1
    S2 --> C2
    S2 --> R2

    classDef human fill:#4C1D95,color:#fff,stroke:#2E1065;
    classDef prime fill:#9A3412,color:#fff,stroke:#7C2D12;
    classDef stream fill:#1D4ED8,color:#fff,stroke:#1E3A8A;
    classDef peer fill:#166534,color:#fff,stroke:#14532D;

    class H human;
    class O prime;
    class S1,S2,SN stream;
    class C1,R1,P1,C2,R2 peer;
```

## Canonical boundaries

1. **The o-prime governs; it does not implement.** It owns portfolio state,
   roster, fences, batons, rulings, and one-hop verification.
2. **Each stream orchestrator owns one work item and its fleet.** Coders,
   reviewers, validators, and test clients are children of the stream—not direct
   o-prime workers.
3. **Evidence travels upward one verified hop.** Worker claims are checked by
   the orchestrator; stream claims are independently checked by the o-prime.
4. **Streams do not coordinate sideways.** Cross-stream overlap and sequencing
   go through the o-prime.
5. **Isolation is by worktree/branch/fence; serialization is by baton.** Human
   merge approval remains the final gate.
6. **Lifecycle is ownership-aware.** Reusable peers may be compacted and reused;
   dissolved seats are not resumed; closed ordinals are not recycled.

## Historical example: osk-split-billing

```mermaid
flowchart TB
    H1["Jordan"]
    O1["o-prime pij-1ca01u5"]

    S16["s016 onboarding<br/>pij-90wkbu · active"]
    S17["s017 email substrate<br/>pij-minimum-lobster · complete"]
    S13["s013 SAH<br/>pij-19fktls · shipped/idle"]
    S14["s014 E6 CRM<br/>pij-164zobc · held/stale"]
    SC["Catherine intake<br/>pij-1aobnfj · record mode"]
    SD["Dependency hygiene<br/>pij-1hpvti7 · idle"]

    C16["coder pij-direct-kangaroo<br/>Fable 5 high"]
    R16["reviewer pij-minimal-weasel<br/>GPT-5.6 Sol xhigh"]
    X17["former coder/reviewer<br/>closed"]
    C13["coder pij-69a1lm<br/>Codex Sol xhigh"]
    R13["reviewer pij-2b3k6p<br/>Codex Sol xhigh"]

    OBS1["Observers / sibling governments<br/>pij-primary-carp · pij-3vetx8<br/>not in this govern chain"]

    H1 --> O1
    O1 --> S16
    O1 --> S17
    O1 --> S13
    O1 --> S14
    O1 --> SC
    O1 --> SD
    S16 --> C16
    S16 --> R16
    S17 -. historical .-> X17
    S13 --> C13
    S13 --> R13
    OBS1 -. protocol peer .-> O1

    classDef human fill:#4C1D95,color:#fff,stroke:#2E1065;
    classDef prime fill:#9A3412,color:#fff,stroke:#7C2D12;
    classDef stream fill:#1D4ED8,color:#fff,stroke:#1E3A8A;
    classDef peer fill:#166534,color:#fff,stroke:#14532D;
    classDef closed fill:#6B7280,color:#fff,stroke:#374151;
    classDef observer fill:#F3F4F6,color:#111827,stroke:#6B7280,stroke-dasharray: 5 5;

    class H1 human;
    class O1 prime;
    class S16,S17,S13,S14,SC,SD stream;
    class C16,R16,C13,R13 peer;
    class X17 closed;
    class OBS1 observer;
```

Source: the osk-split-billing canonical prime-tree artifact.

## Historical example: SecondCrack

```mermaid
flowchart TB
    H2["Jordan"]
    O2["o-prime pij-uec99o"]

    S017["s017 config platform<br/>pij-vsa9qj · parked"]
    S020["s020/025 blast feedback<br/>pij-wwtt41 · parked mid-build"]
    S021["s021 simulation performance<br/>pij-lewt29 · complete"]
    S022["s022 liquid simulation fixes<br/>pij-dddkvp · parked"]
    S024["s024 dev bar<br/>pij-missing-peacock · parked fix loop"]

    C020["coder pij-p2lsso<br/>Copilot Sol xhigh"]
    C022["coder pij-135mf9p<br/>Copilot Sol xhigh"]
    R022["reviewer pij-12lap4f<br/>Copilot Sol xhigh"]
    C024["coder peer<br/>live/compacted"]
    R024["reviewer peer<br/>live/compacted"]
    P042["closed interview peer<br/>pij-vital-tiglon"]

    SIB["Sibling government<br/>pij repo o-prime<br/>not a child stream"]

    H2 --> O2
    O2 --> S017
    O2 --> S020
    O2 --> S021
    O2 --> S022
    O2 --> S024
    S020 --> C020
    S022 --> C022
    S022 --> R022
    S024 --> C024
    S024 --> R024
    O2 -. closed special-purpose peer .-> P042
    SIB -. sibling protocol .-> O2

    classDef human fill:#4C1D95,color:#fff,stroke:#2E1065;
    classDef prime fill:#9A3412,color:#fff,stroke:#7C2D12;
    classDef stream fill:#1D4ED8,color:#fff,stroke:#1E3A8A;
    classDef peer fill:#166534,color:#fff,stroke:#14532D;
    classDef closed fill:#6B7280,color:#fff,stroke:#374151;
    classDef observer fill:#F3F4F6,color:#111827,stroke:#6B7280,stroke-dasharray: 5 5;

    class H2 human;
    class O2 prime;
    class S017,S020,S021,S022,S024 stream;
    class C020,C022,R022,C024,R024 peer;
    class P042 closed;
    class SIB observer;
```

Source: SecondCrack Plan 018 government evidence reported by its o-prime.

## The key visual rule

```text
human
└── o-prime
    ├── stream orchestrator
    │   ├── coder
    │   ├── reviewer
    │   └── other bounded peers
    ├── stream orchestrator
    │   └── its own fleet
    └── stream orchestrator
        └── its own fleet
```

An o-prime can have `1..N` streams. Each stream can have `0..N` peers over its
lifecycle. Peers belong to their stream; separate o-primes are sibling
governments, not children.
