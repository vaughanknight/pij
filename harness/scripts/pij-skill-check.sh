#!/usr/bin/env bash
# pij-skill-check — structural gates for skills/pij (plan 030 T006, AC-01/02/03/05).
# Checks: registry↔module parity (pending-marked rows exempt) · sibling-blindness ·
# line budgets · CLI-verb coverage · duplicated-prose scope (skills/pij/** in Phase 1;
# widen repo-wide at the Phase-2 shim).
set -u
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SKILL=skills/pij
FAIL=0
err() { echo "✗ $1"; FAIL=1; }
ok()  { echo "✓ $1"; }

# 1. registry ↔ module parity
while IFS= read -r line; do
  route=$(printf '%s' "$line" | sed -n 's/^| `\([a-z]*\)`.*/\1/p')
  [ -z "$route" ] && continue
  mod="$SKILL/references/routes/$route.md"
  if printf '%s' "$line" | grep -q 'lands Phase 2\|future'; then
    [ -f "$mod" ] && err "registry: '$route' marked pending but module EXISTS ($mod) — unmark the row" \
                  || ok "registry: '$route' pending (no module, as marked)"
  else
    [ -f "$mod" ] && ok "registry: '$route' → $mod" || err "registry: '$route' has no module at $mod"
  fi
done < <(sed -n '/^## Registry/,/^## /p' "$SKILL/SKILL.md" | grep '^| `')

# 2. sibling-blindness: no route module names another route module or "/pij <other>"
for f in "$SKILL"/references/routes/*.md; do
  [ -e "$f" ] || continue
  self=$(basename "$f" .md)
  for r in pair delegate agent skill peer ops watch; do
    [ "$r" = "$self" ] && continue
    if grep -Eq "routes/$r\.md|/pij $r\b" "$f"; then
      err "sibling-blind: $(basename "$f") references route '$r'"
    fi
  done
done
ok "sibling-blindness scanned"

# 3. line budgets
budget() {
  [ -f "$1" ] || return 0
  n=$(wc -l < "$1" | tr -d ' ')
  if [ "$n" -le "$2" ]; then ok "budget: $1 ($n/$2)"; else err "budget: $1 is $n lines (max $2)"; fi
}
budget "$SKILL/SKILL.md" 150
budget "$SKILL/references/00-routing.md" 250
budget "$SKILL/references/routes/pair.md" 350
for m in peer agent skill ops delegate; do budget "$SKILL/references/routes/$m.md" 150; done

# 4. CLI-verb coverage: every bin-USAGE verb (+ models) mapped somewhere in SKILL.md
for v in spawn close adopt daemon compact-self telegram agent whoami list send tail state phonehome path models; do
  grep -q "\b$v\b" "$SKILL/SKILL.md" || err "verb coverage: '$v' unmapped in SKILL.md"
done
ok "CLI-verb coverage scanned"

# 5. duplicated-prose: convention headings (### C<n> —) live only in 00-routing.md
dups=$(grep -rl '^### C[0-9] — ' "$SKILL" --include='*.md' 2>/dev/null | grep -v '00-routing.md' || true)
[ -n "$dups" ] && err "dup-prose: convention headings outside 00-routing.md: $dups" || ok "dup-prose: conventions single-owner"

if [ "$FAIL" -eq 0 ]; then echo "✅ pij-skill-check: all green"; else echo "❌ pij-skill-check failed"; fi
exit $FAIL
