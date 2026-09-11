#!/bin/zsh
# pij fleet recovery — run AFTER the reboot that fixes the macOS keychain.
# Owner: the pij o-prime seat. Safe to run more than once.
#
# Written 2026-09-12 by pij-relative-panther while still live. Companion doc:
#   ~/pij-handover-relative-panther.md
#   government/briefs/prime-handover-2026-09-12.md  (on origin/main)
#
# This script ONLY restores pij's own watch machinery and reports what it finds.
# It deliberately does NOT start the daemon, spawn seats, or touch any other
# fleet — those are the prime's judgement calls, and the daemon is shared.

set -u
H=~/.claude/projects/-Users-vaughanknight-GitHub-pij/helpers
ok=0; bad=0
say() { printf '%s\n' "$*"; }
chk() { if [ "$1" = ok ]; then ok=$((ok+1)); printf '  OK    %s\n' "$2"; else bad=$((bad+1)); printf '  FAIL  %s\n' "$2"; fi }

say "=== 1. did the reboot actually fix the keychain? ==="
# This is the whole reason for the reboot. Check it FIRST — everything else is
# downstream, and a green-looking fleet on a broken keychain is a lie.
if security list-keychains >/dev/null 2>&1; then chk ok "keychain service responds"; else chk no "keychain STILL DOWN — stop here, the reboot did not fix it"; fi
if dscl . -read "$HOME" NFSHomeDirectory >/dev/null 2>&1; then chk ok "directory services respond"; else chk no "directory services STILL DOWN"; fi
if gh api rate_limit --jq '.rate.remaining' >/dev/null 2>&1; then
  chk ok "gh TLS works again — the outage is over"
  say "  -> consider putting seat:upstream-head and card-refresh.sh back on gh"
else
  chk no "gh still fails TLS — leave the curl workarounds in place"
fi

say ""
say "=== 2. helper scripts present on disk ==="
# They were once running from unlinked inodes with no directory entry (E57).
# "The process is running" is not evidence "the program still exists".
for f in card-refresh.sh pa-chaser.sh prime-failover.sh; do
  if [ -f "$H/$f" ]; then chk ok "$f"; else chk no "$f MISSING — recover from git or rewrite"; fi
done

say ""
say "=== 3. restart the three watchers ==="
for s in pij-card-refresh:card-refresh.sh pij-pa-chaser:pa-chaser.sh pij-prime-failover:prime-failover.sh; do
  sess=${s%%:*}; script=${s##*:}
  if tmux has-session -t "$sess" 2>/dev/null; then
    chk ok "$sess already running (left alone)"
  elif [ -f "$H/$script" ]; then
    tmux new-session -d -s "$sess" "zsh $H/$script" && chk ok "$sess started" || chk no "$sess failed to start"
  else
    chk no "$sess NOT started — $script missing"
  fi
done

say ""
say "=== 4. prove each watcher actually works (one pass, not just 'it is running') ==="
CARD_ONCE=1 zsh "$H/card-refresh.sh" >/dev/null 2>&1 && chk ok "card refresher single pass" || chk no "card refresher single pass FAILED"
tail -1 "$H/card-refresh.log" 2>/dev/null | sed 's/^/        /'
WATCH_ONCE=1 FAILOVER_DRY=1 zsh "$H/prime-failover.sh" >/dev/null 2>&1 && chk ok "failover dry pass" || chk no "failover dry pass FAILED"
tail -1 "$H/prime-failover.log" 2>/dev/null | sed 's/^/        /'

say ""
say "=== 5. fleet state (report only — the prime decides what to do) ==="
pij state pij-ready-perosteck 2>&1 | head -2 | sed 's/^/  /'
pij state pij-compact-heron   2>&1 | head -2 | sed 's/^/  /'
say "  NOTE: pij list shows the OLD boundModel for both — it is a spawn-time"
say "        snapshot and cannot be re-stamped (E53). The PANE FOOTER is the"
say "        only honest verification of which model a seat is really running."

say ""
say "=== 6. respawn reminders — NOT done automatically ==="
say "  - Standby pij-compact-heron came back at effort=medium after the astra"
say "    switch (its own log: previousReasoningEffort=high -> medium). It is the"
say "    failover prime. Respawn it with an EXPLICIT effort (xhigh) so the seat"
say "    that would inherit the government is not running degraded."
say "  - Copilot/OMP seats MUST be spawned with --layout window. The default"
say "    stack layout gave a 19-column pane and the first standby wedged unbound."
say "  - Fresh Copilot seats cannot bind until the keychain is healthy — check"
say "    section 1 is green before spawning anything."

say ""
printf '=== %d ok, %d failed ===\n' "$ok" "$bad"
[ "$bad" -eq 0 ] || say "Some checks FAILED — read them; do not assume the fleet is healthy."
exit 0
