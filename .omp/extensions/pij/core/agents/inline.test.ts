import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentResult, AgentRunOptions, IAgentAdapter } from "minih";
import { FakeAgentAdapter } from "minih";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runEphemeralPack, runInlineAgent, STALE_TMP_AFTER_MS, sweepStaleTmp } from "./inline.js";
import { tmpDir } from "./paths.js";

let pijHome: string;

const ENVELOPE = JSON.stringify({
	summary: "Inline run said hello.",
	retrospective: {
		workedWell: "The temp pack synthesised fine.",
		confusing: "Nothing was confusing.",
		magicWand: "An upstream ephemeral flag so no temp copy is needed.",
	},
});

const tmpAgents = () => join(tmpDir(pijHome), "agents");

beforeEach(() => {
	pijHome = mkdtempSync(join(tmpdir(), "pij-inline-home-"));
});
afterEach(() => {
	rmSync(pijHome, { recursive: true, force: true });
});

describe("runInlineAgent — leaves nothing on disk (AC-05)", () => {
	it("runs an inline prompt and removes the temp tree on success", async () => {
		const adapter = new FakeAgentAdapter({ output: ENVELOPE });
		const res = await runInlineAgent({ prompt: "Say hi.", adapter, pijHome });

		expect(res.ok).toBe(true);
		if (!res.ok) throw new Error("expected ok");
		// Result comes from memory (parsedReport), not disk.
		expect(res.report?.summary).toBe("Inline run said hello.");

		// The temp agents dir has no leftover pack (and thus no runs/ ledger, no retro).
		expect(readdirSync(tmpAgents())).toEqual([]);
	});

	it("removes the temp tree even when the adapter fails (cleanup on failure)", async () => {
		// An adapter that reports failure (minih's runner converts a thrown/failed
		// adapter into a failed AgentResult rather than propagating). Either way the
		// `finally` must have cleaned up — nothing stranded on disk.
		const failing: IAgentAdapter = {
			run: async (_o: AgentRunOptions): Promise<AgentResult> => ({
				output: "",
				sessionId: "",
				status: "failed",
				exitCode: 1,
				stderr: "adapter boom",
				tokens: null,
			}),
			compact: async () => stub(),
			terminate: async () => stub(),
		};

		await runInlineAgent({ prompt: "boom", adapter: failing, pijHome }).catch(() => undefined);
		// finally still cleaned up — nothing stranded.
		expect(readdirSync(tmpAgents())).toEqual([]);
	});

	it("writes an optional output schema into the synthesized pack", async () => {
		// A recording adapter that snapshots the pack's on-disk contents mid-run.
		let sawSchema = false;
		const spy: IAgentAdapter = {
			run: async (o: AgentRunOptions): Promise<AgentResult> => {
				// o.cwd is the run folder <packDir>/runs/<ts>; the schema is one level up.
				const packDir = join(o.cwd ?? "", "..", "..");
				sawSchema = existsSync(join(packDir, "output-schema.json"));
				return { output: ENVELOPE, sessionId: "s", status: "completed", exitCode: 0, tokens: null };
			},
			compact: async () => stub(),
			terminate: async () => stub(),
		};
		await runInlineAgent({
			prompt: "with schema",
			adapter: spy,
			pijHome,
			outputSchema: { type: "object" },
		});
		expect(sawSchema).toBe(true);
		expect(readdirSync(tmpAgents())).toEqual([]);
	});
});

describe("runEphemeralPack — existing pack via throwaway copy (AC-06/AC-08)", () => {
	/** Write a minimal minih pack (frontmatter + prompt) into `dir`. */
	function writePack(dir: string): void {
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "prompt.md"),
			"---\ndescription: A named pack for ephemeral testing.\n---\nDo the thing.",
		);
	}

	it("runs a named pack and leaves nothing on disk, source pack untouched", async () => {
		const src = mkdtempSync(join(tmpdir(), "pij-pack-src-"));
		const packDir = join(src, "alpha");
		writePack(packDir);
		try {
			const adapter = new FakeAgentAdapter({ output: ENVELOPE });
			const res = await runEphemeralPack({ packDir, slug: "alpha", adapter, pijHome });

			expect(res.ok).toBe(true);
			if (!res.ok) throw new Error("expected ok");
			expect(res.report?.summary).toBe("Inline run said hello.");
			// Temp tree swept clean.
			expect(readdirSync(tmpAgents())).toEqual([]);
			// Source pack never gained a runs/ ledger (KF-07 — no writes to the pack dir).
			expect(readdirSync(packDir).sort()).toEqual(["prompt.md"]);
		} finally {
			rmSync(src, { recursive: true, force: true });
		}
	});

	it("cleans up even when the adapter fails", async () => {
		const src = mkdtempSync(join(tmpdir(), "pij-pack-src-"));
		const packDir = join(src, "beta");
		writePack(packDir);
		const failing: IAgentAdapter = {
			run: async (_o: AgentRunOptions): Promise<AgentResult> => ({
				output: "",
				sessionId: "",
				status: "failed",
				exitCode: 1,
				stderr: "adapter boom",
				tokens: null,
			}),
			compact: async () => stub(),
			terminate: async () => stub(),
		};
		try {
			await runEphemeralPack({ packDir, slug: "beta", adapter: failing, pijHome }).catch(
				() => undefined,
			);
			expect(readdirSync(tmpAgents())).toEqual([]);
			expect(readdirSync(packDir).sort()).toEqual(["prompt.md"]);
		} finally {
			rmSync(src, { recursive: true, force: true });
		}
	});
});

describe("sweepStaleTmp — crash-leftover sweep (AC-05)", () => {
	it("returns [] when the tmp dir does not exist (no throw)", () => {
		expect(sweepStaleTmp(pijHome)).toEqual([]);
	});

	it("sweeps a planted stale tree but keeps a fresh one", () => {
		mkdirSync(tmpAgents(), { recursive: true });
		const stale = join(tmpAgents(), "inline-stale");
		const fresh = join(tmpAgents(), "inline-fresh");
		mkdirSync(stale, { recursive: true });
		mkdirSync(fresh, { recursive: true });
		writeFileSync(join(stale, "prompt.md"), "x");
		writeFileSync(join(fresh, "prompt.md"), "y");
		// Age the stale dir past the threshold.
		const old = new Date(Date.now() - STALE_TMP_AFTER_MS - 60_000);
		utimesSync(stale, old, old);

		const swept = sweepStaleTmp(pijHome);
		expect(swept).toEqual(["inline-stale"]);
		expect(existsSync(stale)).toBe(false);
		expect(existsSync(fresh)).toBe(true);
	});

	it("sweeps aged trees when they exceed a small maxAgeMs", () => {
		mkdirSync(join(tmpAgents(), "a"), { recursive: true });
		mkdirSync(join(tmpAgents(), "b"), { recursive: true });
		// Age both a second into the past so the threshold is unambiguous.
		const past = new Date(Date.now() - 1000);
		utimesSync(join(tmpAgents(), "a"), past, past);
		utimesSync(join(tmpAgents(), "b"), past, past);
		const swept = sweepStaleTmp(pijHome, { maxAgeMs: 100 }).sort();
		expect(swept).toEqual(["a", "b"]);
		expect(readdirSync(tmpAgents())).toEqual([]);
	});
});

function stub(): AgentResult {
	return { output: "", sessionId: "", status: "completed", exitCode: 0, tokens: null };
}
