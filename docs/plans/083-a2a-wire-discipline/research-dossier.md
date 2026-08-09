# Research dossier — a2a-wire-discipline (pij-rural-shrimp, 2026-08-03)

Brief (Jordan): pij agents are too verbose with each other; humans only need the gist. Fix must be **prompting/convention only — no deterministic tooling**.

## Evidence

**Fleet measurement** (retained inboxes, all seats): 9,488 text messages, avg 1,208 chars ≈ **2.9M tokens** of A2A bodies. Known-terse control (pij-statutory-seahorse, PA) averages 661 chars — ⅓ of prime average — with no loss of function: terse already works here.

**Seat survey** (6/6 replied: massive-meadowlark, wee-albatross, statutory-seahorse, related-koala, joyous-silkworm, able-jellyfish). Unanimous #1 waste: **restating the recipient's own message back to them**. Full waste ranking: restatement · re-explaining acked rules · praise/rapport (largest byte category, smallest behaviour category — jellyfish, measured) · unchanged-baseline itemizations · hedge padding. Two structural findings:
- Zero-value messages are mostly **acks and repeats** — short but numerous (albatross, counted 97 msgs/8h: PA acks 0/11 changed action). Style rules alone miss them; the convention needs *don't-send* rules.
- **Count-vs-volume gap** (jellyfish, measured): ~30% of messages by count changed action, ~15% by volume — the load-bearing messages are already the short ones (rulings, unblocks, corrections with a number).

**Literature** (deep-research digest; full report in session scratchpad): message-pruning work (AgentPrune, ICLR 2025) finds **28–73% of A2A tokens prunable** with neutral-to-*positive* quality effect (redundant traffic amplifies noise). Human→LLM linguistic-adaptation research (arXiv 2510.02645): telegraphic messages stay fully interpretable when **identifiers, values, and scope markers are preserved** — grammar, function words, politeness are free to cut. Terseness *hurts* in: exploration/planning, disagreement, correcting false beliefs, low-confidence-high-impact, security/architecture changes — there compression causes re-alignment rework that can cost more than it saves. No paper gives a comprehension-loss-vs-compression curve; failure modes are qualitative: dropped referents ("change timeout to 5s" — which service?), lost grounding, dropped caveats.

## Draft convention (prompt text, ready to paste into spawn packets / role prompts)

> **pij wire discipline** — messages to other agents, not humans:
> 1. **Line 1 = the recipient's next action or decision, or `NO ACTION`.** Reader may stop there.
> 2. **Delta only.** What changed + the one discriminating value (count / SHA / path). Cite rulings and prior messages by id — never restate them, never restate the recipient's own words, never itemize unchanged state (one denominator line max).
> 3. **Don't send:** praise as its own message (attach to an instruction or drop it); unsolicited confirmations. Silence after a clean verify = clean. A requested check IS a result — send it as one line: `checked X, clear`.
> 4. **Acks are one line** and never restate the instruction.
> 5. **Exception — reasoning is the payload** when you are correcting a false belief, disagreeing, or acting on low confidence with high impact. Say so (`confidence: low`) so the receiver knows to pull more. Rare; do not use as cover.
> 6. **Telegraphic style is fine; ambiguity is not.** Keep every identifier, number, path, and scope marker explicit. Before sending, check: could the receiver act on line 1 alone? Did I restate anything they already know? Aim under ~120 tokens.

Anti-drift (from the literature): put the discipline in the system/spawn prompt, not mid-conversation; have seats restate it in their own words at boot; explicitly instruct "do not mirror a verbose peer's style."

## Expected effect

Survey + pruning literature both point at **~50%+ reduction** from the don't-send rules alone (unsolicited confirmations, praise, restatement), before any wording change. Style rules add more. Quality risk is concentrated in rule 5's territory — the exception must stay legal or corrections stop landing.
