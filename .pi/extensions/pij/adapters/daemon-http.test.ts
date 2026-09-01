import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PijNoDaemonError } from "../core/daemon-wire.js";
import {
	type DaemonHttpDeps,
	daemonGenerationPreference,
	daemonLocation,
	detectDaemonGeneration,
	PijDaemonClient,
} from "./daemon-http.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WIRE = resolve(HERE, "../../../../crates/testkit/fixtures/wire");
const fixture = (name: string): string => readFileSync(resolve(WIRE, name), "utf8");
const roots: string[] = [];

function root(): string {
	const path = mkdtempSync(join(tmpdir(), "pij-rs-extension-"));
	roots.push(path);
	return path;
}

function deps(fetchImpl: typeof fetch): DaemonHttpDeps {
	return { fetch: fetchImpl, readFile, processStart: () => 20260829103052 };
}

function eventStream(frames: readonly Record<string, unknown>[], keepOpen = false): Response {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(
					encoder.encode(
						`${[
							JSON.stringify({ hello: true, v: 1, build: "pij-rs test" }),
							...frames.map((frame) => JSON.stringify(frame)),
						].join("\n")}\n`,
					),
				);
				if (!keepOpen) controller.close();
			},
		}),
	);
}

function frame(machine: string, cursor: number): Record<string, unknown> {
	return {
		machine,
		cursor,
		event: { v: 1, at: cursor, kind: "future.kind", payload: "{}" },
	};
}

function refusal(kind: string, message: string, status: number): Response {
	return new Response(
		JSON.stringify({ ok: false, command: "pij events", v: 1, error: kind, meta: message }),
		{ status },
	);
}

function refused(runtime: "node" | "bun"): Error {
	if (runtime === "bun") {
		return Object.assign(new Error("Unable to connect. Is the computer able to access the url?"), {
			code: "ConnectionRefused",
		});
	}
	return Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
}

afterEach(() => {
	for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("daemon generation controls", () => {
	it("defaults to rs and accepts only the two explicit generation values", () => {
		expect(daemonGenerationPreference({})).toBe("rs");
		expect(daemonGenerationPreference({ PIJ_DAEMON_GENERATION: "rs" })).toBe("rs");
		expect(daemonGenerationPreference({ PIJ_DAEMON_GENERATION: "legacy" })).toBe("legacy");
		for (const value of ["", " rust", "ts"]) {
			expect(() => daemonGenerationPreference({ PIJ_DAEMON_GENERATION: value })).toThrow(
				`PIJ_DAEMON_GENERATION has malformed value ${JSON.stringify(value)}`,
			);
		}
	});

	it("resolves strict extension address and state controls", () => {
		expect(daemonLocation({}, "/home/test")).toEqual({
			addr: "127.0.0.1:7461",
			stateDir: "/home/test/.pij-rs",
		});
		expect(
			daemonLocation({ PIJ_RS_ADDR: "localhost:8123", PIJ_RS_STATE_DIR: "/tmp/pij-rs" }),
		).toEqual({ addr: "localhost:8123", stateDir: "/tmp/pij-rs" });
		for (const value of ["", "localhost", "localhost:0", "localhost:65536"]) {
			expect(() => daemonLocation({ PIJ_RS_ADDR: value })).toThrow(
				`PIJ_RS_ADDR has malformed value ${JSON.stringify(value)}`,
			);
		}
		for (const value of ["", "  "]) {
			expect(() => daemonLocation({ PIJ_RS_STATE_DIR: value })).toThrow(
				`PIJ_RS_STATE_DIR has malformed value ${JSON.stringify(value)}`,
			);
		}
	});

	it("uses the authenticated Rust daemon when rs is selected", async () => {
		const base = root();
		const stateDir = join(base, "rust");
		mkdirSync(stateDir);
		writeFileSync(join(stateDir, "daemon.key"), "secret\n");
		const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			expect(init?.headers).toEqual({ Authorization: "Bearer secret" });
			return new Response(fixture("health-v1.json"));
		});

		const generation = await detectDaemonGeneration(
			{ addr: "127.0.0.1:7461", stateDir },
			"rs",
			deps(fetchMock as typeof fetch),
		);

		expect(generation.kind).toBe("rust");
	});

	it("selects legacy explicitly without probing Rust", async () => {
		const fetchMock = vi.fn(async () => {
			throw new Error("must not probe");
		});
		await expect(
			detectDaemonGeneration(
				{ addr: "127.0.0.1:7461", stateDir: "/unused" },
				"legacy",
				deps(fetchMock as typeof fetch),
			),
		).resolves.toMatchObject({ kind: "legacy" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		"node",
		"bun",
	] as const)("fails loudly instead of falling back when selected Rust is unavailable in %s", async (runtime) => {
		const base = root();
		const fetchMock = vi.fn(async () => {
			throw refused(runtime);
		});
		try {
			await detectDaemonGeneration(
				{ addr: "127.0.0.1:7999", stateDir: join(base, "missing-rust") },
				"rs",
				deps(fetchMock as typeof fetch),
			);
			throw new Error("missing selected Rust daemon was accepted");
		} catch (error) {
			expect(error).toBeInstanceOf(PijNoDaemonError);
			expect(error).toMatchObject({
				code: "PIJ_NO_DAEMON",
				addr: "127.0.0.1:7999",
				stateDir: join(base, "missing-rust"),
			});
			expect(String(error)).toContain("Start pij-rs");
			expect(String(error)).toContain("PIJ_DAEMON_GENERATION=legacy");
		}
	});
});

describe("pij-rs HTTP client", () => {
	it("authenticates registration and sends the exact structural identity", async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
			calls.push({ url: String(url), init });
			return new Response(fixture("register-v1.json"));
		});
		const client = new PijDaemonClient(
			{ addr: "127.0.0.1:7461", stateDir: "/tmp/state" },
			"secret",
			deps(fetchMock as typeof fetch),
		);
		await client.register({
			id: "pij-test-seat",
			harness: "omp",
			folder: "/abs/tree",
			pane: "%42",
			pid: 4242,
			proc_start: 20260829103052,
			spawn_id: "spawn-1",
			model: "github-copilot/gpt-5.6-sol-fast",
			provider: "github-copilot",
			effort: "high",
			relay: false,
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe("http://127.0.0.1:7461/v1/register");
		expect(calls[0]?.init?.headers).toMatchObject({ Authorization: "Bearer secret" });
		expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
			pid: 4242,
			proc_start: 20260829103052,
			spawn_id: "spawn-1",
		});
	});

	it("forwards unknown frames and keeps reading pushed turns", async () => {
		const fetchMock = vi.fn(async () => new Response(fixture("events-v1.ndjson")));
		const client = new PijDaemonClient(
			{ addr: "127.0.0.1:7461", stateDir: "/tmp/state" },
			"secret",
			{ ...deps(fetchMock as typeof fetch), readFile: async () => "secret" },
		);
		const frames: string[] = [];
		const errors: Error[] = [];
		const stop = await client.watchEvents(
			(frame) => frames.push(frame.event.kind),
			(error) => errors.push(error),
		);
		try {
			await vi.waitFor(() => expect(frames).toEqual(["future.kind", "message.pushed"]));
			expect(errors).toEqual([]);
		} finally {
			stop();
		}
	});

	it("reconnects with the complete cursor map and refreshes the daemon key", async () => {
		const stateDir = root();
		writeFileSync(join(stateDir, "daemon.key"), "old-key\n");
		const urls: URL[] = [];
		const authorizations: string[] = [];
		let attach = 0;
		const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
			urls.push(new URL(String(url)));
			authorizations.push(String((init?.headers as Record<string, string>).Authorization));
			attach += 1;
			if (attach === 1) {
				writeFileSync(join(stateDir, "daemon.key"), "new-key\n");
				return eventStream([frame("alpha", 7), frame("beta", 3)]);
			}
			if (attach === 2) return eventStream([frame("alpha", 8)], true);
			throw new Error(`unexpected attach ${attach}`);
		});
		const client = new PijDaemonClient(
			{ addr: "127.0.0.1:7461", stateDir },
			"old-key",
			deps(fetchMock as typeof fetch),
		);
		const cursors: number[] = [];
		const notices: string[] = [];
		const stop = await client.watchEvents(
			(received) => cursors.push(received.cursor),
			(error) => {
				throw error;
			},
			(notice) => notices.push(notice),
		);
		try {
			await vi.waitFor(() => expect(cursors).toEqual([7, 3, 8]));
			expect(JSON.parse(urls[1]?.searchParams.get("since") ?? "null")).toEqual({
				alpha: 7,
				beta: 3,
			});
			expect(authorizations).toEqual(["Bearer old-key", "Bearer new-key"]);
			expect(notices).toEqual([
				"pij: daemon stream lost, reconnecting…",
				"pij: re-attached at cursor 7",
			]);
		} finally {
			stop();
		}
	});

	it("falls back to a live-only attach when the daemon refuses replay cursors", async () => {
		const stateDir = root();
		writeFileSync(join(stateDir, "daemon.key"), "secret\n");
		const urls: URL[] = [];
		let attach = 0;
		const fetchMock = vi.fn(async (url: string | URL | Request) => {
			urls.push(new URL(String(url)));
			attach += 1;
			if (attach === 1) return eventStream([frame("alpha", 7)]);
			if (attach === 2) return refusal("cursor_reset", "cursor 7 is beyond spine 2", 409);
			if (attach === 3) return eventStream([], true);
			throw new Error(`unexpected attach ${attach}`);
		});
		const notices: string[] = [];
		const client = new PijDaemonClient(
			{ addr: "127.0.0.1:7461", stateDir },
			"secret",
			deps(fetchMock as typeof fetch),
		);
		const stop = await client.watchEvents(
			() => {},
			(error) => {
				throw error;
			},
			(notice) => notices.push(notice),
		);
		try {
			await vi.waitFor(() => expect(urls).toHaveLength(3));
			expect(urls[1]?.searchParams.has("since")).toBe(true);
			expect(urls[2]?.searchParams.has("since")).toBe(false);
			expect(notices).toContain("pij: cursor 7 is beyond spine 2; re-attaching live-only");
		} finally {
			stop();
		}
	});

	it("refreshes and retries any request once after an authentication refusal", async () => {
		const stateDir = root();
		writeFileSync(join(stateDir, "daemon.key"), "old-key\n");
		const authorizations: string[] = [];
		const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			authorizations.push(String((init?.headers as Record<string, string>).Authorization));
			if (authorizations.length === 1) {
				writeFileSync(join(stateDir, "daemon.key"), "new-key\n");
				return refusal("auth", "missing or wrong bearer token", 401);
			}
			return new Response(
				JSON.stringify({
					ok: true,
					command: "pij send",
					v: 1,
					data: { msg_id: "m1", outcome: { outcome: "queued" }, at: 1 },
				}),
			);
		});
		const client = new PijDaemonClient(
			{ addr: "127.0.0.1:7461", stateDir },
			"old-key",
			deps(fetchMock as typeof fetch),
		);
		await expect(
			client.send({ from: "pij-a", to: { seat: "pij-b" }, body: "hello", msg_id: "m1" }),
		).resolves.toMatchObject({ msg_id: "m1" });
		expect(authorizations).toEqual(["Bearer old-key", "Bearer new-key"]);

		const alwaysUnauthorized = vi.fn(async () => refusal("auth", "still wrong", 403));
		const failing = new PijDaemonClient(
			{ addr: "127.0.0.1:7461", stateDir },
			"old-key",
			deps(alwaysUnauthorized as typeof fetch),
		);
		await expect(failing.seats()).rejects.toThrow("still wrong");
		expect(alwaysUnauthorized).toHaveBeenCalledTimes(2);
	});

	it("caps reconnect backoff after exponential growth", async () => {
		const stateDir = root();
		writeFileSync(join(stateDir, "daemon.key"), "secret\n");
		const sleeps: Array<{ readonly ms: number; readonly release: () => void }> = [];
		let attach = 0;
		const fetchMock = vi.fn(async () => {
			attach += 1;
			if (attach === 1) return eventStream([]);
			throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
		});
		const baseDeps = deps(fetchMock as typeof fetch);
		const client = new PijDaemonClient({ addr: "127.0.0.1:7461", stateDir }, "secret", {
			...baseDeps,
			random: () => 0.5,
			sleep: (ms) =>
				new Promise<void>((resolveSleep) => sleeps.push({ ms, release: resolveSleep })),
		});
		const stop = await client.watchEvents(
			() => {},
			(error) => {
				throw error;
			},
		);
		try {
			const expected = [250, 500, 1_000, 2_000, 4_000, 5_000, 5_000];
			for (let index = 0; index < expected.length; index += 1) {
				await vi.waitFor(() => expect(sleeps).toHaveLength(index + 1));
				expect(sleeps[index]?.ms).toBe(expected[index]);
				sleeps[index]?.release();
			}
		} finally {
			stop();
		}
	});
});
