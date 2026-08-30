import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	DaemonRefusalError,
	decodeEnvelope,
	decodeStreamLine,
	type EventFrame,
	type HealthPayload,
	PijNoDaemonError,
	parseProcessStart,
	type QueueReceipt,
	type Registration,
	type RustSeatDescriptor,
	type SendRequest,
} from "../core/daemon-wire.js";

export const DEFAULT_PIJ_RS_ADDR = "127.0.0.1:7461";

export interface DaemonLocation {
	readonly addr: string;
	readonly stateDir: string;
}

interface FederatedRoster {
	readonly seats: readonly RustSeatDescriptor[];
	readonly unavailable: readonly { readonly machine: string; readonly reason: string }[];
}

export type DaemonGenerationPreference = "rs" | "legacy";

export type DaemonGeneration =
	| { readonly kind: "legacy"; readonly location: DaemonLocation }
	| {
			readonly kind: "rust";
			readonly location: DaemonLocation;
			readonly health: HealthPayload;
			readonly client: PijDaemonClient;
	  };

export interface DaemonHttpDeps {
	readonly fetch: typeof fetch;
	readonly readFile: typeof readFile;
	readonly processStart: (pid: number) => number;
}

const DEFAULT_DEPS: DaemonHttpDeps = {
	fetch,
	readFile,
	processStart: observedProcessStart,
};

/** Resolve extension transport controls: explicit environment, then Rust defaults. */
export function daemonLocation(
	env: NodeJS.ProcessEnv = process.env,
	home: string = homedir(),
): DaemonLocation {
	const addr = configuredValue("PIJ_RS_ADDR", env.PIJ_RS_ADDR, DEFAULT_PIJ_RS_ADDR);
	assertDaemonAddr(addr);
	return {
		addr,
		stateDir: configuredValue("PIJ_RS_STATE_DIR", env.PIJ_RS_STATE_DIR, join(home, ".pij-rs")),
	};
}

/** req-0019: explicit generation wins; absence cuts over to Rust with no fallback. */
export function daemonGenerationPreference(
	env: NodeJS.ProcessEnv = process.env,
): DaemonGenerationPreference {
	const value = env.PIJ_DAEMON_GENERATION;
	if (value === undefined) return "rs";
	if (value === "rs" || value === "legacy") return value;
	throw invalidEnvironment("PIJ_DAEMON_GENERATION", value, 'expected exactly "rs" or "legacy"');
}

export async function detectDaemonGeneration(
	location: DaemonLocation = daemonLocation(),
	preference: DaemonGenerationPreference = daemonGenerationPreference(),
	deps: DaemonHttpDeps = DEFAULT_DEPS,
): Promise<DaemonGeneration> {
	if (preference === "legacy") return { kind: "legacy", location };

	let key: string | undefined;
	try {
		key = (await deps.readFile(join(location.stateDir, "daemon.key"), "utf8")).trim();
	} catch {
		// Probe without credentials. A v1 auth envelope still proves which daemon answered.
	}
	try {
		const response = await deps.fetch(`http://${location.addr}/health`, {
			headers: key ? { Authorization: `Bearer ${key}` } : undefined,
		});
		const body = await response.text();
		const health = decodeEnvelope<HealthPayload>(body).data;
		if (!key) {
			throw new DaemonRefusalError(
				"auth",
				"auth",
				`pij-rs answered at ${location.addr}, but ${join(location.stateDir, "daemon.key")} is unreadable`,
			);
		}
		return {
			kind: "rust",
			location,
			health,
			client: new PijDaemonClient(location, key, deps),
		};
	} catch (error) {
		if (isConnectionRefused(error)) throw new PijNoDaemonError(location.addr, location.stateDir);
		throw error;
	}
}

export class PijDaemonClient {
	constructor(
		readonly location: DaemonLocation,
		private readonly key: string,
		private readonly deps: DaemonHttpDeps = DEFAULT_DEPS,
	) {}

	processStart(pid: number): number {
		return this.deps.processStart(pid);
	}

	register(claim: Registration): Promise<RustSeatDescriptor> {
		return this.post<RustSeatDescriptor>("/v1/register", claim);
	}

	async seats(): Promise<readonly RustSeatDescriptor[]> {
		return (await this.get<FederatedRoster>("/v1/seats")).seats;
	}

	send(request: SendRequest): Promise<QueueReceipt> {
		return this.post<QueueReceipt>("/v1/send", request);
	}

	async watchEvents(
		onFrame: (frame: EventFrame) => void,
		onError: (error: Error) => void,
	): Promise<() => void> {
		const controller = new AbortController();
		const response = await this.deps.fetch(`http://${this.location.addr}/v1/events`, {
			headers: this.headers(),
			signal: controller.signal,
		});
		if (!response.ok) {
			decodeEnvelope<unknown>(await response.text());
			throw new Error(`pij events failed with HTTP ${response.status}`);
		}
		if (!response.body) throw new Error("pij events returned no response body");
		void pumpEventStream(response.body, onFrame, onError, controller.signal);
		return () => controller.abort();
	}

	private async get<T>(path: string): Promise<T> {
		const response = await this.deps.fetch(`http://${this.location.addr}${path}`, {
			headers: this.headers(),
		});
		return decodeEnvelope<T>(await response.text()).data;
	}

	private async post<T>(path: string, body: unknown): Promise<T> {
		const response = await this.deps.fetch(`http://${this.location.addr}${path}`, {
			method: "POST",
			headers: { ...this.headers(), "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		return decodeEnvelope<T>(await response.text()).data;
	}

	private headers(): { readonly Authorization: string } {
		return { Authorization: `Bearer ${this.key}` };
	}
}

async function pumpEventStream(
	stream: ReadableStream<Uint8Array>,
	onFrame: (frame: EventFrame) => void,
	onError: (error: Error) => void,
	signal: AbortSignal,
): Promise<void> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffered = "";
	let sawHello = false;
	try {
		while (!signal.aborted) {
			const { done, value } = await reader.read();
			if (done) break;
			buffered += decoder.decode(value, { stream: true });
			const lines = buffered.split("\n");
			buffered = lines.pop() ?? "";
			for (const line of lines) {
				if (line.trim() === "") continue;
				try {
					const decoded = decodeStreamLine(line);
					if ("hello" in decoded) {
						if (sawHello) throw new Error("pij events sent a second Hello line");
						sawHello = true;
						continue;
					}
					if (!sawHello) throw new Error("pij events frame arrived before Hello");
					onFrame(decoded);
				} catch (error) {
					onError(asError(error));
				}
			}
		}
		if (buffered.trim() !== "") {
			try {
				const decoded = decodeStreamLine(buffered);
				if (!("hello" in decoded)) {
					if (!sawHello) throw new Error("pij events frame arrived before Hello");
					onFrame(decoded);
				}
			} catch (error) {
				onError(asError(error));
			}
		}
	} catch (error) {
		if (!signal.aborted) onError(asError(error));
	} finally {
		reader.releaseLock();
	}
}

function configuredValue(name: string, value: string | undefined, fallback: string): string {
	if (value === undefined) return fallback;
	if (value.trim() === "") throw invalidEnvironment(name, value, "value must not be empty");
	return value;
}

function assertDaemonAddr(value: string): void {
	const match = /^(?:\[[^\]]+\]|[^:/\s]+):(\d+)$/.exec(value);
	const port = match ? Number(match[1]) : Number.NaN;
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw invalidEnvironment("PIJ_RS_ADDR", value, "expected host:port with port 1..65535");
	}
}

function invalidEnvironment(name: string, value: string, detail: string): Error {
	return new Error(`${name} has malformed value ${JSON.stringify(value)}: ${detail}`);
}
function observedProcessStart(pid: number): number {
	const row = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
		encoding: "utf8",
		env: { ...process.env, LC_ALL: "C" },
	}).trim();
	if (!row) throw new Error(`process ${pid} did not produce a start time`);
	return parseProcessStart(row);
}

function isConnectionRefused(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current !== null && typeof current === "object"; depth++) {
		const record = current as { readonly code?: unknown; readonly cause?: unknown };
		if (record.code === "ECONNREFUSED") return true;
		current = record.cause;
	}
	return false;
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
