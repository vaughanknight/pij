import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runLinkGlobal } from "./link-global.js";

const scratch: string[] = [];

function tempDir(prefix: string): string {
	const path = mkdtempSync(join(tmpdir(), prefix));
	scratch.push(path);
	return path;
}

function checkout(names: readonly string[] = ["pij", "todo"]): string {
	const root = tempDir("pij-link-source-");
	mkdirSync(join(root, ".git"), { recursive: true });
	writeFileSync(join(root, "package.json"), JSON.stringify({ name: "pij" }));
	for (const name of names) mkdirSync(join(root, ".pi", "extensions", name), { recursive: true });
	return root;
}

function run(
	root: string,
	home: string,
	args: readonly string[] = [],
): {
	code: number;
	stdout: string[];
	stderr: string[];
} {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const code = runLinkGlobal({
		pijRoot: root,
		home,
		args,
		stdout: (line) => stdout.push(line),
		stderr: (line) => stderr.push(line),
	});
	return { code, stdout, stderr };
}

afterEach(() => {
	for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("link-global", () => {
	it("links the full inventory for Pi, only pij for OMP, and shares Pi MCP config", () => {
		const root = checkout(["pij", "todo", "session-sql"]);
		const home = tempDir("pij-link-home-");
		const piMcp = join(home, ".pi", "agent", "mcp.json");
		mkdirSync(join(home, ".pi", "agent"), { recursive: true });
		writeFileSync(piMcp, "{}\n");

		const result = run(root, home);

		expect(result).toMatchObject({ code: 0, stderr: [] });
		expect(readdirSync(join(home, ".pi", "agent", "extensions")).sort()).toEqual([
			"pij",
			"session-sql",
			"todo",
		]);
		expect(readdirSync(join(home, ".omp", "agent", "extensions"))).toEqual(["pij"]);
		for (const name of ["pij", "session-sql", "todo"]) {
			expect(readlinkSync(join(home, ".pi", "agent", "extensions", name))).toBe(
				join(root, ".pi", "extensions", name),
			);
		}
		expect(readlinkSync(join(home, ".omp", "agent", "extensions", "pij"))).toBe(
			join(root, ".pi", "extensions", "pij"),
		);
		expect(readlinkSync(join(home, ".omp", "agent", "mcp.json"))).toBe(piMcp);
	});

	it("prunes only pij-owned non-pij OMP extension links", () => {
		const root = checkout();
		const oldRoot = checkout();
		const home = tempDir("pij-link-home-");
		const ompExtensions = join(home, ".omp", "agent", "extensions");
		mkdirSync(ompExtensions, { recursive: true });
		symlinkSync(join(oldRoot, ".pi", "extensions", "todo"), join(ompExtensions, "todo"));

		expect(run(root, home).code).toBe(0);
		expect(existsSync(join(ompExtensions, "todo"))).toBe(false);
		expect(readlinkSync(join(ompExtensions, "pij"))).toBe(join(root, ".pi", "extensions", "pij"));
	});

	it("never clobbers a foreign symlink or real directory", () => {
		const root = checkout();
		const home = tempDir("pij-link-home-");
		const foreign = tempDir("foreign-extension-");
		const piExtensions = join(home, ".pi", "agent", "extensions");
		const ompExtensions = join(home, ".omp", "agent", "extensions");
		mkdirSync(piExtensions, { recursive: true });
		mkdirSync(join(ompExtensions, "todo"), { recursive: true });
		symlinkSync(foreign, join(piExtensions, "pij"));

		const result = run(root, home);

		expect(result.code).toBe(1);
		expect(readlinkSync(join(piExtensions, "pij"))).toBe(foreign);
		expect(lstatSync(join(ompExtensions, "todo")).isDirectory()).toBe(true);
		expect(result.stderr.join("\n")).toContain("refusing to replace foreign symlink");
		expect(result.stderr.join("\n")).toContain("real directory");
	});

	it("worktree invocation exits 1 before either machine home changes", () => {
		const canonicalRoot = tempDir("pij-link-canonical-");
		const linkedRoot = tempDir("pij-link-worktree-");
		const gitDir = join(canonicalRoot, ".git", "worktrees", "fixture");
		mkdirSync(gitDir, { recursive: true });
		writeFileSync(join(linkedRoot, ".git"), `gitdir: ${gitDir}\n`);
		const home = tempDir("pij-link-home-");
		const marker = join(home, "marker.txt");
		writeFileSync(marker, "unchanged\n");

		const result = run(linkedRoot, home);

		expect(result.code).toBe(1);
		expect(result.stderr.join("\n")).toContain("linked worktree");
		expect(result.stderr.join("\n")).toContain(`run \`just link\` from ${canonicalRoot}`);
		expect(readFileSync(marker, "utf8")).toBe("unchanged\n");
		expect(existsSync(join(home, ".pi"))).toBe(false);
		expect(existsSync(join(home, ".omp"))).toBe(false);
	});

	it("check-only validates a canonical checkout without touching HOME", () => {
		const root = checkout();
		const home = tempDir("pij-link-home-");
		const result = run(root, home, ["--check-only"]);

		expect(result).toMatchObject({ code: 0, stderr: [] });
		expect(existsSync(join(home, ".pi"))).toBe(false);
		expect(existsSync(join(home, ".omp"))).toBe(false);
	});
});
