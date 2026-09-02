import type { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadScenario, runScenario } from "../driver/index.js";
import { findProjectExtensionEntries, resolveSmokeCommand, runWatchdogSmoke } from "./smoke.js";

vi.mock("../driver/index.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../driver/index.js")>();
	return {
		...actual,
		loadScenario: vi.fn(),
		runScenario: vi.fn(),
	};
});

const cleanupPaths: string[] = [];

afterEach(() => {
	for (const path of cleanupPaths.splice(0)) {
		rmSync(path, { recursive: true, force: true });
	}
	vi.unstubAllEnvs();
});

describe("runWatchdogSmoke", () => {
	it("passes scrubbed identity and safe routing to the watchdog subprocess", () => {
		vi.stubEnv("PIJ_SESSION_ID", "pij-real-worker");
		vi.stubEnv("CLAUDE_CODE_SESSION_ID", "real-claude-session");
		delete process.env.PIJ_DAEMON_GENERATION;
		let childEnv: NodeJS.ProcessEnv | undefined;
		const spawn = ((
			_file: string,
			_args: readonly string[],
			options: { readonly env?: NodeJS.ProcessEnv },
		) => {
			childEnv = options.env;
			return { status: 0, stdout: '{"verdict":"PASS"}', stderr: "" };
		}) as unknown as typeof spawnSync;

		expect(runWatchdogSmoke(spawn)).toEqual({ verdict: "PASS" });
		expect(childEnv?.PIJ_SESSION_ID).toBe("");
		expect(childEnv?.CLAUDE_CODE_SESSION_ID).toBe("");
		expect(childEnv?.PIJ_DAEMON_GENERATION).toBe("legacy");
		expect(childEnv?.PATH).toBe(process.env.PATH);
	});
});

describe("resolveSmokeCommand", () => {
	it("sorts and safely quotes every supplied project-local extension", () => {
		expect(
			resolveSmokeCommand({}, [
				"/workspace/z-last/index.ts",
				"/workspace/author's/index.ts",
				"/workspace/a first/index.ts",
			]),
		).toBe(
			`pi --approve --no-extensions --extension '/workspace/a first/index.ts' --extension '/workspace/author'"'"'s/index.ts' --extension '/workspace/z-last/index.ts'`,
		);
	});

	it("preserves an explicit scenario command byte-for-byte", () => {
		const command = "custom-pi  --flag='two words'  ";

		expect(resolveSmokeCommand({ cmd: command }, ["/ignored/index.ts"])).toBe(command);
	});
});

describe("findProjectExtensionEntries", () => {
	it("returns the complete sorted top-level index inventory without a machine-specific root", () => {
		const root = mkdtempSync(join(tmpdir(), "pij-smoke-inventory-"));
		cleanupPaths.push(root);
		const extensionsRoot = join(root, ".pi", "extensions");
		const expected = [
			join(extensionsRoot, "a first", "index.ts"),
			join(extensionsRoot, "author's", "index.ts"),
			join(extensionsRoot, "z-last", "index.ts"),
		].sort();

		for (const path of expected) {
			mkdirSync(join(path, ".."), { recursive: true });
			writeFileSync(path, "export default () => {};\n");
		}
		mkdirSync(join(extensionsRoot, "missing-index"), { recursive: true });
		mkdirSync(join(extensionsRoot, "nested", "child"), { recursive: true });
		writeFileSync(
			join(extensionsRoot, "nested", "child", "index.ts"),
			"export default () => {};\n",
		);

		expect(findProjectExtensionEntries(extensionsRoot)).toEqual(expected);
	});
});

describe("smoke runner imports", () => {
	it("does not execute scenarios when the resolver is imported", () => {
		expect(loadScenario).not.toHaveBeenCalled();
		expect(runScenario).not.toHaveBeenCalled();
	});
});
