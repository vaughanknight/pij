---
record_kind: retro
harness_version: "0.14.0"
branch: omp-draft-aware-hold
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-09-06T00:51:21.619Z"
agent: pij-urban-odette
plan_id: null
schema_version: "1.2"
retro_id: "2026-09-06T00:51:21.619Z-pij-urban-odette-draft-hold"
started_at: "2026-09-06T00:40:11.062Z"
ended_at: "2026-09-06T00:55:35.742Z"
summary: "Replaced activity-only holds with decision-time draft sampling and edit-capable terminal input classification. RED witnesses exposed blank-draft, input-protocol, and asynchronous paste gaps; live OMP proof used a separate PTY against the production daemon."
entries:
  - id: DL-001
    kind: difficulty
    description: "Worktree boot failed TS2688 because node_modules was absent while installs and main-checkout writes were forbidden."
    target: tooling
    severity: degrading
    workaround: "Created a real worktree-local node_modules directory with read-only dependency symlinks, excluding main caches; generated Vite caches stayed local."
    suggested_encoding: "A worktree dependency-borrow command that preserves local cache ownership."
    fp: "9cbbfb4b4fcf"
    disposition: kept
  - id: DL-002
    kind: difficulty
    description: "After-input microtask comparisons misattribute batched input and miss asynchronous clipboard completion."
    target: project-sensor
    severity: degrading
    workaround: "Removed the snapshot observer; classify edit-capable input synchronously with runtime-configured mutation bindings. Sample draft text only at hold decisions."
    suggested_encoding: "Keep clipboard, navigation, Unicode, and empty-draft regression witnesses in the extension suite."
    disposition: fixed-now
    system:
      compound:
        status: encoded
        resolved_by: ".pi/extensions/pij/adapters/pi-runtime.test.ts"
  - id: SUGG-001
    kind: improvement-suggestion
    description: "Live draft-delivery proof still requires manual PTY launch, probe coordination, and spine receipt joins."
    target: project-sensor
    suggested_encoding: "Extend the Driver SDK with an opt-in production-daemon draft hold scenario that emits typed hold/release/ack receipts."
    disposition: kept
---

# Retro — draft-aware message holds

The regression suite is the encoded improvement: mouse/focus/navigation cannot extend grace; blank and cleared drafts permit delivery; asynchronous paste and Unicode terminal protocols remain edit-capable. The remaining Driver SDK proposal is recorded, not implemented in this bounded fix.

## Final-code live proof

Own OMP 18.0.10 PTY seat `pij-delighted-catfish`, model `github-copilot/gpt-5-mini`, explicitly loaded the worktree extension against the production daemon. The seat was stopped after proof; no daemon restart or global link change.

- Empty editor after SGR click and arrows: prime's message `01a07435-d73b-7bb1-accf-858b7247ca10` pushed at spine seq **12600** (`1788656080699`), released **12602** (+6 ms), acknowledged **12603** (+9 ms); no `delivery.held` event.
- Nonempty draft: peer message `e69922a2-1363-4c0e-91ea-ef7754dd5b50` pushed **12608**, held **12610** (`since_ms:1788656113814`), with the held status visible and draft preserved. Ctrl-U at `1788656135327..5330`; released **12618** at `1788656135740` (**410–413 ms**, within one tick), acknowledged **12619**. The seat rendered `ACK FINAL-DRAFT-PROBE` with an empty editor.
- The original dispatch defect is also recorded: `pij-urban-odette` message `01a07427-49eb-7622-83aa-fa95f2eecb9e`, held **12527** and released **12528**, remained held **51.599 s**, until **60.451 s** after its recorded input timestamp.
