import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PijNoDaemonError } from "../core/daemon-wire.js";
import { type DaemonHttpDeps, detectDaemonGeneration, PijDaemonClient } from "./daemon-http.js";

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
	return { fetch: fetchImpl, readFile, readdir, processStart: () => 20260829103052 };
}

function refused(): Error {
	const error = new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
	return error;
}

afterEach(() => {
	for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("daemon generation detection", () => {
	it("prefers an authenticated live Rust daemon over legacy residue", async () => {
		const base = root();
		const pijHome = join(base, "legacy");
		const stateDir = join(base, "rust");
		mkdirSync(pijHome);
		mkdirSync(stateDir);
		writeFileSync(join(pijHome, "pij-old-seat.json"), "{}");
		writeFileSync(join(stateDir, "daemon.key"), "secret\n");
		const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			expect(init?.headers).toEqual({ Authorization: "Bearer secret" });
			return new Response(fixture("health-v1.json"));
		});

		const generation = await detectDaemonGeneration(
			pijHome,
			{ addr: "127.0.0.1:7461", stateDir },
			deps(fetchMock as typeof fetch),
		);

		expect(generation.kind).toBe("rust");
	});

	it("selects legacy only after refusal plus positive file evidence", async () => {
		const base = root();
		const pijHome = join(base, "legacy");
		mkdirSync(pijHome);
		writeFileSync(join(pijHome, "pij-old-seat.json"), "{}");
		const fetchMock = vi.fn(async () => {
			throw refused();
		});

		await expect(
			detectDaemonGeneration(
				pijHome,
				{ addr: "127.0.0.1:7461", stateDir: join(base, "missing") },
				deps(fetchMock as typeof fetch),
			),
		).resolves.toMatchObject({ kind: "legacy" });
	});

	it("reports structured no-daemon only after refusal without legacy evidence", async () => {
		const base = root();
		const fetchMock = vi.fn(async () => {
			throw refused();
		});
		try {
			await detectDaemonGeneration(
				join(base, "missing-legacy"),
				{ addr: "127.0.0.1:7999", stateDir: join(base, "missing-rust") },
				deps(fetchMock as typeof fetch),
			);
			throw new Error("missing daemon was accepted");
		} catch (error) {
			expect(error).toBeInstanceOf(PijNoDaemonError);
			expect(error).toMatchObject({
				code: "PIJ_NO_DAEMON",
				addr: "127.0.0.1:7999",
				stateDir: join(base, "missing-rust"),
			});
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
