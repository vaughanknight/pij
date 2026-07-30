// pij-control-plane — background job planning + completion turns (pure).

import { describe, expect, it } from "vitest";
import {
	BG_ACTOR,
	BG_ENV,
	BG_TAIL_LIMIT,
	bgWrapperScript,
	buildBgCompletionTurn,
	formatDuration,
	jobStartedAtMs,
	planBgJob,
	tailOf,
} from "./bg.js";

const base = {
	title: "harness checks",
	command: "harness checks",
	to: "pij-seat",
	jobId: "bg-abc",
	outDir: "/home/.pij/pij-seat",
};

describe("planBgJob", () => {
	it("shapes a job and puts its log under the caller's data dir", () => {
		const planned = planBgJob(base);
		expect(planned.ok && planned.value.outPath).toBe("/home/.pij/pij-seat/bg-abc.log");
	});

	it("refuses a job nobody could attribute or run", () => {
		for (const bad of [
			{ ...base, title: "   " },
			{ ...base, command: "  " },
			{ ...base, title: "a\nb" },
			{ ...base, title: "x".repeat(200) },
		]) {
			expect(planBgJob(bad).ok).toBe(false);
		}
	});
});

describe("bgWrapperScript", () => {
	it("never interpolates the user's command — it is read from the environment", () => {
		// The injection guard: a command full of quotes and metacharacters must not
		// be able to alter the wrapper, because the wrapper never contains it.
		const script = bgWrapperScript(["node", "/path/cli.ts", "bg-deliver"]);
		expect(script).toContain(`"$${BG_ENV.command}"`);
		expect(script).not.toContain("rm -rf");
		const evil = planBgJob({ ...base, command: `x"; rm -rf /; echo "` });
		expect(evil.ok).toBe(true);
		expect(script).not.toContain("rm -rf /");
	});

	it("records the notify's own output so a failed delivery leaves evidence", () => {
		// A silent delivery failure is the worst outcome: the job succeeded and the
		// caller waits forever. Proven by asserting the sidecar redirect exists.
		expect(bgWrapperScript(["pij", "bg-deliver"])).toContain(`"$${BG_ENV.out}.notify"`);
	});

	it("quotes the notify argv it controls, so a spaced path survives", () => {
		expect(bgWrapperScript(["/my path/node", "cli.ts", "bg-deliver"])).toContain("'/my path/node'");
	});
});

describe("tailOf", () => {
	it("keeps short output whole", () => {
		expect(tailOf("done")).toBe("done");
	});

	it("keeps the END of long output and says so", () => {
		// The tail, not the head: a failure's cause is at the bottom of a log.
		const out = `${"a".repeat(BG_TAIL_LIMIT * 2)}THE-ERROR`;
		const tail = tailOf(out);
		expect(tail).toContain("THE-ERROR");
		expect(tail).toContain("truncated");
		expect(tail.length).toBeLessThan(out.length);
	});
});

describe("formatDuration", () => {
	it("reads as seconds under a minute and m/s above", () => {
		expect(formatDuration(30_000)).toBe("30s");
		expect(formatDuration(95_000)).toBe("1m35s");
		expect(formatDuration(Number.NaN)).toBe("unknown");
	});
});

describe("buildBgCompletionTurn", () => {
	const turn = (exitCode: number, output = "all good") =>
		buildBgCompletionTurn({
			title: "harness checks",
			exitCode,
			durationMs: 300_000,
			outPath: "/home/.pij/pij-seat/bg-abc.log",
			output,
		});

	it("leads with the verdict and the title", () => {
		// This arrives UNSOLICITED in an agent's context; the opening has to answer
		// "what finished, and did it work?" before anything else.
		expect(turn(0).startsWith("[pij bg] OK — harness checks (5m00s)")).toBe(true);
		expect(turn(1)).toContain("FAILED (exit 1)");
	});

	it("always points at the full log, and carries a preview", () => {
		expect(turn(0)).toContain("full log: /home/.pij/pij-seat/bg-abc.log");
		expect(turn(0)).toContain("all good");
	});

	it("stays readable when the job produced nothing", () => {
		expect(turn(0, "")).toBe(
			"[pij bg] OK — harness checks (5m00s) · full log: /home/.pij/pij-seat/bg-abc.log",
		);
	});

	it("emits ONE line — delivery types bodies into a composer, where \\n submits", () => {
		// Observed on the first live run: a multi-line body arrived as
		// "…(31s)full output: /path/x.logtick 1tick 2…". Line breaks do not survive
		// the transport, so the message has to be built for one line.
		const multi = turn(0, "tick 1\ntick 2\ncounted to 30");
		expect(multi).not.toContain("\n");
		expect(multi).toContain("tick 1 ⏎ tick 2 ⏎ counted to 30");
	});
});

describe("BG_ACTOR", () => {
	it("is a fixed literal, never caller-supplied", () => {
		// Delivering as the queueing seat would trip E-SELF and would also be a
		// lie; a caller-settable actor would be a spoofing vector.
		expect(BG_ACTOR).toBe("pij-bg");
	});
});

describe("jobStartedAtMs", () => {
	const NOW = Date.parse("2026-07-30T02:00:00.000Z");

	it("recovers the launch instant from a real job id", () => {
		const started = NOW - 31_000;
		expect(jobStartedAtMs(`bg-${started.toString(36)}-abc123`, NOW)).toBe(started);
	});

	it("returns undefined rather than a confident absurdity", () => {
		// base36 happily parses a random suffix into a small integer, which then
		// rendered as "29756269m09s" on a live probe. Out-of-window means unknown.
		for (const bad of ["bg-x2-y", "bg--z", "bg", "bg-ZZZZZZZZZZ-q"]) {
			expect(jobStartedAtMs(bad, NOW)).toBeUndefined();
		}
		expect(formatDuration(Number.NaN)).toBe("unknown");
	});
});
