import { describe, expect, it } from "vitest";
import { parseSource } from "./scorecard.js";

describe("parseSource", () => {
	it("npm: bare", () => {
		expect(parseSource("npm:pi-lean-ctx")).toEqual({ platform: "npm", name: "pi-lean-ctx" });
	});
	it("npm: scoped", () => {
		expect(parseSource("npm:@scope/pkg")).toEqual({ platform: "npm", name: "@scope/pkg" });
	});
	it("npm: versioned", () => {
		expect(parseSource("npm:pi-lean-ctx@1.2.3")).toEqual({ platform: "npm", name: "pi-lean-ctx" });
	});
	it("https github with .git", () => {
		expect(parseSource("https://github.com/nicobailon/pi-mcp-adapter.git")).toEqual({
			platform: "github.com",
			owner: "nicobailon",
			name: "pi-mcp-adapter",
		});
	});
	it("git: prefix + github + ref", () => {
		expect(parseSource("git:https://github.com/hasit/pi-community-themes@v0.3.0")).toEqual({
			platform: "github.com",
			owner: "hasit",
			name: "pi-community-themes",
		});
	});
	it("git: prefix github short form", () => {
		expect(parseSource("git:github.com/ghoseb/pi-askuserquestion")).toEqual({
			platform: "github.com",
			owner: "ghoseb",
			name: "pi-askuserquestion",
		});
	});
	it("local path → null", () => {
		expect(parseSource("./local/path")).toBeNull();
	});
});
