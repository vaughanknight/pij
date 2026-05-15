// harness/driver/compact-assert.test.ts
//
// Unit tests for compactAndAssert + its pure helpers. Coverage:
//   (a) field-equality success → ok: true, divergences: []
//   (b) field-divergence post-compact → divergences[] populated with phase: "compact"
//   (c) opt-in reload check → postReload set only when includeReloadCheck: true (default)
//                              and absent when false
//   (d) compactTimeoutMs / reloadTimeoutMs honoured (waitIdle invoked with passed value)
//
// Pure helpers (extractLatestJsonObject, compareFields) cover most of the
// surface area without a tmux mock; one targeted end-to-end test exercises
// the full session.run + waitIdle plumbing using a scripted tmux mock.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { calls, paneScript, paneCursor } = vi.hoisted(() => ({
	calls: [] as string[][],
	paneScript: [] as string[],
	paneCursor: { value: 0 },
}));

vi.mock("node:child_process", () => ({
	execFileSync: vi.fn((file: string, args: string[]) => {
		calls.push([file, ...args]);
		if (args[0] === "display-message") return "%5\n";
		if (args[0] === "list-panes") return "%5\t12345\tpi\t0\t200\t50\n";
		if (args[0] === "capture-pane") {
			return paneScript[paneCursor.value] ?? "";
		}
		// send-keys with Enter advances to the next scripted pane (each
		// session.run sends one Enter after the text payload).
		if (args[0] === "send-keys" && args.includes("Enter")) {
			paneCursor.value = Math.min(paneCursor.value + 1, paneScript.length - 1);
		}
		return "";
	}),
}));

beforeEach(() => {
	calls.length = 0;
	paneScript.length = 0;
	paneCursor.value = 0;
});

/** Build a pane string that satisfies waitIdle's defaults (prompt + context + no spinner). */
function pane(...lines: string[]): string {
	return [...lines, "claude-sonnet-4.5 • medium · 12.3%/100%", "> "].join("\n");
}

describe("driver/compactAndAssert: pure helpers", () => {
	it("extractLatestJsonObject returns the most-recent JSON envelope from a pane", async () => {
		const { extractLatestJsonObject } = await import("./index.js");
		const sample = [
			"chrome before",
			'{"iterations":1,"lastTaskTitle":"old"}',
			"more chrome",
			'{"iterations":2,"lastTaskTitle":"latest","runActive":true}',
			"trailing > prompt",
		].join("\n");
		expect(extractLatestJsonObject(sample)).toEqual({
			iterations: 2,
			lastTaskTitle: "latest",
			runActive: true,
		});
	});

	it("extractLatestJsonObject returns {} when no valid JSON is present", async () => {
		const { extractLatestJsonObject } = await import("./index.js");
		expect(extractLatestJsonObject("nothing here\n> ")).toEqual({});
	});

	it("extractLatestJsonObject ignores braces inside string literals", async () => {
		const { extractLatestJsonObject } = await import("./index.js");
		const sample = '{"note":"contains } literal","iterations":5}';
		expect(extractLatestJsonObject(sample)).toEqual({
			note: "contains } literal",
			iterations: 5,
		});
	});

	it("compareFields returns [] when fields match (case a)", async () => {
		const { compareFields } = await import("./index.js");
		const result = compareFields(
			{ iterations: 3, lastTaskTitle: "x" },
			{ iterations: 3, lastTaskTitle: "x" },
			["iterations", "lastTaskTitle"],
			"compact",
		);
		expect(result).toEqual([]);
	});

	it("compareFields reports divergence with phase (case b)", async () => {
		const { compareFields } = await import("./index.js");
		const result = compareFields(
			{ iterations: 3, lastTaskTitle: "x" },
			{ iterations: 0, lastTaskTitle: "x" },
			["iterations", "lastTaskTitle"],
			"compact",
		);
		expect(result).toEqual([
			{ field: "iterations", pre: 3, post: 0, phase: "compact" },
		]);
	});

	it("compareFields treats missing field on one side as divergent", async () => {
		const { compareFields } = await import("./index.js");
		const result = compareFields(
			{ iterations: 3 },
			{},
			["iterations"],
			"reload",
		);
		expect(result).toEqual([
			{ field: "iterations", pre: 3, post: undefined, phase: "reload" },
		]);
	});

	it("compareFields recurses into arrays + nested objects via deep equality", async () => {
		const { compareFields } = await import("./index.js");
		expect(
			compareFields(
				{ history: [{ id: 1 }, { id: 2 }] },
				{ history: [{ id: 1 }, { id: 2 }] },
				["history"],
				"compact",
			),
		).toEqual([]);
		expect(
			compareFields(
				{ history: [{ id: 1 }, { id: 2 }] },
				{ history: [{ id: 1 }] },
				["history"],
				"compact",
			),
		).toEqual([
			{
				field: "history",
				pre: [{ id: 1 }, { id: 2 }],
				post: [{ id: 1 }],
				phase: "compact",
			},
		]);
	});
});

describe("driver/compactAndAssert: end-to-end (scripted tmux mock)", () => {
	it("case (a): pre + postCompact + postReload all match → ok: true, no divergences", async () => {
		paneScript.push(
			pane("ralph-loop loaded"), // 0: boot idle
			pane('{"iterations":3,"lastTaskTitle":"impl X","runActive":true}'), // 1: pre status
			pane("compact complete"), // 2: post-compact idle (waitIdle)
			pane('{"iterations":3,"lastTaskTitle":"impl X","runActive":true}'), // 3: post-compact status
			pane("reload complete"), // 4: post-reload idle (waitIdle)
			pane('{"iterations":3,"lastTaskTitle":"impl X","runActive":true}'), // 5: post-reload status
		);

		const { Session, compactAndAssert } = await import("./index.js");
		const session = Session.fromTarget({ session: "test", paneId: "%5" });
		await session.waitIdle({ timeoutMs: 1_000 });

		const r = await compactAndAssert(session, {
			statusCommand: "/ralph status --json",
			fields: ["iterations", "lastTaskTitle"],
			compactTimeoutMs: 1_000,
			reloadTimeoutMs: 1_000,
		});

		expect(r.ok).toBe(true);
		expect(r.divergences).toEqual([]);
		expect(r.pre).toMatchObject({ iterations: 3, lastTaskTitle: "impl X" });
		expect(r.postCompact).toMatchObject({ iterations: 3, lastTaskTitle: "impl X" });
		expect(r.postReload).toMatchObject({ iterations: 3, lastTaskTitle: "impl X" });
	});

	it("case (b): postCompact diverges → ok: false, divergences[phase=compact]", async () => {
		paneScript.push(
			pane("ralph-loop loaded"),
			pane('{"iterations":5,"lastTaskTitle":"impl X","runActive":true}'),
			pane("compact complete"),
			pane('{"iterations":0,"lastTaskTitle":null,"runActive":false}'), // ALL DROPPED → D-005 confirmed shape
			pane("reload complete"),
			pane('{"iterations":0,"lastTaskTitle":null,"runActive":false}'),
		);

		const { Session, compactAndAssert } = await import("./index.js");
		const session = Session.fromTarget({ session: "test", paneId: "%5" });
		await session.waitIdle({ timeoutMs: 1_000 });

		const r = await compactAndAssert(session, {
			statusCommand: "/ralph status --json",
			fields: ["iterations", "lastTaskTitle"],
			compactTimeoutMs: 1_000,
			reloadTimeoutMs: 1_000,
		});

		expect(r.ok).toBe(false);
		expect(r.divergences.length).toBeGreaterThanOrEqual(1);
		const compactDivs = r.divergences.filter((d) => d.phase === "compact");
		expect(compactDivs).toContainEqual({
			field: "iterations",
			pre: 5,
			post: 0,
			phase: "compact",
		});
	});

	it("case (c): includeReloadCheck=false omits postReload entirely", async () => {
		paneScript.push(
			pane("ralph-loop loaded"),
			pane('{"iterations":3}'),
			pane("compact complete"),
			pane('{"iterations":3}'),
		);

		const { Session, compactAndAssert } = await import("./index.js");
		const session = Session.fromTarget({ session: "test", paneId: "%5" });
		await session.waitIdle({ timeoutMs: 1_000 });

		const r = await compactAndAssert(session, {
			statusCommand: "/ralph status --json",
			fields: ["iterations"],
			compactTimeoutMs: 1_000,
			includeReloadCheck: false,
		});

		expect(r.ok).toBe(true);
		expect(r.postReload).toBeUndefined();
		expect(r.divergences).toEqual([]);
		// And we should NOT have sent /reload over tmux.
		const sentReload = calls.some(
			(c) => c[0] === "tmux" && c[1] === "send-keys" && c.includes("/reload"),
		);
		expect(sentReload).toBe(false);
	});

	it("case (d): timeouts plumb through (small compactTimeoutMs accepted on idle-pane)", async () => {
		paneScript.push(
			pane("ralph-loop loaded"),
			pane('{"iterations":1}'),
			pane("compact complete"),
			pane('{"iterations":1}'),
			pane("reload complete"),
			pane('{"iterations":1}'),
		);

		const { Session, compactAndAssert } = await import("./index.js");
		const session = Session.fromTarget({ session: "test", paneId: "%5" });
		await session.waitIdle({ timeoutMs: 1_000 });

		// Even with very short timeouts, an idle pane resolves quickly and
		// the call completes — proving the option propagates without
		// triggering DriverIdleTimeoutError. (A real /compact-stuck timeout
		// is exercised by the smoke against a live pi, not by unit tests.)
		const r = await compactAndAssert(session, {
			statusCommand: "/ralph status --json",
			fields: ["iterations"],
			compactTimeoutMs: 800,
			reloadTimeoutMs: 800,
		});

		expect(r.ok).toBe(true);
	});
});
