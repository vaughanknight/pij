# Research Dossier: first-class daemon-owned watchdogs for pij sessions

**Generated**: 2026-07-17T00:35:00Z
**Query**: "First-class daemon-owned watchdogs for pij sessions: universal 20-min default, self-teaching pause/resume turns, compact auto-pause, blind-fire through usage-limit freezes with deterministic unresponsive/stalled detection, cost-bounded on-fire tmux pane-text capture"
**Effort**: Deep (lead-only — the questions shared one execution path; no independent uncertainty earned a worker)
**Tools**: Standard
**Evidence**: 11 current sources · 6 historical sources

## The Ask

Jordan ruled (spine Seq 416/417 + preamble 2026-07-17) that every pij session
should automatically get a supervision watchdog: a ~20-minute default timer
whose fired turn teaches the receiving session how to pause/resume it, pauses
automatically when the peer is compacted, keeps firing blind through usage-limit
freezes (resume is emergent — no thaw detection), and lets the daemon
deterministically derive an unresponsive/stalled state when watchdog turns are
delivered but no output is generated. The turn optionally carries a
cost-bounded slice of the peer's tmux pane text — the ground truth pij's own
logs can't see (canonical case: agent out of credits). This dossier maps the
existing daemon/liveness machinery so the plan builds on it rather than beside it.

## Answer

1. **Most of the machinery already exists in the daemon tick** — per-tick pane
   capture, busy/ready footer classification, a pane-content-change heartbeat,
   once-latched stalled/dead/provider-failure pushes, and a store-backed
   per-session subscription manager (`PeerWatchManager`) that is a
   near-exact architectural template for a `WatchdogManager`.
2. **The 7.5h freeze was invisible by design, twice over**: liveness gates
   staleness on `state==="working"` (an idle/done frozen peer reads `active`
   forever), and the pane classifier deliberately maps transient limit
   patterns (429/rate_limit/overloaded) to `"unknown"`, which never fires the
   provider-failure push.
3. **Jordan's deterministic unresponsive detection is buildable from existing
   primitives**: `paneWentBusy` (not-busy→busy send oracle) + the `paneSig`
   change heartbeat give "watchdog turn delivered but nothing happened"
   without any banner parsing — which supersedes the vendored proposal's
   limits-classification/reset-parsing design (§ Historical H-01).
4. **Capture is not the marginal cost — context injection is.** The daemon
   already captures every bound pane every tick for free; what the cost
   constraint really bounds is how much captured text lands in the receiving
   session's context window per fire.
5. **A watchdog named "watchdog" already exists** (spawn-binding phone-home,
   20s) — the plan must namespace or rename to avoid colliding with it in
   code, logs, and docs.
6. **State vocabulary is ruled but not landed**: WS-6's
   `starting/working/idle/stalled/stopped/dead/unknown` becomes first-class
   `system_state` only in s054 P2 (in flight, consume from branch
   `s054/pij-grown-up`, hard-stopped behind s051) — the plan needs an explicit
   posture on consuming it vs. shipping an adapter first.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | `liveness()` returns `stale` only when `working`; an idle/done pid-alive peer reads `active` regardless of event age | `.pi/extensions/pij/core/state.ts:33-42` | The freeze signature (idle · done · active · frozen `lastEventAt`) needs a new derivation path; can't just lower thresholds | High |
| F-02 | A spawn-scoped "watchdog" already exists: `evaluateWatchdog` re-sends phonehome once then fails, `WATCHDOG_TIMEOUT_MS=20_000` | `core/binding.ts:257-268`, `core/daemon/loop.ts:361-382,408` | Naming/namespace decision required; whole-life watchdog is a different lifecycle | High |
| F-03 | The daemon already captures every bound pane every tick and keeps a per-session pane signature; any visible change while working refreshes `lastEventAt` | `daemon.ts:85-90,209-227` | Pane capture per fire is already paid; tail/diff can compute from text in hand | High |
| F-04 | `paneWentBusy(pre,post)` is a positive delivery oracle: pane must transition not-busy→busy | `core/readiness.ts:83-85` | The deterministic "delivered but no output" primitive for unresponsive derivation exists | High |
| F-05 | Whole-life stalled/dead push exists but is once-latched per transition, creator-only (`spawnedBy`), and stall requires `state==="working"` | `daemon.ts:261-301` | Watchdog adds recurrence, self-turns (to the session itself), configurable notify target, idle-freeze coverage | High |
| F-06 | `TRANSIENT_QUOTA_RE` (429/rate_limit/overloaded/529) deliberately classifies to `"unknown"`, which the provider-failure peek never fires on | `core/state.ts:94,133`, `daemon.ts:338-340` | Usage-limit freezes are structurally invisible today; blind-fire + unresponsive derivation covers them with zero banner parsing (per Jordan's ruling) | High |
| F-07 | `PeerWatchManager`: store-backed per-session subscriptions (CLI-owned sidecar, daemon read-only), reconcile-per-tick, `DeliveryPort` push, pointer files under `~/.pij/<id>/watch-diffs/` | `core/daemon/watch.ts:57-197`, `core/types.ts:224-240` | The architectural template: a `WatchdogManager` + watchdog sidecar mirrors a shipped, reviewed pattern | High |
| F-08 | Remote command allow-list includes `compact`; a bare `/compact` body normalizes to a command at send | `core/commands.ts:12`, `core/cli.ts:433` | Auto-pause-on-compact hooks at command routing/injection — one seam, both pi and tmux paths | High |
| F-09 | `DeathReason` already includes `"stalled"`; `classifyDeathReason` takes a `"stalled"` hint documented as "the watchdog's stall case" | `core/state.ts:118-135` | Vocabulary partially pre-wired; must align with ruled WS-6 vocabulary, not invent a third | High |
| F-10 | Delivery ownership split: daemon injects only bound tmux panes; pi peers self-drive inboxes; pre-bind sends buffer | `daemon.ts:184-205`, `core/daemon/loop.ts:420-447` | Watchdog turns must ride the existing split (sendText for tmux, inbox for pi) — no new transport | High |
| F-11 | Every daemon descriptor write goes through `writeMerged` with append-only/mutable externally-owned field semantics | `core/daemon/loop.ts:143-180` | Watchdog config should live in a CLI-owned sidecar (like watches) or extend the ownership lists explicitly — never a naive descriptor field | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | Vendored frozen proposal: hand-rolled 60s-poll/20-min-heartbeat loop, graduated supervision protocol, `pij watchdog start/stop/list` sketch, limits auto-resume via banner parsing + reset-time parsing | `vendored/watchdog-enhancement-proposal.md` (sha-pinned, see `vendored/PROVENANCE.md`) | Partial — concept + CLI shape Direct; **§ Limits auto-resume items 2–3 Superseded** by Jordan's preamble ruling (blind fire, emergent resume, deterministic unresponsive) | Cite the proposal for demand + shape; record the supersession explicitly in the plan |
| H-02 | WS-6 state vocabulary (`starting/working/idle/stalled/stopped/dead/unknown`) human-ruled; `system_state` first-class in s054 P2 | s054 `workshops/001-data-model.md`; takin interview (`.harness/temp/s055/s054-interview-takin.md`) | Direct — do not re-litigate | Watchdog consumes/aligns with this vocabulary; P2 not landed → posture decision |
| H-03 | s054 P1 creates `core/platform/**` only; does NOT touch `daemon/loop.ts`, `state.ts`, `core/types.ts`; `ports.ts` churning every review cycle | takin interview | Direct | s055's seams are clear of P1; don't bind to s054 `ports.ts` shapes; event envelope settled |
| H-04 | Three same-day freeze data points: 7.5h coder freeze with `liveness=active` lying; s051 coder PID gone ~12h unnoticed (Seq 419); s055's own kickoff ready-signal loss | brief § Work item | Direct | Demand evidence; two orchestrators hand-rolled detection the same night → fabric-level is justified |
| H-05 | Peer file-watch (plan 033/034): self-serve `pij watch`/`unwatch` verbs, sidecar subscriptions, debounced daemon-pushed notices | `docs/how/pij-peer-watch.md`; F-07 | Direct | The verb-surface + sidecar + manager pattern to copy for watchdog lifecycle |
| H-06 | Daemon restarts are baton-gated machine-wide; s051 proved features with isolated/temp-daemon runs first; no hot-reload of `.pi/extensions/pij/**` | brief § Assignment; handover § 11 | Direct | Proof strategy must plan temp-daemon isolation before any live daemon restart |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| Capture policy undecided: lines/bytes cap, tail vs diff-since-last-fire, always-on vs anomaly-only | brief § Work item (plan MUST answer); F-03/Answer-4 | It's the named cost constraint; the expensive unit is tokens injected into the receiver's context, not the tmux capture | Jordan steer requested; else workshop with a cost model per option |
| Pause semantics: explicit verb vs inferred; "paused = claim, not proof" | preamble notes; brief thesis read | Wrong default either spams working sessions or silences real supervision | Preamble follow-up or workshop |
| Exemption mechanics for deliberate-silence seats (frozen evidence holds, parked seats) | brief thesis read (first-class, not a workaround) | Universal-by-default needs a principled opt-out or it gets hand-rolled around | Workshop; likely spawn flag + settable verb |
| s054 P2 `system_state` timing: not landed, hard-stopped behind s051 | H-02/H-03 | Consuming an unlanded seam risks blocking; ignoring it risks a competing state source (proposal § Relation to s054 warns exactly this) | Plan a posture: own additive derivation now + converge at P2; re-sync at takin's P2-complete checkpoint |
| Existing name collision: spawn-binding watchdog (F-02) | F-02 | Two "watchdogs" in one daemon confuses code, logs, and docs | Naming decision in plan (e.g. rename old to phonehome-watchdog or namespace new as supervision) |
| Watchdog turns themselves refresh `lastEventAt`/pane state — the observer can mask the very freeze it probes | F-03 (paneSig refresh), F-04 | Injected turn text changes the pane; naive heartbeat logic would read that as peer activity | Design: exclude daemon-injected turns from activity refresh, or measure the post-injection busy transition instead |

## Planning Handoff

- **Preserve**: push-not-poll (daemon fires, peers only receive — inviolate per brief); the delivery-ownership split (F-10); `writeMerged` field-ownership semantics (F-11); existing once-latched creator notices (watchdog adds to them, doesn't replace); WS-6 ruled vocabulary (H-02); the spawn-binding watchdog's behaviour (F-02).
- **Change carefully**: `daemon.ts` tick composition (the mount point — every session pays it); `core/state.ts` liveness derivation (s054 P2 will make `system_state` first-class on top of it); `core/types.ts` additive descriptor surface (recorded s054/s051 overlap — additive only).
- **Likely files/symbols**: new `core/daemon/watchdog.ts` (manager mirroring `PeerWatchManager`); new watchdog sidecar type + store beside `WatchSubscription`/`FsWatchStore`; `daemon.ts` (mount in `tick()`); `core/cli.ts` (watchdog verbs); `core/commands.ts` (pause/resume as remote commands or new verb surface); `core/state.ts` (unresponsive derivation, additive); `core/readiness.ts` `paneWentBusy` (consume as-is).
- **Decisions still required**: capture policy (cost model per option); pause verb shape + inference; exemption mechanics; s054 P2 consumption posture; watchdog naming; where pane-capture slices live (pointer file à la watch-diffs vs inline body).

## External Research

_None — every material question is answerable from repo evidence and rulings._
