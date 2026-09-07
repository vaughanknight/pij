import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	buildCallerContext,
	CALLER_ENV_ALLOWLIST,
	CALLER_WIRE_KEYS,
	describeOutcome,
	findRoute,
	isDirectPanelessAdopt,
	NEVER_ROUTED,
	PANELESS_ADOPT_REFUSAL,
	RS_ROUTE_TABLE,
	type RsRouteRow,
	renderRsAnswer,
	servedByLegacy,
	subjectSeatFromArgv,
} from "../core/generation-routing.js";
import {
	type GenerationRouterDeps,
	probeDecisionOnly,
	probeRs,
	routeVerb,
	rsSeatByPane,
} from "./generation-router.js";

const KEY = "k".repeat(64);
const HEALTH = JSON.stringify({
	ok: true,
	command: "pij ping",
	v: 2,
	data: { status: "healthy", build: "t", offline: false, machine: "t" },
});
const OK = JSON.stringify({ ok: true, command: "pij x", v: 2, data: {} });

interface Seen {
	readonly url: string;
	readonly method: string;
	readonly body?: string;
}

function deps(seen: Seen[], over: Partial<GenerationRouterDeps> = {}): GenerationRouterDeps {
	return {
		fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (!url.endsWith("/health")) {
				seen.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined });
			}
			return new Response(url.endsWith("/health") ? HEALTH : OK, { status: 200 });
		}) as unknown as typeof fetch,
		readFile: (async () => KEY) as unknown as GenerationRouterDeps["readFile"],
		env: { PIJ_RS_ADDR: "127.0.0.1:7461", PIJ_RS_STATE_DIR: "/tmp/s" },
		home: "/tmp/home",
		...over,
	};
}

const CALLER_ENV = {
	PIJ_RS_ADDR: "127.0.0.1:7461",
	PIJ_RS_STATE_DIR: "/tmp/s",
	PIJ_SESSION_ID: "pij-long-wombat",
	TMUX_PANE: "%2088",
	CLAUDE_CODE_SESSION_ID: "191b35a2-6ecb",
};

/** The four arms that were RED before this unit. Each failed for a behavioural
 *  reason, not a compile error: the GET rows sent a bare URL and no body, the
 *  POST row sent `{"argv":["phonehome"]}` with no environment at all, and
 *  `inbox register` resolved legacy-unrouted. */
describe("a routed call carries the caller to rs (F-U1, F-U2)", () => {
	it("whoami transmits the caller's seat id (ac-1142)", async () => {
		const seen: Seen[] = [];
		await routeVerb("whoami", undefined, ["whoami"], deps(seen, { env: CALLER_ENV }));
		expect(seen[0]?.body ?? "").toContain("pij-long-wombat");
	});

	it("state transmits it too — a GET could not (ac-1142)", async () => {
		const seen: Seen[] = [];
		await routeVerb("state", undefined, ["state"], deps(seen, { env: CALLER_ENV }));
		expect(seen[0]?.method).toBe("POST");
		expect(seen[0]?.body ?? "").toContain("pij-long-wombat");
	});

	it("phonehome transmits the harness session id it binds by (ac-1148)", async () => {
		const seen: Seen[] = [];
		await routeVerb("phonehome", undefined, ["phonehome"], deps(seen, { env: CALLER_ENV }));
		expect(seen[0]?.body ?? "").toContain("191b35a2-6ecb");
	});

	// F-U6 still governs every caller-bound route: a tmux pane starts with `%`,
	// so those routes stay POST bodies. Plan 128's sessions route is the sole GET:
	// it carries no caller identity and returns the global union input.
	it("keeps sessions as the only GET route", () => {
		expect(RS_ROUTE_TABLE.filter((row) => row.method !== "POST").map((row) => row.verb)).toEqual([
			"sessions",
		]);
	});

	it("a pane id survives the trip intact, `%` and all", async () => {
		const seen: Seen[] = [];
		await routeVerb("whoami", undefined, ["whoami"], deps(seen, { env: CALLER_ENV }));
		const body = JSON.parse(seen[0]?.body ?? "{}") as { caller?: { tmuxPane?: string } };
		expect(body.caller?.tmuxPane).toBe("%2088");
	});

	it("argv still rides along beside the caller block", async () => {
		const seen: Seen[] = [];
		await routeVerb("state", undefined, ["state", "pij-other"], deps(seen, { env: CALLER_ENV }));
		const body = JSON.parse(seen[0]?.body ?? "{}") as { argv?: string[] };
		expect(body.argv).toEqual(["state", "pij-other"]);
	});
});

describe("the caller block is an ALLOWLIST, never an env dump", () => {
	it("carries the allowlisted fields", () => {
		const caller = buildCallerContext(
			{ PIJ_SESSION_ID: "pij-a", TMUX_PANE: "%1", CODEX_THREAD_ID: "t-9" },
			{ cwd: "/w", pid: 42, procStart: 20260901110000 },
		);
		expect(caller).toEqual({
			pijSessionId: "pij-a",
			tmuxPane: "%1",
			codexThreadId: "t-9",
			cwd: "/w",
			pid: 42,
			procStart: 20260901110000,
		});
	});

	// THE ARM THAT MATTERS. `process.env` on this fleet holds tokens and keys.
	// A blanket passthrough would ship them to a daemon that never asked, and
	// nothing about the happy-path assertions above would notice.
	it("does NOT carry anything outside the allowlist", () => {
		const caller = buildCallerContext(
			{
				PIJ_SESSION_ID: "pij-a",
				ANTHROPIC_API_KEY: "sk-secret",
				GITHUB_TOKEN: "ghp-secret",
				AWS_SECRET_ACCESS_KEY: "aws-secret",
				HOME: "/Users/someone",
			},
			{},
		);
		expect(JSON.stringify(caller)).not.toContain("secret");
		expect(Object.keys(caller)).toEqual(["pijSessionId"]);
	});

	it("nothing reaches the wire that the allowlist does not name", async () => {
		const seen: Seen[] = [];
		await routeVerb(
			"whoami",
			undefined,
			["whoami"],
			deps(seen, { env: { ...CALLER_ENV, ANTHROPIC_API_KEY: "sk-must-not-travel" } }),
		);
		expect(seen[0]?.body ?? "").not.toContain("sk-must-not-travel");
	});

	it("an absent field is OMITTED, not sent as null", () => {
		// Absent and empty are different claims, and rs must be able to tell
		// "the caller had none" from "the caller sent an empty one".
		const caller = buildCallerContext({ PIJ_SESSION_ID: "pij-a", TMUX_PANE: "" }, {});
		expect("tmuxPane" in caller).toBe(false);
		expect(JSON.stringify(caller)).not.toContain("null");
	});

	it("a start time that cannot be read is omitted rather than defaulted", async () => {
		// A wrong start time is worse than none: it would corroborate a
		// recycled pid, which is the whole reason the pair exists.
		const seen: Seen[] = [];
		await routeVerb(
			"whoami",
			undefined,
			["whoami"],
			deps(seen, {
				env: CALLER_ENV,
				pid: () => 4285,
				procStart: () => {
					throw new Error("ps failed");
				},
			}),
		);
		const body = JSON.parse(seen[0]?.body ?? "{}") as { caller?: Record<string, unknown> };
		expect(body.caller?.pid).toBe(4285);
		expect("procStart" in (body.caller ?? {})).toBe(false);
	});

	it("the allowlist names every field the caller block can carry", () => {
		// Pins the list itself: adding a field is a deliberate act that shows up
		// here, rather than a quiet widening of what leaves the machine.
		expect(CALLER_ENV_ALLOWLIST.map(([envName]) => envName)).toEqual([
			"PIJ_SESSION_ID",
			"TMUX_PANE",
			"PIJ_PARENT_ID",
			"CLAUDE_CODE_SESSION_ID",
			"COPILOT_AGENT_SESSION_ID",
			"CODEX_THREAD_ID",
		]);
	});
});

describe("`inbox` is DENIED, and the paneless form stays on legacy (F-U5)", () => {
	it("inbox is on the deny list, not merely absent from the table", () => {
		// Unlisted would be enough today. It is not enough for a failure this
		// severe: a future row-add would stop every paneless seat registering
		// ANYWHERE, and the deny list is where the reason survives to meet
		// whoever is about to add that row.
		expect(NEVER_ROUTED.map((entry) => entry.verb)).toContain("inbox");
		// s119 moved this from verb granularity to LEAF granularity. The reason
		// text is unchanged and still attached to the leaf it was always about —
		// nothing was struck, and it is what s120 must replace before the denial
		// may be lifted.
		const entry = NEVER_ROUTED.find((row) => row.verb === "inbox");
		expect(entry?.leaf).toBe("register");
		expect(entry?.why ?? "").toContain("BIND EVIDENCE");
	});

	it("stays on legacy EVEN IF someone adds a row for it", async () => {
		const seen: Seen[] = [];
		const { outcome } = await routeVerb("inbox", "register", ["inbox", "register"], deps(seen), [
			...RS_ROUTE_TABLE,
			{
				verb: "inbox",
				leaf: "register",
				rsPath: "/v1/inbox/register",
				method: "POST",
				humanOutput: "render",
				why: "someone re-added it",
			},
		]);
		expect(outcome.kind).toBe("legacy-denied");
		expect(seen).toEqual([]);
	});

	// UPDATED IN PLAN 119, and what it protects is unchanged.
	//
	// It used to assert that NO inbox row exists, which was the right guard while
	// the denial was verb-wide. s119 routes the mailbox READ leaves, so that
	// assertion would now fail for a reason that has nothing to do with the
	// hazard — and deleting it would leave the hazard unguarded. So it asserts
	// the thing it was always really about: THE PANELESS REGISTRATION FORM NEVER
	// REACHES RS. The read leaves were never what F-U5 was about; `register` is.
	it("no route-table row reaches rs for the PANELESS REGISTRATION form", () => {
		expect(findRoute("inbox", "register")).toBeUndefined();
	});

	// And the closed default is what keeps that true for a leaf nobody has
	// imagined yet — the property the verb-wide deny used to give for free.
	it("a leaf nobody has enumerated does not route either", () => {
		expect(findRoute("inbox", "frobnicate")).toBeUndefined();
	});

	// The read leaves DO route, or s119 shipped nothing. Asserted here rather
	// than only in the routing tests so the two halves of this file cannot drift
	// into disagreeing about the same table.
	it("the mailbox READ leaves route, which is the whole of s119", () => {
		expect(findRoute("inbox", undefined)?.rsPath).toBe("/v1/shim/inbox");
		expect(findRoute("inbox", "check")?.rsPath).toBe("/v1/shim/inbox");
	});
});

describe("report is five leaf rows, and `verify` is not one of them (finding 6)", () => {
	it("routes the five shapes rs can honour, all at the one endpoint it serves", () => {
		for (const leaf of ["now", "state", "blocked", "clear", "question"]) {
			// One path, five rows. The leaf travels in argv; rs registers a
			// single `/v1/report`, and pointing rows at `/v1/report/<leaf>` sent
			// every report to a 404 that looked like an unlanded verb.
			expect(findRoute("report", leaf)?.rsPath).toBe("/v1/report");
			expect(findRoute("report", leaf)?.leaf).toBe(leaf);
		}
	});

	// rs has no assignment model anywhere in crates/, so verify's
	// --assignment/--refs/--project address objects that do not exist there.
	// Unlisted-goes-legacy keeps it working; a family row would have swallowed it.
	it("leaves `report verify` on legacy", () => {
		expect(findRoute("report", "verify")).toBeUndefined();
	});

	it("there is no whole-verb `report` row to fall through to", () => {
		// The arm that would fail if someone re-added a family row: findRoute
		// prefers a leaf, then falls back to the family, so a family row would
		// silently re-capture `verify`.
		expect(findRoute("report", undefined)).toBeUndefined();
	});
});

describe("follow-the-seat keys on the RIGHT seat (finding 5)", () => {
	const ambient = "pij-me";

	it("an identity verb asks about the AMBIENT seat", () => {
		const row = findRoute("whoami", undefined) as RsRouteRow;
		expect(subjectSeatFromArgv(row, ["whoami"], ambient)).toBe(ambient);
	});

	it("`state <id>` asks about the ARGUMENT seat, not me", () => {
		const row = findRoute("state", undefined) as RsRouteRow;
		expect(subjectSeatFromArgv(row, ["state", "pij-someone-else"], ambient)).toBe(
			"pij-someone-else",
		);
	});

	it("flags are not mistaken for a seat id", () => {
		const row = findRoute("state", undefined) as RsRouteRow;
		expect(subjectSeatFromArgv(row, ["state", "--json", "pij-them"], ambient)).toBe("pij-them");
	});

	it("no positional leaves it UNKNOWN rather than silently falling back to me", () => {
		// Falling back to the ambient seat is exactly the bug: it would route a
		// cross-seat read on the caller's own residency.
		const row = findRoute("state", undefined) as RsRouteRow;
		expect(subjectSeatFromArgv(row, ["state"], ambient)).toBeUndefined();
	});

	it("an rs-resident caller reading a LEGACY-only peer is followed to legacy", async () => {
		// Before this, the ambient seat decided, so this call routed to rs, took
		// a decoded "no such seat", classified rs-error and exited 4 — breaking a
		// verb that works today for every legacy-resident peer.
		const seen: Seen[] = [];
		const { outcome } = await routeVerb(
			"state",
			undefined,
			["state", "pij-legacy-peer"],
			deps(seen, {
				env: CALLER_ENV,
				ambientSeatId: () => "pij-rs-resident-me",
				seatInRs: (id: string) => id === "pij-rs-resident-me",
				seatInLegacy: (id: string) => id === "pij-legacy-peer",
			}),
		);
		expect(outcome).toMatchObject({ kind: "legacy-seat-followed", seatId: "pij-legacy-peer" });
		expect(seen).toEqual([]);
	});
});

describe("rs output keeps the CLI's surface (finding 7)", () => {
	const bare: RsRouteRow = {
		verb: "report",
		leaf: "now",
		rsPath: "/x",
		method: "POST",
		humanOutput: "rs-line",
		why: "t",
	};

	// THIS TEST USED TO ASSERT THE BUG. It pinned that any payload becomes JSON
	// verbatim — which is precisely the raw-schema bypass F003 found. A row that
	// cannot honour the legacy --json contract must refuse it by name.
	it("--json is REFUSED by a row that cannot honour the legacy contract", () => {
		const result = renderRsAnswer(bare, { a: 1 }, ["report", "now", "--json"]);
		expect(result.kind).toBe("json-refused");
		if (result.kind !== "json-refused") throw new Error("unreachable");
		expect(result.message).not.toContain('{"a":1}');
	});

	it("--json is PROJECTED when the row declares one", () => {
		const projecting: RsRouteRow = {
			...bare,
			jsonOutput: "project",
			projectJson: () => ({ id: "pij-x", verbs: {}, capabilitySchema: 2 }),
		};
		expect(renderRsAnswer(projecting, { a: 1 }, ["report", "now", "--json"])).toEqual({
			kind: "json",
			text: '{"id":"pij-x","verbs":{},"capabilitySchema":2}',
		});
	});

	it("a human gets the row's rendering", () => {
		const withRender: RsRouteRow = {
			...bare,
			humanOutput: "render",
			render: () => "reported by pij-x",
		};
		expect(renderRsAnswer(withRender, {}, ["report", "now"])).toEqual({
			kind: "rendered",
			text: "reported by pij-x",
		});
	});

	// The arm that stops a silent surface change: a row rs serves with no
	// renderer must REFUSE, not print a blob that looks like output.
	it("a human with no renderer gets a LOUD refusal, never raw JSON", () => {
		const result = renderRsAnswer(bare, { a: 1 }, ["report", "now"]);
		expect(result.kind).toBe("no-renderer");
		if (result.kind !== "no-renderer") throw new Error("unreachable");
		expect(result.message).toContain("report now");
		expect(result.message).not.toContain('{"a":1}');
	});
});

/** Finding 4: `legacy-seat-followed` was built, documented and unit-tested, and
 *  could not fire for anything an operator typed — the call site passed no deps
 *  and the default set carries no seat lookups.
 *
 *  This is a WIRING PIN, not a behavioural proof: it asserts the call site
 *  supplies the three deps, which is the thing that was missing. The
 *  behavioural proof is the routeVerb test above (which hands them in) plus the
 *  live witness recorded in the receipt. Named honestly because a source scan
 *  cannot prove the deps RESOLVE correctly at runtime — only that they are
 *  wired at all. */
describe("the production call site wires the seat lookups (finding 4)", () => {
	const CLI = fileURLToPath(new URL("../cli.ts", import.meta.url));

	const wiredDeps = (source: string): readonly string[] => {
		const start = source.indexOf("function routingDeps()");
		if (start === -1) return [];
		const body = source.slice(start, start + 2000);
		return ["ambientSeatId", "seatInLegacy", "seatInRs"].filter((dep) =>
			new RegExp(`${dep}\\s*:`).test(body),
		);
	};

	it("routingDeps supplies all three", () => {
		expect(wiredDeps(readFileSync(CLI, "utf8"))).toEqual([
			"ambientSeatId",
			"seatInLegacy",
			"seatInRs",
		]);
	});

	// F2, plan 119. `ambientSeatId` reads the LEGACY registry, so for a fresh
	// rs-only seat — the entire acceptance population — it resolves to nothing,
	// `seatInRs` is never asked, and `requiresSeatInRs` refuses to route for
	// exactly the callers the routing exists to serve. `rsSeatByPane` is the only
	// evidence such a caller has. Unwired, the precondition is unreachable in
	// production while every test that hands in a `seatId` still passes — the
	// same shape as `legacy-seat-followed` being declared, tested, and dead.
	it("routingDeps also wires the pane lookup, or rs-only seats can never route", () => {
		const body = readFileSync(CLI, "utf8");
		const start = body.indexOf("function routingDeps()");
		expect(start).toBeGreaterThan(-1);
		expect(body.slice(start, start + 2500)).toMatch(/rsSeatByPane\s*:/);
	});

	// F1, plan 119. This gate read `entry.verb === verb` alone, which was correct
	// while every deny was verb-wide and became a silent bug the moment one
	// carried a leaf: `inbox register`'s denial sent EVERY `pij inbox …` to
	// legacy — `inbox check` included — before `findRoute` or `decidePreCall`
	// ran. The pure tests passed throughout, because this gate is UPSTREAM of the
	// function they exercise. A source scan is the honest instrument here: it
	// cannot prove the gate behaves, only that it still reads the leaf, which is
	// the exact regression.
	it("the entrypoint deny gate is leaf-aware", () => {
		const source = readFileSync(CLI, "utf8");
		const start = source.indexOf("const denied = NEVER_ROUTED");
		expect(start).toBeGreaterThan(-1);
		const gate = source.slice(start, start + 300);
		expect(gate).toMatch(/entry\.leaf/);
		// A verb-wide deny must still deny every leaf, so the gate has to accept
		// an ABSENT leaf as well — checking only `entry.leaf === leaf` would let
		// `tail` route the moment anyone passed a leaf.
		expect(gate).toMatch(/entry\.leaf === undefined/);
	});

	// Positive control: without it, "all three found" could mean the scanner is
	// broken rather than the deps are there.
	it("the scan notices when one goes missing", () => {
		expect(
			wiredDeps("function routingDeps() { return { ambientSeatId: x, seatInLegacy: y }; }"),
		).toEqual(["ambientSeatId", "seatInLegacy"]);
	});

	it("the routed argv still carries explicit deps rather than defaulting", () => {
		const source = readFileSync(CLI, "utf8");
		// Leading --json is normalized before routing; the subprocess bg suite
		// proves argument preservation. This witness still requires routingDeps
		// as the explicit fourth argument, independent of that preprocessing.
		expect(source).toMatch(/routeVerb\(\s*verb,\s*leaf,\s*argv,\s*routingDeps\(\)/);
		// …and so does the diagnostic, or it reports a different generation than
		// the one the real call uses.
		expect(source).toMatch(/probeDecisionOnly\([\s\S]{0,120}routingDeps\(\)/);
	});
});

describe("the diagnostic tells the truth about leaf rows", () => {
	const diagDeps = (over: Partial<GenerationRouterDeps> = {}): GenerationRouterDeps =>
		deps([], {
			env: CALLER_ENV,
			ambientSeatId: () => "pij-me",
			seatInRs: () => false,
			seatInLegacy: () => true,
			...over,
		});

	it("names the leaf, not five identical bare verbs", async () => {
		const lines = (await probeDecisionOnly(undefined, diagDeps())).map((d) => d.verb);
		expect(lines).toContain("report now");
		expect(lines).toContain("report question");
		expect(lines.filter((name) => name === "report")).toEqual([]);
	});

	it("asking a bare verb expands to its leaves", async () => {
		const decisions = await probeDecisionOnly(["report"], diagDeps());
		expect(decisions.map((d) => d.verb)).toEqual([
			"report now",
			"report state",
			"report blocked",
			"report clear",
			"report question",
		]);
	});

	// A diagnostic that reports a different generation than the real call is
	// worse than none: it is consulted precisely when someone is confused.
	it("agrees with what the real call does for the same seat", async () => {
		const shared = diagDeps();
		const [diagnosed] = await probeDecisionOnly(["whoami"], shared);
		const { outcome } = await routeVerb("whoami", undefined, ["whoami"], shared);
		expect(diagnosed?.line).toBe(describeOutcome(outcome));
	});
});

/** Item 8 — the cross-runtime wire contract, held by a SHARED FIXTURE.
 *
 *  `crates/daemon/tests/fixtures/caller-context.wire.json` IS the contract. This
 *  half asserts the shim WRITES exactly it; `report_http.rs` asserts the daemon
 *  READS exactly it and that every field arrives populated.
 *
 *  A FIXTURE, NOT A SCANNER, and the reason is the bug that got here. The first
 *  version of this guard scanned Rust sources for the TS spelling. To be right
 *  it had to model serde's rename/alias; to catch the ACTUAL defect it would
 *  also have had to model that serde SILENTLY DROPS UNKNOWN FIELDS — the whole
 *  reason a total disagreement produced no symptom either side could see. A
 *  scanner that must model the other runtime's deserializer is the wrong tool.
 *  Both halves here assert on POPULATED values, so neither can pass vacuously,
 *  which is exactly the property the scanner lacked: a deliberate half-rename
 *  survived it.
 *
 *  This platform had already written the remedy down once, for PIJ_SPAWN_ID: a
 *  shared artifact, not a human-verified name match. */
describe("cross-runtime caller-key seam (item 8)", () => {
	const FIXTURE = fileURLToPath(
		new URL("../../../../crates/daemon/tests/fixtures/caller-context.wire.json", import.meta.url),
	);

	const wireContract = (): Record<string, unknown> => {
		const parsed = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, unknown>;
		delete parsed._comment;
		return parsed;
	};

	it("the shim WRITES exactly the wire contract", () => {
		const contract = wireContract();
		const caller = buildCallerContext(
			{
				PIJ_SESSION_ID: contract.pijSessionId as string,
				TMUX_PANE: contract.tmuxPane as string,
				PIJ_PARENT_ID: contract.pijParentId as string,
				CLAUDE_CODE_SESSION_ID: contract.claudeCodeSessionId as string,
				COPILOT_AGENT_SESSION_ID: contract.copilotAgentSessionId as string,
				CODEX_THREAD_ID: contract.codexThreadId as string,
			},
			{
				cwd: contract.cwd as string,
				pid: contract.pid as number,
				procStart: contract.procStart as number,
			},
		);
		expect(caller).toEqual(contract);
	});

	it("and puts exactly it on the wire", async () => {
		const contract = wireContract();
		const seen: Seen[] = [];
		await routeVerb(
			"whoami",
			undefined,
			["whoami"],
			deps(seen, {
				env: {
					PIJ_RS_ADDR: "127.0.0.1:7461",
					PIJ_RS_STATE_DIR: "/tmp/s",
					PIJ_SESSION_ID: contract.pijSessionId as string,
					TMUX_PANE: contract.tmuxPane as string,
					PIJ_PARENT_ID: contract.pijParentId as string,
					CLAUDE_CODE_SESSION_ID: contract.claudeCodeSessionId as string,
					COPILOT_AGENT_SESSION_ID: contract.copilotAgentSessionId as string,
					CODEX_THREAD_ID: contract.codexThreadId as string,
				},
				cwd: () => contract.cwd as string,
				pid: () => contract.pid as number,
				procStart: () => contract.procStart as number,
			}),
		);
		const body = JSON.parse(seen[0]?.body ?? "{}") as { caller?: unknown };
		expect(body.caller).toEqual(contract);
	});

	// Non-vacuity: the fixture must actually carry every key, or "deep-equals the
	// fixture" would be a weaker claim than it reads as.
	it("the fixture carries every wire key, populated", () => {
		const contract = wireContract();
		expect(Object.keys(contract).sort()).toEqual([...CALLER_WIRE_KEYS].sort());
		for (const [key, value] of Object.entries(contract)) {
			expect(value, key).not.toBeUndefined();
			expect(value, key).not.toBeNull();
			expect(String(value).length, key).toBeGreaterThan(0);
		}
	});

	it("the wire keys are derived from the allowlist, not a second hand-written list", () => {
		for (const [, field] of CALLER_ENV_ALLOWLIST) expect(CALLER_WIRE_KEYS).toContain(field);
	});
});

describe("item 7 uses u-report's `line` rather than re-deriving the sentence", () => {
	const row: RsRouteRow = {
		verb: "report",
		leaf: "now",
		rsPath: "/x",
		method: "POST",
		humanOutput: "rs-line",
		why: "t",
	};

	it("prints the payload's own line for a human caller", () => {
		const payload = { line: 'reported by pij-x: "did" -> "next" (spine 42)' };
		expect(renderRsAnswer(row, payload, ["report", "now"])).toEqual({
			kind: "rendered",
			text: 'reported by pij-x: "did" -> "next" (spine 42)',
		});
	});

	it("--json does not silently take rs's `line` shape either", () => {
		expect(renderRsAnswer(row, { line: "x" }, ["report", "now", "--json"]).kind).toBe(
			"json-refused",
		);
	});

	it("a payload with no line still refuses loudly rather than printing JSON", () => {
		expect(renderRsAnswer(row, { a: 1 }, ["report", "now"]).kind).toBe("no-renderer");
	});

	it("a non-string line is not trusted", () => {
		expect(renderRsAnswer(row, { line: { not: "a string" } }, ["report", "now"]).kind).toBe(
			"no-renderer",
		);
	});
});

/** Every path the table points at must be a path rs actually registers.
 *
 *  This exists because the report rows shipped pointing at `/v1/report/now`,
 *  `/v1/report/state` and three siblings — paths rs does not serve. The failure
 *  was invisible by construction: each call 404'd, classified as
 *  not-implemented, fell back to legacy, and produced exactly the behaviour of
 *  a verb wave 2 had not landed yet. Every test passed. Only driving the real
 *  CLI against a real daemon showed it.
 *
 *  Same lesson as the caller-key fixture, one layer up: the two runtimes agree
 *  on a NAME, and nothing but a shared reading of the same source keeps them
 *  agreeing. */
describe("every routed path is a path rs registers", () => {
	const MOD_RS = fileURLToPath(
		new URL("../../../../crates/daemon/src/http/mod.rs", import.meta.url),
	);

	const registeredPaths = (source: string): ReadonlySet<string> => {
		const paths = new Set<string>();
		for (const match of source.matchAll(/Self::\w+\s*=>\s*"(\/v1\/[^"]*|\/health)"/g)) {
			paths.add(match[1] as string);
		}
		if (paths.size === 0) throw new Error("no endpoint paths found — did Endpoint::path move?");
		return paths;
	};

	it("the daemon registers every live routed path", () => {
		const registered = new Set(registeredPaths(readFileSync(MOD_RS, "utf8")));
		const missing = RS_ROUTE_TABLE.filter((row) => !registered.has(row.rsPath)).map((row) => ({
			verb: row.leaf === undefined ? row.verb : `${row.verb} ${row.leaf}`,
			rsPath: row.rsPath,
		}));
		expect(missing).toEqual([]);
	});

	// Positive control — the exact defect this was written for.
	it("catches a path rs does not serve", () => {
		const registered = registeredPaths(readFileSync(MOD_RS, "utf8"));
		expect(registered.has("/v1/report")).toBe(true);
		expect(registered.has("/v1/report/now")).toBe(false);
	});

	it("the five report rows share the one endpoint rs registers", () => {
		const reportRows = RS_ROUTE_TABLE.filter((row) => row.verb === "report");
		expect(reportRows).toHaveLength(5);
		expect([...new Set(reportRows.map((row) => row.rsPath))]).toEqual(["/v1/report"]);
	});
});

/** F-U8 — a routed row that rs SERVES but no human can read.
 *
 *  The shipped table had ZERO renderers, so every routed row carried this
 *  latently and `adopt` was simply the first one anybody typed: rs minted the
 *  seat and PERSISTED IT, and the CLI printed `E-RS: … no human renderer …` and
 *  exited 4. The operator was told it failed; sqlite disagreed. `/pij ready`
 *  tells a seat to verify the WRITE and never the PRINT, so a seat following the
 *  guidance concluded adopt had failed and retried — we shipped the guidance and
 *  then built the surface that punishes obeying it.
 *
 *  A failure line that persisted everything: the exact inverse of the
 *  success-line-that-persists-nothing this plan exists to close.
 *
 *  These tests close the CLASS, not the instance. `humanOutput` is REQUIRED on
 *  every row, so a future row cannot be added without saying how a human reads
 *  it — the latency is what made this dangerous, not the missing function. */
describe("every routed row can be read by a human (F-U8)", () => {
	const human = (verb: string, leaf: string | undefined, payload: unknown) =>
		renderRsAnswer(findRoute(verb, leaf), payload, leaf === undefined ? [verb] : [verb, leaf]);

	it("EVERY routed row declares how a human sees it", () => {
		const undeclared = RS_ROUTE_TABLE.filter(
			(row) => row.humanOutput !== "render" && row.humanOutput !== "rs-line",
		);
		expect(undeclared).toEqual([]);
	});

	it("every row declaring `render` actually carries one", () => {
		const promised = RS_ROUTE_TABLE.filter((row) => row.humanOutput === "render");
		expect(promised.length).toBeGreaterThan(0);
		expect(promised.filter((row) => row.render === undefined)).toEqual([]);
	});

	// The instance. rs adopt returns a SeatDescriptor; a human must get a
	// sentence, and exit 0.
	it("adopt renders instead of refusing — the write and the print now agree", () => {
		const result = human("adopt", undefined, {
			id: "pij-sensitive-kabe",
			harness: "claude",
			pane: "%2099",
			proc: { pid: 4197, proc_start: 20260901130939 },
			folder: "/w",
			state: "idle",
		});
		expect(result.kind).toBe("rendered");
		if (result.kind !== "rendered") throw new Error("unreachable");
		expect(result.text).toContain("adopted pij-sensitive-kabe");
		expect(result.text).toContain("%2099");
		expect(result.text).toContain('pij send pij-sensitive-kabe "<text>"');
	});

	// rs has NO column for the harness session id that TS's bound form prints.
	// Rendering it would mean inventing one, which is the split-brain in
	// miniature — so the renderer must say what rs actually did instead.
	it("adopt does not fabricate the harness session id rs has no column for", () => {
		const result = human("adopt", undefined, {
			id: "pij-x",
			harness: "claude",
			pane: "%1",
			proc: { pid: 7, proc_start: 1 },
		});
		if (result.kind !== "rendered") throw new Error("unreachable");
		expect(result.text).toContain("process identity");
		expect(result.text).not.toMatch(/session\s+[0-9a-f-]{8}/);
	});

	it("a paneless adopt says so rather than printing an empty pane", () => {
		const result = human("adopt", undefined, { id: "pij-x", proc: { pid: 7 } });
		if (result.kind !== "rendered") throw new Error("unreachable");
		expect(result.text).toContain("no pane");
	});

	it("whoami, phonehome and state all render for a human", () => {
		expect(human("whoami", undefined, { id: "pij-x", folder: "/w", state: "working" }).kind).toBe(
			"rendered",
		);
		expect(
			human("phonehome", undefined, { seat: "pij-x", harness: "claude", bound: true }).kind,
		).toBe("rendered");
		expect(
			human("state", undefined, { id: "pij-x", state: "working", liveness: "active" }).kind,
		).toBe("rendered");
	});

	// NOT bound is the answer a seat most needs to act on, so it must say why
	// rather than leaving the seat to guess whether it exists.
	it("an unbound phonehome explains itself", () => {
		const result = human("phonehome", undefined, {
			seat: "pij-x",
			harness: "claude",
			bound: false,
			resolved_by: "asserted seat id (existence checked only)",
		});
		if (result.kind !== "rendered") throw new Error("unreachable");
		expect(result.text).toContain("NOT bound");
		expect(result.text).toContain("asserted seat id");
	});

	it("report rows still take rs's own sentence, not a second copy here", () => {
		const row = findRoute("report", "now");
		expect(row?.humanOutput).toBe("rs-line");
		expect(row?.render).toBeUndefined();
		const result = human("report", "now", { line: 'reported by pij-x: "a" → "b" (spine 9)' });
		expect(result).toEqual({
			kind: "rendered",
			text: 'reported by pij-x: "a" → "b" (spine 9)',
		});
	});

	// The refusal is still correct and must survive: it is the thing that stops
	// a raw blob replacing the CLI's own output. It just must not be reachable
	// from a row rs serves.
	it("the refusal still fires for a row that promises rs-line and gets none", () => {
		const result = human("report", "now", { no: "line here" });
		expect(result.kind).toBe("no-renderer");
	});

	// The replacement for "--json still wins for every row", which asserted the
	// defect as though it were a safety property.
	it("EVERY row declares a projection, refusal or complete-envelope passthrough", () => {
		for (const row of RS_ROUTE_TABLE) {
			expect(["project", "refuse", "passthrough"], `${row.verb} ${row.leaf ?? ""}`).toContain(
				row.jsonOutput,
			);
			if (row.jsonOutput === "project") expect(row.projectJson).toBeDefined();
			if (row.jsonOutput === "refuse") expect(row.jsonRefusal).toBeTruthy();
			const argv = row.leaf === undefined ? [row.verb, "--json"] : [row.verb, row.leaf, "--json"];
			const payload = row.verb === "sessions" ? [] : { rsOnlyKey: "leaked" };
			const result = renderRsAnswer(row, payload, argv);
			if (result.kind === "json") {
				expect(result.text).not.toContain("rsOnlyKey");
			} else {
				expect(result.kind).toBe("json-refused");
			}
		}
	});

	it("whoami names the absent capability gate in its projected machine contract", () => {
		const result = renderRsAnswer(findRoute("whoami", undefined), { id: "x" }, [
			"whoami",
			"--json",
		]);
		if (result.kind !== "json") throw new Error("expected a projected answer");
		expect(JSON.parse(result.text)).toEqual({
			id: "x",
			harness: null,
			pane: null,
			folder: null,
			session: null,
			generation: "rs",
			capabilityGate: "absent",
		});
	});
});

/** Reviewer findings F001, F002, F005 — the three no-fallback paths that were
 *  not paths at all. */
describe("routing faults are named outcomes, never crashes or quiet fallbacks", () => {
	const HEALTH_OK = JSON.stringify({
		ok: true,
		command: "pij ping",
		v: 2,
		data: { status: "healthy", build: "t", offline: false, machine: "t" },
	});

	const probeDeps = (
		handler: (url: string) => Response,
		over: Partial<GenerationRouterDeps> = {},
	): GenerationRouterDeps => ({
		fetch: (async (input: RequestInfo | URL) => handler(String(input))) as unknown as typeof fetch,
		readFile: (async () => "k".repeat(64)) as unknown as GenerationRouterDeps["readFile"],
		env: { PIJ_RS_ADDR: "127.0.0.1:7461", PIJ_RS_STATE_DIR: "/tmp/s" },
		home: "/tmp/home",
		...over,
	});

	// F001. This crashed the CLI: probeRs rethrew, the entrypoint used `void`,
	// and whoami/adopt/report/state died as an unhandled rejection.
	it("a non-pij body is a NAMED outcome, not a thrown error", async () => {
		const { outcome } = await routeVerb(
			"whoami",
			undefined,
			["whoami"],
			probeDeps(() => new Response("<html>proxy error</html>", { status: 200 })),
		);
		expect(outcome.kind).toBe("rs-unreadable");
		expect(servedByLegacy(outcome)).toBe(false);
		expect(describeOutcome(outcome)).toMatch(/cannot read/);
	});

	it("a wire-version skew is the same named outcome", async () => {
		const skewed = JSON.stringify({ ok: true, command: "pij ping", v: 99, data: {} });
		const { outcome } = await routeVerb(
			"whoami",
			undefined,
			["whoami"],
			probeDeps(() => new Response(skewed, { status: 200 })),
		);
		expect(outcome.kind).toBe("rs-unreadable");
		expect(servedByLegacy(outcome)).toBe(false);
	});

	it("probeRs never throws, whatever answers at the addr", async () => {
		for (const body of ["", "<html>", "{", "null"]) {
			await expect(
				probeRs(probeDeps(() => new Response(body, { status: 200 }))),
			).resolves.toBeDefined();
		}
	});

	// F002. A roster we could not read became "rs does not have this seat" —
	// a verified negative nobody verified — and then followed the seat to
	// legacy. Silent re-homing through the guard that exists to prevent it.
	it("an UNREADABLE roster refuses; it does not follow the seat to legacy", async () => {
		const { outcome } = await routeVerb(
			"whoami",
			undefined,
			["whoami"],
			probeDeps(() => new Response(HEALTH_OK, { status: 200 }), {
				ambientSeatId: () => "pij-me",
				seatInRs: () => "unreadable",
				seatInLegacy: () => true,
			}),
		);
		expect(outcome).toMatchObject({ kind: "rs-roster-unreadable", seatId: "pij-me" });
		expect(servedByLegacy(outcome)).toBe(false);
		expect(describeOutcome(outcome)).toMatch(/UNKNOWN/);
	});

	it("a roster we DID read still follows a legacy-resident seat", async () => {
		const { outcome } = await routeVerb(
			"whoami",
			undefined,
			["whoami"],
			probeDeps(() => new Response(HEALTH_OK, { status: 200 }), {
				ambientSeatId: () => "pij-me",
				seatInRs: () => false,
				seatInLegacy: () => true,
			}),
		);
		expect(outcome.kind).toBe("legacy-seat-followed");
	});

	it("unreadable and read-negative are different kinds AND different sentences", async () => {
		const mk = async (seatInRs: boolean | "unreadable") =>
			(
				await routeVerb(
					"whoami",
					undefined,
					["whoami"],
					probeDeps(() => new Response(HEALTH_OK, { status: 200 }), {
						ambientSeatId: () => "pij-me",
						seatInRs: () => seatInRs,
						seatInLegacy: () => true,
					}),
				)
			).outcome;
		const unreadable = await mk("unreadable");
		const negative = await mk(false);
		expect(unreadable.kind).not.toBe(negative.kind);
		expect(describeOutcome(unreadable)).not.toBe(describeOutcome(negative));
	});
});

/** F005 — the paneless `adopt` door, shim side.
 *
 *  Source pins, because the refusal lives at the CLI entry ahead of routing and
 *  cannot be reached through `routeVerb`. Named as pins, not as behavioural
 *  proof; the behavioural proof is the live run recorded in the receipt. */
describe("the shim refuses a direct paneless adopt (F005)", () => {
	it("refuses the direct paneless form", () => {
		expect(isDirectPanelessAdopt("adopt", ["--harness", "claude"])).toBe(true);
	});

	it("allows the pane form", () => {
		expect(isDirectPanelessAdopt("adopt", ["%2116", "--harness", "claude"])).toBe(false);
	});

	// `--current` is the sanctioned paneless form: it aliases to `inbox
	// register`, which is denied from routing and reaches legacy intact.
	// Refusing it here broke that alias — caught by cli.integration.test.ts,
	// which is why the behavioural test matters more than a source pin.
	it("lets `adopt --current` through", () => {
		expect(isDirectPanelessAdopt("adopt", ["--current"])).toBe(false);
		expect(isDirectPanelessAdopt("adopt", ["--current", "--harness", "claude"])).toBe(false);
	});

	it("touches no other verb", () => {
		expect(isDirectPanelessAdopt("whoami", [])).toBe(false);
		expect(isDirectPanelessAdopt("report", ["now", "a", "b"])).toBe(false);
	});

	it("the refusal carries the REASON, not just the grammar", () => {
		// A bare grammar complaint gets "fixed" by relaxing the grammar.
		expect(PANELESS_ADOPT_REFUSAL).toMatch(/dead pid/);
		expect(PANELESS_ADOPT_REFUSAL).toContain("adopt --current");
	});

	it("the entry promise is caught, so no routing fault escapes as a crash", () => {
		const cli = readFileSync(fileURLToPath(new URL("../cli.ts", import.meta.url)), "utf8");
		expect(cli).toMatch(/bootThroughGenerationRouting\(\)\s*\.catch\(/);
		expect(cli).not.toMatch(/void bootThroughGenerationRouting\(\)/);
	});
});

/** F2 — THE ACCEPTANCE POPULATION: a fresh seat that lives ONLY in rs.
 *
 *  This is `pij-literary-bonobo`. It ran `/pij ready`, registered into rs, and
 *  has no legacy record at all — so `ambientSeatId`, which opens the LEGACY
 *  registry, resolves to nothing for it. With only that evidence available,
 *  `requiresSeatInRs` can never be satisfied, `routeVerb` returns
 *  `legacy-seat-not-in-rs`, legacy's sender precheck runs, and the seat gets
 *  E-NOID — the exact failure this unit exists to remove, reproduced by the
 *  guard added to prevent it.
 *
 *  Every test here supplies NO `ambientSeatId`, deliberately. Handing one in is
 *  what masked the defect: it makes the precondition look reachable while the
 *  production call site cannot discover a seat at all.
 */
describe("an rs-only seat can route (F2, plan 119)", () => {
	const RS_ONLY_ENV = {
		PIJ_RS_ADDR: "127.0.0.1:7461",
		PIJ_RS_STATE_DIR: "/tmp/s",
		// No PIJ_SESSION_ID: a hand-started seat has none. A pane is all it has.
		TMUX_PANE: "%2159",
	};

	const rsOnly = (seen: Seen[], over: Partial<GenerationRouterDeps> = {}) =>
		deps(seen, {
			env: RS_ONLY_ENV,
			// The legacy registry knows nothing about this seat — the whole point.
			ambientSeatId: () => undefined,
			seatInLegacy: () => false,
			seatInRs: async () => false,
			rsSeatByPane: async (pane: string) => (pane === "%2159" ? "pij-literary-bonobo" : undefined),
			...over,
		});

	it("send reaches the shim endpoint on pane evidence alone", async () => {
		const seen: Seen[] = [];
		const { outcome } = await routeVerb(
			"send",
			undefined,
			["send", "pij-still-weasel", "hello"],
			rsOnly(seen),
		);
		expect(outcome.kind).toBe("rs");
		expect(seen.at(-1)?.url).toContain("/v1/shim/send");
	});

	it("bare inbox reaches the shim endpoint too", async () => {
		const seen: Seen[] = [];
		const { outcome } = await routeVerb("inbox", undefined, ["inbox"], rsOnly(seen));
		expect(outcome.kind).toBe("rs");
		expect(seen.at(-1)?.url).toContain("/v1/shim/inbox");
	});

	it("the pane is matched, never asserted — no session id is invented", async () => {
		const seen: Seen[] = [];
		await routeVerb("send", undefined, ["send", "x", "hi"], rsOnly(seen));
		const body = JSON.parse(seen.at(-1)?.body ?? "{}") as {
			caller?: Record<string, unknown>;
		};
		// The caller block carries the pane it really has and NOT a session id it
		// does not: minting one for a seat that lacks it is phantom-seat minting.
		expect(body.caller?.tmuxPane).toBe("%2159");
		expect("pijSessionId" in (body.caller ?? {})).toBe(false);
	});

	it("a pane rs does not own stays on legacy", async () => {
		const seen: Seen[] = [];
		const { outcome } = await routeVerb(
			"send",
			undefined,
			["send", "x", "hi"],
			rsOnly(seen, { env: { ...RS_ONLY_ENV, TMUX_PANE: "%9999" } }),
		);
		expect(outcome.kind).toBe("legacy-seat-not-in-rs");
		expect(seen.filter((call) => call.url.includes("/v1/shim/"))).toEqual([]);
	});

	// An unreadable roster is NOT a no. Collapsing them is the verified negative
	// we never verified, and it re-homes a seat on an unknown rather than a fact.
	it("an unreadable rs roster refuses rather than falling back", async () => {
		const seen: Seen[] = [];
		const { outcome } = await routeVerb(
			"send",
			undefined,
			["send", "x", "hi"],
			rsOnly(seen, { rsSeatByPane: async () => "unreadable" as const }),
		);
		expect(outcome.kind).toBe("rs-roster-unreadable");
	});

	// A paneless caller has nothing for the pane lookup to match, so it never
	// routes — which is exactly why `--wait`, whose legitimate users are paneless
	// pull peers, cannot be broken by the bare-inbox row.
	it("a paneless caller never routes, so pull peers keep legacy", async () => {
		const seen: Seen[] = [];
		const { outcome } = await routeVerb(
			"inbox",
			undefined,
			["inbox", "--wait"],
			rsOnly(seen, { env: { PIJ_RS_ADDR: "127.0.0.1:7461", PIJ_RS_STATE_DIR: "/tmp/s" } }),
		);
		expect(outcome.kind).toBe("legacy-seat-not-in-rs");
	});
});

/** F4/F5/F6 — the second review round. */
describe("the routed mailbox finishes, and its lookups tell live from dead (plan 119)", () => {
	const RS_ONLY_ENV = {
		PIJ_RS_ADDR: "127.0.0.1:7461",
		PIJ_RS_STATE_DIR: "/tmp/s",
		TMUX_PANE: "%2159",
	};

	// F5 — a REUSED pane held by an old tombstone must not read as rs-resident.
	// `/v1/seats` lists tombstones (`Registry::list` with no live filter) while
	// the ladder resolves only live rows, so indexing a dead row would make the
	// shim route and rs then refuse a seat it cannot resolve — and an rs refusal
	// never falls back, so legacy never runs and the caller is stuck.
	it("a pane held only by a TOMBSTONED rs row is not rs residency", async () => {
		const seen: Seen[] = [];
		const roster = JSON.stringify({
			ok: true,
			command: "pij seats",
			v: 2,
			data: {
				seats: [
					// Dead, and holding the pane. `tombstoned_at` is
					// skip_serializing_if=Option::is_none, so PRESENT means dead.
					{ id: "pij-old-ghost", pane: "%2159", tombstoned_at: 1788240000 },
				],
			},
		});
		const lookup = rsSeatByPane(
			{ addr: "127.0.0.1:7461", stateDir: "/tmp/s" },
			deps(seen, {
				readFile: (async () => "key") as unknown as GenerationRouterDeps["readFile"],
				fetch: (async () => new Response(roster, { status: 200 })) as unknown as typeof fetch,
			}),
		);
		expect(await lookup("%2159")).toBeUndefined();
	});

	it("a LIVE row holding the pane still is", async () => {
		// The control. Without it, "tombstoned is rejected" could mean the lookup
		// is broken rather than discriminating.
		const seen: Seen[] = [];
		const roster = JSON.stringify({
			ok: true,
			command: "pij seats",
			v: 2,
			data: { seats: [{ id: "pij-alive", pane: "%2159" }] },
		});
		const lookup = rsSeatByPane(
			{ addr: "127.0.0.1:7461", stateDir: "/tmp/s" },
			deps(seen, {
				readFile: (async () => "key") as unknown as GenerationRouterDeps["readFile"],
				fetch: (async () => new Response(roster, { status: 200 })) as unknown as typeof fetch,
			}),
		);
		expect(await lookup("%2159")).toBe("pij-alive");
	});

	// F6 — the diagnostic must agree with the call it explains. `pij generation`
	// is what an operator consults to find out what just happened; one wired to
	// different inputs than the real call lies exactly when it is consulted.
	it("`pij generation` reports rs for an rs-only pane, as the real call does", async () => {
		const shared = {
			env: RS_ONLY_ENV,
			ambientSeatId: () => undefined,
			seatInLegacy: () => false,
			seatInRs: async () => false as const,
			rsSeatByPane: async () => "pij-literary-bonobo",
		};
		const real = await routeVerb("send", undefined, ["send", "x", "hi"], deps([], shared));
		const [diagnostic] = await probeDecisionOnly(["send"], deps([], shared));
		expect(real.outcome.kind).toBe("rs");
		expect(diagnostic?.generation).toBe("rs");
	});

	it("and reports legacy for a pane rs does not hold, also as the real call does", async () => {
		const shared = {
			env: RS_ONLY_ENV,
			ambientSeatId: () => undefined,
			seatInLegacy: () => false,
			seatInRs: async () => false as const,
			rsSeatByPane: async () => undefined,
		};
		const real = await routeVerb("send", undefined, ["send", "x", "hi"], deps([], shared));
		const [diagnostic] = await probeDecisionOnly(["send"], deps([], shared));
		expect(real.outcome.kind).toBe("legacy-seat-not-in-rs");
		expect(diagnostic?.generation).toBe("legacy");
	});

	// F4 — a claim-then-ack row must say how it finishes, and the closure must
	// only exist when there is something to acknowledge.
	it("the mailbox rows declare their acknowledgement path", () => {
		expect(findRoute("inbox", undefined)?.acknowledgePath).toBe("/v1/shim/inbox/ack");
		expect(findRoute("inbox", "check")?.acknowledgePath).toBe("/v1/shim/inbox/ack");
		// `send` is one-step: nothing to finish, so no path.
		expect(findRoute("send", undefined)?.acknowledgePath).toBeUndefined();
	});
});
