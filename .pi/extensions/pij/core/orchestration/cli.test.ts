import { describe, expect, it } from "vitest";
import { exitCodeForOrchestration, ORCHESTRATION_EXIT, parseOrchestrationArgs } from "./cli.js";

function ok(args: string[]) {
	const parsed = parseOrchestrationArgs(args);
	if (!parsed.ok) throw new Error(`expected ok, got ${parsed.message}`);
	return parsed.command;
}

function err(args: string[]) {
	const parsed = parseOrchestrationArgs(args);
	if (parsed.ok) throw new Error("expected E-ARG");
	return parsed;
}

describe("parseOrchestrationArgs", () => {
	it("parses baton help", () => {
		expect(ok(["baton", "--help"])).toEqual({
			primitive: "baton",
			verb: "help",
			json: false,
		});
	});

	it("parses define with its complete flag set", () => {
		expect(
			ok([
				"baton",
				"define",
				"git-index",
				"--resource",
				"shared git index",
				"--probe",
				"git status --short",
				"--repo",
				"/repo",
				"--json",
			]),
		).toEqual({
			primitive: "baton",
			verb: "define",
			name: "git-index",
			resource: "shared git index",
			probe: "git status --short",
			repo: "/repo",
			json: true,
		});
	});

	it("parses list and show", () => {
		expect(ok(["baton", "list", "--json"])).toEqual({
			primitive: "baton",
			verb: "list",
			json: true,
		});
		expect(ok(["baton", "show", "dotnet"])).toEqual({
			primitive: "baton",
			verb: "show",
			name: "dotnet",
			json: false,
		});
	});

	it("parses a request with purpose, pin, and declared evidence", () => {
		expect(
			ok([
				"baton",
				"request",
				"push-main",
				"--purpose",
				"land phase 1",
				"--pin",
				"abc123",
				"--evidence",
				"commit on main",
				"--json",
			]),
		).toEqual({
			primitive: "baton",
			verb: "request",
			name: "push-main",
			purpose: "land phase 1",
			pin: "abc123",
			evidence: "commit on main",
			json: true,
		});
	});

	it("parses grant, return, and reclaim", () => {
		expect(ok(["baton", "grant", "push-main", "--to", "request-a", "--repin"])).toEqual({
			primitive: "baton",
			verb: "grant",
			name: "push-main",
			requestId: "request-a",
			repin: true,
			json: false,
		});
		expect(ok(["baton", "return", "push-main", "--evidence", "commit abc123"])).toEqual({
			primitive: "baton",
			verb: "return",
			name: "push-main",
			evidence: "commit abc123",
			json: false,
		});
		expect(
			ok(["baton", "reclaim", "push-main", "--evidence", "holder dead; purpose incomplete"]),
		).toEqual({
			primitive: "baton",
			verb: "reclaim",
			name: "push-main",
			evidence: "holder dead; purpose incomplete",
			json: false,
		});
	});

	it.each([
		[[]],
		[["unknown"]],
		[["baton"]],
		[["baton", "frobnicate"]],
		[["baton", "define", "x"]],
		[["baton", "define", "x", "--resource"]],
		[["baton", "list", "extra"]],
		[["baton", "show"]],
		[["baton", "request", "x"]],
		[["baton", "grant", "x"]],
		[["baton", "return"]],
		[["baton", "reclaim", "x"]],
		[["baton", "show", "../escape"]],
		[["baton", "show", "x", "--wat"]],
		[["baton", "list", "--json=true"]],
		[["baton", "grant", "x", "--to", "request-1", "--repin=yes"]],
	])("rejects malformed invocation %j", (args) => {
		expect(err(args).code).toBe("E-ARG");
	});

	it("rejects flags outside their verb", () => {
		expect(err(["baton", "show", "x", "--repin"]).message).toContain("--repin");
		expect(err(["baton", "grant", "x", "--to", "r", "--pin", "sha"]).message).toContain("--pin");
		expect(err(["baton", "list", "--resource", "x"]).message).toContain("--resource");
	});
});

describe("orchestration exit codes", () => {
	it("maps argument errors, firm-guide conflicts, and store failures", () => {
		expect(exitCodeForOrchestration("E-ARG")).toBe(64);
		expect(exitCodeForOrchestration("E-PIN")).toBe(1);
		expect(exitCodeForOrchestration("E-HELD")).toBe(1);
		expect(exitCodeForOrchestration("E-NOBATON")).toBe(1);
		expect(exitCodeForOrchestration("E-NOREQUEST")).toBe(1);
		expect(exitCodeForOrchestration("E-NOLEASE")).toBe(1);
		expect(exitCodeForOrchestration("E-STORE")).toBe(2);
	});

	it("defines an exit mapping for every orchestration error", () => {
		for (const code of Object.keys(ORCHESTRATION_EXIT)) {
			expect(typeof ORCHESTRATION_EXIT[code as keyof typeof ORCHESTRATION_EXIT]).toBe("number");
		}
	});
});
