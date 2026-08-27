# INC — cross-government pane misbind (2026-08-27 ~09:44Z)

Seat pij-nasty-tick (parent pij-static-giraffe, WorkIQ government; pid 58644; paneId None) had its preamble/brief delivered by typed keys into an UNREGISTERED Copilot pane %108 (a Flash lab pane opened by pij-relative-panther in pij-prime:flashlab, cmd: copilot --yolo --model gemini-3.6-flash). The pane acted on it (ran skill(pij)). Second lab pane %109 (--ui-server --port 64990) also showed pij-skill UI text.

## pane %108 — observed by the o-prime at ~09:44:30Z (pane vanished before file capture; capture call returned "can't find pane: %108")
```
  ❯ You are now a pij peer (id: pij-nasty-tick), spawned by pij-static-giraffe. Message other sessio…
 ● skill(pij)
```
Hypothesis (unverified at write time): the pane was killed by a `pij close pij-nasty-tick` from its owner, the daemon resolving that seat's pane to %108.

## pane %108 capture (failed)
```
```
## pane %109 capture
```
  Current   Sessions   Issues   Pull requests   Gists
  ╭─╮╭─╮
  ╰─╯╰─╯  Copilot v1.0.81-14 uses AI.
  █ ▘▝ █  Check for mistakes.
   ▔▔▔▔
 ● Server listening on port 64990
 ● Tip: /copy
   └ Copy the last response to the clipboard
 ! Failed to load 1 skill. Run /skills for more details.
 ! MCP server 'workiq' requires authentication. Use /mcp auth workiq to connect.
 ! Failed to load 1 skill. Run /skills for more details.
 ! MCP server 'workiq' requires authentication. Use /mcp auth workiq to connect.
 ✗ Failed to restore interrupted sessions: Error: Session 32781b44-3567-4bc5-b9fc-03e19fabe1ff is already in use
 ● MCP Servers reloaded: 6 servers connected
 Restore interrupted sessions:
  All   Local   Remote
 Choose which sessions to restore. Sessions that were open when Copilot stopped are preselected.
       #    Summary                                                                                                                         
 ┃ ❯   1.   Configure Pij Peer Settings (main)                                                                                              
 ┃     2.   Setup Pij Peer Communication (s392/day3-codex-doctrine)                                                                         
 ┃     3.   Configure Pij Peer Settings (s392/day3-codex-doctrine)                                                                          
 ┃     4.   Implement Phone Home Feature (s387/prose-credibility)                                                                           
 ┃     5.   Setup Pij Peer Communication (s391/item6-long-context)                                                                          
 ┃     6.   Implement Phone Home Feature (s383/content-launch)                                                                              
 ┃     7.   Implement Phone Home Feature (s386/personas)                                                                                    
 ┃     8.   Implement Pij Peer Messaging (s391/item6-long-context)                                                                          
 ┃     9.   Find Team Role Responses (main)                                                                                                 
 ┃     10.  Configure Pij Peer Settings (main)                                                                                              
 ┃     11.  Setup Pij Peer Communication (main)                                                                                             
 ┃     12.  Configure Pij Peer Settings (main)                                                                                              
 Failed to restore interrupted sessions: Error: Session 32781b44-3567-4bc5-b9fc-03e19fabe1ff is already in use
```
## registry at capture
```
pij-nasty-tick: done · dissolved   (last event 11m32s ago, pid 58644 gone)
  cwd: /Users/vaughanknight/GitHub/workiq  ·  harness: copilot  ·  parent: pij-static-giraffe  ·  model: mai-code-1-flash-internal  ·  effort: low  ·  daemon tick: stale (never old)  ·  terminal: requested at 2026-08-27T09:35:05.408Z (pane-missing)
```

## Timeline correction (from `pij spine events --peer pij-nasty-tick`)
- 09:34:38Z dispatch to pij-nasty-tick by pij-static-giraffe (dispatch-cdf65e05) · 09:34:51Z `missing-telemetry` · dissolved shortly after (owner closed it: requested MAI Flash silently fell back to Sol; WorkIQ PA setup paused by Vaughan).
- ~09:44Z o-prime opens two unregistered Copilot lab panes (%108, %109) in pij-prime:flashlab.
- ~09:44:30Z pane %108 shows the nasty-tick preamble typed in and runs `skill(pij)`. **The seat had been dissolved ~10 min earlier** → this is pending mail for a DISSOLVED seat, re-delivered by the daemon's pending-recovery path, with target resolution binding an unrelated, unregistered pane of the same harness.
- %108 vanished before file capture (cause unverified).

## Mechanism (two halves, both must be fixed)
1. Mail queued to a seat that is later deliberately closed stays `queued` and is retried — **s391 item 1 (retire on complete deliberate close)** prevents the retry. This incident is item 1's acceptance case #2.
2. Pending-recovery / pane resolution for a pane-less copilot seat accepted an unregistered pane of the same harness — **item 10 (s392)**: binding must require the seat's own deterministic `--session-id` (copilot) / native session evidence; an unregistered pane is never a delivery target.

## Related
- Old spine Seq 71 / 11:56Z "birth-side resurrection outpaces symptom sweeps" — same defect class.
- Flash lab result is VOID (panes contaminated). Separately verified: a Flash seat spawned on main 5445c85 launches without `--context` and STILL 400s interactively (item 6 fix necessary, not sufficient) → item 6b.

## Resolution state (2026-08-27 12:5xZ)
- Half 1 — retire mail on complete deliberate close + drain never injects for a dissolved descriptor: **LANDED** (PR #9, item 1; in force since the 12:38Z daemon restart at f4ba6ec0).
- Half 2 — pane resolution/bind guard requires the seat's own session evidence; six ad-hoc resolvers replaced by one lifecycle-filtered resolver + sweep test: **PENDING** (s392 item 10b, with 10a folded in; after item 12).
- Interim rule (orient-local): no unregistered harness panes in tmux; pane-less copilot spawns prohibited machine-wide (WorkIQ prime acknowledged).
- 2026-08-27 13:5xZ — Half 2 (bind guard + shared lifecycle-filtered resolver for the six ad-hoc sites + grep-sweep test + actual-route replay) **APPROVED** at `c49806e` (cold review, 6/6 guards load-bearing, replay non-vacuous); landing as the 10a+10b PR. **In force only after the next coordinated daemon restart** (loop.ts bind guard is daemon-side); CLI-side resolvers take effect on ff. Follow-up item 17: bind refusals must log and distinguish indeterminate-probe from foreign (ADV-2), win32 allowlist (ADV-4), sweep bypass shapes (ADV-3), `isCopilotSessionId` coverage (ADV-1). The pane-less-copilot prohibition lifts when the restart lands.
