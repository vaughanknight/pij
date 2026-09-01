import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	buildCallerContext,
	CALLER_ENV_ALLOWLIST,
	CALLER_WIRE_KEYS,
	describeOutcome,
	findRoute,
	NEVER_ROUTED,
	RS_ROUTE_TABLE,
	type RsRouteRow,
	renderRsAnswer,
	subjectSeatFromArgv,
} from "../core/generation-routing.js";
import { type GenerationRouterDeps, probeDecisionOnly, routeVerb } from "./generation-router.js";

const KEY = "k".repeat(64);
const HEALTH = JSON.stringify({
	ok: true,
	command: "pij ping",
	v: 1,
	data: { status: "healthy", build: "t", offline: false, machine: "t" },
});
const OK = JSON.stringify({ ok: true, command: "pij x", v: 1, data: {} });

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

	// F-U6: a tmux pane id starts with `%`, the percent-encoding sigil, so
	// `?pane=%77` decodes to `pane=w` and silently looks up a pane nobody has.
	// Keeping every row a POST puts the pane in a JSON body where no such
	// decoding happens, and retires that whole class of bug rather than
	// escaping around it.
	it("EVERY row is a POST — no GET row survives to need percent-encoding", () => {
		expect(RS_ROUTE_TABLE.filter((row) => row.method !== "POST")).toEqual([]);
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
		const why = NEVER_ROUTED.find((entry) => entry.verb === "inbox")?.why ?? "";
		expect(why).toContain("BIND EVIDENCE");
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
				why: "someone re-added it",
			},
		]);
		expect(outcome.kind).toBe("legacy-denied");
		expect(seen).toEqual([]);
	});

	it("no route-table row reaches rs for it", () => {
		expect(findRoute("inbox", "register")).toBeUndefined();
		expect(findRoute("inbox", undefined)).toBeUndefined();
	});
});

describe("report is five leaf rows, and `verify` is not one of them (finding 6)", () => {
	it("routes the five shapes rs can honour", () => {
		for (const leaf of ["now", "state", "blocked", "clear", "question"]) {
			expect(findRoute("report", leaf)?.rsPath).toBe(`/v1/report/${leaf}`);
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
	const bare: RsRouteRow = { verb: "report", leaf: "now", rsPath: "/x", method: "POST", why: "t" };

	it("--json gets JSON", () => {
		expect(renderRsAnswer(bare, { a: 1 }, ["report", "now", "--json"])).toEqual({
			kind: "json",
			text: '{"a":1}',
		});
	});

	it("a human gets the row's rendering", () => {
		const withRender: RsRouteRow = { ...bare, render: () => "reported by pij-x" };
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

	// Positive control: without it, "all three found" could mean the scanner is
	// broken rather than the deps are there.
	it("the scan notices when one goes missing", () => {
		expect(
			wiredDeps("function routingDeps() { return { ambientSeatId: x, seatInLegacy: y }; }"),
		).toEqual(["ambientSeatId", "seatInLegacy"]);
	});

	it("the routed call site passes those deps rather than defaulting", () => {
		const source = readFileSync(CLI, "utf8");
		expect(source).toMatch(
			/routeVerb\(\s*verb,\s*leaf,\s*process\.argv\.slice\(2\),\s*routingDeps\(\)/,
		);
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

/** Item 8 — the cross-runtime literal seam.
 *
 *  The TS writer emits caller keys; a Rust handler reads them by literal. The
 *  agreement is held together by two files happening to match, and a rename on
 *  either side presents as a GREEN SUITE ON BOTH plus a fleet that silently
 *  stops being attributable. PIJ_SPAWN_ID cost this repo the same way.
 *
 *  LIMITATION, named rather than left to be discovered: arm C is DORMANT on this
 *  branch. No Rust reader of these keys exists yet (u-report is not merged), so
 *  it passes vacuously today and only bites once a reader lands. Arm D exists so
 *  the scanner itself is not taken on trust, and the PM must confirm at
 *  composition that arm C went live. */
describe("cross-runtime caller-key seam (item 8)", () => {
	const CRATES = fileURLToPath(new URL("../../../../crates", import.meta.url));

	const rustSources = (): readonly { path: string; text: string }[] => {
		const out: { path: string; text: string }[] = [];
		const walk = (dir: string): void => {
			let entries: import("node:fs").Dirent[];
			try {
				entries = readdirSync(dir, { withFileTypes: true });
			} catch {
				return;
			}
			for (const entry of entries) {
				const full = join(dir, entry.name);
				if (entry.isDirectory()) {
					if (entry.name !== "target") walk(full);
				} else if (entry.name.endsWith(".rs")) {
					out.push({ path: full, text: readFileSync(full, "utf8") });
				}
			}
		};
		walk(CRATES);
		return out;
	};

	/** Which keys actually IDENTIFY a caller-block reader — measured, not
	 *  assumed. Counting `"<key>"` across crates/*.rs today:
	 *      pid 5 · cwd 2 · procStart 1 (claude_bind.rs) · the other six 0.
	 *  So the process-shaped keys are ordinary spellings this repo already uses
	 *  elsewhere; keying the scan on them flagged six unrelated files, then one.
	 *  Only the six identity keys are unique to this block. */
	const SHARED_SPELLINGS = ["cwd", "pid", "procStart"];
	const DISTINCTIVE = CALLER_WIRE_KEYS.filter((key) => !SHARED_SPELLINGS.includes(key));

	/** A Rust file that reads any DISTINCTIVE caller key must read ALL the wire
	 *  keys. A file naming a strict subset is a half-renamed reader — the drift
	 *  this whole guard exists for. */
	const partialReaders = (
		sources: readonly { path: string; text: string }[],
		keys: readonly string[],
	): readonly { path: string; missing: readonly string[] }[] =>
		sources
			.map(({ path, text }) => ({
				path,
				distinctive: DISTINCTIVE.filter((key) => text.includes(`"${key}"`)),
				missing: keys.filter((key) => !text.includes(`"${key}"`)),
			}))
			.filter((row) => row.distinctive.length > 0 && row.missing.length > 0)
			.map(({ path, missing }) => ({ path, missing }));

	// Arm A — always live. The wire really carries these names.
	it("the body on the wire carries exactly the wire keys", async () => {
		const seen: Seen[] = [];
		await routeVerb(
			"whoami",
			undefined,
			["whoami"],
			deps(seen, {
				env: {
					...CALLER_ENV,
					PIJ_PARENT_ID: "pij-parent",
					COPILOT_AGENT_SESSION_ID: "c-1",
					CODEX_THREAD_ID: "t-1",
				},
				cwd: () => "/w",
				pid: () => 7,
				procStart: () => 20260901120000,
			}),
		);
		const body = JSON.parse(seen[0]?.body ?? "{}") as { caller?: Record<string, unknown> };
		expect(Object.keys(body.caller ?? {}).sort()).toEqual([...CALLER_WIRE_KEYS].sort());
	});

	// Arm B — always live. ONE TS-side copy of the spelling, not two.
	it("the wire keys are derived from the allowlist, not a second hand-written list", () => {
		for (const [, field] of CALLER_ENV_ALLOWLIST) expect(CALLER_WIRE_KEYS).toContain(field);
		expect(CALLER_WIRE_KEYS).toEqual([
			"pijSessionId",
			"tmuxPane",
			"pijParentId",
			"claudeCodeSessionId",
			"copilotAgentSessionId",
			"codexThreadId",
			"cwd",
			"pid",
			"procStart",
		]);
	});

	// Arm C — dormant until a Rust reader lands, then load-bearing.
	it("no Rust reader names a STRICT SUBSET of the wire keys", () => {
		expect(partialReaders(rustSources(), CALLER_WIRE_KEYS)).toEqual([]);
	});

	// Arm D — positive control, so arm C's silence is provably "nothing is
	// wrong" rather than "the scanner cannot see".
	it("a file using only a SHARED spelling is not mistaken for a reader", () => {
		// claude_bind.rs uses "procStart" for its own purposes and is not a
		// caller-block reader. Flagging it would train the next person to
		// ignore this test.
		expect(
			partialReaders([{ path: "/fake/unrelated.rs", text: 'j["procStart"]' }], CALLER_WIRE_KEYS),
		).toEqual([]);
	});

	it("the scan catches a half-renamed reader", () => {
		const halfRenamed = [
			{
				path: "/fake/report.rs",
				text: 'let id = caller.get("pijSessionId"); let pane = caller.get("tmux_pane");',
			},
		];
		const found = partialReaders(halfRenamed, CALLER_WIRE_KEYS);
		expect(found).toHaveLength(1);
		expect(found[0]?.missing).toContain("tmuxPane");
	});

	it("and passes a reader that names them all", () => {
		const text = CALLER_WIRE_KEYS.map((key) => `caller.get("${key}")`).join(";");
		expect(partialReaders([{ path: "/fake/ok.rs", text }], CALLER_WIRE_KEYS)).toEqual([]);
	});
});

describe("item 7 uses u-report's `line` rather than re-deriving the sentence", () => {
	const row: RsRouteRow = { verb: "report", leaf: "now", rsPath: "/x", method: "POST", why: "t" };

	it("prints the payload's own line for a human caller", () => {
		const payload = { line: 'reported by pij-x: "did" -> "next" (spine 42)' };
		expect(renderRsAnswer(row, payload, ["report", "now"])).toEqual({
			kind: "rendered",
			text: 'reported by pij-x: "did" -> "next" (spine 42)',
		});
	});

	it("--json still wins over it", () => {
		expect(renderRsAnswer(row, { line: "x" }, ["report", "now", "--json"]).kind).toBe("json");
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
