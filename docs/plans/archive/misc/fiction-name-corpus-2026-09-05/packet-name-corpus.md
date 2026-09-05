# Task: add fiction character names to the pij seat-name corpus

From: pij-minor-unicorn (prime). Reply with `pij-rs send --to pij-minor-unicorn --body-file <path>` (bodies to disk, never shell-interpolated). Load skills `/pij` and `/builder` before starting; act from contracts.

## Worktree
`/Users/jordanknight/pi-hacking/pij-fiction-name-corpus` (branch `fiction-name-corpus`, off main 7c97c726). `cd` there first. Do NOT touch `/Users/jordanknight/pi-hacking/pij` (main) or its node_modules. No daemon restarts. No global links.

## What
Seat ids are `pij-<adjective>-<noun>`. The noun slot is real animals plus single-token character names from Banks / Asher / Hamilton. Append the names below to NAME_NOUNS in BOTH corpora, keeping the two files byte-for-byte parallel in order (the Rust file is a vendored copy of the TS file; order is part of the mapping contract):

- `.pi/extensions/pij/core/name-corpus.ts` — `NAME_NOUNS` (append after `"sinon"`, before `];`), and extend the header comment that lists the universes.
- `crates/core/src/name_corpus.rs` — `NAME_NOUNS` (same position, same order).

Append in exactly this order, one block per universe with a `// <universe>` comment line above each block in both files:

// Elden Ring
melina ranni blaidd malenia radahn godrick rennala rykard morgott godfrey marika radagon miquella sellen roderika hewg boc torrent maliketh placidusax nepheli millicent latenna rogier fia seluvis tanith diallos gideon iji yura jerren ensha

// Horizon Zero Dawn
aloy rost sylens varl erend avad teersa olin helis elisabet sobeck gaia hephaestus minerva eleuthia faro kotallo alva tilda morlund lansra ourea dervahl marad talanah ersa petra hekarro regalla aratak ikrie apollo artemis demeter poseidon

// The Witcher (show)
geralt ciri yennefer jaskier triss vesemir tissaia cahir fringilla yarpen dara eskel lambert coen istredd stregobor vilgefortz francesca filavandrel foltest calanthe eist mousesack pavetta emhyr rience roach dijkstra philippa radovid milva regis zoltan renfri nivellen nenneke sabrina keira

// Dungeon Crawler Carl
carl donut mordecai katia elle imani bautista hekla prepotente zev odette mongo tsarina brandon agatha britney florin louis ifechi eva lucia signet vrah ferdinand tran miriam

That is 132 names (33 + 35 + 38 + 26). None collide with the existing corpus (checked). All are lowercase ASCII single tokens, which the Rust hygiene test requires.

## Pinned tests to update (data pins, not behaviour)
- `crates/core/tests/memorable_ids.rs` `curated_corpus_is_pinned_and_clean`: NAME_NOUNS 420 → 552, MEMORABLE_PIJ_ID_SPACE 493_960 → 1_176×552+40 = 649_152. The vector table below it (`full-space-seed` at 493_920 / 493_959, `stable-seed`, and every other seed→id row) WILL change because pair_start is `hash % PAIR_SPACE`. Regenerate the expected ids from the TS implementation (the comment above the table shows the node one-liner) and paste them; do not hand-edit. The tail-boundary rows must move to the new last index (649_151) and the new second-to-last pair-space boundary.
- TS: find the pinning test for `memorable-id.ts` (grep MEMORABLE_PIJ_ID_SPACE / memorablePijIdCandidate in `.pi/extensions/pij/**/*.test.ts`) and update its pins the same way. Existing seats keep their stored ids; only future mints change.
- `docs/plans/108-rust-port/assets/reports/done-u-names.md` mentions 493,960 — leave it (historical report).

## Gates (run in the worktree)
```
~/.cargo/bin/cargo test -p pij-core
npx vitest run .pi/extensions/pij/core/memorable-id   # or whatever the pin test file is
just check   # if it runs in a worktree without npm install; if node_modules is missing, say so, do NOT npm install
```
Then: prove the RS and TS mappings still agree on a fresh seed (one seed, attempt 0 and 1, both implementations print the same id) and paste both outputs in your report.

## Deliver
One commit on `fiction-name-corpus` with a message ending in the Co-Authored-By trailer of your harness. Report: commit sha, the two gate outputs (tail only), the RS/TS agreement proof, and anything you could not run. Do not push, do not open a PR, do not merge.
