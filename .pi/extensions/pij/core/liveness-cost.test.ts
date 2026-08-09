// Liveness cost guard (plan 071 D5, T014).
//
// The brief asked for batched liveness — "one `tmux list-panes -a` + one ps
// snapshot per call, never per-row subprocesses". Investigation found there is no
// per-row subprocess to batch: `pij list`/`state` resolve liveness through
// `ProcessPort.isAlive`, whose real adapter is `process.kill(pid, 0)` — a
// syscall, not a fork. Measured cost of `pij list --json` on the live machine is
// ~0.54s wall, effectively all node/tsx startup.
//
// So the honest deliverable is not an optimisation that changes nothing; it is a
// guard that keeps the property true. These tests fail the moment someone
// reintroduces a per-row probe or a subprocess into the read path.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Strip comments before matching source with a pattern.
 *
 *  NOT a nicety, and it bit this file TWICE while s101 widened it: both
 *  `process-states.ts` and its guard were flagged as offenders because each one
 *  QUOTES the per-pid command line it exists to delete. A source-scanning guard
 *  that reads prose cannot distinguish a defect from the documentation explaining
 *  why the defect is gone — so it fires hardest on exactly the files that took
 *  the problem most seriously, and the cheapest way to silence it is to delete
 *  the explanation. Match code, not commentary. */
function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/\/\/[^\n]*/g, "");
}

describe("the list/state read path spawns no subprocesses", () => {
	// Structural, not behavioural: a mocked probe could hide a fork, but an import
	// cannot hide. `core/cli.ts` is where `list`, `state`, and `send` render.
	it("core/cli.ts imports nothing from node:child_process", () => {
		const source = readFileSync(join(HERE, "cli.ts"), "utf8");
		expect(source).not.toMatch(/from\s+"node:child_process"/);
		expect(source).not.toMatch(/require\(\s*["']child_process["']\s*\)/);
	});

	it("the modules the read path leans on are subprocess-free too", () => {
		for (const module of ["state.ts", "discovery.ts", "bind-health.ts", "archive.ts"]) {
			const source = readFileSync(join(HERE, module), "utf8");
			expect(source, `${module} must stay subprocess-free`).not.toMatch(
				/from\s+"node:child_process"/,
			);
		}
	});

	// The real ProcessPort adapter must stay a syscall probe. If someone swaps it
	// for `ps`/`tmux`, liveness silently becomes N forks per listing.
	it("the real ProcessPort probes liveness with a signal, not a command", () => {
		const source = readFileSync(join(HERE, "..", "adapters", "process.ts"), "utf8");
		expect(source).toMatch(/process\.kill\(pid, 0\)/);
		expect(source).not.toMatch(/from\s+"node:child_process"/);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// s095 — KEEPING THE GUARD ABOVE LOAD-BEARING AFTER THE FORK MOVED.
//
// READ THIS BEFORE TRUSTING THE NARROWER FILE LIST ABOVE. Plan 095 added a real
// `ps` for the death sweep's identity-aware liveness probe. It could not go in
// `adapters/process.ts`, because the guard above forbids it there and the guard
// is RIGHT: that adapter is what `pij list` / `pij state` lean on, so a fork
// there is N forks per listing. So the capture went into a NEW file,
// `adapters/process-snapshot.ts`.
//
// That move is correct and it silently narrowed the guard. The file list above
// does not include the new module, so after the move the property "liveness
// never forks per row" was no longer defended anywhere: a future author could
// make the snapshot per-descriptor — ~500 `ps` spawns per 600ms tick at current
// seat population, which stalls the tick and therefore message delivery — and
// every sensor in this repo would stay green.
//
// A check that survives the thing it was watching, by watching where it no
// longer is, is worse than no check: it reports safety it is not measuring.
// These three assertions put the property back under guard. THE NARROWED
// COVERAGE ABOVE IS NOT INTENTIONAL — it is a consequence of the move, and this
// block is the repair.
describe("liveness may fork ONCE PER SWEEP, and only from the one module allowed to", () => {
	const ADAPTERS = join(HERE, "..", "adapters");

	/** Adapters that invoke the process table. Deliberately NOT "adapters that
	 *  fork": eight of them fork, and most are tmux command lines that have
	 *  nothing to do with liveness. The property under guard is narrower and is
	 *  the one that actually costs — WHO MAY ASK THE OS FOR PROCESS FACTS. */
	function processTableReaders(): string[] {
		return readdirSync(ADAPTERS)
			.filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
			.filter((name) => {
				const source = readFileSync(join(ADAPTERS, name), "utf8");
				return /execFileSync\(\s*"ps"|spawnSync\(\s*"ps"|\bpgrep\b|-Awwo/.test(source);
			})
			.sort();
	}

	// ONE module may read the process table. If a second appears, either the
	// snapshot was duplicated or someone reintroduced a per-row probe — both are
	// the regression this file exists to catch, and neither is visible in any
	// behavioural suite because the pure tests are handed a fake table.
	it("only whole-table capture modules may read the process table", () => {
		expect(processTableReaders()).toEqual(["process-snapshot.ts", "process-states.ts"]);
	});

	it("the snapshot module exposes a WHOLE-TABLE capture, not a per-pid probe", () => {
		const source = stripComments(readFileSync(join(ADAPTERS, "process-snapshot.ts"), "utf8"));
		expect(source).toMatch(/ps\s+-Awwo|"-Awwo"/);
		expect(source).not.toMatch(/\b-p\b.*\$\{?pid/);
	});

	it("the state-table module exposes a WHOLE-TABLE capture, not a per-pid probe", () => {
		const source = stripComments(readFileSync(join(ADAPTERS, "process-states.ts"), "utf8"));
		expect(source).toMatch(/"-Ao"/);
		expect(source).not.toMatch(/"-p"/);
	});

	// The structural form of "once per sweep". `reconcileDeaths` runs a LOOP over
	// ~500 descriptors; if it could reach a capture itself, the loop would fork
	// per row and no behavioural test in the pure suite would notice, because the
	// pure suite hands it a fake. Receiving the table as a VALUE is what makes
	// the per-row shape unwritable — this asserts the reconciler never acquires
	// one, which is the property that stays true however the caller changes.
	it("the death reconciler RECEIVES the process table and never captures it", () => {
		const source = readFileSync(join(HERE, "daemon", "death-reconciler.ts"), "utf8");
		expect(source).not.toMatch(/NodeProcessSnapshot|process-snapshot\.js|child_process/);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// s101 (pij#181) — THE SAME NARROWING, ONE DIRECTORY UP, AND IT WAS LIVE.
//
// The block above says it best, about itself:
//
//   "A check that survives the thing it was watching, by watching where it no
//    longer is, is worse than no check: it reports safety it is not measuring."
//
// It then scanned `adapters/` only. `daemon.ts` is not in `adapters/` — it is the
// wiring file at the extension root — and it contained this, inline:
//
//   isSuspended: (pid) => execFileSync("ps", ["-o","state=","-p",String(pid)], …)
//
// A per-pid `ps`, called once per descriptor per tick. On the machine this was
// found on: 625 of 626 hot descriptors carry a `paneId`, so ~625 forks per 600ms
// tick, 26.2% of tick self-time, 100% of `spawn` self time in a V8 profile. THE
// EXACT REGRESSION THE BLOCK ABOVE EXISTS TO CATCH — and all six of its
// assertions were GREEN while it ran (verified 2026-08-09 before the fix landed).
//
// Two independent reasons it was invisible, both worth keeping in mind before
// trusting a source-scanning guard:
//   1. SCOPE. The scan enumerated one directory. The defect was one level up.
//      An enumeration answers only about what it enumerated, and reports the rest
//      as absent — the same shape as `rg` skipping `.pi/` and reading as "not in
//      this repo".
//   2. PATTERN. Even if `daemon.ts` HAD been scanned, the per-pid assertion
//      `/\b-p\b.*\$\{?pid/` requires a literal `$`, so it matches `-p ${pid}` in a
//      template string but NOT `["-p", String(pid)]` — which is how the live
//      defect was written. The guard would have passed on the offending line.
//
// So this block widens the scan to the WHOLE extension and matches the argument
// form structurally rather than by interpolation syntax. It is written to FAIL
// against the pre-fix `daemon.ts`.
describe("no module in the daemon tick path probes the process table PER PID", () => {
	const EXTENSION_ROOT = join(HERE, "..");

	/** Every non-test `.ts` under the extension, recursively — because the defect
	 *  this catches was found in the one file the directory-scoped scan above
	 *  happened not to look at. `node_modules` is excluded; nothing else is. */
	function sourceFiles(dir: string): string[] {
		const out: string[] = [];
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) out.push(...sourceFiles(full));
			else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) out.push(full);
		}
		return out;
	}

	/** Strip comments before matching — see {@link stripComments}. */
	const code = stripComments;

	/** Files that invoke `ps` with a `-p` selector — i.e. ask about ONE pid.
	 *  Matches the argument-array form (`["-o","state=","-p",String(pid)]`) that
	 *  the live defect used, as well as the template and flag-joined forms. */
	function perPidProcessProbes(): string[] {
		const offenders: string[] = [];
		for (const file of sourceFiles(EXTENSION_ROOT)) {
			const source = code(readFileSync(file, "utf8"));
			if (!/(execFileSync|spawnSync|execFile|spawn)\(\s*["']ps["']/.test(source)) continue;
			if (/["']-p["']|-p\s+\$\{|["']ps[^"']*\s-p\s/.test(source)) offenders.push(file);
		}
		return offenders.map((file) => file.slice(EXTENSION_ROOT.length + 1)).sort();
	}

	// EXACTLY this set, asserted as a list rather than a count, so a failure NAMES
	// the file instead of only disagreeing about a number.
	//
	// `cli.ts` is the one legitimate per-pid probe and is listed deliberately
	// rather than excluded by a pattern: `processStartedAtMs` (`cli.ts:1415`) reads
	// `ps -o lstart= -p <pid>` for ONE seat during `pij revive`, to get the one
	// non-recycled identity signal available (an absolute process start instant).
	// It is a single call per command invocation, not a loop over the working set,
	// and it is not on the tick. THE COST THIS FILE GUARDS IS PER-ROW FORKING IN A
	// LOOP, not the existence of `-p` — so the honest guard names the exception and
	// keeps the ban absolute everywhere else, rather than weakening the pattern
	// until the real defect also slips through it.
	it("only the CLI's one-shot revive probe may ask `ps` about a single pid", () => {
		expect(perPidProcessProbes()).toEqual(["cli.ts"]);
	});

	// The scope repair, asserted directly: the recursive walk must actually reach
	// `daemon.ts`. Without this, a future refactor that narrowed `sourceFiles()`
	// would silently restore the blindness this block was written to remove — the
	// guard would keep passing by looking somewhere the defect is not.
	it("the scan reaches daemon.ts, the file the adapters-only scan missed", () => {
		expect(sourceFiles(EXTENSION_ROOT)).toContain(join(EXTENSION_ROOT, "daemon.ts"));
	});

	// The guard must be able to FAIL. A scanner asserted only against a clean tree
	// proves nothing about its own sensitivity — it passes identically when its
	// pattern is broken, which is exactly how the adapters-only scan above stayed
	// green through 625 forks per tick. This feeds it the pre-fix `daemon.ts` line
	// verbatim and requires a catch.
	it("the pattern catches the exact line this stream removed from daemon.ts", () => {
		const preFix = `isSuspended: (pid) => {
			const state = execFileSync("ps", ["-o", "state=", "-p", String(pid)], {
				encoding: "utf8",
			}).trim();
		}`;
		const stripped = code(preFix);
		expect(/(execFileSync|spawnSync|execFile|spawn)\(\s*["']ps["']/.test(stripped)).toBe(true);
		expect(/["']-p["']|-p\s+\$\{|["']ps[^"']*\s-p\s/.test(stripped)).toBe(true);
	});
});
