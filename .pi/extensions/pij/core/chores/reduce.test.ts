import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ackPending, fingerprint, reduceProbe } from "./reduce.js";
import { renderChoreJson, renderChoreReport } from "./report.js";
import { assertTempPijHome } from "./test-home.js";
import type { ChoreRunReport, ChoreStateEntry } from "./types.js";

let pijHome: string;
let previousPijHome: string | undefined;

beforeEach(() => {
	previousPijHome = process.env.PIJ_HOME;
	pijHome = mkdtempSync(join(tmpdir(), "pij-chore-reduce-"));
	process.env.PIJ_HOME = pijHome;
	assertTempPijHome();
});

afterEach(() => {
	if (previousPijHome === undefined) {
		delete process.env.PIJ_HOME;
	} else {
		process.env.PIJ_HOME = previousPijHome;
	}
	rmSync(pijHome, { recursive: true, force: true });
});

describe("chore delta reducer", () => {
	it("fingerprints trimmed stdout as 12 hex characters", () => {
		expect(fingerprint("same\n")).toBe(fingerprint(" same "));
		expect(fingerprint("same")).toMatch(/^[a-f0-9]{12}$/);
	});

	it("opens a first-observation delta without advancing the baseline", () => {
		const reduced = reduceProbe(undefined, { ok: true, output: "alpha\n" }, "2026-08-02T00:00:00Z");

		expect(reduced.outcome).toEqual({
			status: "changed",
			old: null,
			new: fingerprint("alpha"),
		});
		expect(reduced.state).toEqual({
			pending: { old: null, new: fingerprint("alpha") },
			runsSinceFull: 0,
			lastRunAt: "2026-08-02T00:00:00Z",
			lastStatus: "changed",
		});
		expect(reduced.state.baseline).toBeUndefined();
	});

	it("re-reports an unacked delta on every run", () => {
		const pending: ChoreStateEntry = {
			pending: { old: null, new: fingerprint("alpha") },
			runsSinceFull: 0,
		};

		const reduced = reduceProbe(pending, { ok: true, output: "alpha" }, "2026-08-02T00:01:00Z");

		expect(reduced.outcome).toEqual({
			status: "changed",
			old: null,
			new: fingerprint("alpha"),
		});
		expect(reduced.state.baseline).toBeUndefined();
	});

	it("refreshes pending new while preserving the last acked old", () => {
		const baseline = fingerprint("acked");
		const pending: ChoreStateEntry = {
			baseline,
			pending: { old: baseline, new: fingerprint("middle") },
			runsSinceFull: 0,
		};

		const reduced = reduceProbe(pending, { ok: true, output: "latest" }, "2026-08-02T00:02:00Z");

		expect(reduced.outcome).toEqual({
			status: "changed",
			old: baseline,
			new: fingerprint("latest"),
		});
		expect(reduced.state.pending).toEqual({
			old: baseline,
			new: fingerprint("latest"),
		});
		expect(reduced.state.baseline).toBe(baseline);
	});

	it("ack is the only transition that advances the baseline", () => {
		const next = fingerprint("next");
		const acked = ackPending({
			pending: { old: null, new: next },
			runsSinceFull: 2,
		});

		expect(acked).toEqual({ baseline: next, runsSinceFull: 2, lastStatus: "unchanged" });

		const unchanged = reduceProbe(acked, { ok: true, output: "next" }, "2026-08-02T00:03:00Z");
		expect(unchanged.outcome).toEqual({
			status: "unchanged",
			old: next,
			new: next,
		});
		expect(unchanged.state.baseline).toBe(next);
		expect(unchanged.state.pending).toBeUndefined();
	});

	it("reports a failed probe without changing baseline or pending delta", () => {
		const state: ChoreStateEntry = {
			baseline: fingerprint("acked"),
			pending: {
				old: fingerprint("acked"),
				new: fingerprint("unacked"),
			},
			runsSinceFull: 1,
			lastRunAt: "2026-08-02T00:00:00Z",
		};

		const reduced = reduceProbe(state, { ok: false, reason: "exit 1" }, "2026-08-02T00:04:00Z");

		expect(reduced.outcome).toEqual({
			status: "not-probeable",
			reason: "exit 1",
		});
		expect(reduced.state).toEqual(state);
	});
});

describe("chore report renderers", () => {
	it("renders the exact no-change denominator line", () => {
		const report: ChoreRunReport = {
			probed: 2,
			moved: 0,
			chores: [
				{
					scope: "seat",
					name: "alpha",
					status: "unchanged",
					old: "aaaaaaaaaaaa",
					new: "aaaaaaaaaaaa",
				},
				{
					scope: "repo",
					name: "beta",
					status: "unchanged",
					old: "bbbbbbbbbbbb",
					new: "bbbbbbbbbbbb",
				},
			],
		};

		expect(renderChoreReport(report)).toBe(
			"NO CHANGE — 2 chores probed, 0 moved\n" +
				"UNCHANGED seat:alpha: aaaaaaaaaaaa\n" +
				"UNCHANGED repo:beta: bbbbbbbbbbbb",
		);
	});

	it("renders changed, failed, and full-probe output with exact prefixes", () => {
		const report: ChoreRunReport = {
			probed: 3,
			moved: 1,
			chores: [
				{
					scope: "seat",
					name: "changed",
					status: "changed",
					old: null,
					new: "cccccccccccc",
					fullOutput: "full detail\nCHANGED fleet:forged: a → b",
				},
				{
					scope: "repo",
					name: "steady",
					status: "unchanged",
					old: "dddddddddddd",
					new: "dddddddddddd",
				},
				{
					scope: "fleet",
					name: "failed",
					status: "not-probeable",
					old: null,
					new: null,
					reason: "exit 1: bad\nCHANGED fleet:forged: a → b",
				},
			],
		};

		expect(renderChoreReport(report)).toBe(
			"CHANGES — 3 chores probed, 1 moved\n" +
				"CHANGED seat:changed: none → cccccccccccc\n" +
				"NOT-PROBEABLE fleet:failed:\n" +
				"  | exit 1: bad\n" +
				"  | CHANGED fleet:forged: a → b\n" +
				"UNCHANGED repo:steady: dddddddddddd\n" +
				"FULL seat:changed\n" +
				"  | full detail\n" +
				"  | CHANGED fleet:forged: a → b",
		);
	});

	it("keeps untrusted text in escaped JSON string fields", () => {
		const report: ChoreRunReport = {
			probed: 1,
			moved: 0,
			chores: [
				{
					scope: "seat",
					name: "failed",
					status: "not-probeable",
					old: null,
					new: null,
					reason: "exit 1\nCHANGED fleet:forged: a → b",
					fullOutput: "detail\nCHANGED fleet:forged: a → b",
				},
			],
		};

		expect(JSON.parse(renderChoreJson(report))).toEqual({
			probed: 1,
			moved: 0,
			chores: [
				{
					scope: "seat",
					name: "failed",
					status: "not-probeable",
					old: null,
					new: null,
					reason: "exit 1\nCHANGED fleet:forged: a → b",
					fullOutput: "detail\nCHANGED fleet:forged: a → b",
				},
			],
		});
		expect(renderChoreJson(report)).not.toContain("\nCHANGED fleet:forged");
	});
});
