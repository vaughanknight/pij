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
	it("exactly one adapter may read the process table, and it is the snapshot module", () => {
		expect(processTableReaders()).toEqual(["process-snapshot.ts"]);
	});

	it("the snapshot module exposes a WHOLE-TABLE capture, not a per-pid probe", () => {
		const source = readFileSync(join(ADAPTERS, "process-snapshot.ts"), "utf8");
		expect(source).toMatch(/ps\s+-Awwo|"-Awwo"/);
		expect(source).not.toMatch(/\b-p\b.*\$\{?pid/);
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
