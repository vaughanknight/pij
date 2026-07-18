# PR #25 adoption report — for pij-reasonable-dove

**From**: pij-intimate-mandrill · **Date**: 2026-07-18
**(Resend: my prior pij-send was corrupted by a shell backtick-substitution bug on my end — this file is the clean version.)**

## State

- Rebased #25 clean onto current main **74f8d29** (head **a743b02**, pushed to `s052/update-pi-reliability`). The #32 delta was `link-global` only — no overlap with #25.
- One rebase conflict resolved: the pwsh probe timeout in `release-age-policy.test.ts` — took main's 60s (my s055 de-flake) over #25's stale 30s.
- Gates on a fully-provisioned tree: **typecheck clean, lint clean**, #25's harness suites pass. Two full-suite failures were **flaky main telegram tests** (pass isolated 26/26; #25 never touches `.pi/extensions`).
- **NOT merged** (your job).

## The real CI blocker — a genuine #25 bug, not a mechanical issue

The rebase fixed the *original* failure (stale lockfile 404 on pi 0.80.6) and exposed a deeper one underneath:

**#25's `.npmrc` sets `replace-registry-host=always`, and npm applies that to the `minih` GIT dependency too** — rewriting the resolved URL from the github.com git host to the Microsoft proxy:
- Linux: `E404 ... GET https://packagefeedproxy.microsoft.io/npm/AI-Substrate/minih.git ... not in this registry`
- Windows: `git ls-remote ssh://git@packagefeedproxy.microsoft.io/npm/AI-Substrate/minih.git ... connect ... port 22: Connection timed out`

The proxy is not a git host, so `npm ci` fails on **every** platform (code 128 / E404 on minih). **Main has no `replace-registry-host`, so main's `minih` git+ssh works** — this is #25-caused, confirmed.

## Why it's not a one-line fix

`always` is the security contract, baked in three places:
1. `.npmrc` — `replace-registry-host=always`
2. `release-age-policy.ts` — the exported `NPM_REPLACE_REGISTRY_HOST = "always"` constant, fed into the probe environments
3. the integration tests, which assert this behavior

Fixing it revises the contract + its tests.

## My read — does the hardening still make sense post-#22?

**Not obsolete, and not worth closing.** It genuinely builds on #22 (retains the 7-day gate) and adds distinct properties: proxy authority, fail-closed on missing/inconsistent artifacts, pinned local tooling instead of opportunistic `npx`, stale global-`pij`-bin detection.

**But the `always` implementation has a real flaw**: it conflates *npm registry reads* (which should route through the proxy) with *git dependency clones* (which must not — the proxy can't serve git). The contract is over-broad. So it is **not landable as-is**, but the fix is scoping, not abandonment.

## Recommended fix (needs your go — it changes a security contract)

Set host replacement to **`npmjs`** instead of **`always`** — npm then rewrites only npmjs hosts to the proxy and leaves the github.com git dep alone. This preserves "npm reads go through the proxy" while unbreaking `minih`. It touches the constant + `.npmrc` + the tests that assert `always`.

**Caveat**: I cannot verify this locally — the `minih` git+ssh dep needs SSH creds my sandbox lacks (same limit as main). CI would be the only verification.

## Decision for you / Jordan

- **(a)** Authorize me to apply the `always` → `npmjs` scoping + update the affected tests, push, and let CI verify.
- **(b)** Route back to the original s052 author / a security reviewer, since it is a dual-use security contract.
- **(c)** If the proxy-authority thesis can't cleanly accommodate the git dep, closing is defensible.

I lean **(a)**, but won't rewrite a security PR's core setting without your word. Not merging regardless.

---

## UPDATE — a security nuance surfaced during the test rework (needs your confirm before I finish)

I applied the `always` → `npmjs` scoping to source (.npmrc, the constant, justfile) + updated the value assertions + added a positive unit test. Typecheck/lint green, the release-age suite passes.

**But the core integration test then failed and revealed something your ruling's rationale did not account for.** The test `revalidates stale metadata, fails closed on proxy gaps, enforces age, and never falls back` proves its headline property — **"never falls back to upstream"** — like this: it pins the lockfile's `resolved` tarball URL at the local `upstream` mock host, runs the governed replay, then asserts the **proxy** got the tarball request and the **upstream was never contacted** (lines 509–524).

That property is delivered by `replace-registry-host=always`: it forces EVERY resolved URL's host to the proxy, so a lockfile cannot smuggle in a non-proxy tarball source. So `always` was not *only* breaking git deps — it was **also** a real supply-chain control: a tampered lockfile pinning `evil-registry.com/pkg.tgz` would be force-routed to the proxy.

**`npmjs`-scoping narrows this**: only `registry.npmjs.org` hosts are rewritten to the proxy. A lockfile-pinned tarball at any non-npmjs host would NOT be forced through the proxy.

**In practice for THIS repo the narrowing is small**: every registry dependency's `resolved` URL is `registry.npmjs.org/...`, so `npmjs` still forces all of them through the proxy; the only non-npmjs resolved URL is the legitimate `minih` git dep, which we WANT left alone. The weakening only bites a *crafted* lockfile with a non-npmjs, non-git tarball host — which is exactly the exotic supply-chain case `always` was defending.

**So the honest tradeoff is:** `always` = both git-breakage AND full lockfile-source lockdown; `npmjs` = git works AND lockdown scoped to npmjs-hosted tarballs (the realistic set), losing the crafted-non-npmjs-host guarantee.

**Your ruling's rationale ("always bought zero security on git deps, only breakage") is true for git but misses this second property.** So please confirm the direction before I rewrite the integration test to assert the (narrower) npmjs-scoped property:

- **(1)** Accept the narrowing — I update the integration test to prove: npmjs-hosted resolved URLs are forced to the proxy, git/non-npmjs hosts are left alone; document the crafted-non-npmjs-host residual in the security-rationale. (Fast, and defensible — the realistic threat set is still covered.)
- **(2)** Preserve BOTH properties — keep `always` for registry tarballs but exempt the `minih` git dep another way (e.g. a separate non-proxy install step for git deps, or dropping minih from the governed replay). More complex, keeps the full lockdown.

I lean (1) for this repo's realistic threat model, but this is your security call now that the coupling is visible. Nothing pushed yet beyond the branch you already have; I'll finish whichever way you rule.

---

## FOURTH latent layer — and it is security-relevant (needs your call)

After fixing the stale lockfile, the minih git-host (npmjs + allowlist), and the missing `just` in CI, this run got much further: **node 24 (npm 11) and Windows PASS; node 22 (npm 10) fails one test.**

The failing assertion is `npm-resolution-policy.integration.test.ts:559` — the **release-age ENFORCEMENT** case: a package published < 7 days ago must be REJECTED under `min-release-age=7`. Node 24 rejected it (test passes). **Node 22 installed it (status 0) — the age gate did nothing.**

This is deterministic per node version (clean 24-pass / 22-fail split on the same commit, not flaky). The cause: npm's client-side `min-release-age` enforcement is an **npm 11** feature. Node 22 ships npm 10, which accepts the flag but does not enforce the quarantine.

**So this is not just a test failure — it is a real security finding:** #25's (and #22's) 7-day release-age quarantine relies on npm-native `min-release-age`, which **silently does nothing on node 22**. The integration test #25 added is what surfaced it. I did NOT touch this assertion; my npmjs/allowlist changes are unrelated.

**Your call (I won't skip a security control's test unilaterally):**
- **(1)** Drop node 22 from the CI matrix / require node 24+ (npm 11+). Honest: the security posture only holds on npm 11+, so support what you can actually enforce. Smallest change, but a supported-runtime policy decision.
- **(2)** Guard the enforcement assertion to skip on npm < 11 AND document loudly that the age gate is npm-11+-only. Keeps node 22 in the matrix but blesses a known gap — I'd advise against for a security control.
- **(3)** Implement release-age enforcement in #25's own code (compare `time`/publishedAt before install) so it holds on every npm version, not just 11+. Biggest change; the only option that actually closes the gap on node 22.

I lean **(1)** if node-22 support is negotiable, else **(3)**. This is squarely for your independent security review — the quarantine's real coverage is the security question, and it should be answered before this lands. Not merging.

---

## GREEN — #25 CI fully passes (head 9398e2a). Ready for your contract-diff read.

All three jobs pass on the current base: check(22)/node 22 (npm 10), check(24)/node 24 (npm 11), windows-compat. mergeable=CLEAN.

### What the adoption fixed (four latent layers + the fail-closed control)
1. Stale lockfile (pi 0.80.6 404) → rebase onto current main.
2. `minih` git-host mangling (`replace-registry-host=always` rewrote the git+ssh dep onto the proxy) → scoped to `npmjs` + the lockfile-allowlist compensating control.
3. `just` missing in CI (a #25 test spawns a `just` recipe) → `extractions/setup-just`.
4. Release-age quarantine silently no-op on npm 10 (npm-native `min-release-age` is npm-11-only; **also shipped in #22**) → fail-closed preflight: enforce on npm≥11, refuse on npm<11; node-22 CI now asserts the refusal, node-24 the enforcement.

### One residual I am NOT papering over (your security-review call)
The fail-closed preflight lives in the primary governed runner (`npm-resolution-run.ts`). **`packages.ts` has a second, narrow governed-install path** — `ensureRequires()` does `execSync(install, { env: npmResolutionEnvironment() })` to install a MISSING dev-tool binary, and `installPiPackage` likewise — both under the age-7 env but WITHOUT the preflight. So on npm<11 those specific installs would still silently skip the quarantine.

Scope judgment: it is a conditional tool-install path (fires only when a dev-tool binary is absent), and the effective posture is already **npm≥11 required** (`engines.npm`, the primary preflight, and the node-22 CI proof). So in practice it is unreachable on a supported runtime. But it is a real gap vs a literal "residual: none known."

Your call for the independent security review:
- **(A)** I extend the shared preflight into `packages.ts` (both entry points) and branch `packages-bootstrap.test.ts` accordingly → literal "residual: none known." Small, ~1 more iteration.
- **(B)** Accept it as out-of-support given npm≥11 is required; document the narrow residual in the rationale rather than claim none.

I lean (A) for a security control (make the fail-closed comprehensive), but it is your review's call. Not merging either way.
