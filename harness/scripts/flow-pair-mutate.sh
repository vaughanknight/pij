#!/usr/bin/env bash
# flow-pair mutation smoke — prove a test suite actually GUARDS a behaviour.
#
# Why this exists: in flow-pair the *worker* (the cheaper, less-capable model)
# writes BOTH the implementation and its tests, so a green suite is NOT an
# independent quality signal — the tests share the author's blind spots. This
# script deliberately breaks the code, asserts the suite goes RED, restores the
# file byte-identical, and asserts it goes GREEN again. A suite that stays green
# under mutation does not guard the behaviour and must be treated as FIX_REQUIRED.
#
# Usage:
#   harness/scripts/flow-pair-mutate.sh <file> <sed-ERE-expr> [test-cmd]
# Example (neuter every appendEvent-result guard in the ledger writer):
#   harness/scripts/flow-pair-mutate.sh skills/flow-pair/lib/ledger.ts \
#     's/if \(!ev[A-Za-z]+\.ok\)/if (false)/g'
set -euo pipefail

FILE="${1:?usage: flow-pair-mutate.sh <file> <sed-ERE-expr> [test-cmd]}"
EXPR="${2:?missing sed ERE expression}"
TEST_CMD="${3:-npx vitest run skills/flow-pair/test/}"

[ -f "$FILE" ] || { echo "✗ no such file: $FILE" >&2; exit 2; }

BAK="$(mktemp)"
cp "$FILE" "$BAK"
trap 'cp "$BAK" "$FILE"; rm -f "$BAK"' EXIT   # safety net: always restore

# Portable in-place sed (GNU vs BSD/macOS).
if sed --version >/dev/null 2>&1; then
  sed -E -i "$EXPR" "$FILE"
else
  sed -E -i '' "$EXPR" "$FILE"
fi

if diff -q "$BAK" "$FILE" >/dev/null; then
  echo "✗ mutation matched nothing — bad sed expr? nothing proven: $EXPR" >&2
  exit 3
fi
echo "→ mutated $FILE; running suite (expect RED)…"

if eval "$TEST_CMD" >/tmp/fp-mutate.log 2>&1; then
  echo "✗ FAIL: tests STAYED GREEN under mutation — the suite does not guard this behaviour." >&2
  grep -E "Tests +[0-9]" /tmp/fp-mutate.log | tail -1 >&2 || true
  exit 1
fi
echo "✓ suite went RED under mutation:"
grep -E "Tests +[0-9]" /tmp/fp-mutate.log | tail -1 || true

# Restore + verify byte-identical, then confirm GREEN again.
cp "$BAK" "$FILE"; rm -f "$BAK"; trap - EXIT
echo "→ restored; re-running suite (expect GREEN)…"
if eval "$TEST_CMD" >/tmp/fp-mutate.log 2>&1; then
  echo "✓ GREEN after restore:"; grep -E "Tests +[0-9]" /tmp/fp-mutate.log | tail -1 || true
  echo "✓ mutation smoke PASSED — the suite guards this behaviour."
else
  echo "✗ suite RED after restore — restore failed; investigate /tmp/fp-mutate.log" >&2
  exit 4
fi
