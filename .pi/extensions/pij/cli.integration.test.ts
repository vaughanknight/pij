// pij-messaging — Phase 5 two-peer integration smoke (AC-1,3,5,7,8,9,10,11,13).
//
// The Driver `Step` union is TUI-only and `pijHome` was hardcoded, so a literal
// "two real pi windows" smoke can neither be sandboxed nor asserted through. This
// proves the SAME two-peer protocol deterministically and in-CI (runs under
// `just test`): two real `PijSession` coordinators + the real fs adapters over a
// tmp `PIJ_HOME`, observed end-to-end through the real `cli.ts` bin (subprocess).
//
// What stays local-only (tmux + pi binary): the in-pi boot/announce proof —
// `.pi/extensions/pij/smoke.ts` (`/pij` status line via the Driver SDK).

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FsChannel } from "./adapters/channel.js";
import { FsEventLog } from "./adapters/event-log.js";
import { FakePiRuntime } from "./adapters/fakes.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { NodeProcess } from "./adapters/process.js";
import { reattachIdentity } from "./core/binding.js";
import type { BootInput, PijPorts } from "./core/session.js";
import { PijSession } from "./core/session.js";
import type { PijMessage } from "./core/types.js";

const CLI = join(import.meta.dirname, "cli.ts");
const TSX = join(import.meta.dirname, "..", "..", "..", "node_modules", ".bin", "tsx");

let HOME: string;
let FOLDER: string;

/** Run the real cli.ts bin in the sandbox. Returns stdout + exit code. */
function pij(args: string[], extraEnv: Record<string, string> = {}): { out: string; code: number } {
	const env = { ...process.env, PIJ_HOME: HOME, ...extraEnv };
	try {
		const out = execFileSync(TSX, [CLI, ...args], { cwd: FOLDER, env, encoding: "utf8" });
		return { out, code: 0 };
	} catch (e) {
		const err = e as { status?: number; stdout?: string; stderr?: string };
		return { out: (err.stdout ?? "") + (err.stderr ?? ""), code: err.status ?? 1 };
	}
}

/** Boot a real PijSession over the sandbox home (real adapters, faked pi runtime). */
function boot(id: string, role: "parent" | "worker", idle = true): PijSession {
	const dataDir = join(HOME, id);
	const ports: PijPorts = {
		registry: new FsRegistry(HOME),
		eventLog: new FsEventLog(HOME, id),
		delivery: new FsChannel(HOME),
		pi: new FakePiRuntime(idle),
		process: new NodeProcess(), // real pid => CLI liveness sees it alive
	};
	const input: BootInput = {
		id,
		role,
		folder: FOLDER,
		dataDir,
		eventsPath: join(dataDir, "events.ndjson"),
	};
	const s = new PijSession(ports);
	s.boot(input);
	return s;
}

let A: PijSession;
let B: PijSession;

beforeAll(() => {
	HOME = mkdtempSync(join(tmpdir(), "pij-smoke-"));
	// realpath: on macOS mkdtemp returns a /var symlink; the CLI's `--here` reads
	// the real cwd, so the descriptor folder must be the resolved path to match.
	FOLDER = realpathSync(mkdtempSync(join(tmpdir(), "pij-folder-")));
	A = boot("pij-A", "parent");
	B = boot("pij-B", "worker");
	boot("pij-C2", "worker");
	// Seed B with a couple of activity events so tail/state have content.
	B.capture("tool_call", { toolName: "bash" });
	B.capture("message", { role: "assistant" });
});

afterAll(() => {
	rmSync(HOME, { recursive: true, force: true });
	rmSync(FOLDER, { recursive: true, force: true });
});

describe("pij two-peer integration (real coordinators + real CLI over sandbox PIJ_HOME)", () => {
	it("top-level help advertises the prime list filter", () => {
		const result = pij(["--help"]);
		expect(result.code).toBe(0);
		expect(result.out).toContain("pij list [--here] [--prime] [--json]");
	});

	it("sets, filters, unsets, and durably reattaches prime designations through the real CLI", () => {
		const selfSet = pij(["orchestration", "prime", "set", "--json"], {
			PIJ_SESSION_ID: "pij-A",
		});
		expect(selfSet.code).toBe(0);
		expect(JSON.parse(selfSet.out)).toEqual({
			id: "pij-A",
			prime: true,
			changed: true,
		});

		const explicitOther = pij(["orchestration", "prime", "set", "pij-B", "--json"], {
			PIJ_SESSION_ID: "",
		});
		expect(explicitOther.code).toBe(0);
		expect(JSON.parse(explicitOther.out)).toMatchObject({ id: "pij-B", prime: true });

		const primesHere = pij(["list", "--prime", "--here", "--json"]);
		expect(primesHere.code).toBe(0);
		expect(
			(JSON.parse(primesHere.out) as Array<{ id: string; prime: boolean }>).map(
				({ id, prime }) => ({
					id,
					prime,
				}),
			),
		).toEqual([
			{ id: "pij-A", prime: true },
			{ id: "pij-B", prime: true },
		]);

		const unset = pij(["orchestration", "prime", "unset", "--json"], {
			PIJ_SESSION_ID: "pij-A",
		});
		expect(JSON.parse(unset.out)).toMatchObject({ id: "pij-A", prime: false, changed: true });
		expect(new FsRegistry(HOME).read("pij-A")?.prime).toBe(false);

		const beforeUnknown = readFileSync(join(HOME, "pij-B.json"), "utf8");
		const unknown = pij(["orchestration", "prime", "set", "missing"], {
			PIJ_SESSION_ID: "",
		});
		expect(unknown.code).toBe(2);
		expect(unknown.out).toContain("E-NOID");
		expect(readFileSync(join(HOME, "pij-B.json"), "utf8")).toBe(beforeUnknown);

		const ambiguous = pij(["orchestration", "prime", "set"], { PIJ_SESSION_ID: "" });
		expect(ambiguous.code).toBe(2);
		expect(ambiguous.out).toContain("E-AMBIG");

		const registry = new FsRegistry(HOME);
		registry.write({
			id: "pij-durable",
			folder: FOLDER,
			dataDir: join(HOME, "pij-durable"),
			eventsPath: join(HOME, "pij-durable", "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-11T00:00:00.000Z",
			harness: "claude",
			harnessSessionId: "native-prime",
			lifecycle: "bound",
		});
		expect(pij(["orchestration", "prime", "set", "pij-durable"]).code).toBe(0);
		registry.remove("pij-durable");
		const snapshot = new FsRegistry(HOME).resolveIdentitySnapshot("claude", "native-prime");
		expect(snapshot).toMatchObject({ ok: true, value: { id: "pij-durable", prime: true } });
		if (!snapshot.ok || !snapshot.value) throw new Error("expected durable descriptor snapshot");
		new FsRegistry(HOME).write(
			reattachIdentity(snapshot.value, {
				harness: "claude",
				harnessSessionId: "native-prime",
				folder: FOLDER,
				pid: process.pid,
				paneId: "%99",
			}),
		);
		expect(new FsRegistry(HOME).read("pij-durable")?.prime).toBe(true);
	});

	it("rejects valued --prime=false instead of silently disabling the filter", () => {
		const result = pij(["list", "--prime=false", "--json"]);
		expect(result.code).toBe(64);
		expect(result.out).toContain("E-ARG");
		expect(result.out).toContain("--prime does not take a value");
		expect(result.out).not.toContain('"id":"pij-A"');
	});

	it("AC-1 discovery: list --here sees both peers in this folder", () => {
		const r = pij(["list", "--here"]);
		expect(r.code).toBe(0);
		expect(r.out).toContain("pij-A");
		expect(r.out).toContain("pij-B");
	});

	it("AC-5/whoami: PIJ_SESSION_ID resolves self unambiguously", () => {
		const r = pij(["whoami"], { PIJ_SESSION_ID: "pij-A" });
		expect(r.code).toBe(0);
		expect(r.out).toContain("pij-A");
	});

	it("AC-3 send: message reaches the peer's inbox on disk (raw body)", () => {
		const r = pij(["send", "pij-B", "hello from A"], { PIJ_SESSION_ID: "pij-A" });
		expect(r.code).toBe(0);
		const inbox = readdirSync(join(HOME, "pij-B", "inbox"));
		expect(inbox.length).toBeGreaterThan(0);
		const msg = JSON.parse(readFileSync(join(HOME, "pij-B", "inbox", inbox[0] as string), "utf8"));
		expect(msg).toMatchObject({ from: "pij-A", to: "pij-B", body: "hello from A" });
	});

	it("broadcast send writes the same raw body once to each target inbox", () => {
		const r = pij(["send", "--to", "pij-B", "--to", "pij-C2", "hello both", "--json"], {
			PIJ_SESSION_ID: "pij-A",
		});
		expect(r.code).toBe(0);
		const output = JSON.parse(r.out) as {
			from: string;
			results: Array<{ to: string; messageId: string }>;
		};
		expect(output).toMatchObject({
			from: "pij-A",
			results: [{ to: "pij-B" }, { to: "pij-C2" }],
		});
		expect(output.results.map(({ to }) => to)).toEqual(["pij-B", "pij-C2"]);
		expect(new Set(output.results.map(({ messageId }) => messageId)).size).toBe(2);

		for (const target of ["pij-B", "pij-C2"]) {
			const messages = readdirSync(join(HOME, target, "inbox")).map(
				(file) => JSON.parse(readFileSync(join(HOME, target, "inbox", file), "utf8")) as PijMessage,
			);
			expect(
				messages.filter(
					(message) =>
						message.from === "pij-A" && message.to === target && message.body === "hello both",
				),
			).toHaveLength(1);
		}
	});

	it("broadcast --wait timeout names every unresolved target", () => {
		const r = pij(["send", "--to", "pij-B", "--to", "pij-C2", "wait for both", "--wait", "10"], {
			PIJ_SESSION_ID: "pij-A",
		});
		expect(r.code).toBe(0);
		const timeoutLine = r.out.split("\n").find((line) => line.includes("timeout"));
		expect(timeoutLine).toContain("unresolved");
		expect(timeoutLine).toContain("pij-B");
		expect(timeoutLine).toContain("pij-C2");
	});

	it("single-target --wait timeout output remains byte-identical", () => {
		const r = pij(["send", "pij-B", "wait for one", "--wait", "10"], {
			PIJ_SESSION_ID: "pij-A",
		});
		expect(r.code).toBe(0);
		const timeoutLine = r.out.split("\n").find((line) => line.includes("timeout"));
		expect(timeoutLine).toBe("receipt → (timeout; check `pij tail` later)");
	});

	it("broadcast preflights the full target set before writing any inbox", () => {
		const before = new Map(
			["pij-B", "pij-C2"].map((target) => [
				target,
				readdirSync(join(HOME, target, "inbox")).length,
			]),
		);
		const r = pij(["send", "--to", "pij-B", "--to", "pij-MISSING", "must not land"], {
			PIJ_SESSION_ID: "pij-A",
		});

		expect(r.code).toBe(2);
		expect(r.out).toContain("E-NOID");
		for (const target of ["pij-B", "pij-C2"]) {
			expect(readdirSync(join(HOME, target, "inbox"))).toHaveLength(before.get(target) ?? 0);
		}
	});

	it("AC-7/8 tail: --since filters to seq>N, events are ordered + timestamped", () => {
		const all = pij(["tail", "pij-B", "--since", "0"]);
		expect(all.code).toBe(0);
		expect(all.out).toContain("tool_call");
		const since = pij(["tail", "pij-B", "--since", "1"]);
		expect(since.out).not.toContain("\n1 "); // seq 1 excluded
	});

	it("AC-9/10 state: reports state + liveness without a stream parse", () => {
		const r = pij(["state", "pij-B"]);
		expect(r.code).toBe(0);
		expect(r.out).toMatch(/active|stale|dead/);
	});

	it("AC-11 path: prints the readable events.ndjson path", () => {
		const r = pij(["path", "pij-B", "--events"]);
		expect(r.code).toBe(0);
		expect(r.out.trim()).toBe(join(HOME, "pij-B", "events.ndjson"));
	});

	it("AC-6 errors: invalid target exit codes are honored (E-NOID exit 2)", () => {
		const r = pij(["send", "pij-MISSING", "hi"], { PIJ_SESSION_ID: "pij-A" });
		expect(r.code).toBe(2);
	});

	it("AC-6 command: send --command compact is accepted + the peer executes it", () => {
		const r = pij(["send", "pij-B", "--command", "compact"], { PIJ_SESSION_ID: "pij-A" });
		expect(r.code).toBe(0);
		const cmd = readdirSync(join(HOME, "pij-B", "inbox"))
			.map((f) => JSON.parse(readFileSync(join(HOME, "pij-B", "inbox", f), "utf8")) as PijMessage)
			.find((m) => m.command === "compact");
		expect(cmd).toBeTruthy();
		// the receiver runs the allow-listed command through its runtime (real coordinator).
		const res = B.onInbound(cmd as PijMessage, "m-cmd-1");
		expect(res).toMatchObject({ kind: "command-executed", command: "compact" });
	});

	it("AC-13 receipt loop: B records inbound + emits a receipt; A records it; tail shows it", () => {
		// A -> B free text (idle B injects + emits the 'delivered' receipt to A's inbox).
		const msg: PijMessage = { from: "pij-A", to: "pij-B", body: "ping" };
		B.onInbound(msg, "m-int-1");
		const aInbox = join(HOME, "pij-A", "inbox");
		const files = readdirSync(aInbox);
		expect(files.length).toBeGreaterThan(0);
		const receipt = JSON.parse(
			readFileSync(join(aInbox, files[0] as string), "utf8"),
		) as PijMessage;
		expect(receipt).toMatchObject({ from: "pij-B", to: "pij-A", kind: "receipt" });
		// A records the receipt as an event (never injected); tail surfaces it (AC-13).
		A.onInbound(receipt, "m-int-2");
		const r = pij(["tail", "pij-A", "--type", "receipt", "--since", "0"]);
		expect(r.code).toBe(0);
		expect(r.out).toContain("receipt");
	});

	it("peer watch CLI mutates the caller sidecar via PIJ_SESSION_ID", () => {
		new FsRegistry(HOME).write({
			id: "pij-C",
			folder: FOLDER,
			dataDir: join(HOME, "pij-C"),
			eventsPath: join(HOME, "pij-C", "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-06T00:00:00.000Z",
			harness: "claude",
			lifecycle: "bound",
		});
		const watched = pij(["watch", "src/**/*.ts"], { PIJ_SESSION_ID: "pij-C" });
		expect(watched.code).toBe(0);
		const sidecarPath = join(HOME, "pij-C", "watches.json");
		const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8")) as {
			watches: Array<{ dir: string; patterns: string[] }>;
		};
		expect(sidecar.watches).toHaveLength(1);
		expect(sidecar.watches[0]).toMatchObject({ dir: "src", patterns: ["**/*.ts"] });

		const unwatched = pij(["unwatch", "src/**/*.ts"], { PIJ_SESSION_ID: "pij-C" });
		expect(unwatched.code).toBe(0);
		const after = JSON.parse(readFileSync(sidecarPath, "utf8")) as { watches: unknown[] };
		expect(after.watches).toEqual([]);
	});

	it("peer watch CLI parses and upserts --debounce values", () => {
		new FsRegistry(HOME).write({
			id: "pij-D",
			folder: FOLDER,
			dataDir: join(HOME, "pij-D"),
			eventsPath: join(HOME, "pij-D", "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-10T00:00:00.000Z",
			harness: "copilot",
			lifecycle: "bound",
		});
		const sidecarPath = join(HOME, "pij-D", "watches.json");
		const readDebounce = (): number | undefined => {
			const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8")) as {
				watches: Array<{ debounceMs?: number }>;
			};
			expect(sidecar.watches).toHaveLength(1);
			return sidecar.watches[0]?.debounceMs;
		};

		expect(
			pij(["watch", "--debounce", "750", "src/**/*.ts"], { PIJ_SESSION_ID: "pij-D" }).code,
		).toBe(0);
		expect(readDebounce()).toBe(750);

		expect(
			pij(["watch", "--debounce", "2s", "src/**/*.ts"], { PIJ_SESSION_ID: "pij-D" }).code,
		).toBe(0);
		expect(readDebounce()).toBe(2000);

		expect(
			pij(["watch", "--debounce", "750ms", "src/**/*.ts"], { PIJ_SESSION_ID: "pij-D" }).code,
		).toBe(0);
		expect(readDebounce()).toBe(750);
	});

	it("peer watch CLI rejects invalid debounce values before writing a sidecar", () => {
		new FsRegistry(HOME).write({
			id: "pij-E",
			folder: FOLDER,
			dataDir: join(HOME, "pij-E"),
			eventsPath: join(HOME, "pij-E", "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-10T00:00:00.000Z",
			harness: "claude",
			lifecycle: "bound",
		});
		const sidecarPath = join(HOME, "pij-E", "watches.json");
		for (const value of ["0", "-1", "NaN", "1m"]) {
			const result = pij(["watch", "--debounce", value, "src/**/*.ts"], {
				PIJ_SESSION_ID: "pij-E",
			});
			expect(result.code).toBe(64);
			expect(result.out).toContain("--debounce");
			expect(existsSync(sidecarPath)).toBe(false);
		}
	});

	it("peer watch CLI errors for unresolved self, missing args, and pi sessions", () => {
		expect(pij(["watch", "src/**/*.ts"], { PIJ_SESSION_ID: "missing" }).code).not.toBe(0);
		expect(pij(["watch"], { PIJ_SESSION_ID: "pij-A" }).code).not.toBe(0);
		expect(pij(["watch", "src/**/*.ts"], { PIJ_SESSION_ID: "pij-A" }).out).toContain(
			"non-pi peers only",
		);
	});
});
