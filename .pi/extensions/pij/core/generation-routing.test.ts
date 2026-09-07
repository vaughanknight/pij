import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COPILOT_CONTROL_REFUSAL } from "./commands.js";
import {
	classifyRsResponse,
	copilotControlRefusal,
	decidePreCall,
	describeOutcome,
	findRoute,
	LEAF_CLOSED_VERBS,
	NEVER_ROUTED,
	RS_ROUTE_TABLE,
	type RsRouteRow,
	renderRsAnswer,
	resolveGenerationForce,
	servedByLegacy,
} from "./generation-routing.js";

const ADDR = "127.0.0.1:7461";
const STATE_DIR = "/tmp/pij-rs-test";
const ROW: RsRouteRow = {
	verb: "adopt",
	rsPath: "/v1/adopt",
	method: "POST",
	why: "test row",
};

const pre = (over: Partial<Parameters<typeof decidePreCall>[0]> = {}) =>
	decidePreCall({ verb: "adopt", force: undefined, addr: ADDR, rsLive: true, ...over });

describe("Copilot native control boundary", () => {
	it.each(["compact", "new", "reload"])("refuses programmatic %s only for Copilot", (command) => {
		expect(copilotControlRefusal("copilot", command)).toBe(COPILOT_CONTROL_REFUSAL);
		for (const harness of ["pi", "omp", "claude", "codex", undefined]) {
			expect(copilotControlRefusal(harness, command)).toBeUndefined();
		}
	});

	it("does not invent a protocol for bodies or unknown controls", () => {
		expect(copilotControlRefusal("copilot", "hello")).toBeUndefined();
		expect(copilotControlRefusal("copilot", "compact with instructions")).toBeUndefined();
	});
});

describe("route table is data", () => {
	it.each([
		"create",
		"list",
		"tail",
		"kill",
	])("bg %s is daemon-owned and never legacy-unrouted", (leaf) => {
		expect(findRoute("bg", leaf)).toMatchObject({
			rsPath: "/v1/bg",
			method: "POST",
			humanOutput: "rs-line",
			jsonOutput: "passthrough",
		});
		expect(pre({ verb: "bg", leaf })).toMatchObject({ kind: "try-rs" });
	});

	it("routes a verb only when the table lists it", () => {
		expect(findRoute("adopt", undefined)).toBeDefined();
		// A verb nobody has moved: no row, therefore legacy. This is the default
		// that carries every unmigrated verb.
		expect(findRoute("spawn", undefined)).toBeUndefined();
		expect(pre({ verb: "spawn" })).toEqual({ kind: "legacy-unrouted", verb: "spawn" });
	});

	it("adding an rs verb is adding a row — the decision function is untouched", () => {
		const extended = [...RS_ROUTE_TABLE, { ...ROW, verb: "close", rsPath: "/v1/close" }];
		expect(
			decidePreCall({ verb: "close", force: undefined, addr: ADDR, rsLive: true }, extended),
		).toMatchObject({ kind: "try-rs" });
	});

	it("a leaf row wins over its family row", () => {
		const table: RsRouteRow[] = [
			{ verb: "report", rsPath: "/v1/report", method: "POST", why: "family" },
			{ verb: "report", leaf: "verify", rsPath: "/v1/report/verify", method: "POST", why: "leaf" },
		];
		expect(findRoute("report", "verify", table)?.rsPath).toBe("/v1/report/verify");
		expect(findRoute("report", "now", table)?.rsPath).toBe("/v1/report");
	});

	it("routes sessions to the exact rs shim endpoint", () => {
		expect(findRoute("sessions", undefined)).toMatchObject({
			rsPath: "/v1/shim/sessions",
			method: "GET",
			jsonOutput: "project",
		});
	});

	it("projects rs whoami JSON with an explicit absent capability gate", () => {
		const row = findRoute("whoami", undefined);
		expect(
			renderRsAnswer(
				row,
				{
					id: "pij-rs-seat",
					harness: "omp",
					pane: "%42",
					folder: "/repo",
					session: "omp-native-session",
				},
				["whoami", "--json"],
			),
		).toEqual({
			kind: "json",
			text: JSON.stringify({
				id: "pij-rs-seat",
				harness: "omp",
				pane: "%42",
				folder: "/repo",
				session: "omp-native-session",
				generation: "rs",
				capabilityGate: "absent",
			}),
		});
	});
});

describe("the tail false friend (ac-1145)", () => {
	it("tail is on the deny list", () => {
		expect(NEVER_ROUTED.map((entry) => entry.verb)).toContain("tail");
	});

	it("tail has no route-table row", () => {
		expect(findRoute("tail", undefined)).toBeUndefined();
	});

	// THE ARM THAT MATTERS. The two assertions above both pass with the deny
	// list deleted, so neither of them is guarding anything. This one simulates
	// exactly the future that would otherwise arrive by itself: rs starts
	// serving `tail`, someone adds the row, and every caller expecting the TS
	// PEER TRANSCRIPT would receive rs's daemon EVENT frames instead. Deleting
	// the deny list fails HERE and only here.
	it("tail stays in legacy EVEN IF rs advertises it and a row is added", () => {
		const tableThatRoutesTail = [
			...RS_ROUTE_TABLE,
			{ verb: "tail", rsPath: "/v1/tail", method: "GET", why: "rs advertised it" } as RsRouteRow,
		];
		const outcome = decidePreCall(
			{ verb: "tail", force: undefined, addr: ADDR, rsLive: true },
			tableThatRoutesTail,
		);
		expect(outcome).toMatchObject({ kind: "legacy-denied", verb: "tail" });
		expect(describeOutcome(outcome as never)).toMatch(/DENIED from rs routing on purpose/);
	});

	it("not even forced rs overrides the deny list", () => {
		const outcome = decidePreCall({ verb: "tail", force: "rs", addr: ADDR, rsLive: true }, [
			...RS_ROUTE_TABLE,
			{ verb: "tail", rsPath: "/v1/tail", method: "GET", why: "x" },
		]);
		expect(outcome).toMatchObject({ kind: "legacy-denied" });
	});
});

describe("forceback, both directions", () => {
	it("reads both values and rejects anything else", () => {
		expect(resolveGenerationForce({ PIJ_DAEMON_GENERATION: "legacy" })).toBe("legacy");
		expect(resolveGenerationForce({ PIJ_DAEMON_GENERATION: "rs" })).toBe("rs");
		expect(resolveGenerationForce({})).toBeUndefined();
		expect(() => resolveGenerationForce({ PIJ_DAEMON_GENERATION: "rust" })).toThrow(/malformed/);
	});

	it("forced legacy wins even when rs is live and the verb is routed", () => {
		expect(pre({ force: "legacy" })).toEqual({ kind: "legacy-forced", verb: "adopt" });
	});

	it("forced rs reaches rs even when the seat lives in legacy", () => {
		expect(
			pre({ force: "rs", seatId: "pij-x", seatInRs: false, seatInLegacy: true }),
		).toMatchObject({ kind: "try-rs" });
	});

	it("forced rs with no rs daemon is an ERROR, never a quiet fallback", () => {
		const outcome = pre({ force: "rs", rsLive: false });
		expect(outcome).toMatchObject({ kind: "rs-error" });
		expect(servedByLegacy(outcome as never)).toBe(false);
	});
});

describe("the three fallback outcomes stay distinguishable (ac-1143, F-1128)", () => {
	it("rs-does-not-implement and seat-lives-in-legacy are different kinds", () => {
		const notImplemented = classifyRsResponse(
			"adopt",
			ADDR,
			ROW,
			{ status: 404, envelopeDecoded: false },
			false,
			STATE_DIR,
		);
		const seatFollowed = pre({ seatId: "pij-x", seatInRs: false, seatInLegacy: true });
		expect(notImplemented.kind).toBe("legacy-rs-not-implemented");
		expect(seatFollowed).toMatchObject({ kind: "legacy-seat-followed", seatId: "pij-x" });
		expect(notImplemented.kind).not.toBe((seatFollowed as { kind: string }).kind);
		// …and they say different things, not the same sentence twice.
		expect(describeOutcome(notImplemented)).not.toBe(describeOutcome(seatFollowed as never));
	});

	it("all five legacy reasons are distinct kinds AND distinct sentences", () => {
		const outcomes = [
			pre({ force: "legacy" }),
			pre({ verb: "spawn" }),
			pre({ rsLive: false }),
			pre({ seatId: "pij-x", seatInRs: false, seatInLegacy: true }),
			classifyRsResponse(
				"adopt",
				ADDR,
				ROW,
				{ status: 404, envelopeDecoded: false },
				false,
				STATE_DIR,
			),
		] as const;
		const kinds = new Set(outcomes.map((o) => (o as { kind: string }).kind));
		expect(kinds.size).toBe(5);
		const sentences = new Set(outcomes.map((o) => describeOutcome(o as never)));
		expect(sentences.size).toBe(5);
		for (const outcome of outcomes) expect(servedByLegacy(outcome as never)).toBe(true);
	});

	it("a seat is followed only when BOTH stores have been asked", () => {
		// Unknown is not evidence. Re-homing a seat on a question we never asked
		// is the split-brain this plan exists to prevent.
		expect(pre({ seatId: "pij-x", seatInRs: undefined, seatInLegacy: true })).toMatchObject({
			kind: "try-rs",
		});
		expect(pre({ seatId: "pij-x", seatInRs: false, seatInLegacy: undefined })).toMatchObject({
			kind: "try-rs",
		});
	});
});

describe("an rs ERROR never falls back", () => {
	// The four arms below are the ones the live daemon can actually produce.
	// Verified against pij-rs at 127.0.0.1:7461 on 2026-09-01.
	it("bodiless 404 = route absent = not implemented = falls back", () => {
		const outcome = classifyRsResponse(
			"adopt",
			ADDR,
			ROW,
			{ status: 404, envelopeDecoded: false },
			false,
			STATE_DIR,
		);
		expect(outcome.kind).toBe("legacy-rs-not-implemented");
		expect(servedByLegacy(outcome)).toBe(true);
	});

	it("envelope-bearing 404 = rs ANSWERED no = does NOT fall back", () => {
		// crates/daemon/src/http/mod.rs:650 — send to an unknown seat. Same
		// status code as the arm above, opposite handling. Status alone cannot
		// tell these apart, which is why the discriminator is the body.
		const outcome = classifyRsResponse(
			"adopt",
			ADDR,
			ROW,
			{ status: 404, envelopeDecoded: true, detail: "seat not found" },
			false,
			STATE_DIR,
		);
		expect(outcome.kind).toBe("rs-error");
		expect(servedByLegacy(outcome)).toBe(false);
	});

	it("405 = the route exists, we called it wrong = does NOT fall back", () => {
		expect(
			classifyRsResponse(
				"adopt",
				ADDR,
				ROW,
				{ status: 405, envelopeDecoded: true },
				false,
				STATE_DIR,
			).kind,
		).toBe("rs-error");
	});

	it("500 does NOT fall back", () => {
		const outcome = classifyRsResponse(
			"adopt",
			ADDR,
			ROW,
			{ status: 500, envelopeDecoded: true, detail: "boom" },
			false,
			STATE_DIR,
		);
		expect(outcome).toMatchObject({ kind: "rs-error", detail: "boom" });
		expect(servedByLegacy(outcome)).toBe(false);
	});

	it("401 is its OWN named outcome — a wrong key must never read as not-implemented", () => {
		// rs checks auth in a LAYER above the route match (mod.rs:215-218), so a
		// 401 says nothing about whether the route exists. Reading it as
		// not-implemented would silently re-home EVERY routed verb to legacy the
		// moment the key went missing, and it would look like a working fallback
		// forever.
		const outcome = classifyRsResponse(
			"adopt",
			ADDR,
			ROW,
			{ status: 401, envelopeDecoded: true },
			false,
			STATE_DIR,
		);
		expect(outcome.kind).toBe("rs-auth-rejected");
		expect(servedByLegacy(outcome)).toBe(false);
		const line = describeOutcome(outcome);
		expect(line).toMatch(/REJECTED THE KEY/);
		expect(line).toContain(STATE_DIR);
		// It must also warn that auth masks route-absence, or the operator will
		// read it as "rs does not have this verb".
		expect(line).toMatch(/before matching the route/i);
	});

	it("a 200 is served by rs", () => {
		const outcome = classifyRsResponse(
			"adopt",
			ADDR,
			ROW,
			{ status: 200, envelopeDecoded: true },
			false,
			STATE_DIR,
		);
		expect(outcome).toMatchObject({ kind: "rs", addr: ADDR });
		expect(servedByLegacy(outcome)).toBe(false);
	});

	it("under forced rs, not-implemented is an error rather than a fallback", () => {
		const outcome = classifyRsResponse(
			"adopt",
			ADDR,
			ROW,
			{ status: 404, envelopeDecoded: false },
			true,
			STATE_DIR,
		);
		expect(outcome.kind).toBe("rs-error");
	});
});

describe("the diagnostic names the ADDR, not only the generation (ac-1143, PM O4)", () => {
	it("every outcome that involves rs names the addr it means", () => {
		const withAddr = [
			classifyRsResponse(
				"adopt",
				ADDR,
				ROW,
				{ status: 200, envelopeDecoded: true },
				false,
				STATE_DIR,
			),
			classifyRsResponse(
				"adopt",
				ADDR,
				ROW,
				{ status: 404, envelopeDecoded: false },
				false,
				STATE_DIR,
			),
			classifyRsResponse(
				"adopt",
				ADDR,
				ROW,
				{ status: 500, envelopeDecoded: true },
				false,
				STATE_DIR,
			),
			classifyRsResponse(
				"adopt",
				ADDR,
				ROW,
				{ status: 401, envelopeDecoded: true },
				false,
				STATE_DIR,
			),
			pre({ rsLive: false }),
			pre({ seatId: "pij-x", seatInRs: false, seatInLegacy: true }),
		] as const;
		for (const outcome of withAddr) expect(describeOutcome(outcome as never)).toContain(ADDR);
	});

	it("a different addr produces a different line — the field is real, not a constant", () => {
		// Two rs daemons with separate state dirs have coexisted on this machine.
		// "an rs daemon is live" is not the claim; "THIS one served it" is.
		const other = "127.0.0.1:17610";
		const a = classifyRsResponse(
			"adopt",
			ADDR,
			ROW,
			{ status: 200, envelopeDecoded: true },
			false,
			STATE_DIR,
		);
		const b = classifyRsResponse(
			"adopt",
			other,
			ROW,
			{ status: 200, envelopeDecoded: true },
			false,
			STATE_DIR,
		);
		expect(describeOutcome(a)).not.toBe(describeOutcome(b));
		expect(describeOutcome(b)).toContain(other);
	});

	it("names the forceback when one was used, so a forced run is never mistaken for a detected one", () => {
		expect(
			describeOutcome(
				classifyRsResponse(
					"adopt",
					ADDR,
					ROW,
					{ status: 200, envelopeDecoded: true },
					true,
					STATE_DIR,
				),
			),
		).toMatch(/forced/);
		expect(describeOutcome(pre({ force: "legacy" }) as never)).toMatch(/forced/);
	});
});

/** ac-1147: the shim has NO name-generation path. rs mints; the shim never
 *  invents a seat name. Two minters would be two namespaces — the headline
 *  split-brain by construction. */
describe("the shim has no minter (ac-1147)", () => {
	const SHIM_SOURCES = ["./generation-routing.ts", "../adapters/generation-router.ts"].map((rel) =>
		fileURLToPath(new URL(rel, import.meta.url)),
	);

	/** Strip comments before scanning: this file and the sources both TALK about
	 *  minting at length, and a scanner that counted prose would be tripped by
	 *  its own documentation. */
	const scanForMinter = (source: string): readonly string[] => {
		const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
		const signals: [RegExp, string][] = [
			[/memorable/i, "memorable-id vocabulary"],
			[/allocate_?[Mm]emorable/, "the rs allocator by name"],
			[/candidates?\s*\(/, "a candidate-name generator call"],
			[/Math\.random/, "randomness (a name generator's tell)"],
			[/randomUUID|randomBytes/, "crypto randomness"],
			[/`pij-\$\{/, "an interpolated pij- id literal"],
			[/["'`]pij-[a-z]+-[a-z]+["'`]/, "a hardcoded seat-name-shaped literal"],
		];
		return signals.filter(([re]) => re.test(code)).map(([, label]) => label);
	};

	it("finds no name-generation path in any shim source", () => {
		for (const path of SHIM_SOURCES) {
			expect({ path, found: scanForMinter(readFileSync(path, "utf8")) }).toEqual({
				path,
				found: [],
			});
		}
	});

	// POSITIVE CONTROL. Without this, the test above passes just as happily if
	// the scanner is broken, and "no minter found" would mean "found nothing"
	// rather than "there is nothing". Every arm must be able to fail.
	it("the scanner actually catches a minter when one is present", () => {
		const injected = `
			function mintSeatId(): string {
				return \`pij-\${Math.random().toString(36).slice(2)}\`;
			}
		`;
		expect(scanForMinter(injected).length).toBeGreaterThan(0);
	});

	it("the scanner is not fooled by a minter hidden in a comment-shaped string", () => {
		expect(scanForMinter(`const x = "pij-long-wombat";`).length).toBeGreaterThan(0);
	});

	it("prose about minting does not trip the scanner", () => {
		expect(scanForMinter(`/* the memorable id minter lives in rs, never here */`)).toEqual([]);
	});
});

describe("the mailbox verbs (plan 119)", () => {
	const shimRow = (verb: string, leaf: string | undefined): RsRouteRow =>
		({
			verb,
			leaf,
			rsPath: "/v1/shim/x",
			method: "POST",
			humanOutput: "render",
			render: () => "",
			jsonOutput: "refuse",
			jsonRefusal: "x",
			why: "test row",
		}) as RsRouteRow;

	it("`inbox register` keeps its denial, and the denial still names its reason", () => {
		const denial = NEVER_ROUTED.find(
			(entry) => entry.verb === "inbox" && entry.leaf === "register",
		);
		expect(denial).toBeDefined();
		// The reason is not decoration: it is the thing s120 must replace before
		// this denial may be lifted. If someone shortens it away, the next reader
		// loses why the leaf is denied and lifts it for free.
		expect(denial?.why).toContain("BIND EVIDENCE");
		expect(denial?.why).toContain("never falls back");
	});

	it("a denied LEAF does not deny its siblings", () => {
		expect(
			decidePreCall({
				verb: "inbox",
				leaf: "register",
				force: undefined,
				addr: ADDR,
				rsLive: true,
			}),
		).toMatchObject({ kind: "legacy-denied", verb: "inbox" });
		// `check` is enumerated, so it is NOT swept up by its sibling's denial.
		expect(findRoute("inbox", "check")).toBeDefined();
	});

	// THE POINT OF THE CLOSED DEFAULT, pinned the only way that means anything.
	//
	// Written in the `tail` test's shape deliberately: the made-up leaf is put IN
	// the route table — with a whole-verb row beside it, which is the exact thing
	// that would make it route — and asserted unrouted ANYWAY. A test that merely
	// checked "there is no row for `frobnicate`" would pass just as happily with
	// LEAF_CLOSED_VERBS deleted, which is the change it exists to catch.
	//
	// Narrowing `inbox` from verb granularity to leaf granularity spends "safety
	// with no author": while the whole verb was denied, a leaf nobody had imagined
	// was denied by construction. The closed default is what buys that back, and
	// the failure it prevents arrives months from now in a commit that never
	// mentions registration, written by someone adding a mailbox leaf.
	it("an unenumerated inbox leaf stays unrouted EVEN IF a whole-verb row exists", () => {
		expect(LEAF_CLOSED_VERBS).toContain("inbox");
		const table: RsRouteRow[] = [
			shimRow("inbox", "check"),
			// The trap: a family row that a leaf-open verb would fall back to.
			shimRow("inbox", undefined),
		];
		expect(findRoute("inbox", "frobnicate", table)).toBeUndefined();
		// And against the SHIPPED table, which now really does carry a bare row —
		// the case the trap above was simulating.
		expect(findRoute("inbox", "frobnicate")).toBeUndefined();
		expect(
			decidePreCall(
				{ verb: "inbox", leaf: "frobnicate", force: undefined, addr: ADDR, rsLive: true },
				table,
			),
		).toEqual({ kind: "legacy-unrouted", verb: "inbox" });
		// And the enumerated one still routes, or the guard is just "deny inbox".
		expect(findRoute("inbox", "check", table)).toBeDefined();
	});

	// `requiresSeatInRs` — KNOWN PRESENT, never merely not-known-absent.
	//
	// The hazard: every `pij inbox` leaf calls ensureCurrentRegistration
	// (cli.ts:939), so auto-registration is a property of the VERB. A seat in
	// NEITHER store has no ambient id, so follow-the-seat cannot fire (it needs
	// seatInRs === false AND seatInLegacy === true), the call reaches rs, rs
	// refuses because no rs seat owns the pane, and an rs refusal NEVER falls
	// back. That seat would then register nowhere.
	it.each([
		["absent", false as const],
		["unknown", undefined],
	])("a seat whose rs presence is %s goes to legacy, not rs", (_label, seatInRs) => {
		const table = [shimRow("send", undefined)].map((row) => ({
			...row,
			requiresSeatInRs: true,
		})) as RsRouteRow[];
		expect(
			decidePreCall(
				{ verb: "send", force: undefined, addr: ADDR, rsLive: true, seatId: "pij-x", seatInRs },
				table,
			),
		).toMatchObject({ kind: "legacy-seat-not-in-rs", verb: "send" });
	});

	it("a seat KNOWN PRESENT in rs routes", () => {
		const table = [{ ...shimRow("send", undefined), requiresSeatInRs: true }] as RsRouteRow[];
		expect(
			decidePreCall(
				{
					verb: "send",
					force: undefined,
					addr: ADDR,
					rsLive: true,
					seatId: "pij-x",
					seatInRs: true,
				},
				table,
			),
		).toMatchObject({ kind: "try-rs" });
	});

	it("bare `pij inbox` routes — it is the public alias of `check` (F3)", () => {
		// Routing runs BEFORE the alias parser, so an unrouted bare form means an
		// rs-only seat must type the noncanonical `inbox check` or fall to legacy
		// and get E-NOID: this unit's own defect, preserved in the one spelling
		// everybody uses.
		expect(findRoute("inbox", undefined)?.rsPath).toBe("/v1/shim/inbox");
	});

	it("the shipped mailbox rows carry the precondition", () => {
		for (const [verb, leaf] of [
			["send", undefined],
			["inbox", "check"],
			["inbox", undefined],
		] as const) {
			expect(findRoute(verb, leaf)?.requiresSeatInRs).toBe(true);
		}
	});

	// A row is a CLAIM that the far side speaks the shim's language, and nothing
	// checks that claim: `callRs` posts {argv, caller} for every routed row, and
	// a handler that cannot deserialize it answers 422 -> rs-error -> NEVER falls
	// back, taking the verb out fleet-wide. So the mailbox rows must point at the
	// shim-originated paths and never at the pij-rs CLI's own.
	it("the mailbox rows point at the shim paths, not at /v1/send or /v1/inbox", () => {
		expect(findRoute("send", undefined)?.rsPath).toBe("/v1/shim/send");
		expect(findRoute("inbox", "check")?.rsPath).toBe("/v1/shim/inbox");
	});

	it("the outcome tells `not known to be in rs` apart from `known to be in legacy`", () => {
		// Two different claims, and collapsing them is how a seat gets re-homed on
		// an unknown rather than on a fact.
		const notInRs = describeOutcome({
			kind: "legacy-seat-not-in-rs",
			verb: "send",
			addr: ADDR,
			seatId: "pij-x",
		});
		const followed = describeOutcome({
			kind: "legacy-seat-followed",
			verb: "send",
			addr: ADDR,
			seatId: "pij-x",
		});
		expect(notInRs).not.toEqual(followed);
		expect(notInRs).toContain("KNOWN PRESENT");
		expect(followed).toContain("lives in legacy");
	});
});
