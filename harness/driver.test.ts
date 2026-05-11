// harness/driver.test.ts
//
// Unit tests for the Driver SDK. Mock node:child_process so we can assert
// the argv arrays the SDK emits without a live tmux. Per spec Clarify Q3,
// node:child_process is the targeted-mock carve-out: argv IS the unit
// under test.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { calls } = vi.hoisted(() => ({ calls: [] as string[][] }));

vi.mock("node:child_process", () => ({
	execFileSync: vi.fn((file: string, args: string[]) => {
		calls.push([file, ...args]);
		if (args[0] === "display-message") return "%5\n";
		if (args[0] === "list-panes") return "%5\t12345\tpi\t0\t200\t50\n";
		if (args[0] === "capture-pane") return "> \n";
		return "";
	}),
}));

beforeEach(() => {
	calls.length = 0;
});

afterEach(() => {
	vi.resetModules();
});

// ─── tmux primitives (TC-01..TC-12) ─────────────────────────────────────────

describe("driver/tmux primitives", () => {
	it("type() uses send-keys -l for literal mode (TC-02)", async () => {
		const { type } = await import("./driver/tmux.js");
		type({ session: "s", paneId: "%5" }, "/scratch list");
		expect(calls.at(-1)).toEqual(["tmux", "send-keys", "-t", "%5", "-l", "/scratch list"]);
	});

	it("press() uses send-keys without -l (TC-02)", async () => {
		const { press } = await import("./driver/tmux.js");
		press({ session: "s", paneId: "%5" }, "Enter");
		expect(calls.at(-1)).toEqual(["tmux", "send-keys", "-t", "%5", "Enter"]);
	});

	it("press() accepts a repeat count (-N)", async () => {
		const { press } = await import("./driver/tmux.js");
		press({ session: "s", paneId: "%5" }, "Down", 3);
		expect(calls.at(-1)).toEqual(["tmux", "send-keys", "-t", "%5", "-N", "3", "Down"]);
	});

	it("paste() uses set-buffer + paste-buffer (TC-03)", async () => {
		const { paste } = await import("./driver/tmux.js");
		paste({ session: "s", paneId: "%5" }, "weird `$payload`");
		const setBuf = calls.at(-2);
		const pasteBuf = calls.at(-1);
		expect(setBuf?.[1]).toBe("set-buffer");
		expect(setBuf).toContain("weird `$payload`");
		expect(pasteBuf?.[1]).toBe("paste-buffer");
		expect(pasteBuf).toContain("%5");
	});

	it("capture() defaults to -p -J (TC-04)", async () => {
		const { capture } = await import("./driver/tmux.js");
		capture({ session: "s", paneId: "%5" });
		expect(calls.at(-1)).toEqual(["tmux", "capture-pane", "-t", "%5", "-p", "-J"]);
	});

	it("capture() with scrollback adds -S/-E (TC-04)", async () => {
		const { capture } = await import("./driver/tmux.js");
		capture({ session: "s", paneId: "%5" }, { scrollback: 2000 });
		const last = calls.at(-1);
		expect(last).toContain("-S");
		expect(last).toContain("-2000");
		expect(last).toContain("-E");
	});

	it("boot() kills prior session, captures pane_id (TC-08, TC-09)", async () => {
		const { boot } = await import("./driver/tmux.js");
		const t = boot({ session: "s", cwd: "/tmp", cmd: "bash" });
		expect(t.paneId).toBe("%5");
		const cmds = calls.map((c) => c[1]);
		expect(cmds).toContain("kill-session");
		expect(cmds).toContain("new-session");
		expect(cmds).toContain("display-message");
		// Geometry defaults to 200×50 (TC-09).
		const newSession = calls.find((c) => c[1] === "new-session");
		expect(newSession).toContain("200");
		expect(newSession).toContain("50");
	});

	it("inspect() parses tab-separated list-panes output (TC-11)", async () => {
		const { inspect } = await import("./driver/tmux.js");
		const info = inspect({ session: "s", paneId: "%5" });
		expect(info.paneId).toBe("%5");
		expect(info.pid).toBe(12345);
		expect(info.cmd).toBe("pi");
		expect(info.dead).toBe(false);
		expect(info.cols).toBe(200);
		expect(info.rows).toBe(50);
	});

	it("hasSession() returns true on success, false on throw", async () => {
		vi.resetModules();
		const cp = await import("node:child_process");
		const execMock = vi.mocked(cp.execFileSync);
		execMock.mockImplementationOnce(() => {
			throw new Error("no such session");
		});
		const { hasSession } = await import("./driver/tmux.js");
		expect(hasSession("missing")).toBe(false);
		expect(hasSession("present")).toBe(true);
	});

	it("targetStr() prefers paneId (%N) over session:window.pane (TC-08)", async () => {
		const { targetStr } = await import("./driver/tmux.js");
		expect(targetStr({ session: "s", paneId: "%7" })).toBe("%7");
		expect(targetStr({ session: "s" })).toBe("s:0.0");
		expect(targetStr({ session: "s", window: 1, pane: 2 })).toBe("s:1.2");
	});
});

// ─── Session (PR-01..PR-09, IA-02/IA-04/IA-08) ─────────────────────────────

describe("driver/session", () => {
	it("Session.run() routes risky payloads to paste (workshop D6)", async () => {
		vi.resetModules();
		const cp = await import("node:child_process");
		const execMock = vi.mocked(cp.execFileSync);
		// list-panes (assertAlive) → alive; capture-pane → prompt with expected match
		execMock.mockImplementation((file: string, args: readonly string[] | undefined) => {
			const argv = Array.from(args ?? []);
			calls.push([file, ...argv]);
			if (argv[0] === "list-panes") return "%5\t12345\tbash\t0\t200\t50\n";
			if (argv[0] === "capture-pane") return "> matched-output\n> ";
			return "";
		});
		const { Session } = await import("./driver/session.js");
		const session = Session.fromTarget({ session: "s", paneId: "%5" });
		const result = await session.run("echo `bad`", /matched-output/, { timeoutMs: 1000 });
		expect(result).toMatch(/matched-output/);
		// `\`` triggers RISKY_PAYLOAD_RE → paste path (set-buffer + paste-buffer), not type (send-keys -l).
		const cmds = calls.map((c) => c[1]);
		expect(cmds).toContain("set-buffer");
		expect(cmds).toContain("paste-buffer");
		expect(cmds).toContain("send-keys"); // for Enter press
	});

	it("Session.run() throws DriverAssertionError when expect never matches", async () => {
		vi.resetModules();
		const cp = await import("node:child_process");
		const execMock = vi.mocked(cp.execFileSync);
		execMock.mockImplementation((file: string, args: readonly string[] | undefined) => {
			const argv = Array.from(args ?? []);
			calls.push([file, ...argv]);
			if (argv[0] === "list-panes") return "%5\t12345\tbash\t0\t200\t50\n";
			if (argv[0] === "capture-pane") return "> never-the-match\n> ";
			return "";
		});
		const { Session } = await import("./driver/session.js");
		const { DriverAssertionError } = await import("./driver/errors.js");
		const session = Session.fromTarget({ session: "s", paneId: "%5" });
		await expect(
			session.run("noop", /WILL-NEVER-MATCH/, { timeoutMs: 500 }),
		).rejects.toBeInstanceOf(DriverAssertionError);
	});

	it("Session.execute('sleep') resolves after the duration", async () => {
		const { Session } = await import("./driver/session.js");
		const session = Session.fromTarget({ session: "s", paneId: "%5" });
		const t0 = Date.now();
		await session.execute({ kind: "sleep", ms: 60 });
		expect(Date.now() - t0).toBeGreaterThanOrEqual(50);
	});

	it("Session.execute('capture') stores named pane in capturedNamed()", async () => {
		vi.resetModules();
		const cp = await import("node:child_process");
		const execMock = vi.mocked(cp.execFileSync);
		execMock.mockImplementation((file: string, args: readonly string[] | undefined) => {
			const argv = Array.from(args ?? []);
			calls.push([file, ...argv]);
			if (argv[0] === "capture-pane") return "POST-COMPACT-PANE\n";
			return "";
		});
		const { Session } = await import("./driver/session.js");
		const session = Session.fromTarget({ session: "s", paneId: "%5" });
		await session.execute({ kind: "capture", name: "post-compact" });
		expect(session.capturedNamed()).toEqual({ "post-compact": "POST-COMPACT-PANE\n" });
	});

	it("Session.waitIdle() returns when output-stable + prompt + no spinner (PR-07)", async () => {
		vi.resetModules();
		const cp = await import("node:child_process");
		const execMock = vi.mocked(cp.execFileSync);
		// Return the SAME idle pane every time — output-stable + prompt + context%, no spinner.
		execMock.mockImplementation((file: string, args: readonly string[] | undefined) => {
			const argv = Array.from(args ?? []);
			calls.push([file, ...argv]);
			if (argv[0] === "capture-pane") return "stuff happened\n50.0%/200K context\n> ";
			return "";
		});
		const { Session } = await import("./driver/session.js");
		const session = Session.fromTarget({ session: "s", paneId: "%5" });
		const pane = await session.waitIdle({ quietMs: 10, timeoutMs: 500 });
		expect(pane).toMatch(/> $/);
	});

	it("Session.waitIdle() throws DriverIdleTimeoutError on spinner that never clears", async () => {
		vi.resetModules();
		const cp = await import("node:child_process");
		const execMock = vi.mocked(cp.execFileSync);
		execMock.mockImplementation((file: string, args: readonly string[] | undefined) => {
			const argv = Array.from(args ?? []);
			calls.push([file, ...argv]);
			if (argv[0] === "capture-pane") return "stuff\n50%/ ctx\n⠋ thinking\n> ";
			return "";
		});
		const { Session } = await import("./driver/session.js");
		const { DriverIdleTimeoutError } = await import("./driver/errors.js");
		const session = Session.fromTarget({ session: "s", paneId: "%5" });
		await expect(session.waitIdle({ quietMs: 5, timeoutMs: 100 })).rejects.toBeInstanceOf(
			DriverIdleTimeoutError,
		);
	});

	it("Session.execute('type') with non-risky text uses send-keys -l + Enter", async () => {
		vi.resetModules();
		const cp = await import("node:child_process");
		const execMock = vi.mocked(cp.execFileSync);
		execMock.mockImplementation((file: string, args: readonly string[] | undefined) => {
			const argv = Array.from(args ?? []);
			calls.push([file, ...argv]);
			return "";
		});
		const { Session } = await import("./driver/session.js");
		const session = Session.fromTarget({ session: "s", paneId: "%5" });
		await session.execute({ kind: "type", text: "/scratch list", press: "Enter" });
		const cmds = calls.map((c) => c[1]);
		// send-keys -l for the text, then send-keys Enter — no set-buffer.
		expect(cmds).toContain("send-keys");
		expect(cmds).not.toContain("set-buffer");
		// First send-keys must carry -l for literal mode.
		const literal = calls.find((c) => c[1] === "send-keys" && c.includes("-l"));
		expect(literal).toBeTruthy();
	});
});
