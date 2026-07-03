import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agentsDir, resolvePijHome, tmpDir } from "./paths.js";

describe("paths — the single PIJ_HOME resolver", () => {
	describe("resolvePijHome", () => {
		it("honours PIJ_HOME when set", () => {
			expect(resolvePijHome({ PIJ_HOME: "/custom/pij" })).toBe("/custom/pij");
		});

		it("falls back to ~/.pij when PIJ_HOME is unset", () => {
			expect(resolvePijHome({})).toBe(join(homedir(), ".pij"));
		});

		it("treats an empty PIJ_HOME as unset (falls back to ~/.pij)", () => {
			expect(resolvePijHome({ PIJ_HOME: "" })).toBe(join(homedir(), ".pij"));
		});

		it("defaults to process.env when no env is passed", () => {
			// Isolation: set PIJ_HOME on the real env, assert, restore.
			const prev = process.env.PIJ_HOME;
			process.env.PIJ_HOME = "/tmp/pij-home-iso";
			try {
				expect(resolvePijHome()).toBe("/tmp/pij-home-iso");
			} finally {
				if (prev === undefined) delete process.env.PIJ_HOME;
				else process.env.PIJ_HOME = prev;
			}
		});
	});

	describe("agentsDir / tmpDir", () => {
		it("agentsDir is <pijHome>/agents", () => {
			expect(agentsDir("/custom/pij")).toBe(join("/custom/pij", "agents"));
		});

		it("tmpDir is <pijHome>/tmp", () => {
			expect(tmpDir("/custom/pij")).toBe(join("/custom/pij", "tmp"));
		});

		it("composes with resolvePijHome for a fully-isolated home", () => {
			const home = resolvePijHome({ PIJ_HOME: "/iso/home" });
			expect(agentsDir(home)).toBe(join("/iso/home", "agents"));
			expect(tmpDir(home)).toBe(join("/iso/home", "tmp"));
		});
	});
});
