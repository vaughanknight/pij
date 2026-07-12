# Rulings — s042 pij orchestrator-routing skill

This is the durable ruling ledger for Plan 042. Direct Jordan rulings outrank
interview recommendations and relayed defaults. Repo-wide rulings are labelled
explicitly; superseded or fallback postures remain recorded rather than erased.

## R-001 — Automatic thesis

- **Direct Jordan ruling (verbatim)**:
  `also once an orchestraotr is briefd by prime, it should auto run the /thesis tool`
- **Source**: Jordan in s042 pane.
- **Source timestamp**: `2026-07-12T10:28:13+10:00`
- **Disposition**: CONFIRMED. A prime-briefed orchestrator invokes `/thesis`
  through the host skill mechanism before planning.

## R-002 — Builder owns planning

- **Direct Jordan ruling (verbatim)**:
  `get your flow set up then give me a spine.md of the requirements and a mermaid of the journey new orchestraors go on. then we will interview the otehr agent`
- **Source**: Jordan in s042 pane.
- **Source timestamp**: `2026-07-12T10:29:05+10:00`
- **Disposition**: CONFIRMED. The orchestrator uses guided `/builder` for
  research, workshops/POCs, the unified plan, and later ship.

## R-003 — Spine and journey before interview

- **Direct Jordan ruling (verbatim)**:
  `get your flow set up then give me a spine.md of the requirements and a mermaid of the journey new orchestraors go on. then we will interview the otehr agent`
- **Source**: Jordan in s042 pane.
- **Source timestamp**: `2026-07-12T10:29:05+10:00`
- **Disposition**: COMPLETED. `spine.md` and its Mermaid journey preceded the
  interview.

## R-004 — Lived-experience interview

- **Original ask (verbatim)**:
  `intervidw pij-uec99o nad ask it to interview its workers on how the user has been working through this flow.`
- **Clarifying Jordan ruling (verbatim)**:
  `was asking the interviewer to get your and your orchestraors lived expereien here... that was my intetn.`
- **Sources**:
  - `original-ask.md`, wishlist line.
  - Jordan via the vouched `pij-uec99o` channel.
- **Recorded clarification timestamp**: `2026-07-12T10:46:06+10:00`
- **Disposition**: COMPLETED. Observed lived evidence is primary; recommended
  doctrine is secondary. Evidence is vendored verbatim with SHA-256 provenance.

## R-005 — User-controlled build configuration and separate review

- **Original ask (verbatim)**:
  `users then nromally have to say when read to build /pij please build with a copilot gpt 5.6 sol coder and separate reviewer`
- **Source**: `original-ask.md`, wishlist line.
- **Disposition**: CONFIRMED. Validation does not authorize implementation.
  The stream stops at `WAITING_FOR_BUILD_CONFIG`; coder and reviewer are separate
  sessions.

## R-006 — Regular o-prime communication

- **Direct Jordan ruling (verbatim)**:
  `and of course it will be regularly communicating withthe prime during this  yeah?`
- **Source**: Jordan in s042 pane.
- **Source timestamp**: `2026-07-12T10:34:00+10:00`
- **Disposition**: CONFIRMED. Event-driven pointer reports cover preamble,
  plan/validation, blockers, human rulings, coordination changes, phases, and
  ship; no empty heartbeat chatter.

## R-007 — s042 is the dogfood acceptance run

- **Direct Jordan ruling (verbatim)**:
  `you are literally not following the very ideas we are talking about - you can dogofood our impovements now, this will demonstrate you undersatnd that we are basicaly impving this very flow we are using nnow.`
- **Source**: Jordan in s042 pane.
- **Recorded timestamp**: `2026-07-12T11:22+10:00`
- **Disposition**: CONFIRMED. This orchestrator performs preamble, Builder
  planning, and validation, then delegates implementation and separate review.

## R-008 — Worktree-per-stream is the repo-wide construction default

- **Jordan repo-wide ruling via o-prime AskUserQuestion (verbatim)**:
  `Yes — rule it repo-wide`
- **Source**: Jordan via o-prime `pij-3vetx8`, government spine Seq 44.
- **Recorded source timestamp**: `2026-07-12 ~05:20Z`
- **Direct Jordan confirmation in s042 pane (verbatim excerpts)**:
  - `just want to check you saw the directive on using worktress preferred`
  - `not saying we remove baton syste, but just checking you took this away too`
- **Direct confirmation timestamp**: `2026-07-12T12:30+10:00`
- **Disposition**: CONFIRMED, REPO-WIDE. Each stream constructs in its own git
  worktree and branch. Hand-rolled staging, manifests, quarantine, shared-tree
  apply windows, and commit slots are fallback mechanisms.

## R-009 — Builder ship and PR are the repo-wide landing default

- **Jordan repo-wide ruling via o-prime AskUserQuestion (verbatim)**:
  `Yes — rule it repo-wide`
- **Source**: Jordan via o-prime `pij-3vetx8`, government spine Seq 44.
- **Recorded source timestamp**: `2026-07-12 ~05:20Z`
- **Jordan mechanism relayed verbatim by vouched interviewer**:
  `worktrees and the /builder ship command to merge back via PR`
- **Disposition**: CONFIRMED, REPO-WIDE. `/builder 8 ship` owns branch push,
  PR creation, watched CI, and confirmed merge. Batons remain for runtime/timing
  purity, external shared resources, merge coordination, and shared-trunk
  fallback—not routine construction.

## R-010 — s042 implementation fleet

- **Direct s042 selection**:
  `Copilot gpt-5.6-sol xhigh coder + separate Copilot gpt-5.6-sol xhigh reviewer`
- **Relayed confirmation from o-prime (verbatim)**:
  `coder = copilot gpt-5.6-sol xhigh, reviewer = copilot gpt-5.6-sol xhigh, SEPARATE sessions`
- **Source**: Jordan selection in s042 pane, confirmed by o-prime `pij-3vetx8`.
- **Confirmation timestamp**: `2026-07-12T13:10:34+10:00`
- **Disposition**: CONFIRMED. `/pij pair` receives both model overrides
  explicitly; pair's built-in cross-model defaults do not apply.

## R-011 — Worker silence is outage-first

- **Jordan operating notice via o-prime/Telegram**:
  `Copilot API is having intermittent outages — workers may STOP RANDOMLY
  mid-packet after exhausted retries, and a stopped LLM cannot report itself.`
- **Source**: Jordan via o-prime `pij-3vetx8`.
- **Source timestamp**: `2026-07-12T14:57+10:00`
- **Disposition**: CONFIRMED, REPO-WIDE. Run a worker-liveness cadence (s042
  uses 15 minutes), treat silence as outage-class first, poke the existing seat
  before redispatch, and redispatch only if pokes fail.
