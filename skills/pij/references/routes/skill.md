# skill — run an installed skill in a peer

> Route module — sibling-blind. Knows only this job; composition is the dispatch's job.
> Conventions cited as § C*n* live in `00-routing.md` § Shared conventions (pull lazily).

**Job**: hand ONE skill invocation (`/validate-v2`, `/thesis`, any installed skill) to a fresh peer and get its output pushed back to you. No pack, no I/O schemas — **the prompt is the whole contract**.

**Preconditions**: inside tmux; you resolve (`pij whoami` — unresolved caller ⇒ the report has no target); the skill exists in the **peer's** harness skill dir (claude: `~/.claude/skills/<name>`; copilot/codex: `~/.agents/skills/<name>`) — `ls` it, never assume.

## The one verb

```bash
pij agent spawn --once --prompt "<task>" \
  [--harness claude|copilot|codex] [--model <m>] [--effort <lvl>] [--layout stack|right|below|window]
```

- `--prompt` = **inline peer**: pij wraps your prompt in a packet and auto-appends the report contract (`pij agent report --json …`, `summary` field at minimum) — never restate the mechanism in your prompt.
- `--once`: the daemon auto-closes the pane the moment its report lands. Omit to keep it resident for follow-ups (`pij send <id> "…"`).
- The report arrives in YOUR pane as a `[pij from <id>]` turn — pushed, never polled (§ C7). Model ids per § C4; canary per § C2; placement per § C5.

## Prompt recipe

Three parts, one sentence each where possible:

1. **Invocation** — name the skill as typed and give its args: `Invoke your /validate-v2 skill with: --artifact <path>`. Use absolute paths; add `cd <repo> first` when the target repo ≠ your cwd. Tell it to **fail loudly if the skill is missing** — never improvise the skill from memory.
2. **Response shape** — "respond per the skill's own output format", or narrower ("verdict + findings table only").
3. **Report shape** — short outputs ride inline: `{"summary":"<one line>","output":"<full text>"}`. Long outputs (review tables, dossiers): have the peer write a file and report the path (pointer discipline — dispatch invariant 2): `{"summary","verdict","path"}`. `summary` follows § C10: the verdict/action first, no restatement of the ask.

```bash
pij agent spawn --once --model claude-sonnet-5 --prompt \
 'Invoke your /thesis skill with args: thing <file> (repo: <abs-repo> — cd there first).
  If the skill is not available, report that instead of improvising.
  Respond per the skill. Report {"summary":"<one line>","output":"<full text>"}.'
```

## Failure modes

| Symptom | Meaning / move |
|---|---|
| ⚠️ `caller unresolved` at spawn | you aren't registered — the report can't route; adopt (§ C1), respawn |
| Report reads like the skill but shallow | peer improvised from priors — the skill is missing in ITS dir; install/symlink, respawn |
| Report never arrives | one `pij tail <id>` spot-check (§ C7 exception applies only to broken transports) |
| Ready but 400 on first turn | wrong model id — respawn with a `pij models` id (§ C2/C4) |
