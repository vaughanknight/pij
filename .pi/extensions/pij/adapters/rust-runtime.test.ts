import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventFrame, Registration, RustSeatDescriptor } from "../core/daemon-wire.js";
import { announceText, frame, parseFrame } from "../core/message.js";
import { type DaemonHttpDeps, PijDaemonClient } from "./daemon-http.js";
import { FakePiRuntime, FakeTmux } from "./fakes.js";
import { PiRuntimeAdapter } from "./pi-runtime.js";
import { RustRuntimeSession } from "./rust-runtime.js";

function envelope(command: string, data: unknown): Response {
	return new Response(JSON.stringify({ ok: true, command, v: 2, data }));
}

function eventResponse(text: string, keepOpen = true): Response {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode(text));
				if (!keepOpen) controller.close();
			},
		}),
	);
}
afterEach(() => vi.unstubAllEnvs());

const INBOX_CLAIM_WIRE = readFileSync(
	new URL("../../../../crates/daemon/tests/fixtures/inbox-claim.wire.json", import.meta.url),
	"utf8",
).trim();
const REGISTER_RESPONSES = JSON.parse(
	readFileSync(
		new URL("../../../../crates/testkit/fixtures/register-response.json", import.meta.url),
		"utf8",
	),
) as Record<"created" | "rebound" | "same", RustSeatDescriptor>;
const PUSHED_EVENT_WIRE = JSON.stringify({
	msg_id: "000000000000feed-0000000000000000",
	from: "pij-from",
	body: "before bind",
});

function inboxClaimFixture(): unknown {
	return JSON.parse(INBOX_CLAIM_WIRE) as unknown;
}

class FailingPiRuntime extends FakePiRuntime {
	inboundAttempts = 0;

	override inject(text: string, mode: "immediate" | "steer"): void {
		if (text === frame("pij-from", "before bind")) {
			this.inboundAttempts += 1;
			throw new Error("test injection failed");
		}
		super.inject(text, mode);
	}
}

/** Idle native submission emits message_start; busy submission is explicitly consumed by each test. */
function bindRuntime(
	runtime: RustRuntimeSession,
	pi: Parameters<RustRuntimeSession["setPi"]>[0],
): void {
	const inject = pi.inject.bind(pi);
	vi.spyOn(pi, "inject").mockImplementation((text, mode, messageId) => {
		inject(text, mode, messageId);
		if (messageId !== undefined && pi.isIdle()) {
			void runtime.onMessageStart({
				role: "custom",
				customType: "pij",
				details: { pijMessageId: messageId },
			});
		}
	});
	runtime.setPi(pi);
}

async function bootPushedEvent(
	payload: string,
	pi: FakePiRuntime,
	claimResponse: unknown | Promise<unknown> = inboxClaimFixture(),
) {
	vi.stubEnv("PIJ_ANNOUNCE_TO", "");
	vi.stubEnv("PIJ_SPAWN_ID", "");
	vi.stubEnv("PIJ_SPAWN_MODEL", "");
	vi.stubEnv("PIJ_SPAWN_TASK", "");
	let registeredId = "";
	const acknowledgements: Array<Record<string, unknown>> = [];
	const sends: Array<Record<string, unknown>> = [];
	const claimRequests: string[] = [];
	let eventStreams = 0;
	const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		const path = new URL(String(url)).pathname;
		if (path === "/v1/seats") return envelope("pij seats", { seats: [], unavailable: [] });
		if (path === "/v1/register") {
			const claim = JSON.parse(String(init?.body)) as Record<string, unknown>;
			registeredId = String(claim.id);
			return envelope("pij register", {
				id: registeredId,
				harness: claim.harness,
				pane: claim.pane,
				proc: { pid: claim.pid, proc_start: claim.proc_start },
				folder: claim.folder,
				state: "idle",
				parent: null,
			});
		}
		if (path === "/v1/events") {
			eventStreams += 1;
			const pushed =
				eventStreams === 1
					? `${JSON.stringify({ machine: "test", cursor: 1, event: { v: 1, at: 1, kind: "message.pushed", seat: registeredId, payload } })}\n`
					: "";
			return eventResponse(
				`${JSON.stringify({ hello: true, v: 1, build: "pij-rs test" })}\n${pushed}`,
			);
		}
		if (path === "/v1/inbox") {
			// The pushed row appears only after stream attachment; a claimed row
			// cannot be handed out again, including during a replacement boot.
			if (eventStreams === 0 || claimRequests.length > 0) return envelope("pij inbox", []);
			claimRequests.push(String(url));
			return envelope("pij inbox", await claimResponse);
		}
		if (path === "/v1/inbox/ack") {
			const acknowledgement = JSON.parse(String(init?.body)) as Record<string, unknown>;
			acknowledgements.push(acknowledgement);
			return envelope("pij inbox", acknowledgement.job_id);
		}
		if (path === "/v1/send") {
			const sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
			sends.push(sent);
			return envelope("pij send", { msg_id: sent.msg_id, outcome: "accepted", at: 1 });
		}
		throw new Error(`unexpected path ${path}`);
	});
	const deps: DaemonHttpDeps = {
		fetch: fetchMock as typeof fetch,
		readFile: async () => "secret",
		processStart: () => 20260829103052,
	};
	const runtime = new RustRuntimeSession(
		new PijDaemonClient({ addr: "127.0.0.1:7461", stateDir: "/tmp/state" }, "secret", deps),
		new FakeTmux(),
		[],
	);
	bindRuntime(runtime, pi);
	await runtime.boot({
		folder: "/abs/tree",
		dataDir: "",
		eventsPath: "",
		harness: "pi",
		harnessSessionId: "native-session",
		piSessionId: "native-session",
		runtimeBin: "omp",
		paneId: "%42",
		resetRuntimeState: true,
		reason: "startup",
	});
	return { acknowledgements, claimRequests, runtime, sends };
}

function announceRuntime(
	seats: readonly RustSeatDescriptor[],
	responses: readonly RustSeatDescriptor[],
) {
	vi.stubEnv("PIJ_ANNOUNCE_TO", "");
	vi.stubEnv("PIJ_SESSION_ID", responses[0]?.id);
	vi.stubEnv("PIJ_SPAWN_TASK", undefined);
	const registrations: Registration[] = [];
	const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		const path = new URL(String(url)).pathname;
		if (path === "/v1/inbox") return envelope("pij inbox", []);
		if (path === "/v1/seats") return envelope("pij seats", { seats, unavailable: [] });
		if (path === "/v1/register") {
			const response = responses[registrations.length];
			if (!response) throw new Error("unexpected registration");
			registrations.push(JSON.parse(String(init?.body)) as Registration);
			return envelope("pij register", response);
		}
		if (path === "/v1/events") {
			return eventResponse(`${JSON.stringify({ hello: true, v: 1, build: "pij-rs test" })}\n`);
		}
		throw new Error(`unexpected path ${path}`);
	});
	const client = new PijDaemonClient({ addr: "127.0.0.1:7461", stateDir: "/tmp/state" }, "secret", {
		fetch: fetchMock as typeof fetch,
		readFile: async () => "secret",
		processStart: () => 20260905092248,
	});
	const runtime = new RustRuntimeSession(client, new FakeTmux(), []);
	const pi = new FakePiRuntime();
	bindRuntime(runtime, pi);
	const input = {
		folder: "/abs/tree",
		dataDir: "",
		eventsPath: "",
		harness: "pi" as const,
		harnessSessionId: "native-session",
		piSessionId: "native-session",
		runtimeBin: "omp" as const,
		resetRuntimeState: true,
		reason: "startup" as const,
	};
	return { runtime, pi, input, registrations };
}

describe("RustRuntimeSession", () => {
	it.each([
		"new",
		"reload",
	] as const)("settles the original %s claim after runtime teardown", async (command) => {
		const claim = JSON.parse(INBOX_CLAIM_WIRE);
		claim[0].message.command = command;
		claim[0].message.body = "";
		let complete!: () => void;
		const pi = new FakePiRuntime();
		const control = vi.spyOn(pi, "control").mockImplementation(
			() =>
				new Promise<boolean>((resolve) => {
					complete = () => {
						runtime.shutdown(command);
						resolve(true);
					};
				}) as never,
		);
		const { runtime, acknowledgements } = await bootPushedEvent(PUSHED_EVENT_WIRE, pi, claim);
		try {
			await vi.waitFor(() => expect(control).toHaveBeenCalledOnce());
			expect(acknowledgements).toEqual([]);
			const originalSeat = runtime.readSelf()?.id;
			complete();
			await vi.waitFor(() =>
				expect(acknowledgements).toEqual([
					{
						seat: originalSeat,
						job_id: claim[0].job_id,
						control_outcome: { outcome: "executed" },
					},
				]),
			);
		} finally {
			runtime.shutdown("quit");
		}
	});
	it.each([
		"compact",
		"new",
		"reload",
	])("executes a claimed %s command and acknowledges its outcome", async (command) => {
		const claim = JSON.parse(INBOX_CLAIM_WIRE);
		claim[0].message.command = command;
		claim[0].message.body = "";
		const pi = new FakePiRuntime();
		const { runtime, acknowledgements } = await bootPushedEvent(PUSHED_EVENT_WIRE, pi, claim);
		try {
			await vi.waitFor(() => expect(acknowledgements).toHaveLength(1));
			expect(acknowledgements[0]).toMatchObject({
				job_id: claim[0].job_id,
				control_outcome: { outcome: "executed" },
			});
			expect(pi.compactCount).toBe(command === "compact" ? 1 : 0);
			expect(pi.controlCalls).toEqual(command === "compact" ? [] : [command]);
			expect(pi.injects.some(({ text }) => text.includes(`/${command}`))).toBe(false);
		} finally {
			runtime.shutdown("quit");
		}
	});

	it("waits for a claimed command runtime outcome before acknowledging", async () => {
		const claim = JSON.parse(INBOX_CLAIM_WIRE);
		claim[0].message.command = "compact";
		claim[0].message.body = "";
		let complete!: () => void;
		const completion = new Promise<void>((resolve) => {
			complete = resolve;
		});
		const pi = new FakePiRuntime();
		const compact = vi.spyOn(pi, "compact").mockImplementation(() => completion);
		const { runtime, acknowledgements } = await bootPushedEvent(PUSHED_EVENT_WIRE, pi, claim);
		try {
			await vi.waitFor(() => expect(compact).toHaveBeenCalledOnce());
			expect(acknowledgements).toEqual([]);
			complete();
			await vi.waitFor(() =>
				expect(acknowledgements[0]?.control_outcome).toEqual({ outcome: "executed" }),
			);
		} finally {
			complete();
			runtime.shutdown("quit");
		}
	});

	it.each([
		"new",
		"reload",
	])("refuses an unarmed %s command without later execution", async (command) => {
		const claim = JSON.parse(INBOX_CLAIM_WIRE);
		claim[0].message.command = command;
		claim[0].message.body = "";
		const pi = new FakePiRuntime(true, false);
		const { runtime, acknowledgements } = await bootPushedEvent(PUSHED_EVENT_WIRE, pi, claim);
		try {
			await vi.waitFor(() => expect(acknowledgements).toHaveLength(1));
			expect(acknowledgements[0]?.control_outcome).toMatchObject({
				outcome: "refused",
				reason: expect.stringContaining("/pij"),
			});
			pi.setArmed(true);
			expect(runtime.applyPendingControl()).toEqual([]);
			expect(pi.controlCalls).toEqual([]);
		} finally {
			runtime.shutdown("quit");
		}
	});

	it("acknowledges command runtime errors as refused instead of retrying execution", async () => {
		const claim = JSON.parse(INBOX_CLAIM_WIRE);
		claim[0].message.command = "compact";
		claim[0].message.body = "";
		const pi = new FakePiRuntime();
		const compact = vi.spyOn(pi, "compact").mockImplementation(() => {
			throw new Error("compaction failed");
		});
		const { runtime, acknowledgements } = await bootPushedEvent(PUSHED_EVENT_WIRE, pi, claim);
		try {
			await vi.waitFor(() => expect(acknowledgements).toHaveLength(1));
			expect(acknowledgements[0]?.control_outcome).toEqual({
				outcome: "refused",
				reason: "compaction failed",
			});
			expect(compact).toHaveBeenCalledOnce();
		} finally {
			runtime.shutdown("quit");
		}
	});

	it("native control sends carry command and pane caller proof with no scaffold body", async () => {
		vi.stubEnv("TMUX_PANE", "%42");
		const { runtime, sends } = await bootPushedEvent(PUSHED_EVENT_WIRE, new FakePiRuntime());
		try {
			await runtime.send("pij-target", frame("pij-from", ""), "compact");
			expect(sends.at(-1)).toMatchObject({
				to: { seat: "pij-target" },
				body: "",
				command: "compact",
				caller: { tmuxPane: "%42", pid: process.pid, procStart: 20260829103052 },
			});
			await expect(runtime.send("pij-target", "real body", "compact")).rejects.toThrow(
				/body|message/i,
			);
			expect(sends).toHaveLength(1);
		} finally {
			runtime.shutdown("quit");
		}
	});
	it("does not overwrite a claude seat when omp boots in the same pane", async () => {
		vi.stubEnv("PIJ_ANNOUNCE_TO", "");
		vi.stubEnv("PIJ_SESSION_ID", undefined);
		vi.stubEnv("PIJ_SPAWN_TASK", undefined);
		const incumbent: RustSeatDescriptor = {
			...REGISTER_RESPONSES.created,
			id: "pij-claude-incumbent",
			harness: "claude",
			pane: "%123",
			proc: { pid: 64616, proc_start: 20260905080000 },
		};
		const seats = new Map([[incumbent.id, incumbent]]);
		const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
			const path = new URL(String(url)).pathname;
			if (path === "/v1/inbox") return envelope("pij inbox", []);
			if (path === "/v1/seats") {
				return envelope("pij seats", { seats: [...seats.values()], unavailable: [] });
			}
			if (path === "/v1/register") {
				const claim = JSON.parse(String(init?.body)) as Registration;
				const accepted: RustSeatDescriptor = {
					...REGISTER_RESPONSES.created,
					id: claim.id,
					harness: claim.harness,
					pane: claim.pane,
				};
				seats.set(accepted.id, accepted);
				return envelope("pij register", accepted);
			}
			if (path === "/v1/events") {
				return eventResponse(`${JSON.stringify({ hello: true, v: 1, build: "pij-rs test" })}\n`);
			}
			throw new Error(`unexpected path ${path}`);
		});
		const client = new PijDaemonClient(
			{ addr: "127.0.0.1:7461", stateDir: "/tmp/state" },
			"secret",
			{
				fetch: fetchMock as typeof fetch,
				readFile: async () => "secret",
				processStart: () => 20260905092248,
			},
		);
		const runtime = new RustRuntimeSession(client, new FakeTmux(), []);
		bindRuntime(runtime, new FakePiRuntime());
		try {
			const boot = await runtime.boot({
				folder: "/abs/tree",
				dataDir: "",
				eventsPath: "",
				harness: "pi",
				harnessSessionId: "omp-native-session",
				piSessionId: "omp-native-session",
				runtimeBin: "omp",
				paneId: incumbent.pane,
				resetRuntimeState: true,
				reason: "startup",
			});
			expect(boot.id).not.toBe(incumbent.id);
			expect(seats.size).toBe(2);
			expect(seats.get(incumbent.id)).toEqual(incumbent);
			expect(seats.get(boot.id)?.harness).toBe("omp");
		} finally {
			runtime.shutdown("quit");
		}
	});

	describe("register binding announce contract", () => {
		it.each([
			["created", false, 1],
			["rebound", true, 1],
			["same", true, 0],
			["same", false, 0],
		] as const)("binding=%s, pre-existing row=%s injects announceText %s times", async (binding, known, count) => {
			const response = REGISTER_RESPONSES[binding];
			const { runtime, pi, input } = announceRuntime(known ? [REGISTER_RESPONSES.created] : [], [
				response,
			]);
			try {
				const boot = await runtime.boot(input);
				expect(boot.id).toBe(response.id);
				expect(pi.injects).toEqual(
					count === 0 ? [] : [{ text: announceText(boot.id), mode: "immediate" }],
				);
			} finally {
				runtime.shutdown("quit");
			}
		});

		it.each([
			"pane",
			"harness",
			undefined,
		] as const)("reports only pane provenance (%s) while announcing rebound once and same never", async (procSource) => {
			const provenance = procSource === undefined ? {} : { proc_source: procSource };
			const rebound = { ...REGISTER_RESPONSES.rebound, ...provenance };
			const same = { ...REGISTER_RESPONSES.same, ...provenance };
			const { runtime, pi, input } = announceRuntime([REGISTER_RESPONSES.created], [rebound, same]);
			const notices: string[] = [];
			const notice = (text: string) => notices.push(text);
			try {
				const boot = await runtime.boot({ ...input, notice });
				expect(pi.injects).toEqual([{ text: announceText(boot.id), mode: "immediate" }]);
				expect(notices).toEqual(
					procSource === "pane"
						? [`pij: harness discovery fell back to the pane; registered pid ${rebound.proc?.pid}.`]
						: [],
				);
				runtime.shutdown("reload");
				const reloaded = await runtime.boot({
					...input,
					notice,
					reason: "reload",
					resetRuntimeState: false,
				});
				expect(reloaded.id).toBe(boot.id);
				expect(pi.injects).toEqual([{ text: announceText(boot.id), mode: "immediate" }]);
				expect(notices).toEqual(
					procSource === "pane"
						? [
								`pij: harness discovery fell back to the pane; registered pid ${rebound.proc?.pid}.`,
								`pij: harness discovery fell back to the pane; registered pid ${same.proc?.pid}.`,
							]
						: [],
				);
			} finally {
				runtime.shutdown("quit");
			}
		});

		it("reports unbound when pane provenance has no process identity", async () => {
			const response: RustSeatDescriptor = {
				id: REGISTER_RESPONSES.rebound.id,
				harness: "omp",
				folder: "/abs/tree",
				state: "idle",
				binding: "rebound",
				proc_source: "pane",
			};
			const { runtime, pi, input } = announceRuntime([REGISTER_RESPONSES.created], [response]);
			const notice = vi.fn();
			try {
				const boot = await runtime.boot({ ...input, notice });
				expect(notice.mock.calls).toEqual([
					["pij: harness discovery fell back to the pane; registered pid unbound."],
				]);
				expect(pi.injects).toEqual([{ text: announceText(boot.id), mode: "immediate" }]);
			} finally {
				runtime.shutdown("quit");
			}
		});

		it.each([
			"new",
			"fork",
		] as const)("announces the new session id once on %s, not again on reload", async (reason) => {
			const predecessor = { ...REGISTER_RESPONSES.rebound, id: "pij-predecessor" };
			const { runtime, pi, input, registrations } = announceRuntime(
				[predecessor],
				[predecessor, REGISTER_RESPONSES.created, REGISTER_RESPONSES.same],
			);
			try {
				await runtime.boot(input);
				expect(pi.injects).toEqual([{ text: announceText(predecessor.id), mode: "immediate" }]);
				runtime.shutdown(reason);
				const nextInput = {
					...input,
					harnessSessionId: `${reason}-session`,
					piSessionId: `${reason}-session`,
				};
				const successor = await runtime.boot({ ...nextInput, reason });
				expect(successor.id).not.toBe(predecessor.id);
				expect(registrations[1]?.id).not.toBe(predecessor.id);
				expect(registrations[1]?.supersedes).toBe(predecessor.id);
				const expected = [
					{ text: announceText(predecessor.id), mode: "immediate" },
					{ text: announceText(successor.id), mode: "immediate" },
				];
				expect(pi.injects).toEqual(expected);
				runtime.shutdown("reload");
				await runtime.boot({ ...nextInput, reason: "reload", resetRuntimeState: false });
				expect(pi.injects).toEqual(expected);
			} finally {
				runtime.shutdown("quit");
			}
		});

		it.each([
			false,
			true,
		])("preserves old-daemon inference with no binding (pre-existing row=%s)", async (known) => {
			const response = { ...REGISTER_RESPONSES.rebound };
			Reflect.deleteProperty(response, "binding");
			const { runtime, pi, input } = announceRuntime(known ? [response] : [], [response]);
			try {
				const boot = await runtime.boot(input);
				expect(pi.injects).toEqual(
					known ? [] : [{ text: announceText(boot.id), mode: "immediate" }],
				);
			} finally {
				runtime.shutdown("quit");
			}
		});
	});

	it("registers structural identity, forwards unknown events, injects a push, and correlates reply", async () => {
		vi.stubEnv("PIJ_ANNOUNCE_TO", "");
		vi.stubEnv("PIJ_SPAWN_ID", "");
		vi.stubEnv("PIJ_SPAWN_MODEL", "");
		let registeredId = "";
		const registrations: Array<Record<string, unknown>> = [];
		const sends: Array<Record<string, unknown>> = [];
		const acknowledgements: Array<Record<string, unknown>> = [];
		const claimRequests: string[] = [];
		let streamStarted = false;
		const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
			const path = new URL(String(url)).pathname;
			if (path === "/v1/seats") return envelope("pij seats", { seats: [], unavailable: [] });
			if (path === "/v1/register") {
				const claim = JSON.parse(String(init?.body)) as Record<string, unknown>;
				registrations.push(claim);
				registeredId = String(claim.id);
				return envelope("pij register", {
					id: registeredId,
					harness: claim.harness,
					pane: claim.pane,
					proc: { pid: claim.pid, proc_start: claim.proc_start },
					folder: claim.folder,
					state: "idle",
					parent: claim.parent ?? null,
					spawn_id: claim.spawn_id,
				});
			}
			if (path === "/v1/events") {
				streamStarted = true;
				return eventResponse(
					`${JSON.stringify({ hello: true, v: 1, build: "pij-rs test" })}\n` +
						`${JSON.stringify({ machine: "test", cursor: 1, event: { v: 1, at: 1, kind: "future.kind", seat: registeredId, payload: '{"opaque":true}' } })}\n` +
						`${JSON.stringify({ machine: "test", cursor: 2, event: { v: 1, at: 2, kind: "message.pushed", seat: registeredId, payload: PUSHED_EVENT_WIRE } })}\n`,
				);
			}
			if (path === "/v1/inbox") {
				if (!streamStarted || acknowledgements.length > 0) return envelope("pij inbox", []);
				expect(pi.injects.some((item) => item.text === frame("pij-from", "before bind"))).toBe(
					false,
				);
				claimRequests.push(String(url));
				return envelope("pij inbox", inboxClaimFixture());
			}
			if (path === "/v1/inbox/ack") {
				expect(pi.injects.some((item) => item.text === frame("pij-from", "before bind"))).toBe(
					true,
				);
				const acknowledgement = JSON.parse(String(init?.body)) as Record<string, unknown>;
				acknowledgements.push(acknowledgement);
				return envelope("pij inbox", acknowledgement.job_id);
			}
			if (path === "/v1/send") {
				const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
				sends.push(request);
				return envelope("pij send", {
					msg_id: request.msg_id,
					outcome: { outcome: "queued" },
					at: 3,
				});
			}
			throw new Error(`unexpected path ${path}`);
		});
		const deps: DaemonHttpDeps = {
			fetch: fetchMock as typeof fetch,
			readFile: async () => "secret",
			processStart: () => 20260829103052,
		};
		const client = new PijDaemonClient(
			{ addr: "127.0.0.1:7461", stateDir: "/tmp/state" },
			"secret",
			deps,
		);
		const runtime = new RustRuntimeSession(client, new FakeTmux(), []);
		const pi = new FakePiRuntime();
		bindRuntime(runtime, pi);

		const boot = await runtime.boot({
			folder: "/abs/tree",
			dataDir: "",
			eventsPath: "",
			harness: "pi",
			harnessSessionId: "native-session",
			piSessionId: "native-session",
			runtimeBin: "omp",
			paneId: "%42",
			resetRuntimeState: true,
			reason: "startup",
		});

		expect(boot.id).toBe(registeredId);
		expect(registrations).toHaveLength(1);
		expect(registrations[0]).toMatchObject({
			id: registeredId,
			harness: "omp",
			folder: "/abs/tree",
			pane: "%42",
			pid: process.pid,
			proc_start: 20260829103052,
			harness_session: "native-session",
			relay: false,
		});
		await vi.waitFor(() => {
			expect(pi.injects.some((item) => item.text === frame("pij-from", "before bind"))).toBe(true);
			expect(acknowledgements).toEqual([{ seat: registeredId, job_id: 1 }]);
			expect(claimRequests).toEqual([expect.stringContaining(`/v1/inbox?seat=${registeredId}`)]);
		});
		expect(runtime.eventCount()).toBeGreaterThanOrEqual(2);

		await runtime.send("pij-from", "reply");
		expect(sends).toHaveLength(1);
		expect(sends[0]).toMatchObject({
			from: registeredId,
			to: { seat: "pij-from" },
			body: "reply",
			in_reply_to: "000000000000feed-0000000000000000",
		});

		const predecessor = boot.id;
		const successor = await runtime.boot({
			folder: "/abs/tree",
			dataDir: "",
			eventsPath: "",
			harness: "pi",
			harnessSessionId: "new-native-session",
			piSessionId: "new-native-session",
			runtimeBin: "omp",
			paneId: "%42",
			resetRuntimeState: true,
			reason: "new",
		});
		expect(successor.id).not.toBe(predecessor);
		expect(registrations[1]).toMatchObject({
			id: successor.id,
			supersedes: predecessor,
			pid: process.pid,
			proc_start: 20260829103052,
		});
	});

	it("binds startup to the daemon row for the spawned pane", async () => {
		vi.stubEnv("PIJ_ANNOUNCE_TO", "");
		vi.stubEnv("PIJ_SESSION_ID", "pij-env-candidate");
		vi.stubEnv("PIJ_SPAWN_ID", "spawn-132");
		const registrations: Array<Record<string, unknown>> = [];
		const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
			const path = new URL(String(url)).pathname;
			if (path === "/v1/inbox") return envelope("pij inbox", []);
			if (path === "/v1/seats") {
				return envelope("pij seats", {
					seats: [
						{
							id: "pij-spawned-row",
							harness: "omp",
							folder: "/abs/tree",
							pane: "%132",
							proc: null,
							state: "idle",
							parent: "pij-parent",
							spawn_id: "spawn-132",
						},
					],
					unavailable: [],
				});
			}
			if (path === "/v1/register") {
				const claim = JSON.parse(String(init?.body)) as Record<string, unknown>;
				registrations.push(claim);
				return envelope("pij register", {
					id: "pij-spawned-row",
					harness: "omp",
					folder: "/abs/tree",
					pane: "%132",
					proc: { pid: process.pid, proc_start: 20260902013200 },
					state: "idle",
					parent: "pij-parent",
					spawn_id: "spawn-132",
				});
			}
			if (path === "/v1/events") {
				return eventResponse(`${JSON.stringify({ hello: true, v: 1, build: "pij-rs test" })}\n`);
			}
			throw new Error(`unexpected path ${path}`);
		});
		const client = new PijDaemonClient(
			{ addr: "127.0.0.1:7461", stateDir: "/tmp/state" },
			"secret",
			{
				fetch: fetchMock as typeof fetch,
				readFile: async () => "secret",
				processStart: () => 20260902013200,
			},
		);
		const runtime = new RustRuntimeSession(client, new FakeTmux(), []);
		bindRuntime(runtime, new FakePiRuntime());

		const boot = await runtime.boot({
			folder: "/abs/tree",
			dataDir: "",
			eventsPath: "",
			harness: "pi",
			harnessSessionId: "native-session",
			piSessionId: "native-session",
			actualModel: "github-copilot/gpt-5.6-sol",
			runtimeBin: "omp",
			paneId: "%132",
			resetRuntimeState: true,
			reason: "startup",
		});

		expect(boot.id).toBe("pij-spawned-row");
		expect(process.env.PIJ_SESSION_ID).toBe("pij-spawned-row");
		expect(registrations).toHaveLength(1);
		expect(registrations[0]).toMatchObject({
			id: "pij-spawned-row",
			pane: "%132",
			spawn_id: "spawn-132",
			actual_model: "github-copilot/gpt-5.6-sol",
			actual_model_observed: true,
		});
	});

	it("suppresses injection when another worker already owns the queued row", async () => {
		const pi = new FakePiRuntime();
		const { acknowledgements, claimRequests, runtime } = await bootPushedEvent(
			PUSHED_EVENT_WIRE,
			pi,
			[],
		);

		await vi.waitFor(() => {
			expect(runtime.eventCount("daemon_event_claim_unavailable")).toBe(1);
		});
		expect(claimRequests).toHaveLength(1);
		expect(pi.injects.some((item) => item.text === frame("pij-from", "before bind"))).toBe(false);
		expect(acknowledgements).toEqual([]);
	});

	it("leaves an in-flight claim unacked when a new session replaces its seat", async () => {
		let resolveClaim: (value: unknown) => void = () => {
			throw new Error("claim resolver was not installed");
		};
		const delayedClaim = new Promise<unknown>((resolve) => {
			resolveClaim = resolve;
		});
		const pi = new FakePiRuntime();
		const { acknowledgements, claimRequests, runtime } = await bootPushedEvent(
			PUSHED_EVENT_WIRE,
			pi,
			delayedClaim,
		);
		await vi.waitFor(() => expect(claimRequests).toHaveLength(1));
		const previous = runtime.readSelf()?.id;

		const successor = await runtime.boot({
			folder: "/abs/tree",
			dataDir: "",
			eventsPath: "",
			harness: "pi",
			harnessSessionId: "new-native-session",
			piSessionId: "new-native-session",
			runtimeBin: "omp",
			paneId: "%42",
			resetRuntimeState: true,
			reason: "new",
		});
		expect(previous).toBeDefined();
		expect(successor.id).not.toBe(previous);

		resolveClaim(inboxClaimFixture());
		await vi.waitFor(() => {
			expect(runtime.eventCount("daemon_event_claim_stale")).toBe(1);
		});
		expect(pi.injects.some((item) => item.text === frame("pij-from", "before bind"))).toBe(false);
		expect(acknowledgements).toEqual([]);
	});

	it("delivers the authority-owned claim when the pushed event names a different message", async () => {
		const pi = new FakePiRuntime();
		const announced = JSON.stringify({
			msg_id: "newer-event",
			from: "pij-newer",
			body: "newer body",
		});
		const { acknowledgements, runtime } = await bootPushedEvent(announced, pi);

		await vi.waitFor(() => {
			expect(pi.injects.some((item) => item.text === frame("pij-from", "before bind"))).toBe(true);
			expect(runtime.eventCount("daemon_event_claim_mismatch")).toBe(1);
			expect(acknowledgements).toHaveLength(1);
		});
	});

	it("does not acknowledge when the runtime injection fails", async () => {
		const pi = new FailingPiRuntime();
		const { acknowledgements, runtime } = await bootPushedEvent(PUSHED_EVENT_WIRE, pi);

		await vi.waitFor(() => {
			expect(pi.inboundAttempts).toBe(1);
			expect(runtime.eventCount("daemon_event_error")).toBe(1);
		});
		expect(acknowledgements).toEqual([]);
	});

	it.each([
		false,
		true,
	])("re-attaches after key rotation, preserves seat continuity, and consumes replay once (seat known: %s)", async (seatKnown) => {
		vi.stubEnv("PIJ_ANNOUNCE_TO", "");
		vi.stubEnv("PIJ_SPAWN_ID", "");
		vi.stubEnv("PIJ_SPAWN_MODEL", "");
		vi.stubEnv("PIJ_SPAWN_TASK", "");
		let key = "old-key";
		const acceptedIds: string[] = [];
		let registeredId = "";
		let eventAttach = 0;
		let seatReads = 0;
		const registrations: Array<Record<string, unknown>> = [];
		const acknowledgements: Array<Record<string, unknown>> = [];
		const eventUrls: URL[] = [];
		const eventAuthorizations: string[] = [];
		const notices: string[] = [];
		const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
			const parsed = new URL(String(url));
			if (parsed.pathname === "/v1/seats") {
				seatReads += 1;
				const seats =
					seatReads > 1 && seatKnown
						? [
								{
									id: registeredId,
									harness: "omp",
									pane: "%42",
									proc: { pid: process.pid, proc_start: 20260829103052 },
									folder: "/abs/tree",
									state: "idle",
									parent: null,
								},
							]
						: [];
				return envelope("pij seats", { seats, unavailable: [] });
			}
			if (parsed.pathname === "/v1/register") {
				const claim = JSON.parse(String(init?.body)) as Record<string, unknown>;
				registrations.push(claim);
				registeredId = String(claim.id);
				acceptedIds.push(registeredId);
				return envelope("pij register", {
					id: registeredId,
					harness: claim.harness,
					pane: claim.pane,
					proc: { pid: claim.pid, proc_start: claim.proc_start },
					folder: claim.folder,
					state: "idle",
					parent: null,
				});
			}
			if (parsed.pathname === "/v1/events") {
				eventAttach += 1;
				eventUrls.push(parsed);
				eventAuthorizations.push(String((init?.headers as Record<string, string>).Authorization));
				if (eventAttach === 1) {
					key = "new-key";
					return eventResponse(
						`${JSON.stringify({ hello: true, v: 1, build: "pij-rs test" })}\n` +
							`${JSON.stringify({ machine: "test", cursor: 1, event: { v: 1, at: 1, kind: "future.kind", payload: "{}" } })}\n`,
						false,
					);
				}
				return eventResponse(
					`${JSON.stringify({ hello: true, v: 1, build: "pij-rs test" })}\n` +
						`${JSON.stringify({ machine: "test", cursor: 2, event: { v: 1, at: 2, kind: "message.pushed", seat: registeredId, payload: PUSHED_EVENT_WIRE } })}\n`,
				);
			}
			if (parsed.pathname === "/v1/inbox") {
				return envelope(
					"pij inbox",
					eventAttach < 2 || acknowledgements.length > 0 ? [] : inboxClaimFixture(),
				);
			}
			if (parsed.pathname === "/v1/inbox/ack") {
				const acknowledgement = JSON.parse(String(init?.body)) as Record<string, unknown>;
				acknowledgements.push(acknowledgement);
				return envelope("pij inbox", acknowledgement.job_id);
			}
			throw new Error(`unexpected path ${parsed.pathname}`);
		});
		const client = new PijDaemonClient(
			{ addr: "127.0.0.1:7461", stateDir: "/tmp/state" },
			"old-key",
			{
				fetch: fetchMock as typeof fetch,
				readFile: async () => key,
				processStart: () => 20260829103052,
			},
		);
		const runtime = new RustRuntimeSession(client, new FakeTmux(), []);
		const pi = new FakePiRuntime();
		bindRuntime(runtime, pi);
		const boot = await runtime.boot({
			folder: "/abs/tree",
			dataDir: "",
			eventsPath: "",
			harness: "pi",
			harnessSessionId: "native-session",
			piSessionId: "native-session",
			runtimeBin: "omp",
			paneId: "%42",
			resetRuntimeState: true,
			reason: "startup",
			notice: (text) => notices.push(text),
		});

		await vi.waitFor(() => {
			expect(acknowledgements).toEqual([{ seat: boot.id, job_id: 1 }]);
			expect(registrations).toHaveLength(seatKnown ? 1 : 2);
		});
		if (!seatKnown) expect(registrations[1]).toMatchObject({ id: boot.id, pane: "%42" });
		expect(new Set(acceptedIds)).toEqual(new Set([boot.id]));
		expect(registrations.every((claim) => claim.pane === "%42")).toBe(true);
		expect(registrations.every((claim) => claim.harness_session === "native-session")).toBe(true);
		expect(seatReads).toBeGreaterThanOrEqual(2);
		expect(JSON.parse(eventUrls[1]?.searchParams.get("since") ?? "null")).toEqual({ test: 1 });
		expect(eventAuthorizations).toEqual(["Bearer old-key", "Bearer new-key"]);
		expect(notices).toEqual([
			"pij: daemon stream lost, reconnecting…",
			"pij: re-attached at cursor 1",
		]);
		expect(
			pi.injects.filter((item) => item.text === frame("pij-from", "before bind")),
		).toHaveLength(1);
		runtime.shutdown("quit");
	});
});

const HOLD_CONTRACT = JSON.parse(
	readFileSync(
		new URL("../../../../crates/testkit/fixtures/delivery/hold-events.json", import.meta.url),
		"utf8",
	),
) as {
	grace: { default_ms: number };
	hold_request: {
		body: {
			seat: string;
			job_id: number;
			msg_id: string;
			reason: "human-typing";
			since_ms: number;
		};
	};
	release_request: { body: { seat: string; job_id: number; msg_id: string; at_ms: number } };
};

type GraceMessage = {
	msg_id: string;
	from: string;
	body: string;
	command?: string;
	urgent?: boolean;
};

class TypingPiRuntime extends FakePiRuntime {
	private listener: ((at: number) => void) | undefined;
	readonly statuses: Array<string | undefined> = [];
	readonly notices: Array<{ text: string; level?: string }> = [];
	private busy = false;
	draft = "";

	getEditorText(): string {
		return this.draft;
	}

	notify(text: string, level?: "info" | "warning" | "error"): void {
		this.notices.push({ text, level });
	}

	/** Mid-generation: injections become steer and are invisible until the step
	 * boundary — the pathology u5 exists to make visible. */
	setBusy(busy: boolean): void {
		this.busy = busy;
	}

	isIdle(): boolean {
		return !this.busy;
	}

	onEditorChange(listener: (at: number) => void): () => void {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}

	// Grace witnesses need a draft: input alone no longer holds a delivery.
	edit(draft = "draft"): void {
		this.draft = draft;
		this.listener?.(Date.now());
	}
	setStatus(text: string | undefined): void {
		this.statuses.push(text);
	}
}

/** Ruled daemon seam: holds return jobs to pending, delayed by daemon grace.
 * Claims serialize per seat. The PM proves the fake against u2 at composition. */
class GraceClient extends PijDaemonClient {
	private listener: ((frame: EventFrame) => unknown) | undefined;
	private cursor = 0;
	private id = "";
	readonly jobs: Array<{
		job_id: number;
		message: GraceMessage;
		claimed: boolean;
		acked: boolean;
		not_before: number;
		held: boolean;
	}> = [];
	readonly holds: Array<Record<string, unknown>> = [];
	readonly holdRequests: Array<Record<string, unknown>> = [];
	readonly releases: Array<Record<string, unknown>> = [];
	readonly acks: number[] = [];
	readonly operations: string[] = [];
	semanticHold = false;

	constructor(private readonly graceMs: number | undefined = HOLD_CONTRACT.grace.default_ms) {
		super({ addr: "127.0.0.1:1", stateDir: "/unused" }, "fake", {
			fetch: () => {
				throw new Error("fake daemon must not access the network");
			},
			readFile: async () => "fake",
			processStart: () => 1,
		});
	}

	override async seats(): Promise<readonly RustSeatDescriptor[]> {
		return [];
	}
	override async register(input: Registration): Promise<RustSeatDescriptor> {
		this.id = input.id;
		return {
			id: this.id,
			folder: input.folder,
			harness: input.harness,
			state: "idle",
			...(this.graceMs === undefined ? {} : { typing_grace_ms: this.graceMs }),
		};
	}
	override async watchEvents(listener: (frame: EventFrame) => unknown): Promise<() => void> {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}
	override async claimInbox(): Promise<unknown> {
		if (this.semanticHold) return [];
		if (this.jobs.some((job) => job.claimed && !job.acked)) return [];
		const job = this.jobs.find(
			(candidate) => !candidate.claimed && !candidate.acked && candidate.not_before <= Date.now(),
		);
		if (!job) return [];
		job.claimed = true;
		return [{ job_id: job.job_id, message: job.message }];
	}
	override async peekInbox(): Promise<unknown> {
		const job = this.jobs.find((candidate) => !candidate.acked);
		return job ? [{ job_id: job.job_id, message: job.message }] : [];
	}
	override async ackInbox(_seat: string, jobId: number): Promise<number> {
		const job = this.jobs.find((candidate) => candidate.job_id === jobId);
		if (!job) throw new Error("unknown fake inbox job");
		expect(job.claimed, "ack must follow an authoritative reclaim").toBe(true);
		job.acked = true;
		this.acks.push(jobId);
		this.operations.push(`ack:${job.message.msg_id}`);
		return jobId;
	}
	override async hold(body: typeof HOLD_CONTRACT.hold_request.body) {
		const job = this.jobs.find((candidate) => candidate.message.msg_id === body.msg_id);
		if (!job) throw new Error("unknown fake held message");
		expect(body.job_id, "hold carries the authoritative job id").toBe(job.job_id);
		this.holdRequests.push(body);
		if (!job.held) this.holds.push(body);
		job.held = true;
		job.claimed = false;
		job.not_before = Date.now() + (this.graceMs ?? HOLD_CONTRACT.grace.default_ms);
		this.operations.push(`hold:${body.msg_id}`);
		return { msg_id: body.msg_id, held: true };
	}
	override async release(body: typeof HOLD_CONTRACT.release_request.body) {
		const job = this.jobs.find((candidate) => candidate.message.msg_id === body.msg_id);
		if (job) expect(body.job_id, "release carries the authoritative job id").toBe(job.job_id);
		const released = job !== undefined && !job.claimed && !job.acked;
		if (job) job.held = false; // Evidence clears even when the queue is already claimed.
		if (job && released) job.not_before = body.at_ms;
		// The daemon appends one delivery.released evidence row per declaration,
		// including typed queue no-ops, so these records count ledger appends.
		this.releases.push(body);
		this.operations.push(`release:${body.msg_id}`);
		return released
			? { msg_id: body.msg_id, released: true }
			: {
					msg_id: body.msg_id,
					released: false,
					noop: true,
					reason: job === undefined ? "absent" : job.acked ? "terminal" : "not-deferred",
				};
	}
	async push(message: GraceMessage, announce = true): Promise<void> {
		this.jobs.push({
			job_id: this.jobs.length + 1,
			message,
			claimed: false,
			acked: false,
			not_before: 0,
			held: false,
		});
		if (announce) await this.announce(message);
	}
	async repeat(msgId: string): Promise<void> {
		const job = this.jobs.find((candidate) => candidate.message.msg_id === msgId);
		if (!job) throw new Error("unknown repeated message");
		await this.announce(job.message);
	}
	async replay(): Promise<void> {
		for (const job of this.jobs) if (!job.acked) await this.announce(job.message);
	}
	private async announce(message: GraceMessage): Promise<void> {
		await this.listener?.({
			machine: "fake",
			cursor: ++this.cursor,
			event: {
				v: 1,
				at: Date.now(),
				kind: "message.pushed",
				seat: this.id,
				payload: JSON.stringify(message),
			},
		});
	}
}

describe("extension-stream delivery", () => {
	const runtimes: RustRuntimeSession[] = [];
	const message = (msg_id: string, extra: Partial<GraceMessage> = {}): GraceMessage => ({
		msg_id,
		from: "pij-sender",
		body: msg_id,
		...extra,
	});
	async function start(
		client = new GraceClient(),
		bind?: (pi: TypingPiRuntime) => Parameters<RustRuntimeSession["setPi"]>[0],
	) {
		vi.stubEnv("PIJ_SESSION_ID", "pij-grace-test");
		vi.stubEnv("PIJ_ANNOUNCE_TO", "");
		vi.stubEnv("PIJ_SPAWN_ID", "");
		vi.stubEnv("PIJ_SPAWN_TASK", "");
		const runtime = new RustRuntimeSession(client, new FakeTmux(), []);
		runtimes.push(runtime);
		const pi = new TypingPiRuntime();
		bindRuntime(runtime, bind?.(pi) ?? pi);
		await runtime.boot({
			folder: "/abs/tree",
			dataDir: "",
			eventsPath: "",
			harness: "pi",
			harnessSessionId: "native-grace",
			piSessionId: "native-grace",
			runtimeBin: "omp",
			paneId: "%42",
			resetRuntimeState: true,
			reason: "startup",
		});
		// Drop only the boot announcement, not peer deliveries recovered by boot.
		const recovered = pi.injects.filter((row) => parseFrame(row.text) !== null);
		pi.injects.splice(0, pi.injects.length, ...recovered);
		return { runtime, pi, client };
	}
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(HOLD_CONTRACT.hold_request.body.since_ms);
	});
	afterEach(() => {
		for (const runtime of runtimes.splice(0)) runtime.shutdown("quit");
		vi.useRealTimers();
	});

	// Plan 136 changed: extension streams never type into the human's composer.
	it.each([
		false,
		true,
	])("extension stream delivers while a draft is actively typed (busy=%s)", async (busy) => {
		const { pi, client } = await start();
		pi.setBusy(busy);
		pi.edit("Unsubmitted human draft\nwith Unicode 你好");
		await client.push(message("incoming while typing"));
		expect(pi.injects).toEqual([
			{ text: frame("pij-sender", "incoming while typing"), mode: busy ? "steer" : "immediate" },
		]);
		expect(pi.draft).toBe("Unsubmitted human draft\nwith Unicode 你好");
		expect(client.holdRequests).toEqual([]);
		expect(client.acks).toEqual(busy ? [] : [1]);
		expect(pi.notices.map((row) => row.text)).toEqual([
			"📨 pij from pij-sender: incoming while typing",
		]);
		expect(pi.statuses.some((status) => status?.includes("typing"))).toBe(false);
		expect(pi.statuses.at(-1)).toBe(busy ? "📨 1 pending" : undefined);
	});

	it("delivers through the OMP adapter without clearing or submitting a human draft", async () => {
		let editorText = "draft in progress";
		const modelMessages: string[] = [];
		const { client, pi } = await start(new GraceClient(), (sink) => {
			const api = {
				sendUserMessage: (text: unknown) => {
					editorText = ""; // OMP message_start for an external user message.
					modelMessages.push(String(text));
					sink.inject(String(text), "immediate");
				},
				sendMessage: (value: { content: unknown }) => {
					modelMessages.push(String(value.content));
					sink.inject(String(value.content), "immediate");
				},
			};
			return new PiRuntimeAdapter(
				api,
				{
					isIdle: () => true,
					compact: () => {},
					ui: {
						setStatus: (_key, text) => sink.setStatus(text),
						notify: (text, level) => sink.notify(text, level),
					},
				},
				"omp",
			);
		});
		modelMessages.length = 0;
		await client.push(message("incoming"));
		expect(editorText).toBe("draft in progress");
		expect(modelMessages).toEqual([frame("pij-sender", "incoming")]);
		expect(pi.notices.map((row) => row.text)).toEqual(["📨 pij from pij-sender: incoming"]);
		expect(client.acks).toEqual([1]);
	});

	it("delivers immediately after spawn input has left an empty editor", async () => {
		const { pi, client } = await start();
		pi.edit("");
		await client.push(message("empty-after-spawn"));
		expect(client.holds).toEqual([]);
		expect(pi.injects.map((row) => row.text)).toEqual([frame("pij-sender", "empty-after-spawn")]);
		expect(client.acks).toEqual([1]);
	});

	it("does not acknowledge queued delivery before its own message starts", async () => {
		const { runtime, pi, client } = await start();
		pi.setBusy(true);
		await client.push(message("await-consumption"));
		expect(client.acks).toEqual([]);
		expect(pi.statuses.at(-1)).toBe("📨 1 pending");
		await runtime.onMessageStart({
			role: "custom",
			customType: "pij",
			details: { pijMessageId: "unrelated" },
		});
		expect(client.acks).toEqual([]);
		await runtime.onMessageStart({
			role: "custom",
			customType: "pij",
			details: { pijMessageId: "await-consumption" },
		});
		expect(client.acks).toEqual([1]);
		expect(pi.isIdle()).toBe(false);
		expect(pi.statuses.at(-1)).toBeUndefined();
	});

	it("never treats idle or an unrelated turn as message consumption", async () => {
		const { runtime, pi, client } = await start();
		pi.setBusy(true);
		await client.push(message("not-consumed"));
		runtime.onTurnStart(new Date().toISOString());
		pi.setBusy(false);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(pi.statuses.at(-1)).toBe("📨 1 pending");
		expect(client.acks).toEqual([]);
	});

	it("reinjects interrupted unconsumed mail once and never repeats consumed mail", async () => {
		const { runtime, pi, client } = await start();
		pi.setBusy(true);
		await client.push(message("survive-interrupt"));
		pi.injects.length = 0; // Escape dropped the native steering queue.
		pi.setBusy(false);
		runtime.onAgentEnd();
		await vi.advanceTimersByTimeAsync(1_000);
		expect(pi.injects.map((row) => row.text)).toEqual([frame("pij-sender", "survive-interrupt")]);
		expect(pi.notices.at(-1)?.text).toBe("📨 re-queued 1 pij messages after interrupt");
		await runtime.onMessageStart({
			role: "custom",
			customType: "pij",
			details: { pijMessageId: "survive-interrupt" },
		});
		expect(client.acks).toEqual([1]);
		runtime.onAgentEnd();
		await client.repeat("survive-interrupt");
		await vi.advanceTimersByTimeAsync(2_000);
		expect(pi.injects).toHaveLength(1);
		expect(client.acks).toEqual([1]);
	});

	it("counts only the claimed unconsumed envelope while draining three messages in order", async () => {
		const { runtime, pi, client } = await start();
		pi.setBusy(true);
		for (const id of ["first", "second", "third"]) await client.push(message(id));
		expect(pi.injects).toHaveLength(1);
		expect(pi.statuses.at(-1)).toBe("📨 1 pending");
		for (const [index, id] of ["first", "second", "third"].entries()) {
			await runtime.onMessageStart({
				role: "custom",
				customType: "pij",
				details: { pijMessageId: id },
			});
			expect(client.acks).toEqual([1, 2, 3].slice(0, index + 1));
			expect(pi.statuses.at(-1)).toBeUndefined();
			await vi.advanceTimersByTimeAsync(1_000);
		}
		expect(pi.injects.map((row) => row.text)).toEqual(
			["first", "second", "third"].map((id) => frame("pij-sender", id)),
		);
		expect(pi.isIdle()).toBe(false);
	});

	it("reclaims an expired lease without injecting the queued envelope twice", async () => {
		const { runtime, pi, client } = await start();
		pi.setBusy(true);
		await client.push(message("long-tool"));
		for (const job of client.jobs) job.claimed = false;
		await client.repeat("long-tool");
		expect(pi.injects).toHaveLength(1);
		expect(pi.notices).toHaveLength(1);
		expect(client.acks).toEqual([]);
		await runtime.onMessageStart({
			role: "custom",
			customType: "pij",
			details: { pijMessageId: "long-tool" },
		});
		expect(client.acks).toEqual([1]);
	});

	it("retries failed consumption acknowledgements without reinjection", async () => {
		const { runtime, pi, client } = await start();
		pi.setBusy(true);
		await client.push(message("ack-retry"));
		vi.spyOn(client, "ackInbox").mockRejectedValueOnce(new Error("connection reset"));
		await runtime.onMessageStart({
			role: "custom",
			customType: "pij",
			details: { pijMessageId: "ack-retry" },
		});
		expect(client.acks).toEqual([]);
		expect(pi.statuses.at(-1)).toBeUndefined();
		pi.setBusy(false);
		runtime.onAgentEnd();
		await vi.advanceTimersByTimeAsync(2_000);
		expect(client.acks).toEqual([1]);
		expect(pi.injects).toHaveLength(1);
	});

	it("does not requeue during a scheduled continuation or acknowledge after shutdown", async () => {
		const { runtime, pi, client } = await start();
		pi.setBusy(true);
		await client.push(message("continuation"));
		runtime.onAgentEnd(true);
		pi.setBusy(false);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(pi.injects).toHaveLength(1);
		runtime.shutdown("quit");
		await runtime.onMessageStart({
			role: "custom",
			customType: "pij",
			details: { pijMessageId: "continuation" },
		});
		expect(client.acks).toEqual([]);
		expect(pi.statuses.at(-1)).toBeUndefined();
	});

	it("reconciles a committed acknowledgement whose response was lost without endless retries", async () => {
		const { runtime, pi, client } = await start();
		pi.setBusy(true);
		await client.push(message("committed-ack"));
		const acknowledge = client.ackInbox.bind(client);
		const requests = vi.spyOn(client, "ackInbox").mockImplementationOnce(async (seat, jobId) => {
			await acknowledge(seat, jobId);
			throw new Error("response lost after commit");
		});
		await runtime.onMessageStart({
			role: "custom",
			customType: "pij",
			details: { pijMessageId: "committed-ack" },
		});
		await vi.advanceTimersByTimeAsync(3_000);
		expect(requests).toHaveBeenCalledTimes(1);
		expect(client.acks).toEqual([1]);
		expect(pi.injects).toHaveLength(1);
	});

	it("announces busy arrivals and clears pending on consumption while still busy", async () => {
		const { runtime, pi, client } = await start();
		pi.setBusy(true);
		await client.push(message("mid-generation arrival"));
		expect(pi.notices).toEqual([
			{ text: "📨 pij from pij-sender: mid-generation arrival", level: "info" },
		]);
		expect(pi.statuses.at(-1)).toBe("📨 1 pending");
		await runtime.onMessageStart({
			role: "custom",
			customType: "pij",
			details: { pijMessageId: "mid-generation arrival" },
		});
		expect(pi.isIdle()).toBe(false);
		expect(pi.statuses.at(-1)).toBeUndefined();
	});

	it("truncates a long announcement to 80 characters", async () => {
		const { pi, client } = await start();
		await client.push(message("x".repeat(200)));
		expect(pi.notices.at(-1)?.text).toBe(`📨 pij from pij-sender: ${"x".repeat(80)}…`);
	});

	it("does not deliver or announce an acknowledged replay twice", async () => {
		const { pi, client } = await start();
		pi.edit();
		await client.push(message("repeat"));
		pi.edit("another keystroke");
		await client.repeat("repeat");
		await vi.advanceTimersByTimeAsync(HOLD_CONTRACT.grace.default_ms);
		expect(pi.injects.map((row) => row.text)).toEqual([frame("pij-sender", "repeat")]);
		expect(pi.notices).toHaveLength(1);
		expect(client.holdRequests).toEqual([]);
		expect(client.acks).toEqual([1]);
	});

	it("preserves claim order during sustained typing regardless of daemon grace", async () => {
		const { pi, client } = await start(new GraceClient(75_000));
		pi.edit();
		await client.push(message("first"));
		await vi.advanceTimersByTimeAsync(1_000);
		pi.edit("still typing");
		await client.push(message("second"));
		expect(pi.injects.map((row) => row.text)).toEqual([
			frame("pij-sender", "first"),
			frame("pij-sender", "second"),
		]);
		expect(client.acks).toEqual([1, 2]);
		expect(client.holdRequests).toEqual([]);
	});

	it("keeps commands and urgent delivery without a typing bypass", async () => {
		const { pi, client } = await start();
		pi.edit();
		await client.push(message("ordinary"));
		for (const command of ["compact", "new", "reload"])
			await client.push(message(command, { command, body: "" }));
		await client.push(message("urgent", { urgent: true }));
		expect(pi.injects.map((row) => row.text)).toEqual([
			frame("pij-sender", "ordinary"),
			frame("pij-sender", "urgent"),
		]);
		expect(pi.compactCount).toBe(1);
		expect(pi.controlCalls).toEqual(["new", "reload"]);
		expect(client.acks).toEqual([1, 2, 3, 4, 5]);
		expect(client.holdRequests).toEqual([]);
	});

	it("does not release or execute an active control peek during reload startup", async () => {
		const client = new GraceClient();
		await client.push(message("active-reload", { command: "reload", body: "" }), false);
		const active = client.jobs[0];
		if (active === undefined) throw new Error("expected the active control job");
		active.claimed = true;
		const { pi } = await start(client);
		expect(pi.controlCalls).toEqual([]);
		expect(client.releases).toEqual([]);
		expect(client.acks).toEqual([]);
		await vi.advanceTimersByTimeAsync(2_000);
		expect(client.releases).toEqual([]);
		expect(pi.controlCalls).toEqual([]);
		// Only the original owner settles the old operation.
		await client.ackInbox("pij-grace-test", 1);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(client.acks).toEqual([1]);
	});

	it("claims startup controls without a pre-claim release", async () => {
		const client = new GraceClient();
		await client.push(message("startup-compact", { command: "compact", body: "" }), false);
		const { pi } = await start(client);
		expect(pi.compactCount).toBe(1);
		expect(client.releases).toEqual([]);
		expect(client.acks).toEqual([1]);
	});

	it("recovers an older deferred row before newer eligible rows without another send", async () => {
		const client = new GraceClient();
		await client.push(message("older"), false);
		await client.push(message("newer"), false);
		for (const job of client.jobs) {
			if (job.message.msg_id !== "older") continue;
			job.held = true;
			job.not_before = Date.now() + 60_000;
		}
		const { pi } = await start(client, (runtime) => {
			runtime.edit("draft survives restart");
			return runtime;
		});
		expect(pi.injects.map((row) => row.text)).toEqual([
			frame("pij-sender", "older"),
			frame("pij-sender", "newer"),
		]);
		expect(pi.draft).toBe("draft survives restart");
		expect(client.jobs.map((job) => job.held)).toEqual([false, false]);
		expect(client.operations).toEqual(["release:older", "ack:older", "release:newer", "ack:newer"]);
		expect(client.releases).toHaveLength(2);
		await client.push(message("ordinary-after-recovery"));
		expect(client.acks).toEqual([1, 2, 3]);
		expect(client.releases).toHaveLength(2); // New arrivals never inherit startup migration.
	});

	it("resumes startup semantic Hold after ready without a second send", async () => {
		const client = new GraceClient();
		client.semanticHold = true;
		await client.push(message("semantic hold"), false);
		const { pi } = await start(client);
		expect(pi.injects).toEqual([]);
		expect(client.acks).toEqual([]);
		expect(client.releases).toHaveLength(1); // Startup-only un-deferral does not bypass semantic Hold.
		client.semanticHold = false;
		await vi.advanceTimersByTimeAsync(1_000);
		expect(pi.injects.map((row) => row.text)).toEqual([frame("pij-sender", "semantic hold")]);
		expect(client.acks).toEqual([1]);
		expect(client.releases).toHaveLength(1); // The same startup head reuses its declaration.
	});

	it("resumes an initially held startup backlog in A B C order across deferred rows", async () => {
		const client = new GraceClient();
		client.semanticHold = true;
		for (const id of ["A", "B", "C"]) await client.push(message(id), false);
		for (const job of client.jobs) {
			if (job.message.msg_id === "C") continue;
			job.held = true;
			job.not_before = Date.now() + 60_000;
		}
		const { pi } = await start(client);
		await vi.advanceTimersByTimeAsync(2_000);
		expect(client.releases).toHaveLength(1); // Held ticks must not redeclare the same head.
		expect(pi.injects).toEqual([]);
		client.semanticHold = false;
		await vi.advanceTimersByTimeAsync(1_000);
		expect(pi.injects.map((row) => row.text)).toEqual([
			frame("pij-sender", "A"),
			frame("pij-sender", "B"),
			frame("pij-sender", "C"),
		]);
		expect(client.acks).toEqual([1, 2, 3]);
		expect(client.releases).toHaveLength(3);
		await client.push(message("ordinary-after-held-startup"));
		expect(client.acks).toEqual([1, 2, 3, 4]);
		expect(client.releases).toHaveLength(3);
	});

	it("resumes a pushed semantic Hold backlog after ready and then stops polling", async () => {
		const { pi, client } = await start();
		client.semanticHold = true;
		pi.edit("unsubmitted draft");
		await client.push(message("held-first"));
		await client.push(message("held-second"));
		await vi.advanceTimersByTimeAsync(2_000);
		expect(pi.injects).toEqual([]);
		expect(client.acks).toEqual([]);
		client.semanticHold = false; // report ready updates the registry, not the live stream.
		await vi.advanceTimersByTimeAsync(1_000);
		expect(pi.injects.map((row) => row.text)).toEqual([
			frame("pij-sender", "held-first"),
			frame("pij-sender", "held-second"),
		]);
		expect(pi.draft).toBe("unsubmitted draft");
		expect(client.acks).toEqual([1, 2]);
		expect(client.releases).toEqual([]);
		const claims = vi.spyOn(client, "claimInbox");
		const peeks = vi.spyOn(client, "peekInbox");
		await vi.advanceTimersByTimeAsync(3_000);
		expect(claims).not.toHaveBeenCalled();
		expect(peeks).not.toHaveBeenCalled();
	});

	it("does not poll an empty inbox", async () => {
		const { client } = await start();
		const claims = vi.spyOn(client, "claimInbox");
		const peeks = vi.spyOn(client, "peekInbox");
		await vi.advanceTimersByTimeAsync(3_000);
		expect(claims).not.toHaveBeenCalled();
		expect(peeks).not.toHaveBeenCalled();
	});

	it("cancels pending semantic recovery on shutdown", async () => {
		const { runtime, pi, client } = await start();
		client.semanticHold = true;
		await client.push(message("held-at-shutdown"));
		const claims = vi.spyOn(client, "claimInbox");
		runtime.shutdown("quit");
		client.semanticHold = false;
		await vi.advanceTimersByTimeAsync(3_000);
		expect(claims).not.toHaveBeenCalled();
		expect(pi.injects).toEqual([]);
		expect(client.acks).toEqual([]);
	});

	it("queues at most one pending-inbox retry and ignores its stale result", async () => {
		const { runtime, pi, client } = await start();
		client.semanticHold = true;
		await client.push(message("slow-recovery"));
		let resolveClaim!: (value: unknown) => void;
		const response = new Promise<unknown>((resolve) => {
			resolveClaim = resolve;
		});
		const claims = vi.spyOn(client, "claimInbox").mockReturnValueOnce(response);
		const peeks = vi.spyOn(client, "peekInbox");
		await vi.advanceTimersByTimeAsync(3_000);
		expect(claims).toHaveBeenCalledTimes(1);
		runtime.shutdown("quit");
		resolveClaim([]);
		await vi.advanceTimersByTimeAsync(3_000);
		expect(claims).toHaveBeenCalledTimes(1);
		expect(peeks).not.toHaveBeenCalled();
		expect(pi.injects).toEqual([]);
	});

	it("recovers an unconsumed message after the previous runtime claim expires", async () => {
		const { runtime, pi, client } = await start();
		pi.setBusy(true);
		await client.push(message("before restart"));
		expect(pi.statuses.at(-1)).toBe("📨 1 pending");
		runtime.shutdown("quit");
		for (const job of client.jobs) job.claimed = false; // Daemon claim lease expiry after owner exit.
		const restarted = await start(client);
		expect(restarted.pi.injects.map((row) => row.text)).toEqual([
			frame("pij-sender", "before restart"),
		]);
		expect(client.acks).toEqual([1]);
		restarted.pi.setBusy(true);
		await client.push(message("after restart"));
		expect(restarted.pi.statuses.at(-1)).toBe("📨 1 pending");
	});

	it("acknowledges ordinary claims without calling the release endpoint", async () => {
		const { pi, client, runtime } = await start();
		vi.spyOn(client, "release").mockRejectedValue(new Error("release must not be called"));
		await client.push(message("no-spurious-release"));
		expect(pi.injects.map((row) => row.text)).toEqual([frame("pij-sender", "no-spurious-release")]);
		expect(client.acks).toEqual([1]);
		expect(client.release).not.toHaveBeenCalled();
		expect(runtime.eventCount("daemon_event_ack_error")).toBe(0);
	});
});
