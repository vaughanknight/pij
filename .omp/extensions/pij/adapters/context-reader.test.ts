// pij-control-plane — fs ContextReaderPort adapter (plan 054 P2 T007, AC-09).
//
// Per-harness contextCurrent: claude reads its transcript (layout join), pi
// reads the node's own events.ndjson, codex reads the persisted rolloutPath,
// copilot has NO source. Every miss is an HONEST unknown with a provenance
// naming what was attempted — never an estimate.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { transcriptDir } from "../core/harness/claude.js";
import type { SessionDescriptor } from "../core/types.js";
import { FsContextReader } from "./context-reader.js";

const NOW = Date.parse("2026-07-17T03:00:00.000Z");
const NOW_ISO = new Date(NOW).toISOString();

describe("FsContextReader", () => {
	let home: string;
	let pijHome: string;
	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-ctx-home-"));
		pijHome = join(home, ".pij");
		mkdirSync(pijHome, { recursive: true });
	});
	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	function reader(): FsContextReader {
		return new FsContextReader(home, () => NOW);
	}

	function desc(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
		return {
			folder: "/proj",
			dataDir: join(pijHome, over.id),
			eventsPath: join(pijHome, over.id, "events.ndjson"),
			pid: 1,
			startedAt: NOW_ISO,
			...over,
		};
	}

	it("claude: reads the transcript at the layout join and stamps asOf/provenance", () => {
		const dir = transcriptDir(home, "/proj");
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "sess-abc.jsonl"),
			`${JSON.stringify({
				message: {
					role: "assistant",
					usage: {
						input_tokens: 2,
						cache_creation_input_tokens: 282,
						cache_read_input_tokens: 305911,
						output_tokens: 344,
					},
				},
			})}\n`,
		);
		const gauge = reader().current(
			desc({ id: "pij-c", harness: "claude", harnessSessionId: "sess-abc" }),
		);
		expect(gauge).toEqual({ value: 306539, asOf: NOW_ISO, provenance: "claude-transcript" });
	});

	it("claude without a readable transcript is honest-unknown", () => {
		const gauge = reader().current(
			desc({ id: "pij-c", harness: "claude", harnessSessionId: "sess-missing" }),
		);
		expect(gauge.value).toBe("unknown");
		expect(gauge.provenance).toBe("claude-transcript");
	});

	it("pi: reads the node's own events.ndjson assistant usage", () => {
		const d = desc({ id: "pij-p", harness: "pi" });
		mkdirSync(dirname(d.eventsPath), { recursive: true });
		writeFileSync(
			d.eventsPath,
			`${JSON.stringify({
				type: "message",
				data: {
					type: "message_end",
					message: { role: "assistant", usage: { input: 1, output: 2, totalTokens: 619933 } },
				},
			})}\n`,
		);
		expect(reader().current(d)).toEqual({
			value: 619933,
			asOf: NOW_ISO,
			provenance: "pi-events",
		});
	});

	it("a LEGACY descriptor (no harness) rides the pi events path too", () => {
		const d = desc({ id: "pij-l" });
		expect(reader().current(d).provenance).toBe("pi-events");
		expect(reader().current(d).value).toBe("unknown");
	});

	it("codex: reads the persisted rollout path's token tail + never the cumulative total", () => {
		const rollout = join(home, "rollout.jsonl");
		writeFileSync(
			rollout,
			`${JSON.stringify({
				type: "event_msg",
				payload: {
					type: "token_count",
					info: {
						total_token_usage: { input_tokens: 72791190, total_tokens: 72791190 },
						last_token_usage: { input_tokens: 116620, output_tokens: 238 },
						model_context_window: 258400,
					},
				},
			})}\n`,
		);
		const gauge = reader().current(
			desc({ id: "pij-x", harness: "codex", transcriptPath: rollout }),
		);
		expect(gauge).toEqual({ value: 116858, asOf: NOW_ISO, provenance: "codex-rollout" });
	});

	it("codex without a persisted rollout path is honest-unknown", () => {
		expect(reader().current(desc({ id: "pij-x", harness: "codex" }))).toEqual({
			value: "unknown",
			asOf: NOW_ISO,
			provenance: "codex-rollout",
		});
	});

	it("copilot has NO context source — always unknown, provenance says so (AC-09)", () => {
		expect(reader().current(desc({ id: "pij-k", harness: "copilot" }))).toEqual({
			value: "unknown",
			asOf: NOW_ISO,
			provenance: "copilot-none",
		});
	});
});
