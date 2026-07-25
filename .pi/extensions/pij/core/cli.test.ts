// pij-messaging — pure CLI core specs (Pattern P8: target core/cli.ts vs fakes).
// Covers parseArgs (incl. E-ARG), and dispatch for all six verbs + the workshop
// error codes. F1 (receiver-frames) is asserted explicitly: send delivers RAW.

import { describe, expect, it } from "vitest";
import {
	FakeAssignmentStore,
	FakeDelivery,
	FakeEventLog,
	FakeProcess,
	FakeProjectStore,
	FakeRegistry,
	FakeSpineLog,
} from "../adapters/fakes.js";
import type { CliDeps, CliResult } from "./cli.js";
import {
	applyWaitReceipt,
	applyWaitReceiptSources,
	dispatch,
	finalizeCanary,
	parseArgs,
	renderDispatchWaitTimeout,
	renderWaitReceipt,
	renderWaitTimeout,
} from "./cli.js";
import { parseBriefAckBody, parseReceiptBody, receiptBody } from "./message.js";
import { PROJECT_SLUG_MAX_LENGTH, type Project, type SpineEvent } from "./platform/types.js";
import type { DeliveryPort } from "./ports.js";
import {
	err,
	ok,
	type PijEvent,
	type PijMessage,
	type ReceiptState,
	type Result,
	type SessionDescriptor,
} from "./types.js";

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
	treeDescs?: SessionDescriptor[];
	self?: string;
	cwd?: string;
	alive?: number[];
	logs?: Record<string, PijEvent[]>;
	env?: Record<string, string>;
	repositories?: Record<string, string | null>;
	resolveAmbientSelf?: CliDeps["resolveAmbientSelf"];
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
		treeDescriptors: opts.treeDescs,
		repository: {
			gitCommonDir: (folder) => opts.repositories?.[folder] ?? null,
		},
		...(opts.resolveAmbientSelf ? { resolveAmbientSelf: opts.resolveAmbientSelf } : {}),
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

	it("propagates ambient resolver failures even when PIJ_SESSION_ID is set", () => {
		const d = deps({
			self: "a1",
			descs: [desc({ id: "a1" }), desc({ id: "w3" })],
			resolveAmbientSelf: () => err("E-AMBIG", "multiple ambient identities"),
		});
		const result = dispatch({ verb: "whoami", json: false }, d);
		expect(result).toMatchObject({
			exitCode: 2,
		});
		expect(result.stderr).toContain("multiple ambient identities");
	});

	it("requires PIJ_SESSION_ID to match a validated ambient identity", () => {
		const exact = deps({
			self: "a1",
			descs: [desc({ id: "a1" })],
			resolveAmbientSelf: () => ok("a1"),
		});
		expect(JSON.parse(dispatch({ verb: "whoami", json: true }, exact).stdout)).toMatchObject({
			id: "a1",
		});

		const mismatch = deps({
			self: "a1",
			descs: [desc({ id: "a1" }), desc({ id: "w3" })],
			resolveAmbientSelf: () => ok("w3"),
		});
		const result = dispatch({ verb: "whoami", json: false }, mismatch);
		expect(result).toMatchObject({ exitCode: 2 });
		expect(result.stderr).toContain("E-AMBIG");
		expect(result.stderr).toContain("a1");
		expect(result.stderr).toContain("w3");
	});

	it("preserves direct PIJ_SESSION_ID compatibility when no ambient identity exists", () => {
		const d = deps({
			self: "a1",
			descs: [desc({ id: "a1" })],
			resolveAmbientSelf: () => ok(undefined),
		});
		expect(JSON.parse(dispatch({ verb: "whoami", json: true }, d).stdout)).toMatchObject({
			id: "a1",
		});
	});

	it("reverse-resolves ambient self before pane and cwd fallbacks", () => {
		const d = deps({
			descs: [desc({ id: "ambient" }), desc({ id: "pane-peer", paneId: "%7" })],
			env: { TMUX_PANE: "%7" },
			resolveAmbientSelf: () => ok("ambient"),
		});
		expect(JSON.parse(dispatch({ verb: "whoami", json: true }, d).stdout)).toMatchObject({
			id: "ambient",
		});
	});

	it("propagates an unregistered ambient identity before compatibility fallbacks", () => {
		const d = deps({
			descs: [desc({ id: "cwd-peer" })],
			resolveAmbientSelf: () =>
				err("E-NOID", "current codex session is not registered; run pij inbox register"),
		});
		const result = dispatch({ verb: "whoami", json: false }, d);
		expect(result).toMatchObject({ exitCode: 2 });
		expect(result.stderr).toContain("pij inbox register");
	});

	it("list --here filters to cwd, stars self, reports liveness", () => {
		const d = deps({
			self: "a1",
			descs: [
				desc({
					id: "a1",
					boundProvider: "github-copilot",
					boundModel: "gpt-5.6-sol",
					effort: "xhigh",
				}),
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
			boundProvider: string | null;
			effort: string | null;
			prime: boolean;
			oldPrime: boolean;
		}>;
		expect(arr.map((x) => x.id).sort()).toEqual(["a1", "w3"]); // z9 filtered out
		expect(arr.find((x) => x.id === "a1")?.liveness).toBe("active");
		expect(arr.find((x) => x.id === "a1")).toMatchObject({
			boundModel: "gpt-5.6-sol",
			boundProvider: "github-copilot",
			effort: "xhigh",
		});
		expect(arr.find((x) => x.id === "w3")?.liveness).toBe("dead");
		expect(arr.every((x) => x.prime === false)).toBe(true);
		expect(arr.every((x) => x.oldPrime === false)).toBe(true);
		const human = dispatch({ verb: "list", here: true, prime: false, json: false }, d);
		expect(human.stdout).toContain("★ a1");
		expect(human.stdout).toContain("gpt-5.6-sol");
		expect(human.stdout).toContain("github-copilot");
		expect(human.stdout).toContain("xhigh");
	});

	// ── plan 071 D3 addendum: sending is activity on the SENDER's axis ───────
	it("send refreshes the SENDER's lastEventAt — a send-only orchestrator is not quiet", () => {
		const stale = new Date(T - 10 * 60_000).toISOString();
		const d = deps({
			self: "a1",
			descs: [
				desc({ id: "a1", lastEventAt: stale }),
				desc({ id: "w3", lifecycle: "bound", state: "idle" }),
			],
			alive: [100],
		});

		expect(d.registry.read("a1")?.lastEventAt).toBe(stale);
		dispatch({ verb: "send", to: "w3", text: "do the thing", json: true }, d);

		expect(d.registry.read("a1")?.lastEventAt).toBe(new Date(T).toISOString());
	});

	// CONTROL: a REFUSED send stamps nothing — otherwise the stamp would be a
	// liveness lie of its own, keeping a peer "active" by failing to message.
	it("control — a send that never delivers does not refresh the sender's activity", () => {
		const stale = new Date(T - 10 * 60_000).toISOString();
		const d = deps({ self: "a1", descs: [desc({ id: "a1", lastEventAt: stale })], alive: [100] });

		const r = dispatch({ verb: "send", to: "does-not-exist", text: "hi", json: true }, d);

		expect(r.exitCode).not.toBe(0);
		expect(d.registry.read("a1")?.lastEventAt).toBe(stale);
	});

	it("a broadcast refreshes the sender's activity too", () => {
		const stale = new Date(T - 10 * 60_000).toISOString();
		const d = deps({
			self: "a1",
			descs: [
				desc({ id: "a1", lastEventAt: stale }),
				desc({ id: "w3", lifecycle: "bound" }),
				desc({ id: "z9", lifecycle: "bound" }),
			],
			alive: [100],
		});

		dispatch(
			{
				verb: "send",
				to: "w3",
				targets: ["w3", "z9"],
				broadcast: true,
				text: "same message",
				json: true,
			},
			d,
		);

		expect(d.registry.read("a1")?.lastEventAt).toBe(new Date(T).toISOString());
	});

	// s070/#47 lost-update family, applied to this CLI-side write: a closing seat
	// must never have a pre-close snapshot replayed over its close fields.
	it("does NOT stamp sender activity over a seat that is closing or terminal", () => {
		const stale = new Date(T - 10 * 60_000).toISOString();
		for (const closing of [
			{ closeIntent: { actor: "pij-boss", kind: "once-close" as const, requestedAt: stale } },
			{
				terminal: {
					disposition: "requested" as const,
					observedAt: stale,
					evidence: "pane-missing" as const,
				},
			},
			{ lifecycle: "failed" as const },
		]) {
			const d = deps({
				self: "a1",
				descs: [
					desc({ id: "a1", lastEventAt: stale, ...closing }),
					desc({ id: "w3", lifecycle: "bound" }),
				],
				alive: [100],
			});

			dispatch({ verb: "send", to: "w3", text: "hi", json: true }, d);

			expect(d.registry.read("a1")?.lastEventAt).toBe(stale);
		}
	});

	// ── plan 071 D3: honest receipts + DEGRADED surfacing ────────────────────
	it("send to a WEDGED (long-pending) peer returns blocked, never a cheerful queued", () => {
		const wedged = desc({
			id: "w3",
			lifecycle: "pending",
			startedAt: new Date(T - 16 * 60_000).toISOString(),
		});
		const d = deps({ self: "a1", descs: [desc({ id: "a1" }), wedged], alive: [100] });

		const r = dispatch({ verb: "send", to: "w3", text: "hello", json: true }, d);
		const parsed = JSON.parse(r.stdout) as { receipt: string; reason?: string };
		expect(parsed.receipt).toBe("blocked");
		expect(parsed.reason).toBe("never-bound");

		const human = dispatch({ verb: "send", to: "w3", text: "hello" }, d);
		expect(human.stdout).toContain("BLOCKED");
		expect(human.stdout).toContain("never bound");
	});

	// CONTROL: byte-identical setup, only startedAt is recent — a genuinely
	// still-binding peer must still queue, or `pij spawn --task` breaks.
	it("control — a FRESHLY spawned pending peer still queues, with reason unbound", () => {
		const fresh = desc({
			id: "w3",
			lifecycle: "pending",
			startedAt: new Date(T - 5_000).toISOString(),
		});
		const d = deps({ self: "a1", descs: [desc({ id: "a1" }), fresh], alive: [100] });

		const parsed = JSON.parse(
			dispatch({ verb: "send", to: "w3", text: "hello", json: true }, d).stdout,
		) as { receipt: string; reason?: string };
		expect(parsed.receipt).toBe("queued");
		expect(parsed.reason).toBe("unbound");
	});

	it("send to a FAILED peer is blocked too", () => {
		const failed = desc({ id: "w3", lifecycle: "failed", failureReason: "bind-timeout" });
		const d = deps({ self: "a1", descs: [desc({ id: "a1" }), failed], alive: [100] });

		const parsed = JSON.parse(
			dispatch({ verb: "send", to: "w3", text: "hello", json: true }, d).stdout,
		) as { receipt: string };
		expect(parsed.receipt).toBe("blocked");
	});

	it("every queued receipt names WHY — busy is no longer indistinguishable from unbound", () => {
		const busy = desc({ id: "w3", lifecycle: "bound", state: "working" });
		const d = deps({ self: "a1", descs: [desc({ id: "a1" }), busy], alive: [100] });

		const parsed = JSON.parse(
			dispatch({ verb: "send", to: "w3", text: "hello", json: true }, d).stdout,
		) as { receipt: string; reason?: string };
		expect(parsed.receipt).toBe("queued");
		expect(parsed.reason).toBe("busy");
	});

	it("state reports a wedged seat as DEGRADED with an actionable reason", () => {
		const wedged = desc({
			id: "w3",
			lifecycle: "pending",
			startedAt: new Date(T - 16 * 60_000).toISOString(),
		});
		const d = deps({ self: "a1", descs: [wedged], alive: [100] });

		const parsed = JSON.parse(dispatch({ verb: "state", id: "w3", json: true }, d).stdout) as {
			degraded: boolean;
			bindHealth: string;
			degradedReason: string | null;
		};
		expect(parsed.degraded).toBe(true);
		expect(parsed.bindHealth).toBe("bind-limbo");
		expect(parsed.degradedReason).toContain("never bound");

		const human = dispatch({ verb: "state", id: "w3" }, d);
		expect(human.stdout).toContain("DEGRADED");
	});

	// CONTROL: same verb, healthy seat — no DEGRADED anywhere.
	it("control — a bound seat's state carries no DEGRADED marker", () => {
		const d = deps({ self: "a1", descs: [desc({ id: "w3", lifecycle: "bound" })], alive: [100] });

		const parsed = JSON.parse(dispatch({ verb: "state", id: "w3", json: true }, d).stdout) as {
			degraded: boolean;
			degradedReason: string | null;
		};
		expect(parsed.degraded).toBe(false);
		expect(parsed.degradedReason).toBeNull();
		expect(dispatch({ verb: "state", id: "w3" }, d).stdout).not.toContain("DEGRADED");
	});

	it("list shows DEGRADED in the activity column for a wedged seat", () => {
		const wedged = desc({
			id: "w3",
			lifecycle: "pending",
			startedAt: new Date(T - 16 * 60_000).toISOString(),
		});
		const d = deps({ self: "a1", descs: [wedged], alive: [100] });

		expect(dispatch({ verb: "list", here: false, prime: false }, d).stdout).toContain("DEGRADED");
		const rows = JSON.parse(
			dispatch({ verb: "list", here: false, prime: false, json: true }, d).stdout,
		) as Array<{ id: string; degraded: boolean }>;
		expect(rows.find((row) => row.id === "w3")?.degraded).toBe(true);
	});

	it("list --archived reads the archive index, never the descriptor files (plan 071 D1)", () => {
		const d = deps({ descs: [desc({ id: "a1" })] });
		let listCalls = 0;
		const registryList = d.registry.list.bind(d.registry);
		d.registry.list = () => {
			listCalls += 1;
			return registryList();
		};
		(d.registry as { listArchived?: () => unknown }).listArchived = () => [
			{
				id: "pij-long-gone",
				archivedAt: "2026-07-25T12:00:00.000Z",
				lifecycle: "failed",
				failureReason: "bind-timeout",
				folder: "/repo",
			},
		];

		const human = dispatch({ verb: "list", here: false, prime: false, archived: true }, d);
		expect(human.stdout).toContain("pij-long-gone");
		expect(human.stdout).toContain("bind-timeout");
		expect(human.stdout).toContain("1 archived session(s)");
		expect(listCalls).toBe(0); // the hot tier is never scanned for an archive listing

		const json = dispatch(
			{ verb: "list", here: false, prime: false, archived: true, json: true },
			d,
		);
		expect(JSON.parse(json.stdout)).toMatchObject([{ id: "pij-long-gone" }]);
	});

	it("list --archived says so plainly when nothing is archived", () => {
		const d = deps({ descs: [desc({ id: "a1" })] });
		const r = dispatch({ verb: "list", here: false, prime: false, archived: true }, d);
		expect(r.stdout).toBe("no archived pij sessions");
	});

	// CONTROL: the same deps WITHOUT --archived still render the live fleet, so the
	// branch above is proving the flag and not a broken list verb.
	it("control — without --archived the live tier is listed as before", () => {
		const d = deps({ descs: [desc({ id: "a1" })] });
		(d.registry as { listArchived?: () => unknown }).listArchived = () => [];
		const r = dispatch({ verb: "list", here: false, prime: false }, d);
		expect(r.stdout).toContain("a1");
		expect(r.stdout).toContain("1 session(s)");
	});

	it("list --prime composes with --here and ordinary output marks prime rows", () => {
		const d = deps({
			self: "a1",
			descs: [
				desc({ id: "a1", prime: true }),
				desc({ id: "w3", prime: false, oldPrime: true }),
				desc({ id: "legacy" }),
				desc({ id: "corrupt", prime: true, oldPrime: true }),
				desc({ id: "elsewhere", folder: "/other", prime: true }),
			],
		});
		const filtered = dispatch({ verb: "list", here: true, prime: true, json: true }, d);
		expect((JSON.parse(filtered.stdout) as Array<{ id: string }>).map(({ id }) => id)).toEqual([
			"a1",
			"corrupt",
		]);

		const allJson = JSON.parse(
			dispatch({ verb: "list", here: false, prime: false, json: true }, d).stdout,
		) as Array<{ id: string; prime: boolean; oldPrime: boolean }>;
		expect(allJson.map(({ id, prime, oldPrime }) => ({ id, prime, oldPrime }))).toEqual([
			{ id: "a1", prime: true, oldPrime: false },
			{ id: "w3", prime: false, oldPrime: true },
			{ id: "legacy", prime: false, oldPrime: false },
			{ id: "corrupt", prime: true, oldPrime: true },
			{ id: "elsewhere", prime: true, oldPrime: false },
		]);

		const human = dispatch({ verb: "list", here: true, prime: false, json: false }, d);
		const primeRow = human.stdout.split("\n").find((line) => line.includes("a1"));
		const oldPrimeRow = human.stdout.split("\n").find((line) => line.includes("w3"));
		const corruptRow = human.stdout.split("\n").find((line) => line.includes("corrupt"));
		expect(primeRow).toMatch(/a1\s+P\s/);
		expect(oldPrimeRow).toMatch(/w3\s+O\s/);
		expect(corruptRow).toMatch(/corrupt\s+P\s/);
		expect(corruptRow).not.toMatch(/corrupt\s+O\s/);
	});
});

describe("dispatch send", () => {
	it("freezes send --wait terminal handling before dispatch ack semantics are added", () => {
		const states: readonly ReceiptState[] = ["queued", "delivered", "unverified"];
		const targets = [{ to: "w3", messageId: "msg-freeze" }];

		expect(states).toEqual(["queued", "delivered", "unverified"]);
		expect(receiptBody("msg-freeze", "delivered")).toBe("[pij receipt msg-freeze] delivered");
		expect(parseReceiptBody("[pij receipt msg-freeze] delivered")).toEqual({
			messageId: "msg-freeze",
			state: "delivered",
		});
		expect(applyWaitReceipt(targets, { messageId: "msg-freeze", state: "queued" })).toEqual({
			target: targets[0],
			pending: targets,
		});
		expect(applyWaitReceipt(targets, { messageId: "msg-freeze", state: "delivered" })).toEqual({
			target: targets[0],
			pending: [],
		});
		expect(applyWaitReceipt(targets, { messageId: "msg-freeze", state: "unverified" })).toEqual({
			target: targets[0],
			pending: [],
		});
	});

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
					lastTickAt: new Date(T - 40_000).toISOString(),
				}),
			],
		});
		const json = dispatch({ verb: "send", to: "w3", text: "x", wait: false, json: true }, wedged);
		expect(JSON.parse(json.stdout)).toMatchObject({
			receipt: "queued",
			daemonTickAgeMs: 40_000,
			daemonTickStale: true,
		});
		const human = dispatch({ verb: "send", to: "w3", text: "x", wait: false, json: false }, wedged);
		expect(human.stdout).toContain("daemon tick stale");
	});

	it("names the compact hold at send time — 'queued: target compacting' (DL-004)", () => {
		const compacting = deps({
			self: "a1",
			descs: [
				desc({ id: "a1" }),
				desc({
					id: "w3",
					harness: "claude",
					state: "idle",
					lastTickAt: new Date(T - 1000).toISOString(),
					compactingAt: new Date(T - 2000).toISOString(),
				}),
			],
		});
		const human = dispatch(
			{ verb: "send", to: "w3", text: "x", wait: false, json: false },
			compacting,
		);
		expect(human.stdout).toContain("queued (compacting)");
	});

	it("an EXPIRED compact mark does not name the hold (drain has resumed)", () => {
		const staleMark = deps({
			self: "a1",
			descs: [
				desc({ id: "a1" }),
				desc({
					id: "w3",
					harness: "claude",
					state: "idle",
					lastTickAt: new Date(T - 1000).toISOString(),
					compactingAt: new Date(T - 300_000).toISOString(), // > COMPACT_MAX_MS
				}),
			],
		});
		const human = dispatch(
			{ verb: "send", to: "w3", text: "x", wait: false, json: false },
			staleMark,
		);
		expect(human.stdout).not.toContain("target compacting");
		expect(human.stdout).toContain("queued (tick-pending): awaiting daemon delivery confirmation");
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

	it("accepts a durable send to a dead pull peer and queues it for inbox check", () => {
		const d = deps({
			self: "a1",
			descs: [
				desc({ id: "a1" }),
				desc({
					id: "pull-peer",
					harness: "copilot",
					deliveryMode: "pull",
					lifecycle: "bound",
					pid: 777,
				}),
			],
			alive: [100],
		});
		const json = dispatch(
			{ verb: "send", to: "pull-peer", text: "durable", wait: false, json: true },
			d,
		);
		expect(json.exitCode).toBe(0);
		expect(JSON.parse(json.stdout)).toMatchObject({
			to: "pull-peer",
			receipt: "queued",
			liveness: "dead",
		});
		expect(d.delivery.outbox).toHaveLength(1);

		const human = dispatch(
			{ verb: "send", to: "pull-peer", text: "durable", wait: false, json: false },
			d,
		);
		expect(human.stdout).toContain("awaiting the peer's own inbox check");
	});

	it("still rejects dead push peers and dissolved pull peers", () => {
		for (const target of [
			desc({
				id: "dead-push",
				harness: "copilot",
				deliveryMode: "push",
				lifecycle: "bound",
				pid: 777,
			}),
			desc({
				id: "closed-pull",
				harness: "copilot",
				deliveryMode: "pull",
				lifecycle: "dissolved",
			}),
		]) {
			const d = deps({
				self: "a1",
				descs: [desc({ id: "a1" }), target],
				alive: [100],
			});
			const result = dispatch(
				{ verb: "send", to: target.id, text: "no", wait: false, json: false },
				d,
			);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("E-DEAD");
			expect(d.delivery.outbox).toHaveLength(0);
		}
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
					// plan 071 D3 — every non-delivered receipt now names its cause.
					reason: "tick-pending",
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

	it("merges event-first and envelope-first terminal receipt races exactly once", () => {
		const targets = [{ to: "w3", messageId: "m1" }];
		const envelope = {
			kind: "persist-receipt-envelope",
			envelopeMessageId: "receipt-envelope",
			from: "w3",
			body: "[pij receipt m1] delivered",
			receipt: { messageId: "m1", state: "delivered" },
			readAt: "2026-07-12T00:55:00.000Z",
			reader: "a1",
		} as const;

		const eventFirst = applyWaitReceiptSources(
			targets,
			[],
			[{ messageId: "m1", state: "delivered" }],
			[envelope],
		);
		expect(eventFirst).toMatchObject({
			pending: [],
			updates: [{ target: targets[0], state: "delivered" }],
		});

		const envelopeFirst = applyWaitReceiptSources(targets, [], [], [envelope]);
		expect(envelopeFirst).toMatchObject({
			pending: [],
			updates: [{ target: targets[0], state: "delivered" }],
		});
	});

	it("later waits can resolve an uncorrelated receipt after it becomes relevant", () => {
		const receipt = { messageId: "later", state: "delivered" as const };
		expect(applyWaitReceiptSources([], [], [receipt], [])).toMatchObject({
			pending: [],
			updates: [],
		});
		expect(
			applyWaitReceiptSources([{ to: "w3", messageId: "later" }], [], [receipt], []),
		).toMatchObject({
			pending: [],
			updates: [{ target: { to: "w3", messageId: "later" }, state: "delivered" }],
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
					lastTickAt: new Date(T - 40_000).toISOString(),
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
			daemonLastTickAt: new Date(T - 40_000).toISOString(),
			daemonTickAgeMs: 40_000,
			daemonTickStale: true,
		});
		// working|idle|done activity for the orchestrator (feedback round 3).
		expect(j.activity).toBe("working"); // state:working → working
		const human = dispatch({ verb: "state", id: "w3", json: false }, d);
		expect(human.stdout).toContain("model: gpt-5.6-sol");
		expect(human.stdout).toContain("effort: xhigh");
		expect(human.stdout).toContain("daemon tick: stale");
	});

	it("state/list JSON preserve full terminal truth and human state names unavailable evidence", () => {
		const terminal = {
			disposition: "unavailable" as const,
			observedAt: "2026-06-16T11:59:00.000Z",
			evidence: "observation-unavailable" as const,
			lastSeenAt: "2026-06-16T11:58:00.000Z",
			unavailableReason: "EPERM probing pid",
		};
		const d = deps({ descs: [desc({ id: "w3", terminal })] });
		const state = JSON.parse(dispatch({ verb: "state", id: "w3", json: true }, d).stdout);
		expect(state.terminal).toEqual(terminal);
		const rows = JSON.parse(
			dispatch({ verb: "list", here: false, prime: false, json: true }, d).stdout,
		) as Array<{ terminal: unknown }>;
		expect(rows[0]?.terminal).toEqual(terminal);
		const human = dispatch({ verb: "state", id: "w3", json: false }, d).stdout;
		expect(human).toContain("terminal: unavailable");
		expect(human).toContain("observation-unavailable");
		expect(human).toContain("EPERM probing pid");
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
			resolveAmbientSelf: () =>
				err("E-NOID", "pending peer has no ambient reverse join before phonehome"),
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

	it("rebinds a revived Copilot descriptor whose native id is unchanged", () => {
		const copilotId = "df4f1111-2222-4333-8444-555555555555";
		const d = deps({
			descs: [
				desc({
					id: "pij-revived",
					harness: "copilot",
					harnessSessionId: copilotId,
					lifecycle: "pending",
					revivePendingAt: "2026-07-25T00:00:00.000Z",
				}),
			],
			self: "pij-revived",
			env: { COPILOT_AGENT_SESSION_ID: copilotId },
		});
		const result = dispatch({ verb: "phonehome", json: true }, d);
		expect(JSON.parse(result.stdout)).toMatchObject({
			id: "pij-revived",
			harnessSessionId: copilotId,
			lifecycle: "bound",
			confirmed: true,
		});
		expect(d.registry.read("pij-revived")?.lifecycle).toBe("bound");
	});

	it("does not heal a failed descriptor when an old session phones home", () => {
		const copilotId = "ef4f1111-2222-4333-8444-555555555555";
		const d = deps({
			descs: [
				desc({
					id: "pij-failed",
					harness: "copilot",
					harnessSessionId: copilotId,
					lifecycle: "failed",
				}),
			],
			self: "pij-failed",
			env: { COPILOT_AGENT_SESSION_ID: copilotId },
		});
		const result = dispatch({ verb: "phonehome", json: true }, d);
		expect(JSON.parse(result.stdout)).toMatchObject({ lifecycle: "failed", confirmed: false });
		expect(d.registry.read("pij-failed")?.lifecycle).toBe("failed");
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

describe("tree/link grammar", () => {
	it("parses repository, global, subtree, repeatable filter, history, and JSON forms", () => {
		expect(parseArgs(["tree"])).toEqual({
			ok: true,
			value: {
				verb: "tree",
				rootId: undefined,
				global: false,
				filters: {},
				json: false,
			},
		});
		expect(
			parseArgs([
				"tree",
				"--global",
				"--activity",
				"working",
				"--activity=done",
				"--liveness",
				"active",
				"--lifecycle",
				"bound",
				"--all",
				"--json",
			]),
		).toEqual({
			ok: true,
			value: {
				verb: "tree",
				rootId: undefined,
				global: true,
				filters: {
					activity: ["working", "done"],
					liveness: ["active"],
					lifecycle: ["bound"],
					all: true,
				},
				json: true,
			},
		});
		expect(parseArgs(["tree", "pij-root", "--json"])).toMatchObject({
			ok: true,
			value: { verb: "tree", rootId: "pij-root", global: false, json: true },
		});
		expect(parseArgs(["link", "pij-child", "--parent", "pij-root", "--json"])).toEqual({
			ok: true,
			value: {
				verb: "link",
				childId: "pij-child",
				parentId: "pij-root",
				json: true,
			},
		});
		expect(parseArgs(["link", "pij-child", "--root"])).toEqual({
			ok: true,
			value: { verb: "link", childId: "pij-child", parentId: null, json: false },
		});
	});

	it("rejects invalid selector, filter, and link combinations before dispatch", () => {
		for (const argv of [
			["tree", "pij-root", "--global"],
			["tree", "pij-root", "extra"],
			["tree", "--activity", "busy"],
			["tree", "--liveness", "alive"],
			["tree", "--lifecycle", "closed"],
			["tree", "--global=true"],
			["tree", "--all=false"],
			["link"],
			["link", "pij-child"],
			["link", "pij-child", "--parent", "pij-root", "--root"],
			["link", "pij-child", "--parent"],
			["link", "pij-child", "--parent="],
			["link", "pij-child", "--root=false"],
			["link", "pij-child", "extra", "--root"],
		]) {
			expect(parseArgs(argv)).toMatchObject({ ok: false, code: "E-ARG" });
		}
	});
});

describe("dispatch tree/link", () => {
	const repositoryDescriptors = [
		desc({
			id: "pij-root",
			folder: "/repo-main",
			parentId: null,
			gitCommonDir: "/shared/.git",
			prime: true,
		}),
		desc({
			id: "pij-child",
			folder: "/repo-worktree",
			parentId: "pij-root",
			spawnedBy: "pij-owner",
			oldPrime: true,
		}),
		desc({
			id: "pij-other",
			folder: "/other",
			parentId: null,
			gitCommonDir: "/other/.git",
		}),
		desc({
			id: "pij-closed",
			folder: "/repo-main",
			parentId: "pij-root",
			gitCommonDir: "/shared/.git",
			lifecycle: "dissolved",
		}),
	];
	const repositories = {
		"/repo-main": "/shared/.git",
		"/repo-worktree": "/shared/.git",
		"/other": "/other/.git",
	};

	it("renders the current repository by default and keeps JSON projection additive", () => {
		const d = deps({
			descs: repositoryDescriptors,
			treeDescs: repositoryDescriptors,
			cwd: "/repo-main",
			repositories,
		});
		const result = dispatch(parsed(["tree", "--json"]), d);
		expect(result.exitCode).toBe(0);
		const forest = JSON.parse(result.stdout) as {
			roots: Array<{
				id: string;
				prime: boolean;
				oldPrime: boolean;
				children: Array<{ id: string; spawnedBy?: string; oldPrime: boolean }>;
			}>;
		};
		expect(forest.roots).toHaveLength(1);
		expect(forest.roots[0]).toMatchObject({
			id: "pij-root",
			prime: true,
			oldPrime: false,
		});
		expect(forest.roots[0]?.children[0]).toMatchObject({
			id: "pij-child",
			spawnedBy: "pij-owner",
			oldPrime: true,
		});
		expect(result.stdout).not.toContain("pij-other");
		expect(result.stdout).not.toContain("pij-closed");
	});

	it("supports global/subtree selectors, composed filters, history, and human problem/prime markers", () => {
		const descriptors = [
			...repositoryDescriptors,
			desc({ id: "pij-orphan", parentId: "missing", state: "working", prime: true }),
		];
		const d = deps({
			descs: descriptors,
			treeDescs: descriptors,
			cwd: "/repo-main",
			repositories,
			alive: [100],
		});

		const filtered = dispatch(
			parsed(["tree", "--global", "--activity", "working", "--liveness", "active", "--json"]),
			d,
		);
		expect(filtered.stdout).toContain("pij-orphan");
		expect(filtered.stdout).not.toContain("pij-root");

		const subtree = dispatch(parsed(["tree", "pij-other", "--json"]), d);
		expect(JSON.parse(subtree.stdout).roots.map((node: { id: string }) => node.id)).toEqual([
			"pij-other",
		]);

		const human = dispatch(parsed(["tree", "--global", "--all"]), d);
		expect(human.stdout).toContain("P pij-root");
		expect(human.stdout).toContain("O pij-child");
		expect(human.stdout).toContain("pij-closed");
		expect(human.stdout).toContain("closed");
		expect(human.stdout).toContain("orphan");
	});

	it("fails a bare repository tree outside git and an unknown subtree without writes", () => {
		const d = deps({
			descs: repositoryDescriptors,
			treeDescs: repositoryDescriptors,
			cwd: "/not-git",
			repositories,
		});
		expect(dispatch(parsed(["tree"]), d)).toMatchObject({ exitCode: 64 });
		expect(dispatch(parsed(["tree", "missing"]), d)).toMatchObject({ exitCode: 2 });
	});

	it("links or roots one descriptor while preserving ownership and unrelated fields", () => {
		const descriptors = [
			desc({ id: "pij-root", parentId: null }),
			desc({ id: "pij-new-parent", parentId: null }),
			desc({
				id: "pij-child",
				parentId: "pij-root",
				spawnedBy: "pij-close-owner",
				gitCommonDir: "/repo/.git",
				prime: true,
				oldPrime: false,
				deliveryMode: "pull",
			}),
			desc({ id: "pij-grandchild", parentId: "pij-child" }),
		];
		const d = deps({ descs: descriptors, treeDescs: descriptors });
		const linked = dispatch(
			parsed(["link", "pij-child", "--parent", "pij-new-parent", "--json"]),
			d,
		);
		expect(linked.exitCode).toBe(0);
		expect(JSON.parse(linked.stdout)).toEqual({
			id: "pij-child",
			parentId: "pij-new-parent",
			changed: true,
		});
		expect(d.registry.read("pij-child")).toMatchObject({
			parentId: "pij-new-parent",
			spawnedBy: "pij-close-owner",
			gitCommonDir: "/repo/.git",
			prime: true,
			oldPrime: false,
			deliveryMode: "pull",
		});

		const rooted = dispatch(parsed(["link", "pij-child", "--root", "--json"]), d);
		expect(JSON.parse(rooted.stdout)).toEqual({
			id: "pij-child",
			parentId: null,
			changed: true,
		});
		expect(d.registry.read("pij-child")?.spawnedBy).toBe("pij-close-owner");
	});

	it("refuses unknown/self/cycle links without writing any descriptor", () => {
		for (const argv of [
			["link", "missing", "--root"],
			["link", "pij-child", "--parent", "missing"],
			["link", "pij-child", "--parent", "pij-child"],
			["link", "pij-root", "--parent", "pij-grandchild"],
		]) {
			const descriptors = [
				desc({ id: "pij-root", parentId: null }),
				desc({ id: "pij-child", parentId: "pij-root", spawnedBy: "pij-owner" }),
				desc({ id: "pij-grandchild", parentId: "pij-child" }),
			];
			const d = deps({ descs: descriptors, treeDescs: descriptors });
			const before = structuredClone(descriptors);
			expect(dispatch(parsed(argv), d).exitCode).not.toBe(0);
			expect(d.registry.read("pij-root")).toEqual(before[0]);
			expect(d.registry.read("pij-child")).toEqual(before[1]);
			expect(d.registry.read("pij-grandchild")).toEqual(before[2]);
		}
	});

	it("serializes and renders an 8,000-level corrupt cycle without using the JavaScript stack", () => {
		const count = 8_000;
		const id = (index: number): string => `deep-${index.toString().padStart(4, "0")}`;
		const descriptors = Array.from({ length: count }, (_, index) =>
			desc({ id: id(index), parentId: id((index + 1) % count) }),
		);
		const d = deps({ descs: descriptors, treeDescs: descriptors });

		const json = dispatch(parsed(["tree", "--global", "--json"]), d);
		expect(json.exitCode).toBe(0);
		expect(json.stdout).toContain('"problem":"cycle"');
		expect(json.stdout).toContain('"id":"deep-0000"');

		const human = dispatch(parsed(["tree", "--global"]), d);
		expect(human.exitCode).toBe(0);
		expect(human.stdout).toContain("cycle");
		expect(human.stdout).toContain("deep-0000");
	});
});

// ═══ plan 054 T009 — project/spine CLI surface (dispatch-level pins) ════════
// Append-only section. Local wrappers only — the shared builders above are
// untouched. All pins live at the dispatch surface: parseArgs → dispatch →
// CliResult. ParsedCommand internals are deliberately never asserted (T010
// owns the parse representation). run() folds a parse-level error into the
// CliResult the bin would print, so each E-ARG/E-NOREG pin holds whether the
// rejection happens in parseArgs or in dispatch.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
// Platform-section-local imports (the legacy import block above is frozen):
// module-scope import declarations hoist, so placement here is behavior-neutral.
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsAllocationStore } from "../adapters/allocation-store.js";
import { FsAssignmentStore } from "../adapters/assignment-store.js";
import { FsDispatchStore } from "../adapters/dispatch-store.js";
import { FakeOpJournal, FakePlatformWriteLock } from "../adapters/fakes.js";
import { FsFenceStore } from "../adapters/fence-store.js";
import { FsRegistry } from "../adapters/fs-registry.js";
import { FsOpJournal } from "../adapters/op-journal.js";
import { FsPlatformWriteLock } from "../adapters/platform-write-lock.js";
import { FsProjectStore } from "../adapters/project-store.js";
import { FsSpineLog } from "../adapters/spine-store.js";
import { renderCanaryTimeout } from "./canary.js";
import { canonicalAssignmentJson } from "./platform/assignment.js";
import type {
	AllocationStorePort,
	DispatchStorePort,
	FenceStorePort,
	PendingOp,
} from "./platform/ports.js";
import { createProject, setProject } from "./platform/project.js";
import type { Allocation, Assignment, Dispatch, Fence, SpineEventDraft } from "./platform/types.js";
import { SPINE_KIND_NODE_LINKED, SPINE_KIND_STATE_CLEARED } from "./platform/types.js";
import type { StreamWorktreePort } from "./stream.js";

const platformRequire = createRequire(import.meta.url);
const PLATFORM_TSX = platformRequire.resolve("tsx/cli");
const PIJ_CLI_BIN = join(import.meta.dirname, "..", "cli.ts");

interface PlatformStores {
	readonly projectStore: FakeProjectStore;
	readonly assignmentStore: FakeAssignmentStore;
	readonly allocationStore: TestAllocationStore;
	readonly fenceStore: TestFenceStore;
	readonly dispatchStore: TestDispatchStore;
	readonly worktrees: TestStreamWorktrees;
	readonly worktreeRoot: string;
	readonly spineLog: FakeSpineLog;
	readonly opJournal: FakeOpJournal;
	readonly platformWriteLock: FakePlatformWriteLock;
}

class TestStreamWorktrees implements StreamWorktreePort {
	readonly created = new Set<string>();

	exists(path: string): boolean {
		return this.created.has(path);
	}

	resolveBase(): Result<{ readonly baseSha: string; readonly gitCommonDir: string }> {
		return ok({ baseSha: "base-sha", gitCommonDir: "/repo/.git" });
	}

	create(input: {
		readonly path: string;
		readonly branch: string;
		readonly baseRef: string;
	}): Result<{
		readonly path: string;
		readonly branch: string;
		readonly baseSha: string;
		readonly gitCommonDir: string;
	}> {
		if (this.created.has(input.path)) return err("E-ARG", `already exists: ${input.path}`);
		this.created.add(input.path);
		return ok({
			path: input.path,
			branch: input.branch,
			baseSha: input.baseRef,
			gitCommonDir: "/repo/.git",
		});
	}

	verify(input: {
		readonly path: string;
		readonly branch: string;
		readonly baseSha: string;
		readonly gitCommonDir: string;
	}): Result<{
		readonly path: string;
		readonly branch: string;
		readonly baseSha: string;
		readonly gitCommonDir: string;
	}> {
		return this.created.has(input.path)
			? ok(input)
			: err("E-NOREG", `missing worktree ${input.path}`);
	}

	preserveWip(): Result<{ readonly stashed: boolean; readonly evidence: string }> {
		return ok({ stashed: false, evidence: "worktree clean; no stash needed" });
	}

	safeRemove(input: { readonly path: string }): Result<{ readonly removed: boolean }> {
		const removed = this.created.delete(input.path);
		return ok({ removed });
	}
}

class TestAllocationStore implements AllocationStorePort {
	private readonly records = new Map<string, Allocation>();

	write(allocation: Allocation): Result<void> {
		this.records.set(allocation.id, structuredClone(allocation));
		return ok(undefined);
	}

	read(id: string): Allocation | null {
		const record = this.records.get(id);
		return record === undefined ? null : structuredClone(record);
	}

	list(): Allocation[] {
		return [...this.records.values()]
			.map((record) => structuredClone(record))
			.sort((left, right) => left.ordinal - right.ordinal);
	}
}

class TestFenceStore implements FenceStorePort {
	private readonly records = new Map<string, Fence>();

	write(fence: Fence): Result<void> {
		this.records.set(fence.id, structuredClone(fence));
		return ok(undefined);
	}

	read(id: string): Fence | null {
		const record = this.records.get(id);
		return record === undefined ? null : structuredClone(record);
	}

	list(): Fence[] {
		return [...this.records.values()]
			.map((record) => structuredClone(record))
			.sort((left, right) => left.id.localeCompare(right.id));
	}
}

class TestDispatchStore implements DispatchStorePort {
	private readonly records = new Map<string, Dispatch>();

	write(dispatchRecord: Dispatch): Result<void> {
		this.records.set(dispatchRecord.id, structuredClone(dispatchRecord));
		return ok(undefined);
	}

	read(id: string): Dispatch | null {
		const record = this.records.get(id);
		return record === undefined ? null : structuredClone(record);
	}

	list(): Dispatch[] {
		return [...this.records.values()]
			.map((record) => structuredClone(record))
			.sort((left, right) => left.id.localeCompare(right.id));
	}
}

/** deps() + the plan-054 stores (optional CliDeps ports per the T010 contract). */
function platformDeps(
	opts: Parameters<typeof deps>[0] & { projects?: Project[]; spine?: SpineEvent[] } = {},
): CliDeps & PlatformStores & { delivery: FakeDelivery; registry: FakeRegistry } {
	let dispatchCounter = 0;
	return {
		...deps(opts),
		projectStore: new FakeProjectStore(opts.projects ?? []),
		assignmentStore: new FakeAssignmentStore(),
		allocationStore: new TestAllocationStore(),
		fenceStore: new TestFenceStore(),
		dispatchStore: new TestDispatchStore(),
		packetIdentity: (path) => ok({ path, sha256: "a".repeat(64) }),
		nextDispatchId: () => `dispatch-test-${++dispatchCounter}`,
		worktrees: new TestStreamWorktrees(),
		worktreeRoot: "/repo-worktrees",
		spineLog: new FakeSpineLog(opts.spine ?? []),
		opJournal: new FakeOpJournal(),
		platformWriteLock: new FakePlatformWriteLock(),
	};
}

/** Unwrap OpJournalPort.pending's Result surface (review 003 H2) — every pin
 *  below asserts over the surviving ops, and an unenumerable journal in these
 *  fake-backed fixtures is a harness bug worth throwing on. */
function pendingOps(journal: FakeOpJournal): readonly PendingOp[] {
	const result = journal.pending();
	if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
	return result.value;
}

/** parse → dispatch; a parse error becomes the CliResult the bin prints
 *  (E-ARG → 64, E-NOREG → 3), keeping every pin at the dispatch level. */
function run(argv: readonly string[], d: CliDeps): CliResult {
	const result = parseArgs(argv);
	if (!result.ok) {
		const exitCode = result.code === "E-ARG" ? 64 : result.code === "E-NOREG" ? 3 : 2;
		return { stdout: "", stderr: `${result.code}: ${result.message}`, exitCode };
	}
	return dispatch(result.value, d);
}

function seedProject(over: Partial<Project> & { slug: string }): Project {
	return {
		schema_version: 1,
		description: over.slug,
		created: { actor: "seed-actor", ts: recent },
		...over,
	};
}

function spineEv(over: Partial<SpineEvent> & { seq: number }): SpineEvent {
	return {
		schema_version: 1,
		ts: recent,
		actor: "seed-actor",
		kind: "note",
		refs: [],
		...over,
	};
}

const seqsOf = (stdout: string): number[] => (JSON.parse(stdout) as SpineEvent[]).map((e) => e.seq);

describe("project verbs", () => {
	describe("project create", () => {
		it("persists the record, mentions the slug in text, exit 0", () => {
			const d = platformDeps({ self: "pij-self" });
			const r = run(["project", "create", "Fix the CLI"], d);
			expect(r.exitCode).toBe(0);
			expect(r.stderr).toBe("");
			expect(r.stdout).toContain("fix-the-cli");
			expect(d.projectStore.read("fix-the-cli")).toMatchObject({
				schema_version: 1,
				slug: "fix-the-cli",
				description: "Fix the CLI",
			});
		});

		it("--json prints the bare persisted record (house: no envelope wrapper)", () => {
			const d = platformDeps({ self: "pij-self" });
			const r = run(["project", "create", "Fix the CLI", "--json"], d);
			expect(r.exitCode).toBe(0);
			const j = JSON.parse(r.stdout) as Project;
			expect(j).toMatchObject({
				schema_version: 1,
				slug: "fix-the-cli",
				description: "Fix the CLI",
			});
			expect(j.created.actor).toBe("pij-self");
			// bare record — exactly what the store holds, nothing wrapped around it.
			expect(j).toEqual(d.projectStore.read("fix-the-cli"));
			expect(j).not.toHaveProperty("project");
			expect(j).not.toHaveProperty("ok");
		});

		it("resolves slug collisions against the store's existing slugs (AC-01)", () => {
			const d = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "fix-the-cli" })],
			});
			const r = run(["project", "create", "Fix the CLI", "--json"], d);
			expect(r.exitCode).toBe(0);
			expect((JSON.parse(r.stdout) as Project).slug).toBe("fix-the-cli-2");
			expect(d.projectStore.read("fix-the-cli-2")).not.toBeNull();
			// first-writer-wins: the original record survives untouched.
			expect(d.projectStore.read("fix-the-cli")?.created.actor).toBe("seed-actor");
		});

		it("appends EXACTLY ONE project-created spine event, seq = lastSeq()+1 (AC-03)", () => {
			const d = platformDeps({ self: "pij-self", spine: [spineEv({ seq: 7 })] });
			const r = run(["project", "create", "Fix the CLI"], d);
			expect(r.exitCode).toBe(0);
			expect(d.spineLog.read()).toHaveLength(2); // seeded + exactly one new
			const added = d.spineLog.read({ since: 7 });
			expect(added).toHaveLength(1);
			expect(added[0]).toMatchObject({
				schema_version: 1,
				kind: "project-created",
				seq: 8,
				actor: "pij-self",
				refs: ["project:fix-the-cli"],
				project: "fix-the-cli",
			});
		});

		it("collision-RESOLVED slug flows into the spine event, never the base slug (AC-01×AC-03)", () => {
			// Audit fix (major): an impl that builds the event from
			// kebabSlug(description) while persisting the collision-resolved
			// record would pass the two tests above — this one catches it.
			const d = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "fix-the-cli" })],
				spine: [spineEv({ seq: 7 })],
			});
			const r = run(["project", "create", "Fix the CLI"], d);
			expect(r.exitCode).toBe(0);
			const added = d.spineLog.read({ since: 7 });
			expect(added).toHaveLength(1);
			expect(added[0]).toMatchObject({
				kind: "project-created",
				seq: 8,
				refs: ["project:fix-the-cli-2"],
				project: "fix-the-cli-2",
			});
		});

		it("--slug parses and persists that slug verbatim (bare record --json unchanged)", () => {
			const d = platformDeps({ self: "pij-self" });
			const r = run(["project", "create", "Fix the CLI", "--slug", "foo-bar", "--json"], d);
			expect(r.exitCode).toBe(0);
			const j = JSON.parse(r.stdout) as Project;
			expect(j).toMatchObject({
				schema_version: 1,
				slug: "foo-bar",
				description: "Fix the CLI",
			});
			// still the bare persisted record — the --slug flag adds no envelope.
			expect(j).toEqual(d.projectStore.read("foo-bar"));
			expect(j).not.toHaveProperty("ok");
		});

		it("bare --slug → E-ARG 64", () => {
			const d = platformDeps({ self: "pij-self" });
			const r = run(["project", "create", "Fix the CLI", "--slug"], d);
			expect(r.exitCode).toBe(64);
			expect(r.stderr).toContain("E-ARG");
			expect(r.stderr).toContain("--slug");
			expect(d.projectStore.list()).toHaveLength(0);
		});

		it("--slug collision → E-ARG, nothing written (explicit identity is never renamed)", () => {
			const d = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "foo-bar" })],
			});
			const r = run(["project", "create", "Fix the CLI", "--slug", "foo-bar"], d);
			expect(r.exitCode).toBe(64);
			expect(r.stderr).toContain("E-ARG");
			expect(r.stderr).toContain("foo-bar");
			expect(d.projectStore.list()).toHaveLength(1); // the seed alone survives
			expect(d.spineLog.read()).toHaveLength(0);
		});

		it("a 127-char description caps the slug but the record holds the FULL description", () => {
			const description = `long description regression ${"word ".repeat(20)}`.trim();
			const d = platformDeps({ self: "pij-self" });
			const r = run(["project", "create", description, "--json"], d);
			expect(r.exitCode).toBe(0);
			const j = JSON.parse(r.stdout) as Project;
			expect(j.slug.length).toBeLessThanOrEqual(PROJECT_SLUG_MAX_LENGTH);
			expect(j.description).toBe(description);
			expect(d.projectStore.read(j.slug)?.description).toBe(description);
		});

		it("empty description → E-ARG 64 naming the description", () => {
			const d = platformDeps({ self: "pij-self" });
			const r = run(["project", "create", ""], d);
			expect(r.exitCode).toBe(64);
			expect(r.stderr).toContain("E-ARG");
			expect(r.stderr).toContain("description");
			expect(d.projectStore.list()).toHaveLength(0);
		});

		it("symbol-only description (kebabs to '') → E-ARG 64 naming the description", () => {
			const d = platformDeps({ self: "pij-self" });
			const r = run(["project", "create", "!!!"], d);
			expect(r.exitCode).toBe(64);
			expect(r.stderr).toContain("E-ARG");
			expect(r.stderr).toContain("description");
			expect(d.projectStore.list()).toHaveLength(0);
		});

		it("NO spine event when the record write fails (one event per SUCCESSFUL write)", () => {
			const d = platformDeps({ self: "pij-self" });
			d.projectStore.failNext("create");
			const r = run(["project", "create", "Fix the CLI"], d);
			expect(r.exitCode).not.toBe(0);
			expect(r.stderr).toContain("E-NOREG"); // the store's fault code surfaces
			expect(d.spineLog.read()).toHaveLength(0); // the log gained NOTHING
			expect(d.projectStore.list()).toHaveLength(0);
			// Abort path clears the journal (audit F2): a leaked op would be
			// replayed into a project-created event for state that never committed.
			expect(pendingOps(d.opJournal)).toHaveLength(0);
		});

		it("resolvable self stamps actor + actorProvenance 'resolved' (convention F2)", () => {
			const d = platformDeps({ self: "pij-self" });
			const r = run(["project", "create", "Fix the CLI"], d);
			expect(r.exitCode).toBe(0);
			expect(d.spineLog.read()[0]).toMatchObject({
				seq: 1, // empty log: lastSeq()=0 + 1
				actor: "pij-self",
				actorProvenance: "resolved",
			});
			expect(d.projectStore.read("fix-the-cli")?.created.actor).toBe("pij-self");
		});

		it("--actor asserts attribution and WINS over a resolvable self", () => {
			const d = platformDeps({ self: "pij-self" });
			const r = run(["project", "create", "Fix the CLI", "--actor", "lord-jordan"], d);
			expect(r.exitCode).toBe(0);
			expect(d.spineLog.read()[0]).toMatchObject({
				actor: "lord-jordan",
				actorProvenance: "asserted",
			});
			expect(d.projectStore.read("fix-the-cli")?.created.actor).toBe("lord-jordan");
		});

		it("unresolvable caller without --actor is refused with an --actor hint", () => {
			const d = platformDeps({}); // no PIJ_SESSION_ID, empty registry
			const r = run(["project", "create", "Fix the CLI"], d);
			expect(r.exitCode).not.toBe(0);
			expect(r.stderr).toContain("--actor");
			expect(d.projectStore.list()).toHaveLength(0);
			expect(d.spineLog.read()).toHaveLength(0);
		});

		it("--actor rescues an UNRESOLVABLE caller: asserted attribution succeeds", () => {
			// Audit fix (minor): the refusal hint above must not be a lie — --actor
			// is a real escape hatch, not an attribution override that still
			// requires a resolvable self.
			const d = platformDeps({}); // no PIJ_SESSION_ID, empty registry
			const r = run(["project", "create", "Fix the CLI", "--actor", "lord-jordan"], d);
			expect(r.exitCode).toBe(0);
			expect(d.projectStore.read("fix-the-cli")?.created.actor).toBe("lord-jordan");
			expect(d.spineLog.read()[0]).toMatchObject({
				kind: "project-created",
				actor: "lord-jordan",
				actorProvenance: "asserted",
			});
		});
	});

	describe("project list", () => {
		it("text lists the seeded slugs", () => {
			const d = platformDeps({
				projects: [seedProject({ slug: "beta" }), seedProject({ slug: "alpha" })],
			});
			const r = run(["project", "list"], d);
			expect(r.exitCode).toBe(0);
			expect(r.stderr).toBe("");
			expect(r.stdout).toContain("alpha");
			expect(r.stdout).toContain("beta");
		});

		it("--json is a bare array of records sorted by slug", () => {
			const d = platformDeps({
				projects: [seedProject({ slug: "beta" }), seedProject({ slug: "alpha" })],
			});
			const r = run(["project", "list", "--json"], d);
			expect(r.exitCode).toBe(0);
			const j = JSON.parse(r.stdout) as Project[];
			expect(Array.isArray(j)).toBe(true);
			expect(j.map((p) => p.slug)).toEqual(["alpha", "beta"]);
			expect(j[0]).toMatchObject({ schema_version: 1, slug: "alpha" });
		});

		it("empty store → exit 0 and an empty --json array", () => {
			const d = platformDeps({});
			expect(run(["project", "list"], d).exitCode).toBe(0);
			const r = run(["project", "list", "--json"], d);
			expect(r.exitCode).toBe(0);
			expect(JSON.parse(r.stdout)).toEqual([]);
		});
	});

	describe("project show", () => {
		it("--json prints the full record", () => {
			const d = platformDeps({
				projects: [
					seedProject({
						slug: "fix-the-cli",
						description: "Fix the CLI",
						planPath: "docs/plans/054/plan.md",
						primeId: "pij-w3",
					}),
				],
			});
			const r = run(["project", "show", "fix-the-cli", "--json"], d);
			expect(r.exitCode).toBe(0);
			expect(JSON.parse(r.stdout)).toMatchObject({
				schema_version: 1,
				slug: "fix-the-cli",
				description: "Fix the CLI",
				planPath: "docs/plans/054/plan.md",
				primeId: "pij-w3",
			});
		});

		it("text output names the slug", () => {
			const d = platformDeps({ projects: [seedProject({ slug: "fix-the-cli" })] });
			const r = run(["project", "show", "fix-the-cli"], d);
			expect(r.exitCode).toBe(0);
			expect(r.stdout).toContain("fix-the-cli");
		});

		it("missing <slug> positional → E-ARG 64", () => {
			const d = platformDeps({});
			const r = run(["project", "show"], d);
			expect(r.exitCode).toBe(64);
			expect(r.stderr).toContain("E-ARG");
			expect(r.stderr).toMatch(/slug/i);
		});

		it("unknown slug → E-NOREG, exit 3", () => {
			const d = platformDeps({ projects: [seedProject({ slug: "fix-the-cli" })] });
			const r = run(["project", "show", "ghost"], d);
			expect(r.exitCode).toBe(3);
			expect(r.stderr).toContain("E-NOREG");
		});

		it("read verbs need NO actor: list and show succeed for an unresolvable caller", () => {
			// No PIJ_SESSION_ID, empty registry — reads are exempt (convention F2).
			const d = platformDeps({ projects: [seedProject({ slug: "solo" })] });
			expect(run(["project", "list"], d).exitCode).toBe(0);
			expect(run(["project", "show", "solo"], d).exitCode).toBe(0);
		});
	});

	describe("project set", () => {
		it("--plan updates planPath and appends EXACTLY ONE project-set event", () => {
			const d = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "fix-the-cli" })],
				spine: [spineEv({ seq: 2 })],
			});
			const r = run(["project", "set", "fix-the-cli", "--plan", "docs/plans/054/plan.md"], d);
			expect(r.exitCode).toBe(0);
			expect(d.projectStore.read("fix-the-cli")?.planPath).toBe("docs/plans/054/plan.md");
			expect(d.spineLog.read()).toHaveLength(2); // seeded + exactly one new
			expect(d.spineLog.read({ since: 2 })[0]).toMatchObject({
				kind: "project-set",
				seq: 3,
				actor: "pij-self",
				refs: ["project:fix-the-cli"],
				project: "fix-the-cli",
			});
		});

		it("resolved self stamps actorProvenance 'resolved' on the project-set event (F2)", () => {
			// Audit fix (minor): asserted provenance was pinned for set, resolved
			// was not — a set-path that omits or mis-stamps it must fail here.
			const d = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "fix-the-cli" })],
			});
			const r = run(["project", "set", "fix-the-cli", "--plan", "docs/plan.md"], d);
			expect(r.exitCode).toBe(0);
			expect(d.spineLog.read()[0]).toMatchObject({
				kind: "project-set",
				actor: "pij-self",
				actorProvenance: "resolved",
			});
		});

		it("--prime updates primeId; both flags together update both fields", () => {
			const d = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "fix-the-cli" })],
			});
			const first = run(["project", "set", "fix-the-cli", "--prime", "pij-w3"], d);
			expect(first.exitCode).toBe(0);
			expect(d.projectStore.read("fix-the-cli")?.primeId).toBe("pij-w3");
			const second = run(
				["project", "set", "fix-the-cli", "--plan", "docs/plan.md", "--prime", "pij-w9"],
				d,
			);
			expect(second.exitCode).toBe(0);
			expect(d.projectStore.read("fix-the-cli")).toMatchObject({
				planPath: "docs/plan.md",
				primeId: "pij-w9",
			});
			expect(d.spineLog.read()).toHaveLength(2); // one event per successful write
		});

		it("neither --plan nor --prime → E-ARG 64", () => {
			const d = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "fix-the-cli" })],
			});
			const r = run(["project", "set", "fix-the-cli"], d);
			expect(r.exitCode).toBe(64);
			expect(r.stderr).toContain("E-ARG");
			expect(r.stderr).toMatch(/plan/i);
			expect(d.spineLog.read()).toHaveLength(0);
		});

		it("unknown slug → E-NOREG, exit 3, no event", () => {
			const d = platformDeps({ self: "pij-self" });
			const r = run(["project", "set", "ghost", "--plan", "docs/plan.md"], d);
			expect(r.exitCode).toBe(3);
			expect(r.stderr).toContain("E-NOREG");
			expect(d.spineLog.read()).toHaveLength(0);
		});

		it("NO spine event when the update write fails; the record is unchanged", () => {
			const d = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "fix-the-cli" })],
			});
			d.projectStore.failNext("update");
			const r = run(["project", "set", "fix-the-cli", "--plan", "docs/plan.md"], d);
			expect(r.exitCode).not.toBe(0);
			expect(r.stderr).toContain("E-NOREG");
			expect(d.spineLog.read()).toHaveLength(0);
			expect(d.projectStore.read("fix-the-cli")?.planPath).toBeUndefined();
			// Abort path clears the journal (audit F2) — no phantom replay later.
			expect(pendingOps(d.opJournal)).toHaveLength(0);
		});

		it("--actor stamps asserted attribution on the project-set event", () => {
			const d = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "fix-the-cli" })],
			});
			const r = run(
				["project", "set", "fix-the-cli", "--plan", "docs/plan.md", "--actor", "lord-jordan"],
				d,
			);
			expect(r.exitCode).toBe(0);
			expect(d.spineLog.read()[0]).toMatchObject({
				kind: "project-set",
				actor: "lord-jordan",
				actorProvenance: "asserted",
			});
		});

		it("unresolvable caller without --actor is refused with an --actor hint", () => {
			const d = platformDeps({ projects: [seedProject({ slug: "fix-the-cli" })] });
			const r = run(["project", "set", "fix-the-cli", "--plan", "docs/plan.md"], d);
			expect(r.exitCode).not.toBe(0);
			expect(r.stderr).toContain("--actor");
			expect(d.projectStore.read("fix-the-cli")?.planPath).toBeUndefined();
			expect(d.spineLog.read()).toHaveLength(0);
		});
	});
});

describe("spine verbs", () => {
	describe("spine append", () => {
		it("appends EXACTLY ONE event: seq = lastSeq()+1, kind, resolved actor", () => {
			const d = platformDeps({ self: "pij-self", spine: [spineEv({ seq: 3 })] });
			const r = run(["spine", "append", "--kind", "checkpoint", "--bare"], d);
			expect(r.exitCode).toBe(0);
			expect(d.spineLog.read()).toHaveLength(2); // seeded + exactly one new
			const added = d.spineLog.read({ since: 3 });
			expect(added).toHaveLength(1);
			expect(added[0]).toMatchObject({
				schema_version: 1,
				seq: 4,
				kind: "checkpoint",
				actor: "pij-self",
				actorProvenance: "resolved",
			});
		});

		it("--refs is comma-separated; absent --refs → []", () => {
			const d = platformDeps({ self: "pij-self" });
			const r = run(
				[
					"spine",
					"append",
					"--kind",
					"note",
					"--refs",
					"project:fix,assignment:asg-1,commit:abc123",
				],
				d,
			);
			expect(r.exitCode).toBe(0);
			expect(d.spineLog.read()[0]?.refs).toEqual([
				"project:fix",
				"assignment:asg-1",
				"commit:abc123",
			]);

			const bare = platformDeps({ self: "pij-self" });
			expect(run(["spine", "append", "--kind", "note", "--bare"], bare).exitCode).toBe(0);
			expect(bare.spineLog.read()[0]?.refs).toEqual([]);
		});

		it("probe-safety: kind-only append with no linking context REFUSES without --bare; log gains nothing", () => {
			const d = platformDeps({ self: "pij-self" });
			const r = run(["spine", "append", "--kind", "x"], d);
			expect(r.exitCode).toBe(64);
			expect(r.stderr).toContain("accidental probe");
			expect(d.spineLog.read()).toHaveLength(0);
			// Any linking context lifts the guard without --bare.
			expect(run(["spine", "append", "--kind", "note", "--refs", "commit:abc"], d).exitCode).toBe(
				0,
			);
		});

		it("--peer and --project pass through onto the event", () => {
			const d = platformDeps({ self: "pij-self" });
			const r = run(
				["spine", "append", "--kind", "note", "--peer", "pij-w3", "--project", "fix-the-cli"],
				d,
			);
			expect(r.exitCode).toBe(0);
			expect(d.spineLog.read()[0]).toMatchObject({ peer: "pij-w3", project: "fix-the-cli" });
		});

		it("--json prints exactly the appended event", () => {
			const d = platformDeps({ self: "pij-self" });
			const r = run(["spine", "append", "--kind", "note", "--bare", "--json"], d);
			expect(r.exitCode).toBe(0);
			const j = JSON.parse(r.stdout) as SpineEvent;
			expect(j).toMatchObject({ schema_version: 1, seq: 1, kind: "note", actor: "pij-self" });
			expect(j).toEqual(d.spineLog.read()[0]); // stdout IS the persisted event, bare
		});

		it("missing --kind → E-ARG naming kind; the log gains nothing", () => {
			const d = platformDeps({ self: "pij-self" });
			const r = run(["spine", "append"], d);
			expect(r.exitCode).toBe(64);
			expect(r.stderr).toContain("E-ARG");
			expect(r.stderr).toContain("kind");
			expect(d.spineLog.read()).toHaveLength(0);
		});

		it("--actor asserts attribution and WINS over a resolvable self", () => {
			const d = platformDeps({ self: "pij-self" });
			const r = run(["spine", "append", "--kind", "note", "--actor", "lord-jordan", "--bare"], d);
			expect(r.exitCode).toBe(0);
			expect(d.spineLog.read()[0]).toMatchObject({
				actor: "lord-jordan",
				actorProvenance: "asserted",
			});
		});

		it("unresolvable caller without --actor is refused; the log gains nothing", () => {
			const d = platformDeps({});
			const r = run(["spine", "append", "--kind", "note", "--bare"], d);
			expect(r.exitCode).not.toBe(0);
			expect(r.stderr).toContain("--actor");
			expect(d.spineLog.read()).toHaveLength(0);
		});

		it("--actor rescues an UNRESOLVABLE caller on spine append too", () => {
			// Audit fix (minor): same escape-hatch proof as project create.
			const d = platformDeps({}); // no PIJ_SESSION_ID, empty registry
			const r = run(["spine", "append", "--kind", "note", "--actor", "lord-jordan", "--bare"], d);
			expect(r.exitCode).toBe(0);
			expect(d.spineLog.read()[0]).toMatchObject({
				kind: "note",
				actor: "lord-jordan",
				actorProvenance: "asserted",
			});
		});

		it("spineLog.append failure surfaces the port's error — never fabricated success (audit F2)", () => {
			const d = platformDeps({ self: "pij-self" });
			d.spineLog.failNext("append");
			const r = run(["spine", "append", "--kind", "note", "--bare"], d);
			expect(r.exitCode).toBe(3);
			expect(r.stdout).toBe("");
			expect(r.stderr).toContain("E-NOREG");
			expect(r.stderr).toContain("injected fake spine append failure");
			expect(d.spineLog.read()).toHaveLength(0);
		});
	});

	describe("spine events", () => {
		// Mirrors the T003 exactness matrix (core/platform/spine.test.ts): peer
		// pij-a vs pij-ab, project fix vs fix-the-cli — exact equality only (AC-02).
		const MATRIX: SpineEvent[] = [
			spineEv({ seq: 1, peer: "pij-a", project: "fix" }),
			spineEv({ seq: 2, peer: "pij-ab", project: "fix-the-cli" }),
			spineEv({ seq: 3, peer: "pij-a" }),
			spineEv({ seq: 4, project: "fix" }),
			spineEv({ seq: 5 }),
			spineEv({ seq: 6, peer: "pij-a", project: "fix" }),
		];

		it("no filters → all events; --json is a bare seq-ascending array", () => {
			const d = platformDeps({ spine: MATRIX });
			const r = run(["spine", "events", "--json"], d);
			expect(r.exitCode).toBe(0);
			const j = JSON.parse(r.stdout) as SpineEvent[];
			expect(Array.isArray(j)).toBe(true);
			expect(j.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6]);
			expect(j[0]).toMatchObject({ schema_version: 1, kind: "note" });
		});

		it("--peer matches exactly — 'pij-a' never matches 'pij-ab' and vice versa (AC-02)", () => {
			const d = platformDeps({ spine: MATRIX });
			const a = run(["spine", "events", "--peer", "pij-a", "--json"], d);
			expect(a.exitCode).toBe(0);
			expect(seqsOf(a.stdout)).toEqual([1, 3, 6]);
			const ab = run(["spine", "events", "--peer", "pij-ab", "--json"], d);
			expect(seqsOf(ab.stdout)).toEqual([2]);
		});

		it("--project matches exactly — 'fix' never matches 'fix-the-cli' and vice versa (AC-02)", () => {
			const d = platformDeps({ spine: MATRIX });
			const fix = run(["spine", "events", "--project", "fix", "--json"], d);
			expect(fix.exitCode).toBe(0);
			expect(seqsOf(fix.stdout)).toEqual([1, 4, 6]);
			const full = run(["spine", "events", "--project", "fix-the-cli", "--json"], d);
			expect(seqsOf(full.stdout)).toEqual([2]);
		});

		it("--since is EXCLUSIVE (seq > since)", () => {
			const d = platformDeps({ spine: MATRIX });
			const r = run(["spine", "events", "--since", "4", "--json"], d);
			expect(r.exitCode).toBe(0);
			expect(seqsOf(r.stdout)).toEqual([5, 6]);
			const last = run(["spine", "events", "--since", "6", "--json"], d);
			expect(JSON.parse(last.stdout)).toEqual([]);
		});

		it("filters combine: since → peer → project", () => {
			const d = platformDeps({ spine: MATRIX });
			const r = run(
				["spine", "events", "--since", "1", "--peer", "pij-a", "--project", "fix", "--json"],
				d,
			);
			expect(r.exitCode).toBe(0);
			expect(seqsOf(r.stdout)).toEqual([6]);
		});

		it("non-numeric --since → E-ARG 64", () => {
			const d = platformDeps({ spine: MATRIX });
			const r = run(["spine", "events", "--since", "banana", "--json"], d);
			expect(r.exitCode).toBe(64);
			expect(r.stderr).toContain("E-ARG");
			expect(r.stderr).toContain("since");
		});

		it("text mode succeeds and needs NO actor (read exemption)", () => {
			// No PIJ_SESSION_ID, empty registry — reads are exempt (convention F2).
			const d = platformDeps({ spine: MATRIX });
			const r = run(["spine", "events"], d);
			expect(r.exitCode).toBe(0);
			expect(r.stderr).toBe("");
			expect(r.stdout).toContain("note"); // the kind is visible in human output
		});
	});

	describe("strict parse (house law) across the new verbs", () => {
		it("rejects an unknown flag on every project/spine verb → E-ARG 64", () => {
			const invocations: readonly (readonly string[])[] = [
				["project", "create", "Fix it", "--frobnicate"],
				["project", "list", "--frobnicate"],
				["project", "show", "fix", "--frobnicate"],
				["project", "set", "fix", "--plan", "docs/plan.md", "--frobnicate"],
				["spine", "append", "--kind", "note", "--frobnicate", "--bare"],
				["spine", "events", "--frobnicate"],
			];
			for (const argv of invocations) {
				const r = run(argv, platformDeps({ self: "pij-self" }));
				expect(r.exitCode, argv.join(" ")).toBe(64);
				expect(r.stderr, argv.join(" ")).toContain("frobnicate");
			}
		});

		it("rejects an unknown subcommand with a usage-ish E-ARG", () => {
			const project = run(["project", "frobnicate"], platformDeps({}));
			expect(project.exitCode).toBe(64);
			expect(project.stderr).toContain("E-ARG");
			expect(project.stderr).toContain("frobnicate");
			const spine = run(["spine", "frobnicate"], platformDeps({}));
			expect(spine.exitCode).toBe(64);
			expect(spine.stderr).toContain("frobnicate");
		});
	});
});

// ═══ review p1-review-001 HIGH-2 — journal-FIRST coupled write ══════════════
// The hard requirements under test: (a) committed project state without its
// spine event never SURVIVES a single append failure — the draft event is
// journaled durably BEFORE state commits and replayed by the next platform
// WRITE verb (appendOnce keyed by opId = exactly-once); (b) NO exception
// escapes dispatch for the platform verbs — every failure is a CliResult.
describe("HIGH-2 — journal-FIRST coupled write + no-throw dispatch", () => {
	describe("project create under spine appendOnce failure", () => {
		it("fails naming the journaled replay; record COMMITTED; ONE pending op; NO event visible", () => {
			const d = platformDeps({ self: "pij-self" });
			d.spineLog.failNext("appendOnce");
			const r = run(["project", "create", "Fix the CLI"], d);
			expect(r.exitCode).not.toBe(0);
			expect(r.stderr).toMatch(/journal/i);
			expect(r.stderr).toMatch(/replay/i);
			// The state commit stands — the failure is about the AUDIT event only.
			expect(d.projectStore.read("fix-the-cli")).toMatchObject({ slug: "fix-the-cli" });
			expect(pendingOps(d.opJournal)).toHaveLength(1);
			expect(pendingOps(d.opJournal)[0]?.draft).toMatchObject({
				kind: "project-created",
				project: "fix-the-cli",
			});
			expect(d.spineLog.read()).toHaveLength(0);
		});

		it("the NEXT platform write verb (spine append) REPLAYS it exactly once and drains the journal", () => {
			const d = platformDeps({ self: "pij-self" });
			d.spineLog.failNext("appendOnce");
			expect(run(["project", "create", "Fix the CLI"], d).exitCode).not.toBe(0);
			const next = run(["spine", "append", "--kind", "note", "--bare"], d);
			expect(next.exitCode).toBe(0);
			const created = d.spineLog.read().filter((e) => e.kind === "project-created");
			expect(created).toHaveLength(1);
			expect(created[0]).toMatchObject({ project: "fix-the-cli", actor: "pij-self" });
			expect(pendingOps(d.opJournal)).toHaveLength(0);
			// Idempotent forever after: further writes gain no duplicate.
			expect(run(["spine", "append", "--kind", "note", "--bare"], d).exitCode).toBe(0);
			expect(d.spineLog.read().filter((e) => e.kind === "project-created")).toHaveLength(1);
		});

		it("another project create also replays first — pending event exactly once, both journals drained", () => {
			const d = platformDeps({ self: "pij-self" });
			d.spineLog.failNext("appendOnce");
			expect(run(["project", "create", "First"], d).exitCode).not.toBe(0);
			const r = run(["project", "create", "Second"], d);
			expect(r.exitCode).toBe(0);
			expect(d.spineLog.read().filter((e) => e.project === "first")).toHaveLength(1);
			expect(d.spineLog.read().filter((e) => e.project === "second")).toHaveLength(1);
			expect(pendingOps(d.opJournal)).toHaveLength(0);
		});

		it("an UNREPLAYABLE predecessor BLOCKS the verb: honest recovery error, nothing mutated (review 002 G3 — supersedes the cycle-1 best-effort ruling)", () => {
			// A verb writing past a failed replay let later state events overtake
			// their causal predecessors (the reviewer's B→C-before-A→B trace).
			const d = platformDeps({ self: "pij-self" });
			d.spineLog.failNext("appendOnce"); // burns the first create's append
			d.spineLog.failNext("appendOnce"); // burns the second create's RECOVERY pass
			expect(run(["project", "create", "First"], d).exitCode).not.toBe(0);
			const r = run(["project", "create", "Second"], d);
			expect(r.exitCode).not.toBe(0);
			expect(r.stderr).toMatch(/recovery/i);
			// The blocked verb mutated NOTHING: no record, no journal entry, no event.
			expect(d.projectStore.read("second")).toBeNull();
			expect(d.spineLog.read()).toHaveLength(0);
			expect(pendingOps(d.opJournal)).toHaveLength(1);
			expect(pendingOps(d.opJournal)[0]?.draft).toMatchObject({ project: "first" });
			// Once the spine heals, the SAME verb replays the predecessor FIRST,
			// then lands its own coupled write — causal order restored.
			const healed = run(["project", "create", "Second"], d);
			expect(healed.exitCode).toBe(0);
			expect(d.spineLog.read().map((e) => e.project)).toEqual(["first", "second"]);
			expect(pendingOps(d.opJournal)).toHaveLength(0);
		});
	});

	describe("project set under spine appendOnce failure", () => {
		it("fails naming the journaled replay; update COMMITTED; ONE pending op; NO event visible", () => {
			const d = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "fix-the-cli" })],
			});
			d.spineLog.failNext("appendOnce");
			const r = run(["project", "set", "fix-the-cli", "--plan", "docs/plan.md"], d);
			expect(r.exitCode).not.toBe(0);
			expect(r.stderr).toMatch(/journal/i);
			expect(r.stderr).toMatch(/replay/i);
			expect(d.projectStore.read("fix-the-cli")?.planPath).toBe("docs/plan.md");
			expect(pendingOps(d.opJournal)).toHaveLength(1);
			expect(pendingOps(d.opJournal)[0]?.draft).toMatchObject({
				kind: "project-set",
				project: "fix-the-cli",
			});
			expect(d.spineLog.read()).toHaveLength(0);
		});

		it("the NEXT platform write verb REPLAYS the project-set event exactly once and drains the journal", () => {
			const d = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "fix-the-cli" })],
			});
			d.spineLog.failNext("appendOnce");
			expect(run(["project", "set", "fix-the-cli", "--plan", "docs/plan.md"], d).exitCode).not.toBe(
				0,
			);
			const next = run(["spine", "append", "--kind", "note", "--bare"], d);
			expect(next.exitCode).toBe(0);
			const setEvents = d.spineLog.read().filter((e) => e.kind === "project-set");
			expect(setEvents).toHaveLength(1);
			expect(setEvents[0]).toMatchObject({ project: "fix-the-cli", actor: "pij-self" });
			expect(pendingOps(d.opJournal)).toHaveLength(0);
		});

		it("project set also REPLAYS first: a pending op from a failed create lands exactly once (audit F2)", () => {
			// Seat ruling: replay runs at the start of EVERY platform write verb —
			// project set included, not just spine append / project create.
			const d = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "fix-the-cli" })],
			});
			d.spineLog.failNext("appendOnce");
			expect(run(["project", "create", "First"], d).exitCode).not.toBe(0);
			expect(pendingOps(d.opJournal)).toHaveLength(1);
			const r = run(["project", "set", "fix-the-cli", "--plan", "docs/plan.md"], d);
			expect(r.exitCode).toBe(0);
			expect(d.spineLog.read().filter((e) => e.kind === "project-created")).toHaveLength(1);
			expect(d.spineLog.read().filter((e) => e.kind === "project-set")).toHaveLength(1);
			expect(pendingOps(d.opJournal)).toHaveLength(0);
		});
	});

	describe("abort paths clear the journal — no phantom replay (audit F2)", () => {
		it("create state-write failure leaves NOTHING pending; the next write verb fabricates NO event", () => {
			const d = platformDeps({ self: "pij-self" });
			d.projectStore.failNext("create");
			expect(run(["project", "create", "Fix the CLI"], d).exitCode).not.toBe(0);
			expect(pendingOps(d.opJournal)).toHaveLength(0);
			// A leaked op would surface HERE as a project-created event for a
			// record that never committed — a false audit trail.
			expect(run(["spine", "append", "--kind", "note", "--bare"], d).exitCode).toBe(0);
			expect(d.spineLog.read().filter((e) => e.kind === "project-created")).toHaveLength(0);
			expect(d.projectStore.list()).toHaveLength(0);
		});

		it("set state-write failure leaves NOTHING pending; the next write verb fabricates NO event", () => {
			const d = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "fix-the-cli" })],
			});
			d.projectStore.failNext("update");
			expect(run(["project", "set", "fix-the-cli", "--plan", "docs/plan.md"], d).exitCode).not.toBe(
				0,
			);
			expect(pendingOps(d.opJournal)).toHaveLength(0);
			expect(run(["spine", "append", "--kind", "note", "--bare"], d).exitCode).toBe(0);
			expect(d.spineLog.read().filter((e) => e.kind === "project-set")).toHaveLength(0);
			expect(d.projectStore.read("fix-the-cli")?.planPath).toBeUndefined();
		});

		it("concurrent-create 'exists' → E-NOREG with a retry hint, journal cleared, NO event", () => {
			const base = platformDeps({ self: "pij-self" });
			const d: CliDeps = {
				...base,
				projectStore: {
					create: () => ok("exists" as const),
					update: () => ok(undefined),
					read: () => null,
					list: () => [],
				},
			};
			const r = run(["project", "create", "Fix the CLI"], d);
			expect(r.exitCode).toBe(3);
			expect(r.stderr).toContain("E-NOREG");
			expect(r.stderr).toMatch(/retry/i);
			expect(pendingOps(base.opJournal)).toHaveLength(0);
			expect(base.spineLog.read()).toHaveLength(0);
		});
	});

	describe("journal record failure aborts BEFORE any state commit", () => {
		it("create: no project record, no event, nothing pending, exit != 0", () => {
			const d = platformDeps({ self: "pij-self" });
			d.opJournal.failNext("record");
			const r = run(["project", "create", "Fix the CLI"], d);
			expect(r.exitCode).not.toBe(0);
			expect(d.projectStore.list()).toHaveLength(0);
			expect(d.spineLog.read()).toHaveLength(0);
			expect(pendingOps(d.opJournal)).toHaveLength(0);
		});

		it("set: the project is unchanged, no event, exit != 0", () => {
			const d = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "fix-the-cli" })],
			});
			d.opJournal.failNext("record");
			const r = run(["project", "set", "fix-the-cli", "--plan", "docs/plan.md"], d);
			expect(r.exitCode).not.toBe(0);
			expect(d.projectStore.read("fix-the-cli")?.planPath).toBeUndefined();
			expect(d.spineLog.read()).toHaveLength(0);
			expect(pendingOps(d.opJournal)).toHaveLength(0);
		});
	});

	describe("journal committed-marker persistence failure (plan 061 P2 T009)", () => {
		it("surfaces E-NOREG before appendOnce and leaves the landed record recoverable", () => {
			const d = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "platform" })],
			});
			d.opJournal.failNext("markCommitted");
			const failed = run(
				[
					"stream",
					"create",
					"--project",
					"platform",
					"--slug",
					"marker-failure",
					"--ordinal",
					"61",
				],
				d,
			);
			expect(failed.exitCode).toBe(3);
			expect(failed.stderr).toMatch(/committed marker/i);
			expect(d.allocationStore.read("alloc-s061-marker-failure")).not.toBeNull();
			expect(d.spineLog.read()).toEqual([]);
			expect(pendingOps(d.opJournal)).toMatchObject([
				{ phase: "intent", draft: { kind: "allocation", project: "platform" } },
			]);

			const healed = run(["spine", "append", "--kind", "note", "--bare"], d);
			expect(healed.exitCode).toBe(0);
			expect(d.spineLog.read().filter((event) => event.kind === "allocation")).toHaveLength(1);
			expect(pendingOps(d.opJournal)).toEqual([]);
		});
	});

	describe("no-throw dispatch (F1 hard requirement b)", () => {
		it("a THROWING projectStore.create is contained as an E-NOREG CliResult naming the verb", () => {
			const base = platformDeps({ self: "pij-self" });
			const d: CliDeps = {
				...base,
				projectStore: {
					create: () => {
						throw new Error("boom");
					},
					update: () => {
						throw new Error("boom");
					},
					read: () => null,
					list: () => [],
				},
			};
			const cmd = parsed(["project", "create", "Fix the CLI"]);
			let r: CliResult | undefined;
			expect(() => {
				r = dispatch(cmd, d);
			}).not.toThrow();
			expect(r?.exitCode).toBe(3);
			expect(r?.stderr).toContain("E-NOREG");
			expect(r?.stderr).toContain("project-create");
			expect(r?.stderr).toContain("boom");
		});

		// Audit F2: the gate must contain EVERY platform verb against EVERY
		// throwing port — a gate that rethrows for all-but-one verb passed the
		// single-verb test above.
		const boom = () => {
			throw new Error("boom");
		};
		const throwingDeps = (): CliDeps => ({
			...platformDeps({ self: "pij-self" }),
			projectStore: { create: boom, update: boom, read: boom, list: boom },
			spineLog: { append: boom, appendOnce: boom, hasOnce: boom, lastSeq: boom, read: boom },
			opJournal: { record: boom, markCommitted: boom, clear: boom, pending: boom },
		});
		it.each([
			["project-create", ["project", "create", "Fix the CLI"]],
			["project-list", ["project", "list"]],
			["project-show", ["project", "show", "fix-the-cli"]],
			["project-set", ["project", "set", "fix-the-cli", "--plan", "docs/plan.md"]],
			["spine-append", ["spine", "append", "--kind", "note", "--bare"]],
			["spine-events", ["spine", "events"]],
		] as const)("%s: throwing ports contained as E-NOREG naming the verb", (verb, argv) => {
			let r: CliResult | undefined;
			expect(() => {
				r = run(argv, throwingDeps());
			}).not.toThrow();
			expect(r?.exitCode).toBe(3);
			expect(r?.stderr).toContain("E-NOREG");
			expect(r?.stderr).toContain(verb);
			expect(r?.stderr).toContain("boom");
		});
	});

	describe("crash-window replay (event landed, journal not yet cleared)", () => {
		it("replay clears the op WITHOUT a duplicate event", () => {
			const d = platformDeps({ self: "pij-self" });
			const draft: SpineEventDraft = {
				schema_version: 1,
				ts: recent,
				actor: "seed-actor",
				kind: "project-created",
				refs: ["project:ghost"],
				project: "ghost",
			};
			const recorded = d.opJournal.record(draft);
			if (!recorded.ok) throw new Error("seed record failed");
			// The real crash window: append happens only AFTER the committed flip
			// (review 002 G2), so the surviving entry is committed-phase.
			const flipped = d.opJournal.markCommitted(recorded.value);
			if (!flipped.ok) throw new Error("seed markCommitted failed");
			const landed = d.spineLog.appendOnce(recorded.value, draft);
			if (!landed.ok) throw new Error("seed appendOnce failed");
			// The crash window: the event IS in the log, the journal op survives.
			expect(pendingOps(d.opJournal)).toHaveLength(1);
			const r = run(["spine", "append", "--kind", "note", "--bare"], d);
			expect(r.exitCode).toBe(0);
			expect(pendingOps(d.opJournal)).toHaveLength(0);
			expect(d.spineLog.read().filter((e) => e.kind === "project-created")).toHaveLength(1);
			expect(d.spineLog.read()).toHaveLength(2); // landed event + the new note, NO duplicate
		});

		it("a SUCCESSFUL create whose journal clear FAILS reports the cleanup honestly and replays WITHOUT a duplicate — the verb's append key IS the journal opId (audit F2, review 004 J2)", () => {
			// Drives the real window end-to-end through the VERB (the test above
			// manufactures it port-side and so cannot pin the verb's key choice):
			// an impl keying its success-path appendOnce by anything other than
			// the journaled opId duplicates the event on replay. Review 004 J2:
			// exit 0 here would hide a machine-wide write outage KNOWN at return
			// time — the verb reports the cleanup fault while the write stands.
			const d = platformDeps({ self: "pij-self" });
			d.opJournal.failNext("clear");
			const r = run(["project", "create", "Fix the CLI"], d);
			expect(r.exitCode).toBe(3);
			expect(r.stderr).toContain("WAS created");
			expect(r.stderr).toContain("injected fake op-journal clear failure");
			expect(d.projectStore.read("fix-the-cli")).not.toBeNull();
			expect(pendingOps(d.opJournal)).toHaveLength(1); // the failed clear = crash window
			const next = run(["spine", "append", "--kind", "note", "--bare"], d);
			expect(next.exitCode).toBe(0);
			expect(pendingOps(d.opJournal)).toHaveLength(0);
			expect(d.spineLog.read().filter((e) => e.kind === "project-created")).toHaveLength(1);
		});
	});

	describe("journal wiring + read-verb exemption", () => {
		it("WRITE verbs require the op journal wired (E-NOREG 'not wired'); READ verbs do not", () => {
			const { opJournal: _omit, ...rest } = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "fix-the-cli" })],
				spine: [spineEv({ seq: 1 })],
			});
			const d = rest as CliDeps;
			const writes: readonly (readonly string[])[] = [
				["project", "create", "New Thing"],
				["project", "set", "fix-the-cli", "--plan", "docs/plan.md"],
				["spine", "append", "--kind", "note", "--bare"],
			];
			for (const argv of writes) {
				const r = run(argv, d);
				expect(r.exitCode, argv.join(" ")).toBe(3);
				expect(r.stderr, argv.join(" ")).toContain("not wired");
			}
			expect(run(["project", "list"], d).exitCode).toBe(0);
			expect(run(["project", "show", "fix-the-cli"], d).exitCode).toBe(0);
			expect(run(["spine", "events"], d).exitCode).toBe(0);
		});

		it("READ verbs never replay: a pending op survives spine events / project list", () => {
			const d = platformDeps({ self: "pij-self" });
			d.spineLog.failNext("appendOnce");
			run(["project", "create", "Fix the CLI"], d);
			expect(pendingOps(d.opJournal)).toHaveLength(1);
			expect(run(["spine", "events"], d).exitCode).toBe(0);
			expect(run(["project", "list"], d).exitCode).toBe(0);
			expect(run(["project", "show", "fix-the-cli"], d).exitCode).toBe(0);
			expect(pendingOps(d.opJournal)).toHaveLength(1);
			expect(d.spineLog.read()).toHaveLength(0);
		});
	});
});

// ═══ review 002 G2/G3 — journal lifecycle: phases, causal gate, write lock ══
// G2: an op is replayable ONLY after its state write committed — an intent
// abandoned by a crash (or discarded by an aborted write whose clear was
// lost) must NEVER become a spine event for state that never landed.
// G3: a write verb must not proceed while a predecessor op is unresolvable —
// an honest recovery error before ANY mutation, so later events can never
// causally overtake earlier ones. The whole coupled write runs under the
// machine-wide platform write lock, which is what makes intent adjudication
// sound (an intent seen under the lock is never a live writer mid-window).

describe("review 002 G2/G3 — phase-aware journal recovery + causal gate", () => {
	describe("G2 — abandoned intents are discarded, never replayed", () => {
		it("an ABANDONED set intent (state write never landed) is DISCARDED — the reviewer's phantom probe", () => {
			const d = platformDeps({ self: "pij-self" });
			expect(run(["project", "create", "Fix the CLI"], d).exitCode).toBe(0);
			const before = d.projectStore.read("fix-the-cli");
			if (!before) throw new Error("seed project missing");
			// A writer crashed between record and its state write: journal the
			// set intent EXACTLY as the verb would, but never touch the store.
			const write = setProject(before, {
				actor: "pij-self",
				nowMs: Date.parse(recent),
				planPath: "docs/never-landed.md",
			});
			if (!write.ok) throw new Error("seed setProject failed");
			const recorded = d.opJournal.record(write.value.event);
			if (!recorded.ok) throw new Error("seed record failed");
			expect(pendingOps(d.opJournal)[0]?.phase).toBe("intent");
			// The next write verb must NOT replay the phantom project-set.
			const r = run(["project", "create", "Beta"], d);
			expect(r.exitCode).toBe(0);
			expect(d.spineLog.read().filter((e) => e.kind === "project-set")).toHaveLength(0);
			expect(pendingOps(d.opJournal)).toHaveLength(0); // discarded, journal drained
			expect(d.projectStore.read("fix-the-cli")?.planPath).toBeUndefined();
		});

		it("an intent whose state write LANDED (crash before the committed flip) is replayed, not discarded", () => {
			const d = platformDeps({ self: "pij-self" });
			expect(run(["project", "create", "Fix the CLI"], d).exitCode).toBe(0);
			const before = d.projectStore.read("fix-the-cli");
			if (!before) throw new Error("seed project missing");
			const write = setProject(before, {
				actor: "pij-self",
				nowMs: Date.parse(recent),
				planPath: "docs/landed.md",
			});
			if (!write.ok) throw new Error("seed setProject failed");
			const recorded = d.opJournal.record(write.value.event);
			if (!recorded.ok) throw new Error("seed record failed");
			// The state write DID land; the crash hit before markCommitted.
			const updated = d.projectStore.update(write.value.project);
			if (!updated.ok) throw new Error("seed update failed");
			const r = run(["spine", "append", "--kind", "note", "--bare"], d);
			expect(r.exitCode).toBe(0);
			expect(d.spineLog.read().filter((e) => e.kind === "project-set")).toHaveLength(1);
			expect(pendingOps(d.opJournal)).toHaveLength(0);
		});

		it("an append-failure survivor is COMMITTED phase — replayable once corroborated (review 003 H1)", () => {
			const d = platformDeps({ self: "pij-self" });
			d.spineLog.failNext("appendOnce");
			expect(run(["project", "create", "Fix the CLI"], d).exitCode).not.toBe(0);
			expect(pendingOps(d.opJournal)).toHaveLength(1);
			expect(pendingOps(d.opJournal)[0]?.phase).toBe("committed");
		});
	});

	describe("G3 — no write verb proceeds past an unresolvable predecessor", () => {
		it("a blocked project set mutates NOTHING, then the healed chain lands in causal prev→next order", () => {
			const d = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "alpha" })],
			});
			d.spineLog.failNext("appendOnce");
			// A→B: state commits, append fails, committed op survives.
			expect(run(["project", "set", "alpha", "--plan", "docs/b.md"], d).exitCode).not.toBe(0);
			expect(pendingOps(d.opJournal)[0]?.phase).toBe("committed");
			// B→C while the predecessor is still unreplayable: BLOCKED.
			d.spineLog.failNext("appendOnce");
			const blocked = run(["project", "set", "alpha", "--prime", "pij-c"], d);
			expect(blocked.exitCode).not.toBe(0);
			expect(blocked.stderr).toMatch(/recovery/i);
			expect(d.projectStore.read("alpha")?.primeId).toBeUndefined();
			expect(pendingOps(d.opJournal)).toHaveLength(1);
			expect(d.spineLog.read()).toHaveLength(0);
			// Healed: the SAME verb first replays A→B, then lands B→C — seq order
			// IS causal order, prev→next chains (the reviewer's broken trace).
			expect(run(["project", "set", "alpha", "--prime", "pij-c"], d).exitCode).toBe(0);
			const sets = d.spineLog.read().filter((e) => e.kind === "project-set");
			expect(sets).toHaveLength(2);
			expect(sets[0]?.seq).toBeLessThan(sets[1]?.seq as number);
			expect(sets[1]?.prev).toBe(sets[0]?.next);
			expect(d.projectStore.read("alpha")).toMatchObject({
				planPath: "docs/b.md",
				primeId: "pij-c",
			});
			expect(pendingOps(d.opJournal)).toHaveLength(0);
		});

		it("spine append is gated too: a note cannot causally overtake a pending committed op", () => {
			const d = platformDeps({ self: "pij-self" });
			d.spineLog.failNext("appendOnce");
			expect(run(["project", "create", "First"], d).exitCode).not.toBe(0);
			d.spineLog.failNext("appendOnce");
			const r = run(["spine", "append", "--kind", "note", "--bare"], d);
			expect(r.exitCode).not.toBe(0);
			expect(r.stderr).toMatch(/recovery/i);
			expect(d.spineLog.read()).toHaveLength(0);
			expect(pendingOps(d.opJournal)).toHaveLength(1);
		});
	});

	describe("platform write lock", () => {
		it("every platform WRITE verb takes the machine-wide lock exactly once; READ verbs never do", () => {
			const d = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "alpha" })],
			});
			expect(run(["project", "create", "New Thing"], d).exitCode).toBe(0);
			expect(run(["project", "set", "alpha", "--plan", "docs/plan.md"], d).exitCode).toBe(0);
			expect(run(["spine", "append", "--kind", "note", "--bare"], d).exitCode).toBe(0);
			expect(d.platformWriteLock.acquisitions).toBe(3);
			expect(run(["project", "list"], d).exitCode).toBe(0);
			expect(run(["project", "show", "alpha"], d).exitCode).toBe(0);
			expect(run(["spine", "events"], d).exitCode).toBe(0);
			expect(d.platformWriteLock.acquisitions).toBe(3);
		});

		it("lock acquisition failure is an honest E-NOREG and NOTHING is mutated", () => {
			const d = platformDeps({ self: "pij-self" });
			d.platformWriteLock.failNext();
			const r = run(["project", "create", "Fix the CLI"], d);
			expect(r.exitCode).toBe(3);
			expect(r.stderr).toContain("E-NOREG");
			expect(d.projectStore.list()).toHaveLength(0);
			expect(pendingOps(d.opJournal)).toHaveLength(0);
			expect(d.spineLog.read()).toHaveLength(0);
		});

		it("WRITE verbs require the write lock wired (E-NOREG 'not wired'); READ verbs do not", () => {
			const { platformWriteLock: _omit, ...rest } = platformDeps({
				self: "pij-self",
				projects: [seedProject({ slug: "alpha" })],
			});
			const d = rest as CliDeps;
			for (const argv of [
				["project", "create", "New Thing"],
				["project", "set", "alpha", "--plan", "docs/plan.md"],
				["spine", "append", "--kind", "note", "--bare"],
			] as const) {
				const r = run(argv, d);
				expect(r.exitCode, argv.join(" ")).toBe(3);
				expect(r.stderr, argv.join(" ")).toContain("not wired");
			}
			expect(run(["project", "list"], d).exitCode).toBe(0);
			expect(run(["spine", "events"], d).exitCode).toBe(0);
		});
	});
});

// ═══ review 003 — crash-window edges around the recovery gate ═══════════════
// H1: a committed journal marker is a CLAIM, not proof — trusting it bare let
// recovery forge a state event for a write that never survived. Corroborate
// with persisted state (state === next) or the durable once-record; block
// honestly otherwise.

describe("review 003 H1 — a committed marker is never trusted over persisted state", () => {
	it("marker written, state write lost: write verbs BLOCK and the false event is never forged (the reviewer's probe)", () => {
		const d = platformDeps({ self: "pij-self" });
		expect(run(["project", "create", "Alpha"], d).exitCode).toBe(0);
		const before = d.projectStore.read("alpha");
		if (!before) throw new Error("seed project missing");
		const write = setProject(before, {
			actor: "pij-self",
			nowMs: Date.parse(recent),
			planPath: "docs/b.md",
		});
		if (!write.ok) throw new Error("seed setProject failed");
		// Crash image (reviewer's fs probe): the A→B intent was recorded AND
		// durably marked committed, but the state write itself did not survive
		// — the store still holds A, and no event ever reached the spine.
		const recorded = d.opJournal.record(write.value.event);
		if (!recorded.ok) throw new Error("seed record failed");
		const flipped = d.opJournal.markCommitted(recorded.value);
		if (!flipped.ok) throw new Error("seed markCommitted failed");
		const eventsBefore = d.spineLog.read().length;
		// The probe verb exited 0 and forged the false A→B at the next seq.
		const r = run(["spine", "append", "--kind", "note", "--bare"], d);
		expect(r.exitCode).not.toBe(0);
		expect(r.stderr).toMatch(/recovery/i);
		expect(r.stderr).toMatch(/state write/i);
		expect(d.spineLog.read().filter((e) => e.kind === "project-set")).toHaveLength(0);
		expect(d.spineLog.read()).toHaveLength(eventsBefore);
		expect(pendingOps(d.opJournal)).toHaveLength(1); // survives for human resolution
		expect(d.projectStore.read("alpha")?.planPath).toBeUndefined();
		// Every write verb is equally gated — no path forges or writes past it.
		expect(run(["project", "create", "Beta"], d).exitCode).not.toBe(0);
		expect(d.projectStore.read("beta")).toBeNull();
	});

	it("clear lost after a fully-landed set: the verb reports the cleanup fault (review 004 J2) and recovery resolves to the EXISTING event — no duplicate, causal chain intact", () => {
		const d = platformDeps({ self: "pij-self" });
		expect(run(["project", "create", "Alpha"], d).exitCode).toBe(0);
		// A set whose write AND event landed but whose CLEAR failed (the one
		// legitimate way a committed marker outlives its state matching next).
		d.opJournal.failNext("clear");
		const lost = run(["project", "set", "alpha", "--plan", "docs/b.md"], d);
		expect(lost.exitCode).not.toBe(0); // honest cleanup fault (review 004 J2)
		expect(d.projectStore.read("alpha")?.planPath).toBe("docs/b.md"); // …the write stands
		expect(pendingOps(d.opJournal)).toHaveLength(1);
		// The next write recovers the surviving op to its EXISTING event first,
		// then lands B→C.
		const r = run(["project", "set", "alpha", "--prime", "pij-c"], d);
		expect(r.exitCode).toBe(0);
		expect(pendingOps(d.opJournal)).toHaveLength(0);
		// No duplicate: one create + exactly two sets, chained prev→next.
		const sets = d.spineLog.read().filter((e) => e.kind === "project-set");
		expect(sets).toHaveLength(2);
		expect(sets[1]?.prev).toBe(sets[0]?.next);
	});
});

describe("review 003 M3 — a failed journal clear stops the verb, never a delayed wedge", () => {
	it("abandoned intent + failed recovery clear: the successor verb FAILS with nothing mutated (the reviewer's probe)", () => {
		const d = platformDeps({ self: "pij-self" });
		expect(run(["project", "create", "Alpha"], d).exitCode).toBe(0);
		const before = d.projectStore.read("alpha");
		if (!before) throw new Error("seed project missing");
		// The record→state crash window: an abandoned set intent survives.
		const write = setProject(before, {
			actor: "pij-self",
			nowMs: Date.parse(recent),
			planPath: "docs/never-landed.md",
		});
		if (!write.ok) throw new Error("seed setProject failed");
		const recorded = d.opJournal.record(write.value.event);
		if (!recorded.ok) throw new Error("seed record failed");
		// The reviewer's probe: recovery DISCARDS the intent, its clear fails
		// silently, the successor exits 0 and mutates — and the next platform
		// write then wedges on the stale intent ("neither prev nor next").
		d.opJournal.failNext("clear");
		const r = run(["project", "set", "alpha", "--plan", "docs/c.md"], d);
		expect(r.exitCode).not.toBe(0);
		expect(r.stderr).toMatch(/recovery/i);
		expect(r.stderr).toMatch(/clear/i);
		// The successor mutated NOTHING; the intent survives for the retry.
		expect(d.projectStore.read("alpha")?.planPath).toBeUndefined();
		expect(d.spineLog.read().filter((e) => e.kind === "project-set")).toHaveLength(0);
		expect(pendingOps(d.opJournal)).toHaveLength(1);
		// Healed clear: the SAME verb discards the phantom and lands its own
		// coupled write — exactly one set event, no wedge one write later.
		const healed = run(["project", "set", "alpha", "--plan", "docs/c.md"], d);
		expect(healed.exitCode).toBe(0);
		expect(d.projectStore.read("alpha")?.planPath).toBe("docs/c.md");
		expect(d.spineLog.read().filter((e) => e.kind === "project-set")).toHaveLength(1);
		expect(pendingOps(d.opJournal)).toHaveLength(0);
		expect(run(["spine", "append", "--kind", "note", "--bare"], d).exitCode).toBe(0);
	});
});

// ═══ review 004 J2 — verb-side clear() results are honest, never swallowed ══
// The Result surface added by review 003 M3 was inspected inside recovery but
// discarded at all four verb-side call sites. For a PERSISTENT cleanup fault
// (permissions, I/O) the success-path swallow returns exit 0 while planting a
// machine-wide write outage known at return time; abort-path swallows drop
// the residual-entry diagnostic the operator needs alongside the primary
// error.

describe("review 004 J2 — verb-side clear results are honest, never swallowed", () => {
	it("persistent clear failure: the set exits nonzero naming the cleanup fault and the blocked writes (the reviewer's probe)", () => {
		const d = platformDeps({ self: "pij-self", projects: [seedProject({ slug: "alpha" })] });
		// The reviewer's probe: an otherwise-normal journal whose clear always
		// fails. The probe's set exited 0 with no warning and only the NEXT
		// verb returned the outage.
		d.opJournal.failNext("clear");
		const r = run(["project", "set", "alpha", "--plan", "docs/b.md"], d);
		expect(r.exitCode).toBe(3);
		expect(r.stderr).toContain("E-NOREG");
		expect(r.stderr).toContain("WAS updated");
		expect(r.stderr).toContain("injected fake op-journal clear failure");
		expect(r.stderr).toMatch(/further platform writes are blocked/i);
		// The write and its audit event DID land — the fault is cleanup-only.
		expect(d.projectStore.read("alpha")?.planPath).toBe("docs/b.md");
		expect(d.spineLog.read().filter((e) => e.kind === "project-set")).toHaveLength(1);
		expect(pendingOps(d.opJournal)).toHaveLength(1);
		// Still failing: the following append blocks in RECOVERY (resolves the
		// existing event, cannot clear) — the outage was already announced by
		// the set instead of surfacing here first.
		d.opJournal.failNext("clear");
		const next = run(["spine", "append", "--kind", "note", "--bare"], d);
		expect(next.exitCode).toBe(3);
		expect(next.stderr).toMatch(/recovery/i);
		// Healed: the entry drains to its EXISTING event — exactly one set.
		const healed = run(["spine", "append", "--kind", "note", "--bare"], d);
		expect(healed.exitCode).toBe(0);
		expect(d.spineLog.read().filter((e) => e.kind === "project-set")).toHaveLength(1);
		expect(pendingOps(d.opJournal)).toHaveLength(0);
	});

	it("set abort path keeps the primary error AND reports the failed cleanup's residual journal entry", () => {
		const d = platformDeps({ self: "pij-self", projects: [seedProject({ slug: "alpha" })] });
		d.projectStore.failNext("update");
		d.opJournal.failNext("clear");
		const r = run(["project", "set", "alpha", "--plan", "docs/b.md"], d);
		expect(r.exitCode).not.toBe(0);
		// Primary cause first, residual diagnostic alongside — neither is lost.
		expect(r.stderr).toContain("injected fake project update failure");
		expect(r.stderr).toContain("injected fake op-journal clear failure");
		expect(r.stderr).toMatch(/residual/i);
		expect(d.projectStore.read("alpha")?.planPath).toBeUndefined();
		expect(d.spineLog.read()).toHaveLength(0);
		expect(pendingOps(d.opJournal)).toHaveLength(1); // the intent survives
		// The residual intent is adjudicated (discarded) by the next verb.
		const healed = run(["project", "set", "alpha", "--plan", "docs/c.md"], d);
		expect(healed.exitCode).toBe(0);
		expect(pendingOps(d.opJournal)).toHaveLength(0);
	});

	it("create abort path (store create fails) carries both errors too", () => {
		const d = platformDeps({ self: "pij-self" });
		d.projectStore.failNext("create");
		d.opJournal.failNext("clear");
		const r = run(["project", "create", "Beta"], d);
		expect(r.exitCode).not.toBe(0);
		expect(r.stderr).toContain("injected fake project create failure");
		expect(r.stderr).toContain("injected fake op-journal clear failure");
		expect(d.projectStore.read("beta")).toBeNull();
		expect(pendingOps(d.opJournal)).toHaveLength(1);
	});
});

// H2: a corrupt op-shaped journal entry is a damaged SAFETY record, not an
// ignorable file — silently skipping it let a write verb sail past the
// recovery gate over an unaudited predecessor. Real fs adapters end-to-end:
// the reviewer's probe ran the actual CLI over a planted malformed entry.

describe("review 003 H2 — a corrupt journal entry fails the verb, never bypassed (real fs)", () => {
	it("a malformed UUID-shaped spine/ops entry blocks project create, naming the path; nothing is created", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-cli-h2-"));
		try {
			const badPath = join(home, "spine", "ops", "1b671a64-40d5-491e-99b0-da01ff1f3341.json");
			mkdirSync(join(home, "spine", "ops"), { recursive: true });
			writeFileSync(badPath, "{ this is not a journal op");
			const d: CliDeps = {
				...deps({}),
				projectStore: new FsProjectStore(home),
				assignmentStore: new FsAssignmentStore(home),
				allocationStore: new FsAllocationStore(home),
				fenceStore: new FsFenceStore(home),
				dispatchStore: new FsDispatchStore(home),
				spineLog: new FsSpineLog(home),
				opJournal: new FsOpJournal(home),
				platformWriteLock: new FsPlatformWriteLock(home, { lockBudgetMs: 200 }),
			};
			// The reviewer's probe exited 0 and created Beta past the dead entry.
			const r = run(["project", "create", "Beta", "--actor", "tester"], d);
			expect(r.exitCode).toBe(3);
			expect(r.stderr).toContain("E-NOREG");
			expect(r.stderr).toContain(badPath);
			expect(new FsProjectStore(home).read("beta")).toBeNull();
			expect(new FsSpineLog(home).read()).toEqual([]);
			// The damaged record is left for the operator, never deleted blind.
			expect(existsSync(badPath)).toBe(true);
			// The write lock was released on the failure path: a later healed
			// verb is not wedged by THIS failure (remove the bad entry → works).
			rmSync(badPath);
			expect(run(["project", "create", "Beta", "--actor", "tester"], d).exitCode).toBe(0);
			expect(new FsProjectStore(home).read("beta")).toMatchObject({ slug: "beta" });
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});

// ═══ review 004 J1 — a once-record proves the EVENT survived, not the state ═
// Project publication and once-file publication are separate directory
// entries under best-effort fsync: a crash can keep the later spine link
// while dropping the earlier project rename. The cycle-3 gate let the
// once-record override a persisted-state mismatch — the reviewer's real-fs
// probe replayed the op, cleared the ONLY recovery record, and permanently
// blessed an A→B event over state A. A state mismatch must always block for
// a coupled op; once-only corroboration is for uncoupled drafts alone.

describe("review 004 J1 — an existing once-record never overrides a state mismatch (real fs)", () => {
	it("set: once-file survived, project publish did not — write verbs BLOCK and the journal is retained (the reviewer's probe)", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-cli-j1-"));
		try {
			const d: CliDeps = {
				...deps({}),
				projectStore: new FsProjectStore(home),
				assignmentStore: new FsAssignmentStore(home),
				allocationStore: new FsAllocationStore(home),
				fenceStore: new FsFenceStore(home),
				dispatchStore: new FsDispatchStore(home),
				spineLog: new FsSpineLog(home),
				opJournal: new FsOpJournal(home),
				platformWriteLock: new FsPlatformWriteLock(home, { lockBudgetMs: 200 }),
			};
			expect(run(["project", "create", "Alpha", "--actor", "tester"], d).exitCode).toBe(0);
			const before = new FsProjectStore(home).read("alpha");
			if (!before) throw new Error("seed project missing");
			const write = setProject(before, {
				actor: "tester",
				nowMs: Date.parse(recent),
				planPath: "docs/b.md",
			});
			if (!write.ok) throw new Error("seed setProject failed");
			// Crash image: journal, committed flip and appendOnce all landed —
			// the A→B project publish itself did not survive (store stays A).
			const journal = new FsOpJournal(home);
			const recorded = journal.record(write.value.event);
			if (!recorded.ok) throw new Error("seed record failed");
			const flipped = journal.markCommitted(recorded.value);
			if (!flipped.ok) throw new Error("seed markCommitted failed");
			const landed = new FsSpineLog(home).appendOnce(recorded.value, write.value.event);
			if (!landed.ok) throw new Error("seed appendOnce failed");
			expect(new FsSpineLog(home).hasOnce(recorded.value)).toBe(true);
			// The probe: recovery returned ok({replayed: 1}) and cleared the only
			// recovery record. It must block instead.
			const r = run(["spine", "append", "--kind", "note", "--actor", "tester", "--bare"], d);
			expect(r.exitCode).toBe(3);
			expect(r.stderr).toContain("E-NOREG");
			expect(r.stderr).toContain(recorded.value);
			expect(r.stderr).toMatch(/state/i);
			// Nothing moved: state still A, journal retained, no note appended.
			expect(new FsProjectStore(home).read("alpha")?.planPath).toBeUndefined();
			const pending = new FsOpJournal(home).pending();
			if (!pending.ok) throw new Error(pending.message);
			expect(pending.value).toHaveLength(1);
			expect(new FsSpineLog(home).read().filter((e) => e.kind === "note")).toHaveLength(0);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("create: once-file survived, the record never materialized — BLOCKS, journal retained", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-cli-j1c-"));
		try {
			const d: CliDeps = {
				...deps({}),
				projectStore: new FsProjectStore(home),
				assignmentStore: new FsAssignmentStore(home),
				allocationStore: new FsAllocationStore(home),
				fenceStore: new FsFenceStore(home),
				dispatchStore: new FsDispatchStore(home),
				spineLog: new FsSpineLog(home),
				opJournal: new FsOpJournal(home),
				platformWriteLock: new FsPlatformWriteLock(home, { lockBudgetMs: 200 }),
			};
			const write = createProject({
				description: "Beta",
				actor: "tester",
				nowMs: Date.parse(recent),
				existingSlugs: new Set<string>(),
			});
			if (!write.ok) throw new Error("seed createProject failed");
			const journal = new FsOpJournal(home);
			const recorded = journal.record(write.value.event);
			if (!recorded.ok) throw new Error("seed record failed");
			const flipped = journal.markCommitted(recorded.value);
			if (!flipped.ok) throw new Error("seed markCommitted failed");
			const landed = new FsSpineLog(home).appendOnce(recorded.value, write.value.event);
			if (!landed.ok) throw new Error("seed appendOnce failed");
			// The 'project-created Beta' event is in the log; projects/beta is not.
			const r = run(["project", "create", "Gamma", "--actor", "tester"], d);
			expect(r.exitCode).toBe(3);
			expect(r.stderr).toContain("E-NOREG");
			expect(r.stderr).toContain(recorded.value);
			expect(new FsProjectStore(home).read("beta")).toBeNull();
			expect(new FsProjectStore(home).read("gamma")).toBeNull();
			const pending = new FsOpJournal(home).pending();
			if (!pending.ok) throw new Error(pending.message);
			expect(pending.value).toHaveLength(1);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});

// ═══ review 005 K1 — a cleared op resurrected by power loss stays resolved ══
// clear's removal durability used to ride a fail-soft directory fsync. The
// reviewer restored the exact pre-clear journal bytes after a successor
// landed: a resurrected aborted intent replayed as a FORGED event attributed
// to the aborted writer after the winner's, and a resurrected committed op
// false-blocked every later platform write forever. clear now records a
// durably fsynced `<opId>.resolved` tombstone BEFORE the unlink and leaves it
// until a load-bearing dir fsync proves the removal durable — so any real
// power-loss resurrection arrives WITH its tombstone (the op entry can only
// come back while the tombstone, made durable first, still stands), and
// recovery sweeps the pair as resolved instead of adjudicating it as live.

describe("review 005 K1 — a cleared op resurrected by power loss can never forge or false-block (real fs)", () => {
	it("resurrected aborted intent after a genuine winner: swept as resolved, never replayed as the aborted writer (the reviewer's probe)", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-cli-k1a-"));
		try {
			const d: CliDeps = {
				...deps({}),
				projectStore: new FsProjectStore(home),
				assignmentStore: new FsAssignmentStore(home),
				allocationStore: new FsAllocationStore(home),
				fenceStore: new FsFenceStore(home),
				dispatchStore: new FsDispatchStore(home),
				spineLog: new FsSpineLog(home),
				opJournal: new FsOpJournal(home),
				platformWriteLock: new FsPlatformWriteLock(home, { lockBudgetMs: 200 }),
			};
			expect(run(["project", "create", "Alpha", "--actor", "creator"], d).exitCode).toBe(0);
			const before = new FsProjectStore(home).read("alpha");
			if (!before) throw new Error("seed project missing");
			// The aborted writer's A→B intent: journaled, then the update aborted
			// and the abort path cleared the entry (state never left A).
			const write = setProject(before, {
				actor: "aborted-writer",
				nowMs: Date.parse(recent),
				planPath: "docs/b.md",
			});
			if (!write.ok) throw new Error("seed setProject failed");
			const journal = new FsOpJournal(home);
			const recorded = journal.record(write.value.event);
			if (!recorded.ok) throw new Error("seed record failed");
			const opPath = join(home, "spine", "ops", `${recorded.value}.json`);
			const preClearBytes = readFileSync(opPath, "utf8");
			const cleared = journal.clear(recorded.value);
			if (!cleared.ok) throw new Error("seed clear failed");
			// A genuine A→B by another actor lands — same next, different writer.
			expect(
				run(["project", "set", "alpha", "--plan", "docs/b.md", "--actor", "winning-writer"], d)
					.exitCode,
			).toBe(0);
			// Power-loss image: the clear's unlink never became durable. The op
			// entry can only resurrect while its tombstone — made durable FIRST
			// and discarded only after the absence is fsync-proven — still
			// stands, so the faithful crash image restores both.
			writeFileSync(opPath, preClearBytes);
			writeFileSync(
				join(home, "spine", "ops", `${recorded.value}.resolved`),
				JSON.stringify({ schema_version: 1, opId: recorded.value }),
			);
			// The probe: recovery replayed the resurrected intent (state === next
			// matched the WINNER's write) and appended a second A→B attributed to
			// the aborted writer AFTER the winner's event. It must sweep instead.
			const r = run(["spine", "append", "--kind", "note", "--actor", "tester", "--bare"], d);
			expect(r.exitCode).toBe(0);
			const sets = new FsSpineLog(home).read().filter((e) => e.kind === "project-set");
			expect(sets).toHaveLength(1);
			expect(sets.map((e) => e.actor)).toEqual(["winning-writer"]);
			expect(new FsSpineLog(home).read().filter((e) => e.kind === "note")).toHaveLength(1);
			expect(new FsProjectStore(home).read("alpha")?.planPath).toBe("docs/b.md");
			const pending = new FsOpJournal(home).pending();
			if (!pending.ok) throw new Error(pending.message);
			expect(pending.value).toEqual([]);
			expect(existsSync(opPath)).toBe(false);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("resurrected committed op after the projection legitimately moved on: swept as resolved, never a permanent false-block (the reviewer's probe)", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-cli-k1b-"));
		try {
			const d: CliDeps = {
				...deps({}),
				projectStore: new FsProjectStore(home),
				assignmentStore: new FsAssignmentStore(home),
				allocationStore: new FsAllocationStore(home),
				fenceStore: new FsFenceStore(home),
				dispatchStore: new FsDispatchStore(home),
				spineLog: new FsSpineLog(home),
				opJournal: new FsOpJournal(home),
				platformWriteLock: new FsPlatformWriteLock(home, { lockBudgetMs: 200 }),
			};
			expect(run(["project", "create", "Alpha", "--actor", "creator"], d).exitCode).toBe(0);
			const before = new FsProjectStore(home).read("alpha");
			if (!before) throw new Error("seed project missing");
			// A fully-landed A→B coupled write, built exactly as the verb does:
			// intent, committed flip, state write, once-append — then cleared.
			const write = setProject(before, {
				actor: "original-writer",
				nowMs: Date.parse(recent),
				planPath: "docs/b.md",
			});
			if (!write.ok) throw new Error("seed setProject failed");
			const journal = new FsOpJournal(home);
			const recorded = journal.record(write.value.event);
			if (!recorded.ok) throw new Error("seed record failed");
			const flipped = journal.markCommitted(recorded.value);
			if (!flipped.ok) throw new Error("seed markCommitted failed");
			const opPath = join(home, "spine", "ops", `${recorded.value}.json`);
			const preClearBytes = readFileSync(opPath, "utf8");
			const updated = new FsProjectStore(home).update(write.value.project);
			if (!updated.ok) throw new Error("seed update failed");
			const landed = new FsSpineLog(home).appendOnce(recorded.value, write.value.event);
			if (!landed.ok) throw new Error("seed appendOnce failed");
			const cleared = journal.clear(recorded.value);
			if (!cleared.ok) throw new Error("seed clear failed");
			// The projection legitimately moves on: B→C by another writer.
			expect(
				run(["project", "set", "alpha", "--plan", "docs/c.md", "--actor", "mover"], d).exitCode,
			).toBe(0);
			// Power-loss image: op bytes back beside the surviving tombstone.
			writeFileSync(opPath, preClearBytes);
			writeFileSync(
				join(home, "spine", "ops", `${recorded.value}.resolved`),
				JSON.stringify({ schema_version: 1, opId: recorded.value }),
			);
			// The probe: state was genuinely C and the once-record existed, yet
			// recovery returned E-NOREG and retained the entry FOREVER. It must
			// sweep the resolved pair and let the successor through.
			const r = run(["spine", "append", "--kind", "note", "--actor", "tester", "--bare"], d);
			expect(r.exitCode).toBe(0);
			// Original A→B once-append plus mover's B→C — no duplicate replay.
			const sets = new FsSpineLog(home).read().filter((e) => e.kind === "project-set");
			expect(sets).toHaveLength(2);
			expect(new FsSpineLog(home).read().filter((e) => e.kind === "note")).toHaveLength(1);
			expect(new FsProjectStore(home).read("alpha")?.planPath).toBe("docs/c.md");
			const pending = new FsOpJournal(home).pending();
			if (!pending.ok) throw new Error(pending.message);
			expect(pending.value).toEqual([]);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});

// ─── review 001 F3 — prev/next audit payload at the dispatch level ──────────
// The event read back from the log must alone answer who changed what: next
// on create parses to the persisted record; a real set through dispatch shows
// canonical prev→next across the change (WS-5/AC-03).

describe("F3 — prev/next ride the project events through dispatch", () => {
	it("project create appends next = the persisted record, and NO prev key", () => {
		const d = platformDeps({ self: "pij-self" });
		const r = run(["project", "create", "Fix the CLI"], d);
		expect(r.exitCode).toBe(0);
		const created = d.spineLog.read().filter((e) => e.kind === "project-created");
		expect(created).toHaveLength(1);
		expect(created[0].next).toBeTypeOf("string");
		// Single-line compact JSON — the spine is ndjson.
		expect(created[0].next).not.toContain("\n");
		expect(JSON.parse(created[0].next as string)).toEqual(d.projectStore.read("fix-the-cli"));
		expect("prev" in created[0]).toBe(false);
	});

	it("project set appends canonical prev→next across a real dispatch-level change", () => {
		const d = platformDeps({
			self: "pij-self",
			projects: [seedProject({ slug: "fix-the-cli", planPath: "docs/plans/054/plan.md" })],
		});
		const before = d.projectStore.read("fix-the-cli");
		const r = run(["project", "set", "fix-the-cli", "--prime", "pij-w3"], d);
		expect(r.exitCode).toBe(0);
		const sets = d.spineLog.read().filter((e) => e.kind === "project-set");
		expect(sets).toHaveLength(1);
		expect(JSON.parse(sets[0].prev as string)).toEqual(before);
		expect(JSON.parse(sets[0].next as string)).toEqual(d.projectStore.read("fix-the-cli"));
		expect(sets[0].prev).not.toBe(sets[0].next);
	});

	it("successive sets chain: each event's prev equals the previous event's next", () => {
		const d = platformDeps({ self: "pij-self", projects: [seedProject({ slug: "fix-the-cli" })] });
		expect(run(["project", "set", "fix-the-cli", "--prime", "pij-a"], d).exitCode).toBe(0);
		expect(run(["project", "set", "fix-the-cli", "--prime", "pij-b"], d).exitCode).toBe(0);
		const sets = d.spineLog.read().filter((e) => e.kind === "project-set");
		expect(sets).toHaveLength(2);
		expect(sets[1].prev).toBe(sets[0].next);
		// The history alone recovers the A→B prime chain (review scenario).
		expect((JSON.parse(sets[0].next as string) as Project).primeId).toBe("pij-a");
		expect((JSON.parse(sets[1].next as string) as Project).primeId).toBe("pij-b");
	});

	it("no-op set still appends, with IDENTICAL prev/next (ruled: audited intent, no delta-skip)", () => {
		const d = platformDeps({
			self: "pij-self",
			projects: [seedProject({ slug: "fix-the-cli", planPath: "docs/plan.md" })],
		});
		const r = run(["project", "set", "fix-the-cli", "--plan", "docs/plan.md"], d);
		expect(r.exitCode).toBe(0);
		const sets = d.spineLog.read().filter((e) => e.kind === "project-set");
		expect(sets).toHaveLength(1);
		expect(sets[0].prev).toBe(sets[0].next);
		expect(JSON.parse(sets[0].prev as string)).toEqual(d.projectStore.read("fix-the-cli"));
	});
});

// ─── review 001 F7 — an invalid deps clock is an E-ARG envelope, not a throw ─
// F2's dispatch wrapper is the backstop, not the fix: the write verbs must
// propagate the constructor's E-ARG (exit 64) with NOTHING committed,
// journaled, or appended.

describe("F7 — invalid deps clock propagates E-ARG (exit 64), never a throw", () => {
	function nanClockDeps(opts: Parameters<typeof platformDeps>[0] = {}) {
		const d = platformDeps({ self: "pij-self", ...opts });
		return {
			...d,
			process: new FakeProcess(999, Number.NaN, { PIJ_SESSION_ID: "pij-self" }, [100]),
		};
	}

	it("project create: exit 64 naming nowMs; store, journal, and spine untouched", () => {
		const d = nanClockDeps();
		const r = run(["project", "create", "New Thing"], d);
		expect(r.exitCode).toBe(64);
		expect(r.stderr).toContain("E-ARG");
		expect(r.stderr).toContain("nowMs");
		expect(d.projectStore.read("new-thing")).toBeNull();
		expect(pendingOps(d.opJournal)).toEqual([]);
		expect(d.spineLog.read()).toEqual([]);
	});

	it("project set: exit 64 naming nowMs; record, journal, and spine untouched", () => {
		const d = nanClockDeps({
			projects: [seedProject({ slug: "fix-the-cli", planPath: "docs/plans/054/plan.md" })],
		});
		const before = d.projectStore.read("fix-the-cli");
		const r = run(["project", "set", "fix-the-cli", "--prime", "pij-w3"], d);
		expect(r.exitCode).toBe(64);
		expect(r.stderr).toContain("nowMs");
		expect(d.projectStore.read("fix-the-cli")).toEqual(before);
		expect(pendingOps(d.opJournal)).toEqual([]);
		expect(d.spineLog.read()).toEqual([]);
	});

	it("spine append: exit 64 naming nowMs; nothing appended", () => {
		const d = nanClockDeps();
		const r = run(["spine", "append", "--kind", "note", "--bare"], d);
		expect(r.exitCode).toBe(64);
		expect(r.stderr).toContain("nowMs");
		expect(d.spineLog.read()).toEqual([]);
	});
});

// ═════════════════════════════════════════════════════════════════════════════
// plan 054 Phase 2 T004 — task/state verbs (AC-05/AC-06)
// task set / state set / state verify run the journal-FIRST coupled write:
// the assignment RECORD is the state side (prev/next = canonicalAssignmentJson,
// states[] excluded), the semantic transition rides in structured refs, the
// stamped seq joins states[] inside the pend window, and the node descriptor
// carries the currentAssignment/currentTask/semanticState denorm.
// ═════════════════════════════════════════════════════════════════════════════

function nodeDeps(over: Parameters<typeof platformDeps>[0] = {}) {
	return platformDeps({
		self: "pij-self",
		descs: [desc({ id: "pij-node" }), desc({ id: "pij-other" })],
		...over,
	});
}

describe("task/state verb parsing (T004)", () => {
	it.each([
		[["task", "set"], "usage"],
		[["task", "set", "pij-node"], "usage"],
		[["task", "bogus"], "unknown task subcommand"],
		[["state", "set", "pij-node"], "usage"],
		[["state", "verify"], "usage"],
	])("%j is E-ARG exit 64", (argv, needle) => {
		const r = run(argv as string[], nodeDeps());
		expect(r.exitCode).toBe(64);
		expect(r.stderr.toLowerCase()).toContain(needle);
	});

	it("rejects a word outside the ruled semantic vocabulary, naming it (WS-6)", () => {
		const r = run(["state", "set", "pij-node", "working"], nodeDeps());
		expect(r.exitCode).toBe(64);
		expect(r.stderr).toContain("working");
		expect(r.stderr).toContain("blocked|question|hold|waiting|ready|failed|cancelled|done");
	});

	it("rejects unknown flags and extra positionals", () => {
		expect(run(["task", "set", "pij-node", "t", "--bogus", "x"], nodeDeps()).exitCode).toBe(64);
		expect(run(["state", "set", "pij-node", "ready", "extra"], nodeDeps()).exitCode).toBe(64);
	});

	it("legacy `pij state <id>` still routes to the state card (regression)", () => {
		const r = run(["state", "pij-node"], nodeDeps());
		expect(r.exitCode).toBe(0);
		expect(r.stdout).toContain("pij-node");
	});
});

describe("task set (T005)", () => {
	it("opens an assignment, denorms the descriptor, couples EXACTLY ONE task-set event", () => {
		const d = nodeDeps();
		const r = run(["task", "set", "pij-node", "review the packet", "--json"], d);
		expect(r.exitCode).toBe(0);
		const record = JSON.parse(r.stdout) as Assignment;
		expect(record.id.startsWith("asg-")).toBe(true);
		expect(record.nodeId).toBe("pij-node");
		expect(record.task).toBe("review the packet");
		expect(record.states).toEqual([]);
		expect(record.opened.actor).toBe("pij-self");
		// bare persisted record (house: no envelope)
		expect(record).toEqual(d.assignmentStore.read(record.id));
		// descriptor denorm
		const node = d.registry.read("pij-node");
		expect(node?.currentAssignment).toBe(record.id);
		expect(node?.currentTask).toBe("review the packet");
		// exactly one coupled event
		const events = d.spineLog.read();
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ kind: "task-set", actor: "pij-self", peer: "pij-node" });
		expect(events[0]?.refs).toContain("node:pij-node");
		expect(events[0]?.refs).toContain(`assignment:${record.id}`);
		expect(events[0]?.prev).toBeUndefined();
		expect(events[0]?.next).toBe(canonicalAssignmentJson(record));
		// journal drained
		expect(pendingOps(d.opJournal)).toHaveLength(0);
	});

	it("a fresh task set replaces a stale semanticState denorm (new assignment, no declared state)", () => {
		const d = platformDeps({
			self: "pij-self",
			descs: [desc({ id: "pij-node", semanticState: "done", currentTask: "old" })],
		});
		const r = run(["task", "set", "pij-node", "new work"], d);
		expect(r.exitCode).toBe(0);
		const node = d.registry.read("pij-node");
		expect(node?.semanticState).toBeUndefined();
		expect(node?.currentTask).toBe("new work");
	});

	it("--project pins the slug on record, event and refs; unknown slug is E-NOREG untouched", () => {
		const d = nodeDeps({ projects: [seedProject({ slug: "alpha" })] });
		const r = run(["task", "set", "pij-node", "work", "--project", "alpha", "--json"], d);
		expect(r.exitCode).toBe(0);
		const record = JSON.parse(r.stdout) as Assignment;
		expect(record.projectSlug).toBe("alpha");
		const ev = d.spineLog.read()[0];
		expect(ev?.project).toBe("alpha");
		expect(ev?.refs).toContain("project:alpha");

		const bad = run(["task", "set", "pij-node", "work", "--project", "ghost"], nodeDeps());
		expect(bad.exitCode).toBe(3);
		expect(bad.stderr).toContain("ghost");
	});

	it("unknown node is E-NOID; nothing written anywhere", () => {
		const d = nodeDeps();
		const r = run(["task", "set", "pij-ghost", "work"], d);
		expect(r.exitCode).toBe(2);
		expect(d.spineLog.read()).toEqual([]);
		expect(d.assignmentStore.list()).toEqual([]);
	});

	it("attribution: unresolvable self without --actor is E-NOID naming the escape hatch; --actor asserts", () => {
		// cwd away from every descriptor's folder: no ambient, no env, no
		// pane — self is genuinely unresolvable.
		const noSelf = platformDeps({ descs: [desc({ id: "pij-node" })], cwd: "/elsewhere" });
		const r = run(["task", "set", "pij-node", "work"], noSelf);
		expect(r.exitCode).not.toBe(0);
		expect(r.stderr).toContain("--actor");

		const asserted = platformDeps({ descs: [desc({ id: "pij-node" })], cwd: "/elsewhere" });
		const ok2 = run(["task", "set", "pij-node", "work", "--actor", "jordan"], asserted);
		expect(ok2.exitCode).toBe(0);
		expect(asserted.spineLog.read()[0]).toMatchObject({
			actor: "jordan",
			actorProvenance: "asserted",
		});
	});
});

describe("state set (T005)", () => {
	it("implicit general: first write materializes asg-general-<node>, chains the seq, denorms", () => {
		const d = nodeDeps();
		const r = run(["state", "set", "pij-node", "waiting", "--json"], d);
		expect(r.exitCode).toBe(0);
		const record = d.assignmentStore.read("asg-general-pij-node");
		expect(record).not.toBeNull();
		expect(record?.task).toBe("general");
		const events = d.spineLog.read();
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ kind: "state-set", peer: "pij-node" });
		expect(events[0]?.refs).toContain("assignment:asg-general-pij-node");
		expect(events[0]?.refs).toContain("state:waiting");
		// the stamped seq joined the chain inside the coupled write
		expect(record?.states).toEqual([events[0]?.seq]);
		// denorm
		const node = d.registry.read("pij-node");
		expect(node?.semanticState).toBe("waiting");
		expect(node?.currentAssignment).toBe("asg-general-pij-node");
		expect(node?.currentTask).toBe("general");
		// --json prints the STAMPED event
		expect(JSON.parse(r.stdout)).toEqual(events[0]);
		expect(pendingOps(d.opJournal)).toHaveLength(0);
	});

	it("explicit --assignment wins; a foreign node's assignment is E-ARG", () => {
		const d = nodeDeps();
		run(["task", "set", "pij-node", "work", "--json"], d);
		const id = d.assignmentStore.listByNode("pij-node")[0]?.id as string;
		const r = run(["state", "set", "pij-node", "blocked", "--assignment", id], d);
		expect(r.exitCode).toBe(0);
		expect(d.assignmentStore.read(id)?.states).toHaveLength(1);

		const foreign = run(["state", "set", "pij-other", "ready", "--assignment", id], d);
		expect(foreign.exitCode).toBe(64);
		expect(foreign.stderr).toContain("pij-node");
	});

	it("falls back to the descriptor's currentAssignment before the general", () => {
		const d = nodeDeps();
		run(["task", "set", "pij-node", "focused work"], d);
		const id = d.assignmentStore.listByNode("pij-node")[0]?.id as string;
		const r = run(["state", "set", "pij-node", "ready"], d);
		expect(r.exitCode).toBe(0);
		expect(d.assignmentStore.read(id)?.states).toHaveLength(1);
		expect(d.assignmentStore.read("asg-general-pij-node")).toBeNull();
	});

	it("a nonexistent --assignment is E-NOREG; user --refs ride the event", () => {
		const d = nodeDeps();
		expect(
			run(["state", "set", "pij-node", "ready", "--assignment", "asg-ghost"], d).exitCode,
		).toBe(3);

		const r = run(["state", "set", "pij-node", "blocked", "--refs", "pr:14,issue:6"], d);
		expect(r.exitCode).toBe(0);
		const ev = d.spineLog.read()[0];
		expect(ev?.refs).toContain("pr:14");
		expect(ev?.refs).toContain("issue:6");
	});

	describe("coupled-write fault matrix (fakes failNext)", () => {
		it("journal record failure aborts BEFORE any state commit", () => {
			const d = nodeDeps();
			d.opJournal.failNext("record");
			const r = run(["state", "set", "pij-node", "waiting"], d);
			expect(r.exitCode).toBe(3);
			expect(d.assignmentStore.read("asg-general-pij-node")).toBeNull();
			expect(d.spineLog.read()).toEqual([]);
			expect(d.registry.read("pij-node")?.semanticState).toBeUndefined();
		});

		it("record-write failure is the primary error; the intent entry is cleared (abort path)", () => {
			const d = nodeDeps();
			d.assignmentStore.failNext("write");
			const r = run(["state", "set", "pij-node", "waiting"], d);
			expect(r.exitCode).toBe(3);
			expect(d.spineLog.read()).toEqual([]);
			expect(pendingOps(d.opJournal)).toHaveLength(0);
		});

		it("record-write + clear double failure surfaces the residual diagnostic (J2)", () => {
			const d = nodeDeps();
			d.assignmentStore.failNext("write");
			d.opJournal.failNext("clear");
			const r = run(["state", "set", "pij-node", "waiting"], d);
			expect(r.exitCode).toBe(3);
			expect(r.stderr).toContain("journal cleanup also failed");
			expect(pendingOps(d.opJournal)).toHaveLength(1);
		});

		it("appendOnce failure keeps the journal entry; the NEXT platform write replays AND reconciles the chain", () => {
			const d = nodeDeps();
			d.spineLog.failNext("appendOnce");
			const r = run(["state", "set", "pij-node", "waiting"], d);
			expect(r.exitCode).not.toBe(0);
			expect(r.stderr).toContain("replayed by the next platform write");
			expect(pendingOps(d.opJournal)).toHaveLength(1);
			// record landed, chain not yet reconciled
			expect(d.assignmentStore.read("asg-general-pij-node")?.states).toEqual([]);

			// any later WRITE verb recovers: event lands + states[] reconciled
			const r2 = run(["project", "create", "Recovery Driver"], d);
			expect(r2.exitCode).toBe(0);
			const stateEvents = d.spineLog.read().filter((e) => e.kind === "state-set");
			expect(stateEvents).toHaveLength(1);
			expect(d.assignmentStore.read("asg-general-pij-node")?.states).toEqual([stateEvents[0]?.seq]);
			expect(pendingOps(d.opJournal)).toHaveLength(0);
		});

		it("clear failure after a landed write is an honest non-zero naming the block", () => {
			const d = nodeDeps();
			d.opJournal.failNext("clear");
			const r = run(["state", "set", "pij-node", "waiting"], d);
			expect(r.exitCode).toBe(3);
			expect(r.stderr).toContain("WAS");
			expect(r.stderr).toContain("blocked until");
			// the write itself landed
			expect(d.spineLog.read()).toHaveLength(1);
		});
	});
});

describe("state verify (T005, AC-06)", () => {
	function doneChain() {
		const d = nodeDeps();
		run(["task", "set", "pij-node", "ship it"], d);
		const id = d.assignmentStore.listByNode("pij-node")[0]?.id as string;
		run(["state", "set", "pij-node", "done"], d);
		return { d, id };
	}

	it("done is a claim until verified: verify appends state-verified with verifiedBy and joins the chain", () => {
		const { d, id } = doneChain();
		// before: the chain's done event carries NO verifiedBy (unverified done)
		const before = d.spineLog.read().filter((e) => e.kind === "state-set");
		expect(before[0]?.verifiedBy).toBeUndefined();

		const r = run(["state", "verify", "pij-node", "--actor", "pij-reviewer", "--json"], d);
		expect(r.exitCode).toBe(0);
		const verified = d.spineLog.read().filter((e) => e.kind === "state-verified");
		expect(verified).toHaveLength(1);
		expect(verified[0]?.verifiedBy).toBe("pij-reviewer");
		expect(verified[0]?.refs).toContain(`assignment:${id}`);
		expect(verified[0]?.refs).toContain(`event:${before[0]?.seq}`);
		// verify joins the chain
		expect(d.assignmentStore.read(id)?.states).toContain(verified[0]?.seq);
		expect(JSON.parse(r.stdout)).toEqual(verified[0]);
	});

	it("verifying an assignment whose latest state is not done is E-ARG naming the state", () => {
		const d = nodeDeps();
		run(["state", "set", "pij-node", "waiting"], d);
		const r = run(["state", "verify", "pij-node"], d);
		expect(r.exitCode).toBe(64);
		expect(r.stderr).toContain("waiting");
	});

	it("a later state change after done also un-verifies: verify then is E-ARG on the new latest", () => {
		const { d } = doneChain();
		run(["state", "verify", "pij-node"], d);
		run(["state", "set", "pij-node", "blocked"], d);
		const r = run(["state", "verify", "pij-node"], d);
		expect(r.exitCode).toBe(64);
		expect(r.stderr).toContain("blocked");
	});

	it("refuses done → clear → verify as already undeclared without a verify event", () => {
		const { d } = doneChain();
		expect(run(["state", "clear", "pij-node"], d).exitCode).toBe(0);
		const before = d.spineLog.read().length;
		const r = run(["state", "verify", "pij-node"], d);
		expect(r.exitCode).toBe(64);
		expect(r.stderr).toContain("no declared state to verify");
		expect(d.spineLog.read()).toHaveLength(before);
		expect(d.spineLog.read().filter((event) => event.kind === "state-verified")).toEqual([]);
	});

	it("verify with no resolvable assignment is E-NOREG (nothing to verify — the general is never materialized)", () => {
		const d = nodeDeps();
		const r = run(["state", "verify", "pij-node"], d);
		expect(r.exitCode).toBe(3);
		expect(d.assignmentStore.read("asg-general-pij-node")).toBeNull();
	});
});

// ═════════════════════════════════════════════════════════════════════════════
// plan 054 Phase 2 T009/T010 — node show full card (AC-09) + anomalies verb
// ═════════════════════════════════════════════════════════════════════════════

describe("node show (T009 — the full card, field by field)", () => {
	function cardDeps() {
		const d = platformDeps({
			self: "pij-self",
			descs: [
				desc({
					id: "pij-card",
					harness: "claude",
					lifecycle: "bound",
					parentId: "pij-parent",
					spawnedBy: "pij-spawner",
					systemState: "idle",
					paneId: "%4",
					windowId: "@2",
					boundModel: "gpt-5.6-sol",
					effort: "high",
					state: "idle",
				}),
			],
		});
		return {
			...d,
			models: [
				{
					id: "gpt-5.6-sol",
					name: "sol",
					provider: "copilot",
					verified: true,
					contextWindow: 258_400,
				},
			],
			contextReader: {
				current: () => ({ value: 116_858, asOf: recent, provenance: "claude-transcript" }),
			},
		};
	}

	it("returns identity, axes, badge, assignments join, addressability and gauges (AC-09)", () => {
		const d = cardDeps();
		// two assignments: one done-unverified, one blocked → badge worst-first
		run(["task", "set", "pij-card", "alpha work", "--actor", "pij-boss"], d);
		const asgA = d.assignmentStore.listByNode("pij-card")[0]?.id as string;
		run(["state", "set", "pij-card", "done", "--actor", "pij-card"], d);
		run(["task", "set", "pij-card", "beta work", "--actor", "pij-boss"], d);
		const asgB = d.assignmentStore
			.listByNode("pij-card")
			.map((a) => a.id)
			.find((id) => id !== asgA) as string;
		run(["state", "set", "pij-card", "blocked", "--actor", "pij-card"], d);

		const r = run(["node", "show", "pij-card", "--json"], d);
		expect(r.exitCode).toBe(0);
		const card = JSON.parse(r.stdout) as Record<string, unknown>;
		expect(card.id).toBe("pij-card");
		expect(card.harness).toBe("claude");
		expect(card.lifecycle).toBe("bound");
		expect(card.parent).toBe("pij-parent");
		expect(card.spawnedBy).toBe("pij-spawner");
		expect(card.systemState).toBe("idle");
		expect(card.semanticState).toBe("blocked"); // denorm of the current assignment
		expect(card.badge).toBe("blocked"); // worst-first across open assignments
		expect(card.currentAssignment).toBe(asgB);
		expect(card.currentTask).toBe("beta work");
		expect(card.paneId).toBe("%4");
		expect(card.windowId).toBe("@2");
		expect(card.boundModel).toBe("gpt-5.6-sol");
		expect(card.effort).toBe("high");
		expect(card.contextMax).toBe(258_400);
		expect(card.contextCurrent).toEqual({
			value: 116_858,
			asOf: recent,
			provenance: "claude-transcript",
		});
		expect(card.pid).toBe(100);
		expect(card.cwd).toBe("/repo");
		const assignments = card.assignments as Array<Record<string, unknown>>;
		expect(assignments).toHaveLength(2);
		const cardA = assignments.find((a) => a.id === asgA);
		const cardB = assignments.find((a) => a.id === asgB);
		expect(cardA).toMatchObject({ task: "alpha work", state: "done", verified: false, open: true });
		expect(cardB).toMatchObject({ task: "beta work", state: "blocked", open: true });
	});

	it("an unverified done flips to verified:true after a verify write (AC-06 render)", () => {
		const d = cardDeps();
		run(["task", "set", "pij-card", "ship", "--actor", "pij-boss"], d);
		run(["state", "set", "pij-card", "done", "--actor", "pij-card"], d);
		const before = JSON.parse(run(["node", "show", "pij-card", "--json"], d).stdout) as {
			assignments: Array<{ state: string; verified: boolean | null }>;
		};
		expect(before.assignments[0]).toMatchObject({ state: "done", verified: false });
		run(["state", "verify", "pij-card", "--actor", "pij-reviewer"], d);
		const after = JSON.parse(run(["node", "show", "pij-card", "--json"], d).stdout) as {
			assignments: Array<{ state: string; verified: boolean | null }>;
		};
		expect(after.assignments[0]).toMatchObject({ state: "done", verified: true });
	});

	it("a legacy node with none of the new truth reads honest nulls, badge unknown", () => {
		const d = platformDeps({ self: "pij-self", descs: [desc({ id: "pij-old" })] });
		const r = run(["node", "show", "pij-old", "--json"], d);
		expect(r.exitCode).toBe(0);
		const card = JSON.parse(r.stdout) as Record<string, unknown>;
		expect(card.systemState).toBeNull();
		expect(card.semanticState).toBeNull();
		expect(card.badge).toBe("unknown");
		expect(card.windowId).toBeNull();
		expect(card.contextMax).toBeNull();
		expect(card.assignments).toEqual([]);
	});

	it("unknown node is E-NOID; missing subcommand is E-ARG usage", () => {
		expect(run(["node", "show", "pij-ghost"], platformDeps({})).exitCode).toBe(2);
		expect(run(["node"], platformDeps({})).exitCode).toBe(64);
	});

	it("tree JSON carries the node-truth fields free (additive spread pin)", () => {
		const d = platformDeps({
			self: "pij-self",
			treeDescs: [desc({ id: "pij-t", parentId: null, systemState: "working", windowId: "@9" })],
		});
		const r = run(["tree", "--global", "--json"], d);
		expect(r.exitCode).toBe(0);
		const forest = JSON.parse(r.stdout) as { roots: Array<Record<string, unknown>> };
		expect(forest.roots[0]?.systemState).toBe("working");
		expect(forest.roots[0]?.windowId).toBe("@9");
	});
});

describe("anomalies verb (T010 — queries with evidence, AC-06/AC-07)", () => {
	it("surfaces an unverified done with spine-seq evidence; --json is the bare array", () => {
		const d = platformDeps({ self: "pij-self", descs: [desc({ id: "pij-n" })] });
		run(["task", "set", "pij-n", "ship", "--actor", "pij-boss"], d);
		run(["state", "set", "pij-n", "done", "--actor", "pij-n"], d);
		const r = run(["anomalies", "--json"], d);
		expect(r.exitCode).toBe(0);
		const anomalies = JSON.parse(r.stdout) as Array<Record<string, unknown>>;
		const unverified = anomalies.filter((a) => a.kind === "unverified-done");
		expect(unverified).toHaveLength(1);
		expect(unverified[0]?.nodeId).toBe("pij-n");
		expect((unverified[0]?.evidence as number[]).length).toBeGreaterThan(0);
	});

	it("a verified chain is clean; an empty machine prints an empty array", () => {
		const d = platformDeps({ self: "pij-self", descs: [desc({ id: "pij-n" })] });
		run(["task", "set", "pij-n", "ship", "--actor", "pij-boss"], d);
		run(["state", "set", "pij-n", "done", "--actor", "pij-n"], d);
		run(["state", "verify", "pij-n", "--actor", "pij-reviewer"], d);
		const anomalies = JSON.parse(run(["anomalies", "--json"], d).stdout) as Array<{
			kind: string;
		}>;
		expect(anomalies.filter((a) => a.kind === "unverified-done")).toHaveLength(0);

		const empty = platformDeps({ self: "pij-self" });
		expect(JSON.parse(run(["anomalies", "--json"], empty).stdout)).toEqual([]);
	});

	it("foreign hold-clear surfaces both actors", () => {
		const d = platformDeps({ self: "pij-self", descs: [desc({ id: "pij-n" })] });
		run(["state", "set", "pij-n", "hold", "--actor", "pij-issuer"], d);
		run(["state", "set", "pij-n", "ready", "--actor", "pij-meddler"], d);
		const anomalies = JSON.parse(run(["anomalies", "--json"], d).stdout) as Array<{
			kind: string;
			detail: string;
		}>;
		const foreign = anomalies.filter((a) => a.kind === "foreign-hold-clear");
		expect(foreign).toHaveLength(1);
		expect(foreign[0]?.detail).toContain("pij-issuer");
		expect(foreign[0]?.detail).toContain("pij-meddler");
	});

	it("surfaces stale dispatch/allocation records with direct evidence refs and leaves stores unchanged", () => {
		const d = platformDeps({
			self: "pij-self",
			descs: [desc({ id: "pij-worker", state: "idle" })],
		});
		const staleTs = new Date(T - 60 * 60_000).toISOString();
		d.dispatchStore.write({
			schema_version: 1,
			id: "dispatch-stale",
			packetPath: "/repo/packet.md",
			packetSha256: "a".repeat(64),
			from: "pij-self",
			to: "pij-worker",
			messageId: "msg-stale",
			deliveryState: "delivered",
			state: "delivered-unacked",
			created: { actor: "pij-self", ts: staleTs },
			updated: { actor: "pij-self", ts: staleTs },
		});
		d.allocationStore.write({
			schema_version: 1,
			id: "alloc-s061-half-open",
			project: "team-scaffold",
			ordinal: 61,
			slug: "half-open",
			worktree: "/repo-worktrees/s061-half-open",
			branch: "s061/half-open",
			baseSha: "base-sha",
			state: "created",
			steps: [{ name: "ordinal-reserved", ok: true, evidence: "reserved", ts: staleTs }],
			created: { actor: "pij-self", ts: staleTs },
		});
		const before = {
			dispatches: d.dispatchStore.list(),
			allocations: d.allocationStore.list(),
			spine: d.spineLog.read(),
		};

		const json = run(["anomalies", "--json"], d);
		expect(json.exitCode).toBe(0);
		const anomalies = JSON.parse(json.stdout) as Array<{
			kind: string;
			recordRef?: string;
			ageMs?: number;
		}>;
		expect(anomalies).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "delivered-unacked-stale",
					recordRef: "dispatch:dispatch-stale",
					ageMs: 60 * 60_000,
				}),
				expect.objectContaining({
					kind: "allocation-half-open",
					recordRef: "allocation:alloc-s061-half-open",
					ageMs: 60 * 60_000,
				}),
			]),
		);
		const scoped = JSON.parse(
			run(["anomalies", "--project", "team-scaffold", "--json"], d).stdout,
		) as Array<{ kind: string; recordRef?: string }>;
		expect(scoped).toEqual([
			expect.objectContaining({
				kind: "allocation-half-open",
				recordRef: "allocation:alloc-s061-half-open",
			}),
		]);
		const human = run(["anomalies"], d);
		expect(human.stdout).toContain("[dispatch:dispatch-stale");
		expect(human.stdout).toContain("[allocation:alloc-s061-half-open");
		expect({
			dispatches: d.dispatchStore.list(),
			allocations: d.allocationStore.list(),
			spine: d.spineLog.read(),
		}).toEqual(before);
	});

	it("--here scopes the VIEW to this folder's peers; --project to one project's assignments (s057 dogfood — detection stays machine-wide)", () => {
		const d = platformDeps({
			self: "pij-self",
			descs: [desc({ id: "pij-local" }), desc({ id: "pij-far", folder: "/elsewhere" })],
		});
		run(["project", "create", "here work", "--slug", "here-work", "--actor", "pij-boss"], d);
		run(["task", "set", "pij-local", "ship", "--project", "here-work", "--actor", "pij-boss"], d);
		run(["state", "set", "pij-local", "done", "--actor", "pij-local"], d);
		run(["task", "set", "pij-far", "other errand", "--actor", "pij-boss"], d);
		run(["state", "set", "pij-far", "done", "--actor", "pij-far"], d);

		const all = JSON.parse(run(["anomalies", "--json"], d).stdout) as Array<{ nodeId: string }>;
		expect(new Set(all.map((a) => a.nodeId))).toEqual(new Set(["pij-local", "pij-far"]));

		const here = JSON.parse(run(["anomalies", "--here", "--json"], d).stdout) as Array<{
			nodeId: string;
		}>;
		expect(here.map((a) => a.nodeId)).toEqual(["pij-local"]);

		const proj = JSON.parse(
			run(["anomalies", "--project", "here-work", "--json"], d).stdout,
		) as Array<{ nodeId: string }>;
		expect(proj.map((a) => a.nodeId)).toEqual(["pij-local"]);
	});

	it("bare --project on anomalies is an E-ARG", () => {
		const d = platformDeps({ self: "pij-self" });
		expect(run(["anomalies", "--project"], d).exitCode).not.toBe(0);
	});
});

describe("unadopted flow-through (P3 T003/T005 — AC-08/WS-1 machine-wide enumerability)", () => {
	function adoptionDeps() {
		return platformDeps({
			self: "pij-self",
			descs: [
				desc({ id: "pij-prime-root", prime: true }),
				desc({ id: "pij-stray", harness: "claude", lifecycle: "bound" }),
				desc({ id: "pij-kid", spawnedBy: "pij-prime-root" }),
			],
		});
	}

	it("tree --global --json carries unadopted on exactly the stray (UI query shape)", () => {
		const d = adoptionDeps();
		const r = run(["tree", "--global", "--json"], d);
		expect(r.exitCode).toBe(0);
		const forest = JSON.parse(r.stdout) as {
			roots: Array<Record<string, unknown> & { id: string; children: unknown[] }>;
		};
		const byId = new Map(forest.roots.map((node) => [node.id, node]));
		expect(byId.get("pij-stray")?.unadopted).toBe(true);
		expect(byId.get("pij-prime-root")?.unadopted).toBeUndefined();
		// Machine-wide enumeration is a plain filter over the flow-through.
		const unadopted = forest.roots.filter((node) => node.unadopted === true).map((n) => n.id);
		expect(unadopted).toEqual(["pij-stray"]);
	});

	it("list --json rows carry the adoption axis as an explicit boolean", () => {
		const d = adoptionDeps();
		const r = run(["list", "--json"], d);
		expect(r.exitCode).toBe(0);
		const rows = JSON.parse(r.stdout) as Array<{ id: string; unadopted: boolean }>;
		const byId = new Map(rows.map((row) => [row.id, row]));
		expect(byId.get("pij-stray")?.unadopted).toBe(true);
		expect(byId.get("pij-prime-root")?.unadopted).toBe(false);
		expect(byId.get("pij-kid")?.unadopted).toBe(false);
	});

	it("human tree render badges the stray [unadopted], distinct from problems", () => {
		const d = adoptionDeps();
		const r = run(["tree", "--global"], d);
		expect(r.exitCode).toBe(0);
		const strayLine = r.stdout.split("\n").find((line) => line.includes("pij-stray"));
		expect(strayLine).toContain("[unadopted]");
		const primeLine = r.stdout.split("\n").find((line) => line.includes("pij-prime-root"));
		expect(primeLine).not.toContain("[unadopted]");
	});
});

describe("pij link spine event (P3 T004 — node-linked, V-05 uncoupled)", () => {
	const kindPin = "node-linked";

	function linkDeps() {
		const descriptors = [
			desc({ id: "pij-alpha" }),
			desc({ id: "pij-beta" }),
			desc({ id: "pij-gamma" }),
			desc({ id: "pij-kid", spawnedBy: "pij-alpha" }),
		];
		return platformDeps({ self: "pij-self", descs: descriptors, treeDescs: descriptors });
	}

	it("pins the kind constant", () => {
		expect(SPINE_KIND_NODE_LINKED).toBe(kindPin);
	});

	it("re-parent appends an uncoupled node-linked event: prev=old effective parent, next=new, peer=child, refs [node:, parent:]", () => {
		const d = linkDeps();
		const r = run(["link", "pij-kid", "--parent", "pij-beta", "--json"], d);
		expect(r.exitCode).toBe(0);
		const events = d.spineLog.read({ peer: "pij-kid" });
		expect(events).toHaveLength(1);
		const e = events[0] as SpineEvent;
		expect(e.kind).toBe(kindPin);
		expect(e.peer).toBe("pij-kid");
		// spawnedBy was the effective parent before the link (provenance truth).
		expect(e.prev).toBe("pij-alpha");
		expect(e.next).toBe("pij-beta");
		expect(e.refs).toEqual(["node:pij-kid", "parent:pij-beta"]);
		expect(e.actor).toBe("pij-self");
		expect(e.actorProvenance).toBe("resolved");
		// Uncoupled (V-05): nothing journaled for this append.
		expect(pendingOps(d.opJournal)).toHaveLength(0);
		// The verb's JSON reports the audit seq additively.
		expect(JSON.parse(r.stdout)).toMatchObject({
			id: "pij-kid",
			parentId: "pij-beta",
			spineSeq: e.seq,
		});
	});

	it("--actor asserts attribution (F2) and wins over the resolved self", () => {
		const d = linkDeps();
		run(["link", "pij-kid", "--parent", "pij-beta", "--actor", "pij-boss"], d);
		const e = d.spineLog.read({ peer: "pij-kid" })[0] as SpineEvent;
		expect(e.actor).toBe("pij-boss");
		expect(e.actorProvenance).toBe("asserted");
	});

	it("--root link: next OMITTED (never null/sentinel), refs [node:<child>] only, prev still carried", () => {
		const d = linkDeps();
		run(["link", "pij-kid", "--parent", "pij-beta", "--actor", "a"], d);
		const r = run(["link", "pij-kid", "--root", "--actor", "a", "--json"], d);
		expect(r.exitCode).toBe(0);
		const events = d.spineLog.read({ peer: "pij-kid" });
		const rootHop = events[1] as SpineEvent;
		expect(rootHop.prev).toBe("pij-beta");
		expect(Object.hasOwn(rootHop, "next")).toBe(false);
		expect(rootHop.refs).toEqual(["node:pij-kid"]);
	});

	it("history A→B→C→root reconstructs from `spine events --peer <child>` incl. the root hop, spawnedBy byte-stable throughout", () => {
		const d = linkDeps();
		run(["link", "pij-kid", "--parent", "pij-beta", "--actor", "a"], d);
		run(["link", "pij-kid", "--parent", "pij-gamma", "--actor", "a"], d);
		run(["link", "pij-kid", "--root", "--actor", "a"], d);
		const r = run(["spine", "events", "--peer", "pij-kid", "--json"], d);
		expect(r.exitCode).toBe(0);
		const events = JSON.parse(r.stdout) as Array<Record<string, unknown>>;
		const hops = events
			.filter((e) => e.kind === kindPin)
			.map((e) => `${e.prev ?? "∅"}→${e.next ?? "root"}`);
		expect(hops).toEqual(["pij-alpha→pij-beta", "pij-beta→pij-gamma", "pij-gamma→root"]);
		// Immutable provenance: three re-parents never touch spawnedBy.
		expect(d.registry.read("pij-kid")?.spawnedBy).toBe("pij-alpha");
	});

	it("no-op link (unchanged parent) still appends its event — the adjudicated no-op-set precedent", () => {
		const d = linkDeps();
		run(["link", "pij-kid", "--parent", "pij-beta", "--actor", "a"], d);
		const again = run(["link", "pij-kid", "--parent", "pij-beta", "--actor", "a", "--json"], d);
		expect(again.exitCode).toBe(0);
		expect(JSON.parse(again.stdout)).toMatchObject({ changed: false });
		const events = d.spineLog.read({ peer: "pij-kid" });
		expect(events).toHaveLength(2);
		const noop = events[1] as SpineEvent;
		expect(noop.prev).toBe("pij-beta");
		expect(noop.next).toBe("pij-beta");
	});

	it("refused links (self/cycle/unknown) append NOTHING", () => {
		const d = linkDeps();
		expect(run(["link", "pij-kid", "--parent", "pij-kid", "--actor", "a"], d).exitCode).not.toBe(0);
		expect(run(["link", "pij-missing", "--root", "--actor", "a"], d).exitCode).not.toBe(0);
		expect(d.spineLog.read()).toHaveLength(0);
	});

	it("wired ports + unresolvable actor: refused BEFORE any descriptor write, naming --actor", () => {
		const descriptors = [
			desc({ id: "pij-kid", spawnedBy: "pij-alpha" }),
			desc({ id: "pij-alpha" }),
		];
		const d = platformDeps({ descs: descriptors, treeDescs: descriptors });
		const r = run(["link", "pij-kid", "--parent", "pij-alpha", "--json"], d);
		expect(r.exitCode).not.toBe(0);
		expect(r.stderr).toContain("--actor");
		expect(d.registry.read("pij-kid")?.parentId).toBeUndefined();
		expect(d.spineLog.read()).toHaveLength(0);
	});

	it("append failure is honest: descriptor truth lands (V-05 — truth never waits on the spine), spineSeq null + warning", () => {
		const d = linkDeps();
		d.spineLog.failNext("append");
		const r = run(["link", "pij-kid", "--parent", "pij-beta", "--actor", "a", "--json"], d);
		expect(r.exitCode).toBe(0);
		expect(d.registry.read("pij-kid")?.parentId).toBe("pij-beta");
		const out = JSON.parse(r.stdout) as Record<string, unknown>;
		expect(out.spineSeq).toBeNull();
		expect(String(out.spineWarning ?? r.stderr)).not.toBe("");
		expect(d.spineLog.read({ peer: "pij-kid" })).toHaveLength(0);
	});
});

describe("denorm fresh-read basis (P3 T006b — p2-review-001 note 2)", () => {
	it("a daemon systemState landing mid-verb survives the denorm — the write is built from a re-read, never the verb's opening snapshot", () => {
		const d = platformDeps({
			self: "pij-self",
			descs: [desc({ id: "pij-node", systemState: "working" })],
		});
		const registry = d.registry;
		const origRead = registry.read.bind(registry);
		const origWrite = registry.write.bind(registry);
		// Simulate the daemon between the verb's opening node-read and the
		// denorm: the FIRST read hands back the pre-daemon snapshot and the
		// daemon's verdict lands immediately after it.
		let daemonLanded = false;
		registry.read = (id: string) => {
			const snapshot = origRead(id);
			if (id === "pij-node" && !daemonLanded && snapshot) {
				daemonLanded = true;
				origWrite({ ...snapshot, systemState: "stalled" });
				return snapshot;
			}
			return origRead(id);
		};
		const r = run(["state", "set", "pij-node", "ready", "--actor", "pij-boss"], d);
		expect(r.exitCode).toBe(0);
		const persisted = origRead("pij-node");
		// The verb's denorm fields landed…
		expect(persisted?.semanticState).toBe("ready");
		// …and the daemon's mid-verb verdict was NOT reverted to the verb's
		// opening snapshot ("working"): the denorm re-read carried it.
		expect(persisted?.systemState).toBe("stalled");
	});
});

describe("spine render (P4 T002 — parse row + core E-NOREG naming the bin)", () => {
	it("parses `spine render` with --project/--json only (MAX_POS 0)", () => {
		expect(parseArgs(["spine", "render", "--json"])).toMatchObject({
			ok: true,
			value: { verb: "spine-render", json: true },
		});
		expect(parseArgs(["spine", "render"])).toMatchObject({
			ok: true,
			value: { verb: "spine-render", json: false },
		});
	});

	it("parses --project <slug> through to the bin (s057 — per-project render)", () => {
		expect(parseArgs(["spine", "render", "--project", "fix-the-cli"])).toMatchObject({
			ok: true,
			value: { verb: "spine-render", project: "fix-the-cli", json: false },
		});
	});

	it("bare --project → E-ARG", () => {
		expect(parseArgs(["spine", "render", "--project"])).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
	});

	it("rejects positionals and unknown flags → E-ARG", () => {
		expect(parseArgs(["spine", "render", "extra"])).toMatchObject({ ok: false, code: "E-ARG" });
		expect(parseArgs(["spine", "render", "--peer", "x"])).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
	});

	it("core dispatch is E-NOREG naming the bin (the markdown write is bin-owned)", () => {
		// Even with every platform port wired, core cannot honor `spine render`:
		// SpineLogPort has no markdown-write method by design — the pij bin
		// intercepts the verb before dispatch and writes spine/spine.md itself.
		const d = platformDeps({ spine: [spineEv({ seq: 1 })] });
		const r = run(["spine", "render"], d);
		expect(r.exitCode).not.toBe(0);
		expect(r.stderr).toContain("E-NOREG");
		expect(r.stderr).toContain("bin");
	});
});

describe("state clear (State-Model v2)", () => {
	it("parses strict state clear grammar without changing the legacy state card", () => {
		expect(
			parseArgs([
				"state",
				"clear",
				"pij-node",
				"--assignment",
				"asg-1",
				"--actor",
				"boss",
				"--json",
			]),
		).toMatchObject({
			ok: true,
			value: {
				verb: "state-clear",
				node: "pij-node",
				assignmentId: "asg-1",
				actor: "boss",
				json: true,
			},
		});
		for (const argv of [
			["state", "clear"],
			["state", "clear", "pij-node", "extra"],
			["state", "clear", "pij-node", "--refs", "issue:1"],
			["state", "clear", "pij-node", "--assignment"],
		] as const) {
			expect(parseArgs(argv)).toMatchObject({ ok: false, code: "E-ARG" });
		}
		expect(parseArgs(["state", "pij-node"])).toMatchObject({ ok: true, value: { verb: "state" } });
	});

	it("journals one state-cleared event, retains the assignment chain, and removes only semanticState", () => {
		const d = platformDeps({
			self: "pij-self",
			descs: [
				desc({
					id: "pij-node",
					currentAssignment: "asg-clear",
					currentTask: "keep this task",
					semanticState: "hold",
					systemState: "idle",
					parentId: "pij-parent",
					spawnedBy: "pij-owner",
				}),
			],
		});
		const assignment: Assignment = {
			schema_version: 1,
			id: "asg-clear",
			nodeId: "pij-node",
			task: "keep this task",
			states: [1],
			opened: { actor: "pij-self", ts: recent },
		};
		d.assignmentStore.write(assignment);
		d.spineLog.append({
			schema_version: 1,
			ts: recent,
			actor: "pij-self",
			kind: "state-set",
			peer: "pij-node",
			refs: ["node:pij-node", "assignment:asg-clear", "state:hold"],
		});
		const r = run(["state", "clear", "pij-node", "--json"], d);
		expect(r.exitCode).toBe(0);
		const event = JSON.parse(r.stdout) as SpineEvent;
		expect(event).toMatchObject({ kind: SPINE_KIND_STATE_CLEARED, peer: "pij-node" });
		expect(event.refs).toContain("assignment:asg-clear");
		expect(d.assignmentStore.read("asg-clear")?.states).toEqual([1, event.seq]);
		expect(d.registry.read("pij-node")).toMatchObject({
			currentAssignment: "asg-clear",
			currentTask: "keep this task",
			systemState: "idle",
			parentId: "pij-parent",
			spawnedBy: "pij-owner",
		});
		expect(d.registry.read("pij-node")?.semanticState).toBeUndefined();
		expect(pendingOps(d.opJournal)).toEqual([]);
	});

	it("refuses a missing-general target without an event or materialization", () => {
		const d = nodeDeps();
		const r = run(["state", "clear", "pij-node"], d);
		expect(r.exitCode).toBe(3);
		expect(r.stderr).toContain("no assignment to clear");
		expect(d.assignmentStore.read("asg-general-pij-node")).toBeNull();
		expect(d.spineLog.read()).toEqual([]);
	});

	it("a later state set becomes current after a clear", () => {
		const d = nodeDeps();
		expect(run(["state", "set", "pij-node", "hold"], d).exitCode).toBe(0);
		expect(run(["state", "clear", "pij-node"], d).exitCode).toBe(0);
		expect(run(["state", "set", "pij-node", "ready"], d).exitCode).toBe(0);
		const card = JSON.parse(run(["node", "show", "pij-node", "--json"], d).stdout) as {
			assignments: Array<{ state: string | null }>;
		};
		expect(card.assignments[0]?.state).toBe("ready");
	});

	describe("journal-first cut points", () => {
		function clearable() {
			const d = nodeDeps();
			expect(run(["state", "set", "pij-node", "hold"], d).exitCode).toBe(0);
			return { d, assignmentId: "asg-general-pij-node" };
		}

		it("journal record failure commits neither the clear event nor assignment change", () => {
			const { d, assignmentId } = clearable();
			const before = d.assignmentStore.read(assignmentId);
			d.opJournal.failNext("record");
			const r = run(["state", "clear", "pij-node"], d);
			expect(r.exitCode).toBe(3);
			expect(d.spineLog.read()).toHaveLength(1);
			expect(d.assignmentStore.read(assignmentId)).toEqual(before);
			expect(pendingOps(d.opJournal)).toEqual([]);
		});

		it("assignment-write abort clears the clear intent and leaves the declaration intact", () => {
			const { d, assignmentId } = clearable();
			d.assignmentStore.failNext("write");
			const r = run(["state", "clear", "pij-node"], d);
			expect(r.exitCode).toBe(3);
			expect(d.spineLog.read()).toHaveLength(1);
			expect(d.assignmentStore.read(assignmentId)?.states).toEqual([1]);
			expect(d.registry.read("pij-node")?.semanticState).toBe("hold");
			expect(pendingOps(d.opJournal)).toEqual([]);
		});

		it("appendOnce failure reports WAS-cleared; the next write replays and chains one clear", () => {
			const { d, assignmentId } = clearable();
			d.spineLog.failNext("appendOnce");
			const failed = run(["state", "clear", "pij-node"], d);
			expect(failed.exitCode).toBe(3);
			expect(failed.stderr).toContain("WAS cleared");
			expect(d.spineLog.read().filter((event) => event.kind === SPINE_KIND_STATE_CLEARED)).toEqual(
				[],
			);
			expect(d.assignmentStore.read(assignmentId)?.states).toEqual([1]);
			expect(pendingOps(d.opJournal)).toHaveLength(1);

			expect(run(["project", "create", "recovery-driver"], d).exitCode).toBe(0);
			const cleared = d.spineLog.read().filter((event) => event.kind === SPINE_KIND_STATE_CLEARED);
			expect(cleared).toHaveLength(1);
			expect(d.assignmentStore.read(assignmentId)?.states).toEqual([1, cleared[0]?.seq]);
			expect(pendingOps(d.opJournal)).toEqual([]);
		});

		it("journal clear failure is nonzero while the clear event and assignment chain stand", () => {
			const { d, assignmentId } = clearable();
			d.opJournal.failNext("clear");
			const r = run(["state", "clear", "pij-node"], d);
			expect(r.exitCode).toBe(3);
			expect(r.stderr).toContain("WAS cleared");
			const cleared = d.spineLog.read().filter((event) => event.kind === SPINE_KIND_STATE_CLEARED);
			expect(cleared).toHaveLength(1);
			expect(d.assignmentStore.read(assignmentId)?.states).toEqual([1, cleared[0]?.seq]);
			expect(pendingOps(d.opJournal)).toHaveLength(1);
		});

		it("denorm failure is honest while the clear event and assignment history are preserved", () => {
			const { d, assignmentId } = clearable();
			// Stubs BOTH write paths: the denorm uses `writeExact` (it must be able to
			// clear a stale semanticState, which the merging write deliberately cannot).
			// Injecting on only one would silently stop exercising the failure path.
			const boom = () => {
				throw new Error("injected descriptor write failure");
			};
			d.registry.write = boom;
			d.registry.writeExact = boom;
			const r = run(["state", "clear", "pij-node"], d);
			expect(r.exitCode).toBe(3);
			expect(r.stderr).toContain("WAS cleared");
			expect(r.stderr).toContain("injected descriptor write failure");
			const cleared = d.spineLog.read().filter((event) => event.kind === SPINE_KIND_STATE_CLEARED);
			expect(cleared).toHaveLength(1);
			expect(d.assignmentStore.read(assignmentId)?.states).toEqual([1, cleared[0]?.seq]);
			expect(d.registry.read("pij-node")?.semanticState).toBe("hold");
		});
	});

	describe("stream/fence verbs — plan 061 phase 1", () => {
		it("parses all four verbs through the strict family tables", () => {
			expect(
				parseArgs([
					"stream",
					"create",
					"--project",
					"platform",
					"--slug",
					"team-scaffold",
					"--base",
					"main",
					"--ordinal",
					"61",
					"--actor",
					"prime",
					"--json",
				]),
			).toMatchObject({
				ok: true,
				value: {
					verb: "stream-create",
					project: "platform",
					slug: "team-scaffold",
					baseRef: "main",
					ordinal: 61,
					actor: "prime",
					json: true,
				},
			});
			expect(parseArgs(["stream", "close", "alloc-s061-team-scaffold"])).toMatchObject({
				ok: true,
				value: { verb: "stream-close", id: "alloc-s061-team-scaffold" },
			});
			expect(
				parseArgs([
					"fence",
					"set",
					"team-scaffold",
					"--paths",
					"src/**,docs/**",
					"--shared",
					"src/shared.ts",
				]),
			).toMatchObject({
				ok: true,
				value: {
					verb: "fence-set",
					stream: "team-scaffold",
					touchSet: ["src/**", "docs/**"],
					shared: ["src/shared.ts"],
				},
			});
			expect(parseArgs(["fence", "show", "--path", "src/api.ts", "--json"])).toMatchObject({
				ok: true,
				value: { verb: "fence-show", path: "src/api.ts", json: true },
			});
		});

		it("stream create/close emits evidence, persists the allocation, and appends attributed events", () => {
			const d = platformDeps({
				self: "pij-prime",
				projects: [seedProject({ slug: "platform" })],
			});
			const created = run(
				["stream", "create", "--project", "platform", "--slug", "team-scaffold", "--ordinal", "61"],
				d,
			);
			expect(created.exitCode).toBe(0);
			expect(created.stdout).toContain("alloc-s061-team-scaffold");
			expect(created.stdout).toContain("/repo-worktrees/s061-team-scaffold");
			expect(created.stdout).toContain("s061/team-scaffold");
			expect(created.stdout).toContain("base-sha");
			expect(d.allocationStore.read("alloc-s061-team-scaffold")).toMatchObject({
				project: "platform",
				state: "created",
				created: { actor: "pij-prime" },
			});
			expect(d.spineLog.read().filter((event) => event.kind === "allocation")).toHaveLength(1);

			const closed = run(["stream", "close", "alloc-s061-team-scaffold"], d);
			expect(closed.exitCode).toBe(0);
			expect(closed.stdout).toContain("closed");
			expect(d.allocationStore.read("alloc-s061-team-scaffold")?.state).toBe("closed");
			expect(d.spineLog.read().filter((event) => event.kind === "allocation")).toHaveLength(2);
		});

		it("fence set/show answers path ownership and reports overlap without blocking", () => {
			const d = platformDeps({
				self: "pij-prime",
				projects: [seedProject({ slug: "platform" })],
			});
			for (const [ordinal, slug] of [
				[61, "alpha"],
				[62, "beta"],
			] as const) {
				expect(
					run(
						[
							"stream",
							"create",
							"--project",
							"platform",
							"--slug",
							slug,
							"--ordinal",
							String(ordinal),
						],
						d,
					).exitCode,
				).toBe(0);
				expect(
					run(
						["fence", "set", slug, "--paths", "src/shared.ts,src/**", "--shared", "src/shared.ts"],
						d,
					).exitCode,
				).toBe(0);
			}
			const shown = run(["fence", "show", "--path", "src/shared.ts", "--json"], d);
			expect(shown.exitCode).toBe(0);
			const fences = JSON.parse(shown.stdout) as Fence[];
			expect(fences).toHaveLength(2);
			expect(fences.map((fence) => fence.allocation).sort()).toEqual([
				"alloc-s061-alpha",
				"alloc-s062-beta",
			]);
			const human = run(["fence", "show", "--path", "src/shared.ts"], d);
			expect(human.stdout).toMatch(/overlap/i);
			expect(human.stdout).toContain("alloc-s061-alpha");
			expect(human.stdout).toContain("alloc-s062-beta");
		});

		it("allocation crash window heals exactly once before the next fence write", () => {
			const d = platformDeps({
				self: "pij-prime",
				projects: [seedProject({ slug: "platform" })],
			});
			d.spineLog.failNext("appendOnce");
			const failed = run(
				["stream", "create", "--project", "platform", "--slug", "recovery", "--ordinal", "61"],
				d,
			);
			expect(failed.exitCode).toBe(3);
			expect(failed.stderr).toContain("WAS committed");
			expect(d.allocationStore.read("alloc-s061-recovery")).not.toBeNull();
			expect(pendingOps(d.opJournal)).toHaveLength(1);
			expect(d.spineLog.read().filter((event) => event.kind === "allocation")).toEqual([]);

			const healed = run(["fence", "set", "recovery", "--paths", "src/**"], d);
			expect(healed.exitCode).toBe(0);
			expect(d.spineLog.read().filter((event) => event.kind === "allocation")).toHaveLength(1);
			expect(d.spineLog.read().filter((event) => event.kind === "fence")).toHaveLength(1);
			expect(pendingOps(d.opJournal)).toEqual([]);
		});

		it.each([
			["stream create missing --project", ["stream", "create", "--slug", "x"]],
			["stream create missing --slug", ["stream", "create", "--project", "platform"]],
			[
				"stream create bad combination/positional",
				["stream", "create", "extra", "--project", "platform", "--slug", "x"],
			],
			[
				"stream create unknown flag",
				["stream", "create", "--project", "platform", "--slug", "x", "--bogus"],
			],
			["stream close missing id", ["stream", "close"]],
			["stream close unknown flag", ["stream", "close", "alloc-x", "--bogus"]],
			["fence set missing stream", ["fence", "set", "--paths", "src/**"]],
			["fence set missing --paths", ["fence", "set", "x"]],
			["fence set bare --shared", ["fence", "set", "x", "--paths", "src/**", "--shared"]],
			["fence set unknown flag", ["fence", "set", "x", "--paths", "src/**", "--bogus"]],
			["fence show bad positional", ["fence", "show", "extra"]],
			["fence show unknown flag", ["fence", "show", "--bogus"]],
		] as const)("%s fails E-ARG with no writes", (_label, argv) => {
			const d = platformDeps({
				self: "pij-prime",
				projects: [seedProject({ slug: "platform" })],
			});
			const result = run(argv, d);
			expect(result.exitCode).toBe(64);
			expect(result.stderr).toContain("E-ARG");
			expect(d.allocationStore.list()).toEqual([]);
			expect(d.fenceStore.list()).toEqual([]);
			expect(d.spineLog.read()).toEqual([]);
		});
	});

	describe("stream/fence bin wiring", () => {
		it("runs create → fence show → close end-to-end and serves generic family help", {
			timeout: 15_000,
		}, () => {
			const root = mkdtempSync(join(tmpdir(), "pij-stream-bin-"));
			const home = join(root, "home");
			const repo = join(root, "demo");
			try {
				mkdirSync(home, { recursive: true });
				execFileSync("git", ["init", "--quiet", repo]);
				execFileSync("git", ["-C", repo, "config", "user.email", "pij@example.test"]);
				execFileSync("git", ["-C", repo, "config", "user.name", "pij test"]);
				writeFileSync(join(repo, "README.md"), "initial\n");
				execFileSync("git", ["-C", repo, "add", "README.md"]);
				execFileSync("git", ["-C", repo, "commit", "--quiet", "-m", "initial"]);
				new FsProjectStore(home).create(seedProject({ slug: "platform" }));
				const env = { ...process.env, PIJ_HOME: home };
				const runBin = (args: readonly string[]) =>
					spawnSync(process.execPath, [PLATFORM_TSX, PIJ_CLI_BIN, ...args], {
						cwd: repo,
						env,
						encoding: "utf8",
					});

				const help = runBin(["stream", "create", "--help"]);
				expect(help.status).toBe(0);
				expect(help.stdout).toContain("pij stream create");

				const created = runBin([
					"stream",
					"create",
					"--project",
					"platform",
					"--slug",
					"bin-flow",
					"--ordinal",
					"61",
					"--actor",
					"tester",
				]);
				expect(created.status, created.stderr).toBe(0);
				expect(created.stdout).toContain("alloc-s061-bin-flow");

				const fenced = runBin([
					"fence",
					"set",
					"bin-flow",
					"--paths",
					"src/**",
					"--actor",
					"tester",
				]);
				expect(fenced.status, fenced.stderr).toBe(0);
				const shown = runBin(["fence", "show", "--path", "src/api.ts", "--json"]);
				expect(shown.status, shown.stderr).toBe(0);
				expect(JSON.parse(shown.stdout) as Fence[]).toHaveLength(1);

				const closed = runBin(["stream", "close", "alloc-s061-bin-flow", "--actor", "tester"]);
				expect(closed.status, closed.stderr).toBe(0);
				expect(new FsAllocationStore(home).read("alloc-s061-bin-flow")?.state).toBe("closed");
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		});
	});

	describe("dispatch/ack receipts — AC-02/AC-05/AC-09/AC-11", () => {
		const SHA = "a".repeat(64);

		function dispatchDeps() {
			return platformDeps({
				self: "pij-parent",
				descs: [
					desc({ id: "pij-parent", state: "idle" }),
					desc({
						id: "pij-worker",
						state: "idle",
						boundModel: "github-copilot/gpt-5.6-sol",
						effort: "xhigh",
					}),
				],
			});
		}

		it("parses the required positional dispatch target and ack dispatch id", () => {
			expect(
				parseArgs(["dispatch", "pij-worker", "--packet", "/repo/packet.md", "--wait=25"]),
			).toEqual({
				ok: true,
				value: {
					verb: "dispatch-packet",
					to: "pij-worker",
					packetPath: "/repo/packet.md",
					wait: true,
					waitMs: 25,
					json: false,
				},
			});
			expect(parseArgs(["ack", "dispatch-test-1", "--packet-sha", SHA, "--json"])).toEqual({
				ok: true,
				value: {
					verb: "ack-dispatch",
					dispatchId: "dispatch-test-1",
					packetSha256: SHA,
					json: true,
				},
			});
		});

		it("persists undelivered → delivered-unacked outside peer I/O, then acked with actual transport message id", () => {
			const d = dispatchDeps();
			const sent = run(["dispatch", "pij-worker", "--packet", "/repo/packet.md", "--wait"], d);
			expect(sent.exitCode).toBe(0);
			const record = d.dispatchStore.list()[0];
			expect(record).toMatchObject({
				id: "dispatch-test-1",
				packetPath: "/repo/packet.md",
				packetSha256: SHA,
				from: "pij-parent",
				to: "pij-worker",
				messageId: "fake-1",
				deliveryState: "delivered",
				state: "delivered-unacked",
			});
			expect(d.delivery.outbox[0]?.message.body).toContain("[pij dispatch dispatch-test-1]");
			expect(d.delivery.outbox[0]?.message.body).toContain(`sha256: ${SHA}`);
			expect(d.delivery.outbox[0]?.message.body).toContain(
				`pij ack dispatch-test-1 --packet-sha ${SHA}`,
			);
			expect(sent.follow).toEqual({
				kind: "dispatch-wait",
				dispatchId: "dispatch-test-1",
				timeoutMs: undefined,
				exitCode: 0,
			});

			const ackDeps: CliDeps = {
				...d,
				process: new FakeProcess(999, T + 1000, { PIJ_SESSION_ID: "pij-worker" }, [100]),
			};
			const acknowledged = run(["ack", "dispatch-test-1", "--packet-sha", SHA, "--json"], ackDeps);
			expect(acknowledged.exitCode).toBe(0);
			expect(JSON.parse(acknowledged.stdout)).toMatchObject({
				id: "dispatch-test-1",
				state: "acked",
				ack: {
					messageId: "fake-1",
					packetId: "dispatch-test-1",
					packetSha256: SHA,
					seat: "pij-worker",
					declaredRuntime: {
						model: "github-copilot/gpt-5.6-sol",
						effort: "xhigh",
						source: "self-report",
					},
				},
			});
			const ackRecord = d.dispatchStore.read("dispatch-test-1");
			expect(ackRecord?.state).toBe("acked");
			const receipt = d.delivery.outbox[1]?.message;
			expect(receipt).toMatchObject({ from: "pij-worker", to: "pij-parent", kind: "receipt" });
			expect(receipt ? parseBriefAckBody(receipt.body) : null).toMatchObject({
				messageId: "fake-1",
				packetId: "dispatch-test-1",
				packetSha256: SHA,
			});
			expect(d.spineLog.read().filter((event) => event.kind === "dispatch")).toHaveLength(3);
		});

		it("never holds the platform write lock across peer delivery", () => {
			const d = dispatchDeps();
			const peerLock = d.platformWriteLock.fork();
			const baseDelivery = d.delivery;
			const lockProbe: boolean[] = [];
			const delivery: DeliveryPort = {
				deliver(message) {
					lockProbe.push(peerLock.withPlatformWriteLock(() => undefined).ok);
					return baseDelivery.deliver(message);
				},
			};
			const result = run(["dispatch", "pij-worker", "--packet", "/repo/packet.md"], {
				...d,
				delivery,
			});
			expect(result.exitCode).toBe(0);
			expect(lockProbe).toEqual([true]);
			expect(d.platformWriteLock.acquisitions).toBe(2);
		});

		it("delivery failure leaves an honest undelivered dispatch artifact", () => {
			const d = dispatchDeps();
			const delivery: DeliveryPort = {
				deliver: () => err("E-NOREG", "injected channel failure"),
			};
			const result = run(["dispatch", "pij-worker", "--packet", "/repo/packet.md"], {
				...d,
				delivery,
			});
			expect(result.exitCode).toBe(3);
			expect(result.stderr).toContain("state=undelivered");
			expect(d.dispatchStore.read("dispatch-test-1")?.state).toBe("undelivered");
			expect(d.spineLog.read().filter((event) => event.kind === "dispatch")).toHaveLength(1);
		});

		it("sha mismatch refuses before ack mutation or receipt emission", () => {
			const d = dispatchDeps();
			expect(run(["dispatch", "pij-worker", "--packet", "/repo/packet.md"], d).exitCode).toBe(0);
			const beforeEvents = d.spineLog.read().length;
			const beforeMessages = d.delivery.outbox.length;
			const ackDeps: CliDeps = {
				...d,
				process: new FakeProcess(999, T + 1000, { PIJ_SESSION_ID: "pij-worker" }, [100]),
				packetIdentity: (path) => ok({ path, sha256: "b".repeat(64) }),
			};
			const refused = run(["ack", "dispatch-test-1", "--packet-sha", SHA], ackDeps);
			expect(refused.exitCode).toBe(64);
			expect(refused.stderr).toMatch(/E-ARG.*sha/i);
			expect(d.dispatchStore.read("dispatch-test-1")?.state).toBe("delivered-unacked");
			expect(d.spineLog.read()).toHaveLength(beforeEvents);
			expect(d.delivery.outbox).toHaveLength(beforeMessages);
		});

		it.each([
			["dispatch missing target", ["dispatch", "--packet", "/repo/packet.md"]],
			["dispatch missing packet", ["dispatch", "pij-worker"]],
			["dispatch bare packet flag", ["dispatch", "pij-worker", "--packet"]],
			[
				"dispatch rejects obsolete --to",
				["dispatch", "pij-worker", "--packet", "/repo/p.md", "--to", "x"],
			],
			["dispatch extra positional", ["dispatch", "pij-worker", "extra", "--packet", "/repo/p.md"]],
			["ack missing dispatch id", ["ack", "--packet-sha", SHA]],
			["ack missing sha", ["ack", "dispatch-test-1"]],
			["ack bare sha flag", ["ack", "dispatch-test-1", "--packet-sha"]],
			["ack invalid sha", ["ack", "dispatch-test-1", "--packet-sha", "short"]],
			["ack extra positional", ["ack", "dispatch-test-1", "extra", "--packet-sha", SHA]],
		] as const)("%s fails E-ARG with zero writes", (_label, argv) => {
			const d = dispatchDeps();
			const result = run(argv, d);
			expect(result.exitCode).toBe(64);
			expect(result.stderr).toContain("E-ARG");
			expect(d.dispatchStore.list()).toEqual([]);
			expect(d.spineLog.read()).toEqual([]);
			expect(d.delivery.outbox).toEqual([]);
		});

		it("an unknown dispatch id refuses loudly with zero mutations", () => {
			const d = dispatchDeps();
			const ackDeps: CliDeps = {
				...d,
				process: new FakeProcess(999, T + 1000, { PIJ_SESSION_ID: "pij-worker" }, [100]),
			};
			const result = run(["ack", "dispatch-missing", "--packet-sha", SHA], ackDeps);
			expect(result.exitCode).toBe(3);
			expect(result.stderr).toMatch(/E-NOREG.*dispatch-missing/i);
			expect(d.dispatchStore.list()).toEqual([]);
			expect(d.spineLog.read()).toEqual([]);
		});

		it("timeout evidence remains delivered-unacked and is never rendered as acked", () => {
			const d = dispatchDeps();
			const sent = run(["dispatch", "pij-worker", "--packet", "/repo/packet.md", "--wait=20"], d);
			expect(sent.exitCode).toBe(0);
			const record = d.dispatchStore.read("dispatch-test-1");
			if (!record) throw new Error("missing dispatch");
			expect(record.state).toBe("delivered-unacked");
			expect(renderDispatchWaitTimeout(record)).toBe(
				"dispatch dispatch-test-1 state=delivered-unacked (timeout awaiting brief ack)",
			);
			expect(renderDispatchWaitTimeout(record)).not.toContain("state=acked");
		});

		it("real bin timeout persists delivered-unacked, then a matching ack transitions to acked", {
			timeout: 15_000,
		}, () => {
			const root = mkdtempSync(join(tmpdir(), "pij-dispatch-bin-"));
			const home = join(root, "home");
			const repo = join(root, "repo");
			const packet = join(repo, "packet.md");
			try {
				mkdirSync(home, { recursive: true });
				mkdirSync(repo, { recursive: true });
				writeFileSync(packet, "# packet\n");
				const registry = new FsRegistry(home);
				registry.write(
					desc({
						id: "pij-parent",
						folder: repo,
						dataDir: join(home, "pij-parent"),
						eventsPath: join(home, "pij-parent", "events.ndjson"),
						pid: process.pid,
						state: "idle",
					}),
				);
				registry.write(
					desc({
						id: "pij-worker",
						folder: repo,
						dataDir: join(home, "pij-worker"),
						eventsPath: join(home, "pij-worker", "events.ndjson"),
						pid: process.pid,
						state: "idle",
						deliveryMode: "pull",
						boundModel: "test/model",
						effort: "high",
					}),
				);
				const env = {
					...process.env,
					PIJ_HOME: home,
					PIJ_SESSION_ID: "pij-parent",
					COPILOT_AGENT_SESSION_ID: "",
					CLAUDE_CODE_SESSION_ID: "",
					CODEX_THREAD_ID: "",
					TMUX_PANE: "",
				};
				const timedOut = spawnSync(
					process.execPath,
					[PLATFORM_TSX, PIJ_CLI_BIN, "dispatch", "pij-worker", "--packet", packet, "--wait=20"],
					{ cwd: repo, env, encoding: "utf8" },
				);
				expect(timedOut.status, timedOut.stderr).toBe(0);
				const store = new FsDispatchStore(home);
				const record = store.list()[0];
				expect(record?.state).toBe("delivered-unacked");
				if (!record) throw new Error("missing dispatch");
				const terminalOutput = timedOut.stdout.trim().split(/\r?\n/).at(-1);
				expect(terminalOutput).toBe(renderDispatchWaitTimeout(record));
				expect(timedOut.stdout).not.toContain("state=acked");
				const sha = createHash("sha256").update(readFileSync(packet)).digest("hex");
				const acked = spawnSync(
					process.execPath,
					[PLATFORM_TSX, PIJ_CLI_BIN, "ack", record?.id ?? "missing", "--packet-sha", sha],
					{
						cwd: repo,
						env: { ...env, PIJ_SESSION_ID: "pij-worker" },
						encoding: "utf8",
					},
				);
				expect(acked.status, acked.stderr).toBe(0);
				expect(acked.stdout).toContain("state=acked");
				expect(store.read(record?.id ?? "missing")?.state).toBe("acked");
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		});
	});

	describe("canary dispatch — AC-02/AC-07", () => {
		const SHA = "a".repeat(64);
		const EXPECTED_MODEL = "github-copilot/gpt-5.6-sol";

		function canaryDeps() {
			const packets: Array<{
				readonly caller: SessionDescriptor;
				readonly dispatchId: string;
				readonly body: string;
			}> = [];
			const d = platformDeps({
				self: "pij-parent",
				descs: [
					desc({
						id: "pij-parent",
						state: "idle",
						lifecycle: "bound",
						paneId: "%10",
						harnessSessionId: "native-parent",
					}),
					desc({
						id: "pij-worker",
						state: "idle",
						lifecycle: "bound",
						paneId: "%11",
						harnessSessionId: "native-worker",
						boundModel: EXPECTED_MODEL,
						effort: "xhigh",
					}),
				],
			});
			return {
				...d,
				packets,
				models: [
					{
						id: "gpt-5.6-sol",
						name: "GPT-5.6 Sol",
						provider: "github-copilot",
						verified: true,
						contextWindow: 1_050_000,
					},
				],
				contextWindowReader: {
					read: () => ({ label: "1.1M", tokens: 1_100_000, source: "pane-footer" as const }),
				},
				nextCanaryNonce: () => "canary-nonce-7391",
				writeCanaryPacket: (input: {
					readonly caller: SessionDescriptor;
					readonly dispatchId: string;
					readonly body: string;
				}) => {
					packets.push(input);
					return ok({
						path: `${input.caller.dataDir}/canary-packets/${input.dispatchId}.md`,
						sha256: SHA,
					});
				},
			};
		}

		it("parses the target, expected model, and explicit short wait override", () => {
			expect(
				parseArgs([
					"canary",
					"pij-worker",
					"--expect-model",
					EXPECTED_MODEL,
					"--wait=25",
					"--json",
				]),
			).toEqual({
				ok: true,
				value: {
					verb: "canary",
					to: "pij-worker",
					expectedModel: EXPECTED_MODEL,
					waitMs: 25,
					json: true,
				},
			});
		});

		it("writes the nonce packet only after preflight, dispatches it, then attaches CanaryRecord after ack", () => {
			const d = canaryDeps();
			const started = run(
				["canary", "pij-worker", "--expect-model", EXPECTED_MODEL, "--wait=25"],
				d,
			);
			expect(started.exitCode).toBe(0);
			expect(started.follow).toEqual({
				kind: "canary-wait",
				dispatchId: "dispatch-test-1",
				nonce: "canary-nonce-7391",
				expectedModel: EXPECTED_MODEL,
				timeoutMs: 25,
				json: false,
			});
			expect(d.packets).toHaveLength(1);
			expect(d.packets[0]?.body).toContain("canary-nonce-7391");
			expect(d.dispatchStore.read("dispatch-test-1")?.state).toBe("delivered-unacked");
			expect(d.dispatchStore.read("dispatch-test-1")?.canary).toBeUndefined();

			const acknowledged = run(["ack", "dispatch-test-1", "--packet-sha", SHA], {
				...d,
				process: new FakeProcess(999, T + 100, { PIJ_SESSION_ID: "pij-worker" }, [100]),
			});
			expect(acknowledged.exitCode).toBe(0);
			const finalized = finalizeCanary(
				{
					dispatchId: "dispatch-test-1",
					nonce: "canary-nonce-7391",
					expectedModel: EXPECTED_MODEL,
					json: false,
				},
				d,
			);
			expect(finalized.exitCode).toBe(0);
			const record = d.dispatchStore.read("dispatch-test-1");
			expect(record?.canary).toMatchObject({
				dispatchId: "dispatch-test-1",
				nonce: "canary-nonce-7391",
				target: "pij-worker",
				modelCheck: "matched",
				identity: {
					paneId: "%11",
					pid: 100,
					harnessSessionId: "native-worker",
				},
				contextWindow: {
					expected: 1_050_000,
					expectedLabel: "1.1M",
					observedLabel: "1.1M",
					source: "pane-footer",
					check: "matched",
				},
			});
			expect(d.spineLog.read().filter((event) => event.kind === "dispatch")).toHaveLength(4);
		});

		it("precondition and wrong-argument refusals write no packet, dispatch, spine event, or delivery", () => {
			const precondition = canaryDeps();
			const missing = run(["canary", "pij-missing"], precondition);
			expect(missing.exitCode).toBe(2);
			expect(missing.stderr).toContain("E-NOID");
			expect(precondition.packets).toEqual([]);
			expect(precondition.dispatchStore.list()).toEqual([]);
			expect(precondition.spineLog.read()).toEqual([]);
			expect(precondition.delivery.outbox).toEqual([]);

			for (const argv of [
				["canary"],
				["canary", "pij-worker", "extra"],
				["canary", "pij-worker", "--expect-model"],
				["canary", "pij-worker", "--wait=soon"],
				["canary", "pij-worker", "--bogus"],
			] as const) {
				const d = canaryDeps();
				const result = run(argv, d);
				expect(result.exitCode).toBe(64);
				expect(result.stderr).toContain("E-ARG");
				expect(d.packets).toEqual([]);
				expect(d.dispatchStore.list()).toEqual([]);
				expect(d.spineLog.read()).toEqual([]);
				expect(d.delivery.outbox).toEqual([]);
			}
		});

		it("refuses when the packet reread no longer matches the writer sha before any dispatch write", () => {
			const d = {
				...canaryDeps(),
				packetIdentity: (path: string) => ok({ path, sha256: "b".repeat(64) }),
			};
			const refused = run(["canary", "pij-worker"], d);
			expect(refused.exitCode).toBe(3);
			expect(refused.stderr).toMatch(/E-CANARY-PACKET.*sha/i);
			expect(d.dispatchStore.list()).toEqual([]);
			expect(d.spineLog.read()).toEqual([]);
			expect(d.delivery.outbox).toEqual([]);
		});

		it("post-ack model mismatch preserves transport truth but writes no CanaryRecord", () => {
			const d = canaryDeps();
			expect(run(["canary", "pij-worker"], d).exitCode).toBe(0);
			expect(
				run(["ack", "dispatch-test-1", "--packet-sha", SHA], {
					...d,
					process: new FakeProcess(999, T + 100, { PIJ_SESSION_ID: "pij-worker" }, [100]),
				}).exitCode,
			).toBe(0);
			const beforeEvents = d.spineLog.read().length;
			const refused = finalizeCanary(
				{
					dispatchId: "dispatch-test-1",
					nonce: "canary-nonce-7391",
					expectedModel: "github-copilot/gpt-5.5",
					json: false,
				},
				d,
			);
			expect(refused.exitCode).toBe(3);
			expect(refused.stderr).toContain("E-CANARY-MODEL");
			expect(d.dispatchStore.read("dispatch-test-1")?.state).toBe("acked");
			expect(d.dispatchStore.read("dispatch-test-1")?.canary).toBeUndefined();
			expect(d.spineLog.read()).toHaveLength(beforeEvents);
		});

		it("rejects a matching model whose observed footer is the wrong context tier", () => {
			const d = canaryDeps();
			expect(run(["canary", "pij-worker", "--expect-model", EXPECTED_MODEL], d).exitCode).toBe(0);
			expect(
				run(["ack", "dispatch-test-1", "--packet-sha", SHA], {
					...d,
					process: new FakeProcess(999, T + 100, { PIJ_SESSION_ID: "pij-worker" }, [100]),
				}).exitCode,
			).toBe(0);

			const refused = finalizeCanary(
				{
					dispatchId: "dispatch-test-1",
					nonce: "canary-nonce-7391",
					expectedModel: EXPECTED_MODEL,
					json: false,
				},
				{
					...d,
					contextWindowReader: {
						read: () => ({ label: "400K", tokens: 400_000, source: "pane-footer" as const }),
					},
				},
			);
			expect(refused).toEqual({
				stdout: "",
				stderr:
					"E-CANARY-CONTEXT: target 'pij-worker' pinned model 'github-copilot/gpt-5.6-sol' expects 1.1M but pane footer reports 400K",
				exitCode: 3,
			});
			expect(d.dispatchStore.read("dispatch-test-1")?.canary).toBeUndefined();
		});

		it("distinguishes a missing catalog window from an unobservable pane footer", () => {
			const d = canaryDeps();
			expect(run(["canary", "pij-worker", "--expect-model", EXPECTED_MODEL], d).exitCode).toBe(0);
			expect(
				run(["ack", "dispatch-test-1", "--packet-sha", SHA], {
					...d,
					process: new FakeProcess(999, T + 100, { PIJ_SESSION_ID: "pij-worker" }, [100]),
				}).exitCode,
			).toBe(0);

			const refused = finalizeCanary(
				{
					dispatchId: "dispatch-test-1",
					nonce: "canary-nonce-7391",
					expectedModel: EXPECTED_MODEL,
					json: false,
				},
				{ ...d, models: [] },
			);
			expect(refused).toEqual({
				stdout: "",
				stderr:
					"E-CANARY-CONTEXT: target 'pij-worker' pinned model 'github-copilot/gpt-5.6-sol' has no catalog context window; cannot validate effective tier",
				exitCode: 3,
			});
			expect(d.dispatchStore.read("dispatch-test-1")?.canary).toBeUndefined();
		});

		function collectChild(
			args: readonly string[],
			cwd: string,
			env: NodeJS.ProcessEnv,
		): Promise<{
			readonly status: number | null;
			readonly stdout: string;
			readonly stderr: string;
		}> {
			const child = spawn(process.execPath, [PLATFORM_TSX, PIJ_CLI_BIN, ...args], {
				cwd,
				env,
				stdio: ["ignore", "pipe", "pipe"],
			});
			let stdout = "";
			let stderr = "";
			child.stdout.setEncoding("utf8");
			child.stderr.setEncoding("utf8");
			child.stdout.on("data", (chunk: string) => {
				stdout += chunk;
			});
			child.stderr.on("data", (chunk: string) => {
				stderr += chunk;
			});
			return new Promise((resolve) => {
				child.on("close", (status) => resolve({ status, stdout, stderr }));
			});
		}

		async function waitForDispatch(store: FsDispatchStore): Promise<Dispatch> {
			const deadline = Date.now() + 3_000;
			while (Date.now() < deadline) {
				const record = store.list()[0];
				if (record) return record;
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
			throw new Error("timed out waiting for canary dispatch");
		}

		it("real bin timeout leaves delivered-unacked, no CanaryRecord, and a named terminal refusal", {
			timeout: 15_000,
		}, () => {
			const root = mkdtempSync(join(tmpdir(), "pij-canary-timeout-bin-"));
			const home = join(root, "home");
			const repo = join(root, "repo");
			try {
				mkdirSync(home, { recursive: true });
				mkdirSync(repo, { recursive: true });
				const registry = new FsRegistry(home);
				registry.write(
					desc({
						id: "pij-parent",
						folder: repo,
						dataDir: join(home, "pij-parent"),
						eventsPath: join(home, "pij-parent", "events.ndjson"),
						pid: process.pid,
						state: "idle",
						lifecycle: "bound",
						paneId: "%20",
						harnessSessionId: "native-parent",
					}),
				);
				registry.write(
					desc({
						id: "pij-worker",
						folder: repo,
						dataDir: join(home, "pij-worker"),
						eventsPath: join(home, "pij-worker", "events.ndjson"),
						pid: process.pid,
						state: "working",
						lifecycle: "bound",
						deliveryMode: "pull",
						paneId: "%21",
						harnessSessionId: "native-worker",
						boundModel: EXPECTED_MODEL,
						effort: "xhigh",
					}),
				);
				const env = {
					...process.env,
					PIJ_HOME: home,
					PIJ_SESSION_ID: "pij-parent",
					COPILOT_AGENT_SESSION_ID: "",
					CLAUDE_CODE_SESSION_ID: "",
					CODEX_THREAD_ID: "",
					TMUX_PANE: "",
				};
				const timedOut = spawnSync(
					process.execPath,
					[
						PLATFORM_TSX,
						PIJ_CLI_BIN,
						"canary",
						"pij-worker",
						"--expect-model",
						EXPECTED_MODEL,
						"--wait=20",
					],
					{ cwd: repo, env, encoding: "utf8" },
				);
				expect(timedOut.status).toBe(3);
				const record = new FsDispatchStore(home).list()[0];
				if (!record) throw new Error("missing canary dispatch");
				expect(record.state).toBe("delivered-unacked");
				expect(record.canary).toBeUndefined();
				expect(existsSync(record.packetPath)).toBe(true);
				const terminalOutput = timedOut.stdout.trim().split(/\r?\n/).at(-1);
				expect(terminalOutput).toBe(renderCanaryTimeout(record));
				expect(timedOut.stdout).not.toContain("canary PASS");
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		});

		it("real bin PASSES with an unverified tier when the effective context tier is unobservable", {
			timeout: 15_000,
		}, async () => {
			const root = mkdtempSync(join(tmpdir(), "pij-canary-pass-bin-"));
			const home = join(root, "home");
			const repo = join(root, "repo");
			const userHome = join(root, "user-home");
			const fakeBin = join(root, "bin");
			try {
				mkdirSync(home, { recursive: true });
				mkdirSync(repo, { recursive: true });
				mkdirSync(join(userHome, ".pi", "agent"), { recursive: true });
				mkdirSync(fakeBin, { recursive: true });
				writeFileSync(
					join(userHome, ".pi", "agent", "models.json"),
					JSON.stringify({
						providers: {
							"github-copilot": {
								models: [
									{
										id: "gpt-5.6-sol",
										name: "GPT-5.6 Sol",
										contextWindow: 1_050_000,
									},
								],
							},
						},
					}),
				);
				const fakeTmux = join(fakeBin, "tmux");
				writeFileSync(
					fakeTmux,
					'#!/usr/bin/env node\nprocess.stdout.write("gpt-5.6-sol · ready\\n");\n',
				);
				chmodSync(fakeTmux, 0o755);
				const registry = new FsRegistry(home);
				registry.write(
					desc({
						id: "pij-parent",
						folder: repo,
						dataDir: join(home, "pij-parent"),
						eventsPath: join(home, "pij-parent", "events.ndjson"),
						pid: process.pid,
						state: "idle",
						lifecycle: "bound",
						paneId: "%30",
						harnessSessionId: "native-parent",
					}),
				);
				registry.write(
					desc({
						id: "pij-worker",
						folder: repo,
						dataDir: join(home, "pij-worker"),
						eventsPath: join(home, "pij-worker", "events.ndjson"),
						pid: process.pid,
						state: "idle",
						lifecycle: "bound",
						deliveryMode: "pull",
						paneId: "%31",
						harnessSessionId: "native-worker",
						boundModel: EXPECTED_MODEL,
						effort: "xhigh",
					}),
				);
				const parentEnv = {
					...process.env,
					PIJ_HOME: home,
					PIJ_SESSION_ID: "pij-parent",
					COPILOT_AGENT_SESSION_ID: "",
					CLAUDE_CODE_SESSION_ID: "",
					CODEX_THREAD_ID: "",
					TMUX_PANE: "",
					HOME: userHome,
					PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
				};
				const canary = collectChild(
					["canary", "pij-worker", "--expect-model", EXPECTED_MODEL, "--wait=2000"],
					repo,
					parentEnv,
				);
				const store = new FsDispatchStore(home);
				const pending = await waitForDispatch(store);
				const sha = createHash("sha256").update(readFileSync(pending.packetPath)).digest("hex");
				const acked = spawnSync(
					process.execPath,
					[PLATFORM_TSX, PIJ_CLI_BIN, "ack", pending.id, "--packet-sha", sha],
					{
						cwd: repo,
						env: { ...parentEnv, PIJ_SESSION_ID: "pij-worker" },
						encoding: "utf8",
					},
				);
				expect(acked.status, acked.stderr).toBe(0);
				// plan 071 D6 — the fake tmux footer publishes NO context marker, which
				// is what every real claude pane looks like. That used to be a hard
				// E-CANARY-CONTEXT refusal; it is now a pass that says out loud the
				// tier was never verified. (The observed-contradiction refusal is
				// covered by the control in core/canary.test.ts.)
				const completed = await canary;
				expect(completed.status, completed.stderr).toBe(0);
				expect(completed.stdout).toContain("canary PASS");
				expect(completed.stdout).toContain("contextTier=unverified");
				const record = store.read(pending.id);
				if (!record) throw new Error("missing acknowledged dispatch");
				expect(record.canary?.contextWindow?.check).toBe("unverified");
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		});
	});
});
