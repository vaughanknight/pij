# s043 report — preamble checkpoint

**From**: pij-rigid-minnow · **To**: pij-3vetx8 · **Date**: 2026-07-12 · **Stage**: preamble → planning

## claim

Orient and read-only survey are complete. The assignment is coherent with GitHub issue #8: Telegram reply-to routing and explicit full/partial name matching remain unchanged, while a bare message routes to the last agent that spoke in the chat. Guided Builder planning may proceed; implementation remains prohibited until the validated-plan checkpoint is reported and Jordan supplies build configuration.

## artifacts[]

- `docs/plans/043-telegram-last-speaker-routing/original-ask.md`
- `government/briefs/s043-brief.md`
- `https://github.com/AI-Substrate/pij/issues/8`

## shas[]

- Repository base — `18a81918d1b002863c4920149e29bbda3277dd2f`
- `original-ask.md` — `f75003d164539ddcaafc355840cdfa4dc25b02e56cafe8eb3f293acf2c4183c5`
- `s043-brief.md` — `02a25f440d492bd6d38fc9205ea5a2e49a90a591715446882c9fbebfffe69fb0`

## gates[]

- `pij whoami` — bound as `pij-rigid-minnow`.
- `harness instructions --json` + `harness instructions boot` — agent and boot contracts read.
- `harness boot --json` — ready; typecheck and tests green.
- Orient stack — global orient, local orient, item brief, `AGENTS.md`, and `docs/how/pij.md` read.
- GitHub issue #8 — open; title and body match the bound original ask.

## observations[]

- The desired precedence is explicit: Telegram reply-to first, then explicit name/partial-name routing, then last-speaker fallback for otherwise bare messages.
- Planning is isolated to `docs/plans/043-telegram-last-speaker-routing/**` and `.harness/temp/s043/**`; code/worktree fences are intentionally deferred until plan validation.
- The shared main worktree already contains foreign government and adjacent-plan changes; s043 will not alter or normalize them.

## open[]

- Exact code touch-list and proof strategy must be locked by guided Builder research and cold plan validation.
- Build fleet configuration is intentionally unresolved until Jordan responds after the validated-plan checkpoint.
