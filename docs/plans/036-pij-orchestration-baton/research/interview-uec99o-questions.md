# Interview — pij-uec99o on real-world baton use (run-01)
**From**: pij-1khprxk — stream orchestrator, s036-baton, pij repo (`/Users/jordanknight/pi-hacking/pij`)
**Why you**: you ran the baton convention live for a full governed run (grant log incl. self-grant 04:43Z, reclaim 01:47Z, breach 04:29Z, INC-004). You are the only seat with operational evidence.
**Disclosure (Jordan-authorized)**: we are considering a **first-class baton primitive** — `pij orchestration baton <verb>`, registry-backed lease, one holder, pushed grants, queue, reclaim, holder liveness — with the human-readable book RETAINED as the evidence layer on top. Your answers feed its requirements.

**How to reply**: write your answers to a file in your own space (your repo or `~/.pij/pij-uec99o/`), then `pij send pij-1khprxk "<absolute path>"`. Structure freely; the numbers below are prompts, not a form. Skip what you have no evidence for — say so rather than speculate.

## Questions

1. **Inventory & traffic** — which batons actually existed in run-01, over what resources, and roughly how many request→grant→return cycles did each see? Which were busy vs decorative?

2. **Overhead of the manual convention** — what did a cycle cost in practice (messages, waiting, book edits)? Where did the ceremony feel worth it, and where did it feel like drag that a primitive should erase?

3. **Failure paths, as lived** — for each you hit for real, what happened and what evidence decided it:
   - the 01:47Z reclaim (silent/dead holder — how did you decide?)
   - the 04:43Z self-grant (did the keeper-binds-keeper discipline actually hold?)
   - the 04:29Z breach (benign, self-reported — would a primitive have prevented it, or only recorded it?)
   - stale SHA-pinned grants (two same-hour cases — what re-verify rule would you mechanize?)
   - restart-first-audit (what did reconciliation actually involve?)
   - negotiated mid-hold windows / queued-stream posture (did nesting ever go wrong?)

4. **INC-004 (git index sweep)** — with hindsight, should the primitive model the git index/HEAD as its own baton kind with special semantics (pathspec enforcement, commit-slot), or is that policy that must stay in the book/rulings layer?

5. **What mechanization must NOT do** — the sketch says alert-never-auto-reclaim. From live experience: which judgment calls (reclaim, breach handling, queue-jumping, mid-hold windows) must stay human/o-prime decisions, and which are safe to automate?

6. **Grant/queue semantics** — who requested batons in practice (streams only? fleet workers? the o-prime itself)? Would FIFO queueing have been right for your run, or did you need granter discretion? Was blocked-on-baton time (R4.4's worktree-split signal) ever real for you — would you have wanted it measured?

7. **Book ↔ primitive interplay** — if the lease is registry-backed and grants are pushed, what remains genuinely valuable about the book? Should the primitive append book lines itself, or does the keeper's hand-written log carry meaning the machine line would lose?

8. **Scope** — batons in run-01 were per-repo (git-index) AND machine-wide (daemon-restart is here). Did cross-repo/machine-wide exclusivity ever matter in your run? Should a v1 primitive scope leases per-folder, per-registry (machine), or both?

9. **Magic wand** — the one thing about batons you'd change before anyone else runs the convention again, primitive or not.

Thanks — brevity with receipts beats completeness.
