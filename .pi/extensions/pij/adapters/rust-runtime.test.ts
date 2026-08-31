import { readdir, readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type DaemonHttpDeps, PijDaemonClient } from "./daemon-http.js";
import { FakePiRuntime, FakeTmux } from "./fakes.js";
import { RustRuntimeSession } from "./rust-runtime.js";

function envelope(command: string, data: unknown): Response {
	return new Response(JSON.stringify({ ok: true, command, v: 1, data }));
}
afterEach(() => vi.unstubAllEnvs());

describe("RustRuntimeSession", () => {
	it("registers structural identity, forwards unknown events, injects a push, and correlates reply", async () => {
		vi.stubEnv("PIJ_ANNOUNCE_TO", "");
		vi.stubEnv("PIJ_SPAWN_ID", "");
		vi.stubEnv("PIJ_SPAWN_MODEL", "");
		let registeredId = "";
		const registrations: Array<Record<string, unknown>> = [];
		const sends: Array<Record<string, unknown>> = [];
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
				return new Response(
					`${JSON.stringify({ hello: true, v: 1, build: "pij-rs test" })}\n` +
						`${JSON.stringify({ machine: "test", cursor: 1, event: { v: 1, at: 1, kind: "future.kind", seat: registeredId, payload: '{"opaque":true}' } })}\n` +
						`${JSON.stringify({ machine: "test", cursor: 2, event: { v: 1, at: 2, kind: "message.pushed", seat: registeredId, payload: JSON.stringify({ msg_id: "m-1", from: "pij-sender", body: "hello" }) } })}\n`,
				);
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
			readFile,
			readdir,
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
			expect(pi.injects.some((item) => item.text === `[pij from pij-sender] hello`)).toBe(true);
		});
		expect(runtime.eventCount()).toBeGreaterThanOrEqual(2);

		await runtime.send("pij-sender", "reply");
		expect(sends).toHaveLength(1);
		expect(sends[0]).toMatchObject({
			from: registeredId,
			to: { seat: "pij-sender" },
			body: "reply",
			in_reply_to: "m-1",
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
});
