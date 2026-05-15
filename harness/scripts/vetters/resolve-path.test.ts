import { describe, expect, it } from "vitest";
import { parsePiListOutput, resolveSourcePath } from "./resolve-path.js";

const SAMPLE = `\x1B[1mUser packages:\x1B[22m
  https://github.com/foo/bar.git
\x1B[2m    /home/u/.pi/agent/git/github.com/foo/bar\x1B[22m
  npm:my-pkg
\x1B[2m    /home/u/.npm-global/lib/node_modules/my-pkg\x1B[22m

\x1B[1mProject packages:\x1B[22m
  https://github.com/foo/bar.git
\x1B[2m    /home/u/proj/.pi/git/github.com/foo/bar\x1B[22m
  npm:my-pkg
\x1B[2m    /home/u/proj/.pi/npm/node_modules/my-pkg\x1B[22m
`;

describe("parsePiListOutput", () => {
	it("parses both scopes with ANSI escapes stripped", () => {
		const entries = parsePiListOutput(SAMPLE);
		expect(entries).toHaveLength(4);
		const user = entries.filter((e) => e.scope === "user");
		const project = entries.filter((e) => e.scope === "project");
		expect(user).toHaveLength(2);
		expect(project).toHaveLength(2);
		expect(project[0]).toEqual({
			source: "https://github.com/foo/bar.git",
			path: "/home/u/proj/.pi/git/github.com/foo/bar",
			scope: "project",
		});
	});

	it("empty input → empty array", () => {
		expect(parsePiListOutput("")).toEqual([]);
	});

	it("input without sections → empty array", () => {
		expect(parsePiListOutput("just some other text\nnothing here\n")).toEqual([]);
	});
});

describe("resolveSourcePath", () => {
	const entries = parsePiListOutput(SAMPLE);

	it("prefers project scope when both exist", () => {
		expect(resolveSourcePath("npm:my-pkg", entries)).toBe(
			"/home/u/proj/.pi/npm/node_modules/my-pkg",
		);
	});

	it("falls back to user scope when only that exists", () => {
		const userOnly = parsePiListOutput(
			"\x1B[1mUser packages:\x1B[22m\n  npm:foo\n\x1B[2m    /u/foo\x1B[22m\n",
		);
		expect(resolveSourcePath("npm:foo", userOnly)).toBe("/u/foo");
	});

	it("returns null when source not in list", () => {
		expect(resolveSourcePath("npm:nonexistent", entries)).toBeNull();
	});
});
