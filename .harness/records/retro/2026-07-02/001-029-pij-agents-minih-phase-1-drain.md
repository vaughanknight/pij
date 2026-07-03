---
schema_version: "1.0"
retro_id: "2026-07-02T23:25:22Z-agent-drain029p1"
agent: agent
plan_id: 029-pij-agents-minih
started_at: "2026-06-28T05:44:30.931Z"
ended_at: "2026-07-02T23:25:22Z"
summary: "retro --drain post-coding phase-1 save (21 entries, incl. cross-session leftovers)"
entries:
  - id: INS-001
    kind: insight
    description: "pij liveness 'stale' verdict misfires on healthy IDLE control-plane peers. Evidence: pij-vigz1i (claude, lifecycle=bound, pid alive) showed 'done stale' in pij list after >60s quiet, then flipped to 'done active' the instant it sent a message — it was never stale, just idle, and responds instantly. Root cause: lastEventAt only advances while the daemon classifies the pane 'busy' (core/daemon/loop.ts:104-110, ACTIVITY_REFRESH_MS); once a peer goes 'done' (finished its turn, awaiting next) the freshen stops, so after STALE_AFTER_MS=60s (core/state.ts:7) liveness() returns 'stale' even though pid is alive. So 'stale' conflates 'alive-but-quiet' with 'suspect/hung', which is misleading for an orchestrator deciding whether a colleague is reachable."
    target: "project-sensor"
    severity: "degrading"
    workaround: "send the peer a message and it flips back to active; treat 'done stale' on a bound pid-alive peer as idle, not dead"
    suggested_encoding: "for bound + pid-alive + activity=done, classify liveness as idle/active not stale; reserve 'stale' for working-but-no-recent-event (the real stall, already isStalled); OR use the bound transcript file mtime as an activity signal so an actively-working claude/codex peer never reads stale"
    first_seen_at: "2026-06-28T05:44:30.931Z"
    system:
      compound:
        status: open
  - id: INS-002
    kind: insight
    description: "pi --list-models already ships built-in fuzzy search; the pij models verb for pi can shell out to it instead of reimplementing fuzzy matching — shrinks plan 023 T002 scope."
    first_seen_at: "2026-06-28T07:45:31.628Z"
    system:
      compound:
        status: open
  - id: INS-003
    kind: insight
    description: "pi's ~/.pi/agent/models.json carries a github-copilot provider section (12 entries) — copilot model discovery is seedable from pi's registry cross-harness, mitigating copilot's lack of a local registry."
    first_seen_at: "2026-06-28T07:45:31.759Z"
    system:
      compound:
        status: open
  - id: INS-004
    kind: insight
    description: "Dogfood irony: the manual canary-dance flow-pair forces here (spawn claude, capture footer, confirm model, verify no first-inference 400) IS exactly the fail-loud-model feature plan 023 builds to eliminate. Live proof of the feature's value."
    first_seen_at: "2026-06-28T07:45:31.895Z"
    system:
      compound:
        status: open
  - id: COORD-001
    kind: coordination
    description: "codex is not yet a pij harness (HarnessKind = pi|claude|copilot; no codex in core) — blocked the requested codex gpt-5.5 flow-pair dogfood; fell back to claude sonnet 4.6. Plan 022 codex-spawn-support still unbuilt."
    first_seen_at: "2026-06-28T07:45:32.027Z"
    system:
      compound:
        status: open
  - id: DL-001
    kind: difficulty
    description: "flow-pair dispatch --phase expects the literal plan section heading; for a Simple-mode plan that's 'Implementation' (the ### Implementation block), NOT the flight-plan phase-node label. Passing the node label 'Implement (fail-loud model)' errored 'section not found'. flow-pair could fall back to ### Implementation for Simple plans, or the error could name the available sections."
    first_seen_at: "2026-06-28T07:47:50.920Z"
    system:
      compound:
        status: open
  - id: INS-005
    kind: insight
    description: "pi models.json has providers with models[] + modelOverrides{} — copilot seeds from github-copilot section; verify: true for pi-parsed, false for claude/codex unverified fallbacks"
    first_seen_at: "2026-06-28T07:50:57.411Z"
    system:
      compound:
        status: open
  - id: INS-006
    kind: insight
    description: "normalizeModelQuery collapses spaces→hyphens, so 'fugu ultra' IS valid (normalizes to known id); test needed a genuinely partial id like 'claude-sonnet'"
    first_seen_at: "2026-06-28T07:55:48.866Z"
    system:
      compound:
        status: open
  - id: INS-007
    kind: insight
    description: "Potential gap for the live sakana/fugu test: QUOTA_RE in core/state.ts:75 matches /rate_limit_exceeded|429|overloaded|529|quota.*exceeded|resource_exhausted/i but the real sakana out-of-credits error is 'prepaid credit balance exhausted' — which only matches if the pane also shows '429'. If case-3 classifies as 'unknown' instead of 'quota', broaden QUOTA_RE to include credit/balance/prepaid. This is exactly what the live test exists to catch."
    first_seen_at: "2026-06-28T08:17:53.633Z"
    system:
      compound:
        status: open
  - id: INS-008
    kind: insight
    description: "Dim-0 mutation found daemon stalled-latch test is vacuous: removing the stalled latch guard stayed green because the test fixture becomes idle before duplicate ticks, so the latch is not load-bearing."
    first_seen_at: "2026-06-28T08:19:45.295Z"
    system:
      compound:
        status: open
  - id: WIN-001
    kind: win
    description: "flow-pair dogfood WIN: the cross-model reviewer (gpt-5.5) + mandatory Dim-0 mutation gate caught 4 real gaps the coder's (sonnet 4.6) own 982-green suite missed — a non-load-bearing first-inference gate (firstInferenceSeen set-but-unread), a VACUOUS stalled-latch test (mutation stayed green), and boundModel/failureReason declared-but-never-persisted. Same-model self-review would have shipped these. Cross-model + mutation-proof is load-bearing, not ceremony."
    first_seen_at: "2026-06-28T08:22:11.062Z"
    system:
      compound:
        status: open
  - id: DL-002
    kind: difficulty
    description: "Live-test bug (fixtures missed it): 'pij models --harness pi' returns 'no models found' because the harness filter matches provider===\"pi\", but pi proxies every provider — real provider keys are github-copilot/sakana/openrouter, none named 'pi'. Correct mapping: --harness pi => whole registry (no provider filter); copilot => provider github-copilot; claude => alias list. Fixture tests passed because they didn't exercise the harness=pi → all-providers case against real provider keys. Classic fixture-vs-live gap."
    first_seen_at: "2026-06-28T08:38:24.715Z"
    system:
      compound:
        status: open
  - id: INS-009
    kind: insight
    description: "Daemon-restart durability finding for fail-loud feature: the new whole-life dedup latch (this.pushed: Map<id,Set<stalled|dead>>, daemon.ts:53) is IN-MEMORY only. So a daemon restart resets it → a session already pushed 'dead'/'stalled' can be re-pushed ONCE by the new daemon. The once-per-transition guarantee is per-daemon-lifetime, not durable. Same volatility class as the SendBuffer (pre-bind buffered sends, lost on restart — the latent message-loss-while-down bug). Consider persisting the latch (or accepting at-least-once death pushes as a documented contract)."
    first_seen_at: "2026-06-28T08:45:13.200Z"
    system:
      compound:
        status: open
  - id: INS-010
    kind: insight
    description: "Live finding: a clearly-invalid pi model (e.g. glm-1m-bogus-xyz) makes pi EXIT at startup — the tmux pane closes within seconds and pi never self-registers, so the daemon's whole-life death-push never engages (nothing to track). Fail-loud for this case = the spawn-time validation WARNING only. Research F-07 assumed pi fails at first-inference; empirically a bogus NAME is rejected at startup (more like claude). The first-inference/quota path only engages for a VALID name whose provider then fails (case 3)."
    first_seen_at: "2026-06-28T09:25:11.283Z"
    system:
      compound:
        status: open
  - id: DL-003
    kind: difficulty
    description: "Live CASE-3 GAP (the motivating case): a pi worker on a VALID-name-but-out-of-credits model (fugu-ultra/sakana) registers fine, hits the credit error (console.sakana.ai/billing, retries 3/3), then sits state=idle with the error persistent in its pane — pid alive, not stalled. Result: NO quota death-push, failureReason stays 'none'. Two root causes: (1) pushWholeLifeTransition only fires on dead(pid-gone) or stalled(working+quiet); an idle-with-fatal-provider-error worker is neither, so it's invisible; (2) even if scanned, QUOTA_RE doesn't match 'credits'/'billing'/'prepaid credit balance exhausted' (INS-007). The fail-loud daemon-detection layer does NOT yet catch the exact case (provider out-of-credits) that motivated the feature. Spawn-time validation (cases 1+2) works; daemon detection for pi self-register + provider-failure is the gap. Fix: scan registered sessions' panes for fatal provider errors regardless of dead/stalled, and broaden QUOTA_RE."
    first_seen_at: "2026-06-28T09:27:10.931Z"
    system:
      compound:
        status: open
  - id: DL-004
    kind: difficulty
    description: "Live finding: spawn-time validation FALSE POSITIVE — 'pij spawn --harness claude --model sonnet' warns 'unknown model sonnet', but sonnet is a valid claude alias. The validator warns on anything not in its known set, but for best-effort harnesses (claude/copilot/codex) we CANNOT confirm unknown-ness, so warning is crying wolf. Correct posture: only warn when we can POSITIVELY confirm the model is absent (pi, full registry); for best-effort harnesses stay silent (or a soft 'unverified' note), never a false 'unknown model' warning. Fold into the case-3 fix."
    first_seen_at: "2026-06-28T09:32:54.331Z"
    system:
      compound:
        status: open
  - id: SUGG-001
    kind: improvement-suggestion
    description: "FIX-A: capturePane is called once per bound session per tick until the latch fires — the same pane is also captured by observeActivity. Could thread the pane capture through to avoid the double call if tick performance becomes a concern."
    first_seen_at: "2026-06-28T09:42:22.080Z"
    system:
      compound:
        status: open
  - id: DL-005
    kind: difficulty
    description: "MAJOR live finding (DL-003 deeper): the whole fail-loud whole-life push covers ONLY daemon-owned sessions (claude/copilot). The daemon tick (daemon.ts:85) guards 'if d.lifecycle!=bound || !daemonOwnsDelivery(harness) continue' — pi self-registers a lean descriptor with NO lifecycle/harness fields and daemonOwnsDelivery(pi)=false, so pi sessions are NEVER scanned. FIX-A's provider-failure detection (and stalled/dead push) therefore never fires for pi — yet pi is the MOTIVATING harness (pij-vigz1i's fugu-ultra/sakana 429 was a pi companion). Unit tests + 2 reviews + Opus all passed because they exercised the detection LOGIC directly, bypassing the daemon's session-filter. Only live testing against a real pi worker revealed pi is architecturally outside detection scope. Two fixes possible: (A) daemon scans ALL paned sessions for provider failures (contained), or (B) pi self-reports its own inference failures via its in-process extension (cleaner, bigger). DESIGN FORK — do not ship until resolved."
    first_seen_at: "2026-06-28T09:51:53.666Z"
    system:
      compound:
        status: open
  - id: SUGG-002
    kind: improvement-suggestion
    description: "pij daemon stall-watchdog FALSE POSITIVE: copilot peer (opus max, driving /the-flow) pushed 'stalled' while legitimately working a long background-agent 'Survey/explore' sub-task — footer showed Working and it kept progressing immediately after. Copilot's long background-agent steps don't refresh lastEventAt often enough, so the 60s stale threshold misfires on healthy max-effort copilot peers. Fix idea: longer stale threshold for copilot, or count footer-Working as activity so the watchdog doesn't false-alarm."
    first_seen_at: "2026-06-30T21:12:53.393Z"
    system:
      compound:
        status: open
  - id: DL-006
    kind: difficulty
    description: "flow-pair observe cannot capture a delegation diff when unrelated pre-existing dirty files include forbidden paths (plans 025/027 the-flow.json) — needs path-scoped diff capture, not whole-tree"
    target: "skills/flow-pair/lib"
    severity: "degrading"
    first_seen_at: "2026-07-02T23:16:05.332Z"
    system:
      compound:
        status: open
  - id: SUGG-003
    kind: improvement-suggestion
    description: "just flow-pair-mutate hardcodes its verify command to skills/flow-pair/test — mutations elsewhere (e.g. core/agents) need manual vitest selectors; recipe should take the test selector as an arg"
    target: "justfile"
    severity: "annoying"
    first_seen_at: "2026-07-02T23:23:28.558Z"
    system:
      compound:
        status: open
system:
  compound:
    bubble_action: "all-save"
---
