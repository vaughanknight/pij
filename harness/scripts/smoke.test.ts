import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadScenario, runScenario } from "../driver/index.js";
import {
	findProjectExtensionEntries,
	renderWatchdogSmokeLines,
	resolveSmokeCommand,
} from "./smoke.js";

vi.mock("../driver/index.js", () => ({
	loadScenario: vi.fn(),
	runScenario: vi.fn(),
}));

const cleanupPaths: string[] = [];

afterEach(() => {
	for (const path of cleanupPaths.splice(0)) {
		rmSync(path, { recursive: true, force: true });
	}
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

describe("renderWatchdogSmokeLines", () => {
	it("keeps the watchdog verdict separate from the known pwsh and OSC baseline reds", () => {
		expect(renderWatchdogSmokeLines({ verdict: "PASS" })).toEqual([
			"watchdog-smoke: green",
			"baseline-red[pwsh]: harness/scripts/release-age-policy.test.ts requires pwsh",
			"baseline-red[OSC]: .pi/extensions/pij/producers/osc-7337-producer.ts has existing Biome findings",
		]);
		expect(renderWatchdogSmokeLines({ verdict: "FAIL", reason: "fire\npath  silent" })[0]).toBe(
			"watchdog-smoke: red — fire path silent",
		);
	});
});

describe("smoke runner imports", () => {
	it("does not execute scenarios when the resolver is imported", () => {
		expect(loadScenario).not.toHaveBeenCalled();
		expect(runScenario).not.toHaveBeenCalled();
	});
});
