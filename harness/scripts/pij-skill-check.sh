#!/usr/bin/env bash
# pij-skill-check — structural gates for skills/pij (plans 030 and 042).
# Checks: registry↔module parity (pending-marked rows exempt) · sibling-blindness ·
# line budgets · CLI-verb coverage · duplicated-prose scope · prime payload integrity
# and portability · stream-orchestrator journey and worktree lifecycle.
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
budget "$SKILL/references/prime/orchestrator.md" 120

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
  "$SKILL/references/prime/orchestrator.md"
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

# 7. stream-orchestrator route, ordered journey, and lifecycle markers.
orchestrator="$SKILL/references/prime/orchestrator.md"
prime_route="$SKILL/references/routes/prime.md"

stream_rows=$(sed -n '/^## Role triage/,/^## /p' "$prime_route" | grep -E '^\|.*\| stream \|' || true)
stream_row_count=$(printf '%s\n' "$stream_rows" | grep -c 'stream' || true)
stream_pointer_count=$(printf '%s\n' "$stream_rows" \
  | grep -Ec '\]\(\.\./prime/orchestrator\.md\)' || true)
if [ "$stream_row_count" -eq 1 ] && [ "$stream_pointer_count" -eq 1 ]; then
  ok "orchestrator route: one stream row → prime/orchestrator.md"
else
  err "orchestrator route: expected one stream row → prime/orchestrator.md"
fi
printf '%s\n' "$stream_rows" | grep -Fq '../prime/orient-global.md' \
  && err "orchestrator route: stream row bypasses module-first landing" \
  || ok "orchestrator route: stream row does not bypass the landing module"

orchestrator_registry_rows=$(printf '%s\n' "$registry_rows" | grep '^| `orchestrator` |' || true)
[ -z "$orchestrator_registry_rows" ] \
  && ok "orchestrator registry: no second top-level route row" \
  || err "orchestrator registry: forbidden second top-level 'orchestrator' row"

require_marker() {
  file=$1
  marker=$2
  label=$3
  if [ -f "$file" ] && grep -Fq "$marker" "$file"; then
    ok "$label"
  else
    err "$label — missing '$marker' in $file"
  fi
}

if [ -f "$orchestrator" ]; then
  previous=0
  while IFS='|' read -r label marker; do
    [ -z "$marker" ] && continue
    line=$(grep -nF "$marker" "$orchestrator" | head -1 | cut -d: -f1 || true)
    if [ -z "$line" ]; then
      err "orchestrator order: missing $label marker '$marker'"
    elif [ "$line" -lt "$previous" ]; then
      err "orchestrator order: $label marker '$marker' is out of order"
    else
      ok "orchestrator order: $label"
      previous=$line
    fi
  done <<'EOF'
role|You are a stream orchestrator
global orient|orient-global.md
local orient|government/orient-local.md
brief|item brief
thesis|/thesis
real invocation|host skill mechanism
preamble|human preamble
planning|guided `/builder`
validation|/validate-v2
wait gate|WAITING_FOR_BUILD_CONFIG
construction|worktree
delegation|/pij pair
landing|/builder 8 ship
EOF

  require_marker "$orchestrator" "A plausible thesis written from memory does not satisfy this step." \
    "orchestrator contract: thesis anti-fake wording"
  require_marker "$orchestrator" "separate Copilot gpt-5.6-sol @ xhigh coder" \
    "orchestrator contract: exact default coder profile"
  require_marker "$orchestrator" "separate Copilot gpt-5.6-sol @ xhigh reviewer" \
    "orchestrator contract: exact default reviewer profile"
  require_marker "$orchestrator" "read it back verbatim" \
    "orchestrator contract: verbatim profile read-back"
  require_marker "$orchestrator" "never the o-prime's window" \
    "orchestrator contract: anti-prime-window topology"
  require_marker "$orchestrator" "source-verify every claimed seam" \
    "orchestrator contract: source-verified seams"
  require_marker "$orchestrator" "immutable" \
    "orchestrator contract: immutable packets"
  require_marker "$orchestrator" "reviewer forms findings" \
    "orchestrator contract: reviewer-owned findings"
  require_marker "$orchestrator" "stop and re-brief" \
    "orchestrator contract: frozen review lane"
  require_marker "$orchestrator" "persisted findings" \
    "orchestrator contract: non-empty fix evidence"
  require_marker "$orchestrator" "shared-tree fallback" \
    "orchestrator contract: shared-tree is fallback"
  require_marker "$orchestrator" "outage-first" \
    "orchestrator recovery: silence is outage-first"
  require_marker "$orchestrator" "15-minute cadence" \
    "orchestrator recovery: bounded silence cadence"
  require_marker "$orchestrator" '`COMPLETE`, `CONTINUING`, or `BLOCKED`' \
    "orchestrator recovery: explicit status response"
  require_marker "$orchestrator" "poke before redispatch" \
    "orchestrator recovery: poke before redispatch"
  require_marker "$orchestrator" "repeated short-interval polling" \
    "orchestrator recovery: no polling regression"
  require_marker "$orchestrator" "timestamp-only" \
    "orchestrator scope alert: timestamp-only classification"
  require_marker "$orchestrator" ".pi/packages.yaml" \
    "orchestrator scope alert: package manifest named"
  require_marker "$orchestrator" "vetted.date" \
    "orchestrator scope alert: vet-stamp noise named"
  require_marker "$orchestrator" "byte-identical to branch HEAD" \
    "orchestrator scope alert: exact restore proof"
  require_marker "$orchestrator" "Never hand-edit package state" \
    "orchestrator scope alert: package hand-edit ban preserved"
  require_marker "$orchestrator" "current provided-peer path" \
    "orchestrator pair config: provided-peer path named"
  require_marker "$orchestrator" "persist the plan roster" \
    "orchestrator pair config: plan roster persistence"
  require_marker "$orchestrator" "current flow-pair engine does not persist" \
    "orchestrator pair config: engine persistence ceiling"

  previous=0
  while IFS='|' read -r label marker; do
    line=$(grep -nF -- "$marker" "$orchestrator" | head -1 | cut -d: -f1 || true)
    if [ -z "$line" ]; then
      err "orchestrator pair order: missing $label marker '$marker'"
    elif [ "$line" -lt "$previous" ]; then
      err "orchestrator pair order: $label marker '$marker' is out of order"
    else
      ok "orchestrator pair order: $label"
      previous=$line
    fi
  done <<'EOF'
human confirmation|After the human confirms the fleet
coder override|--coder-model <confirmed>
reviewer override|--reviewer-model <confirmed>
phase delegation|Delegate each whole phase
EOF

  direct_build=$(grep -Ein \
    'implement (it |the phase |the plan )?(yourself|directly)|start implementing|write (the )?code yourself|build directly' \
    "$orchestrator" || true)
  [ -z "$direct_build" ] \
    && ok "orchestrator contract: no direct-build permission" \
    || err "orchestrator contract: forbidden direct-build language"

  authored_findings=$(grep -Ein \
    '(author|write|form|invent) (the )?(reviewer |review )?findings|review findings before the reviewer' \
    "$orchestrator" || true)
  [ -z "$authored_findings" ] \
    && ok "orchestrator contract: no orchestrator-authored findings" \
    || err "orchestrator contract: forbidden orchestrator-authored findings"
else
  err "orchestrator contract: missing $orchestrator"
fi

for f in \
  "$SKILL/references/prime/rituals/kickoff.md" \
  "$SKILL/references/prime/templates/stream-brief.md" \
  "$SKILL/references/prime/templates/spine.md"; do
  spawn_cwd_leak=$(grep -En 'pij spawn.*--cwd' "$f" 2>/dev/null || true)
  [ -z "$spawn_cwd_leak" ] \
    && ok "peer spawn cwd: $(basename "$f") does not invent --cwd" \
    || err "peer spawn cwd: $(basename "$f") documents unsupported pij spawn --cwd"
done

bootstrap_worktree_add_count=$(grep -Fc 'git worktree add' \
  "$SKILL/references/prime/rituals/bootstrap.md" || true)
[ "$bootstrap_worktree_add_count" -eq 0 ] \
  && ok "worktree lifecycle: bootstrap delegates construction" \
  || err "worktree lifecycle: bootstrap must not run git worktree add"
require_marker "$SKILL/references/prime/rituals/bootstrap.md" \
  "Kickoff is the sole construction owner" \
  "worktree lifecycle: kickoff is sole construction owner"
kickoff_worktree_create_count=$(grep -Fc 'git worktree add -b' \
  "$SKILL/references/prime/rituals/kickoff.md" || true)
[ "$kickoff_worktree_create_count" -eq 1 ] \
  && ok "worktree lifecycle: kickoff has exactly one create command" \
  || err "worktree lifecycle: kickoff must contain git worktree add -b exactly once"
require_marker "$SKILL/references/prime/rituals/kickoff.md" "process.cwd()" \
  "worktree lifecycle: kickoff explains peer cwd derivation"
require_marker "$SKILL/references/prime/rituals/kickoff.md" "/pij prime" \
  "worktree lifecycle: kickoff enters module-first"
require_marker "$SKILL/references/prime/rituals/kickoff.md" "PR merge" \
  "worktree lifecycle: kickoff waits for PR merge"
require_marker "$SKILL/references/prime/rituals/kickoff.md" "explicit abandonment" \
  "worktree lifecycle: kickoff permits ruled abandonment"
require_marker "$SKILL/references/prime/templates/stream-brief.md" "**Worktree**" \
  "worktree lifecycle: brief records worktree"
require_marker "$SKILL/references/prime/templates/stream-brief.md" "**Branch**" \
  "worktree lifecycle: brief records branch"
require_marker "$SKILL/references/prime/templates/stream-brief.md" "**Base**" \
  "worktree lifecycle: brief records base"
require_marker "$SKILL/references/prime/templates/stream-brief.md" "/builder 8 ship" \
  "worktree lifecycle: brief records ship seam"
require_marker "$SKILL/references/prime/templates/spine.md" "Worktree" \
  "worktree lifecycle: spine roster records worktree"
require_marker "$SKILL/references/prime/templates/spine.md" "Branch" \
  "worktree lifecycle: spine roster records branch"
require_marker "$SKILL/references/prime/templates/spine.md" "Base" \
  "worktree lifecycle: spine allocation records base"
require_marker "$SKILL/references/prime/templates/orient-local.md" "Worktree root" \
  "worktree lifecycle: local orient derives root"
require_marker "$SKILL/references/prime/templates/orient-local.md" "Worktree naming" \
  "worktree lifecycle: local orient derives naming"
require_marker "$SKILL/references/prime/templates/orient-local.md" "Base branch" \
  "worktree lifecycle: local orient derives base"
require_marker "$SKILL/references/prime/templates/orient-local.md" "Landing policy" \
  "worktree lifecycle: local orient derives landing"
require_marker "$SKILL/references/prime/orient-oprime.md" "worktree and branch" \
  "worktree lifecycle: o-prime defaults to isolated construction"
require_marker "$SKILL/references/prime/protocol.md" "worktree-primary" \
  "worktree lifecycle: protocol names primary construction"
require_marker "$SKILL/references/prime/protocol.md" "/builder 8 ship" \
  "worktree lifecycle: protocol names Builder ship"
require_marker "$SKILL/references/prime/protocol.md" "shared-tree fallback" \
  "worktree lifecycle: protocol preserves fallback"
require_marker "$SKILL/references/prime/rituals/batons.md" "shared-tree fallback" \
  "worktree lifecycle: batons narrow shared-tree serialization"
require_marker "$SKILL/references/prime/rituals/batons.md" "timing" \
  "worktree lifecycle: batons preserve timing purity"
require_marker "$SKILL/references/prime/rituals/incidents.md" "shared-tree fallback" \
  "worktree lifecycle: incidents preserve INC-004 as fallback evidence"
require_marker "docs/how/pij-prime.md" "prime/orchestrator.md" \
  "prime guide: links orchestrator landing"
require_marker "docs/how/pij-prime.md" "/builder 8 ship" \
  "prime guide: summarizes Builder ship"
require_marker "docs/domains/pij-skill/domain.md" "Stream Orchestrator Landing" \
  "pij-skill domain: names orchestrator landing concept"

# 8. frozen evidence expected by the route's provenance contract.
for f in \
  bootstrap.md encode-candidates.md kickoff-runbook.md map.md \
  orient-local.secondcrack.md pij-prime-answers-r1.md \
  pij-prime-concept-briefing.md pij-prime-spine-validation.md \
  pij-prime-war-stories.md; do
  [ -f "docs/plans/035-o-prime-routing-skill/vendored/$f" ] \
    && ok "prime evidence: $f" \
    || err "prime evidence missing: docs/plans/035-o-prime-routing-skill/vendored/$f"
done

# 9. runtime payload must stand alone after the transitional source repo disappears.
severance_paths=("$SKILL")
[ -f docs/how/pij-prime.md ] && severance_paths+=(docs/how/pij-prime.md)
# local-path-check: allow -- literal is the forbidden transitional source path.
leaks=$(grep -rIl '/Users/jordanknight/games/SecondCrack' "${severance_paths[@]}" 2>/dev/null || true)
[ -n "$leaks" ] && err "prime portability: transitional SecondCrack path leaked into runtime docs: $leaks" \
                  || ok "prime portability: transitional source path severed"

if [ "$FAIL" -eq 0 ]; then echo "✅ pij-skill-check: all green"; else echo "❌ pij-skill-check failed"; fi
exit $FAIL
