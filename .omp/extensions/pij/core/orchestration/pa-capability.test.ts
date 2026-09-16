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

// These source-to-table checks defend the still-live core and chore dispatchers.
// A whoami payload derived from PA_VERB_CLASSIFICATION cannot detect a deleted
// classification: both sides would shrink together. Keep these independent
// parser inventories and their nonempty guards.
//
// The executable now routes exclusively through the rs inventory. Its removed
// raw-argv legacy branches are no longer a PA gate or a source of legacy verbs;
// executable inventory/help coverage lives in usage-flags.test.ts and
// generation-skill-coverage.test.ts instead.

/** Every verb the CORE parser can produce, scraped from the Command union. */
function coreVerbs(): readonly string[] {
	const src = readFileSync(join(EXT_ROOT, "core", "cli.ts"), "utf8");
	return [...src.matchAll(/readonly verb: "([a-z-]+)"/g)].map((m) => m[1] as string);
}

/** Every `chore` subverb the core dispatcher can handle, read from its switch.
 * A new mutating subverb must not inherit the top-level `chore: ALLOW` entry. */
function choreSubverbs(): readonly string[] {
	const src = readFileSync(join(EXT_ROOT, "core", "chores", "cli-verbs.ts"), "utf8");
	const dispatchFn = src.slice(src.indexOf("export function dispatchChore"));
	const body = dispatchFn.slice(0, dispatchFn.indexOf("\n}"));
	return [...body.matchAll(/case "([a-z-]+)":/g)].map((m) => m[1] as string);
}

describe("PA capability classification is TOTAL across the live core dispatchers", () => {
	// Adding a core verb or chore subverb without classifying it must fail even
	// when every consumer-generated capability payload agrees with the table.

	it("classifies every verb the CORE parser can produce", () => {
		const unclassified = coreVerbs().filter((v) => PA_VERB_CLASSIFICATION[v] === undefined);
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

	it("scrapes the real core parser — guards a vacuous pass", () => {
		// The chore scrape has its own nonempty guard in the subverb test above.
		expect(coreVerbs().length).toBeGreaterThan(20);
		expect(coreVerbs()).toContain("task-set");
	});
});

describe("paRefusal — only a PA is refused, and only for HARMFUL verbs", () => {
	// ── plan 094 task 1.2 ────────────────────────────────────────────────────
	// ONE INDEPENDENT TEST PER VERB, replacing two `for` loops. A loop's FIRST
	// failure aborts the block, so every later verb in it is unreported — which
	// means "the neighbours stayed green" is not demonstrable under mutation,
	// and the mutation table (rows 6–11) names a green neighbour for every red.
	// A preserved refusal earns its keep only under its own mutation, so it has
	// to be able to fail alone.
	it.each([
		"spawn",
		"adopt",
		"close",
		"revive",
		"orchestration",
		"link",
	])("refuses the lineage/seat-control verb '%s'", (verb) => {
		expect(paRefusal("pa", verb)).not.toBeNull();
	});

	it.each([
		"task-set",
		"task-close",
		"state-verify",
		"attest",
		"canary",
	])("refuses the obligation/testimony/grant verb '%s'", (verb) => {
		// `attest` and `state-verify` are the load-bearing pair under the harm
		// test: verification is a CONCLUSION, and the widening explicitly did
		// not move the line between recording and concluding.
		expect(paRefusal("pa", verb)).not.toBeNull();
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

	// ── plan 094 task 1.1 (AC-01, AC-02) ─────────────────────────────────────
	// THE HARM TEST, NOT THE AUTHORITY TEST. The old gate refused a verb because
	// it bore authority; the ruling replaced that with harm on two axes —
	// recording vs deciding, and reversible vs terminal. `spine-append` records
	// (attributed, append-only) and the three `chore` mutators are reversible
	// and leave a durable `removals` record, so under the new test all four are
	// permitted. One independent `it` each, so mutations 1 and 2 have a green
	// neighbour that can actually be observed.
	it.each([
		"spine-append",
		"chore add",
		"chore update",
		"chore remove",
	])("PERMITS the widened verb '%s' — it records, and is reversible", (verb) => {
		expect(paRefusal("pa", verb)).toBeNull();
	});

	it("still routes each chore mutator to its OWN table key, not the family key", () => {
		// The widening must land on the per-subverb rows. If the mapping ever
		// collapsed back to the `chore` family token the four tests above would go
		// green off `chore: ALLOW` while the rows they name said anything at all.
		for (const sub of ["add", "update", "remove"]) {
			expect(paCapabilityVerb("chore", sub)).toBe(`chore ${sub}`);
		}
	});

	it("permits chore run/list/ack — the pre-existing maintenance surface", () => {
		expect(paRefusal("pa", paCapabilityVerb("chore", "run"))).toBeNull();
		expect(paRefusal("pa", paCapabilityVerb("chore", "list"))).toBeNull();
		expect(paRefusal("pa", paCapabilityVerb("chore", "ack"))).toBeNull();
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
		//
		// plan 094 task 1.11 (AC-08): the condition is now split by ACTION, and
		// the text must say so. A PA reading only "watch or unwatch, self or
		// parent" would never try `list` (permitted, any target) and would
		// wrongly believe `unwatch <stranger>` is refused. Each action named here
		// is one a PA will otherwise learn about by being refused.
		const watchdogWhy = paConditionalWhy("watchdog");
		expect(watchdogWhy).not.toBeNull();
		expect(watchdogWhy).toContain("list");
		expect(watchdogWhy).toContain("watch");
		expect(watchdogWhy).toContain("unwatch");
		expect(watchdogWhy).toContain("parent");
		// The one thing a reader must not conclude from "unwatch any target" —
		// that a PA may remove somebody else's subscription.
		expect(watchdogWhy).toContain("own");

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
