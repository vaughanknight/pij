import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composerText, parseProbeArgs, runProbe, transcriptTexts } from "./step-on-probe.js";

const border = "─".repeat(80);
describe("step-on probe evidence boundary", () => {
	it.each([
		"omp",
		"claude",
	] as const)("extracts only the %s composer, not a quoted draft", (harness) => {
		const draft = "UNSUBMITTED keep  two spaces π";
		const gap = harness === "claude" ? "\u00a0" : " ";
		expect(
			composerText(
				harness,
				`Transcript repeats wrong draft\n${border}\n❯${gap}${draft}\n${border}\nstatus`,
			),
		).toBe(draft);
		expect(composerText(harness, `${border}\nquoted draft\n${border}`)).toBeUndefined();
		expect(composerText(harness, "Accessing workspace: Yes, I trust this folder")).toBeUndefined();
	});
	it.each([
		"omp",
		"claude",
		"copilot",
	] as const)("preserves %s leading/trailing draft spaces using the paired cursor", (harness) => {
		const draft = " UNSUBMITTED keep  spaces ";
		const top = harness === "copilot" ? `╻${"▄".repeat(80)}` : border;
		const bottom = harness === "copilot" ? `╹${"▀".repeat(80)}` : border;
		const prefix = harness === "copilot" ? "┃ " : harness === "claude" ? "❯\u00a0" : "❯ ";
		const viewport = `${top}\n${prefix}${draft}${" ".repeat(20)}\n${bottom}`;
		const cursor = { x: prefix.length + draft.length, y: 1 };
		expect(composerText(harness, viewport, cursor)).toBe(draft);
		expect(composerText(harness, viewport, { ...cursor, x: cursor.x + 1 })).toBe(`${draft} `);
		expect(composerText(harness, viewport, { ...cursor, y: 0 })).toBeUndefined();
		expect(
			composerText(harness, `${top}\n${prefix}${draft}EXTRA\n${bottom}`, cursor),
		).toBeUndefined();
	});
	it("requires a bounded real-resource observation and an explicit fallback mode", () => {
		expect(() => parseProbeArgs(["--observe-ms", "0"])).toThrow();
		expect(() => parseProbeArgs(["--harness", "fake"])).toThrow();
		expect(() => parseProbeArgs(["--send-keys-only", "true"])).toThrow();
		expect(parseProbeArgs(["--harness", "claude", "--send-keys-only", "true"]).sendKeysOnly).toBe(
			true,
		);
	});
	it("distinguishes custom model context from human submission and ignores partial rows", () => {
		const root = mkdtempSync(join(tmpdir(), "step-on-transcript-"));
		const path = join(root, "events.jsonl");
		try {
			writeFileSync(
				path,
				[
					JSON.stringify({ type: "custom_message", customType: "pij", content: "peer nonce" }),
					JSON.stringify({
						type: "message",
						message: { role: "user", content: [{ type: "text", text: "human draft" }] },
					}),
					JSON.stringify({ type: "assistant.message", data: { content: "model reply" } }),
					'{"type":"partial',
				].join("\n"),
			);
			expect(transcriptTexts([path], ["custom"])).toEqual(["peer nonce"]);
			expect(transcriptTexts([path], ["user"])).toEqual(["human draft"]);
			expect(transcriptTexts([path], ["assistant"])).toEqual(["model reply"]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

// Explicit opt-in only: launches real clients/daemon/tmux and spends provider tokens.
describe.skipIf(process.env.PIJ_STEP_ON_REAL !== "1")("real-client draft safety", () => {
	for (const harness of ["omp", "claude", "copilot"] as const) {
		it(`${harness} receives without changing or submitting the draft`, async () => {
			const result = await runProbe(parseProbeArgs(["--harness", harness]));
			const receipt = JSON.parse(readFileSync(result.output, "utf8"));
			expect(receipt.error, result.output).toBeUndefined();
			expect(receipt.verdict, result.output).toMatchObject({
				draft_intact: true,
				message_reached_model: true,
				draft_submitted: false,
			});
			expect(receipt.verdict.delivered_within_ms, result.output).toBeLessThanOrEqual(5000);
			expect(result.code, result.output).toBe(0);
		}, 240_000);
	}
	it("retains the gate when socket discovery is unavailable", async () => {
		const result = await runProbe(
			parseProbeArgs(["--harness", "claude", "--send-keys-only", "true"]),
		);
		const receipt = JSON.parse(readFileSync(result.output, "utf8"));
		expect(receipt.error, result.output).toBeUndefined();
		expect(receipt.verdict, result.output).toMatchObject({
			transport_rung: "typed-body",
			draft_intact: true,
			message_reached_model: false,
			draft_submitted: false,
		});
		expect(result.code, result.output).toBe(0);
	}, 240_000);
});
