#!/usr/bin/env bash
# pij-skill-check — structural gates for skills/pij (plan 030 T006, AC-01/02/03/05).
# Checks: registry↔module parity (pending-marked rows exempt) · sibling-blindness ·
# line budgets · CLI-verb coverage · duplicated-prose scope · prime payload integrity
# and portability.
set -u
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SKILL=${PIJ_SKILL_ROOT:-skills/pij}
FAIL=0
err() { echo "✗ $1"; FAIL=1; }
ok()  { echo "✓ $1"; }
warn() { echo "⚠ $1"; }

# 1. registry ↔ module parity
registry_rows=$(sed -n '/^## Registry/,/^## /p' "$SKILL/SKILL.md" | grep '^| `' || true)
prime_rows=$(printf '%s\n' "$registry_rows" | grep '^| `prime` |' || true)
prime_row_count=$(printf '%s\n' "$prime_rows" | grep -c '^| `prime` |' || true)
valid_prime_row_count=$(printf '%s\n' "$prime_rows" \
  | grep -Ec '^\| `prime` \|.*\| `references/routes/prime\.md` \|$' || true)
pending_prime_row_count=$(printf '%s\n' "$prime_rows" \
  | grep -Ec 'lands Phase 2|future|no route module' || true)
if [ "$prime_row_count" -eq 1 ] \
  && [ "$valid_prime_row_count" -eq 1 ] \
  && [ "$pending_prime_row_count" -eq 0 ]; then
  ok "registry: exactly one active 'prime' row → references/routes/prime.md"
else
  err "registry: expected exactly one active 'prime' row → references/routes/prime.md"
fi

while IFS= read -r line; do
  route=$(printf '%s' "$line" | sed -n 's/^| `\([a-z]*\)`.*/\1/p')
  [ -z "$route" ] && continue
  mod="$SKILL/references/routes/$route.md"
  if printf '%s' "$line" | grep -q 'lands Phase 2\|future\|no route module'; then
    [ -f "$mod" ] && err "registry: '$route' marked pending but module EXISTS ($mod) — unmark the row" \
                  || ok "registry: '$route' pending (no module, as marked)"
  else
    [ -f "$mod" ] && ok "registry: '$route' → $mod" || err "registry: '$route' has no module at $mod"
  fi
done <<< "$registry_rows"

# 2. sibling-blindness: no route module names another route module or "/pij <other>".
# prime's deterministic worker-redirect row is the one scoped exception.
for f in "$SKILL"/references/routes/*.md; do
  [ -e "$f" ] || continue
  self=$(basename "$f" .md)
  for r in pair delegate agent skill peer ops prime watch; do
    [ "$r" = "$self" ] && continue
    hits=$(grep -En "routes/$r\.md|/pij $r\b" "$f" 2>/dev/null || true)
    if [ "$self" = prime ] && { [ "$r" = pair ] || [ "$r" = peer ]; }; then
      hits=$(printf '%s\n' "$hits" | grep -Ev '^[0-9]+:\|.*\| worker \|.*`/pij pair`.*`/pij peer`' || true)
    fi
    if [ -n "$hits" ]; then
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

soft_budget() {
  [ -f "$1" ] || return 0
  n=$(wc -l < "$1" | tr -d ' ')
  if [ "$n" -le "$2" ]; then
    ok "budget: $1 ($n/$2, advisory)"
  else
    warn "budget: $1 is $n lines (advisory max $2)"
  fi
}
soft_budget "$SKILL/references/routes/prime.md" 90
for m in bootstrap kickoff batons reports incidents; do
  soft_budget "$SKILL/references/prime/rituals/$m.md" 90
done
soft_budget "$SKILL/references/prime/protocol.md" 170

# 4. CLI-verb coverage: every required bin family is mapped in the coverage table.
cli_rows=$(sed -n '/^## CLI-verb coverage/,/^## /p' "$SKILL/SKILL.md" | grep '^| `' || true)
for v in spawn close adopt daemon compact-self telegram agent whoami list send tail state phonehome path models orchestration baton prime; do
  printf '%s\n' "$cli_rows" | grep -Fq "\`$v\`" \
    || err "verb coverage: '$v' unmapped in CLI-verb coverage table"
done
ok "CLI-verb coverage scanned"

# 5. duplicated-prose: convention headings (### C<n> —) live only in 00-routing.md
dups=$(grep -rl '^### C[0-9] — ' "$SKILL" --include='*.md' 2>/dev/null | grep -v '00-routing.md' || true)
[ -n "$dups" ] && err "dup-prose: convention headings outside 00-routing.md: $dups" || ok "dup-prose: conventions single-owner"

# 6. prime payload: exact tree + every relative markdown pointer resolves.
prime_required=(
  "$SKILL/references/routes/prime.md"
  "$SKILL/references/prime/orient-oprime.md"
  "$SKILL/references/prime/orient-global.md"
  "$SKILL/references/prime/prime-flow.schema.json"
  "$SKILL/references/prime/biome.json"
  "$SKILL/references/prime/rituals/bootstrap.md"
  "$SKILL/references/prime/rituals/kickoff.md"
  "$SKILL/references/prime/rituals/batons.md"
  "$SKILL/references/prime/rituals/reports.md"
  "$SKILL/references/prime/rituals/incidents.md"
  "$SKILL/references/prime/templates/spine.md"
  "$SKILL/references/prime/templates/baton-book.md"
  "$SKILL/references/prime/templates/stream-brief.md"
  "$SKILL/references/prime/templates/orient-local.md"
  "$SKILL/references/prime/templates/seat-handover.md"
  "$SKILL/references/prime/protocol.md"
  "$SKILL/references/prime/exemplars/canary-record.md"
  "$SKILL/references/prime/exemplars/grant-log.md"
)
for f in "${prime_required[@]}"; do
  [ -f "$f" ] && ok "prime payload: $f" || err "prime payload missing: $f"
done

check_links() {
  file=$1
  dir=$(dirname "$file")
  while IFS= read -r target; do
    target=${target%%#*}
    [ -z "$target" ] && continue
    case "$target" in
      /*|http://*|https://*|mailto:*) continue ;;
    esac
    [ -e "$dir/$target" ] || err "prime pointer: $file → $target is missing"
  done < <(grep -Eo '\]\([^)]*\)' "$file" 2>/dev/null | sed 's/^](//; s/)$//' || true)
}
check_links "$SKILL/references/routes/prime.md"
while IFS= read -r f; do check_links "$f"; done < <(find "$SKILL/references/prime" -type f -name '*.md' | sort)
ok "prime pointer-integrity scanned"

# 7. frozen evidence expected by the route's provenance contract.
for f in \
  bootstrap.md encode-candidates.md kickoff-runbook.md map.md \
  orient-local.secondcrack.md pij-prime-answers-r1.md \
  pij-prime-concept-briefing.md pij-prime-spine-validation.md \
  pij-prime-war-stories.md; do
  [ -f "docs/plans/035-o-prime-routing-skill/vendored/$f" ] \
    && ok "prime evidence: $f" \
    || err "prime evidence missing: docs/plans/035-o-prime-routing-skill/vendored/$f"
done

# 8. runtime payload must stand alone after the transitional source repo disappears.
severance_paths=("$SKILL")
[ -f docs/how/pij-prime.md ] && severance_paths+=(docs/how/pij-prime.md)
leaks=$(grep -rIl '/Users/jordanknight/games/SecondCrack' "${severance_paths[@]}" 2>/dev/null || true)
[ -n "$leaks" ] && err "prime portability: transitional SecondCrack path leaked into runtime docs: $leaks" \
                  || ok "prime portability: transitional source path severed"

if [ "$FAIL" -eq 0 ]; then echo "✅ pij-skill-check: all green"; else echo "❌ pij-skill-check failed"; fi
exit $FAIL
