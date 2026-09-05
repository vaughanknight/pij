import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventFrame, Registration, RustSeatDescriptor } from "../core/daemon-wire.js";
import { type DaemonHttpDeps, PijDaemonClient } from "./daemon-http.js";
import { FakePiRuntime, FakeTmux } from "./fakes.js";
import { PiRuntimeAdapter } from "./pi-runtime.js";
import { RustRuntimeSession } from "./rust-runtime.js";

function envelope(command: string, data: unknown): Response {
	return new Response(JSON.stringify({ ok: true, command, v: 2, data }));
}

function releaseEnvelope(init?: RequestInit): Response {
	const body = JSON.parse(String(init?.body)) as { msg_id: string };
	return envelope("pij release", {
		msg_id: body.msg_id,
		released: false,
		noop: true,
		reason: "not-deferred",
	});
}

function isRecoveryPeek(url: string | URL | Request): boolean {
	const parsed = new URL(String(url));
	return parsed.pathname === "/v1/inbox" && parsed.searchParams.get("peek") === "true";
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
		if (isRecoveryPeek(url)) return envelope("pij inbox", []);
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
		if (path === "/v1/release") return releaseEnvelope(init);
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
			if (isRecoveryPeek(url)) return envelope("pij inbox", []);
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
			if (path === "/v1/release") return releaseEnvelope(init);
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
			harness_session: "native-session",
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

	it("binds startup to the daemon row for the spawned pane", async () => {
		vi.stubEnv("PIJ_ANNOUNCE_TO", "");
		vi.stubEnv("PIJ_SESSION_ID", "pij-env-candidate");
		vi.stubEnv("PIJ_SPAWN_ID", "spawn-132");
		const registrations: Array<Record<string, unknown>> = [];
		const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
			const path = new URL(String(url)).pathname;
			if (isRecoveryPeek(url)) return envelope("pij inbox", []);
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
		runtime.setPi(new FakePiRuntime());

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
			if (isRecoveryPeek(url)) return envelope("pij inbox", []);
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
			if (parsed.pathname === "/v1/inbox") return envelope("pij inbox", inboxClaimFixture());
			if (parsed.pathname === "/v1/release") return releaseEnvelope(init);
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
			pi.injects.filter((item) => item.text === "[pij from pij-from] before bind"),
		).toHaveLength(1);
		runtime.shutdown("quit");
	});
});

const HOLD_CONTRACT = JSON.parse(
	readFileSync(
		new URL(
			"../../../../docs/plans/136-typing-grace-gate/assets/contracts/hold-events.json",
			import.meta.url,
		),
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

	onEditorChange(listener: (at: number) => void): () => void {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}

	edit(): void {
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
		for (const job of this.jobs) if (!job.acked) job.claimed = false;
		return {
			id: this.id,
			folder: input.folder,
			harness: input.harness,
			state: "idle",
			...(this.graceMs === undefined ? {} : { typing_grace_ms: this.graceMs }),
		};
	}
	recoveryPeeks = 0;
	override async peekInbox(): Promise<unknown> {
		this.recoveryPeeks += 1;
		const job = this.jobs.find((candidate) => !candidate.acked);
		return job ? [{ job_id: job.job_id, message: job.message }] : [];
	}
	override async watchEvents(listener: (frame: EventFrame) => unknown): Promise<() => void> {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}
	override async claimInbox(): Promise<unknown> {
		if (this.jobs.some((job) => job.claimed && !job.acked)) return [];
		const job = this.jobs.find(
			(candidate) => !candidate.claimed && !candidate.acked && candidate.not_before <= Date.now(),
		);
		if (!job) return [];
		job.claimed = true;
		return [{ job_id: job.job_id, message: job.message }];
	}
	override async ackInbox(_seat: string, jobId: number): Promise<number> {
		const job = this.jobs.find((candidate) => candidate.job_id === jobId);
		if (!job) throw new Error("unknown fake inbox job");
		expect(job.claimed, "ack must follow an authoritative reclaim").toBe(true);
		expect(this.operations.at(-1), "release declaration must precede every ack").toBe(
			`release:${job.message.msg_id}`,
		);
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

describe("typing grace delivery", () => {
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
		runtime.setPi(bind?.(pi) ?? pi);
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
		const recovered = pi.injects.filter((row) => row.text.startsWith("[pij from "));
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

	it("holds at 59 seconds and releases at 60 with exact hold/release payloads", async () => {
		const { pi, client } = await start();
		pi.edit();
		const since = Date.now();
		await vi.advanceTimersByTimeAsync(59_000);
		await client.push(message("boundary"));
		expect(pi.injects).toEqual([]);
		expect(client.holds).toEqual([
			{
				seat: "pij-grace-test",
				job_id: 1,
				msg_id: "boundary",
				reason: "human-typing",
				since_ms: since,
			},
		]);
		expect(pi.statuses.at(-1)).toBe("⏸ 1 held · typing");
		await vi.advanceTimersByTimeAsync(1_000);
		expect(pi.injects.map((row) => row.text)).toEqual(["[pij from pij-sender] boundary"]);
		const releaseBody = {
			seat: "pij-grace-test",
			job_id: 1,
			msg_id: "boundary",
			at_ms: since + HOLD_CONTRACT.grace.default_ms,
		};
		expect(client.releases).toEqual([releaseBody, releaseBody]);
		expect(client.operations).toEqual([
			"hold:boundary",
			"release:boundary",
			"release:boundary",
			"ack:boundary",
		]);
		expect(pi.statuses.at(-1)).toBeUndefined();
	});

	it("preserves claim order across two holds", async () => {
		const { pi, client } = await start();
		pi.edit();
		await client.push(message("first"));
		await vi.advanceTimersByTimeAsync(1_000);
		await client.push(message("second"));
		expect(pi.injects).toEqual([]);
		expect(pi.statuses.at(-1)).toBe("⏸ 2 held · typing");
		await vi.advanceTimersByTimeAsync(59_000);
		expect(pi.injects.map((row) => row.text)).toEqual([
			"[pij from pij-sender] first",
			"[pij from pij-sender] second",
		]);
		expect(client.acks).toEqual([1, 2]);
	});

	it("bypasses compact, new, reload and urgent while ordinary rows stay held", async () => {
		const { pi, client } = await start();
		pi.edit();
		await client.push(message("ordinary"));
		for (const command of ["compact", "new", "reload"])
			await client.push(message(command, { command }));
		await client.push(message("urgent", { urgent: true }));
		expect(pi.injects.map((row) => row.text)).toEqual(["[pij from pij-sender] urgent"]);
		expect(pi.compactCount).toBe(1);
		expect(pi.controlCalls).toEqual(["new", "reload"]);
		expect(client.acks).toEqual([2, 3, 4, 5]);
		expect(client.holds).toHaveLength(1);
	});

	it("returns held claims to pending without acknowledging them", async () => {
		const { pi, client } = await start();
		pi.edit();
		await client.push(message("unacked"));
		expect(client.acks).toEqual([]);
		expect(client.jobs[0]).toMatchObject({ claimed: false, acked: false, held: true });
		await vi.advanceTimersByTimeAsync(59_000);
		expect(client.acks).toEqual([]);
	});

	it("redelivers after restart and clears sender held evidence despite losing local notes", async () => {
		const { runtime, pi, client } = await start();
		pi.edit();
		await client.push(message("first"));
		await client.push(message("second"));
		expect(client.acks).toEqual([]);
		runtime.shutdown("quit");
		await vi.advanceTimersByTimeAsync(HOLD_CONTRACT.grace.default_ms);
		const restarted = await start(client);
		await client.replay();
		expect(restarted.pi.injects.map((row) => row.text)).toEqual([
			"[pij from pij-sender] first",
			"[pij from pij-sender] second",
		]);
		expect(client.acks).toEqual([1, 2]);
		expect(
			client.jobs.map((job) => job.held),
			"sender held evidence must be cleared",
		).toEqual([false, false]);
		expect(client.operations.slice(-6)).toEqual([
			"release:first",
			"release:first",
			"ack:first",
			"release:second",
			"release:second",
			"ack:second",
		]);
		await vi.advanceTimersByTimeAsync(HOLD_CONTRACT.grace.default_ms);
		expect(pi.injects).toEqual([]);
	});

	it("uses the daemon grace rather than the fallback", async () => {
		const { pi, client } = await start(new GraceClient(75_000));
		pi.edit();
		await vi.advanceTimersByTimeAsync(65_000);
		await client.push(message("wire-grace"));
		expect(pi.injects).toEqual([]);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(pi.injects.map((row) => row.text)).toEqual(["[pij from pij-sender] wire-grace"]);
	});

	it("programmatic injection does not postpone a terminal-input grace", async () => {
		const { pi, client } = await start();
		pi.edit();
		await client.push(message("ordinary"));
		expect(pi.injects).toEqual([]);
		await vi.advanceTimersByTimeAsync(59_000);
		await client.push(message("urgent", { urgent: true }));
		await vi.advanceTimersByTimeAsync(1_000);
		expect(pi.injects.map((row) => row.text)).toEqual([
			"[pij from pij-sender] urgent",
			"[pij from pij-sender] ordinary",
		]);
		expect(client.acks).toEqual([2, 1]);
	});

	it("the real adapter observes terminal keys, not programmatic editor writes", async () => {
		let onInput: ((data: string) => void) | undefined;
		let editorText = "draft";
		const ui = {
			onTerminalInput(handler: (data: string) => void) {
				onInput = handler;
				return () => {
					onInput = undefined;
				};
			},
			setStatus: (_key: string, _text: string | undefined) => {},
			setEditorText: (text: string) => {
				editorText = text;
			},
		};
		const { runtime, pi, client } = await start(
			new GraceClient(),
			(sink) =>
				new PiRuntimeAdapter(
					{
						sendUserMessage: (text: string) => {
							ui.setEditorText("");
							sink.inject(text, "immediate");
						},
					},
					{ isIdle: () => true, compact: () => {}, ui },
				),
		);
		onInput?.("\u001b[D"); // Cursor movement counts even without a text change.
		await client.push(message("terminal-held"));
		expect(pi.injects).toEqual([]);
		await vi.advanceTimersByTimeAsync(59_000);
		await client.push(message("urgent", { urgent: true }));
		ui.setEditorText("programmatic draft");
		expect(editorText).toBe("programmatic draft");
		await vi.advanceTimersByTimeAsync(1_000);
		expect(pi.injects.map((row) => row.text)).toEqual([
			"[pij from pij-sender] urgent",
			"[pij from pij-sender] terminal-held",
		]);
		expect(client.acks).toEqual([2, 1]);
		runtime.shutdown("quit");
		expect(onInput).toBeUndefined();
	});

	it("re-holds a repeated push without another held event or duplicate delivery", async () => {
		const { pi, client } = await start();
		pi.edit();
		await client.push(message("repeat"));
		await vi.advanceTimersByTimeAsync(1_000);
		pi.edit();
		await client.repeat("repeat");
		expect(client.holdRequests).toHaveLength(2);
		expect(client.holds).toHaveLength(1);
		expect(client.jobs[0]).toMatchObject({
			claimed: false,
			acked: false,
			not_before: Date.now() + HOLD_CONTRACT.grace.default_ms,
		});
		expect(pi.injects).toEqual([]);
		await vi.advanceTimersByTimeAsync(HOLD_CONTRACT.grace.default_ms);
		expect(client.acks).toEqual([1]);
		expect(pi.injects.map((row) => row.text)).toEqual(["[pij from pij-sender] repeat"]);
	});

	it("polls eligible claims while held and bypasses a deferred head without a pushed frame", async () => {
		const { pi, client } = await start();
		const peeksAtBoot = client.recoveryPeeks;
		pi.edit();
		await client.push(message("ordinary"));
		await client.push(message("compact", { command: "compact" }), false);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(pi.compactCount).toBe(1);
		expect(client.acks).toEqual([2]);
		expect(pi.injects).toEqual([]);
		expect(client.holds).toHaveLength(1);
		expect(client.recoveryPeeks).toBe(peeksAtBoot);
	});

	it("does not ack when the release declaration fails", async () => {
		const { pi, client, runtime } = await start();
		vi.spyOn(client, "release").mockRejectedValueOnce(new Error("release unavailable"));
		await client.push(message("declare-first"));
		expect(pi.injects.map((row) => row.text)).toEqual(["[pij from pij-sender] declare-first"]);
		expect(client.acks).toEqual([]);
		expect(runtime.eventCount("daemon_event_ack_error")).toBe(1);
	});

	it("recovers oldest-first when the older held job is deferred later than the newer job", async () => {
		const { runtime, pi, client } = await start();
		const t0 = Date.now();
		pi.edit();
		await client.push(message("older"));
		await vi.advanceTimersByTimeAsync(1_000);
		pi.edit();
		await client.push(message("newer"));
		// At t0+60s the older row is re-offered while the human's t0+1s
		// keystroke is still inside grace, extending only that row to t0+120s.
		await vi.advanceTimersByTimeAsync(59_000);
		expect(client.jobs.map((job) => job.not_before)).toEqual([
			t0 + HOLD_CONTRACT.grace.default_ms * 2,
			t0 + HOLD_CONTRACT.grace.default_ms + 1_000,
		]);
		runtime.shutdown("quit");
		await vi.advanceTimersByTimeAsync(1_000);
		const restarted = await start(client);
		await client.replay();
		await vi.advanceTimersByTimeAsync(59_000);
		await client.replay();
		expect(restarted.pi.injects).toHaveLength(2);
		expect(restarted.pi.injects.map((row) => row.text)).toEqual([
			"[pij from pij-sender] older",
			"[pij from pij-sender] newer",
		]);
		expect(client.acks).toEqual([1, 2]);
	});

	it("re-holds the oldest recovery row during active grace and stops instead of spinning", async () => {
		const { runtime, pi, client } = await start();
		pi.edit();
		await client.push(message("still-typing"));
		await vi.advanceTimersByTimeAsync(1_000);
		const peek = client.peekInbox.bind(client);
		let recoveryPeeks = 0;
		vi.spyOn(client, "peekInbox").mockImplementation(async () => {
			expect(++recoveryPeeks, "recovery must stop on a re-held head").toBeLessThan(3);
			return peek();
		});
		await runtime.boot({
			folder: "/abs/tree",
			dataDir: "",
			eventsPath: "",
			harness: "pi",
			harnessSessionId: "native-grace",
			piSessionId: "native-grace",
			runtimeBin: "omp",
			paneId: "%42",
			resetRuntimeState: false,
			reason: "reload",
		});
		expect(client.jobs[0]?.not_before).toBe(Date.now() + HOLD_CONTRACT.grace.default_ms);
		expect(client.holdRequests).toHaveLength(2);
		expect(recoveryPeeks).toBe(1);
		expect(pi.injects.filter((row) => row.text.startsWith("[pij from "))).toEqual([]);
		await vi.advanceTimersByTimeAsync(58_000);
		expect(client.acks).toEqual([]);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(client.acks).toEqual([1]);
	});
});
