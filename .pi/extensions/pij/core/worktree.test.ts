import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorktreeManager } from "./worktree.js";

const roots: string[] = [];

function git(cwd: string, args: readonly string[]): string {
	return execFileSync("git", ["-C", cwd, ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function repository(): { root: string; main: string } {
	const root = mkdtempSync(join(tmpdir(), "pij-worktree-"));
	roots.push(root);
	const main = join(root, "main");
	git(root, ["init", "--quiet", main]);
	git(main, ["config", "user.email", "pij@example.test"]);
	git(main, ["config", "user.name", "pij test"]);
	writeFileSync(join(main, "README.md"), "initial\n");
	git(main, ["add", "README.md"]);
	git(main, ["commit", "--quiet", "-m", "initial"]);
	return { root, main };
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("WorktreeManager — AC-01 refusal matrix", () => {
	it("creates from a base SHA resolved at create-time and verifies branch/SHA/common-dir", () => {
		const { root, main } = repository();
		const path = join(root, "s061-team-scaffold");
		const baseSha = git(main, ["rev-parse", "HEAD"]);
		const result = new WorktreeManager().create({
			repoRoot: main,
			path,
			branch: "s061/team-scaffold",
			baseRef: "HEAD",
		});
		expect(result).toEqual({
			ok: true,
			value: {
				path: realpathSync(path),
				branch: "s061/team-scaffold",
				baseSha,
				gitCommonDir: realpathSync(join(main, ".git")),
			},
		});
		expect(git(path, ["rev-parse", "HEAD"])).toBe(baseSha);
		expect(git(path, ["branch", "--show-current"])).toBe("s061/team-scaffold");
	});

	it("refuses an existing destination before invoking worktree add", () => {
		const { root, main } = repository();
		const path = join(root, "already-here");
		mkdirSync(path);
		const result = new WorktreeManager().create({
			repoRoot: main,
			path,
			branch: "s061/existing",
			baseRef: "HEAD",
		});
		expect(result).toMatchObject({ ok: false, code: "E-ARG" });
		if (!result.ok) expect(result.message).toMatch(/already exists/i);
		expect(git(main, ["branch", "--list", "s061/existing"])).toBe("");
	});

	it("refuses a dirty source checkout", () => {
		const { root, main } = repository();
		writeFileSync(join(main, "README.md"), "dirty\n");
		const result = new WorktreeManager().create({
			repoRoot: main,
			path: join(root, "dirty-refused"),
			branch: "s061/dirty",
			baseRef: "HEAD",
		});
		expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
		if (!result.ok) expect(result.message).toMatch(/dirty|uncommitted/i);
		expect(existsSync(join(root, "dirty-refused"))).toBe(false);
	});

	it("refuses a bad base ref with a named E-ARG and creates nothing", () => {
		const { root, main } = repository();
		const path = join(root, "bad-base");
		const result = new WorktreeManager().create({
			repoRoot: main,
			path,
			branch: "s061/bad-base",
			baseRef: "does-not-exist",
		});
		expect(result).toMatchObject({ ok: false, code: "E-ARG" });
		if (!result.ok) expect(result.message).toContain("does-not-exist");
		expect(existsSync(path)).toBe(false);
	});

	it("refuses a non-repository cwd", () => {
		const root = mkdtempSync(join(tmpdir(), "pij-worktree-nonrepo-"));
		roots.push(root);
		const result = new WorktreeManager().create({
			repoRoot: root,
			path: join(root, "child"),
			branch: "s061/nonrepo",
			baseRef: "HEAD",
		});
		expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
		if (!result.ok) expect(result.message).toMatch(/git repository/i);
	});

	it("verify refuses a branch or SHA mismatch", () => {
		const { root, main } = repository();
		const path = join(root, "verified");
		const created = new WorktreeManager().create({
			repoRoot: main,
			path,
			branch: "s061/verified",
			baseRef: "HEAD",
		});
		if (!created.ok) throw new Error(created.message);
		const wrongBranch = new WorktreeManager().verify({
			...created.value,
			branch: "s061/other",
		});
		expect(wrongBranch).toMatchObject({ ok: false, code: "E-NOREG" });
		const wrongSha = new WorktreeManager().verify({
			...created.value,
			baseSha: "deadbeef",
		});
		expect(wrongSha).toMatchObject({ ok: false, code: "E-NOREG" });
	});

	it("safeRemove refuses WIP and removes a clean linked worktree", () => {
		const { root, main } = repository();
		const path = join(root, "removable");
		const manager = new WorktreeManager();
		const created = manager.create({
			repoRoot: main,
			path,
			branch: "s061/removable",
			baseRef: "HEAD",
		});
		if (!created.ok) throw new Error(created.message);
		writeFileSync(join(path, "wip.txt"), "never destroy me\n");
		const refused = manager.safeRemove({ repoRoot: main, path });
		expect(refused).toMatchObject({ ok: false, code: "E-NOREG" });
		if (!refused.ok) expect(refused.message).toMatch(/WIP|uncommitted/i);
		expect(existsSync(join(path, "wip.txt"))).toBe(true);
		rmSync(join(path, "wip.txt"));
		expect(manager.safeRemove({ repoRoot: main, path })).toEqual({
			ok: true,
			value: { removed: true },
		});
		expect(existsSync(path)).toBe(false);
	});
});
