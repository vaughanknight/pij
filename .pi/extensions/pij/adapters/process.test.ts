import { afterEach, describe, expect, it } from "vitest";
import { NodeProcess } from "./process.js";
import { NodeProcessSnapshot, parseProcessRow } from "./process-snapshot.js";

describe("NodeProcess", () => {
	const proc = new NodeProcess();

	it("pid() is this process", () => {
		expect(proc.pid()).toBe(process.pid);
	});

	it("isAlive(): own pid alive, bogus pid dead", () => {
		expect(proc.isAlive(process.pid)).toBe(true);
		// 2^31-ish pid that will not exist on a test host
		expect(proc.isAlive(2147483646)).toBe(false);
	});

	it("now() is a recent epoch ms", () => {
		const t = proc.now();
		expect(t).toBeGreaterThan(1_700_000_000_000);
		expect(Math.abs(Date.now() - t)).toBeLessThan(1000);
	});

	describe("env()", () => {
		afterEach(() => {
			delete process.env.PIJ_TEST_VAR;
		});
		it("reads a set var and returns undefined for an unset one", () => {
			process.env.PIJ_TEST_VAR = "alice";
			expect(proc.env("PIJ_TEST_VAR")).toBe("alice");
			expect(proc.env("PIJ_DEFINITELY_UNSET_VAR")).toBeUndefined();
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// s095 — the process-table capture. The classifier is pure and table-tested in
// `core/state.test.ts`; what is tested here is the OS seam feeding it, because
// a perfectly-tested ladder fed a mis-parsed table is still wrong.
describe("NodeProcessSnapshot — the once-per-sweep process table", () => {
	const snapshots = new NodeProcessSnapshot();
	it("parses a real `ps -Awwo pid=,ppid=,lstart=,command=` row", () => {
		const info = parseProcessRow(
			"44535   65242 Sat  8 Aug 00:20:51 2026 node /opt/copilot/bin/copilot --yolo --session-id abc",
		);
		expect(info).toMatchObject({
			pid: 44535,
			ppid: 65242,
			command: "node /opt/copilot/bin/copilot --yolo --session-id abc",
		});
		expect(info?.truncated).toBeUndefined();
	});

	// A row we cannot split is REPORTED, not dropped. Dropping it would silently
	// shrink the table, and a smaller table is indistinguishable from a smaller
	// machine — which is how "unreadable" becomes "not there".
	it("keeps a row whose command could not be read, flagged rather than dropped", () => {
		const info = parseProcessRow("  952   1 ");
		expect(info).toMatchObject({ pid: 952, ppid: 1, truncated: true });
	});

	it("captures the live process table with this very process in it", () => {
		const snapshot = snapshots.capture();
		expect(snapshot.ok).toBe(true);
		if (!snapshot.ok) return;
		expect(snapshot.processes.length).toBeGreaterThan(1);
		expect(snapshot.processes.some((p) => p.pid === process.pid)).toBe(true);
	});

	// `-ww` is mandatory: a truncated command line is missing evidence, and the
	// liveness ladder is only allowed to say `absent` from evidence it has read.
	// This asserts the capture is actually wide by finding a command longer than
	// any plausible terminal width, which the running vitest process supplies.
	it("captures command lines wider than a terminal", () => {
		const snapshot = snapshots.capture();
		if (!snapshot.ok) return;
		const self = snapshot.processes.find((p) => p.pid === process.pid);
		expect(self?.command.length).toBeGreaterThan(80);
	});
});
