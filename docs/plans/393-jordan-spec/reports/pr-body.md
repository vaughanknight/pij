## What
`docs/specs/claude-copilot-sqlite-sockets-comms.md` — a standalone, self-contained handoff specification of the Claude + Copilot messaging path over the SQLite WAL queue and per-harness sockets (Claude inbox socket, Copilot `--ui-server` JSON-RPC, pointer path for socketless seats, generic at-least-once consumer for the pi receiver and Telegram bridge), written for an engineer with zero context on this repo.

Contents: architecture · store/schema (verbatim) · delivery state machine · backend selection · daemon routing · per-harness transports with exact wire frames · CLI surfaces · benchmarks · P1/P2 doctrine · 25 gotchas actually hit (each: symptom → cause → state) · 21 outstanding items · test map · operating notes · glossary · source index.

## Evidence
- Every `file:line` cites `main@ed20a68`; 110 anchors verified mechanically (`sed -n` + token match) before commit; loop.ts/cli.ts/pij.md ranges corrected after the first pass.
- Meta-leak scan (governance/orchestration vocabulary) clean.
- Cold review: `docs/plans/393-jordan-spec/reviews/spec-review.md` (copilot gpt-5.6-sol xhigh; packet `reviews/spec-review-packet.md`).
- Docs-only: no code, no skill text, no test changes.

## Follow-up
GitHub issue on `AI-Substrate/pij` carrying the spec verbatim — filed separately after merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
