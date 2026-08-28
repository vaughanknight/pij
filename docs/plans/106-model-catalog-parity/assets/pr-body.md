# Title

fix(models): separate Copilot IDs from OMP selectors

# Body

## Summary

- Model catalog JSON now separates the target `runtime` from the upstream `provider`, retains the exact runtime `selector`, and exposes the upstream `requestModelId` behind OMP aliases.
- Copilot CLI inventory includes the actual `gpt-5.6-sol-fast` ID at 1,050,000 tokens with `none`, `low`, `medium`, `high`, `xhigh`, and `max`; it never advertises OMP-only `-1m` aliases as Copilot IDs.
- OMP inventory comes from the supported, no-refresh `omp models --json --no-extensions` surface under a five-second process bound. `thinking: null` is a valid explicit no-levels value; arrays retain validated effort strings. The whole inventory still fails on invalid arrays, non-string levels, missing/empty selectors, or any other malformed row.
- Bare catalog discovery fails rather than returning a partial catalog when OMP is unavailable. Runtime filters and provider filters use one centralized selector, preserving `openrouter`, `sakana`, and `github-copilot` compatibility.
- Spawn and effort validation select the actual target catalog: Copilot for `--harness copilot`, OMP for `--harness pi --bin omp`, and Pi for ordinary Pi. Unavailable OMP validation warns and continues; model and effort validation remains warn-don't-block.
- Removed only the committed GPT-5.6 Luna/Sol/Terra OMP overrides that collapsed base rows onto 1.05M. The canonical checkout's unrelated local OMP provider is not included.

Closes #306.

## Tests

- RED: 17 focused failures before implementation.
- GREEN: 82 assertions across registry parsing, CLI filtering/JSON, runtime-specific spawn validation, and portable model sync.
- OMP subprocess spawn integration: 2/2 targeted cases passed.
- Review-fix pure suites: 83/83 passed; filtered registry/CLI/spawn/integration proof: 49 passed, 132 unrelated cases skipped.
- Dim-0 mutation (`every` → `some` on the whole-inventory guard) made the mixed-valid/invalid fixture fail; exact restoration passed.
- Live-shape OMP effort, bounded runner timeout, bare-unavailable, mixed-malformed, and provider-filter regressions passed.
- F007 RED: the exact live `thinking: null` row invalidated a mixed catalog. GREEN: null maps to no levels, coexists with reasoning rows, and malformed arrays/non-string elements still fail the entire inventory.
- F007 focused suites: 184 passed, one unrelated skip; post-format registry rerun: 49/49 passed.
- `just typecheck` passed.
- `just lint` passed with nine pre-existing warnings.
- `git diff --check` passed.
- `harness boot` passed both stages: typecheck and the full `just test` suite.
- Final `harness checks` passed all eight sensors: local paths, typecheck, lint, tests, Windows compatibility, smoke, package audit, and snapshots.

## Live selector proof

- Copilot projection: `gpt-5.6-sol-fast` → selector `gpt-5.6-sol-fast`, provider `github-copilot`, runtime `copilot`, context 1,050,000, six effort levels; zero `-1m` rows.
- OMP projection: `github-copilot/gpt-5.6-{luna,sol,sol-fast,terra}` → base contexts 328,000/400,000/400,000/400,000.
- OMP projection: matching `-1m` selectors → 1,050,000 each, with `requestModelId` mapped to the base Copilot API ID.
- Live `pij models --harness omp --json` succeeds against the complete branch-local OMP inventory, including non-reasoning `thinking: null` rows.
- Effort-proof gap remains disclosed: current OMP runtime evidence proves selected model and context, but exposes no active-effort field proving the requested effort was honored.
