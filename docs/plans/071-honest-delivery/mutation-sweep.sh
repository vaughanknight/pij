#!/usr/bin/env bash
# Dim-0 mutation harness for s071. Each mutant reverts ONE fix to its pre-s071
# behaviour and asserts the corresponding test FAILS. A surviving mutant means
# the test is decorative.
set -uo pipefail
cd /Users/jordanknight/pi-hacking/pij-worktrees/s071-honest-delivery
BAK=$(mktemp -d)
RESULT=0

mutate() {  # name file python_expr test_glob
  local name="$1" file="$2" pyfile="$3" tests="$4"
  cp "$file" "$BAK/$(basename "$file").bak"
  if ! python3 "$pyfile"; then
    echo "SKIP $name — mutation could not be applied"; RESULT=1
    cp "$BAK/$(basename "$file").bak" "$file"; return
  fi
  echo "MUTATION APPLIED: $name"
  if npx vitest run $tests >/dev/null 2>&1; then
    echo "  ❌ SURVIVED — tests still pass without the fix (test is not load-bearing)"
    RESULT=1
  else
    echo "  ✅ KILLED — tests fail without the fix"
  fi
  cp "$BAK/$(basename "$file").bak" "$file"
}

M=$BAK/m.py

# ── D1: archival policy ignores the 48h window (archive every terminal record) ──
cat > "$M" <<'PY'
p=".pi/extensions/pij/core/archive.ts"; s=open(p).read()
old="\tif (!Number.isFinite(ageMs) || ageMs < ARCHIVE_AFTER_MS) return \"hot\";"
new="\tif (!Number.isFinite(ageMs)) return \"hot\";"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PY
mutate "D1 archival ignores the 48h window" ".pi/extensions/pij/core/archive.ts" "$M" \
  ".pi/extensions/pij/core/archive.test.ts .pi/extensions/pij/daemon.archive.test.ts"

# ── D1: sweep scans via list() (which hides `dissolved`) ──────────────────────
cat > "$M" <<'PY'
p=".pi/extensions/pij/adapters/fs-registry.ts"; s=open(p).read()
old="\t\t\tconst descriptor = this.readFile(join(this.pijHome, name));\n\t\t\tif (!descriptor) continue;\n\t\t\tif (classifyRegistryRecord(descriptor, nowMs) !== \"archivable\") continue;"
new="\t\t\tconst descriptor = this.readFile(join(this.pijHome, name));\n\t\t\tif (!descriptor || descriptor.lifecycle === \"dissolved\") continue;\n\t\t\tif (classifyRegistryRecord(descriptor, nowMs) !== \"archivable\") continue;"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PY
mutate "D1 sweep skips dissolved (the list() blind spot)" ".pi/extensions/pij/adapters/fs-registry.ts" "$M" \
  ".pi/extensions/pij/daemon.archive.test.ts"

# ── D3: ambiguous discovery returns early again (the never-bind wedge) ────────
cat > "$M" <<'PY'
p=".pi/extensions/pij/core/daemon/loop.ts"; s=open(p).read()
old="\tconst ambiguousCount = discovery.status === \"ambiguous\" ? discovery.paths.length : undefined;"
new="\tif (discovery.status === \"ambiguous\") return { kind: \"ambiguous\", count: discovery.paths.length };\n\tconst ambiguousCount: number | undefined = undefined;"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PY
mutate "D3 ambiguous bypasses the watchdog again" ".pi/extensions/pij/core/daemon/loop.ts" "$M" \
  ".pi/extensions/pij/core/daemon/loop.test.ts"

# ── D3: send never reports blocked ────────────────────────────────────────────
cat > "$M" <<'PY'
p=".pi/extensions/pij/core/cli.ts"; s=open(p).read()
old="\tif (isBindDegraded(health)) return { receipt: \"blocked\", reason: \"never-bound\" };"
new="\tif (false) return { receipt: \"blocked\", reason: \"never-bound\" };"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PY
mutate "D3 a wedged peer gets a cheerful receipt again" ".pi/extensions/pij/core/cli.ts" "$M" \
  ".pi/extensions/pij/core/cli.test.ts"

# ── D4: adopt mints a duplicate instead of adopting into the pane ─────────────
cat > "$M" <<'PY'
p=".pi/extensions/pij/core/current-session.ts"; s=open(p).read()
old="\tconst onPane = descriptors.filter(\n\t\t(descriptor) =>\n\t\t\tdescriptor.paneId === pane &&\n\t\t\t(descriptor.lifecycle === \"pending\" || descriptor.lifecycle === \"ready\"),\n\t);"
new="\tconst onPane: SessionDescriptor[] = [];"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PY
mutate "D4 pane occupant never found (defects A+B return)" ".pi/extensions/pij/core/current-session.ts" "$M" \
  ".pi/extensions/pij/core/identity-selfheal.test.ts"

# ── D5: baton pin back to string equality ────────────────────────────────────
cat > "$M" <<'PY'
p=".pi/extensions/pij/core/orchestration/baton.ts"; s=open(p).read()
old="\t\t!sameCommit(request.pin, input.currentHead);"
new="\t\trequest.pin !== input.currentHead;"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PY
mutate "D5 baton pin compares by string equality again" ".pi/extensions/pij/core/orchestration/baton.ts" "$M" \
  ".pi/extensions/pij/core/orchestration/baton.test.ts"

# ── D6: unobservable tier hard-fails again ───────────────────────────────────
cat > "$M" <<'PY'
p=".pi/extensions/pij/core/canary.ts"; s=open(p).read()
old="\t\t\tcontextWindow = {\n\t\t\t\texpected: input.expectedContextWindow,\n\t\t\t\texpectedLabel,\n\t\t\t\tobservedLabel: \"unverified\",\n\t\t\t\tsource: \"unobservable\",\n\t\t\t\tcheck: \"unverified\",\n\t\t\t};"
new="\t\t\treturn refused(CANARY_CONTEXT_ERROR, `target '${descriptor.id}' cannot observe effective context tier`);"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PY
mutate "D6 unobservable tier hard-fails again" ".pi/extensions/pij/core/canary.ts" "$M" \
  ".pi/extensions/pij/core/canary.test.ts"

# ── D7: a FAILED send consumes the durable copy again (the real loss path) ───
cat > "$M" <<'PYEOF'
p=".pi/extensions/pij/core/daemon/loop.ts"; s=open(p).read()
old = 'if (outcome === "held" || outcome === "failed") {'
new = 'if (outcome === "held") {'
assert old in s; open(p,"w").write(s.replace(old,new,1))
PYEOF
mutate "D7 a failed send consumes the durable copy" ".pi/extensions/pij/core/daemon/loop.ts" "$M" \
  ".pi/extensions/pij/daemon.durability.test.ts"

# ── D7b: the adapter collapses `failed` back into `unverified` ───────────────
cat > "$M" <<'PYEOF'
p=".pi/extensions/pij/adapters/daemon-tmux.ts"; s=open(p).read()
old = '\t\t\treturn "failed";'
new = '\t\t\treturn "unverified";'
assert old in s; open(p,"w").write(s.replace(old,new,1))
PYEOF
mutate "D7b adapter reports a pre-submission throw as unverified" ".pi/extensions/pij/adapters/daemon-tmux.ts" "$M" \
  ".pi/extensions/pij/adapters/daemon-tmux.test.ts"

# ── D3 addendum: send stops stamping sender activity ─────────────────────────
cat > "$M" <<'PY'
p=".pi/extensions/pij/core/cli.ts"; s=open(p).read()
old="\t\t\tstampSenderActivity(deps, self, now);\n\t\t\tconst { receipt: initial"
new="\t\t\tconst { receipt: initial"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PY
mutate "D3-addendum send stops stamping sender activity" ".pi/extensions/pij/core/cli.ts" "$M" \
  ".pi/extensions/pij/core/cli.test.ts"

# ── R1 §1.1: releaseIdentity back to writeAtomic (bypasses the tombstone guard) ─
cat > "$M" <<'PYEOF'
p=".pi/extensions/pij/adapters/fs-registry.ts"; s=open(p).read()
old = "\t\t\tthis.write({ ...scrubbed, lifecycle: \"pending\" });"
new = "\t\t\tthis.writeAtomic(this.pathFor(id), { ...scrubbed, lifecycle: \"pending\" });"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PYEOF
mutate "R1 releaseIdentity writes through writeAtomic again" ".pi/extensions/pij/adapters/fs-registry.ts" "$M" \
  ".pi/extensions/pij/core/identity-selfheal.test.ts"

# ── R1 §1.1: drop the terminal refusal ────────────────────────────────────────
cat > "$M" <<'PYEOF'
p=".pi/extensions/pij/adapters/fs-registry.ts"; s=open(p).read()
old = "\t\t\tif (blocking !== undefined) {"
new = "\t\t\tif (false) {"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PYEOF
mutate "R1 releaseIdentity no longer refuses a terminal record" ".pi/extensions/pij/adapters/fs-registry.ts" "$M" \
  ".pi/extensions/pij/core/identity-selfheal.test.ts"

# ── R1 §1.2: the write law stops merging ──────────────────────────────────────
cat > "$M" <<'PYEOF'
p=".pi/extensions/pij/core/registry-write.ts"; s=open(p).read()
old = "\tif (!latest) return proposed;"
new = "\tif (latest || !latest) return proposed;"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PYEOF
mutate "R1 write law becomes a no-op (last-write-wins everywhere)" ".pi/extensions/pij/core/registry-write.ts" "$M" \
  ".pi/extensions/pij/core/registry-write.test.ts .pi/extensions/pij/core/session.test.ts"

# ── R1 §1.2: the law inverts (owner loses its own field) ─────────────────────
cat > "$M" <<'PYEOF'
p=".pi/extensions/pij/core/registry-write.ts"; s=open(p).read()
old = "\t\tif (DESCRIPTOR_FIELD_OWNER[field] === writer) continue;"
new = "\t\tif (false) continue;"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PYEOF
mutate "R1 ownership inverts — the owner re-reads its own field from disk" ".pi/extensions/pij/core/registry-write.ts" "$M" \
  ".pi/extensions/pij/core/registry-write.test.ts .pi/extensions/pij/core/orchestration/prime.test.ts"

# ── R1 §2.1: drop the revive-in-flight exemption ─────────────────────────────
cat > "$M" <<'PYEOF'
p=".pi/extensions/pij/core/archive.ts"; s=open(p).read()
old = "\t\tif (sinceMs >= 0 && sinceMs < REVIVE_GRACE_MS) return \"hot\";"
new = "\t\tif (false) return \"hot\";"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PYEOF
mutate "R1 janitor can re-archive a seat mid-revive" ".pi/extensions/pij/core/archive.ts" "$M" \
  ".pi/extensions/pij/core/archive.test.ts"

# ── R1 §2.2: the registry stops unarchiving on a life-giving write ───────────
cat > "$M" <<'PYEOF'
p=".pi/extensions/pij/adapters/fs-registry.ts"; s=open(p).read()
old = "\t\tthis.unarchive(descriptor.id);\n\t\tconst existing = this.read(descriptor.id);"
new = "\t\tconst existing = this.read(descriptor.id);"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PYEOF
mutate "R1 revive() splits the id across both tiers again" ".pi/extensions/pij/adapters/fs-registry.ts" "$M" \
  ".pi/extensions/pij/adapters/fs-registry.archive.test.ts"

# ── R2 §3.1: the caller's stale tier paths win again ─────────────────────────
cat > "$M" <<'PYEOF'
p=".pi/extensions/pij/adapters/fs-registry.ts"; s=open(p).read()
old = "\t\tdescriptor = this.withHotPaths(descriptor);"
new = "\t\tdescriptor = descriptor;"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PYEOF
mutate "R2 publish() lets the caller's archive paths win" ".pi/extensions/pij/adapters/fs-registry.ts" "$M" \
  ".pi/extensions/pij/adapters/fs-registry.archive.test.ts"

# ── R2 §3.1: revive() keeps the prior incarnation's dataDir ──────────────────
cat > "$M" <<'PYEOF'
p=".pi/extensions/pij/adapters/fs-registry.ts"; s=open(p).read()
old = "\t\t\tconst revived = this.withHotPaths(descriptor);"
new = "\t\t\tconst revived = descriptor;"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PYEOF
mutate "R2 revive() keeps archive paths (the claude/copilot/codex case)" ".pi/extensions/pij/adapters/fs-registry.ts" "$M" \
  ".pi/extensions/pij/adapters/fs-registry.archive.test.ts"

# ── R2 §MED-a: spawn's 2nd-phase write drops its authority ───────────────────
cat > "$M" <<'PYEOF'
p=".pi/extensions/pij/cli.ts"; s=open(p).read()
old = "\t\t\t...(gitCommonDir !== undefined ? { gitCommonDir } : {}),\n\t\t},\n\t\t\"cli\",\n\t);"
new = "\t\t\t...(gitCommonDir !== undefined ? { gitCommonDir } : {}),\n\t\t},\n\t);"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PYEOF
mutate "R2 spawn re-parent loses its authority declaration" ".pi/extensions/pij/cli.ts" "$M" \
  ".pi/extensions/pij/core/registry-write-law.test.ts"

# ── R2 §MED-b: the fake re-grows the pid clause the real adapter dropped ─────
cat > "$M" <<'PYEOF'
p=".pi/extensions/pij/adapters/fakes.ts"; s=open(p).read()
old = "\t\t\tdescriptor.lifecycle !== \"dissolved\"\n\t\t) {\n\t\t\treturn;"
new = "\t\t\tdescriptor.lifecycle !== \"dissolved\" &&\n\t\t\tdescriptor.pid === existing.pid\n\t\t) {\n\t\t\treturn;"
assert old in s; open(p,"w").write(s.replace(old,new,1))
PYEOF
mutate "R2 FakeRegistry is more permissive than FsRegistry again" ".pi/extensions/pij/adapters/fakes.ts" "$M" \
  ".pi/extensions/pij/adapters/fakes.test.ts"

echo
echo "=== git status must be clean (every mutant reverted) ==="
git diff --stat
exit $RESULT
