# Inherited open handles — held by pij-wee-albatross (o-prime, pij repo)

**Written**: 2026-07-28T21:40Z · **Holder**: `pij-wee-albatross`
**Sources**: `pij-reasonable-dove` handover pack (same dir), plus post-rotation ACKs from
`pij-superior-mastodon` (o-prime, voxel-flying-game) and `pij-resident-leech` (voxel repo).

> These arrived as pushed messages into ONE session and existed nowhere else at the moment of
> receipt. Written down immediately for that reason. Everything below is **filed, not actioned** —
> Jordan's standing instruction through the tail of dove's session was verbatim
> **"Keep filing, fix nothing."** It is not lifted.

## A. Watchdog work — all in this repo, all agreed, none authorised to start

Ranked by the two seats that did the measuring. Sequencing is Jordan's decision (§D.3).

1. **Ping copy — agreed to ship, text final.** Current nudge ends
   `"If done, pause me with pij watchdog pause <id>"` — **every fire instructs its own
   disarmament**. Replacement is `pij-resident-leech`'s, verbatim, attributed:
   > "If you are idle, declare it with `pij state set <id> waiting` and stay armed; ask for a
   > longer interval if 2h is wrong for you."

   Dove objected that this would mislead; **mastodon refuted it at source** — `buildStalledNotice`
   sends to `spawnedBy`, so the STALL NOTICE goes to the **parent**, never the seat; a seat only
   ever receives **nudges**, which `intervalMs` does govern. **Dove withdrew the objection.**
   Ships as written.
2. **Parent-facing copy fix — no competitor.** Nothing tells a parent that the stall notice it
   receives is **ungoverned by the child's `intervalMs`** and suppressible only by `exempt`.
   Proven by mastodon experimentally over two hours.
3. **`STALE_AFTER_MS` threading** — the dial exists in the signature with **no caller supplying
   it**. mastodon demoted this twice and says it was wrong both times: it is the **only** dial
   reaching the stall detector. (`STALE_AFTER_MS` = 60s sits *below* observed-normal seat quiet.)
4. **`semantic=waiting` must quiet the watchdog** — it currently reads the system axis only.
   **Reproduced live by this seat, 2026-07-28**: declared `waiting` at nudge #1 (spine 23003);
   nudge #2 fired anyway at the 20-min default. Fresh instrument, same defect. Interval then
   raised to 7200000 **with the reason attributed in the spine (seq 23028)** — the attribution
   dove's own 2h config lacked and flagged as #45-class.

**Filed findings, mastodon, both in this subsystem**: **#67** the stall notice is a *second*
detector (`daemon.ts:754`) that ignores `intervalMs` entirely and is suppressible only by
`isExempt` — the single lever a no-pause ruling forbids. **#68** every alarm path in mastodon's
fleet terminates at a seat whose own death is unreportable (7 of 12 seats parent-root; four of
five children report to `dolphin`, itself root).

## B. Standing ruling I now hold on someone else's behalf

**#37 — `pij revive` is blind to alternate claude homes.** A symlink owned by
`pij-resident-leech` is live at
`~/.claude/projects/-Users-jordanknight-games-voxel-flying-game/2dfb4cf2-2fb1-47a1-ac46-07058ab29538.jsonl`
pointing into `~/.claude-alt`. **It is load-bearing right now** — it is what lets `pij tail` read
`pij-superior-mastodon`.

Dove ruled it **stays until #37 lands**, at which point leech removes it and reports.
**That ruling is now mine to hold, and it is CONTINUED unchanged.** leech acts on my word and
has been told so. Do not let this fall through a future rotation: whoever holds this seat owes
leech the word when #37 lands.

Related, from dove §4b: there are **two claude homes** (`~/.claude`, `~/.claude-alt`, via
`cc-alt()` at `~/.zshrc:188`) and `pij` hardcodes `homedir()` in all three harness path builders.
**Search both homes before believing any "transcript gone" claim, including your own.**

## C. Corrections to the record — carried so they are not re-derived

- **`pausedBy` IS projected**, nested under the `watchdog` object, populated on all rows.
  mastodon told dove it was not; mastodon's scan looked only at row level. Dove built a
  four-field clustering pattern on it and had to drop that member. **Dove's 87% orphan figure
  stands as dove's own measurement, from descriptors, uncorroborated by mastodon.**
- **`pij list --json` projects both `prime` and `oldPrime` at row level** — a seat rotation IS
  discoverable in one command. My rotation notice claimed otherwise; both leech and mastodon
  independently corrected it and I have retracted it to every recipient.
  **Rotation notices must say "verify me: `pij list --prime`", never "you cannot check this"** —
  the latter reads identically to the 2026-07-27 self-designation incident and disarms the one
  probe that separates a real rotation from a spoof.
- Six identity/lineage fields the projection does **not** carry: `spawnedBy`, `parentId`,
  `gitCommonDir`, `harnessSessionId`, `harness`, `semanticState`. Prime rotation is one it
  **does**. Both errors are the same error in opposite directions — **check the projection, do
  not assume its width either way.**

### C0. #68 — supervision is structurally absent for ~88% of seats (CORROBORATED)

Two independent measurements, different instruments, different seats, **both run rather than
taken** — dove's original ~87% orphan figure, and `pij-superior-mastodon` re-measuring across the
flat descriptors. **This seat re-ran it a third time**: 234 descriptors, 0 unparseable,
**parented 29 (12%), ROOT 205 (87%)**.

**`buildStalledNotice` returns null with no `spawnedBy`.** So ~88% of seats on this box **cannot
produce a stall notice at all** — not "hard to detect", *structurally unreportable*. In
mastodon's own sub-fleet 7 of 12 are root, and four of the five children report to `dolphin`,
itself root. **Every alarm path terminates at a seat whose own failure notifies nobody.**
Filed **#68, architectural rather than a dial.**

Compose with dove's measurement that **47 of 51 live seats (92%) had `watchdog pause` set**, and
with §A.1 (the nudge instructed its own disarmament): supervision on this box was **largely
decorative in both directions at once** — most seats could not report, and most of the rest were
silenced by following the tool's own advice. **That composition is the portfolio-level finding;
neither half states it alone.** Promote dove's figure in **#45** from *reported* to
**corroborated**.

**Not claimed** (mastodon, caught before publishing): its non-dissolved filter returned 21 seats
against 215 registry rows, so that file's lifecycle predicate does not mean what was assumed. The
88% headline is sound; **the live stratification is not, and is not quoted.**

**Mechanism verified at source by this seat** (dove filed the observable and explicitly declined
to infer the mechanism): `binding.ts` has **four** notice builders — lines **282, 294, 309, 324**
— every one guarded `if (!descriptor.spawnedBy) return null` and addressed
`to: descriptor.spawnedBy`. For a parentless seat the notice is not misrouted; **it is never
constructed.** dove's own seat took 17 nudges while its owner-facing detector half was
structurally silent throughout.

**Live workaround, source-verified AND exercised (spine 23147)**: the **watchers[] path**
(`notifyWatchers`, `watchdog-manager.ts:433` — delivers `to: watcher.watcherId`) **bypasses
`spawnedBy` entirely**. `pij watchdog watch <id>` therefore restores owner-facing notices for
root seats. Proven end-to-end: this seat registered as butterfly's watcher and received a suspect
capture the `spawnedBy` path could never have built. **Interim prescription for #68 until the
architectural fix: every deliberately-held root seat gets an explicit watcher.**
Same event also extends **A.4**: the suspect detector fired against a seat *declared `waiting`*
(spine 23145) — the semantic axis is invisible to the suspect path too, not just the nudge path.

### C0b. dove addendum, fire #17 — two measurements (dove's own, end-to-end)

- **Interval overshoot is systematic, not a one-gap artifact.** §A.1's context updates:
  `#14→#15` = 195.7 min; `#15→#17` = 370.5 min (185.2/interval); **mean 188.7 min against a
  configured 120 — 1.57×, every interval measured.** The lever works (20 min → ~3 h) but does
  not land ON the set value. **Nobody should set 120 expecting 120; if copy quotes a number,
  quote the behaviour, not the setting.**
- **`node show` does not project the watchdog object** while `list` shows the seat armed — same
  seat, same moment, two shipped instruments disagreeing. **CORRECTED per dove's retraction
  (spine 23055 carried the phantom; corrective event refs it):** one behaviour, observed on
  **both** seats — **the key is entirely absent** (`'watchdog' in payload` → False). dove's
  earlier "`null`" is **withdrawn as an instrument artifact**: its read was
  `json.dumps(d.get('watchdog'))`, and `.get()` returns `None` for an absent key and a null value
  alike — the instrument collapsed exactly the two states the finding was about, while citing the
  four-day-old F10 ruling *in the filing itself*. **A doctrine you can quote while violating it
  is not yet a control.**
  **Downgrade**: absent-key is the *better* behaviour — a schema-aware consumer can distinguish
  "surface doesn't carry it" from "supervision off". dove's #46 (off-state and unprojected-state
  byte-identical) was built entirely on the bad read and is withdrawn. What survives is the
  narrower, already-known **#41 shape: `node show` does not project a load-bearing field.**
  Fourth #45 member is NOT established on this evidence.
  What made the retraction possible: both observations were recorded **with seat and instrument
  named** — dove re-ran *my* instrument on *its* seat and found its own artifact. Instrument
  binding is not bookkeeping; it is what makes a phantom findable.
- dove's watchdog paused at fire #17, first time, **reason recorded** — measurement complete and
  relayed, seat standing down. Per **#16** the pause silences only the nudge half.

### C1. Rotation-verification recipe — final, executed

Two instruments, one per half of the claim. Verified by this seat and independently run by
`pij-resident-leech` before this revision existed.

| use | instrument | why |
|---|---|---|
| **FAST — both halves, one call** | `pij list --json` **unfiltered**, folder-matched | `oldPrime` is projected on **215/215** rows. The `--prime` **flag was the entire defect**; drop it and one window sees both halves. Verified by leech and re-run by cheetah (170 rows folder-matched: exactly one `prime=true`, exactly one `oldPrime=true`). |
| **AUTHORITATIVE fallback** | read `~/.pij/<id>.json` — the **flat sibling**, not `<id>/session.json` | survives archival; also carries `spawnedBy`/`parentId`, which the list does **not** project |
| retired population | `pij tree <id> --all --json` | when you want every retired seat, not one |

**STATED WINDOW — measured on this box, and it must travel with the command:**
`pij list` = **215 rows** · flat descriptors `~/.pij/*.json` = **234** · `~/.pij/archive` =
**4,037 entries**. The hot tier is **~5% of the recorded population**, and leech has direct
evidence of a **live** descriptor absent from `pij list` entirely. **An archived outgoing prime is
absent from the fast read, and absent reads as never-existed** — it fails in the dangerous
direction. Use the descriptor read whenever the outgoing seat may be cold.

**Rule earned separately by cheetah, and it is the one to keep**: *every reported value carries
the name of the instrument that produced it, or the report is unverifiable even when true.*
cheetah's two reads were both sound; its write-up bound both facts to the first command's name,
describing an output that instrument cannot emit. **A correct measurement reported under the
wrong instrument name is not catchable by any reader.** This seat then read that labelling slip
as a fabricated result and said so in strong terms — inferring a *method* from a report's wording
and concluding about the *work*. Retracted. **Fifth instance of §C's shape in one evening, and
the second committed by this seat.**

**The descriptor is the flat sibling `~/.pij/<id>.json`, NOT `~/.pij/<id>/session.json` inside
the dataDir.** This seat probed the dataDir path, got `FileNotFoundError`, and moved on without
noticing the window was wrong — **the fourth instance of §C's own shape, committed by the seat
circulating it.** Recorded rather than quietly fixed.

That descriptor read **also carries `spawnedBy` and `parentId`**, which `pij list --json` does not
project at row level — so it is the wider window in more than one dimension, and is likely the
right default read for **#68 lineage work**, not just retirement.

## D. Doctrine closed by dove + mastodon — applies to this handover itself

> **Two seats corroborating each other can launder a claim neither measured.**
> Before treating agreement as corroboration, ask **which of us ran it**.

Supporting cases, each paid for: dove accepted mastodon's `pausedBy` report over its own
transcript, having used the field successfully three hours earlier — *a bad measurement is
catchable by re-measuring; a good measurement overridden by deference is not.* mastodon published
a fabricated hex into a tracked file on the same failure. Dove's related class **#45**: controls
whose OFF-state reads as PASS.

**Applied here**: I verified `s051` myself (`git ls-remote` + `git diff --stat`) rather than
relaying dove's audit. leech and mastodon each verified my rotation claim independently rather
than from each other. Keep this standard.

## B2. Second standing ruling I hold — roadrunner's two hardlinks (#36b)

`pij-chief-roadrunner` (o-prime, chainglass) hardlinked **its own and `pij-cheap-cheetah`'s**
transcripts from `~/.claude-alt/projects/-Users-jordanknight-substrate-chainglass/` into the
`~/.claude` equivalent. **Both are load-bearing now.** Dove ruled they stay until **#36(b)**
(hardlink the transcript into the seat data dir) ships, then roadrunner removes them and
confirms. **CONTINUED unchanged; the obligation to tell roadrunner when (b) lands is mine.**

**Three live workarounds, two repos, one root cause — synthesis only this seat sees:** leech's
symlink (§B) and roadrunner's two hardlinks all prop up transcript reachability, and all wait on
#37/#36(b) landing **in this repo**. If either ships and nobody tells the holders, three
workarounds silently become permanent infrastructure.

## B3. roadrunner's filed cluster — mechanism read, not inferred

- **#37 `CLAUDE_CONFIG_DIR` unhonoured** — root cause of the cluster. `~/.claude-alt` is set
  inside a zsh **function** (`cc-alt`, `~/.zshrc:189`), so it lives in a running seat's env and
  in **no new shell**. Dove ruled it **gates #36(b)**: recording a path and watching it, built on
  a hardcoded root, would record and watch the *wrong* location just as confidently.
- **#39 `revive --print` omits `CLAUDE_CONFIG_DIR`** — **worse in kind than #37**: #37 fails
  loudly (`E-NOREG`, nobody proceeds); this succeeds **silently** with a seat resumed under the
  **wrong account** — and once a hardlink exists, the resume works. Fixed in
  `scripts/prime-up.sh`. Rule landed: search every root, **keep looking past the first hit**, and
  where the artifact is reachable under more than one, treat the **non-default** root as the
  account. *A hardlink is undetectable by path* — `realpath` returns the link's own path; only
  the shared inode gives it away.
- **#35 `pij adopt` reports a binding it never writes** — **FIXED AND LIVE 2026-07-30**
  (s074 P6, merged `74885b4`, daemon restarted; spine 24851). adopt now write-verifies via
  `verifyPersistedAdoptDescriptor`, three rejection arms mutation-locked. The sweep-adopt gate
  (spine 23097) is structurally satisfied for the filed sweep-adopt item. Workaround-holder
  notifications discharged same day with precise scope: **#37/#36b remain open, all three
  workarounds STAY.** On a dissolved seat
  it prints `(pane %N, bound)` and writes **zero bytes**: `registry.write` is correctly guarded by
  the dissolved-tombstone check, the verb for the case is `RegistryPort.revive`
  (`core/ports.ts:73`), `adopt` calls **neither** it nor `writeExact`, and the success line at
  `cli.ts:2925` gates the word "bound" on `harnessSessionId` read off the descriptor it just
  failed to write, while interpolating the pane **from the request**. `whoami`'s own remediation
  text prescribes `adopt`, and every restart-killed seat is dissolved — **the documented recovery
  path is closed for exactly the class it serves, silently.**
- **#38 re-attach DEGRADED age** — a seat re-attached 3s ago reads "spawned 13187min ago, never
  bound (wedged boot)"; age comes from the original `startedAt`, and it raises a spawn-limbo
  anomaly before self-clearing. Guard: **never stamp `startedAt` at revive — add an anchor, never
  overwrite one.** Must hold for both paths (`--resume` pinned-id vs `phonehome` for an
  already-running session with no pinned id).
- **#40A / #40B, the printed launch line.** A: `revive.ts:682` writes
  `{ spawnedBy: reviverId, parentId: reviverId }` directly, so reviving a seat from inside itself
  stamps a **self-parent** — the cycle guard is **not broken, it is never reached**; route
  revive's parent stamping through the guarded path `link` uses rather than add a third
  implementation. **A2** (dove called it the best observation of the batch): `pij link --root`
  clears `parentId` but `spawnedBy` stays, because AC-08 holds it immutable — **an immutable
  field took a wrong value from a second writer, and immutability now protects the error.** Live
  example, left named rather than abstracted: `pij-chief-roadrunner`'s own descriptor,
  `parentId=None`, `spawnedBy=pij-chief-roadrunner`, unreachable by any shipped verb.
  B: the launch line puts `PIJ_PARENT_ID` **after the `&&`**, as an env prefix to `claude`, so the
  `revive --attach` that writes the descriptor never sees it — **every claude seat revived through
  `--print` comes back parentless.** Ruling: parent goes as an **argument** to `revive --attach`.
- **Dove's standing ruling**: nothing ships that printed line until **#39, #40A and #40B land
  together**, since it carries all three.

**Standing contract with chainglass, continued unchanged**: roadrunner reports every pij friction,
lie and surprise from real use, mechanism read rather than inferred, flagging proved separately
from inferred. Jordan drives that thread personally.

## B4. whitefish — recoverable in substance, REFUSED by the shipped verb

Verified by this seat, 2026-07-28T21:42Z:

- Transcript **exists**: `~/.claude-alt/projects/-Users-jordanknight-pi-hacking-pij/7c73666a-378d-4ba6-b3b1-530c8844bd27.jsonl`, **1,902,167 bytes**, 27 Jul 09:42.
- Descriptor: `dead`, `unadopted`, terminal `pid-missing`, last seen 2026-07-26T15:31Z.
- **`pij revive pij-exclusive-whitefish --print` returns `E-NOREG: claude native session artifact
  is missing`** — while the artifact sits on disk, 1.9MB, under the alt home.

**This is #37 firing live, and it is not a backlog item — it is the thing standing between Jordan
and whitefish's s073 context (items 11, 10, 2).** roadrunner's "recoverable" is correct about the
artifact and the shipped verb still refuses it. Recovery today means the `prime-up.sh` path or a
hand-run resume against the alt home, not `pij revive`.

## B5. Pane-epoch reuse — fabric defect, filed 2026-07-29 (spine 24119), UNOWNED

Reported by `pij-internal-flyingfish` (voxel oldPrime, stood down), relayed and independently
verified by `pij-chief-roadrunner`, **re-verified by this seat** (gibbon's `lastEventAt` trails
flyingfish's by 96ms on my read — third independent measurement).

**Mechanism**: tmux reissues pane ids from a low counter on server restart; descriptors keep
old-epoch pane ids. A dead seat's descriptor silently rebinds to whoever now owns the reused
pane. Live instance: `pij-grieving-gibbon` (dead, terminal-stamped 2026-07-27, pid gone) has
been **credited with `pij-internal-flyingfish`'s activity for three days** — watchdog notices for
the corpse delivered into the live seat's pane, `lastEventAt` tracking within ~100ms continuously.

- **Exposure is worst for the oldest seats** — low ids reissue first, so primes and bootstrappers
  collide first. Every seat that outlives a reboot is a candidate.
- **Defeats liveness-based reclaim**: a corpse on a reused pane reads perpetually active, so
  evidence-based silent-holder reclaim refuses exactly the descriptors most needing it. Check
  anything reasoning from `lastEventAt` (#68 family).
- **The cheapest detector already exists in the store's own output**: `pij state` prints
  *terminal at <2 days ago> · last event 44s ago* in one line — **a seat simultaneously terminal
  and hot is a contradiction the store can see and does not act on.**
- **Remedy shape** (roadrunner, pointing dove's detect-at-loss-time ruling at a new target):
  epoch check at daemon start — invalidate descriptors whose pane binding predates the current
  tmux server. Needs the bind-epoch **recorded at bind time**, which pij does not store — the
  #39 shape again: *the fact needed to validate the binding is not recorded when the binding is
  made.*
- **Interplay**: the filed sweep-adopt item (descoped P7) must reference this — sweeping
  unadopted seats in a post-reboot registry walks straight into reused-pane corpses.
- E-OWN correctly refused roadrunner's `pij close`; gibbon's disposal is with Jordan. Flyingfish
  deliberately left the watchdog firing so the contamination stayed visible — right call.
- The 354-file staged rollback in gibbon's cwd is chainglass-side, roadrunner's to resolve
  (authorship inference, marked as such).

**Blast-radius negative result, and why (spine 24127, roadrunner)**: chainglass's focus button
does NOT fire on the contaminated seat — the guard refuses at `liveness !== 'active'` before
reaching the stale windowId. The reason is the doctrine: **the contamination lands on the
activity axis; the guard reads the liveness axis (pid-derived); pij keeps the axes independent,
so the poisoned axis cannot reach the control.** The contaminated instance itself proves the
derivation (44s-old `lastEventAt` alongside `liveness=dead`). Counterfactual, stated so nobody
reopens it: had liveness been derived from activity freshness — the cheaper implementation most
would reach for first — this defect converts into a UI stealing a live user's focus, today.
**"The three axes are independent and must never be merged in a view" is not style; it is the
thing that contained this.** Paired with the detector note above: one control observes without
governing; one structural property governs without observing.

## E. Pending human decisions — Jordan's, unchanged from dove's pack §6

1. **`s051` push** — 7 commits, 70 files, +17,396/−673, **no remote ref exists**
   (independently verified by this seat). Feature-branch push, *not* a trunk push; outside the
   `push-main` baton. Recommendation: push first, decide reconciliation second.
2. **`s073`** — six commits by dead `pij-exclusive-whitefish`, no remote branch, unreconciled
   against skill edits since landed on main. Revive whitefish, or re-point the project.
3. **Sequencing** — `11 → 10 → 2` vs the watchdog trio (§A). §A.1 is unblocked and ready.

Also open: `p073-pij-first-class-ui` names dead `pij-exclusive-whitefish` as project prime —
dangling pointer, no deadline.
