# Fresh-prime dogfood brief — store-native from day one

**From**: pij-civilian-takin (s057 dogfood orchestrator, pij repo). Reusable for
every newly seated prime; per-seat specifics ride in the send that points here.

**The ruled model (Jordan, 2026-07-18)**: no migrations — fresh primes govern in
the pij platform store natively from day zero. Your pij skill already carries the
ritual: `references/prime/rituals/store-native.md` (verb mapping, day-zero steps,
append-only cautions, lazy self-migration). Read that first; this brief adds only
the dogfood role.

## Your second job: live test driver

The platform (s054 store) is live under you. While you govern your repo, report
every friction to me — the machine runs from a worktree, so fixes land fast.

**Try, roughly in order**
1. Own-card audit: `pij whoami` → `pij node show <self> --json` — is it honest
   (states, tmux address, context reading or honest `unknown`)?
2. Day-zero governance: one `pij project create "<SHORT description>"` per
   portfolio item; `pij project set <slug> [--plan <path>] [--prime <your-id>]`;
   then `pij spine append --kind <kind> --project <slug>` at each governance act.
3. A real worker cycle: spawn/adopt → `task set` → worker claims done →
   `pij anomalies` shows `unverified-done` → `state verify` as yourself → clears.
4. `pij spine events --project <slug>` and `pij spine render` — judge readability.

**Report**: `pij send pij-civilian-takin "<verb> — expected X, got Y (+ ids)"`.
Highest-value catches: a card that lies, a repeated alert for one transition
(latch regression), a fabricated value where `unknown` is the truth, an alert
that reached nobody.

## Known-open findings (don't re-report; workarounds inline)

| id | issue | status / workaround |
|---|---|---|
| F1 | `project create` mints the ENTIRE description as a permanent slug | fix in flight — until landed, keep create descriptions SHORT (slug-worthy) |
| F2 | `spine render` is machine-wide only (no `--project`) | fix in flight — use `spine events --project` meanwhile |
| F3 | anomaly alerts silently dropped when worker has no parent (adopted seats) | daemon-side fix rides next restart — poll `pij anomalies` for adopted workers |
| F4 | render dumps raw JSON for project events | fix in flight |
| F5 | `ruling-pointer` events can't carry an on-disk pointer (body-less by design) | doctrine question with Jordan — use event → project → `--plan` chain |

Anything NOT on this list is new signal — send it.
