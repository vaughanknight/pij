// Fresh-home bootstrap regression (pij#118, plan 092).
//
// The defect is INVISIBLE on any developer machine: `~/.pij` already exists, so
// the daemon's very first write — the single-instance lock — succeeds. On a
// fresh install it does not, and the daemon dies with `ENOENT … daemon.lock`
// before it can report anything useful. These cases therefore drive `runDaemon`
// against a home that provably does not exist yet: the `existsSync(...) === false`
// assertion BEFORE the call is what makes each case a test rather than a
// tautology (`mkdtempSync` creates its directory, which would pre-satisfy the bug).

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

describe("runDaemon — first-run home bootstrap", () => {
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
			// No `pijHome` option: this exercises the env resolution path a real
			// `pij daemon` start takes, not just the injected test seam.
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
		// invariant is AGREEMENT: whatever the daemon picks as its home, every
		// reader must independently resolve the same path, or the CLI looks for
		// a registry the daemon is not writing. So this asserts the daemon's
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
// pij#169 — every PIJ_HOME surface agrees
//
// `core/agents/paths.ts` called itself "the one place that computes" PIJ_HOME
// while seven sites still inlined `process.env.PIJ_HOME ?? join(homedir(),
// ".pij")`. The inlined form and the resolver disagreed on exactly one input —
// a SET-but-EMPTY PIJ_HOME — and a partial sweep would have RELOCATED that
// disagreement onto a pair that currently agrees (a daemon writing ~/.pij while
// the CLI reads ./). Hence: all seven, proven together.
// ---------------------------------------------------------------------------

/** Extension root — this test lives at `.pi/extensions/pij/`. */
const PIJ_ROOT = dirname(fileURLToPath(import.meta.url));

/** The seven sites of pij#169, keyed by file (cli.ts holds two of them), each
 *  with the relative specifier its depth requires under NodeNext ESM. */
const SWEPT_SITES: readonly { readonly file: string; readonly specifier: string }[] = [
	{ file: "daemon.ts", specifier: "./core/agents/paths.js" },
	{ file: "cli.ts", specifier: "./core/agents/paths.js" },
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

describe("PIJ_HOME resolves identically at every surface (pij#169)", () => {
	describe("no surface re-derives it", () => {
		for (const { file, specifier } of SWEPT_SITES) {
			it(`${file} calls resolvePijHome() instead of inlining`, () => {
				const source = readFileSync(join(PIJ_ROOT, file), "utf8");
				// Count rather than assert-absent: a file with two sites (cli.ts)
				// must lose BOTH, and "0 remaining" is the only reading of that
				// which cannot be satisfied by a partial edit.
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
