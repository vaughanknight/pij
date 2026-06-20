import { describe, expect, it } from "vitest";

import {
	formatContextUsage,
	formatTokens,
	renderPeacockFooter,
	sanitizeFooterText,
	stripAnsiForTest,
	visibleWidthWithoutAnsi,
} from "./ui.js";

const snapshot = {
	cwd: "/Users/jordanknight/pi-hacking/pij",
	branch: "main",
	provider: "github-copilot",
	model: "gpt-5.5",
	modelReasoning: true,
	thinking: "high",
	availableProviderCount: 2,
	contextUsage: { tokens: 240_000, contextWindow: 1_050_000, percent: 22.9 },
	statuses: [
		{ key: "todo", text: "todo: 2 open" },
		{ key: "session-sql", text: "session-sql: ready" },
	],
};

describe("footer text sanitization", () => {
	it("removes newlines, tabs, ANSI escapes, and control characters", () => {
		expect(sanitizeFooterText("todo:\nspoof\t\x1b[31mred\x1b[0m\u0007 ok")).toBe(
			"todo: spoof red ok",
		);
	});
});

describe("token/context formatting", () => {
	it("formats large context windows as human-scale tokens", () => {
		expect(formatTokens(1_050_000)).toBe("1.1M tokens");
		expect(formatContextUsage({ tokens: 240_000, contextWindow: 1_050_000, percent: 22.9 })).toBe(
			"22.9%/1.1M tokens",
		);
	});

	it("omits nullable token counts while keeping the context window", () => {
		expect(formatContextUsage({ tokens: null, contextWindow: 1_050_000, percent: null })).toBe(
			"?/1.1M tokens",
		);
	});
});

describe("renderPeacockFooter", () => {
	it("renders ANSI-wrapped full-width lines without visible overflow", () => {
		for (const width of [1, 2, 20, 80, 140]) {
			const lines = renderPeacockFooter(snapshot, { width, colorHex: "#dd0531" });
			expect(lines.length).toBeGreaterThan(0);
			for (const line of lines) {
				expect(line).toContain("\x1b[48;2;221;5;49m");
				expect(line.endsWith("\x1b[0m")).toBe(true);
				expect(visibleWidthWithoutAnsi(line)).toBe(width);
			}
		}
	});

	it("preserves cwd/branch, model/thinking, context, and sorted statuses when width permits", () => {
		const lines = renderPeacockFooter(snapshot, { width: 140, colorHex: "#61dafb" });
		const plain = lines.map(stripAnsiForTest).join("\n");
		expect(plain).toContain("~/pi-hacking/pij");
		expect(plain).toContain("main");
		expect(plain).toContain("(github-copilot) gpt-5.5 • high");
		expect(plain).toContain("22.9%/1.1M (auto)");
		expect(plain.indexOf("session-sql: ready")).toBeLessThan(plain.indexOf("todo: 2 open"));
	});

	it("sanitizes external snapshot fields before ANSI wrapping", () => {
		const lines = renderPeacockFooter(
			{
				cwd: "repo\nspoof",
				branch: "main\x1b[0mreset",
				provider: "provider\tname",
				model: "model\u0007bell",
				modelReasoning: true,
				thinking: "high",
				availableProviderCount: 2,
				statuses: [{ key: "todo", text: "todo:\nspoof\x1b[0m" }],
			},
			{ width: 100, colorHex: "#1857a4" },
		);
		const plain = lines.map(stripAnsiForTest).join("\n");
		expect(plain).toContain("repo spoof");
		expect(plain).toContain("mainreset");
		expect(plain).toContain("(provider name) modelbell • high");
		expect(plain).toContain("todo: spoof");
		expect(stripAnsiForTest(lines.join(""))).not.toContain("\nspoof");
	});

	it("changes background color only when color is active", () => {
		const [line] = renderPeacockFooter(snapshot, { width: 80, colorHex: "#61dafb" });
		expect(line).toContain("\x1b[48;2;97;218;251m");
		expect(line).not.toContain("\x1b[38;2;");
	});
});

describe("renderPeacockFooter Claude colors", () => {
	it("adds foreground segments without changing visible width", () => {
		for (const width of [20, 80, 140]) {
			const lines = renderPeacockFooter(snapshot, { width, claudeColors: true });
			expect(lines.some((line) => line.includes("\x1b[38;2;"))).toBe(true);
			for (const line of lines) {
				expect(visibleWidthWithoutAnsi(line)).toBe(width);
			}
		}
	});

	it("uses the default-foreground (39) reset so a Peacock background survives", () => {
		const [line] = renderPeacockFooter(snapshot, {
			width: 140,
			colorHex: "#dd0531",
			claudeColors: true,
		});
		expect(line).toContain("\x1b[48;2;221;5;49m");
		expect(line).toContain("\x1b[38;2;");
		expect(line).toContain("\x1b[39m");
		expect(line.endsWith("\x1b[0m")).toBe(true);
	});

	it("colors the context percentage red under high pressure", () => {
		const hot = {
			...snapshot,
			contextUsage: { tokens: 990_000, contextWindow: 1_000_000, percent: 95.4 },
		};
		const lines = renderPeacockFooter(hot, { width: 140, claudeColors: true });
		const statsLine = lines[1] ?? "";
		// #e06c75 -> rgb(224,108,117)
		expect(statsLine).toContain("\x1b[38;2;224;108;117m");
		expect(stripAnsiForTest(statsLine)).toContain("95.4%/1.0M");
	});

	it("leaves output plain when claudeColors is not requested", () => {
		const lines = renderPeacockFooter(snapshot, { width: 80 });
		expect(lines.join("")).not.toContain("\x1b[38;2;");
	});
});
