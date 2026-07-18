import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const PIJ_ROOT = resolve(import.meta.dirname, "..", "..");
const LINK_SCRIPT = join(PIJ_ROOT, "harness", "scripts", "link-global.ts");
const TSX = join(PIJ_ROOT, "node_modules", ".bin", "tsx");
const scratch: string[] = [];

afterEach(() => {
	for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("link-global", () => {
	it("replaces a stale extension symlink with this checkout", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-link-global-"));
		scratch.push(home);
		const targetRoot = join(home, ".pi", "agent", "extensions");
		const target = join(targetRoot, "pij");
		mkdirSync(targetRoot, { recursive: true });
		symlinkSync("/tmp/old-pij-checkout/.pi/extensions/pij", target);

		execFileSync(TSX, [LINK_SCRIPT, "pij"], {
			cwd: PIJ_ROOT,
			env: { ...process.env, HOME: home },
		});

		expect(readlinkSync(target)).toBe(join(PIJ_ROOT, ".pi", "extensions", "pij"));
	});
});
