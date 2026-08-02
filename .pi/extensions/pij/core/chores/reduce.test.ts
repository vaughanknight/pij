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
			status: "changed-value",
			old: null,
			new: "alpha\n",
			oldFingerprint: null,
			newFingerprint: fingerprint("alpha"),
		});
		expect(reduced.state).toEqual({
			pending: {
				old: null,
				new: fingerprint("alpha"),
				oldValue: null,
				newValue: "alpha\n",
			},
			runsSinceFull: 0,
			lastRunAt: "2026-08-02T00:00:00Z",
			lastStatus: "changed",
		});
		expect(reduced.state.baseline).toBeUndefined();
	});

	it("re-reports an unacked delta on every run", () => {
		const pending: ChoreStateEntry = {
			pending: {
				old: null,
				new: fingerprint("alpha"),
				oldValue: null,
				newValue: "alpha",
			},
			runsSinceFull: 0,
		};

		const reduced = reduceProbe(pending, { ok: true, output: "alpha" }, "2026-08-02T00:01:00Z");

		expect(reduced.outcome).toEqual({
			status: "changed-value",
			old: null,
			new: "alpha",
			oldFingerprint: null,
			newFingerprint: fingerprint("alpha"),
		});
		expect(reduced.state.baseline).toBeUndefined();
	});

	it("refreshes pending new while preserving the last acked old", () => {
		const baseline = fingerprint("acked");
		const pending: ChoreStateEntry = {
			baseline,
			baselineValue: "acked",
			pending: {
				old: baseline,
				new: fingerprint("middle"),
				oldValue: "acked",
				newValue: "middle",
			},
			runsSinceFull: 0,
		};

		const reduced = reduceProbe(pending, { ok: true, output: "latest" }, "2026-08-02T00:02:00Z");

		expect(reduced.outcome).toEqual({
			status: "changed-value",
			old: "acked",
			new: "latest",
			oldFingerprint: baseline,
			newFingerprint: fingerprint("latest"),
		});
		expect(reduced.state.pending).toEqual({
			old: baseline,
			new: fingerprint("latest"),
			oldValue: "acked",
			newValue: "latest",
		});
		expect(reduced.state.baseline).toBe(baseline);
	});

	it("ack is the only transition that advances the baseline", () => {
		const next = fingerprint("next");
		const acked = ackPending({
			pending: {
				old: null,
				new: next,
				oldValue: null,
				newValue: "next",
			},
			runsSinceFull: 2,
		});

		expect(acked).toEqual({
			baseline: next,
			baselineValue: "next",
			runsSinceFull: 2,
			lastStatus: "unchanged",
		});

		const unchanged = reduceProbe(acked, { ok: true, output: "next" }, "2026-08-02T00:03:00Z");
		expect(unchanged.outcome).toEqual({
			status: "unchanged",
			old: "next",
			new: "next",
			oldFingerprint: next,
			newFingerprint: next,
		});
		expect(unchanged.state.baseline).toBe(next);
		expect(unchanged.state.pending).toBeUndefined();
	});

	it("keeps a pending delta as a flap when the sampled value returns to the baseline", () => {
		const baseline = fingerprint("A");
		const state: ChoreStateEntry = {
			baseline,
			baselineValue: "A",
			pending: {
				old: baseline,
				new: fingerprint("B"),
				oldValue: "A",
				newValue: "B",
			},
			runsSinceFull: 0,
		};

		const reduced = reduceProbe(state, { ok: true, output: "A" }, "2026-08-02T00:03:30Z");

		expect(reduced.outcome).toEqual({
			status: "flapped",
			old: "A",
			new: "A",
			oldFingerprint: baseline,
			newFingerprint: baseline,
		});
		expect(reduced.state.pending).toEqual({
			old: baseline,
			new: baseline,
			oldValue: "A",
			newValue: "A",
		});
		expect(reduced.state.lastStatus).toBe("changed");
	});

	it("resets the baseline distinctly when the probe definition changes", () => {
		const baseline = fingerprint("old");
		const reduced = reduceProbe(
			{
				baseline,
				baselineValue: "old",
				definitionFingerprint: fingerprint("printf old"),
				instrumentFingerprint: null,
				runsSinceFull: 2,
			},
			{ ok: true, output: "new" },
			"2026-08-02T00:03:45Z",
			{
				definitionFingerprint: fingerprint("printf new"),
				contentFingerprint: null,
			},
		);

		expect(reduced.outcome).toEqual({
			status: "changed-probe",
			reason: "instrument changed; ack resets baseline",
			new: "new",
			newFingerprint: fingerprint("new"),
		});
		expect(reduced.state).toMatchObject({
			baseline,
			baselineValue: "old",
			definitionFingerprint: fingerprint("printf new"),
			instrumentFingerprint: null,
			pendingInstrumentChange: {
				currentValue: "new",
				currentFingerprint: fingerprint("new"),
			},
			lastStatus: "changed",
		});
		expect(reduced.state.pending).toBeUndefined();
		expect(ackPending(reduced.state)).toMatchObject({
			baseline: fingerprint("new"),
			baselineValue: "new",
			lastStatus: "unchanged",
		});
	});

	it("preserves an open value delta across an instrument change until ack", () => {
		const baseline = fingerprint("A");
		const pending = {
			old: baseline,
			new: fingerprint("B"),
			oldValue: "A",
			newValue: "B",
		};
		const reduced = reduceProbe(
			{
				baseline,
				baselineValue: "A",
				definitionFingerprint: fingerprint("printf old"),
				instrumentFingerprint: null,
				pending,
				runsSinceFull: 0,
			},
			{ ok: true, output: "C" },
			"2026-08-02T00:03:50Z",
			{
				definitionFingerprint: fingerprint("printf new"),
				contentFingerprint: null,
			},
		);

		expect(reduced.outcome).toMatchObject({
			status: "changed-probe",
			preservedValueDelta: {
				old: "A",
				new: "B",
				oldFingerprint: baseline,
				newFingerprint: fingerprint("B"),
			},
		});
		expect(reduced.state.pending).toEqual(pending);
		expect(reduced.state.baseline).toBe(baseline);
		expect(ackPending(reduced.state)).toMatchObject({
			baseline: fingerprint("C"),
			baselineValue: "C",
		});
	});

	it("reports a failed probe without changing baseline or pending delta", () => {
		const state: ChoreStateEntry = {
			baseline: fingerprint("acked"),
			baselineValue: "acked",
			pending: {
				old: fingerprint("acked"),
				new: fingerprint("unacked"),
				oldValue: "acked",
				newValue: "unacked",
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
					old: "alpha",
					new: "alpha",
					oldFingerprint: "aaaaaaaaaaaa",
					newFingerprint: "aaaaaaaaaaaa",
				},
				{
					scope: "repo",
					name: "beta",
					status: "unchanged",
					old: "beta",
					new: "beta",
					oldFingerprint: "bbbbbbbbbbbb",
					newFingerprint: "bbbbbbbbbbbb",
				},
			],
		};

		expect(renderChoreReport(report)).toBe(
			"NO CHANGE — 2 chores probed, 0 moved\n" +
				"UNCHANGED seat:alpha fingerprint=aaaaaaaaaaaa\n" +
				"  | alpha\n" +
				"UNCHANGED repo:beta fingerprint=bbbbbbbbbbbb\n" +
				"  | beta",
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
					status: "changed-value",
					old: null,
					new: "new value\nCHANGED-VALUE fleet:forged: a → b",
					oldFingerprint: null,
					newFingerprint: "cccccccccccc",
					fullConfigured: true,
					fullOutput: "full detail\nCHANGED-VALUE fleet:forged: a → b",
				},
				{
					scope: "repo",
					name: "steady",
					status: "unchanged",
					old: "steady",
					new: "steady",
					oldFingerprint: "dddddddddddd",
					newFingerprint: "dddddddddddd",
				},
				{
					scope: "fleet",
					name: "failed",
					status: "not-probeable",
					old: null,
					new: null,
					oldFingerprint: null,
					newFingerprint: null,
					reason: "exit 1: bad\nCHANGED-VALUE fleet:forged: a → b",
				},
			],
		};

		expect(renderChoreReport(report)).toBe(
			"CHANGES — 3 chores probed, 1 moved\n" +
				"CHANGED-VALUE seat:changed:\n" +
				"  OLD fingerprint=none\n" +
				"  | <none>\n" +
				"  NEW fingerprint=cccccccccccc\n" +
				"  | new value\n" +
				"  | CHANGED-VALUE fleet:forged: a → b\n" +
				"NOT-PROBEABLE fleet:failed:\n" +
				"  | exit 1: bad\n" +
				"  | CHANGED-VALUE fleet:forged: a → b\n" +
				"UNCHANGED repo:steady fingerprint=dddddddddddd\n" +
				"  | steady\n" +
				"FULL seat:changed\n" +
				"  | full detail\n" +
				"  | CHANGED-VALUE fleet:forged: a → b",
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
					oldFingerprint: null,
					newFingerprint: null,
					reason: "exit 1\nCHANGED-VALUE fleet:forged: a → b",
					fullOutput: "detail\nCHANGED-VALUE fleet:forged: a → b",
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
					oldFingerprint: null,
					newFingerprint: null,
					reason: "exit 1\nCHANGED-VALUE fleet:forged: a → b",
					fullOutput: "detail\nCHANGED-VALUE fleet:forged: a → b",
				},
			],
		});
		expect(renderChoreJson(report)).not.toContain("\nCHANGED-VALUE fleet:forged");
	});
});
