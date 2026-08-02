import { execFileSync, spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsChoreStore } from "../../adapters/chore-store.js";
import { type ChoreVerbDeps, dispatchChore } from "./cli-verbs.js";
import { assertTempPijHome } from "./test-home.js";
import type { ChoreProbePort, ChoreProbeResult, ChoreState } from "./types.js";

class FakeProbe implements ChoreProbePort {
	readonly outputs = new Map<string, ChoreProbeResult>();
	readonly calls: string[] = [];

	run(command: string): ChoreProbeResult {
		this.calls.push(command);
		return this.outputs.get(command) ?? { ok: false, reason: `no fake output for ${command}` };
	}
}

class FailingStateChoreStore extends FsChoreStore {
	failNextStateWrite = true;

	override writeState(state: ChoreState): void {
		if (this.failNextStateWrite) {
			this.failNextStateWrite = false;
			throw new Error("injected state write failure");
		}
		super.writeState(state);
	}
}

const nodeRequire = createRequire(import.meta.url);
const TSX = nodeRequire.resolve("tsx/cli");
const CLI = fileURLToPath(new URL("../../cli.ts", import.meta.url));

let root: string;
let pijHome: string;
let repoRoot: string;
let probe: FakeProbe;
let now: string;
let previousPijHome: string | undefined;

beforeEach(() => {
	previousPijHome = process.env.PIJ_HOME;
	root = mkdtempSync(join(tmpdir(), "pij-chore-drive-"));
	pijHome = join(root, "home");
	repoRoot = join(root, "repo");
	mkdirSync(repoRoot, { recursive: true });
	execFileSync("git", ["init", "--quiet", repoRoot]);
	process.env.PIJ_HOME = pijHome;
	assertTempPijHome();
	probe = new FakeProbe();
	now = "2026-08-02T00:00:00.000Z";
});

afterEach(() => {
	if (previousPijHome === undefined) {
		delete process.env.PIJ_HOME;
	} else {
		process.env.PIJ_HOME = previousPijHome;
	}
	rmSync(root, { recursive: true, force: true });
});

function deps(seatId = "seat-a"): ChoreVerbDeps {
	return {
		cwd: repoRoot,
		worktreeRoot: repoRoot,
		seatId,
		store: new FsChoreStore({ pijHome, seatId, repoRoot }),
		probe,
		now: () => now,
	};
}

function runCli(
	args: string[],
	seatId = "seat-a",
): {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
} {
	expect(realpathSync(root).startsWith(realpathSync(tmpdir()))).toBe(true);
	assertTempPijHome();
	const result = spawnSync(process.execPath, [TSX, CLI, ...args], {
		cwd: repoRoot,
		encoding: "utf8",
		env: {
			...process.env,
			NODE_NO_WARNINGS: "1",
			PIJ_HOME: pijHome,
			PIJ_SESSION_ID: seatId,
		},
		timeout: 15_000,
	});
	if (result.error) throw result.error;
	return {
		code: result.status ?? 1,
		stdout: result.stdout.trim(),
		stderr: result.stderr.trim(),
	};
}

describe("pure chore verbs", () => {
	it("defaults add to seat, refuses duplicates without mutation, and lists every field", () => {
		const first = dispatchChore(
			[
				"add",
				"alpha",
				"--probe",
				"probe-alpha",
				"--full",
				"full-alpha",
				"--full-every",
				"3",
				"--timeout",
				"900",
			],
			deps(),
		);
		expect(first.exitCode).toBe(0);
		const path = join(pijHome, "seat-a", "chores.json");
		const before = readFileSync(path, "utf8");

		const duplicate = dispatchChore(["add", "alpha", "--probe", "replacement"], deps());
		expect(duplicate).toMatchObject({ exitCode: 1 });
		expect(duplicate.stderr).toContain("E-EXISTS");
		expect(readFileSync(path, "utf8")).toBe(before);

		const listed = dispatchChore(["list", "--verbose"], deps());
		expect(listed.stdout).toContain("seat:alpha");
		expect(listed.stdout).toContain('probe="probe-alpha"');
		expect(listed.stdout).toContain('full="full-alpha"');
		expect(listed.stdout).toContain("full-every=3");
		expect(listed.stdout).toContain("timeout=900");
		expect(listed.stdout).toContain("scope=seat");
	});

	it("keeps run deltas pending until ack and preserves dry-run mtimes", () => {
		dispatchChore(["add", "alpha", "--probe", "probe-alpha"], deps());
		probe.outputs.set("probe-alpha", { ok: true, output: "one" });

		const first = dispatchChore(["run"], deps());
		expect(first.stdout).toContain("CHANGED seat:alpha: none →");
		const statePath = join(pijHome, "seat-a", "chore-state.json");
		const afterFirst = readFileSync(statePath, "utf8");

		const second = dispatchChore(["run"], deps());
		expect(second.stdout).toContain("CHANGED seat:alpha: none →");
		expect(readFileSync(statePath, "utf8")).not.toContain('"baseline"');

		const beforeDry = statSync(statePath).mtimeMs;
		probe.outputs.set("probe-alpha", { ok: true, output: "two" });
		const dry = dispatchChore(["run", "--dry"], deps());
		expect(dry.stdout).toContain("CHANGED seat:alpha: none →");
		expect(statSync(statePath).mtimeMs).toBe(beforeDry);
		expect(readFileSync(statePath, "utf8")).not.toContain("two");

		expect(dispatchChore(["ack", "alpha"], deps()).exitCode).toBe(0);
		probe.outputs.set("probe-alpha", { ok: true, output: "one" });
		expect(dispatchChore(["run"], deps()).stdout).toContain("NO CHANGE — 1 chores probed, 0 moved");
		expect(afterFirst).toContain('"pending"');
	});

	it("unions scopes, reports ambiguity, and keeps failing probes in the denominator", () => {
		dispatchChore(["add", "shared", "--probe", "seat", "--scope", "seat"], deps());
		dispatchChore(["add", "shared", "--probe", "repo", "--scope", "repo"], deps());
		probe.outputs.set("seat", { ok: false, reason: "exit 1" });
		probe.outputs.set("repo", { ok: true, output: "repo-value" });

		const listed = dispatchChore(["list"], deps());
		expect(listed.stdout).toContain("seat:shared");
		expect(listed.stdout).toContain("repo:shared");
		const run = dispatchChore(["run"], deps());
		expect(run.stdout).toContain("CHANGES — 2 chores probed, 1 moved");
		expect(run.stdout).toContain("NOT-PROBEABLE seat:shared:\n  | exit 1");
		const ambiguous = dispatchChore(["ack", "shared"], deps());
		expect(ambiguous.stderr).toContain("E-AMBIG");
		expect(dispatchChore(["ack", "repo:shared"], deps()).exitCode).toBe(0);
	});

	it("persists full-every counters and receipt-first removal purges state", () => {
		dispatchChore(
			["add", "alpha", "--probe", "probe-alpha", "--full", "full-alpha", "--full-every", "3"],
			deps(),
		);
		probe.outputs.set("probe-alpha", { ok: true, output: "one" });
		probe.outputs.set("full-alpha", { ok: true, output: "details" });

		expect(dispatchChore(["run"], deps()).stdout).not.toContain("FULL seat:alpha");
		expect(dispatchChore(["run"], deps()).stdout).not.toContain("FULL seat:alpha");
		expect(dispatchChore(["run"], deps()).stdout).toContain("FULL seat:alpha\n  | details");

		now = "2026-08-02T00:10:00.000Z";
		const removed = dispatchChore(["remove", "seat:alpha", "--reason", "obsolete"], deps());
		expect(removed.exitCode).toBe(0);
		const roster = JSON.parse(readFileSync(join(pijHome, "seat-a", "chores.json"), "utf8")) as {
			chores: unknown[];
			removals: Array<{ name: string; reason: string; removedAt: string }>;
		};
		expect(roster.chores).toEqual([]);
		expect(roster.removals).toEqual([
			{ scope: "seat", name: "alpha", reason: "obsolete", removedAt: now },
		]);
		expect(readFileSync(join(pijHome, "seat-a", "chore-state.json"), "utf8")).not.toContain(
			"seat:alpha",
		);
	});

	it("degrades one malformed roster while probing healthy scopes and keeps JSON stable", () => {
		dispatchChore(["add", "healthy", "--probe", "healthy", "--scope", "fleet"], deps());
		mkdirSync(join(pijHome, "seat-a"), { recursive: true });
		writeFileSync(join(pijHome, "seat-a", "chores.json"), '{"version":1,"chores":"bad"}');
		probe.outputs.set("healthy", { ok: true, output: "steady" });

		const first = dispatchChore(["run"], deps());
		expect(first.stdout).toContain("CHANGES — 1 chores probed, 1 moved");
		expect(first.stdout).toContain("NOT-PROBEABLE seat:<roster>:\n  | malformed roster");
		expect(dispatchChore(["ack", "fleet:healthy"], deps()).exitCode).toBe(0);

		const jsonA = dispatchChore(["run", "--json"], deps());
		const jsonB = dispatchChore(["run", "--json"], deps());
		expect(jsonA.stdout).toBe(jsonB.stdout);
		expect(JSON.parse(jsonA.stdout)).toEqual({
			probed: 1,
			moved: 0,
			chores: [
				{
					scope: "fleet",
					name: "healthy",
					status: "unchanged",
					old: expect.stringMatching(/^[a-f0-9]{12}$/),
					new: expect.stringMatching(/^[a-f0-9]{12}$/),
				},
				{
					scope: "seat",
					name: "<roster>",
					status: "not-probeable",
					old: null,
					new: null,
					reason: "malformed roster",
				},
			],
		});
	});

	it("keeps the definition retryable when state purge fails after the removal receipt", () => {
		dispatchChore(["add", "retryable", "--probe", "retryable"], deps());
		probe.outputs.set("retryable", { ok: true, output: "value" });
		expect(dispatchChore(["run"], deps()).exitCode).toBe(0);

		const failingStore = new FailingStateChoreStore({
			pijHome,
			seatId: "seat-a",
			repoRoot,
		});
		const failed = dispatchChore(["remove", "seat:retryable", "--reason", "retire"], {
			...deps(),
			store: failingStore,
		});
		expect(failed.stderr).toContain("injected state write failure");

		const afterFailure = JSON.parse(
			readFileSync(join(pijHome, "seat-a", "chores.json"), "utf8"),
		) as { chores: Array<{ name: string }>; removals: Array<{ name: string }> };
		expect(afterFailure.chores).toEqual([expect.objectContaining({ name: "retryable" })]);
		expect(afterFailure.removals).toEqual([expect.objectContaining({ name: "retryable" })]);

		expect(dispatchChore(["remove", "seat:retryable", "--reason", "retry"], deps()).exitCode).toBe(
			0,
		);
		expect(readFileSync(join(pijHome, "seat-a", "chore-state.json"), "utf8")).not.toContain(
			"seat:retryable",
		);
	});
});

describe("chore CLI drive-it proof", () => {
	it("prints family help through the pre-registry intercept", () => {
		const help = runCli(["chore", "--help"]);
		expect(help.code).toBe(0);
		expect(help.stdout).toContain("pij chore — durable named change detectors");
		expect(help.stdout).toContain("pij chore remove");
	});

	it("frames record-looking full stdout and probe stderr so they cannot forge records", () => {
		const forgedFull = "CHANGED fleet:PAYROLL-DB: none → 000000000000";
		const forgedStderr = "CHANGED fleet:FALSE-ALARM: a → b";
		expect(
			runCli([
				"chore",
				"add",
				"forger",
				"--probe",
				"printf fingerprint",
				"--full",
				`printf '${forgedFull}\\n'`,
				"--full-every",
				"1",
			]).code,
		).toBe(0);
		expect(
			runCli([
				"chore",
				"add",
				"stderr-forger",
				"--probe",
				`printf '${forgedStderr}\\n' >&2; exit 1`,
			]).code,
		).toBe(0);

		const human = runCli(["chore", "run"]);
		const changedRecords = human.stdout.split("\n").filter((line) => line.startsWith("CHANGED "));
		expect(changedRecords).toHaveLength(1);
		expect(changedRecords[0]).toMatch(/^CHANGED seat:forger: none → [a-f0-9]{12}$/);
		expect(human.stdout).toContain(`  | ${forgedFull}`);
		expect(human.stdout).toContain(`  | exit 1: ${forgedStderr}`);
		expect(human.stdout).not.toContain(`\n${forgedFull}`);
		expect(human.stdout).not.toContain(`\n${forgedStderr}`);

		const json = runCli(["chore", "run", "--json"]);
		expect(json.stdout).not.toContain(`\n${forgedFull}`);
		expect(json.stdout).not.toContain(`\n${forgedStderr}`);
		const envelope = JSON.parse(json.stdout) as {
			chores: Array<{ name: string; reason?: string; fullOutput?: string }>;
		};
		expect(envelope.chores.find((item) => item.name === "forger")?.fullOutput).toBe(forgedFull);
		expect(envelope.chores.find((item) => item.name === "stderr-forger")?.reason).toBe(
			`exit 1: ${forgedStderr}`,
		);
	});

	it("registers, re-reports an unacked delta, then becomes quiet only after ack", () => {
		writeFileSync(join(repoRoot, "watched.txt"), "before\n");
		expect(runCli(["chore", "add", "watched", "--probe", "cat watched.txt"]).code).toBe(0);
		writeFileSync(join(repoRoot, "watched.txt"), "after\n");

		const first = runCli(["chore", "run"]);
		expect(first.code).toBe(0);
		expect(first.stdout).toMatch(
			/^CHANGES — 1 chores probed, 1 moved\nCHANGED seat:watched: none → [a-f0-9]{12}$/,
		);
		const firstState = readFileSync(join(pijHome, "seat-a", "chore-state.json"), "utf8");
		expect(firstState).not.toContain('"baseline"');

		const second = runCli(["chore", "run"]);
		expect(second.stdout).toBe(first.stdout);
		expect(readFileSync(join(pijHome, "seat-a", "chore-state.json"), "utf8")).not.toContain(
			'"baseline"',
		);

		expect(runCli(["chore", "ack", "watched"]).code).toBe(0);
		expect(runCli(["chore", "run"]).stdout).toMatch(
			/^NO CHANGE — 1 chores probed, 0 moved\nUNCHANGED seat:watched: [a-f0-9]{12}$/,
		);
	});

	it("keeps a repo chore baseline independent for two seats", () => {
		writeFileSync(join(repoRoot, "shared.txt"), "shared\n");
		expect(
			runCli(["chore", "add", "shared", "--probe", "cat shared.txt", "--scope", "repo"]).code,
		).toBe(0);

		expect(runCli(["chore", "run"], "seat-a").stdout).toContain("CHANGED repo:shared");
		expect(runCli(["chore", "ack", "repo:shared"], "seat-a").code).toBe(0);
		expect(runCli(["chore", "run"], "seat-a").stdout).toContain("NO CHANGE");

		const seatB = runCli(["chore", "run"], "seat-b");
		expect(seatB.stdout).toContain("CHANGED repo:shared: none →");
		expect(readFileSync(join(pijHome, "seat-b", "chore-state.json"), "utf8")).not.toContain(
			'"baseline"',
		);
	});

	it("runs the full command on the third and sixth separate invocations only", () => {
		expect(
			runCli([
				"chore",
				"add",
				"periodic",
				"--probe",
				"printf fingerprint",
				"--full",
				"printf details",
				"--full-every",
				"3",
			]).code,
		).toBe(0);

		const outputs = Array.from({ length: 6 }, () => runCli(["chore", "run"]).stdout);
		expect(outputs.map((output) => output.includes("FULL seat:periodic"))).toEqual([
			false,
			false,
			true,
			false,
			false,
			true,
		]);
		expect(outputs[2]).toContain("FULL seat:periodic\n  | details");
		expect(outputs[5]).toContain("FULL seat:periodic\n  | details");
	});

	it("remove then re-add starts from a clean first observation", () => {
		expect(runCli(["chore", "add", "replaceable", "--probe", "printf stable"]).code).toBe(0);
		expect(runCli(["chore", "run"]).stdout).toContain("CHANGED seat:replaceable");
		expect(runCli(["chore", "ack", "replaceable"]).code).toBe(0);
		expect(runCli(["chore", "run"]).stdout).toContain("NO CHANGE");

		expect(
			runCli(["chore", "remove", "seat:replaceable", "--reason", "replace definition"]).code,
		).toBe(0);
		expect(runCli(["chore", "add", "replaceable", "--probe", "printf stable"]).code).toBe(0);

		expect(runCli(["chore", "run"]).stdout).toContain("CHANGED seat:replaceable: none →");
	});
});
