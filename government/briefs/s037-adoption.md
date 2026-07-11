# Stream brief — s037-broadcast (ADOPTION)
**From**: pij-3vetx8 (o-prime) · **Date**: 2026-07-11T09:55:00Z · **Lifecycle**: adopted (Jordan-spawned); assignment provisional until Jordan's preamble unless he waives in-pane

## Structure tree

```text
human (Jordan)
└─ o-prime pij-3vetx8 · this repo's governance seat
   ├─ s036-baton pij-1khprxk · Fable 5 · plan 036 (baton primitive) · IN FLIGHT phase 1
   │   └─ (its own fleet, when it reaches implement)
   └─ this stream pij-aa756x · s037-broadcast · owns plan 037 end-to-end
       └─ your fleet (yours to spawn via /pij pair at implement)
peers not in your chain: pij-uec99o (SecondCrack) · pij-1ca01u5 (osk) — route through me
```

## Orient stack (read in order, pointers only)

1. Portable global orient: `skills/pij/references/prime/orient-global.md`
2. Repo local orient: `government/orient-local.md`
3. This brief.

## Work item

- **Plan folder**: `docs/plans/037-pij-broadcast/` (allocated; `original-ask.md` carries Jordan's ask verbatim + bound context, including the OPEN naming question — `pij orchestration broadcast` vs a `send` extension — which needs Jordan at your clarify round, not an assumption)
- **The job**: one-to-many send — same message to N named peers, fan-out semantics + the per-recipient receipts story.
- **Flow**: `/builder` guided in YOUR plan folder; `the-flow.json` is builder-CLI-only.

## Cross-repo artifacts (foreseeable: none known — but if any appear): vendor VERBATIM + sha256 in a PROVENANCE file BEFORE citing; source repos may be severance-ruled.

## Fences (canonical: `government/spine.md#fences--s037-broadcast`)

Planning-cut: you own `docs/plans/037-pij-broadcast/**` + `.harness/temp/s037/**`. Everything else read-only until your plan validation's fence-vs-manifest diff. **Known live seam (SW-3)**: s036 holds additive-only fences on `.pi/extensions/pij/cli.ts` + `daemon.ts` — your plan will likely want the same files; that overlap is MY sequencing decision at your validation, per-file. Name your exact touch-list in the Domain Manifest and expect serialized windows, not co-ownership.

## Batons (book: `government/baton-book.md`)

daemon-restart (machine-wide blast radius, C6) · git-index (pathspec-mandatory commits + commit-slot; three same-class incidents today — INC-001 here is fresh) · push-main. Request by send; grants pushed.

## Report contract

`claim · artifacts[] · shas[] · gates[] · observations[] · open[]` — file in YOUR plan folder, pointer to me: preamble checkpoint (read-only, BEFORE planning), phase checkpoints, ship. Every green you relay is a claim you verified — and every verification claim needs its artifact ON DISK at record time (a validation verdict living only in a transcript re-opens). Dogfood duty: prime-route observations are first-class output.

**Ack this brief** with one line: `brief-ack s037` + anything I got wrong.
