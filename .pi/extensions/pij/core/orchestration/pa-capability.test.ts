import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	PA_ROLE_FIELD,
	PA_VERB_CLASSIFICATION,
	paCapabilityVerb,
	paConditionalWhy,
	paRefusal,
	paRefusalMessage,
} from "./pa-capability.js";

const EXT_ROOT = join(import.meta.dirname, "..", "..");

/** Every verb the CORE parser can produce, scraped from the Command union. */
function coreVerbs(): readonly string[] {
	const src = readFileSync(join(EXT_ROOT, "core", "cli.ts"), "utf8");
	return [...src.matchAll(/readonly verb: "([a-z-]+)"/g)].map((m) => m[1] as string);
}

/** Every verb the BIN handles by raw-argv early branch, BEFORE core parse.
 *  These are the ones a dispatch()-only gate would silently permit. */
function binEarlyVerbs(): readonly string[] {
	const src = readFileSync(join(EXT_ROOT, "cli.ts"), "utf8");
	const patterns = [
		/process\.argv\[2\] === "([a-z-]+)"/g,
		/top === "([a-z-]+)"/g,
		/parsed\.cmd\.subverb === "([a-z-]+)"/g,
	];
	const out = new Set<string>();
	for (const re of patterns) for (const m of src.matchAll(re)) out.add(m[1] as string);
	return [...out];
}

/** Every `chore` SUBVERB the bin can dispatch, scraped from its real switch.
 *
 * The top-level scrape sees only the `chore` token, so without this a new
 * MUTATING subverb would inherit `chore: ALLOW` and the build would stay green
 * — AC-12's "a new verb fails the build" property silently not holding for a
 * bin-owned mutation family. Scraped, never hand-listed, for the same reason
 * the other two are. */
function choreSubverbs(): readonly string[] {
	const src = readFileSync(join(EXT_ROOT, "core", "chores", "cli-verbs.ts"), "utf8");
	const dispatchFn = src.slice(src.indexOf("export function dispatchChore"));
	const body = dispatchFn.slice(0, dispatchFn.indexOf("\n}"));
	return [...body.matchAll(/case "([a-z-]+)":/g)].map((m) => m[1] as string);
}

describe("PA capability classification is TOTAL across BOTH seams", () => {
	// The o-prime made this mandatory rather than mitigation, and the reason is
	// the point: everything else shipped this week depends on a careful seat.
	// This test does not. Adding a verb without classifying it fails the suite,
	// which converts drift from silent to loud — the only property that survives
	// its author not being here.
	//
	// There is NO single chokepoint: core dispatch() covers parsed verbs, while
	// spawn/adopt/close/orchestration branch on raw argv in the bin and return
	// before core parse. A gate at dispatch() alone would refuse `task set` and
	// silently permit `close`. A verb list you can tick is the most believable
	// kind of incomplete gate — so the table is checked against BOTH sources.

	it("classifies every verb the CORE parser can produce", () => {
		const unclassified = coreVerbs().filter((v) => PA_VERB_CLASSIFICATION[v] === undefined);
		expect(unclassified).toEqual([]);
	});

	it("classifies every verb the BIN handles before core parse", () => {
		// Scraped, not hand-listed: a hand-listed set would drift from the file it
		// claims to mirror, which is the defect this test exists to catch.
		const known = new Set(Object.keys(PA_VERB_CLASSIFICATION));
		// Only argv tokens that are real verbs — the scrape also catches flags and
		// non-verb literals, which are not our business.
		const candidates = binEarlyVerbs().filter((v) => v.length > 2 && !v.startsWith("--"));
		const unclassified = candidates.filter(
			(v) => !known.has(v) && !["help", "version", "usage"].includes(v),
		);
		expect(unclassified).toEqual([]);
	});

	it("classifies every CHORE SUBVERB, not just the `chore` token (review-2 finding 1)", () => {
		// Without this, AC-12's claim is overstated: `chore` alone is ALLOW, so a
		// new mutating subverb would inherit permission and the build would stay
		// green. The scrape is over the real `dispatchChore` switch, so adding a
		// subverb there and nowhere else fails HERE.
		const subverbs = choreSubverbs();
		// Guard the scrape itself — a regex that silently matches nothing would
		// make this test permanently vacuous, which is the failure mode it exists
		// to prevent.
		expect(subverbs.length).toBeGreaterThanOrEqual(6);
		const unclassified = subverbs.filter(
			(sub) => PA_VERB_CLASSIFICATION[paCapabilityVerb("chore", sub)] === undefined,
		);
		expect(unclassified).toEqual([]);
	});

	it("routes each chore subverb to its OWN key, and leaves flags on the family key", () => {
		for (const sub of choreSubverbs()) expect(paCapabilityVerb("chore", sub)).toBe(`chore ${sub}`);
		// `pij chore --json` is the family verb, not a subverb named "--json".
		expect(paCapabilityVerb("chore", "--json")).toBe("chore");
		expect(paCapabilityVerb("chore", undefined)).toBe("chore");
		// Non-chore families are untouched by the mapping.
		expect(paCapabilityVerb("watchdog", "watch")).toBe("watchdog");
	});

	it("actually scrapes something from each source — guards a vacuous pass", () => {
		// If either scrape silently returned [] (a regex that stopped matching after
		// a refactor), both assertions above would pass while checking nothing.
		expect(coreVerbs().length).toBeGreaterThan(20);
		expect(binEarlyVerbs().length).toBeGreaterThan(3);
		expect(coreVerbs()).toContain("task-set");
		expect(binEarlyVerbs()).toContain("close");
	});
});

describe("paRefusal — only a PA is refused, and only for authority verbs", () => {
	it("refuses the lineage and seat-control verbs the bin owns", () => {
		for (const verb of ["spawn", "adopt", "close", "revive", "orchestration", "link"]) {
			expect(paRefusal("pa", verb)).not.toBeNull();
		}
	});

	it("refuses obligation, testimony and grant verbs", () => {
		for (const verb of ["task-set", "task-close", "state-verify", "attest", "canary"]) {
			expect(paRefusal("pa", verb)).not.toBeNull();
		}
	});

	it("PERMITS the reads and the PA's own first-person card — must not regress", () => {
		for (const verb of [
			"whoami",
			"list",
			"tree",
			"anomalies",
			"spine-events",
			"node-show",
			"send",
			"report-now",
			"state-set",
		]) {
			expect(paRefusal("pa", verb)).toBeNull();
		}
	});

	it("permits chore run/list/ack but refuses roster add/update/remove", () => {
		expect(paRefusal("pa", paCapabilityVerb("chore", "run"))).toBeNull();
		expect(paRefusal("pa", paCapabilityVerb("chore", "list"))).toBeNull();
		expect(paRefusal("pa", paCapabilityVerb("chore", "ack"))).toBeNull();
		expect(paRefusal("pa", paCapabilityVerb("chore", "add"))).not.toBeNull();
		expect(paRefusal("pa", paCapabilityVerb("chore", "update"))).not.toBeNull();
		expect(paRefusal("pa", paCapabilityVerb("chore", "remove"))).not.toBeNull();
	});

	it("never refuses any other role — no existing seat can regress", () => {
		for (const role of ["prime", "pm", "worker", null]) {
			for (const verb of Object.keys(PA_VERB_CLASSIFICATION)) {
				expect(paRefusal(role, verb)).toBeNull();
			}
		}
	});

	it("permits an UNKNOWN verb rather than refusing it", () => {
		// Deliberate: this is a capability boundary for a cooperative internal
		// seat, not a perimeter against an adversary. Refusing unknowns would
		// break every future verb until someone remembered this file; the
		// exhaustive test keeps the table total at BUILD time instead.
		expect(paRefusal("pa", "some-future-verb")).toBeNull();
	});

	it("names the verb, the reason, and how to read your own capability", () => {
		const why = paRefusal("pa", "close");
		expect(why).not.toBeNull();
		const message = paRefusalMessage("close", why as string);
		expect(message).toContain("'close'");
		expect(message).toContain("role 'pa'");
		expect(message).toContain("pij whoami --json");
	});

	// ── plan 084 Phase 1 (AC-03) ─────────────────────────────────────────────
	// A refusal that does not name its own keying field is unfalsifiable to the
	// seat that hits it: it learns THAT it was refused and nothing about WHERE
	// the decision came from, so it cannot check the field, cannot tell a
	// mis-stamp from a correct refusal, and has no repair path but a human.
	it("names the FIELD the refusal is keyed on, not just the role", () => {
		// The sampled verb is DERIVED from the table rather than hardcoded: a
		// hardcoded name turns any future reclassification of that one verb into
		// a confusing second failure alongside the real one, which is noise
		// exactly when someone is reading a red suite carefully.
		const refusedVerb = Object.keys(PA_VERB_CLASSIFICATION).find(
			(verb) => paRefusal("pa", verb) !== null,
		);
		expect(refusedVerb, "the table must classify at least one verb as refused").toBeDefined();
		const why = paRefusal("pa", refusedVerb as string);
		expect(why).not.toBeNull();
		const message = paRefusalMessage(refusedVerb as string, why as string);
		expect(message).toContain("role 'pa'");
		expect(message).toContain(PA_ROLE_FIELD);
		expect(message).toContain("field");
	});

	it("the named field is the REAL descriptor field, so a rename cannot drift", () => {
		// `satisfies keyof SessionDescriptor` makes the compiler the enforcer;
		// this asserts the value a reader is told to go and look at.
		expect(PA_ROLE_FIELD).toBe("orchestrationRole");
	});

	it("every refusal in the table carries role + field — not just the sampled one", () => {
		// The totality property applied to the MESSAGE: a message builder proven
		// on one verb is not proven on the family.
		for (const [verb, capability] of Object.entries(PA_VERB_CLASSIFICATION)) {
			if (capability.kind !== "refuse") continue;
			const message = paRefusalMessage(verb, capability.why);
			expect(message).toContain(`'${verb}'`);
			expect(message).toContain("role 'pa'");
			expect(message).toContain(PA_ROLE_FIELD);
		}
	});

	// ── plan 084 Phase 2 (AC-04/AC-12): the conditional arm ──────────────────

	it("a CONDITIONAL verb is not refused at the table — the handler decides", () => {
		// The table cannot see the target. Refusing here would refuse the
		// permitted case too, which is exactly #95. `paRefusal` must therefore
		// return null and the enforcement must live where the target is known.
		expect(paRefusal("pa", "watchdog")).toBeNull();
		expect(paRefusal("pa", "ack-dispatch")).toBeNull();
	});

	it("a conditional verb still STATES its condition, so a PA can read the rule", () => {
		// Passing the gate is not the same as being permitted, and a seat that
		// cannot tell the difference discovers the boundary by attempting — the
		// failure mode this whole stream exists to remove.
		const watchdogWhy = paConditionalWhy("watchdog");
		expect(watchdogWhy).not.toBeNull();
		expect(watchdogWhy).toContain("watch");
		expect(watchdogWhy).toContain("unwatch");
		expect(watchdogWhy).toContain("parent");

		const ackWhy = paConditionalWhy("ack-dispatch");
		expect(ackWhy).not.toBeNull();
		expect(ackWhy).toContain("ITSELF");
	});

	it("paConditionalWhy is null for allowed, refused, and unknown verbs alike", () => {
		expect(paConditionalWhy("list")).toBeNull();
		expect(paConditionalWhy("daemon")).toBeNull();
		expect(paConditionalWhy("some-future-verb")).toBeNull();
	});

	it("the three kinds are mutually exclusive across the WHOLE table", () => {
		// Guards the classification itself: a verb that is both conditional and
		// refused would give two seams two different answers.
		for (const [verb, capability] of Object.entries(PA_VERB_CLASSIFICATION)) {
			const refusedAtTable = paRefusal("pa", verb) !== null;
			const isConditional = paConditionalWhy(verb) !== null;
			expect(refusedAtTable && isConditional, `${verb} is both refused and conditional`).toBe(
				false,
			);
			expect(["allow", "conditional", "refuse"]).toContain(capability.kind);
		}
	});

	it("no OTHER role is affected by a conditional verb either", () => {
		for (const role of ["prime", "pm", "worker", null]) {
			expect(paRefusal(role, "watchdog")).toBeNull();
			expect(paRefusal(role, "ack-dispatch")).toBeNull();
		}
	});
});
