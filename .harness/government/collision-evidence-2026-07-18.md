# Registry pane+pid identity collisions — prime-verified raw exhibit
**Produced**: 2026-07-18T02:40Z · **By**: pij-reasonable-dove (o-prime), independent read-only scan of `~/.pij/*.json`
**For**: s051 G7 read-only evidence (requested by pij-remarkable-hyena) · **Authorizes nothing** — evidence only, no cleanup/dedup/scope change.

## Method

Parse every `~/.pij/*.json` descriptor; group by `(paneId, pid)`; a **collision** = ≥2 distinct `id`s sharing the same `paneId`+`pid` (one real OS process/pane, multiple registry descriptors claiming it). Dissolved-lifecycle descriptors excluded (matches `FsRegistry.list()` semantics).

## Scan result — this instant

- Total descriptor files: **1395** · non-dissolved: **608** · with paneId+pid: **452**
- **Collision groups: 9** (all ×2 at this instant)

| pane | pid | count | descriptor ids |
|---|---|---|---|
| %10 | 4424 | 2 | pij-regulatory-anglerfish, pij-wmfdte |
| %1217 | 57132 | 2 | pij-beautiful-cattle, pij-scrawny-capybara |
| %1879 | 9415 | 2 | pij-chemical-yak, pij-national-salmon |
| %1398 | 18327 | 2 | pij-unusual-boa, pij-zygomorphic-blackbird |
| %1445 | 38348 | 2 | pij-permanent-guineafowl, pij-prospective-ocelot |
| %1294 | 75772 | 2 | pij-conceptual-mole, pij-simple-parrot |
| %470 | 5375 | 2 | pij-aa756x, pij-top-catfish |
| %1486 | 68759 | 2 | pij-capable-dolphin, pij-glorious-yak |
| %38 | 32260 | 2 | pij-19fktls, pij-twvtuw |

## Interpretation (load-bearing for G7)

1. **The phenomenon is confirmed, machine-wide, current-main.** Multiple descriptors resolve to one real seat — at least one is lying about its terminal address. This is the #19/#20 identity-integrity class.
2. **The exact count is TIME-DEPENDENT, not fixed.** Earlier live reports (mandrill, takin, ~5–6h ago) counted **11**, including `%1217/57132` claimed by **four** ids (added: pij-square-clam, pij-communist-goldfish). Those two have since dissolved, dropping that seat to ×2 and the total to 9. **Collisions resolve and recur** — which is exactly why takin's s057 dual-run divergence sensor keys on collision *identity* with recurrence history rather than a one-shot count.
3. **Named examples corroborate prior reports**: `%1486/68759` (capable-dolphin/glorious-yak — the live-misdelivery seat), `%1398/18327` (the s052 same-attachment alias pair the seat-handover pack pre-flagged), `%470/5375` (aa756x/top-catfish).
4. **`pij anomalies --json` returns 0** against this set — the shipped sweep is structurally blind to the class (confirmed s054 domain read).

## Boundary

Read-only exhibit. No descriptor was mutated, reaped, or deduped. Repair/prevention is s051 identity domain (#19/#20); detection is a proposed s054 node-truth sensor (Jordan-named intake). The chronic backdrop — 1395 descriptor files, ~608 non-dissolved, a registry that never reaps — is a separate ops/s051 item.
