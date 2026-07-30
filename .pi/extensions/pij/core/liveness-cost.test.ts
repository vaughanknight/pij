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

import { readFileSync } from "node:fs";
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
