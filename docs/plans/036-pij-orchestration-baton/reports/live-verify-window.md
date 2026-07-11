# T011 live-verify window — return evidence (daemon-restart baton)
**Held by**: pij-1khprxk · **Window**: 2026-07-11 ~10:19–10:22Z (<4 min hold) · **Granted**: 11:15Z book line, quiescence beat by o-prime

## What ran (all outputs verbatim in session; machine log is the durable record)

1. `pij daemon stop && pij daemon start` — old pid 75408 killed, new pid 14681 (window @244). New code loaded.
2. `pij orchestration baton --help` — verb family live (define/list/show/request/grant/return/reclaim, honor-system posture text).
3. E2E on scratch baton `live-verify-baton`:
   - define (createdBy stamped) → scratch holder `pij-1xqjqx7` (claude) spawned → its `request` pushed a notice to me unprompted → `grant --to request-3ebd865f…` → lease `lease-573319f2…`, **blockedTimeMs: 12621 measured** (AC-06), grant push receipt `queued` w/ messageId (AC-02)
   - holder killed (`pij close`) → **daemon sweep pushed EXACTLY ONE alert** (`actor: pij-daemon, verb: alert, transition: dead` at 10:21:08Z; message: "holder is dead; lease remains held — inspect evidence before explicit reclaim") — **alert-never-auto-reclaim proven live** (AC-04)
   - `reclaim --evidence "…"` → lease freed, `lastLease.endKind: reclaim` + evidence persisted; reclaim notice to dead holder honestly `unverified` (AC-09)
4. Machine log (`~/.pij/orchestration/log.ndjson`): define → request → grant(blockedTimeMs) → show → alert → reclaim(evidence) → show — one line per verb (AC-07 live).

## Residue
- Scratch baton `live-verify-baton` remains defined (no `undefine` verb in v1 — deliberate; noted for the how-doc/backlog).
- Fleet delivery verified post-restart (this send path itself).
