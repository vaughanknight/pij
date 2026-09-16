// Fresh-home bootstrap regression (pij#118, plan 092).
//
// The defect is INVISIBLE on any developer machine: `~/.pij` already exists, so
// the daemon's very first write — the single-instance lock — succeeds. On a
// fresh install it does not, and the daemon dies with `ENOENT … daemon.lock`
// before it can report anything useful. These cases therefore drive `runDaemon`
// against a home that provably does not exist yet: the `existsSync(...) === false`
// assertion BEFORE the call is what makes each case a test rather than a
// tautology (`mkdtempSync` creates its directory, which would pre-satisfy the bug).
//
// Plan 139 classification: runDaemon and the remaining PIJ_HOME readers are
// supported legacy LIBRARY seams, not a second public CLI. cli.ts now delegates
// to adapters/generation-router.ts; core/generation-routing.ts explicitly refuses
// daemon/path administration before any legacy startup, store or process access.
// Keep the lifecycle regressions below and prove that public boundary separately.

import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FsFocusStore } from "./adapters/focus-store.js";
import { resolvePijHome } from "./core/agents/paths.js";
import { runDaemon } from "./daemon.js";

/** Long enough that neither timer can fire inside a case, but well under the
 *  2^31-1 ceiling above which `setInterval` clamps to 1ms and spins. */
const NO_TICK_MS = 60_000;

/** Env the daemon reads at startup. Cleared around every case so the suite
 *  cannot depend on the runner's environment — an ambient `PIJ_TELEGRAM_ENV`
 *  points the bridge at a real config and starts a long-poll whose disposer
 *  does not stop the bot, which would hang the run.
 *
 *  `HOME` is in this list because after the pij#169 sweep an empty `PIJ_HOME`
 *  falls back to `~/.pij` instead of the cwd. Without redirecting `HOME` those
 *  cases would write a lock into the developer's REAL `~/.pij` and could fight
 *  a live daemon. `os.homedir()` reads `$HOME` on every call (verified), so
 *  redirecting it makes the fallback path hermetic. */
const HERMETIC_ENV = ["PIJ_HOME", "PIJ_TELEGRAM_ENV", "PIJ_DAEMON_OWNED", "HOME"] as const;

describe("runDaemon library — first-run home bootstrap", () => {
	let saved: Record<string, string | undefined>;
	let parent: string;

	beforeEach(() => {
		saved = {};
		for (const key of HERMETIC_ENV) {
			saved[key] = process.env[key];
			delete process.env[key];
		}
		parent = mkdtempSync(join(tmpdir(), "pij-bootstrap-"));
		// Point HOME at the temp tree for the whole case: with HOME merely
		// deleted, `homedir()` falls back to getpwuid and finds the real home,
		// which is exactly the directory these cases must never touch.
		process.env.HOME = parent;
	});

	afterEach(() => {
		for (const key of HERMETIC_ENV) {
			if (saved[key] === undefined) delete process.env[key];
			else process.env[key] = saved[key];
		}
		rmSync(parent, { recursive: true, force: true });
	});

	it("creates the home directory before acquiring the lock (case A: injected pijHome)", () => {
		// A never-created NESTED child of the temp dir: mkdtempSync made `parent`,
		// so only this deeper path reproduces a genuinely fresh install.
		const home = join(parent, "fresh", ".pij");
		expect(existsSync(home)).toBe(false);

		let stop: (() => void) | undefined;
		try {
			stop = runDaemon({
				pijHome: home,
				tickMs: NO_TICK_MS,
				deliveryMs: NO_TICK_MS,
				log: () => {},
			});
			expect(existsSync(join(home, "daemon.lock"))).toBe(true);
		} finally {
			stop?.();
		}
	});

	it("creates the home resolved from PIJ_HOME when no pijHome is injected (case B)", () => {
		const home = join(parent, "from-env", ".pij");
		process.env.PIJ_HOME = home;
		expect(existsSync(home)).toBe(false);

		let stop: (() => void) | undefined;
		try {
			// No `pijHome` option: exercise the library's environment resolution.
			// Public `pij daemon` is refused, not an alternate way into this seam.
			stop = runDaemon({ tickMs: NO_TICK_MS, deliveryMs: NO_TICK_MS, log: () => {} });
			expect(existsSync(join(home, "daemon.lock"))).toBe(true);
		} finally {
			stop?.();
		}
	});

	it("resolves an empty PIJ_HOME to ~/.pij, agreeing with every reader (case C)", () => {
		// PRE-SWEEP this case pinned the opposite value: `??` does not fall
		// through on "", so the daemon used join("", "daemon.lock") — a
		// cwd-relative lock. pij#169 routed all seven sites through
		// resolvePijHome(), which treats empty as unset, so the daemon now homes
		// at ~/.pij like everything else.
		//
		// The VALUE is not the invariant — it changed, deliberately. The
		// invariant is AGREEMENT: whatever the legacy daemon picks as its home,
		// its library readers must independently resolve the same path. Assert the
		// actual on-disk lock location against what the shared resolver returns,
		// rather than against a hard-coded string.
		process.env.PIJ_HOME = "";
		const expected = join(parent, ".pij");
		expect(resolvePijHome()).toBe(expected);
		expect(existsSync(expected)).toBe(false);

		let stop: (() => void) | undefined;
		try {
			stop = runDaemon({ tickMs: NO_TICK_MS, deliveryMs: NO_TICK_MS, log: () => {} });
			// Where the daemon actually wrote, not where we assume it wrote.
			expect(existsSync(join(expected, "daemon.lock"))).toBe(true);
			// A reader resolving independently lands on the same home.
			expect(join(resolvePijHome(), "daemon.lock")).toBe(join(expected, "daemon.lock"));
			// And it is NOT the old cwd-relative location.
			expect(existsSync(join(process.cwd(), "daemon.lock"))).toBe(false);
		} finally {
			stop?.();
		}
	});

	it("acquires normally in an existing, populated home (case D: idempotence)", () => {
		const home = mkdtempSync(join(parent, "populated-"));
		writeFileSync(join(home, "registry.ndjson"), "");
		expect(existsSync(home)).toBe(true);

		let stop: (() => void) | undefined;
		try {
			stop = runDaemon({
				pijHome: home,
				tickMs: NO_TICK_MS,
				deliveryMs: NO_TICK_MS,
				log: () => {},
			});
			expect(existsSync(join(home, "daemon.lock"))).toBe(true);
		} finally {
			stop?.();
		}
		// The disposer removes the lock it holds; the pre-existing content survives.
		expect(existsSync(join(home, "registry.ndjson"))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// pij#169 — every retained legacy PIJ_HOME library surface agrees
//
// `core/agents/paths.ts` called itself "the one place that computes" PIJ_HOME
// while seven sites still inlined `process.env.PIJ_HOME ?? join(homedir(),
// ".pij")`. The inlined form and the resolver disagreed on exactly one input —
// a SET-but-EMPTY PIJ_HOME. The public CLI's two sites were subsequently retired
// with the rs cutover; it must no longer resolve a legacy home at all. The five
// retained library consumers still share the resolver and retain this regression.
// ---------------------------------------------------------------------------

/** Extension root — this test lives at `.pi/extensions/pij/`. */
const PIJ_ROOT = dirname(fileURLToPath(import.meta.url));

/** Retained library consumers of the pij#169 sweep. The retired cli.ts sites
 *  are covered by the public refusal cases below, not an import requirement. */
const LEGACY_HOME_READERS: readonly { readonly file: string; readonly specifier: string }[] = [
	{ file: "daemon.ts", specifier: "./core/agents/paths.js" },
	{ file: "index.ts", specifier: "./core/agents/paths.js" },
	{ file: "core/daemon/watch.ts", specifier: "../agents/paths.js" },
	{ file: "adapters/focus-store.ts", specifier: "../core/agents/paths.js" },
	{ file: "telegram/index.ts", specifier: "../core/agents/paths.js" },
];

/** The inlined form the sweep removed. */
const INLINED = /process\.env\.PIJ_HOME\s*\?\?/g;

/** `FsFocusStore` exposes its home only through a derived path; peel the two
 *  path segments it appends (`focus/<name>/manifest.json`) back off. */
function focusStoreHome(store: FsFocusStore): string {
	return dirname(dirname(dirname(store.manifestPath("agreement"))));
}

describe("PIJ_HOME resolves identically at legacy library surfaces (pij#169)", () => {
	describe("no library surface re-derives it", () => {
		for (const { file, specifier } of LEGACY_HOME_READERS) {
			it(`${file} calls resolvePijHome() instead of inlining`, () => {
				const source = readFileSync(join(PIJ_ROOT, file), "utf8");
				// Reject every surviving inline fallback, not just its first occurrence.
				expect(source.match(INLINED)?.length ?? 0).toBe(0);
				expect(source).toContain(`from "${specifier}"`);
				expect(source).toContain("resolvePijHome");
			});
		}
	});

	describe("the reachable surfaces agree on set / unset / empty", () => {
		let saved: Record<string, string | undefined>;
		let parent: string;

		beforeEach(() => {
			saved = {};
			for (const key of HERMETIC_ENV) {
				saved[key] = process.env[key];
				delete process.env[key];
			}
			parent = mkdtempSync(join(tmpdir(), "pij-agree-"));
			process.env.HOME = parent;
		});

		afterEach(() => {
			for (const key of HERMETIC_ENV) {
				if (saved[key] === undefined) delete process.env[key];
				else process.env[key] = saved[key];
			}
			rmSync(parent, { recursive: true, force: true });
		});

		it("PIJ_HOME set: every surface uses it verbatim", () => {
			const home = join(parent, "explicit");
			process.env.PIJ_HOME = home;

			expect(resolvePijHome()).toBe(home);
			expect(focusStoreHome(new FsFocusStore())).toBe(home);

			let stop: (() => void) | undefined;
			try {
				stop = runDaemon({ tickMs: NO_TICK_MS, deliveryMs: NO_TICK_MS, log: () => {} });
				expect(existsSync(join(home, "daemon.lock"))).toBe(true);
			} finally {
				stop?.();
			}
		});

		it("PIJ_HOME unset: every surface falls back to ~/.pij", () => {
			const home = join(homedir(), ".pij");
			expect(home).toBe(join(parent, ".pij"));

			expect(resolvePijHome()).toBe(home);
			expect(focusStoreHome(new FsFocusStore())).toBe(home);

			let stop: (() => void) | undefined;
			try {
				stop = runDaemon({ tickMs: NO_TICK_MS, deliveryMs: NO_TICK_MS, log: () => {} });
				expect(existsSync(join(home, "daemon.lock"))).toBe(true);
			} finally {
				stop?.();
			}
		});

		it("PIJ_HOME empty: every surface treats it as unset — the case the sweep fixed", () => {
			// This is the one input the inlined form and the resolver disagreed
			// on. Pre-sweep, focus-store and the daemon produced cwd-relative
			// paths here while anything already on resolvePijHome() produced
			// ~/.pij — two homes, one machine.
			process.env.PIJ_HOME = "";
			const home = join(parent, ".pij");

			expect(resolvePijHome()).toBe(home);
			expect(focusStoreHome(new FsFocusStore())).toBe(home);

			let stop: (() => void) | undefined;
			try {
				stop = runDaemon({ tickMs: NO_TICK_MS, deliveryMs: NO_TICK_MS, log: () => {} });
				expect(existsSync(join(home, "daemon.lock"))).toBe(true);
				// Nothing landed in the cwd, which is where the old form put it.
				expect(existsSync(join(process.cwd(), "daemon.lock"))).toBe(false);
			} finally {
				stop?.();
			}
		});

		it("empty and unset land on the same home, so a reader cannot miss a live daemon", () => {
			const unset = resolvePijHome();
			process.env.PIJ_HOME = "";
			expect(resolvePijHome()).toBe(unset);
			expect(focusStoreHome(new FsFocusStore())).toBe(unset);
		});
	});
});

const TSX_CLI = createRequire(import.meta.url).resolve("tsx/cli");

/** Include directory creation, symlinks and exact file bytes, not just the lock. */
function homeSnapshot(root: string, prefix = ""): Record<string, string> {
	const snapshot: Record<string, string> = {};
	for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
		const path = join(prefix, entry.name);
		if (entry.isDirectory()) {
			snapshot[path] = "directory";
			Object.assign(snapshot, homeSnapshot(root, path));
		} else if (entry.isSymbolicLink()) {
			snapshot[path] = `link:${readlinkSync(join(root, path))}`;
		} else {
			snapshot[path] = readFileSync(join(root, path)).toString("base64");
		}
	}
	return snapshot;
}

describe.each([
	undefined,
	"legacy",
])("public administration refuses (generation=%s)", (generation) => {
	let parent: string;
	let home: string;
	let env: NodeJS.ProcessEnv;
	let holder: ReturnType<typeof spawn> | undefined;
	let endpoint: ReturnType<typeof createServer> | undefined;
	let connections: number;

	beforeEach(async () => {
		parent = mkdtempSync(join(tmpdir(), "pij-admin-refusal-"));
		home = join(parent, ".pij");
		mkdirSync(home);
		mkdirSync(join(parent, "bin"));
		connections = 0;
		endpoint = createServer((socket) => {
			connections++;
			socket.destroy();
		});
		endpoint.listen(0, "127.0.0.1");
		await once(endpoint, "listening");
		const address = endpoint.address();
		if (address === null || typeof address === "string") throw new Error("missing private port");
		env = {
			...process.env,
			HOME: parent,
			USERPROFILE: parent,
			PATH: join(parent, "bin"),
			NODE_OPTIONS: "",
			PIJ_HOME: home,
			PIJ_RS_STATE_DIR: join(parent, ".pij-rs"),
			PIJ_RS_ADDR: `127.0.0.1:${address.port}`,
			PIJ_DAEMON_GENERATION: generation,
			PIJ_TELEGRAM_ENV: "",
			PIJ_DAEMON_OWNED: "",
			PIJ_SESSION_ID: "",
			PIJ_ROUTE_DIAGNOSTIC: "",
			TMUX: "",
			TMUX_PANE: "",
			CLAUDE_CONFIG_DIR: join(parent, ".claude"),
			XDG_CONFIG_HOME: join(parent, ".config"),
			CLAUDE_CODE_SESSION_ID: "",
			COPILOT_AGENT_SESSION_ID: "",
			CODEX_THREAD_ID: "",
		};
		// A private inert lock holder, never the test runner or a real daemon.
		// Record stop/restart signals and answer a causal IPC probe after each CLI.
		holder = spawn(
			process.execPath,
			[
				"-e",
				`
			const signals = [];
			for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"])
				process.on(signal, () => signals.push(signal));
			process.on("message", () => process.send(signals));
			process.send("ready");
		`,
			],
			{ cwd: parent, env, stdio: ["ignore", "ignore", "ignore", "ipc"] },
		);
		expect((await once(holder, "message", { signal: AbortSignal.timeout(5_000) }))[0]).toBe(
			"ready",
		);
		writeFileSync(
			join(home, "daemon.lock"),
			JSON.stringify({
				pid: holder.pid,
				startedAt: new Date().toISOString(),
			}),
		);
		writeFileSync(join(home, "registry.ndjson"), "preserved registry\n");
		writeFileSync(join(home, "daemon.log"), "preserved daemon log\n");
	});

	afterEach(async () => {
		if (holder !== undefined && holder.exitCode === null && holder.signalCode === null) {
			const closed = once(holder, "close");
			holder.kill("SIGKILL");
			await closed;
		}
		holder = undefined;
		if (endpoint !== undefined) {
			const closed = once(endpoint, "close");
			endpoint.close();
			await closed;
		}
		endpoint = undefined;
		rmSync(parent, { recursive: true, force: true });
	});

	async function expectRefused(argv: readonly string[], pijHome = home): Promise<void> {
		if (holder === undefined) throw new Error("missing private lock holder");
		const before = homeSnapshot(parent);
		const result = spawnSync(
			process.execPath,
			[TSX_CLI, join(PIJ_ROOT, "cli.ts"), ...argv, "--json"],
			{
				cwd: parent,
				env: { ...env, PIJ_HOME: pijHome },
				encoding: "utf8",
				timeout: 10_000,
			},
		);
		if (result.error) throw result.error;
		expect(result.status).toBe(4);
		expect(result.stderr).toBe("");
		expect(JSON.parse(result.stdout)).toMatchObject({
			ok: false,
			v: 2,
			command: `pij ${argv[0]}`,
			error: "refused",
			details: { code: "E-RS-UNPORTED", verb: argv[0] },
		});
		expect(holder.exitCode).toBeNull();
		expect(holder.signalCode).toBeNull();
		const reply = once(holder, "message", { signal: AbortSignal.timeout(2_000) });
		holder.send("probe");
		expect((await reply)[0]).toEqual([]);
		expect(connections).toBe(0);
		expect(homeSnapshot(parent)).toEqual(before);
	}

	it("refuses fresh-home startup without creating a legacy home", async () => {
		const fresh = join(parent, "fresh", ".pij");
		expect(existsSync(fresh)).toBe(false);
		await expectRefused(["daemon", "start"], fresh);
		expect(existsSync(fresh)).toBe(false);
	});

	it.each(
		[
			["daemon"],
			["daemon", "start"],
			["daemon", "stop"],
			["daemon", "restart"],
			["daemon", "status"],
			["path"],
		].map((argv) => ({ argv })),
	)("refuses $argv without changing legacy files or the live holder", async ({ argv }) => {
		await expectRefused(argv);
	});
});
