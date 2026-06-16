// pij-messaging — pure CLI core specs (Pattern P8: target core/cli.ts vs fakes).
// Covers parseArgs (incl. E-ARG), and dispatch for all six verbs + the workshop
// error codes. F1 (receiver-frames) is asserted explicitly: send delivers RAW.

import { describe, expect, it } from "vitest";
import { FakeDelivery, FakeEventLog, FakeProcess, FakeRegistry } from "../adapters/fakes.js";
import type { CliDeps } from "./cli.js";
import { dispatch, parseArgs } from "./cli.js";
import type { PijEvent, SessionDescriptor } from "./types.js";

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
}): CliDeps & { delivery: FakeDelivery; registry: FakeRegistry } {
	const registry = new FakeRegistry(opts.descs ?? []);
	const delivery = new FakeDelivery();
	const vars = opts.self ? { PIJ_SESSION_ID: opts.self } : {};
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

describe("parseArgs", () => {
	it("parses every verb + flags", () => {
		expect(parseArgs(["whoami", "--json"])).toMatchObject({
			ok: true,
			value: { verb: "whoami", json: true },
		});
		expect(parseArgs(["list", "--here"])).toMatchObject({
			ok: true,
			value: { verb: "list", here: true },
		});
		expect(parseArgs(["send", "w3", "hello"])).toMatchObject({
			ok: true,
			value: { verb: "send", to: "w3", text: "hello" },
		});
		expect(parseArgs(["send", "w3", "--command", "compact"])).toMatchObject({
			ok: true,
			value: { verb: "send", to: "w3", command: "compact" },
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

	it("E-ARG on bad invocation", () => {
		expect(parseArgs([])).toMatchObject({ ok: false, code: "E-ARG" });
		expect(parseArgs(["frobnicate"])).toMatchObject({ ok: false, code: "E-ARG" });
		expect(parseArgs(["send", "w3"])).toMatchObject({ ok: false, code: "E-ARG" }); // no text + no command
		expect(parseArgs(["tail"])).toMatchObject({ ok: false, code: "E-ARG" });
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
				desc({ id: "a1" }),
				desc({ id: "w3", pid: 200 }),
				desc({ id: "z9", folder: "/other" }),
			],
			alive: [100], // a1 alive; w3 pid200 dead
		});
		const r = dispatch({ verb: "list", here: true, json: true }, d);
		const arr = JSON.parse(r.stdout) as Array<{ id: string; liveness: string }>;
		expect(arr.map((x) => x.id).sort()).toEqual(["a1", "w3"]); // z9 filtered out
		expect(arr.find((x) => x.id === "a1")?.liveness).toBe("active");
		expect(arr.find((x) => x.id === "w3")?.liveness).toBe("dead");
		const human = dispatch({ verb: "list", here: true, json: false }, d);
		expect(human.stdout).toContain("★ a1");
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

	it("queued vs delivered receipt hint follows the peer's state", () => {
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
		expect(staleR.stdout.toLowerCase()).toContain("stale");
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
			descs: [desc({ id: "w3", state: "working", lastEventAt: old })],
			alive: [100],
		});
		const r = dispatch({ verb: "state", id: "w3", json: true }, d);
		const j = JSON.parse(r.stdout);
		expect(j).toMatchObject({ id: "w3", state: "working", liveness: "stale", pid: 100 });
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

	it("tail/state E-NOID for an unknown id", () => {
		const d = deps({ descs: [] });
		expect(dispatch({ verb: "tail", id: "ghost", follow: false, json: false }, d).exitCode).toBe(2);
		expect(dispatch({ verb: "state", id: "ghost", json: false }, d).exitCode).toBe(2);
	});
});
