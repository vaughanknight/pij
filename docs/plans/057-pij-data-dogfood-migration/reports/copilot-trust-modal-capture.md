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
