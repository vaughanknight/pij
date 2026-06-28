import { describe, expect, it } from "vitest";

import { type TranscriptListing, transcriptLayout } from "./transcript.js";

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
	it("they bind deterministically (no discovery), so the inert default is claude's", () => {
		expect(transcriptLayout("copilot").list(listing, "/d")).toEqual(["/d/flat-a.jsonl"]);
		expect(transcriptLayout("pi").dir("/Users/jo", "/Users/jo/proj")).toBe(
			"/Users/jo/.claude/projects/-Users-jo-proj",
		);
	});
});
