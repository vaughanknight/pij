// pij-messaging — pure CLI core specs (Pattern P8: target core/cli.ts vs fakes).
// Covers parseArgs (incl. E-ARG), and dispatch for all six verbs + the workshop
// error codes. F1 (receiver-frames) is asserted explicitly: send delivers RAW.

import { describe, expect, it } from "vitest";
import { FakeDelivery, FakeEventLog, FakeProcess, FakeRegistry } from "../adapters/fakes.js";
import type { CliDeps } from "./cli.js";
import {
	applyWaitReceipt,
	dispatch,
	parseArgs,
	renderWaitReceipt,
	renderWaitTimeout,
} from "./cli.js";
import type { DeliveryPort } from "./ports.js";
import { err, ok, type PijEvent, type PijMessage, type SessionDescriptor } from "./types.js";

const T = Date.parse("2026-06-16T12:00:00.000Z");
const recent = new Date(T - 2000).toISOString();
const old = new Date(T - 120_000).toISOString(); // > STALE_AFTER_MS

function desc(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		role: undefined,
		folder: "/repo",
		dataDir: `/home/.pij/${over.id}`,
		eventsPath: `/home/.pij/${over.id}/events.ndjson`,
		pid: 100,
		startedAt: recent,
		state: "idle",
		lastEventAt: recent,
		...over,
	};
}

function deps(opts: {
	descs?: SessionDescriptor[];
	self?: string;
	cwd?: string;
	alive?: number[];
	logs?: Record<string, PijEvent[]>;
	env?: Record<string, string>;
}): CliDeps & { delivery: FakeDelivery; registry: FakeRegistry } {
	const registry = new FakeRegistry(opts.descs ?? []);
	const delivery = new FakeDelivery();
	const vars = { ...(opts.self ? { PIJ_SESSION_ID: opts.self } : {}), ...(opts.env ?? {}) };
	const process = new FakeProcess(999, T, vars, opts.alive ?? [100]);
	const logMap = new Map<string, FakeEventLog>();
	for (const [id, evs] of Object.entries(opts.logs ?? {})) logMap.set(id, new FakeEventLog(evs));
	return {
		registry,
		delivery,
		process,
		cwd: opts.cwd ?? "/repo",
		pijHome: "/home/.pij",
		eventLogFor: (id) => logMap.get(id) ?? new FakeEventLog([]),
	};
}

function parsed(argv: readonly string[]) {
	const result = parseArgs(argv);
	if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
	return result.value;
}

describe("parseArgs", () => {
	it("parses every verb + flags", () => {
		expect(parseArgs(["whoami", "--json"])).toMatchObject({
			ok: true,
			value: { verb: "whoami", json: true },
		});
		expect(parseArgs(["list", "--here"])).toMatchObject({
			ok: true,
			value: { verb: "list", here: true, prime: false },
		});
		expect(parseArgs(["list", "--prime", "--here", "--json"])).toMatchObject({
			ok: true,
			value: { verb: "list", here: true, prime: true, json: true },
		});
		expect(parseArgs(["send", "w3", "hello"])).toMatchObject({
			ok: true,
			value: { verb: "send", to: "w3", text: "hello" },
		});
		expect(parseArgs(["send", "w3", "--command", "compact"])).toMatchObject({
			ok: true,
			value: { verb: "send", to: "w3", command: "compact" },
		});
		// D-042: a bare "/<allow-listed>" text body auto-routes to the command path
		// (so `pij send w3 "/compact"` executes instead of leaking to the peer's LLM).
		for (const name of ["compact", "reload", "new"]) {
			expect(parseArgs(["send", "w3", `/${name}`])).toMatchObject({
				ok: true,
				value: { verb: "send", to: "w3", command: name, text: undefined },
			});
		}
		expect(parseArgs(["send", "w3", "  /compact  "])).toMatchObject({
			ok: true,
			value: { verb: "send", to: "w3", command: "compact" },
		});
		// only an EXACT bare slash-command is hijacked; everything else stays text
		expect(parseArgs(["send", "w3", "/unknown"])).toMatchObject({
			ok: true,
			value: { verb: "send", to: "w3", text: "/unknown", command: undefined },
		});
		expect(parseArgs(["send", "w3", "/compact please"])).toMatchObject({
			ok: true,
			value: { verb: "send", to: "w3", text: "/compact please", command: undefined },
		});
		expect(
			parseArgs(["tail", "w3", "--since", "5", "--type", "tool_call", "--lines", "10", "--follow"]),
		).toMatchObject({
			ok: true,
			value: { verb: "tail", id: "w3", since: 5, type: "tool_call", lines: 10, follow: true },
		});
		expect(parseArgs(["state", "w3"])).toMatchObject({
			ok: true,
			value: { verb: "state", id: "w3" },
		});
		expect(parseArgs(["path", "w3", "--events"])).toMatchObject({
			ok: true,
			value: { verb: "path", id: "w3", which: "events" },
		});
	});

	it("E-ARG on bad invocation (strict: flags, arity, numerics, text-xor-command)", () => {
		expect(parseArgs([])).toMatchObject({ ok: false, code: "E-ARG" });
		expect(parseArgs(["frobnicate"])).toMatchObject({ ok: false, code: "E-ARG" });
		expect(parseArgs(["send", "w3"])).toMatchObject({ ok: false, code: "E-ARG" }); // no text + no command
		expect(parseArgs(["tail"])).toMatchObject({ ok: false, code: "E-ARG" });
		// unknown flag
		expect(parseArgs(["list", "--bogus"])).toMatchObject({ ok: false, code: "E-ARG" });
		expect(parseArgs(["whoami", "--here"])).toMatchObject({ ok: false, code: "E-ARG" });
		expect(parseArgs(["sessions", "--prime"])).toMatchObject({ ok: false, code: "E-ARG" });
		// extra positionals
		expect(parseArgs(["whoami", "extra"])).toMatchObject({ ok: false, code: "E-ARG" });
		expect(parseArgs(["state", "a", "b"])).toMatchObject({ ok: false, code: "E-ARG" });
		// bad numerics
		expect(parseArgs(["tail", "w3", "--since", "nope"])).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
		expect(parseArgs(["tail", "w3", "--lines", "x"])).toMatchObject({ ok: false, code: "E-ARG" });
		// text AND command are mutually exclusive; --command needs a name
		expect(parseArgs(["send", "w3", "hi", "--command", "compact"])).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
		expect(parseArgs(["send", "w3", "--command"])).toMatchObject({ ok: false, code: "E-ARG" });
		expect(parseArgs(["send", "w3", "hi", "--wait", "nope"])).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
	});

	it.each([
		["--prime=false", "--prime"],
		["--prime=true", "--prime"],
		["--here=false", "--here"],
		["--json=true", "--json"],
	])("rejects valued boolean flag %s", (flag, name) => {
		const result = parseArgs(["list", flag]);
		expect(result).toMatchObject({ ok: false, code: "E-ARG" });
		if (!result.ok) expect(result.message).toContain(`${name} does not take a value`);
	});

	it("--wait carries an optional ms; bare --wait is a boolean", () => {
		expect(parseArgs(["send", "w3", "hi", "--wait", "5000"])).toMatchObject({
			ok: true,
			value: { verb: "send", wait: true, waitMs: 5000 },
		});
		expect(parseArgs(["send", "w3", "hi", "--wait"])).toMatchObject({
			ok: true,
			value: { verb: "send", wait: true },
		});
		expect(parseArgs(["send", "w3", "hi"])).toMatchObject({
			ok: true,
			value: { verb: "send", wait: false },
		});
	});

	it("parses repeatable --to broadcast syntax in target order", () => {
		expect(parseArgs(["send", "--to", "w3", "--to=z9", "same message", "--wait"])).toEqual({
			ok: true,
			value: {
				verb: "send",
				broadcast: true,
				to: "w3",
				targets: ["w3", "z9"],
				text: "same message",
				wait: true,
				waitMs: undefined,
				json: false,
			},
		});
	});

	it("rejects invalid broadcast forms before dispatch", () => {
		for (const argv of [
			["send", "--to", "w3", "same message"],
			["send", "--to", "w3", "--to", "w3", "same message"],
			["send", "w3", "same message", "--to", "z9", "--to", "q2"],
			["send", "--to", "w3", "--to", "z9"],
			["send", "--to=", "--to", "z9", "same message"],
			["send", "--to", "w3", "--to", "z9", "--command", "compact"],
			["send", "--to", "w3", "--to", "z9", "--file", "./a.txt"],
		]) {
			expect(parseArgs(argv)).toMatchObject({ ok: false, code: "E-ARG" });
		}
	});

	it("--file/--caption attach a reference-passing file (Plan 026 Phase 5)", () => {
		expect(parseArgs(["send", "w3", "--file", "./chart.png", "--caption", "done"])).toMatchObject({
			ok: true,
			value: { verb: "send", to: "w3", file: "./chart.png", caption: "done" },
		});
		// a file MAY accompany a text body …
		expect(parseArgs(["send", "w3", "see this", "--file", "./a.pdf"])).toMatchObject({
			ok: true,
			value: { verb: "send", to: "w3", text: "see this", file: "./a.pdf" },
		});
		// … and a file may stand alone (attachment-only — no text, no command).
		// Mutation: drop `file` from the no-payload guard and this flips to E-ARG.
		expect(parseArgs(["send", "w3", "--file", "./a.pdf"])).toMatchObject({
			ok: true,
			value: { verb: "send", to: "w3", file: "./a.pdf", text: undefined, command: undefined },
		});
	});

	it("rejects --caption without --file, a bare --file, and --file with --command", () => {
		expect(parseArgs(["send", "w3", "--caption", "orphan"])).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
		expect(parseArgs(["send", "w3", "hi", "--file"])).toMatchObject({ ok: false, code: "E-ARG" });
		expect(parseArgs(["send", "w3", "--file", "a.png", "--command", "compact"])).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
	});
});

describe("dispatch whoami / list", () => {
	it("whoami resolves self via PIJ_SESSION_ID", () => {
		const d = deps({ self: "a1", descs: [desc({ id: "a1", state: "working" })] });
		const r = dispatch({ verb: "whoami", json: true }, d);
		expect(r.exitCode).toBe(0);
		expect(JSON.parse(r.stdout)).toMatchObject({ id: "a1", state: "working", folder: "/repo" });
	});

	it("whoami E-AMBIG when env unset + multiple local", () => {
		const d = deps({ descs: [desc({ id: "a1" }), desc({ id: "w3" })] });
		expect(dispatch({ verb: "whoami", json: false }, d)).toMatchObject({ exitCode: 2 });
	});

	it("list --here filters to cwd, stars self, reports liveness", () => {
		const d = deps({
			self: "a1",
			descs: [
				desc({ id: "a1", boundModel: "gpt-5.6-sol", effort: "xhigh" }),
				desc({ id: "w3", pid: 200 }),
				desc({ id: "z9", folder: "/other" }),
			],
			alive: [100], // a1 alive; w3 pid200 dead
		});
		const r = dispatch({ verb: "list", here: true, prime: false, json: true }, d);
		const arr = JSON.parse(r.stdout) as Array<{
			id: string;
			liveness: string;
			boundModel: string | null;
			effort: string | null;
			prime: boolean;
		}>;
		expect(arr.map((x) => x.id).sort()).toEqual(["a1", "w3"]); // z9 filtered out
		expect(arr.find((x) => x.id === "a1")?.liveness).toBe("active");
		expect(arr.find((x) => x.id === "a1")).toMatchObject({
			boundModel: "gpt-5.6-sol",
			effort: "xhigh",
		});
		expect(arr.find((x) => x.id === "w3")?.liveness).toBe("dead");
		expect(arr.every((x) => x.prime === false)).toBe(true);
		const human = dispatch({ verb: "list", here: true, prime: false, json: false }, d);
		expect(human.stdout).toContain("★ a1");
		expect(human.stdout).toContain("gpt-5.6-sol");
		expect(human.stdout).toContain("xhigh");
	});

	it("list --prime composes with --here and ordinary output marks prime rows", () => {
		const d = deps({
			self: "a1",
			descs: [
				desc({ id: "a1", prime: true }),
				desc({ id: "w3", prime: false }),
				desc({ id: "legacy" }),
				desc({ id: "elsewhere", folder: "/other", prime: true }),
			],
		});
		const filtered = dispatch({ verb: "list", here: true, prime: true, json: true }, d);
		expect(JSON.parse(filtered.stdout)).toEqual([
			expect.objectContaining({ id: "a1", prime: true }),
		]);

		const allJson = JSON.parse(
			dispatch({ verb: "list", here: false, prime: false, json: true }, d).stdout,
		) as Array<{ id: string; prime: boolean }>;
		expect(allJson.map(({ id, prime }) => ({ id, prime }))).toEqual([
			{ id: "a1", prime: true },
			{ id: "w3", prime: false },
			{ id: "legacy", prime: false },
			{ id: "elsewhere", prime: true },
		]);

		const human = dispatch({ verb: "list", here: true, prime: false, json: false }, d);
		const primeRow = human.stdout.split("\n").find((line) => line.includes("a1"));
		const normalRow = human.stdout.split("\n").find((line) => line.includes("w3"));
		expect(primeRow).toMatch(/a1\s+P\s/);
		expect(normalRow).not.toMatch(/w3\s+P\s/);
	});
});

describe("dispatch send", () => {
	it("text delivers the RAW body (F1: receiver frames — never pre-frame)", () => {
		const d = deps({ self: "a1", descs: [desc({ id: "a1" }), desc({ id: "w3" })] });
		const r = dispatch(
			{ verb: "send", to: "w3", text: "do X then test", wait: false, json: false },
			d,
		);
		expect(r.exitCode).toBe(0);
		expect(d.delivery.outbox).toHaveLength(1);
		expect(d.delivery.outbox[0]?.message).toEqual({ from: "a1", to: "w3", body: "do X then test" });
		// crucially NOT framed:
		expect(d.delivery.outbox[0]?.message.body).not.toContain("[pij from");
	});

	it("--command compact delivers a command message (no pi handle, no body frame)", () => {
		const d = deps({ self: "a1", descs: [desc({ id: "a1" }), desc({ id: "w3" })] });
		const r = dispatch({ verb: "send", to: "w3", command: "compact", wait: false, json: true }, d);
		expect(r.exitCode).toBe(0);
		expect(d.delivery.outbox[0]?.message).toMatchObject({
			from: "a1",
			to: "w3",
			command: "compact",
		});
	});

	it("--file attaches a reference-passing entry; plain text carries NO attachments key", () => {
		const d = deps({ self: "a1", descs: [desc({ id: "a1" }), desc({ id: "w3" })] });
		// attachment-only (empty body) with a caption
		dispatch(
			{ verb: "send", to: "w3", file: "/tmp/chart.png", caption: "done", wait: false, json: false },
			d,
		);
		expect(d.delivery.outbox[0]?.message).toEqual({
			from: "a1",
			to: "w3",
			body: "",
			attachments: [{ path: "/tmp/chart.png", caption: "done" }],
		});
		// a file with no caption omits the caption key …
		dispatch({ verb: "send", to: "w3", file: "/tmp/a.pdf", wait: false, json: false }, d);
		expect(d.delivery.outbox[1]?.message).toEqual({
			from: "a1",
			to: "w3",
			body: "",
			attachments: [{ path: "/tmp/a.pdf" }],
		});
		// … and a plain text send is byte-for-byte unchanged (no attachments key at all).
		// Mutation: always set `attachments` and this toEqual flips RED.
		dispatch({ verb: "send", to: "w3", text: "just text", wait: false, json: false }, d);
		expect(d.delivery.outbox[2]?.message).toEqual({ from: "a1", to: "w3", body: "just text" });
	});

	it("queued vs delivered receipt hint follows the pi peer's state", () => {
		const busy = deps({
			self: "a1",
			descs: [desc({ id: "a1" }), desc({ id: "w3", state: "working" })],
		});

		expect(
			JSON.parse(
				dispatch({ verb: "send", to: "w3", text: "x", wait: false, json: true }, busy).stdout,
			).receipt,
		).toBe("queued");
		const idle = deps({
			self: "a1",
			descs: [desc({ id: "a1" }), desc({ id: "w3", state: "idle" })],
		});
		expect(
			JSON.parse(
				dispatch({ verb: "send", to: "w3", text: "x", wait: false, json: true }, idle).stdout,
			).receipt,
		).toBe("delivered");
	});

	it("busy control-plane peers with a fresh tick wait for the daemon's authoritative receipt", () => {
		const busy = deps({
			self: "a1",
			descs: [
				desc({ id: "a1" }),
				desc({
					id: "w3",
					harness: "copilot",
					state: "working",
					lastTickAt: new Date(T - 1000).toISOString(),
				}),
			],
		});
		const result = dispatch({ verb: "send", to: "w3", text: "x", wait: false, json: true }, busy);
		expect(JSON.parse(result.stdout)).toMatchObject({
			receipt: "queued",
			daemonLastTickAt: new Date(T - 1000).toISOString(),
			daemonTickAgeMs: 1000,
			daemonTickStale: false,
		});
	});

	it("marks a queued receipt as daemon-stale when the daemon tick is wedged", () => {
		const wedged = deps({
			self: "a1",
			descs: [
				desc({ id: "a1" }),
				desc({
					id: "w3",
					harness: "claude",
					state: "idle",
					lastTickAt: new Date(T - 10_000).toISOString(),
				}),
			],
		});
		const json = dispatch({ verb: "send", to: "w3", text: "x", wait: false, json: true }, wedged);
		expect(JSON.parse(json.stdout)).toMatchObject({
			receipt: "queued",
			daemonTickAgeMs: 10_000,
			daemonTickStale: true,
		});
		const human = dispatch({ verb: "send", to: "w3", text: "x", wait: false, json: false }, wedged);
		expect(human.stdout).toContain("daemon tick stale");
	});

	it("codes: E-SELF, E-NOID, E-CMD, E-DEAD; stale warns + sends", () => {
		const base = [desc({ id: "a1" })];
		expect(
			dispatch(
				{ verb: "send", to: "a1", text: "x", wait: false, json: false },
				deps({ self: "a1", descs: base }),
			).exitCode,
		).toBe(2); // E-SELF
		expect(
			dispatch(
				{ verb: "send", to: "ghost", text: "x", wait: false, json: false },
				deps({ self: "a1", descs: base }),
			).exitCode,
		).toBe(2); // E-NOID
		expect(
			dispatch(
				{ verb: "send", to: "w3", command: "rm-rf", wait: false, json: false },
				deps({ self: "a1", descs: [...base, desc({ id: "w3" })] }),
			).exitCode,
		).toBe(2); // E-CMD
		const deadDeps = deps({
			self: "a1",
			descs: [...base, desc({ id: "w3", pid: 777 })],
			alive: [100],
		});
		expect(
			dispatch({ verb: "send", to: "w3", text: "x", wait: false, json: false }, deadDeps).exitCode,
		).toBe(1); // E-DEAD
		const staleDeps = deps({
			self: "a1",
			descs: [...base, desc({ id: "w3", lastEventAt: old })],
			alive: [100],
		});
		const staleR = dispatch(
			{ verb: "send", to: "w3", text: "x", wait: false, json: false },
			staleDeps,
		);
		expect(staleR.exitCode).toBe(0);
		// Stale peer (no recent pij events — normal for control-plane) still gets a
		// note and the send lands; wording reworded to read as idle, not alarming.
		expect(staleR.stdout.toLowerCase()).toContain("no recent pij events");
	});

	it("fans one raw body out in target order with independent results", () => {
		const d = deps({
			self: "a1",
			descs: [
				desc({ id: "a1" }),
				desc({ id: "w3" }),
				desc({
					id: "z9",
					harness: "copilot",
					lifecycle: "bound",
					lastTickAt: new Date(T - 1000).toISOString(),
				}),
			],
		});
		const result = dispatch(
			parsed(["send", "--to", "w3", "--to", "z9", "same message", "--json"]),
			d,
		);

		expect(result.exitCode).toBe(0);
		expect(d.delivery.outbox.map(({ message }) => message)).toEqual([
			{ from: "a1", to: "w3", body: "same message" },
			{ from: "a1", to: "z9", body: "same message" },
		]);
		expect(JSON.parse(result.stdout)).toEqual({
			from: "a1",
			results: [
				{
					to: "w3",
					messageId: "fake-1",
					kind: "text",
					receipt: "delivered",
					liveness: "active",
				},
				{
					to: "z9",
					messageId: "fake-2",
					kind: "text",
					receipt: "queued",
					liveness: "active",
					daemonLastTickAt: new Date(T - 1000).toISOString(),
					daemonTickAgeMs: 1000,
					daemonTickStale: false,
				},
			],
		});
	});

	it("preflights every broadcast target before the first delivery", () => {
		for (const invalid of [
			{
				id: "a1",
				descs: [desc({ id: "a1" }), desc({ id: "w3" })],
				code: "E-SELF",
			},
			{
				id: "missing",
				descs: [desc({ id: "a1" }), desc({ id: "w3" })],
				code: "E-NOID",
			},
			{
				id: "dead",
				descs: [desc({ id: "a1" }), desc({ id: "w3" }), desc({ id: "dead", pid: 777 })],
				code: "E-DEAD",
			},
			{
				id: "closed",
				descs: [
					desc({ id: "a1" }),
					desc({ id: "w3" }),
					desc({ id: "closed", lifecycle: "dissolved" }),
				],
				code: "E-DEAD",
			},
		]) {
			const d = deps({ self: "a1", descs: invalid.descs });
			const result = dispatch(
				parsed(["send", "--to", "w3", "--to", invalid.id, "same message"]),
				d,
			);

			expect(result).toMatchObject({ exitCode: invalid.code === "E-DEAD" ? 1 : 2 });
			expect(result.stderr).toContain(invalid.code);
			expect(d.delivery.outbox).toHaveLength(0);
		}
	});

	it("prints one human result row per broadcast target", () => {
		const d = deps({
			self: "a1",
			descs: [desc({ id: "a1" }), desc({ id: "w3" }), desc({ id: "z9", state: "working" })],
		});
		const result = dispatch(parsed(["send", "--to", "w3", "--to", "z9", "same message"]), d);

		expect(result.exitCode).toBe(0);
		expect(result.stdout.split("\n")).toEqual([
			expect.stringContaining("sent → w3"),
			expect.stringContaining("sent → z9"),
		]);
		expect(result.stdout).toContain("delivered");
		expect(result.stdout).toContain("queued");
	});

	it("reports a delivery failure but continues later broadcast targets", () => {
		const attempted: string[] = [];
		const delivery: DeliveryPort = {
			deliver(message: PijMessage) {
				attempted.push(message.to);
				return message.to === "w3"
					? err("E-DEAD", "w3 delivery failed")
					: ok({ messageId: "delivered-z9" });
			},
		};
		const base = deps({
			self: "a1",
			descs: [desc({ id: "a1" }), desc({ id: "w3" }), desc({ id: "z9" })],
		});
		const result = dispatch(
			parsed(["send", "--to", "w3", "--to", "z9", "same message", "--json", "--wait"]),
			{ ...base, delivery },
		);

		expect(attempted).toEqual(["w3", "z9"]);
		expect(result.exitCode).toBe(1);
		expect(JSON.parse(result.stdout)).toEqual({
			from: "a1",
			results: [
				{ to: "w3", error: "E-DEAD", message: "w3 delivery failed" },
				{
					to: "z9",
					messageId: "delivered-z9",
					kind: "text",
					receipt: "delivered",
					liveness: "active",
				},
			],
		});
		expect(result.follow).toEqual({
			kind: "wait",
			self: "a1",
			targets: [{ to: "z9", messageId: "delivered-z9" }],
			timeoutMs: undefined,
			exitCode: 1,
		});
	});

	it("returns every successful target/message pair to the wait loop", () => {
		const d = deps({
			self: "a1",
			descs: [desc({ id: "a1" }), desc({ id: "w3" }), desc({ id: "z9" })],
		});
		const result = dispatch(
			parsed(["send", "--to", "w3", "--to", "z9", "same message", "--wait"]),
			d,
		);

		expect(result.follow).toEqual({
			kind: "wait",
			self: "a1",
			targets: [
				{ to: "w3", messageId: "fake-1" },
				{ to: "z9", messageId: "fake-2" },
			],
			timeoutMs: undefined,
			exitCode: 0,
		});
	});

	it("keeps waiting until every correlated message reaches a terminal receipt", () => {
		const targets = [
			{ to: "w3", messageId: "m1" },
			{ to: "z9", messageId: "m2" },
		];

		expect(applyWaitReceipt(targets, { messageId: "other", state: "delivered" })).toEqual({
			pending: targets,
		});
		expect(applyWaitReceipt(targets, { messageId: "m1", state: "queued" })).toEqual({
			target: targets[0],
			pending: targets,
		});
		const firstDone = applyWaitReceipt(targets, { messageId: "m1", state: "delivered" });
		expect(firstDone).toEqual({ target: targets[0], pending: [targets[1]] });
		expect(applyWaitReceipt(firstDone.pending, { messageId: "m2", state: "unverified" })).toEqual({
			target: targets[1],
			pending: [],
		});
	});

	it("prefixes broadcast receipt changes while preserving legacy single-target text", () => {
		const targets = [
			{ to: "w3", messageId: "m1" },
			{ to: "z9", messageId: "m2" },
		];

		expect(renderWaitReceipt("w3", "delivered", false)).toBe("receipt → delivered");
		expect(renderWaitTimeout(targets.slice(0, 1), false)).toBe(
			"receipt → (timeout; check `pij tail` later)",
		);
		expect(renderWaitReceipt("w3", "queued", true)).toBe("receipt w3 → queued");
		expect(renderWaitTimeout(targets, true)).toBe(
			"receipt → (timeout; unresolved: w3, z9; check `pij tail` later)",
		);
	});
});

describe("dispatch tail / state / path", () => {
	const evs: PijEvent[] = [
		{
			seq: 4,
			timestamp: new Date(T - 30_000).toISOString(),
			type: "tool_call",
			data: { name: "ctx_read" },
		},
		{ seq: 5, timestamp: new Date(T - 1000).toISOString(), type: "message", data: { body: "hi" } },
	];

	it("tail --since filters and emits a copy-paste trailer", () => {
		const d = deps({ descs: [desc({ id: "w3" })], logs: { w3: evs } });
		const r = dispatch({ verb: "tail", id: "w3", since: 4, follow: false, json: false }, d);
		expect(r.stdout).toContain("5");
		expect(r.stdout).not.toMatch(/\b4 .*ctx_read/); // seq 4 excluded by --since 4
		expect(r.stdout).toContain("next: --since 5");
	});

	it("tail --json returns raw events; --follow sets the follow hint", () => {
		const d = deps({ descs: [desc({ id: "w3" })], logs: { w3: evs } });
		const r = dispatch({ verb: "tail", id: "w3", follow: true, json: true }, d);
		expect(JSON.parse(r.stdout)).toHaveLength(2);
		expect(r.follow).toMatchObject({ kind: "tail", id: "w3", nextSince: 5 });
	});

	it("state reports state + liveness + age; stall = working + stale", () => {
		const d = deps({
			descs: [
				desc({
					id: "w3",
					state: "working",
					lastEventAt: old,
					lastTickAt: new Date(T - 10_000).toISOString(),
					boundModel: "gpt-5.6-sol",
					effort: "xhigh",
				}),
			],
			alive: [100],
		});
		const r = dispatch({ verb: "state", id: "w3", json: true }, d);
		const j = JSON.parse(r.stdout);
		expect(j).toMatchObject({ id: "w3", state: "working", liveness: "stale", pid: 100 });
		// cwd + harness are first-class so a colleague's working dir is readable
		// without scraping the tmux footer (feedback #4).
		expect(j).toHaveProperty("cwd");
		expect(j).toHaveProperty("harness");
		expect(j).toMatchObject({
			boundModel: "gpt-5.6-sol",
			effort: "xhigh",
			daemonLastTickAt: new Date(T - 10_000).toISOString(),
			daemonTickAgeMs: 10_000,
			daemonTickStale: true,
		});
		// working|idle|done activity for the orchestrator (feedback round 3).
		expect(j.activity).toBe("working"); // state:working → working
		const human = dispatch({ verb: "state", id: "w3", json: false }, d);
		expect(human.stdout).toContain("model: gpt-5.6-sol");
		expect(human.stdout).toContain("effort: xhigh");
		expect(human.stdout).toContain("daemon tick: stale");
	});

	it("path prints events/state/dir", () => {
		const d = deps({ descs: [desc({ id: "w3" })] });
		expect(dispatch({ verb: "path", id: "w3", which: "events", json: false }, d).stdout).toBe(
			"/home/.pij/w3/events.ndjson",
		);
		expect(dispatch({ verb: "path", id: "w3", which: "state", json: false }, d).stdout).toBe(
			"/home/.pij/w3.json",
		);
		expect(dispatch({ verb: "path", id: "w3", which: "dir", json: false }, d).stdout).toBe(
			"/home/.pij/w3",
		);
	});

	it("state reports dissolved distinctly from a dead process", () => {
		const d = deps({
			descs: [desc({ id: "w3", lifecycle: "dissolved", pid: 777, paneId: "%7" })],
			alive: [],
		});
		const json = dispatch({ verb: "state", id: "w3", json: true }, d);
		expect(JSON.parse(json.stdout)).toMatchObject({
			id: "w3",
			lifecycle: "dissolved",
			liveness: "dissolved",
		});
		const human = dispatch({ verb: "state", id: "w3", json: false }, d);
		expect(human.stdout).toContain("dissolved");
		expect(human.stdout).not.toContain("· dead");
	});

	it("tail/state E-NOID for an unknown id", () => {
		const d = deps({ descs: [] });
		expect(dispatch({ verb: "tail", id: "ghost", follow: false, json: false }, d).exitCode).toBe(2);
		expect(dispatch({ verb: "state", id: "ghost", json: false }, d).exitCode).toBe(2);
	});
});

describe("parseArgs phonehome", () => {
	it("parses bare phonehome + --json, rejects positionals/unknown flags", () => {
		expect(parseArgs(["phonehome"])).toMatchObject({ ok: true, value: { verb: "phonehome" } });
		expect(parseArgs(["phonehome", "--json"])).toMatchObject({
			ok: true,
			value: { verb: "phonehome", json: true },
		});
		expect(parseArgs(["phonehome", "extra"])).toMatchObject({ ok: false, code: "E-ARG" });
		expect(parseArgs(["phonehome", "--here"])).toMatchObject({ ok: false, code: "E-ARG" });
	});
});

describe("dispatch phonehome (confirmatory binding, AC-03)", () => {
	it("binds self's harnessSessionId from CLAUDE_CODE_SESSION_ID and persists it", () => {
		const d = deps({
			descs: [desc({ id: "pij-w", harness: "claude", lifecycle: "pending" })],
			self: "pij-w",
			env: { CLAUDE_CODE_SESSION_ID: "claude-abc" },
		});
		const r = dispatch({ verb: "phonehome", json: true }, d);
		const j = JSON.parse(r.stdout);
		expect(j).toMatchObject({
			id: "pij-w",
			harness: "claude",
			harnessSessionId: "claude-abc",
			lifecycle: "bound",
			confirmed: true,
		});
		// persisted to the registry (the daemon's index-state rebuild reads this)
		expect(d.registry.read("pij-w")?.harnessSessionId).toBe("claude-abc");
		expect(d.registry.read("pij-w")?.lifecycle).toBe("bound");
	});

	it("is idempotent — re-running with the same id confirms without re-writing a change", () => {
		const d = deps({
			descs: [
				desc({
					id: "pij-w",
					harness: "claude",
					harnessSessionId: "claude-abc",
					lifecycle: "bound",
				}),
			],
			self: "pij-w",
			env: { CLAUDE_CODE_SESSION_ID: "claude-abc" },
		});
		const r = dispatch({ verb: "phonehome", json: true }, d);
		expect(JSON.parse(r.stdout)).toMatchObject({ harnessSessionId: "claude-abc", confirmed: true });
	});

	it("binds a pending Copilot peer from COPILOT_AGENT_SESSION_ID, never the Claude variable", () => {
		const copilotId = "df4f1111-2222-4333-8444-555555555555";
		const d = deps({
			descs: [desc({ id: "pij-copilot", harness: "copilot", lifecycle: "pending" })],
			self: "pij-copilot",
			env: {
				COPILOT_AGENT_SESSION_ID: copilotId,
				CLAUDE_CODE_SESSION_ID: "claude-wrong",
			},
		});
		const r = dispatch({ verb: "phonehome", json: true }, d);
		expect(JSON.parse(r.stdout)).toMatchObject({
			id: "pij-copilot",
			harness: "copilot",
			harnessSessionId: copilotId,
			lifecycle: "bound",
			confirmed: true,
		});
		expect(d.registry.read("pij-copilot")?.harnessSessionId).toBe(copilotId);
	});

	it("without CLAUDE_CODE_SESSION_ID, confirms self but reports no binding yet", () => {
		const d = deps({
			descs: [desc({ id: "pij-w", harness: "claude", lifecycle: "pending" })],
			self: "pij-w",
		});
		const r = dispatch({ verb: "phonehome", json: true }, d);
		expect(JSON.parse(r.stdout)).toMatchObject({ harnessSessionId: null, confirmed: false });
	});

	it("E-NOID when self resolves to no descriptor", () => {
		const d = deps({ descs: [], self: "ghost" });
		expect(dispatch({ verb: "phonehome", json: false }, d).exitCode).toBe(2);
	});
});
