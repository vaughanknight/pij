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
		// Stale peer (no recent pij events — normal for control-plane) still gets a
		// note and the send lands; wording reworded to read as idle, not alarming.
		expect(staleR.stdout.toLowerCase()).toContain("no recent pij events");
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
