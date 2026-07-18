# Copilot folder-trust modal — live capture (pins DL-001's answer keys)

**Captured**: 2026-07-18, live spawn into a fresh untrusted dir (probe seat
pij-spectacular-bobcat, closed after capture). Copilot CLI version = current
machine install at capture time.

```
│ Do you trust the files in this folder?        │
│                                               │
│ ❯ 1. Yes                                      │
│  2. Yes, and remember this folder for future  │
│  sessions                                     │
│   3. No (Esc)                                 │
│                                               │
│ ↑/↓ to navigate · enter to select · esc to    │
```

**Verdicts pinned**: option `1` = trust-ONCE (session-scoped) — the
implementation's `["1","Enter"]` is correct, and `1` is also the default
cursor. Option `2` (remember/global) is deliberately untypeable in the sendKey
union. `3. No (Esc)` confirms Esc = dead pane — why the dismiss class must
never answer this modal. Classifier regex `/Do you trust|trust the files in/i`
matches this text. Version drift falls back to needs-human via the one-shot
latch (no key spam).

---

# Codex update prompt — live capture (pins T1's answer keys)

**Captured**: 2026-07-18, live spawn (probe pij-eventual-shrimp, closed after);
codex-cli 0.144.1 with 0.144.5 pending — the modal was REAL, not simulated.

```
  ✨ Update available! 0.144.1 -> 0.144.5
  Release notes: https://github.com/openai/codex/
› 1. Update now (runs `npm install -g @openai/codex`)
  2. Skip
  3. Skip until next version
  Press enter to continue
```

**Verdicts pinned**: cursor DEFAULTS to `1. Update now` — the wedge (a spawned
seat waits here forever; the watchdog can't see pre-bind seats — 2.5 days at
osk). Auto-answer = `2. Skip` (session-scoped, mutates nothing); never 1 (a
global npm install mid-fleet-op); never 3 (stickier than a spawned seat should
decide); never Esc. Same one-shot-latch + needs-human drift fallback as the
copilot trust answer. Defense in depth: the spawn-limbo sensor still alarms at
8min if any future modal variant slips the classifier.
