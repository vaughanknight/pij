# pij-team — prototype experiences log

Living log while we prototype the prime→pm→coders→reviewer pipeline. Every
friction, surprise, or improvement idea lands here AS IT HAPPENS (newest at the
top of each section), so the templates/packets/extension can be improved before
we hand the pattern to pij and the harness. Also `harness observe` each one.

## Decisions taken while prototyping

- 2026-08-28 — dd schemas for the new doc types live in `.dd/schemas/pij-team/`
  (settings, packet, impl-guide); templates live in the skill folder and are
  `cp`'d into plan folders. One shared `packet` schema for all three roles;
  the role field + template selects the flavour.
- 2026-08-28 — settings live at `.harness/government/settings.dd.json`
  (o-prime single-writer). First settings: model defaults per role
  (pm/coder = omp github-copilot/claude-opus-5 high; reviewer = gpt-5.6-sol,
  id verified against `pij models`).
- 2026-08-28 — impl-guide default isolation = worktree-per-coder branching off
  the PM's plan branch, PM merges units back (retro 008: shared-tree was the
  #1 hurt cluster; era-2 cutover ruling). Fences partition write intent, not
  the build — waves must respect build deps.

- 2026-08-28 — TENETS.md added (Jordan: give me the core tenets incl. the
  importance of the arch split; source = scratch/reconstruct manifesto 04/07 +
  retro evidence). It is a LIVING doc: packets cite it by path, every run must
  improve it, and the graduation target is harness/pij first-class substrate.

- 2026-08-28 — Jordan ruling: the skill is TECH-AGNOSTIC (works in any repo);
  Rust/this-repo mechanics are worked examples only, instantiated per-plan in
  the impl-guide. And each run gets a telemetry analysis pass (xoxarle) over
  the seats' actual transcripts to drive template iteration.

- 2026-08-28 — Graduation path made concrete (Jordan): pij-massive-meadowlark,
  the harness-engineering prime, will absorb pij-team into the harness as
  FIRST CLASS after our initial trials + fixes complete. It is trialling the
  technique on its current bun work now; compare-notes session follows both
  runs. Everything in this folder is therefore written to be handed over:
  tenets, templates, schemas, and this log are the absorption spec.

## Frictions / open issues

- 2026-09-02 (ferret, PM 132): A WORKER-STARTED FLOWSPACE3 DAEMON IS NOT
  ISOLATED BY USING THE DEV DATABASE. The daemon still rewrites the
  machine-global `daemon.key`; this broke search for every seat until prime
  restored production. The packet's old "dev DB + free port" rule was unsafe.
  Worker/reviewer packets must say never start `flowspace3 daemon`; if prod is
  down, report it to prime. A future safe worker daemon needs an isolated
  config/key path as well as an isolated database and port.
- 2026-09-02 (ferret + Opus R1-R4, PM 132): THREE DEFECTS HAD THE SAME MISSING
  STATE: unreported model vs observed no-model, unavailable tmux inventory vs
  observed missing pane, and socket probe error vs observed unreachable. A
  boolean decision table silently turns UNKNOWN into a destructive negative.
  Least-confidence lists and reviewer packets should explicitly ask for
  `positive / negative / unknown` whenever an observation authorizes loss.
- 2026-09-02 (ferret, PM 132): TMUX-DRIVING GATES MUST RUN SERIALLY. Running
  `cargo test --workspace` beside `harness checks` smoke caused one tmux input
  convergence failure; the isolated test and full 612-test serial rerun passed.
  The PM composition template should serialize terminal-driving proofs even
  when their build systems are otherwise independent.

- 2026-09-02 (ferret, PM 133): CROSS-MODEL REVIEW CONFIRMED TENETS 5/11
  AND ADDED THE MISSING CONFIGURATION-SYMMETRY RULE. Every local gate was
  green and the live happy path worked, yet the Opus reviewer measured that
  69/69 panes satisfied the supposed legacy discriminator: the sink file was
  inventory, not ownership. Every refusal test had omitted the production-only
  injected legacy root, so it passed through an early return instead of the
  safety predicate. Packet/template improvement: the least-confidence list
  must name production-only constructor inputs, and a safety discriminator's
  refusal witness must run with those inputs enabled and be observed RED on the
  old implementation.
- 2026-09-02 (ferret, PM 133): A LOCAL GREEN IS NOT A SHIP GATE WHEN ITS
  COMMAND DIFFERS FROM CI. Plan AC5 and the PM receipt used `cargo clippy
  --workspace -- -D warnings`; CI adds `--all-targets`, which alone linted the
  new integration test and found a real blocking error. Reviewer packets should
  read the CI command before accepting any locally named gate, and the plan
  template should import/cite the governing command rather than restating a
  near-fit.
- 2026-09-02 (ferret, PM 133 — second same-day confirmation of the planarian
  finding below): REVIEWER TRANSPORT MUST CONVERGE BEFORE CANARY. Spawn minted
  legacy id `pij-resulting-barnacle` while pane/pid/session evidence bound rs id
  `pij-obnoxious-primate`; canary/send correctly refused the contradiction and
  the reviewer could report only through the observable rs id. Prime recorded
  this under req-0039. The dispatcher must bind the reviewer in the selected
  generation before emitting its reply address.
- 2026-09-02 (ferret, PM 133): FLOWSPACE DOGFOOD FOUND THREE TOOL-SHAPE GAPS:
  ddoc search hits return addresses that `flowspace3 get` rejects for lacking
  `el:`; hidden `.pi/` paths are absent from the index; and two bounded `ask`
  runs consumed 54k+ tokens / 141-180s without synthesising while direct `get`
  on their citations answered the question. Search packets should route ddoc
  hits to `ddocs get`, declare hidden-index coverage, and cap/fallback `ask` to
  direct element reads after one bounded failure.
- 2026-09-02 (planarian, PM 125 — req-0034 instance): REVIEWER TRANSPORT MUST
  CONVERGE BEFORE THE CANARY. `pij spawn --harness claude` produced a legacy
  descriptor while the PM lived in rs; PM→reviewer sends returned no-registry,
  reviewer→PM replies queued, and legacy resolution later misidentified the PM
  as the reviewer. Prime's working recovery was to type `pij adopt
  "$TMUX_PANE" --harness claude` into the reviewer pane, with Enter as a
  separate keystroke. Encode that adoption in the Claude reviewer dispatcher;
  a packet instruction cannot repair two address spaces after dispatch.
- 2026-09-02 (planarian, PM 125): A WORKTREE LIVE WITNESS MUST EXCLUDE THE
  GLOBAL EXTENSION COPY. Bare `omp` in the linked worktree loaded main's
  globally linked pij extension, so an apparent 10/10 said nothing about the
  branch. `omp --no-extensions -e <worktree>/.pi/extensions/pij/index.ts`
  proved the branch; the identical shape against the pre-fix main extension
  missed 1/10. Reviewer packets for extension work should demand both the
  explicit worktree load and an identical-shape pre-fix control.
- 2026-09-02 (planarian, PM 125): packet paths drifted before work began:
  `.agents/skills/pij-team/TENETS.md` and government `settings.dd.md` did not
  exist in the dispatched tree; the working doctrine was under
  `.agents-skills-port/pij-team/`, and the model had to be discovered with
  `pij models`. Templates must emit paths that resolve in the target worktree.

- 2026-08-28 (duck, team-new POC): untracked skill/schema folders are INVISIBLE
  in fresh worktrees — ddocs build dies E401 there while passing on main
  (DL-032; fix = commit the substrate, done via PR). ddocs resolves schemas
  from CWD not the document's ancestors — scaffold tooling must keep cwd =
  worktree root (CONF-009). `git worktree remove` needs --force on a fresh
  plan worktree (untracked plan folder, DL-033). `harness plan new` writes
  meta.ordinal as number 5 while the folder says 005 — never assume string
  equality. `pij whoami` exists but was not discoverable (DL-034 amended).
- 2026-08-28 (meadowlark, bun run): ordinal-minting before human approval is a
  bad fit for investigate-mode work (F2) — scaffold extension gains a
  --propose/dry-run mode (compute + print, mint nothing until GO).

- 2026-08-28 (narwhal, PM run 1, at ACK): BLOCKING packet defect — prime's
  packet referenced gitignored scratch/ inputs (recipe, payload spec, oracle
  script) that exist only in the main clone; invisible to every dispatched
  worktree. Ruled: vendor inputs into the plan's assets/inputs/, sha-pinned.
  Encoded as the "refs must resolve where the seat lives" rule in SKILL.md.
  Also confirmed twice-over: the ack-as-control-point works (this + horza's
  fence extension + duck's status-vocabulary deviation all caught pre-code).

- 2026-08-28 (piranha, PM run 1 after seat death): a successor cannot tell
  "written and passing" from "written and never run" off disk alone — it had
  to re-run everything. Encoding idea (strong): phase work writes its own
  GREEN RECEIPT (gate output + timestamp + tree sha) as an artifact at each
  edge, so inheritance starts from a proven point. Candidate for the
  harness-native absorption (a `harness gate receipt` shape).
- 2026-08-28 (piranha): tk-c105's oracle turned out to be a SUBSET oracle
  (reconvo.py reads 3 of 4 stores, omp messages only) — the honest fix was
  grading proof per store (oracle-derived / mirror-derived / PM-derived) and
  a UNIVERSAL structural claim (emitted ordinals = in-order repeat-free
  subsequence of the store). Lesson for impl-guide templates: state the
  oracle's COVERAGE, not just its identity.

- 2026-08-28 (silkworm PM3, the near-miss of the run): a DONE unit — green
  gate, mutation-checked — carried a silent-data-loss defect (turn numbering
  scoped per session while the PK is per conversation; colliding turns
  idempotently DROPPED while the ledger said stored). It surfaced ONLY because
  the hold-for-composition step let the PM ask the live seat what it had
  ASSUMED about the composition it does not own. Encoded: coder done-reports
  now require an explicit ASSUMPTIONS section (packet-coder d5); PMs ask
  before wiring (packet-pm i5). Had the seat died with its siblings, this
  shipped. Also: silkworm chose the authoritative fix (MAX(turn_no) high-water)
  over the remember-a-rule fix — the right instinct, constraints nobody
  enforces mechanically are future defects.

- 2026-08-28 (silkworm PM3, the platform find of the run — DL-007/008, evidence
  at 005 assets/rescue/): worktree-resident seats' FILE TOOLS resolve relative
  paths against the SPAWN cwd (main clone) while their shells resolve against
  the worktree — three obedient seats had their edits land in the PM's shared
  tree, tools echoing success byte-identical to the correct case, producing
  FALSE GREEN builds (exit 0 on a workspace that never heard of the new dep;
  proven by a controlled mtime comparison, path form the only variable).
  Encoded: absolute-paths-always in the coder scope note; prove-in-tree
  evidence (lockfile/mtime/artifact) in the done-bar — an exit code is honest
  about what it built and silent about what it did not. REAL FIX IS PLATFORM'S
  (pij/harness): seat file tools must resolve against the dispatched worktree
  or refuse relative paths when spawn-cwd and shell-cwd disagree.

- 2026-08-28 (u2 via silkworm, three seats converging — a done-bar DESIGN
  PRINCIPLE, not a plan fact; CORRECTED same day by u2 reviewing its own
  claim): a subsequence assertion constrains order, repeat-freeness, and
  membership in the store id set — and is blind to CARDINALITY IN BOTH
  DIRECTIONS (over-emission: a split group is still a valid subsequence;
  under-emission: a subset in order IS a subsequence). Two seats' mutation
  checks passed both frozen assertions while emitting 20-for-13 and
  22-for-16. When writing a contract suite's done-bar: assert SET EQUALITY
  wherever the expected set is genuinely known; where only counts are known,
  pin the count from a source INDEPENDENT of the implementation (oracle or
  hand-count, provenance-graded) — a count harvested from the implementation's
  own output is circular wherever it lives. Ruled as a frozen-contract
  amendment on 005 with the two escaped mutations as the regression pair.

- 2026-08-28 (silkworm PM3, amendment close-out — two review-craft lessons):
  (1) MUTATION-CHECK, don't assert-check: run the faithful mutation, and when it
  PASSES, chase why before moving on. Silkworm's weaker claude mutation
  (adjacent-run fold within the assistant projection only) legitimately passes —
  the fixture's assistant-projection ids are contiguous, so it is not a
  behaviour change on those bytes. Recording that honest negative in the
  amendment stops a later reader misreading its passing as a coverage hole; a
  harsher first-draft mutation would have claimed success without ever finding
  it. (2) A reviewer can be RIGHT about the weakness and WRONG about the
  exploit: u2's "empty ordinal" defect was unreachable (the filter already
  required uuid.is_some()) — the real defect was an invariant held several
  functions away from the code depending on it, with nothing connecting them.
  The author proving which is what made the fix the right shape: move the
  invariant into the TYPE, not add a test for the phantom exploit. Also:
  cross-store claims must read the COMMITTED corpus bytes, not a grown scratch
  fixture — the SourceFixture torn-record hold-back makes a grown copy
  legitimately one record short, and an honest failure for the wrong reason is
  exactly what gets "fixed" by weakening the expectation.

- 2026-08-28 (planarian, DL-049 fix): FIXTURE FIDELITY — when a refusal chain
  has an order, an unfaithful fixture makes an EARLIER guard answer for the one
  under test. Its first sandbox had no real origin, so the squashed commit read
  as unpushed and tidy refused E_UNPUSHED_COMMITS — the OLD code path — and a
  careless reading of that run would have concluded either "fix doesn't work"
  or "harness broken". Rebuilt with an isolated bare remote and a genuine
  push → squash-merge → push cycle so the merge is shaped exactly like
  GitHub's. Pair each verdict with its raw evidence (git cherry output beside
  every envelope) so the verdict is auditable, not asserted.

- 2026-08-28 (fleet dogfood survey, silkworm's answer the headline): A MANDATE
  WITHOUT A SENSOR LAPSES SILENTLY. The seat most motivated to dogfood the
  product, on the plan that builds it, ran ZERO product searches for hours and
  never noticed — "there was never a moment where I weighed search against
  grep; the question never arose." Its own verdict: "the mandate needs a
  sensor, not more emphasis." Generalises to every packet instruction that is
  a standing behaviour rather than a deliverable: if compliance is not a
  visible fact (a count, a boot line, a receipt), non-compliance is invisible
  even to the non-complier. Suggested encoding: surface per-seat usage counts
  at boot/status so zero reads as a fact. Same survey, independent retrieval
  finding twice over: verb/function-shaped queries rank prose ABOUT an action
  above the code PERFORMING it (silkworm: enqueue question hit a docs section;
  dogfood-research run: claude-adapter.ts at rank 11/12) — candidate boost for
  code-with-verb-intent, and sloth's `flowspace3 explain` diagnostic verb
  (DL-050) is the companion product idea.

- 2026-08-28 (w-agentic-query promotion, Jordan caught it): a POC PROMOTED TO
  PRODUCT SLIPS PAST THE PACKET SUBSTRATE by default — the seat had a scratch
  brief, a VERDICT.md, and rulings scattered across messages, but no
  impl-guide and no packet doc, because promotion happened conversationally
  ("make it real") rather than through the pipeline's front door. Messages are
  not a packet: they don't survive compaction, can't be validated, and the
  fence/done-bar were nowhere durable. Rule: PROMOTION RE-ENTERS THE DOCTRINE
  — even a single-coder packet instantiates impl-guide + packet-coder from the
  templates before code, with the POC's VERDICT as the impl-guide's primary
  input. The POC is evidence FOR the packet, never a substitute for it.

- 2026-08-28 (leopon PM 006, two ack-surfaced defects worth the doctrine):
  (1) TEMPLATE d4 AMENDED (done same day): the blanket "you never wire it in
  yourself" contradicted a done bar that is a live probe-predicate flip —
  unreachable if the unit is never wired. New rule: wire yourself only when
  the wiring file is uncontended AND the done bar is behavioural; recipe
  ships regardless so composition verifies rather than re-derives. The
  template was wrong, not the coder — acks catch template defects too.
  (2) CALIBRATE, DON'T PICK, ANY THRESHOLD THAT TEACHES: u-c justified a 0.78
  weak-match floor off a hit that was an excellent semantic match whose
  wrongness was PROVENANCE, not similarity — while 0.63 answered the best
  real query correctly. A mis-set floor flags successes as weak and teaches
  agents to ignore the hint. Ruled: a should-match vs should-not table with
  best scores, floor at the separation point, named constant documenting it
  was calibrated against one embedder on one corpus. Generalises: any
  constant whose job is to CHANGE AGENT BEHAVIOUR gets calibrated against
  measured cases, never picked from one anecdote.

- 2026-08-28 (leopon CONF-002, its own defect, generalises): SAFETY RULES MUST
  NAME THE FORBIDDEN OPERATION, NEVER THE RESOURCE. "Never point at the live
  database" (a resource) was read by a conservative coder as a total ban — it
  withdrew a perfectly good READ-ONLY calibration table it had already
  produced and nearly rebuilt a synthetic corpus to re-derive an approved
  number. The rule meant "never WRITE to it" (an operation class). The
  conservative agent over-complies by discarding valid work, which is a
  quieter failure than under-compliance because nothing errors — work just
  silently gets worse. Packet safety lines should be phrased as operations
  (write/mutate/enqueue), with reads explicitly allowed when they are.

- 2026-08-28 (DL-004 spend incident, leopon/louse/knobbler): three lessons.
  (1) COST HAS A SIGNAL: louse stopped a paid-provider drain from its own log
  alone — "a fast summarize call is cached; a slow one is a provider" — a
  latency instinct that beat the PM's check by a minute. Teach it: unexpected
  slowness on a should-be-cheap path means someone is paying.
  (2) A SHARED TEST DATABASE IS A LOADED GUN when it accumulates real roots +
  a job backlog and ambient config selects real providers: any daemon boot
  starts paying. Neutralise residue deliberately; never let "test" imply
  "harmless to attach a daemon to".
  (3) WHEN TWO SEATS INDEPENDENTLY REINVENT AN ISOLATION RECIPE WRONG WITHIN
  MINUTES, THE FIX IS A VERB, NOT A BETTER RECIPE — and check whether the
  primitive already exists first: FreshDatabase already solved this for the
  test tier; the gap was reach (test-support-only) and tier (nothing for
  hand-run daemons). Promote existing primitives before building new ones.
  (4) THIRD INSTANCE (silkworm, same day, ~560 summaries + 570 embeddings):
  "THE DATABASE WAS SEALED; THE WALLET WAS NOT." Each burned seat sealed a
  DIFFERENT subset of the overrides — db but not config, port but not db —
  because a checklist lets you pass the items you know about. A verb seals
  everything or nothing; that asymmetry is the whole argument for --sandbox.
  (5) A CHECK IS ONLY A GATE WHEN THE READER KNOWS THE FAILURE VALUE:
  silkworm READ embedder=azure_openai in its boot line and took it as
  reassurance that wiring was correct. State the expected value in the rule
  ("verify it prints embedder=fake"), never just "check the line".

- 2026-08-28 (leopon retraction, knobbler refutation — the subtlest verify
  failure of the day): SOURCE-BACKED AT THE WRONG LAYER. A defect claim
  ("--path treats _ as a SQL wildcard") was verified against the STORE (doc
  comment + LIKE binding) — but a conversion boundary (glob_to_like, with
  unit tests escaping _ and %) sat between the user and that store, so the
  user-facing claim was false despite every cited line being real. Verify-
  then-relay must mean THE LAYER THE USER TOUCHES; a claim about semantics is
  only proven at the surface that exposes them. Counterpart credit: the coder
  refuted its own PM with source and tests inside twenty minutes and did not
  implement around the claim in either direction.

- 2026-08-28 (sloth, w-search-degenerate — two test-craft lessons for the
  log): (1) ITS REGRESSION TESTS PASSED AGAINST THE BROKEN CODE on first run
  — the defect lived on exactly one query plan, and Postgres never chooses
  that plan on a table small enough to seed. Only the MUTATION run exposed
  the vacuous pass; the fixture was then rebuilt to REMOVE the alternative
  plans rather than out-cost them, with the trap documented in the test file.
  Plan-dependent defects need plan-pinned fixtures. (2) IT DELETED A FLAKY
  TEST RATHER THAN SHIP A COIN FLIP: pgvector randomises HNSW construction,
  so a scan-budget squeeze passed 1-of-3 then 2-of-3 — replaced by a
  deterministic decision table over the reason enum plus one end-to-end test
  on a deterministic path. A test that fails on a coin flip teaches people to
  re-run, which is worse than no test.

- 2026-08-28 (005 cross-model review, all four findings CONFIRMED — three
  lessons): (1) A SAFETY CHECK THAT CANNOT FAIL IS NOT A CHECK: the PM-s
  accounting backstop was an arithmetic identity (accepted + (len-accepted)
  == len), true of every input — it was cited in receipts as a safety
  property. When a reviewer or coder hands you the correct check in plain
  words, implement THAT check, and mutation-test backstops like any other
  assertion. (2) A STRUCTURAL CLAIM IS VERIFIED AGAINST THE MECHANISM, NOT
  THE NAME: SERIAL_KINDS meant claimed-one-at-a-time, not run-one-at-a-time
  — the documented serialisation did not exist and first light had two live
  queue keys for one conversation. Named like a guarantee ≠ is a guarantee.
  (3) NEVER NARROW AN AC AFTER CHECKING IT to match what was built — ruled on
  F-002: the link the AC promised gets persisted (migration), because
  retro-narrowing is the move we refuse from coders and therefore from
  ourselves. Cross-model review earned its seat: 4-for-4 confirmed findings
  on a gate-green, mutation-checked composition.

- 2026-08-28 (carp, 007 — the byte-witness collision): A BYTE-FREEZE BELONGS
  ONLY WHERE A DIFF CAN MEAN NOTHING BUT A CONTRACT BREAK. Two goldens went
  red because their verbs SERVE bundled editorial docs as payload, and the
  same PR is required to edit those docs — a tripwire that fires on every
  deliberate improvement gets muted, and a muted tripwire protects nothing.
  Ruled: computed payloads stay byte-frozen; editorial payloads get SHAPE
  assertions including a POSITIVE content check (the page must contain the
  rules the plan shipped). Two doctrine points: (1) A RED GOLDEN MUST NEVER
  BECOME A CAPTURE CHORE — the coder stopped instead of re-capturing, which
  is the whole mechanism working; re-capture-as-routine kills the witness.
  (2) Check what already witnesses the thing: editorial bytes are committed
  content, so git diff + PR review already guards them — the golden was
  duplicating a protection on exactly the payload class where it misfires.

- 2026-08-28 (carp, 007 — the witness meets the real world): the byte-goldens
  caught their first FOREIGN change — daemon auth (#43) merged under the
  plan, and all fifteen cases went red in one command with UNAUTHORIZED: the
  bytes had not moved, the CLI-s PRECONDITIONS had. A frozen witness guards
  against drift the plan cannot foresee, not just drift the plan makes.
  Corollary ruled same hour: NEVER ADD A KNOWINGLY-RED ASSERTION — a content
  check whose subject lives in a sibling-s undelivered tree waits for
  composition; red-you-plan-to-ignore teaches ignoring red (same family as
  the capture-chore rule). Also: when a base-move poisons live smoke tests
  for multiple in-flight coders, merge main IMMEDIATELY, not at composition.

- 2026-08-28 (silkworm, the reviewer-brief lesson — encoded into the
  reviewer template as i2b): A CROSS-MODEL REVIEWER IS ONLY AS GOOD AS ITS
  BRIEF. Tell it (1) where the author is LEAST confident, (2) to DISBELIEVE
  the author's own receipts, (3) what is already KNOWN-OPEN. Result: its
  entire budget lands on what the author could not find — 4 findings, 4
  confirmed, zero style noise, zero findings wasted re-reporting known
  items, including a defect the author had hunted for in writing and could
  not see from inside. Twenty minutes of brief-writing is the price of a
  review worth its model. Companion schema lesson (F-002): when a link
  arrives on only ONE of many upserts, COALESCE beats EXCLUDED (the polls
  that do not carry it must not erase it), and arrival order of independent
  files must never be a correctness condition — a dangling reference that
  means "not ingested yet" is a state to report, not a constraint violation
  to refuse.

- 2026-08-28 (leopon, 006 first light): A MISLEADING ZERO IS WORSE THAN A
  REFUSAL. Fake providers (correct for spend safety) produce vectors with no
  semantics — so a wrong-version-leak predicate read 0 from BOTH checkouts
  and nearly got reported as "leak closed" when it was measuring garbage
  ranking equally against garbage. Fixed in the harness: the probe reads the
  embedder from the daemon-s own boot line and emits
  unmeasurable-fake-embedder instead of a number, plus a control (the
  probe-s own marker must be findable from its OWN worktree, or a leak of 0
  is measuring absence, not exclusion). Same principle as the eval-s
  three-valued rows: missing instrumentation must never masquerade as a
  result, in either direction. Corollary ruling: when "the test" of a
  feature IS the feature going live for everyone (auto-registration into the
  production index), it is a DECISION with the human named, never a side
  effect of proving something.

- 2026-08-28 (roadrunner, external dogfood — a probe-design lesson): TWO
  PROBES READING THE SAME GAP ARE ONE PROBE. A miss was attributed to
  ranking because "a code-vocabulary retry missed identically" — but both
  queries were blind to the same unenriched files, so the retry could not
  discriminate ranking from coverage; enrichment finished and the same query
  hit #1. To rule out coverage you need a probe with a DIFFERENT blind spot
  (e.g. a known-enriched control), not a rephrasing. The reporter retracted
  its own emphatic claim before we built on it — propagate corrections at
  the same volume as the original claim.

## Template improvement ideas

- 2026-08-28 (carp's 007 fan-out — two dispatch patterns worth template rank):
  (1) SAME LINE-LEVEL COLLISION MAP IN EVERY PACKET: when sibling units share
  a crate, name the shared files down to the match-arm/line and put the
  IDENTICAL map in each coder's packet — where the coder reads it — rather
  than only in the impl-guide. Any need to cross the map is a stop-and-ask.
  (2) THE DECLINED LIST: an allowlist grant should also name the crates that
  were CONSIDERED AND REJECTED (with the source that rejected them), so no
  coder re-litigates a settled choice mid-unit. Both from packet set e06894b.
- 2026-09-02 (planarian, PM 125): reviewer i2b was decisively confirmed. The
  least-confidence list aimed Claude Opus at the timer/reassert/cancellation
  seam; it found the missing tests, false late-warning ordering, dishonest
  blind fallback, and unhandled rejection while ignoring style noise. Three
  review rounds closed every finding, and the final converse assertion came
  from the reviewer's own smallest-fix wording. Keep the three-list brief.
- 2026-09-02 (opossum, PM 129): reviewer i2b was confirmed again, and the
  failure explains why. The PM supplied captured real statusline JSON and a
  real-client footer, but the fixture's fake rs could not REFUSE when an
  inherited legacy `PIJ_SESSION_ID` contradicted the pane. Claude Opus attacked
  the named low-confidence env/pane seam, reproduced the real dual-store
  population, and found AC1 false; the repaired fake was then proved RED against
  the pre-fix script. A real payload is not a real environment. Keep the
  three-list brief, and require fakes to model every production outcome —
  success, miss, and refusal — at the seam under review.
- 2026-09-02 (opossum, PM 129 — template defects): live proof must default to a
  temp Claude settings file and temp wrapper until merge. The packet required
  real clients but did not forbid installing the unmerged statusline into the
  operator homes; the PM did so, an intermediate jq parser blanked the model on
  every live Claude, and prime restored backups. Encode the prohibition and the
  temp-config recipe in PM/coder packets, not in a post-incident ruling. The
  same packet also pointed at repo-local `.agents/skills/pij-team/TENETS.md`
  where the worktree had no such path, arrived with a zero-row phase task ddoc,
  and spawned the Claude reviewer into legacy before rs bind completed. Fix the
  template to resolve the canonical skill source, refuse dispatch on an empty
  task ledger, wait for verified rs binding before packet delivery, and record
  the registry id the canary actually reports rather than the spawn-time id.
- 2026-09-02 (elephant, PM 130 relaunch): preserving the dead PM's compiling,
  independently reviewed WIP retained RED/GREEN history and made the rebase
  cheaper than reconstruction. The three-list reviewer brief paid again:
  round 1 caught the split identity ladder; round 2's canary command itself
  exposed an unrecoverable-but-correct refusal, dead paneless guidance, and the
  remaining Telegram reply-target identity hole. The zero-row task ddoc still
  let implementation appear complete until the review departure gate rejected
  six orphan ACs — confirming the template must refuse empty task ledgers before
  dispatch. This run fixed the PM/coder/reviewer template TENETS paths to the
  resolvable `.agents-skills-port/pij-team/TENETS.md` source.
- 2026-09-05 (silverfish, PM 135 rs-boot-announce, 4 coders + 1 reviewer, all
  units merged): **the ack gate paid for itself seven times, and every defect it
  caught was in the PM's packet rather than in a coder's understanding.** u1
  found the fence named `http/mod.rs:292` when the adopt handler actually lives
  in `identity.rs:357` (mod.rs only routes) and that the packet's "byte-compare"
  wording was superseded by the contract README's parsed-Value rule; u2 found the
  packet's `bun test` command matches nothing (the hidden `.pi/` path is treated
  as a filter, and the suites use `vi.stubEnv`, which bun lacks — the canonical
  runner is Vitest); u3 found the premise evidence file missing from its worktree
  because the PM copied it in AFTER the commit that worktree branched from; u4
  found the RED instruction self-contradictory (a test that PASSES pre-change
  cannot be the pre-change failing witness). **Template rules earned:** a test
  command inside a packet is a contract — the author executes it once before
  dispatch; the fence is derived by opening the routing, not by copying the unit
  spec; and every asset a packet cites must be committed on the branch the
  worktree will branch from, verified before spawn.
- 2026-09-05 (silverfish, 135): **contract fixtures consumed by tests must never
  live under `docs/plans/<ord>/`.** Post-flight archives the plan folder, and both
  suites read the golden fixture at test time, so closing the flow correctly would
  have broken the branch it had just proved. No gate can see this until the
  archive move happens; it surfaced only because a coder wrote it in its
  ASSUMPTIONS section. Fixture relocated to `crates/testkit/fixtures/` at compose
  (prime-approved) — where the repo's corpus gate promptly refused it as an
  unindexed fixture ("an unaddressable fixture cannot be cited in a packet"),
  which is tenet 7 working exactly as designed. **Scaffold rule: seed shared
  fixtures under testkit from the start; the plan folder keeps the vocabulary note
  and a pointer.**
- 2026-09-05 (silverfish, 135): **`pij send` bodies must never be composed as
  interpolated double-quoted shell strings.** Prose written for an agent routinely
  contains backticks and `$`; one such message performed command substitution on
  its own text and executed `npm ci` inside the MAIN checkout, destroying its
  `node_modules` mid-flight, breaking the pij JS launcher for every seat on the
  box, and corrupting two coders' dependency copies while they read from it.
  Earlier messages survived only by accidental backslash-escaping. This is a
  missing affordance, not a discipline failure: until `pij send` grows a
  `--body-file`/stdin mode, persist the body and send a PATH pointer.
  Compounding sibling: `cp -Rc SRC DST` copies SRC *inside* DST when DST exists,
  and a worktree `node_modules` can be a SYMLINK into main — so a repair aimed at
  a worktree wrote 566 MB into main, and reading through the symlink made the
  damage report name the wrong tree. **Rules: `readlink` any `node_modules`
  before writing near it (a symlink into main IS main), and verify a dependency
  tree BY EXECUTION (`vitest --version`), never by counting entries — a tree with
  255 packages and 21 `.bin` entries was unusable while both numbers were true.**
- 2026-09-05 (silverfish, 135): **a concurrency cap nobody verified is worse than
  no cap.** The fleet-wide load rule imposed `VITEST_MAX_THREADS=4`, which is
  INERT on Vitest 4 (its dist reads `VITEST_MAX_WORKERS`); `VITEST_MAX_WORKERS`
  was then also not honoured — a gate ran 29 workers at load 382/16 cores with it
  exported, and only the CLI flag `--maxWorkers=4` actually capped it. Four
  "flaky" failures were adjudicated across the day (`cli.test.ts`,
  `cli.integration.test.ts`, `pij-sidecars`, `flow-pair/identity.test.ts`), all in
  untouched code, all green on quiet re-runs, and all nearly attributed to code
  instead of contention. **Rule: bound concurrency in `vitest.config.ts` by
  construction, and re-run a timing-sensitive failure ONCE in isolation before
  reporting red.** Same class, same day: `rust-toolchain.toml` pins 1.98.0 while
  rustup is absent and PATH resolves Homebrew 1.95.0 — every Rust receipt cited
  the observed version as if it confirmed the pin. A control that is a comment.
- 2026-09-05 (silverfish, 135): **worktree isolation cannot isolate a
  machine-global link, and the live-proof step must name where it reads the code
  FROM.** Every omp seat loads the extension through
  `~/.omp/agent/extensions/pij` → the MAIN checkout, so a TypeScript fix that was
  committed, merged and fully green in the plan worktree was simply not the code
  any live seat ran: the rebuilt daemon told the truth to an extension that could
  not hear it, producing a silent no-announce identical to the pre-fix symptom.
  The impl-guide named the daemon-not-restarted version of this hazard (r4) and
  missed the extension-link twin. Same shape one level up: PATH `pij-rs` symlinks
  to MAIN's binary, so `just bounce-rs` from a worktree restarts the stale one.
  **Rule: any plan touching `.pi/extensions/` or the daemon states in wave 0 where
  the live proof will read the binary and the extension from, and proves the
  running artifact by path (`ps -o command=`) plus a wire field only the new build
  emits.**
- 2026-09-05 (silverfish, 135): **an invalid experiment that cannot fail is worse
  than a missing one.** The first AC7 attempt launched `claude` AS the pane
  command, so the pane pid WAS the claude pid — no shell layer existed, the test
  could not have failed, and a pass would have proven nothing. Caught before it
  was claimed and redone with a shell hosting the process (shell 90801, claude
  child 93017). **Rule for live proof: before running it, state what result would
  falsify the claim; if nothing could, the setup is wrong, not the claim.**
  Related: when the observed mechanism contradicts the plan's wording, amend the
  CLAIM to the observation and record the wrong prediction (AC3 here: `/new` and
  `/reload` caused no re-registration at all, so `binding=same` was never
  requested live). An AC that is literally false at merge time teaches everyone
  that ACs are approximate.
- 2026-09-05 (fellow-whale, 136): **the impl-guide froze five things that did
  not exist.** Every one was caught by a coder at the ack gate or shortly after,
  never by me: `editor.onChange` is not a public hook in the installed pi/omp SDK
  (u1 found `onTerminalInput`, which also made risk r1 impossible rather than
  merely unlikely — the extension's own writes are structurally invisible to it);
  `bun test` was prescribed for files that import vitest, so the baseline failed
  8/8 on `vi.stubEnv` and would have been miscounted as RED; the plan's
  claimed-and-unacked hold could not satisfy the bypass AC because
  `queue.rs:258` refuses a second claim per serial key; `Queue::retry` is
  RUNNING-only so it could not serve release; and I froze a peek-based poll on
  the assumption `Queue::peek` honours `not_before`, which it does not.
  **Rule: wave 0 must produce a FEASIBILITY RECEIPT beside every frozen seam —
  the installed API's type signature, and a probe of the real store's behaviour
  — not just the contract's field names. A contract that names fields nobody has
  called is a wish list.** Corollary that cost u3 a stall: freezing a signature
  is not enough; the SYMBOL it must compile against (`DEFAULT_TYPING_GRACE_MS`)
  has to exist in wave 0 too, or "three independent units" is true for writes and
  false for builds.
- 2026-09-05 (fellow-whale, 136): **the packet's assumption-interrogation (i5)
  paid for the whole pipeline in one run.** u2 found THREE defects at seams it
  did not own — the 300 s claim lease double-read, the release race where an
  unconditional `defer(job, 0)` would revoke a live reader's claim and deliver
  twice, and the FIFO inversion where an older row re-held to a later deadline
  loses its place — and every one of them would have passed both sides' unit
  tests and failed only in front of Jordan. **Rule: ask each unit what it assumed
  about the composition it does NOT own, and treat a coder's source citation as
  outranking the impl-guide, the PM and prime. All three of my rulings that got
  reversed today were reversed by a coder holding a line number.**
- 2026-09-05 (fellow-whale, 136): **the live proof is where the honest failures
  live.** AC1 passed and simultaneously revealed a duplicate `delivery.released`
  row (two declaration sites), which unit tests could not see because each side
  was individually correct. AC4 could not be proven AT ALL: the bypass guard is
  correct code checking fields the daemon can never populate (rs refuses
  `--command`, `Msg` has no `urgent`, `/v1/send` hardcodes `command: None`), so
  it shipped UNCHECKED with three citations rather than ticked on unit evidence.
  **Rule: a live proof's job is not to confirm the ACs; it is to find the ones
  that are unprovable. Record an unreachable AC as unreachable — a checked box
  resting on tests that exercise a path no live message can take is worse than an
  empty one.**
- 2026-09-05 (fellow-whale, 136): **two composition-only defects existed in no
  unit's diff.** u2 and u3 each honestly resolved `PIJ_TYPING_GRACE_MS` on their
  own side, which is two resolutions of one env var — the AC7 failure mode
  wearing a different coat — and a `pointer::worker` control test encoding "the
  draft is the veto" went red only when all three units met. **Rule: composition
  is not merging; it is looking for the facts that are true in every unit and
  false in their union. Budget a compose pass that expects to find something, and
  retire obsolete controls WITH their reason in the test's own words rather than
  deleting them.**
- 2026-09-05 (fellow-whale, 136): **a wire-format change is a cross-plan event.**
  135 changed the message frame while 136 was mid-flight; ten of u1's assertions
  compared the injected string literally and all ten moved at once. u1's fix
  replaced 23 literals with the frame helper — removing the class rather than
  migrating the instances. silverfish's own retro says 135 had ALREADY enumerated
  every literal it touched and it did not occur to either of us that the same
  list was advance warning for a sibling plan. **Rule: when a plan changes a wire
  format, the enumerated list of touched literals goes to every live sibling PM at
  compose time, and assertions cite the producer's helper instead of retyping the
  protocol.**
- 2026-09-05 (fellow-whale, 136): **messages to a working seat can land in that
  seat's tool-subagent instead of its main context** (u1 and u3 logged it
  independently; MFB corroborated it as omp `session_switch` during a subagent).
  The transport reports delivered, the spine agrees, and the intended reader never
  sees it — a silent mis-delivery INSIDE the seat that no daemon-side evidence can
  reveal. My workaround was to restate every ruling and cite an on-disk ruling
  file, so a seat can recover authority from git rather than from its inbox.
  **Rule: a consequential ruling gets written to the plan folder and committed,
  and the message carries the path. Note the irony for this plan specifically:
  136 governs WHEN to inject; this is WHO inside the seat receives it, and nothing
  currently answers that.**
- (add as they arise)
