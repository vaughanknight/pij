# Peer harvest — s100 `tick-heartbeat`

**Persisted to disk deliberately, not left in a message.** A message lives in the buffer that is
about to be summarised; a compaction preserves a peer's **findings** and drops its **discards**,
because a discard is by definition what it judged not worth carrying. So summarisation destroys
precisely the material the harvest question exists to recover.

Both peers answered the question *"what did you consider and discard?"* before being closed.

| file | peer | role |
|---|---|---|
| `coder-pij-gorgeous-guan.md` | `pij-gorgeous-guan` | copilot · claude-opus-5 · high |
| `reviewer-pij-glad-stingray.md` | `pij-glad-stingray` | copilot · gpt-5.6-terra · high |

## What this recovered that nothing else would have

Four of this stream's best findings exist **only** because the question was asked. None appears in
any review, any commit, or the PR:

1. **A reviewer that silently declined a parent's framing.** It was told not to agree with me about
   the fixed temp filename, followed the actual role, could not establish the requirement I had
   assumed — and said nothing, because there was nothing to report. **Correct-but-silent reviewer
   behaviour produces no artifact at all**, so the discard question is the only channel through
   which it is observable.
2. **A gate that was never run.** The coder never ran `harness checks` or `just smoke` in ten
   rounds while reporting `gatesClean: true` — because **my packets specified a narrower gate every
   single time**. It ran exactly what I wrote.
3. **A guard that was dangerous, not merely redundant.** The coder deleted an emptiness check
   because `rmdir` refuses a non-empty directory atomically. The reviewer independently verified
   the platform semantics and adds that the check would have introduced **TOCTOU risk**. Right
   action, stronger reason than the one it was taken for.
4. **A search stopped and called theatre.** After the marker protocol was deleted, the reviewer
   judged that continuing to hunt marker-specific races would be performance rather than diligence.
   **There is no artifact in having stopped**, so this is invisible by construction.

## Two live defects on merged code, filed from this harvest

- **#210** — the `pid` rejection rationale in `fs-registry.ts:519` is unverified and conflates the
  pane pid with the descriptor pid. *A rejected option's rationale is the least-audited text in a
  codebase, and it is exactly what decides whether the option is retried.*
- **#211** — `harnessSessionId` case-normalisation asymmetry (`binding.ts:105` does not lowercase
  codex ids), latent until #209 became the first code to compare the field across paths.

## The limit, stated by the coder itself

> I was compacted **twice**. Rounds 1-6 survive only as what I chose to write down at the time. The
> things I decided were not worth logging in rounds 1-5 are exactly what you are asking for, **and
> they are unrecoverable.**

**Ask the discard question at every compaction boundary, not at close-out** — and write the answer
to a file, because the answer itself is in the buffer that is about to be summarised.
