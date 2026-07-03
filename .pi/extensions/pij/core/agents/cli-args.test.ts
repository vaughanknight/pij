import { describe, expect, it } from "vitest";
import { AGENT_EXIT, coerceParams, exitCodeFor, parseAgentArgs } from "./cli-args.js";

/** Narrow to the ok branch or fail loudly (keeps each assertion terse). */
function ok(args: string[]) {
	const r = parseAgentArgs(args);
	if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.message}`);
	return r.cmd;
}
function err(args: string[]) {
	const r = parseAgentArgs(args);
	if (r.ok) throw new Error("expected error");
	return r;
}

describe("parseAgentArgs — subverbs", () => {
	it("parses list with --json", () => {
		const cmd = ok(["list", "--json"]);
		expect(cmd.subverb).toBe("list");
		expect(cmd.json).toBe(true);
	});

	it("defaults json to false for list", () => {
		expect(ok(["list"]).json).toBe(false);
	});

	it("rejects an unknown subverb", () => {
		expect(err(["frobnicate"]).code).toBe("E-ARG");
	});

	it("rejects an empty arg list", () => {
		expect(err([]).code).toBe("E-ARG");
	});

	it.each(["show", "new", "check", "eject"] as const)("parses %s <slug>", (sub) => {
		const cmd = ok([sub, "flowspace-search"]);
		expect(cmd.subverb).toBe(sub);
		expect(cmd.slug).toBe("flowspace-search");
	});

	it.each(["show", "new", "check", "eject"] as const)("%s needs a slug", (sub) => {
		expect(err([sub]).code).toBe("E-ARG");
	});

	it("list rejects a stray positional", () => {
		expect(err(["list", "extra"]).code).toBe("E-ARG");
	});
});

describe("parseAgentArgs — run (named)", () => {
	it("parses a named run with repeated -p and overrides", () => {
		const cmd = ok([
			"run",
			"flowspace-search",
			"-p",
			"query=daemon stall",
			"-p",
			"limit=20",
			"--model",
			"claude-sonnet-4-6",
			"--effort",
			"low",
			"--harness",
			"claude",
			"--permissions",
			"read-only",
			"--timeout",
			"90",
			"--cwd",
			"/tmp/x",
			"--json",
		]);
		expect(cmd.subverb).toBe("run");
		expect(cmd.slug).toBe("flowspace-search");
		expect(cmd.params).toEqual({ query: "daemon stall", limit: "20" });
		expect(cmd.model).toBe("claude-sonnet-4-6");
		expect(cmd.effort).toBe("low");
		expect(cmd.harness).toBe("claude");
		expect(cmd.permissions).toBe("read-only");
		expect(cmd.timeout).toBe(90);
		expect(cmd.cwd).toBe("/tmp/x");
		expect(cmd.json).toBe(true);
	});

	it("parses --ephemeral on a named run", () => {
		const cmd = ok(["run", "flowspace-search", "--ephemeral"]);
		expect(cmd.ephemeral).toBe(true);
		expect(cmd.prompt).toBeUndefined();
	});

	it("rejects run with neither slug nor --prompt", () => {
		expect(err(["run"]).code).toBe("E-ARG");
	});

	it("rejects run with both slug and --prompt", () => {
		expect(err(["run", "flowspace-search", "--prompt", "hi"]).code).toBe("E-ARG");
	});

	it("rejects -p without an = sign", () => {
		expect(err(["run", "x", "-p", "novalue"]).code).toBe("E-ARG");
	});

	it("accepts an = inside the -p value (only first splits)", () => {
		expect(ok(["run", "x", "-p", "expr=a=b"]).params).toEqual({ expr: "a=b" });
	});

	it("rejects a non-numeric --timeout", () => {
		expect(err(["run", "x", "--timeout", "soon"]).code).toBe("E-ARG");
	});

	it("rejects a flag missing its value", () => {
		expect(err(["run", "x", "--model"]).code).toBe("E-ARG");
	});
});

describe("parseAgentArgs — run (inline)", () => {
	it("parses inline --prompt with no slug", () => {
		const cmd = ok(["run", "--prompt", "List 3 risky TODOs", "--json"]);
		expect(cmd.subverb).toBe("run");
		expect(cmd.slug).toBeUndefined();
		expect(cmd.prompt).toBe("List 3 risky TODOs");
		expect(cmd.promptStdin).toBe(false);
	});

	it("treats --prompt - as a stdin sentinel", () => {
		const cmd = ok(["run", "--prompt", "-"]);
		expect(cmd.promptStdin).toBe(true);
		expect(cmd.prompt).toBeUndefined();
	});

	it("parses --output-schema on inline run", () => {
		const cmd = ok(["run", "--prompt", "hi", "--output-schema", "out.json"]);
		expect(cmd.outputSchema).toBe("out.json");
	});
});

describe("exit-code mapping (AC-09)", () => {
	it("maps user/agent errors to exit 1 and system errors to exit 2", () => {
		expect(exitCodeFor("E-ARG")).toBe(1);
		expect(exitCodeFor("E-NOAGENT")).toBe(1);
		expect(exitCodeFor("E-BADINPUT")).toBe(1);
		expect(exitCodeFor("E-NOADAPTER")).toBe(1);
		expect(exitCodeFor("E-PERMISSION")).toBe(1);
		expect(exitCodeFor("E-RUNFAILED")).toBe(1);
		expect(exitCodeFor("E-HARNESSBIN")).toBe(2);
	});

	it("every code has an exit mapping", () => {
		for (const code of Object.keys(AGENT_EXIT)) {
			expect(typeof AGENT_EXIT[code as keyof typeof AGENT_EXIT]).toBe("number");
		}
	});
});

describe("coerceParams — JSON auto-coercion (minih -p semantics)", () => {
	it("coerces numbers/booleans/json but keeps bare strings", () => {
		expect(coerceParams({ n: "20", b: "true", s: "hello", j: '{"a":1}' })).toEqual({
			n: 20,
			b: true,
			s: "hello",
			j: { a: 1 },
		});
	});
});

describe("parseAgentArgs — spawn (peer mode, Phase 3)", () => {
	it("parses spawn <slug> with repeated -p, --once, and overrides", () => {
		const cmd = ok([
			"spawn",
			"flowspace-search",
			"-p",
			"query=daemon stall",
			"-p",
			"limit=5",
			"--once",
			"--model",
			"claude-sonnet-4-6",
			"--harness",
			"claude",
		]);
		expect(cmd.subverb).toBe("spawn");
		expect(cmd.slug).toBe("flowspace-search");
		expect(cmd.params).toEqual({ query: "daemon stall", limit: "5" });
		expect(cmd.once).toBe(true);
		expect(cmd.model).toBe("claude-sonnet-4-6");
		expect(cmd.harness).toBe("claude");
	});

	it("defaults once to false", () => {
		expect(ok(["spawn", "flowspace-search"]).once).toBe(false);
	});

	it("parses spawn --prompt inline", () => {
		const cmd = ok(["spawn", "--prompt", "watch the build"]);
		expect(cmd.subverb).toBe("spawn");
		expect(cmd.prompt).toBe("watch the build");
		expect(cmd.slug).toBeUndefined();
	});

	it("rejects spawn with neither slug nor --prompt", () => {
		expect(err(["spawn"]).code).toBe("E-ARG");
	});

	it("rejects spawn with both a slug and --prompt", () => {
		expect(err(["spawn", "flowspace-search", "--prompt", "x"]).code).toBe("E-ARG");
	});

	it("rejects a second positional for spawn", () => {
		expect(err(["spawn", "a", "b"]).code).toBe("E-ARG");
	});
});

describe("parseAgentArgs — report (peer mode, Phase 3)", () => {
	it("parses report --json '<payload>' into reportJson (not the boolean json)", () => {
		const cmd = ok(["report", "--json", '{"summary":"done","results":[]}']);
		expect(cmd.subverb).toBe("report");
		expect(cmd.reportJson).toBe('{"summary":"done","results":[]}');
		expect(cmd.json).toBe(false);
	});

	it("rejects report without --json", () => {
		expect(err(["report"]).code).toBe("E-ARG");
	});

	it("rejects report --json with no value", () => {
		expect(err(["report", "--json"]).code).toBe("E-ARG");
	});

	it("rejects a stray positional for report", () => {
		expect(err(["report", "extra", "--json", "{}"]).code).toBe("E-ARG");
	});
});

describe("parseAgentArgs — --once scoping", () => {
	it("rejects --once for a non-spawn subverb", () => {
		expect(err(["run", "flowspace-search", "--once"]).code).toBe("E-ARG");
	});
});

// ─── FX001-3 / SUGG-001: spawn --layout ──────────────────────────────────────
describe("parseAgentArgs --layout", () => {
	it("parses spawn --layout window", () => {
		const cmd = ok(["spawn", "pack-x", "--layout", "window"]);
		expect(cmd.layout).toBe("window");
	});
	it("rejects a bad layout value", () => {
		const r = parseAgentArgs(["spawn", "pack-x", "--layout", "sideways"]);
		expect(r.ok).toBe(false);
	});
	it("rejects --layout outside spawn", () => {
		const r = parseAgentArgs(["run", "pack-x", "--layout", "right"]);
		expect(r.ok).toBe(false);
	});
});
