import { describe, expect, it } from "vitest";

import { parseCommand } from "./commands.js";

describe("parseCommand — status (empty / help)", () => {
	it("treats empty args as status", () => {
		expect(parseCommand("")).toEqual({ kind: "status" });
	});
	it("treats whitespace-only args as status", () => {
		expect(parseCommand("   ")).toEqual({ kind: "status" });
	});
	it("treats 'help' as status", () => {
		expect(parseCommand("help")).toEqual({ kind: "status" });
	});
	it("is case-insensitive on the verb", () => {
		expect(parseCommand("HELP")).toEqual({ kind: "status" });
	});
});

describe("parseCommand — list", () => {
	it("parses 'list'", () => {
		expect(parseCommand("list")).toEqual({ kind: "list" });
	});
	it("ignores trailing whitespace", () => {
		expect(parseCommand("  list  ")).toEqual({ kind: "list" });
	});
});

describe("parseCommand — watch", () => {
	it("parses a dir + one glob", () => {
		expect(parseCommand("watch scratch/x **/*.md")).toEqual({
			kind: "watch",
			dir: "scratch/x",
			patterns: ["**/*.md"],
		});
	});
	it("parses a dir + multiple globs", () => {
		expect(parseCommand("watch docs **/*.md **/*.ts")).toEqual({
			kind: "watch",
			dir: "docs",
			patterns: ["**/*.md", "**/*.ts"],
		});
	});
	it("strips surrounding double quotes from tokens", () => {
		expect(parseCommand('watch "src dir" "**/*.md"')).toEqual({
			kind: "watch",
			dir: "src dir",
			patterns: ["**/*.md"],
		});
	});
	it("strips surrounding single quotes from tokens", () => {
		expect(parseCommand("watch docs '**/*.md'")).toEqual({
			kind: "watch",
			dir: "docs",
			patterns: ["**/*.md"],
		});
	});
	it("errors when no pattern is given", () => {
		const r = parseCommand("watch docs");
		expect(r.kind).toBe("error");
	});
	it("errors when neither dir nor pattern is given", () => {
		const r = parseCommand("watch");
		expect(r.kind).toBe("error");
	});
});

describe("parseCommand — stop", () => {
	it("parses 'stop <dir>'", () => {
		expect(parseCommand("stop docs")).toEqual({ kind: "stop", dir: "docs" });
	});
	it("strips quotes from the dir", () => {
		expect(parseCommand('stop "src dir"')).toEqual({ kind: "stop", dir: "src dir" });
	});
	it("errors when no dir is given", () => {
		const r = parseCommand("stop");
		expect(r.kind).toBe("error");
	});
});

describe("parseCommand — unknown verb", () => {
	it("errors on an unrecognised subcommand", () => {
		const r = parseCommand("frobnicate now");
		expect(r.kind).toBe("error");
	});
});

describe("parseCommand — surplus tokens (list/help lenient, stop strict)", () => {
	it("ignores tokens after 'list'", () => {
		expect(parseCommand("list extra junk")).toEqual({ kind: "list" });
	});
	it("ignores tokens after 'help'", () => {
		expect(parseCommand("help me please")).toEqual({ kind: "status" });
	});
	it("errors on surplus tokens after 'stop <dir>' (exact arity)", () => {
		expect(parseCommand("stop docs and more").kind).toBe("error");
	});
});

describe("parseCommand — malformed quotes", () => {
	it("errors on an unterminated double quote", () => {
		expect(parseCommand('watch docs "**/*.md').kind).toBe("error");
	});
	it("errors on an unterminated single quote", () => {
		expect(parseCommand("stop 'docs").kind).toBe("error");
	});
});
