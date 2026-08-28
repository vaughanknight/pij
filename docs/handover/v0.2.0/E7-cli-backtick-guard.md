# E7 — CLI guard against unescaped backticks / command substitution in `pij send` bodies

**Item id / stream at handover:** E7 · s392-day3-codex-doctrine
**Status at v0.2.0 (tag `d120c53`):** NOT started; partly a DESIGN question (see § 7). Today the CLI DOCUMENTS the hazard but cannot prevent it.
**Size estimate:** S, ~2–4 h · **Order / dependencies:** none.

## 1. Why this exists (the observed failure, with evidence)
A double-quoted `pij send <id> "..."` body containing backticks or command substitution is expanded BY THE SHELL before pij runs — the message delivers mangled AND the substituted command has already executed. This bit the o-prime's own shell: the local orient and `docs/plans/392-day3-codex-doctrine/reports/oprime-rulings-log.md` record "a double-quoted body with backticks executed two commands"; the standing mitigation is "every `pij send` body goes by `--body-file` from a quoted heredoc". The v0.2.0 handover README restates it under § rules.

## 2. What is ruled (design / spec)
- Add a CLI guard so a `pij send` positional-text body that still CONTAINS backticks or command-substitution markers (i.e. they survived to argv as literals) is REFUSED with a pointer to `--body-file` — making the safe path the only path for risky bodies.
- The guard must NOT block `--body-file` or stdin (`-`) — those are byte-exact and safe by construction.

## 3. Where the code is (at tag `d120c53`)
- `.pi/extensions/pij/cli.ts:365-371` — the `pij send` help already warns: unsafe for text you did not author; backticks and command substitution expand in YOUR shell before pij runs; the message delivers mangled and the command has already executed; pij cannot prevent this; use `--body-file` instead.
- `.pi/extensions/pij/cli.ts:4971-4979` — the send-body handling and its internal body-file placeholder (a NUL-delimited sentinel) that already special-cases `--body-file`. The positional-body branch of the `send` verb is where a guard inspects the received arg.

## 4. Acceptance (behavioural, mechanical)
- Test: a positional body that reached argv still containing a literal backtick (e.g. single-quoted or escaped upstream) is REFUSED with an actionable message naming `--body-file`; the same content via `--body-file` is accepted byte-exact; a plain body with no backticks/substitution markers is accepted.
- Mutant `MUT-BACKTICK-GUARD-OFF`: remove the refusal so the "literal backtick refused" test REDs. Name the covering test (E40).
- Gates: full suite at merge product (fresh worktree), `just typecheck`, `just pij-skill-check` (skill text references the safe form), two green runs, logs kept.

## 5. Live verification (after build — CLI only, no daemon restart)
Invoke `pij send` with a positional body carrying a literal backtick (quote it so the shell leaves it intact): expect a refusal naming `--body-file`. Then send the same content via `--body-file` from a quoted heredoc: it delivers byte-exact. Failure looks like: a literal-backtick positional body delivered with no refusal.

## 6. Risks / gotchas that already bit us
- The guard canNOT catch backticks the shell ALREADY expanded (they are gone before argv reaches pij) — it only catches ones that survived as literals. State this in the help so it is not read as full protection.
- `pij send` body rule (README): quoted heredoc plus `--body-file`. The guard reinforces, never replaces, that discipline.

## 7. Open questions for the human
- Since the shell expands BEFORE pij sees argv, a CLI guard can only catch backticks / substitution that survived as LITERALS. Is that the intended scope (catch survivors + hard-warn), or should E7 also add a skill/packet lint (a `pij-skill-check`-style check) that flags any authored `pij send "..."` with backticks at authoring time? Recommend BOTH — the CLI refusal for survivors, plus an authoring-time lint where the real prevention lives.
