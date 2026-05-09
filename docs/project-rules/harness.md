# pij — Agent Harness Contract (BIO loop)

> The Boot / Interact / Observe contract any agent can use to validate
> work on pij autonomously, without reading the full RUNBOOK or AGENTS.md.

**Maturity**: L2 — auto boot via npm; deterministic observe via
`npm run self-check`; tmux-driven interact for end-to-end smoke.

## Boot

```bash
npm install
```

Done when: `npm install` exits 0. Network required; ~20–30 s the first
time, much faster on subsequent runs (npm cache).

## Interact

Two interaction modes, depending on what you're validating.

### Interactive (TUI)

```bash
pi
```

From the pij root. Pi auto-loads any extension in `.pi/extensions/<name>/`.
Type slash commands (`/<name>`); evidence comes from the rendered TUI.
Use this when you need a human-in-the-loop or when debugging behaviour
that doesn't yet have a smoke scenario.

### Automated (smoke)

```bash
npm run smoke -- <name>      # one extension
npm run smoke                # all scenarios
```

Drives pi inside a fresh tmux session per scenario. Each step sends
keystrokes and asserts a regex against the captured pane. Exit 0 ⇒ pass.

## Observe

```bash
npm run self-check
```

Runs in fail-fast order: `typecheck → lint → test → smoke`. Step 4
(smoke) requires tmux + the `pi` binary on PATH; CI runs steps 1–3
only (smoke is local until a SDK-driven smoke is built — see
`docs/difficulties.md` D-008).

Done when: exit 0. The wall-clock for a full self-check is recorded in
`docs/velocity.md` as evidence for the compounding hypothesis (see spec
§ Clarifications session 2026-05-09b — no fixed minute thresholds are
gates; we measure and compare against the v1 baseline).

## Hard failures (stop work, file a difficulty)

- `npm install` fails → check Node ≥ 20, network, package-lock integrity.
- `npm run typecheck` fails → P6 (`.js` extensions) or P7 (structural
  types) is the most common cause.
- `npm run lint` fails → run `npm run format` and re-check.
- `npm test` fails → the store layer (P2/P8). Tests target `store.ts`,
  not the pi-side wiring.
- `npm run smoke -- <name>` fails → either tmux/pi env (check `which
  tmux && which pi`), or the scenario's regex doesn't match (capture the
  pane manually with `tmux capture-pane -p` to see what pi rendered).

## Soft failures (note, continue)

- pi displays "Update Available" — informational, harness still works.
- pi prints "tmux extended-keys-format" warning — cosmetic; add the
  recommended line to `~/.tmux.conf` if you care.

## Health check (single line)

```bash
npm run self-check && echo "HARNESS_HEALTHY" || echo "HARNESS_BROKEN"
```

Use this at the start of any session that intends to author or modify
extensions. If `HARNESS_BROKEN`, fix the harness before any extension
work. **The harness IS the product.**

## History

| Date | Change |
|------|--------|
| 2026-05-09 | v0.1.0 — harness shipped (Phase 1–6); BIO contract first lands here as part of Phase 5 (T028). Spec § Clarifications 2026-05-09b removed fabricated minute targets; this contract is measurement-anchored only. |
