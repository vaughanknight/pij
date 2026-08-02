import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	PA_VERB_CLASSIFICATION,
	paCapabilityVerb,
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
});
