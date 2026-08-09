# Live CLI proof — Phase 2 (AC-06b): the gate demonstrated at the command line

**Captured** 2026-08-05 · run by `pij-yucky-mosquito` **in its own pane, as a real `pa` seat**
· worktree CLI (`just pij`), never bare `pij` · orchestrator-directed, transcripts verbatim.

## Why the PA ran it, not the orchestrator

The orchestrator first tried to run the proof by impersonating the PA via `PIJ_SESSION_ID`:

```console
$ PIJ_SESSION_ID=pij-yucky-mosquito just pij watchdog watch pij-continuing-ermine --max-lines 3
E-AMBIG: PIJ_SESSION_ID pij-yucky-mosquito does not match ambient session pij-respectable-starfish
```

**A boundary working correctly** — the CLI refuses cross-seat impersonation. It also forced the
better proof: a real PA seat, in its own pane, against the real CLI.

## Precondition — verified before the two cases, so they were the right way round

```console
$ just pij whoami --json
{"id":"pij-yucky-mosquito", … ,"orchestrationRole":"pa",
 "refusedVerbs":["adopt","agent","agents","attest","canary","chore add","chore remove",
   "chore update","close","daemon","dispatch-packet","fence-set","link","orchestration",
   "project-create","project-set","revive","spawn","spine-append","state-verify",
   "stream-close","stream-create","task-close","task-set","telegram"],
 "conditionalVerbs":["ack-dispatch","watchdog"]}
EXIT=0
```

**AC-13 proven live**: `watchdog` appears in `conditionalVerbs` and **not** in `refusedVerbs`.

```console
$ just pij state pij-yucky-mosquito --json      (parsed)
id = pij-yucky-mosquito · role = pa · parent = pij-respectable-starfish
```

**AC-01 / AC-02 proven live**, and it establishes that `pij-continuing-ermine` is *not* the
PA's parent — which is what makes case (1) a genuine non-parent target.

## (1) PA → NON-parent target — EXPECT REFUSAL

```console
$ just pij watchdog watch pij-continuing-ermine --max-lines 3
--- stdout --- (empty)
--- stderr ---
E-OWN: 'watchdog watch' is not available to a PA — refused by role 'pa' (field: orchestrationRole):
'pij-continuing-ermine' is neither you nor your parent — a PA may act only on ITSELF
('pij-yucky-mosquito') or its own prime ('pij-respectable-starfish'), so ask
'pij-respectable-starfish' to do it or relay the request. Run 'pij whoami --json' to see your
role and capabilities, or 'pij state <id> --json' to read orchestrationRole and parent on any seat.
--- exit code --- 2
```

## (2) PA → its OWN parent — EXPECT SUCCESS

```console
$ just pij watchdog watch pij-respectable-starfish --max-lines 12
--- stdout ---
pij-respectable-starfish: watching · interval 20m · watchers 2 (pij-continuing-ermine, pij-yucky-mosquito)
--- exit code --- 0
```

## (3) PA → `unwatch` its own parent — R-02, EXPECT SUCCESS

```console
$ just pij watchdog unwatch pij-respectable-starfish
--- stdout ---
pij-respectable-starfish: watching · interval 20m · watchers 1 (pij-continuing-ermine)
--- exit code --- 0
```

## What this proves — and what it does not

**Proves**: the allowance is real at the command line, scoped by target, and covers `unwatch`
as well as `watch` (R-02). The refusal names the verb, the role, **the field**, the actual
target, **both** permitted ids, a concrete remedy, and the two reads a seat can run on itself
— the full Phase-1 + Phase-2 message working together. This is the artefact on which the
`ABSENT` / human-judgement row in `backpressure-coverage.md` ("is the refusal wording actually
intelligible?") should be judged, since no command can settle it.

**Does not prove** (the coder flagged this itself, unprompted, and it is the right call):
`pij-continuing-ermine` was already a watcher, so the roster went 1→2→1 leaving it intact —
but that is **not** evidence against Key Finding 03. KF-03 is about `--for`, which does not
exist yet, and about `addedAt`, which **no allowed read projects** (DL-001). Both remain Phase 3.

## Cleanup — verified at source by the orchestrator, not taken on report

```
role restored:  pij-yucky-mosquito → worker (parent unchanged)
~/.pij/pij-respectable-starfish/watchdog.json:
  [ { watcherId: "pij-continuing-ermine", addedAt: "2026-08-05T09:55:08.194Z",
      capture: { mode: "always", maxLines: 12 } } ]
```

The co-watcher's `addedAt` is **byte-identical to before the proof** — a watch+unwatch cycle by
a different seat left it untouched.
