import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type DaemonHttpDeps, PijDaemonClient } from "./daemon-http.js";
import { FakePiRuntime, FakeTmux } from "./fakes.js";
import { RustRuntimeSession } from "./rust-runtime.js";

function envelope(command: string, data: unknown): Response {
	return new Response(JSON.stringify({ ok: true, command, v: 1, data }));
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
		if (text === "[pij from pij-from] before bind") {
			this.inboundAttempts += 1;
			throw new Error("test injection failed");
		}
		super.inject(text, mode);
	}
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
			claimRequests.push(String(url));
			return envelope("pij inbox", await claimResponse);
		}
		if (path === "/v1/inbox/ack") {
			const acknowledgement = JSON.parse(String(init?.body)) as Record<string, unknown>;
			acknowledgements.push(acknowledgement);
			return envelope("pij inbox", acknowledgement.job_id);
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
	runtime.setPi(pi);
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
	return { acknowledgements, claimRequests, runtime };
}

describe("RustRuntimeSession", () => {
	it("registers structural identity, forwards unknown events, injects a push, and correlates reply", async () => {
		vi.stubEnv("PIJ_ANNOUNCE_TO", "");
		vi.stubEnv("PIJ_SPAWN_ID", "");
		vi.stubEnv("PIJ_SPAWN_MODEL", "");
		let registeredId = "";
		const registrations: Array<Record<string, unknown>> = [];
		const sends: Array<Record<string, unknown>> = [];
		const acknowledgements: Array<Record<string, unknown>> = [];
		const claimRequests: string[] = [];
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
				return eventResponse(
					`${JSON.stringify({ hello: true, v: 1, build: "pij-rs test" })}\n` +
						`${JSON.stringify({ machine: "test", cursor: 1, event: { v: 1, at: 1, kind: "future.kind", seat: registeredId, payload: '{"opaque":true}' } })}\n` +
						`${JSON.stringify({ machine: "test", cursor: 2, event: { v: 1, at: 2, kind: "message.pushed", seat: registeredId, payload: PUSHED_EVENT_WIRE } })}\n`,
				);
			}
			if (path === "/v1/inbox") {
				expect(pi.injects.some((item) => item.text === "[pij from pij-from] before bind")).toBe(
					false,
				);
				claimRequests.push(String(url));
				return envelope("pij inbox", inboxClaimFixture());
			}
			if (path === "/v1/inbox/ack") {
				expect(pi.injects.some((item) => item.text === "[pij from pij-from] before bind")).toBe(
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
		runtime.setPi(pi);

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
			relay: false,
		});
		await vi.waitFor(() => {
			expect(pi.injects.some((item) => item.text === "[pij from pij-from] before bind")).toBe(true);
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
		expect(pi.injects.some((item) => item.text === "[pij from pij-from] before bind")).toBe(false);
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
		expect(pi.injects.some((item) => item.text === "[pij from pij-from] before bind")).toBe(false);
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
			expect(pi.injects.some((item) => item.text === "[pij from pij-from] before bind")).toBe(true);
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

	it("re-attaches after key rotation, restores the same seat, and consumes replay once", async () => {
		vi.stubEnv("PIJ_ANNOUNCE_TO", "");
		vi.stubEnv("PIJ_SPAWN_ID", "");
		vi.stubEnv("PIJ_SPAWN_MODEL", "");
		vi.stubEnv("PIJ_SPAWN_TASK", "");
		let key = "old-key";
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
				return envelope("pij seats", { seats: [], unavailable: [] });
			}
			if (parsed.pathname === "/v1/register") {
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
			if (parsed.pathname === "/v1/inbox") return envelope("pij inbox", inboxClaimFixture());
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
		runtime.setPi(pi);
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
			expect(registrations).toHaveLength(2);
		});
		expect(registrations[1]).toMatchObject({ id: boot.id, pane: "%42" });
		expect(seatReads).toBeGreaterThanOrEqual(2);
		expect(JSON.parse(eventUrls[1]?.searchParams.get("since") ?? "null")).toEqual({ test: 1 });
		expect(eventAuthorizations).toEqual(["Bearer old-key", "Bearer new-key"]);
		expect(notices).toEqual([
			"pij: daemon stream lost, reconnecting…",
			"pij: re-attached at cursor 1",
		]);
		expect(
			pi.injects.filter((item) => item.text === "[pij from pij-from] before bind"),
		).toHaveLength(1);
		runtime.shutdown("quit");
	});
});
