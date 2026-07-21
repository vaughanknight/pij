// pij orchestration — argv-only git worktree mechanics (plan 061 phase 1).

import { type ExecFileSyncOptions, execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { err, ok, type Result } from "./types.js";

export type WorktreeGitRunner = (args: readonly string[]) => string;

const EXEC_OPTIONS: ExecFileSyncOptions = {
	encoding: "utf8",
	stdio: ["ignore", "pipe", "pipe"],
};

function execGit(args: readonly string[]): string {
	const output = execFileSync("git", args, EXEC_OPTIONS);
	return typeof output === "string" ? output : output.toString("utf8");
}

export interface WorktreeInfo {
	readonly path: string;
	readonly branch: string;
	readonly baseSha: string;
	readonly gitCommonDir: string;
}

export interface ResolvedWorktreeBase {
	readonly baseSha: string;
	readonly gitCommonDir: string;
}

export interface CreateWorktreeInput {
	readonly repoRoot: string;
	readonly path: string;
	readonly branch: string;
	readonly baseRef: string;
}

export interface VerifyWorktreeInput extends WorktreeInfo {}

export interface VerifyWorktreeOptions {
	readonly allowAdvancedHead?: boolean;
}

export interface RemoveWorktreeInput {
	readonly repoRoot: string;
	readonly path: string;
}

export interface PreserveWipInput {
	readonly path: string;
	readonly message: string;
}

function detail(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export class WorktreeManager {
	constructor(private readonly run: WorktreeGitRunner = execGit) {}

	exists(path: string): boolean {
		return existsSync(path);
	}

	resolveBase(repoRoot: string, baseRef: string): Result<ResolvedWorktreeBase> {
		const common = this.gitCommonDir(repoRoot);
		if (!common.ok) return common;
		const resolved = this.git(["-C", repoRoot, "rev-parse", "--verify", `${baseRef}^{commit}`]);
		if (!resolved.ok) {
			return err("E-ARG", `base ref '${baseRef}' does not resolve to a commit`);
		}
		return ok({ baseSha: resolved.value.trim(), gitCommonDir: common.value });
	}

	create(input: CreateWorktreeInput): Result<WorktreeInfo> {
		if (existsSync(input.path)) {
			return err("E-ARG", `worktree destination already exists: ${input.path}`);
		}
		const resolved = this.resolveBase(input.repoRoot, input.baseRef);
		if (!resolved.ok) return resolved;
		const dirty = this.git([
			"-C",
			input.repoRoot,
			"status",
			"--porcelain",
			"--untracked-files=all",
		]);
		if (!dirty.ok) return err("E-NOREG", `cannot inspect source checkout: ${dirty.message}`);
		if (dirty.value.trim() !== "") {
			return err(
				"E-NOREG",
				`source checkout has uncommitted or untracked work — refusing worktree creation: ${input.repoRoot}`,
			);
		}
		const { baseSha, gitCommonDir } = resolved.value;
		const created = this.git([
			"-C",
			input.repoRoot,
			"worktree",
			"add",
			"-b",
			input.branch,
			input.path,
			baseSha,
		]);
		if (!created.ok) {
			return err(
				"E-NOREG",
				`cannot create worktree '${input.path}' on '${input.branch}': ${created.message}`,
			);
		}
		const verified = this.verify({
			path: input.path,
			branch: input.branch,
			baseSha,
			gitCommonDir,
		});
		return verified.ok
			? verified
			: err(verified.code, `worktree was created but verification failed: ${verified.message}`);
	}

	verify(input: VerifyWorktreeInput, options: VerifyWorktreeOptions = {}): Result<WorktreeInfo> {
		if (!existsSync(input.path)) return err("E-NOREG", `worktree path is missing: ${input.path}`);
		const top = this.git(["-C", input.path, "rev-parse", "--show-toplevel"]);
		if (!top.ok) return err("E-NOREG", `worktree path is not a git checkout: ${input.path}`);
		const actualPath = realpathSync(top.value.trim());
		const expectedPath = realpathSync(input.path);
		if (actualPath !== expectedPath) {
			return err(
				"E-NOREG",
				`worktree cwd mismatch: expected ${expectedPath}, git reports ${actualPath}`,
			);
		}
		const branch = this.git(["-C", input.path, "branch", "--show-current"]);
		if (!branch.ok || branch.value.trim() !== input.branch) {
			return err(
				"E-NOREG",
				`worktree branch mismatch: expected '${input.branch}', got '${branch.ok ? branch.value.trim() : "unreadable"}'`,
			);
		}
		const head = this.git(["-C", input.path, "rev-parse", "HEAD"]);
		if (!head.ok) {
			return err("E-NOREG", `worktree SHA is unreadable: ${input.path}`);
		}
		const actualHead = head.value.trim();
		if (actualHead !== input.baseSha && options.allowAdvancedHead !== true) {
			return err(
				"E-NOREG",
				`worktree SHA mismatch: expected '${input.baseSha}', got '${actualHead}'`,
			);
		}
		if (actualHead !== input.baseSha) {
			const ancestor = this.git([
				"-C",
				input.path,
				"merge-base",
				"--is-ancestor",
				input.baseSha,
				"HEAD",
			]);
			if (!ancestor.ok) {
				return err(
					"E-NOREG",
					`worktree base SHA '${input.baseSha}' is not an ancestor of HEAD '${actualHead}'`,
				);
			}
		}
		const common = this.gitCommonDir(input.path);
		if (!common.ok || common.value !== realpathSync(input.gitCommonDir)) {
			return err(
				"E-NOREG",
				`worktree common-dir mismatch: expected '${input.gitCommonDir}', got '${common.ok ? common.value : "unreadable"}'`,
			);
		}
		return ok({
			path: expectedPath,
			branch: input.branch,
			baseSha: input.baseSha,
			gitCommonDir: common.value,
		});
	}

	preserveWip(
		input: PreserveWipInput,
	): Result<{ readonly stashed: boolean; readonly evidence: string }> {
		const status = this.git(["-C", input.path, "status", "--porcelain", "--untracked-files=all"]);
		if (!status.ok) return err("E-NOREG", `cannot inspect worktree WIP: ${status.message}`);
		if (status.value.trim() === "") {
			return ok({ stashed: false, evidence: "worktree clean; no stash needed" });
		}
		const stashed = this.git([
			"-C",
			input.path,
			"stash",
			"push",
			"--include-untracked",
			"--message",
			input.message,
		]);
		if (!stashed.ok) return err("E-NOREG", `cannot preserve worktree WIP: ${stashed.message}`);
		const after = this.git(["-C", input.path, "status", "--porcelain", "--untracked-files=all"]);
		if (!after.ok || after.value.trim() !== "") {
			return err("E-NOREG", `worktree WIP remains after stash: ${input.path}`);
		}
		return ok({
			stashed: true,
			evidence: stashed.value.trim() || `stash created: ${input.message}`,
		});
	}

	safeRemove(input: RemoveWorktreeInput): Result<{ readonly removed: boolean }> {
		if (!existsSync(input.path)) return ok({ removed: false });
		const common = this.gitCommonDir(input.repoRoot);
		if (!common.ok) return common;
		const pathCommon = this.gitCommonDir(input.path);
		if (!pathCommon.ok || pathCommon.value !== common.value) {
			return err("E-NOREG", `worktree '${input.path}' does not belong to ${input.repoRoot}`);
		}
		const status = this.git(["-C", input.path, "status", "--porcelain", "--untracked-files=all"]);
		if (!status.ok) return err("E-NOREG", `cannot inspect worktree WIP: ${status.message}`);
		if (status.value.trim() !== "") {
			return err("E-NOREG", `worktree has uncommitted WIP and will not be removed: ${input.path}`);
		}
		const removed = this.git(["-C", input.repoRoot, "worktree", "remove", input.path]);
		if (!removed.ok) {
			return err("E-NOREG", `cannot remove clean worktree '${input.path}': ${removed.message}`);
		}
		if (existsSync(input.path)) {
			return err("E-NOREG", `git reported removal but worktree still exists: ${input.path}`);
		}
		return ok({ removed: true });
	}

	private gitCommonDir(path: string): Result<string> {
		const result = this.git([
			"-C",
			path,
			"rev-parse",
			"--path-format=absolute",
			"--git-common-dir",
		]);
		if (!result.ok) return err("E-NOREG", `folder is not a git repository: ${path}`);
		try {
			return ok(realpathSync(result.value.trim()));
		} catch (error) {
			return err("E-NOREG", `cannot resolve git common dir for ${path}: ${detail(error)}`);
		}
	}

	private git(args: readonly string[]): Result<string> {
		try {
			return ok(this.run(args));
		} catch (error) {
			return err("E-NOREG", detail(error));
		}
	}
}
