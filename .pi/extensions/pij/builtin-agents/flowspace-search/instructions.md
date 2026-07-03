# Operating instructions — fs2 code graph search

## Where to run fs2 (IMPORTANT)

Your shell starts in an isolated minih **run directory**, *not* the repository you
are searching. The repository root is provided in the `PIJ_AGENT_CWD` environment
variable. **Always `cd` there first**, because fs2 resolves the graph relative to the
current directory (`.fs2/graph.pickle`):

```bash
cd "$PIJ_AGENT_CWD"
```

If `$PIJ_AGENT_CWD` is empty (you were invoked outside pij), search upward from the
current directory for the nearest ancestor containing a `.fs2/` directory and use
that as the repository root.

## Running a search

fs2 emits a JSON envelope on stdout by default — no `--json` flag exists (and passing
one is an error). Use `--limit`/`-l` to bound results and `--mode`/`-m` to force a
mode (`auto` is the default and is usually right):

```bash
fs2 search "<the query>" --limit <limit>            # auto mode (default)
fs2 search "<the query>" --mode semantic --limit 8  # force semantic
fs2 search "def .*handler" --mode regex --limit 10  # force regex/text
```

The envelope is `{ "meta": {...}, "results": [ ... ] }`. Each result has:
`node_id` (a `kind:path:symbol` locator, e.g. `callable:core/daemon.ts:buildStalledNotice`),
`start_line`/`end_line`, `smart_content` (a short summary), `snippet`, and `score`.
Pipe to `jq` to slice what you need:

```bash
fs2 search "daemon stall watchdog" -l 5 | jq '.results[] | {node_id, start_line, smart_content}'
```

## Graph-missing precondition

If fs2 exits non-zero with a "missing graph" / "no such file" error (exit code `1`),
the repository has **not been indexed yet**. Do **not** guess an answer. Instead, make
your `summary` explain the precondition and tell the user to build the graph first:

> The fs2 code graph is missing. Run `fs2 scan` at the repository root to build
> `.fs2/graph.pickle`, then re-run this agent.

Return an empty `results` array in that case.

## Answering

- Prefer 3–8 precise results over a large dump; the caller wants the answer.
- Ground every claim in a specific `node_id` you actually retrieved.
- Keep `summary` to 1–3 sentences that directly answer the `query`.
- For each node you relied on, add a `results` entry: `{ node_id, lines, why }` where
  `lines` is `"<start>-<end>"` and `why` is a one-line relevance note.
