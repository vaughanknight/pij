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

function refused(): Error {
	const error = new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
	return error;
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
		expect(() => daemonLocation({ PIJ_RS_STATE_DIR: "" })).toThrow(
			'PIJ_RS_STATE_DIR has malformed value ""',
		);
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

	it("fails loudly instead of falling back when selected Rust is unavailable", async () => {
		const base = root();
		const fetchMock = vi.fn(async () => {
			throw refused();
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
			deps(fetchMock as typeof fetch),
		);
		const frames: string[] = [];
		const errors: Error[] = [];
		await new Promise<void>((resolveDone, reject) => {
			void client
				.watchEvents(
					(frame) => {
						frames.push(frame.event.kind);
						if (frames.length === 2) resolveDone();
					},
					(error) => errors.push(error),
				)
				.catch(reject);
		});
		expect(frames).toEqual(["future.kind", "message.pushed"]);
		expect(errors).toEqual([]);
	});
});
