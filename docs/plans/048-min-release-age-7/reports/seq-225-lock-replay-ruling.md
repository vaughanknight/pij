# Seq 225 — approved locked-install-only compatibility exception

**Ruling**: Use an explicit age-zero override **only for replaying the existing committed root lockfile** (`npm ci`) to work around upstream npm/cli issue [#9005](https://github.com/npm/cli/issues/9005).

## Required policy boundary

- Keep committed `.npmrc` at native `min-release-age=7` and `audit=true` for every fresh dependency resolution.
- Do **not** add a generic bypass or an age-zero `npm install` path.
- Apply the override only to the root lock replay, including `just install` and the permitted CI surfaces (Node 22/24 and Windows).
- The implementation must use a form that clears the inherited value before nested git-dependency preparation, not a form that combines it with npm’s internally generated `--before`.

## Expanded product fence

`.github/workflows/ci.yml` is writable only to apply the explicit age-zero lock-replay override to its Node 22/24 and Windows `npm ci` paths.

## Required proof

1. Root `npm ci` succeeds with the scoped override and nested git preparation receives no conflicting age configuration.
2. Manifests, lockfiles, git dependency commit `a9bc26e8`, and the minih tag’s committed lockfile `c578ef0a` remain unchanged.
3. Fresh resolution is refused under the committed seven-day policy.
4. Pi/package/global/update resolution paths still receive `7`.
5. Audit JSON remains observed.
6. Probe verifies policy through committed `.npmrc`, computed `before` approximately seven days earlier, and refusal behavior — **not** raw `min-release-age`, because npm normalizes it to `null` after deriving `before`.
