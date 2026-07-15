import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { findTranscriptPath, type TranscriptListing, transcriptLayout } from "./transcript.js";

// A listing whose flat/deep return DISTINCT marker paths, so a test can prove
// which one a layout chose (claude → flat, codex → deep).
const listing: TranscriptListing = {
	flat: (dir) => [`${dir}/flat-a.jsonl`],
	deep: (dir) => [`${dir}/2026/06/28/rollout-x-uuid.jsonl`],
};

describe("transcriptLayout — claude (today's behaviour, byte-unchanged — Finding 03)", () => {
	const L = transcriptLayout("claude");

	it("dir is the cwd-scoped claude project dir", () => {
		expect(L.dir("/Users/jo", "/Users/jo/pi-hacking/pij")).toBe(
			"/Users/jo/.claude/projects/-Users-jo-pi-hacking-pij",
		);
	});

	it("list is FLAT (claude's project dir also holds nested sub-session jsonl that must NOT be listed)", () => {
		expect(L.list(listing, "/d")).toEqual(["/d/flat-a.jsonl"]);
	});

	it("sessionIdOf is the transcript STEM (today's discovery id)", () => {
		expect(L.sessionIdOf("/d/a83382a0-aed1-4264-9573.jsonl")).toBe("a83382a0-aed1-4264-9573");
	});
});

describe("transcriptLayout — codex (date-nested global tree — Finding 02/06)", () => {
	const L = transcriptLayout("codex");

	it("dir is the GLOBAL sessions root, ignoring cwd (the cwd lives inside the file)", () => {
		expect(L.dir("/Users/jo", "/Users/jo/pi-hacking/pij")).toBe("/Users/jo/.codex/sessions");
	});

	it("list is DEEP (recurses the YYYY/MM/DD tree)", () => {
		expect(L.list(listing, "/d")).toEqual(["/d/2026/06/28/rollout-x-uuid.jsonl"]);
	});

	it("sessionIdOf is the trailing UUID, NOT the stem (Finding 06)", () => {
		expect(
			L.sessionIdOf("/x/rollout-2026-06-28T15-33-30-019f0cb7-f65c-76f1-bb38-c96269590118.jsonl"),
		).toBe("019f0cb7-f65c-76f1-bb38-c96269590118");
	});
});

describe("transcriptLayout — copilot/pi default to the claude (flat, cwd-scoped) layout", () => {
	it("copilot binds deterministically, so its inert default remains claude's", () => {
		expect(transcriptLayout("copilot").list(listing, "/d")).toEqual(["/d/flat-a.jsonl"]);
	});
});

describe("transcriptLayout — pi real session locator", () => {
	it("resolves a real default-layout fixture by native session id", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-pi-transcript-"));
		try {
			const cwd = "/Users/jo/proj";
			const dir = join(home, ".pi", "agent", "sessions", "--Users-jo-proj--");
			const path = join(dir, "2026-07-15T00-00-00.000Z_native-session-1.jsonl");
			mkdirSync(dir, { recursive: true });
			writeFileSync(path, '{"type":"session","id":"native-session-1"}\n');
			const realListing: TranscriptListing = {
				flat: (target) =>
					readdirSync(target)
						.filter((name) => name.endsWith(".jsonl"))
						.map((name) => join(target, name)),
				deep: () => [],
			};

			const layout = transcriptLayout("pi");
			expect(layout.dir(home, cwd)).toBe(dir);
			expect(findTranscriptPath(layout, realListing, dir, "native-session-1")).toBe(path);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("uses the PI_CODING_AGENT_SESSION_DIR override for real path resolution", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-pi-transcript-override-"));
		const previous = process.env.PI_CODING_AGENT_SESSION_DIR;
		try {
			const override = join(home, "isolated-sessions");
			const path = join(override, "2026-07-15T00-00-00.000Z_native-session-2.jsonl");
			mkdirSync(override, { recursive: true });
			writeFileSync(path, '{"type":"session","id":"native-session-2"}\n');
			process.env.PI_CODING_AGENT_SESSION_DIR = override;
			const realListing: TranscriptListing = {
				flat: (target) =>
					readdirSync(target)
						.filter((name) => name.endsWith(".jsonl"))
						.map((name) => join(target, name)),
				deep: () => [],
			};

			const layout = transcriptLayout("pi", {
				piSessionDir: process.env.PI_CODING_AGENT_SESSION_DIR,
			});
			expect(layout.dir(home, "/ignored")).toBe(override);
			expect(findTranscriptPath(layout, realListing, override, "native-session-2")).toBe(path);
		} finally {
			if (previous === undefined) delete process.env.PI_CODING_AGENT_SESSION_DIR;
			else process.env.PI_CODING_AGENT_SESSION_DIR = previous;
			rmSync(home, { recursive: true, force: true });
		}
	});
});
