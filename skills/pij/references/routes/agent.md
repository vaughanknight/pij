# agent — run packaged agent packs

> Route module — sibling-blind. Knows only this job; composition is the dispatch's job.
> Conventions cited as § C*n* live in `00-routing.md` § Shared conventions (pull lazily).

**Job**: run a declarative agent pack (e.g. `flowspace-search`) — either **in-place** (`run`: blocking, result printed) or **as a live peer** (`spawn`: its own pane, reports back to you, can stay resident for follow-ups).

## Discover

```bash
pij agent list [--json]   # merged inventory: project → user → built-in (nearer tier shadows)
pij agent show <slug>     # a pack's prompt, params, model/harness pins
```

Packs pin `model:`/`harness:`/`reasoning:` in frontmatter; `pij agent check <slug>` validates a pack. Model pins follow § C4 (discover ids, don't invent) and § C2 (wrong pins surface at first inference, not at spawn).

## Run in place (blocking, scoped)

```bash
pij agent run <slug> -p key=value [--json]      # named pack; params fill its prompt template
pij agent run --prompt "one-off task" [--json]  # inline zero-setup run, nothing recorded
pij agent run <slug> --ephemeral …              # named pack, run not recorded
```

`run` executes inside your process — pack permission presets (e.g. read-only) apply here.

## Spawn as a peer (reports back, optionally resident)

```bash
pij agent spawn <slug> -p key=value [--once] [--json]
```

- Your session id is stamped as `spawnedBy` — you are the **report target** (resolve yourself first: `pij whoami`; unregistered → the report round-trip can't complete).
- The peer boots, gets its packet injected, works, then `pij agent report`s: the report lands in **your** pane as a `[pij from <id>]` turn, and `reportedAt` is stamped on the peer's descriptor (the durable proof it completed).
- `--once`: the daemon auto-closes the peer right after its report. Without it the peer stays **resident** — `pij send <id> "follow-up question"` keeps working, and you close it when done (`pij close <id>`).
- **Permissions warning** (plan 029 finding 09): a spawned/resident agent peer always runs **fully permissioned** — blanket flags, no human at the pane to approve tool prompts. Pack permission presets bind `run` mode only; `spawn` prints a stderr advisory and proceeds. Don't spawn a pack you'd only trust read-only.
- Placement/cap and liveness follow § C5 / § C7 (the report is pushed; don't poll).

## Author

```bash
pij agent new <slug>     # scaffold a pack (prompt.md + frontmatter) in the user tier
pij agent check <slug>   # validate frontmatter/params (AJV, fail-fast)
pij agent eject <slug>   # copy a built-in into the project tier to customise
```

## Failure modes

| Symptom | Meaning / move |
|---|---|
| Report never arrives | check `pij whoami` resolved at spawn time (spawnedBy unset = no target); then `pij tail <id>` |
| `E-NOREPORTTARGET` in the peer | same cause — respawn from a registered session |
| Pack rejected at spawn | `pij agent check <slug>` names the invalid field |
| Model warning at spawn | non-blocking (§ C4); verify via the peer's first turn (§ C2) |
