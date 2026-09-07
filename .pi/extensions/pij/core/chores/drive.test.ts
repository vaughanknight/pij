import { execFileSync, spawnSync } from "node:child_process";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeTemporaryTree } from "../../../../../harness/test-utils.js";
import { ShellChoreProbe } from "../../adapters/chore-probe.js";
import { FsChoreStore } from "../../adapters/chore-store.js";
import { FsRegistry } from "../../adapters/fs-registry.js";
import { type ChoreVerbDeps, dispatchChore } from "./cli-verbs.js";
import { assertTempPijHome } from "./test-home.js";
import {
	type ChoreProbePort,
	type ChoreProbeResult,
	type ChoreState,
	MAX_CHORE_VALUE_BYTES,
} from "./types.js";

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
let previousGitTrace: string | undefined;

beforeEach(() => {
	previousPijHome = process.env.PIJ_HOME;
	previousGitTrace = process.env.GIT_TRACE2_EVENT;
	// Git AI otherwise initializes .git/ai asynchronously after git init exits.
	// Disable only this fixture's Trace2 event stream; Git hooks remain enabled.
	process.env.GIT_TRACE2_EVENT = "0";
	root = realpathSync(mkdtempSync(join(tmpdir(), "pij-chore-drive-")));
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
	if (previousGitTrace === undefined) delete process.env.GIT_TRACE2_EVENT;
	else process.env.GIT_TRACE2_EVENT = previousGitTrace;
	removeTemporaryTree(root);
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

function libraryDeps(
	seatId: string | null = "seat-a",
	cwd = repoRoot,
	worktreeRoot = cwd,
): ChoreVerbDeps {
	return {
		cwd,
		worktreeRoot,
		...(seatId === null ? {} : { seatId }),
		store: new FsChoreStore({
			pijHome,
			...(seatId === null ? {} : { seatId }),
			repoRoot: worktreeRoot,
		}),
		probe: new ShellChoreProbe(),
		now: () => now,
	};
}

function runCli(args: string[], env: NodeJS.ProcessEnv) {
	expect(realpathSync(root).startsWith(realpathSync(tmpdir()))).toBe(true);
	assertTempPijHome();
	const result = spawnSync(process.execPath, [TSX, CLI, ...args], {
		cwd: repoRoot,
		encoding: "utf8",
		env: {
			PATH: process.env.PATH,
			NODE_NO_WARNINGS: "1",
			TSX_DISABLE_CACHE: "1",
			HOME: join(root, "user-home"),
			XDG_CONFIG_HOME: join(root, "config"),
			CLAUDE_CONFIG_DIR: join(root, "claude"),
			PIJ_HOME: pijHome,
			PIJ_RS_STATE_DIR: join(root, "rs"),
			PIJ_RS_ADDR: "pij-chore-refusal.invalid:1",
			...env,
		},
		timeout: 15_000,
	});
	if (result.error) throw result.error;
	expect(result.signal).toBeNull();
	return {
		code: result.status,
		stdout: result.stdout.trim(),
		stderr: result.stderr.trim(),
	};
}

function snapshotTree(path: string): unknown {
	const stat = lstatSync(path);
	return {
		mode: stat.mode,
		ino: stat.ino,
		mtimeMs: stat.mtimeMs,
		ctimeMs: stat.ctimeMs,
		content: stat.isDirectory()
			? readdirSync(path)
					.sort()
					.map((name) => [name, snapshotTree(join(path, name))])
			: stat.isSymbolicLink()
				? readlinkSync(path)
				: readFileSync(path).toString("base64"),
	};
}

const STATIC_REPO_COMMAND =
	"python3 ./scripts/probe.py --format summary --limit 10 data/input.json";
const DYNAMIC_REPO_COMMAND_CASES = [
	{
		label: "quoted variable",
		command: 'cat "$HOME/external.txt"',
		category: "contains a construct not permitted in a shared roster",
		reason: "quoted arguments",
	},
	{
		label: "braced variable",
		command: `cat "\${HOME}/external.txt"`,
		category: "contains a construct not permitted in a shared roster",
		reason: "quoted arguments",
	},
	{
		label: "tilde expansion",
		command: "cat ~/external.txt",
		category: "contains a construct not permitted in a shared roster",
		reason: "character '~'",
	},
	{
		label: "later variable expansion",
		command: 'TARGET=../external.txt; cat "$TARGET"',
		category: "contains a construct not permitted in a shared roster",
		reason: "character ';'",
	},
	{
		label: "inline interpreter payload",
		command: 'node -e \'require("node:fs").readFileSync(process.env.HOME + "/external.txt")\'',
		category: "contains a construct not permitted in a shared roster",
		reason: "quoted arguments",
	},
	{
		label: "command substitution",
		command: 'TARGET=$(printf ../external.txt); cat "$TARGET"',
		category: "contains a construct not permitted in a shared roster",
		reason: "character '$'",
	},
	{
		label: "backtick substitution",
		command: "cat `printf ../external.txt`",
		category: "contains a construct not permitted in a shared roster",
		reason: "character '`'",
	},
	{
		label: "unterminated quote",
		command: 'cat "../external.txt',
		category: "could not be proven static",
		reason: "unterminated double quote",
	},
] as const;

function writeRepoGrammarFixtures(): void {
	mkdirSync(join(repoRoot, "scripts"));
	mkdirSync(join(repoRoot, "data"));
	writeFileSync(join(repoRoot, "scripts", "probe.py"), "print('inside')\n");
	writeFileSync(join(repoRoot, "data", "input.json"), "{}\n");
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
		expect(listed.stdout).toContain("creator=seat-a");
	});

	it("keeps run deltas pending until ack and preserves dry-run mtimes", () => {
		dispatchChore(["add", "alpha", "--probe", "probe-alpha"], deps());
		probe.outputs.set("probe-alpha", { ok: true, output: "one" });

		const first = dispatchChore(["run"], deps());
		expect(first.stdout).toContain("CHANGED-VALUE seat:alpha:");
		expect(first.stdout).toContain("  | one");
		const statePath = join(pijHome, "seat-a", "chore-state.json");
		const afterFirst = readFileSync(statePath, "utf8");

		const second = dispatchChore(["run"], deps());
		expect(second.stdout).toContain("CHANGED-VALUE seat:alpha:");
		expect(second.stdout).toContain("  | one");
		expect(readFileSync(statePath, "utf8")).not.toContain('"baseline"');

		const beforeDry = statSync(statePath).mtimeMs;
		probe.outputs.set("probe-alpha", { ok: true, output: "two" });
		const dry = dispatchChore(["run", "--dry"], deps());
		expect(dry.stdout).toContain("CHANGED-VALUE seat:alpha:");
		expect(dry.stdout).toContain("  | two");
		expect(statSync(statePath).mtimeMs).toBe(beforeDry);
		expect(readFileSync(statePath, "utf8")).not.toContain("two");

		expect(dispatchChore(["ack", "alpha"], deps()).exitCode).toBe(0);
		probe.outputs.set("probe-alpha", { ok: true, output: "one" });
		expect(dispatchChore(["run"], deps()).stdout).toContain("NO CHANGE — 1 chores probed, 0 moved");
		expect(afterFirst).toContain('"pending"');
	});

	it("unions scopes, reports ambiguity, and keeps failing probes in the denominator", () => {
		dispatchChore(["add", "shared", "--probe", "seat", "--scope", "seat"], deps());
		dispatchChore(["add", "shared", "--probe", "printf repo", "--scope", "repo"], deps());
		probe.outputs.set("seat", { ok: false, reason: "exit 1" });
		probe.outputs.set("printf repo", { ok: true, output: "repo-value" });

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

		expect(dispatchChore(["run"], deps()).stdout).toContain("FULL seat:alpha");
		expect(dispatchChore(["ack", "alpha"], deps()).exitCode).toBe(0);
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
			scopes: {
				seat: "seat-a",
				repo: join(repoRoot, ".pij", "chores.json"),
				fleet: join(pijHome, "pij-chores", "chores.json"),
			},
			probed: 1,
			moved: 0,
			chores: [
				{
					scope: "fleet",
					name: "healthy",
					status: "unchanged",
					old: "steady",
					new: "steady",
					oldFingerprint: expect.stringMatching(/^[a-f0-9]{12}$/),
					newFingerprint: expect.stringMatching(/^[a-f0-9]{12}$/),
				},
				{
					scope: "seat",
					name: "<roster>",
					status: "not-probeable",
					old: null,
					new: null,
					oldFingerprint: null,
					newFingerprint: null,
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

describe.each([
	{ label: "default Rust authority", generation: "" },
	{ label: "explicit Rust authority", generation: "rs" },
	{ label: "retired explicit legacy force", generation: "legacy" },
])("public chore refusal — $label", ({ generation }) => {
	let cliEnv: NodeJS.ProcessEnv;
	let before: unknown;
	let processMarker: string;
	let probeMarker: string;

	beforeEach(() => {
		const bin = join(root, "bin");
		mkdirSync(bin);
		processMarker = join(root, "unexpected-process");
		probeMarker = join(root, "unexpected-probe");
		for (const executable of ["sh", "bash", "git", "tmux", "pij", "pij-rs"]) {
			writeFileSync(
				join(bin, executable),
				'#!/bin/sh\nprintf "%s\\n" "$0 $*" >> "$PIJ_PROCESS_SENTINEL"\nexit 97\n',
				{ mode: 0o755 },
			);
		}
		writeFileSync(
			join(repoRoot, "probe-tripwire.sh"),
			'printf executed >> "$PIJ_PROBE_SENTINEL"\n',
		);
		for (const { id, paneId } of [
			{ id: "seat-a", paneId: "%1" },
			{ id: "pij-adopted-seat", paneId: "%77" },
			{ id: "pij-other-seat", paneId: "%88" },
		]) {
			new FsRegistry(pijHome).write({
				id,
				folder: realpathSync(repoRoot),
				dataDir: join(pijHome, id),
				eventsPath: join(pijHome, id, "events.ndjson"),
				pid: process.pid,
				startedAt: now,
				paneId,
				state: "idle",
			});
		}
		// Seed valid legacy data through its library, so an accidental fallback has
		// real rosters, pending state and runnable probes to mutate or execute.
		const command = "sh ./probe-tripwire.sh";
		for (const scope of ["seat", "repo", "fleet"]) {
			expect(
				dispatchChore(
					["add", "guarded", "--probe", command, "--full", command, "--scope", scope],
					deps(),
				).exitCode,
			).toBe(0);
		}
		probe.outputs.set(command, { ok: true, output: "pending" });
		expect(dispatchChore(["run"], deps()).exitCode).toBe(0);
		cliEnv = {
			PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
			PIJ_DAEMON_GENERATION: generation,
			PIJ_SESSION_ID: "seat-a",
			TMUX: "",
			TMUX_PANE: "%1",
			PIJ_PROCESS_SENTINEL: processMarker,
			PIJ_PROBE_SENTINEL: probeMarker,
		};
		before = snapshotTree(root);
	});

	function expectNoLegacyEffects(): void {
		expect(existsSync(processMarker)).toBe(false);
		expect(existsSync(probeMarker)).toBe(false);
		expect(snapshotTree(root)).toEqual(before);
	}

	function expectRefused(args: string[], caller: NodeJS.ProcessEnv = {}): void {
		const result = runCli(["chore", ...args, "--json"], { ...cliEnv, ...caller });
		expect(result.code).toBe(4);
		expect(result.stderr).toBe("");
		expect(JSON.parse(result.stdout)).toEqual({
			ok: false,
			command: "pij chore",
			v: 2,
			error: "refused",
			meta: expect.stringContaining(
				generation === "legacy"
					? "E-RS-UNPORTED chore: PIJ_DAEMON_GENERATION=legacy is retired"
					: "E-RS-UNPORTED chore: not ported through this shim",
			),
			details: {
				code: "E-RS-UNPORTED",
				verb: "chore",
				ledger_item: "docs/how/pij-rs-api.md#unsupported-status",
			},
		});
		expectNoLegacyEffects();
	}

	it.each([
		{ label: "bare family", args: [] },
		{ label: "retired family help intercept", args: ["--help"] },
		{ label: "seat add", args: ["add", "new-seat", "--probe", "sh ./probe-tripwire.sh"] },
		{
			label: "repo add",
			args: ["add", "new-repo", "--probe", "sh ./probe-tripwire.sh", "--scope", "repo"],
		},
		{
			label: "fleet add",
			args: ["add", "new-fleet", "--probe", "sh ./probe-tripwire.sh", "--scope", "fleet"],
		},
		{ label: "update", args: ["update", "seat:guarded", "--probe", "printf replacement"] },
		{ label: "list", args: ["list"] },
		{ label: "verbose list", args: ["list", "--verbose"] },
		{ label: "run", args: ["run"] },
		{ label: "dry run", args: ["run", "--dry"] },
		{ label: "ack pending delta", args: ["ack", "seat:guarded"] },
		{ label: "remove", args: ["remove", "seat:guarded", "--reason", "obsolete"] },
	])("refuses $label as named v2 without legacy mutations", ({ args }) => {
		expectRefused(args);
	});

	// The retired CLI resolved panes and emitted E-NOID/E-OWN here. The public
	// contract now refuses the whole family before consulting that identity.
	it.each([
		{ label: "adopted pane", id: "", pane: "%77" },
		{ label: "unknown named seat", id: "pij-adopted-seatt", pane: "" },
		{ label: "unknown UUID seat", id: "413253ce-1162-490d-90eb-f4ff9401b7ce", pane: "" },
		{ label: "mismatched seat and pane", id: "pij-other-seat", pane: "%77" },
		{ label: "unresolved seat", id: "", pane: "" },
	])("refuses before legacy identity resolution for $label", ({ id, pane }) => {
		expectRefused(["run"], { PIJ_SESSION_ID: id, TMUX_PANE: pane });
	});

	it("refuses authoring from an adopted pane without creating its legacy roster", () => {
		expectRefused(["add", "adopted", "--probe", "printf adopted"], {
			PIJ_SESSION_ID: "",
			TMUX_PANE: "%77",
		});
	});

	it.each(["repo", "fleet"])("refuses %s authoring without a resolved seat", (scope) => {
		expectRefused(["add", "shared", "--probe", "printf shared", "--scope", scope], {
			PIJ_SESSION_ID: "",
			TMUX_PANE: "",
		});
	});

	it("prints a named human refusal without legacy mutations", () => {
		const result = runCli(["chore", "run"], cliEnv);
		expect(result.code).toBe(4);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("E-RS: E-RS-UNPORTED chore:");
		expect(result.stderr).toContain("docs/how/pij-rs-api.md#unsupported-status");
		if (generation === "legacy") {
			expect(result.stderr).toContain("PIJ_DAEMON_GENERATION=legacy is retired");
		}
		expectNoLegacyEffects();
	});
});

// These are library integration contracts, not a second public chore executable.
describe("chore library with filesystem store and shell probes", () => {
	it("frames record-looking full stdout and probe stderr so they cannot forge records", () => {
		const forgedValue = "CHANGED-VALUE fleet:VALUE-FORGER: none → 111111111111";
		const forgedFull = "CHANGED-VALUE fleet:PAYROLL-DB: none → 000000000000";
		const forgedStderr = "CHANGED-VALUE fleet:FALSE-ALARM: a → b";
		expect(
			dispatchChore(
				[
					"add",
					"forger",
					"--probe",
					`printf '${forgedValue}\\n'`,
					"--full",
					`printf '${forgedFull}\\n'`,
					"--full-every",
					"1",
				],
				libraryDeps(),
			).exitCode,
		).toBe(0);
		expect(
			dispatchChore(
				["add", "stderr-forger", "--probe", `printf '${forgedStderr}\\n' >&2; exit 1`],
				libraryDeps(),
			).exitCode,
		).toBe(0);

		const human = dispatchChore(["run"], libraryDeps());
		const changedRecords = human.stdout
			.split("\n")
			.filter((line) => line.startsWith("CHANGED-VALUE "));
		expect(changedRecords).toHaveLength(1);
		expect(changedRecords[0]).toBe("CHANGED-VALUE seat:forger:");
		expect(human.stdout).toContain(`  | ${forgedValue}`);
		expect(human.stdout).toContain(`  | ${forgedFull}`);
		expect(human.stdout).toContain(`  | exit 1: ${forgedStderr}`);
		expect(human.stdout).not.toContain(`\n${forgedFull}`);
		expect(human.stdout).not.toContain(`\n${forgedValue}`);
		expect(human.stdout).not.toContain(`\n${forgedStderr}`);

		const json = dispatchChore(["run", "--json"], libraryDeps());
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

	it("reports the exact sampled values, re-reports them, then becomes quiet only after ack", () => {
		writeFileSync(join(repoRoot, "watched.txt"), "before\n");
		expect(
			dispatchChore(["add", "watched", "--probe", "cat watched.txt"], libraryDeps()).exitCode,
		).toBe(0);
		expect(dispatchChore(["run"], libraryDeps()).exitCode).toBe(0);
		expect(dispatchChore(["ack", "watched"], libraryDeps()).exitCode).toBe(0);
		writeFileSync(join(repoRoot, "watched.txt"), "after\n");

		const first = dispatchChore(["run", "--json"], libraryDeps());
		expect(first.exitCode).toBe(0);
		const firstReport = JSON.parse(first.stdout) as {
			chores: Array<{
				old: string | null;
				new: string | null;
				oldFingerprint: string | null;
				newFingerprint: string | null;
			}>;
		};
		expect(firstReport.chores[0]).toMatchObject({
			old: "before\n",
			new: "after\n",
			oldFingerprint: expect.stringMatching(/^[a-f0-9]{12}$/),
			newFingerprint: expect.stringMatching(/^[a-f0-9]{12}$/),
		});
		const firstState = JSON.parse(
			readFileSync(join(pijHome, "seat-a", "chore-state.json"), "utf8"),
		) as {
			entries: Record<
				string,
				{
					baseline?: string;
					baselineValue?: string;
					pending?: {
						old: string | null;
						new: string;
						oldValue?: string | null;
						newValue?: string;
					};
				}
			>;
		};
		expect(firstState.entries["seat:watched"]?.baseline).toMatch(/^[a-f0-9]{12}$/);
		expect(firstState.entries["seat:watched"]?.baselineValue).toBe("before\n");
		expect(firstState.entries["seat:watched"]?.pending).toMatchObject({
			old: expect.stringMatching(/^[a-f0-9]{12}$/),
			new: expect.stringMatching(/^[a-f0-9]{12}$/),
			oldValue: "before\n",
			newValue: "after\n",
		});

		const second = dispatchChore(["run", "--json"], libraryDeps());
		expect(second.stdout).toBe(first.stdout);

		const human = dispatchChore(["run"], libraryDeps());
		expect(human.stdout).toContain("CHANGED-VALUE seat:watched:");
		expect(human.stdout).toContain("  | before");
		expect(human.stdout).toContain("  | after");
		expect(human.stdout).toContain(
			"HINT seat:watched: if this delta needs more context, add --full '<cmd>' --full-every N for periodic absolute state.",
		);
		expect(dispatchChore(["ack", "watched"], libraryDeps()).exitCode).toBe(0);
		const unchanged = dispatchChore(["run"], libraryDeps()).stdout;
		expect(unchanged).toContain("SCOPES seat: seat-a");
		expect(unchanged).toContain("NO CHANGE — 1 chores probed, 0 moved");
		expect(unchanged).toMatch(/UNCHANGED seat:watched fingerprint=[a-f0-9]{12}\n {2}\| after$/);
	});

	it("bounds sampled stdout visibly without changing the comparison fingerprint", () => {
		const value = "x".repeat(MAX_CHORE_VALUE_BYTES + 200);
		writeFileSync(join(repoRoot, "large.txt"), value);
		expect(
			dispatchChore(["add", "large", "--probe", "cat large.txt"], libraryDeps()).exitCode,
		).toBe(0);

		const report = JSON.parse(dispatchChore(["run", "--json"], libraryDeps()).stdout) as {
			chores: Array<{ new: string; newFingerprint: string }>;
		};
		const item = report.chores[0];
		expect(item?.new).toBe(`${"x".repeat(MAX_CHORE_VALUE_BYTES)}…[truncated]`);
		expect(item?.newFingerprint).toMatch(/^[a-f0-9]{12}$/);
	});

	it("keeps a returned delta visible as a flap until ack", () => {
		const watched = join(repoRoot, "flap.txt");
		writeFileSync(watched, "A");
		expect(dispatchChore(["add", "flap", "--probe", "cat flap.txt"], libraryDeps()).exitCode).toBe(
			0,
		);
		expect(dispatchChore(["run"], libraryDeps()).exitCode).toBe(0);
		expect(dispatchChore(["ack", "flap"], libraryDeps()).exitCode).toBe(0);

		writeFileSync(watched, "B");
		expect(dispatchChore(["run"], libraryDeps()).stdout).toContain("CHANGED-VALUE seat:flap:");
		writeFileSync(watched, "A");

		const returned = dispatchChore(["run"], libraryDeps());
		expect(returned.stdout).toContain("CHANGES — 1 chores probed, 1 moved");
		expect(returned.stdout).toContain("FLAPPED seat:flap: moved and returned since last ack");
		expect(returned.stdout).toContain("  | A");
		expect(dispatchChore(["run"], libraryDeps()).stdout).toBe(returned.stdout);
		expect(readFileSync(join(pijHome, "seat-a", "chore-state.json"), "utf8")).toContain(
			'"pending"',
		);
		expect(dispatchChore(["ack", "flap"], libraryDeps()).exitCode).toBe(0);
		expect(dispatchChore(["run"], libraryDeps()).stdout).toContain(
			"NO CHANGE — 1 chores probed, 0 moved",
		);
	});

	it("retains the caller-supplied seat as creator attribution at the library boundary", () => {
		const adoptedId = "pij-adopted-seat";
		const added = dispatchChore(
			["add", "adopted", "--probe", "printf adopted"],
			libraryDeps(adoptedId),
		);
		expect(added.exitCode).toBe(0);
		expect(added.stderr).toBe("");
		const adoptedRoster = JSON.parse(readFileSync(join(pijHome, adoptedId, "chores.json"), "utf8"));
		expect(adoptedRoster.chores).toContainEqual(
			expect.objectContaining({ name: "adopted", creatorSeatId: adoptedId }),
		);
		expect(dispatchChore(["run"], libraryDeps(adoptedId)).stdout).toContain(
			"CHANGED-VALUE seat:adopted:",
		);
	});

	it("keeps repo and fleet roster authoring available without a resolved seat", () => {
		expect(
			dispatchChore(
				["add", "shared", "--probe", "printf shared", "--scope", "repo"],
				libraryDeps(null),
			).exitCode,
		).toBe(0);
		expect(
			dispatchChore(
				["add", "global", "--probe", "printf global", "--scope", "fleet"],
				libraryDeps(null),
			).exitCode,
		).toBe(0);
		const listed = dispatchChore(["list"], libraryDeps(null));
		expect(listed.exitCode).toBe(0);
		expect(listed.stdout).toContain("SCOPES seat: unresolved");
		expect(listed.stdout).toContain("repo:shared");
		expect(listed.stdout).toContain("fleet:global");
		const run = dispatchChore(["run"], libraryDeps(null));
		expect(run.exitCode).toBe(1);
		expect(run.stderr).toContain("SCOPES seat: unresolved");
		expect(run.stderr).toContain("per-seat chore state requires a registered seat id");
	});

	it("normalizes repo-local absolute paths, runs repo probes from another worktree and a subdirectory, and writes formatted JSON", () => {
		execFileSync("git", ["-C", repoRoot, "config", "user.email", "pij@example.test"]);
		execFileSync("git", ["-C", repoRoot, "config", "user.name", "pij test"]);
		writeFileSync(join(repoRoot, "absolute.txt"), "main-absolute\n");
		writeFileSync(join(repoRoot, "relative.txt"), "main-relative\n");
		execFileSync("git", ["-C", repoRoot, "add", "absolute.txt", "relative.txt"]);
		execFileSync("git", ["-C", repoRoot, "commit", "--quiet", "-m", "seed probe inputs"]);

		const repo = dispatchChore(
			[
				"add",
				"repo-absolute",
				"--probe",
				`cat ${join(repoRoot, "absolute.txt")}`,
				"--scope",
				"repo",
			],
			libraryDeps(),
		);
		expect(repo.exitCode).toBe(0);
		expect(repo.stderr).not.toContain("WARN:");
		expect(repo.stderr).toContain("NOTE: commit");
		expect(repo.stderr).toContain(".pij/chores.json");
		expect(
			dispatchChore(
				["add", "repo-relative", "--probe", "cat relative.txt", "--scope", "repo"],
				libraryDeps(),
			).exitCode,
		).toBe(0);

		const rosterPath = join(repoRoot, ".pij", "chores.json");
		const rosterText = readFileSync(rosterPath, "utf8");
		const roster = JSON.parse(rosterText) as {
			chores: Array<{ name: string; probe: string }>;
		};
		expect(roster.chores.find((chore) => chore.name === "repo-absolute")?.probe).toBe(
			"cat ./absolute.txt",
		);
		expect(rosterText).toContain('\n\t"chores": [\n');
		expect(rosterText.endsWith("\n")).toBe(true);
		expect(rosterText).not.toBe(JSON.stringify(roster));

		execFileSync("git", ["-C", repoRoot, "add", ".pij/chores.json"]);
		execFileSync("git", ["-C", repoRoot, "commit", "--quiet", "-m", "add shared chores"]);
		const otherWorktree = join(root, "other-worktree");
		execFileSync("git", [
			"-C",
			repoRoot,
			"worktree",
			"add",
			"--quiet",
			"--detach",
			otherWorktree,
			"HEAD",
		]);
		writeFileSync(join(otherWorktree, "absolute.txt"), "other-absolute\n");
		writeFileSync(join(otherWorktree, "relative.txt"), "other-relative\n");

		const fromOtherRoot = dispatchChore(
			["run", "--json"],
			libraryDeps("seat-b", otherWorktree, otherWorktree),
		);
		expect(fromOtherRoot.exitCode).toBe(0);
		const rootReport = JSON.parse(fromOtherRoot.stdout) as {
			chores: Array<{ name: string; new: string | null; status: string }>;
		};
		expect(rootReport.chores.find((chore) => chore.name === "repo-absolute")).toMatchObject({
			status: "changed-value",
			new: "other-absolute\n",
		});

		const subdirectory = join(otherWorktree, "nested");
		mkdirSync(subdirectory);
		const fromSubdirectory = dispatchChore(
			["run", "--json"],
			libraryDeps("seat-b", subdirectory, otherWorktree),
		);
		expect(fromSubdirectory.exitCode).toBe(0);
		const subdirectoryReport = JSON.parse(fromSubdirectory.stdout) as {
			chores: Array<{ name: string; new: string | null; status: string }>;
		};
		expect(subdirectoryReport.chores).not.toContainEqual(
			expect.objectContaining({ status: "not-probeable" }),
		);
		expect(subdirectoryReport.chores.find((chore) => chore.name === "repo-relative")).toMatchObject(
			{
				status: "changed-value",
				new: "other-relative\n",
			},
		);
	});

	it("validates add/update probe/full paths by resolved worktree containment", () => {
		writeFileSync(join(repoRoot, "inside.txt"), "inside\n");
		const externalProbe = join(root, "machine-local-probe.sh");
		writeFileSync(externalProbe, "#!/bin/sh\nprintf local\n");
		const cases = [
			{ label: "parent", command: "cat ../machine-local-probe.sh" },
			{ label: "double-slash", command: `cat //${externalProbe.replace(/^\/+/, "")}` },
		] as const;

		for (const field of ["probe", "full"] as const) {
			const args = [
				"add",
				`inside-add-${field}`,
				"--probe",
				"cat inside.txt",
				...(field === "full" ? ["--full", "cat inside.txt"] : []),
				"--scope",
				"repo",
			];
			const accepted = dispatchChore(args, libraryDeps());
			expect(accepted.exitCode).toBe(0);
		}

		const rosterPath = join(repoRoot, ".pij", "chores.json");
		for (const field of ["probe", "full"] as const) {
			for (const item of cases) {
				const before = readFileSync(rosterPath, "utf8");
				const args = [
					"add",
					`refused-add-${field}-${item.label}`,
					"--probe",
					field === "probe" ? item.command : "cat inside.txt",
					...(field === "full" ? ["--full", item.command] : []),
					"--scope",
					"repo",
				];
				const refused = dispatchChore(args, libraryDeps());
				expect(refused.exitCode).toBe(64);
				expect(refused.stderr).toContain(
					`repo-scoped chore ${field} path resolves outside this worktree`,
				);
				expect(refused.stderr).toContain("Use a repo-relative path");
				expect(refused.stderr).toContain("--scope seat or --scope fleet");
				expect(readFileSync(rosterPath, "utf8")).toBe(before);
			}
		}

		expect(
			dispatchChore(
				[
					"add",
					"update-target",
					"--probe",
					"cat inside.txt",
					"--full",
					"cat inside.txt",
					"--scope",
					"repo",
				],
				libraryDeps(),
			).exitCode,
		).toBe(0);
		for (const field of ["probe", "full"] as const) {
			const accepted = dispatchChore(
				["update", "repo:update-target", `--${field}`, "cat inside.txt"],
				libraryDeps(),
			);
			expect(accepted.exitCode).toBe(0);
			for (const item of cases) {
				const before = readFileSync(rosterPath, "utf8");
				const refused = dispatchChore(
					["update", "repo:update-target", `--${field}`, item.command],
					libraryDeps(),
				);
				expect(refused.exitCode).toBe(64);
				expect(refused.stderr).toContain(
					`repo-scoped chore ${field} path resolves outside this worktree`,
				);
				expect(readFileSync(rosterPath, "utf8")).toBe(before);
			}
		}
	});

	it("accepts static multi-argument commands and refuses unknown executables by default", () => {
		writeRepoGrammarFixtures();
		expect(
			dispatchChore(
				[
					"add",
					"static-multiword",
					"--probe",
					STATIC_REPO_COMMAND,
					"--full",
					STATIC_REPO_COMMAND,
					"--scope",
					"repo",
				],
				libraryDeps(),
			).exitCode,
		).toBe(0);
		const rosterPath = join(repoRoot, ".pij", "chores.json");
		for (const field of ["probe", "full"] as const) {
			expect(
				dispatchChore(
					["update", "repo:static-multiword", `--${field}`, STATIC_REPO_COMMAND],
					libraryDeps(),
				).exitCode,
			).toBe(0);
		}
		const beforeUnknown = readFileSync(rosterPath, "utf8");
		const unknown = dispatchChore(
			["add", "unknown-default", "--probe", "mystery-probe static-arg", "--scope", "repo"],
			libraryDeps(),
		);
		expect(unknown.exitCode).toBe(64);
		expect(unknown.stderr).toContain("repo-scoped chore probe could not be proven static");
		expect(unknown.stderr).toContain(
			"executable 'mystery-probe' is not in the repo command allow-list",
		);
		expect(readFileSync(rosterPath, "utf8")).toBe(beforeUnknown);
	});

	it.each(
		DYNAMIC_REPO_COMMAND_CASES,
	)("refuses $label across add/update and probe/full without roster mutation", (item) => {
		writeRepoGrammarFixtures();
		expect(
			dispatchChore(
				[
					"add",
					"dynamic-target",
					"--probe",
					STATIC_REPO_COMMAND,
					"--full",
					STATIC_REPO_COMMAND,
					"--scope",
					"repo",
				],
				libraryDeps(),
			).exitCode,
		).toBe(0);
		const rosterPath = join(repoRoot, ".pij", "chores.json");

		for (const field of ["probe", "full"] as const) {
			const before = readFileSync(rosterPath, "utf8");
			const refused = dispatchChore(
				[
					"add",
					`dynamic-add-${field}`,
					"--probe",
					field === "probe" ? item.command : STATIC_REPO_COMMAND,
					...(field === "full" ? ["--full", item.command] : []),
					"--scope",
					"repo",
				],
				libraryDeps(),
			);
			expect(refused.exitCode).toBe(64);
			expect(refused.stderr).toContain(`repo-scoped chore ${field} ${item.category}`);
			expect(refused.stderr).toContain(item.reason);
			expect(refused.stderr).toContain("--scope seat or --scope fleet");
			expect(readFileSync(rosterPath, "utf8")).toBe(before);
		}

		for (const field of ["probe", "full"] as const) {
			const before = readFileSync(rosterPath, "utf8");
			const refused = dispatchChore(
				["update", "repo:dynamic-target", `--${field}`, item.command],
				libraryDeps(),
			);
			expect(refused.exitCode).toBe(64);
			expect(refused.stderr).toContain(`repo-scoped chore ${field} ${item.category}`);
			expect(refused.stderr).toContain(item.reason);
			expect(refused.stderr).toContain("--scope seat or --scope fleet");
			expect(readFileSync(rosterPath, "utf8")).toBe(before);
		}
	});

	it("allows only exact safe runner flags before the repo script path", () => {
		mkdirSync(join(repoRoot, "scripts"));
		writeFileSync(join(repoRoot, "scripts", "probe.py"), "print('inside')\n");
		writeFileSync(join(repoRoot, "scripts", "probe.js"), "console.log('inside');\n");
		writeFileSync(join(repoRoot, "scripts", "probe.sh"), "printf inside\n");
		const accepted = [
			{
				name: "safe-node-flag",
				command: "node --no-warnings ./scripts/probe.js arg",
			},
			{
				name: "safe-python-flag",
				command: "python3 -u ./scripts/probe.py arg",
			},
		] as const;
		for (const item of accepted) {
			expect(
				dispatchChore(["add", item.name, "--probe", item.command, "--scope", "repo"], libraryDeps())
					.exitCode,
			).toBe(0);
		}

		expect(
			dispatchChore(
				[
					"add",
					"runner-target",
					"--probe",
					"node ./scripts/probe.js arg",
					"--full",
					"node ./scripts/probe.js arg",
					"--scope",
					"repo",
				],
				libraryDeps(),
			).exitCode,
		).toBe(0);
		const cases = [
			{
				label: "equals-print",
				command: "node --print=process.env.HOME ./scripts/probe.js",
				runner: "node",
				flag: "--print=process.env.HOME",
			},
			{
				label: "unknown-safe-looking",
				command: "node --title=probe ./scripts/probe.js",
				runner: "node",
				flag: "--title=probe",
			},
			{
				label: "bundled-shell",
				command: "sh -eu ./scripts/probe.sh",
				runner: "sh",
				flag: "-eu",
			},
		] as const;
		const rosterPath = join(repoRoot, ".pij", "chores.json");

		for (const field of ["probe", "full"] as const) {
			for (const item of cases) {
				const before = readFileSync(rosterPath, "utf8");
				const refused = dispatchChore(
					[
						"add",
						`runner-add-${field}-${item.label}`,
						"--probe",
						field === "probe" ? item.command : "node ./scripts/probe.js arg",
						...(field === "full" ? ["--full", item.command] : []),
						"--scope",
						"repo",
					],
					libraryDeps(),
				);
				expect(refused.exitCode).toBe(64);
				expect(refused.stderr).toContain(
					`runner flag '${item.flag}' is not permitted for '${item.runner}'`,
				);
				expect(readFileSync(rosterPath, "utf8")).toBe(before);
			}
		}

		for (const field of ["probe", "full"] as const) {
			for (const item of cases) {
				const before = readFileSync(rosterPath, "utf8");
				const refused = dispatchChore(
					["update", "repo:runner-target", `--${field}`, item.command],
					libraryDeps(),
				);
				expect(refused.exitCode).toBe(64);
				expect(refused.stderr).toContain(
					`runner flag '${item.flag}' is not permitted for '${item.runner}'`,
				);
				expect(readFileSync(rosterPath, "utf8")).toBe(before);
			}
		}
	});

	it("still warns fleet-roster authors about absolute paths", () => {
		const absoluteProbe = `cat ${join(repoRoot, "shared.txt")}`;
		const fleet = dispatchChore(
			["add", "fleet-absolute", "--probe", absoluteProbe, "--scope", "fleet"],
			libraryDeps(),
		);
		expect(fleet.exitCode).toBe(0);
		expect(fleet.stderr).toContain("WARN: fleet:fleet-absolute probe contains an absolute path");
		expect(fleet.stderr).not.toContain("NOTE: commit");
	});

	it("warns when a shared chore invokes a pij verb refused to PA seats", () => {
		const result = dispatchChore(
			["add", "baton-holders", "--probe", "pij orchestration baton show", "--scope", "repo"],
			libraryDeps(),
		);
		expect(result.exitCode).toBe(0);
		expect(result.stderr).toContain("WARN: repo:baton-holders probe invokes 'pij orchestration'");
		expect(result.stderr).toContain("permanently NOT-PROBEABLE for less-capable seats");
	});

	it("updates a chore in place and preserves its creator attribution", () => {
		expect(
			dispatchChore(
				["add", "editable", "--probe", "printf before", "--scope", "fleet"],
				libraryDeps(),
			).exitCode,
		).toBe(0);

		const updated = dispatchChore(
			["update", "fleet:editable", "--probe", "printf after", "--full", "printf context"],
			libraryDeps(),
		);
		expect(updated.exitCode).toBe(0);
		expect(updated.stdout).toContain("updated fleet:editable");

		const roster = JSON.parse(readFileSync(join(pijHome, "pij-chores", "chores.json"), "utf8")) as {
			chores: Array<{ probe: string; creatorSeatId?: string }>;
		};
		expect(roster.chores).toEqual([
			expect.objectContaining({
				probe: "printf after",
				creatorSeatId: "seat-a",
			}),
		]);

		const verbose = dispatchChore(["list", "--verbose"], libraryDeps());
		expect(verbose.stdout).toContain("fleet:editable");
		expect(verbose.stdout).toContain("creator=seat-a");
		const json = JSON.parse(dispatchChore(["list", "--json"], libraryDeps()).stdout) as {
			scopes: { seat: string | null };
			chores: Array<{
				key: string;
				creatorSeatId: string | null;
			}>;
		};
		expect(json.scopes.seat).toBe("seat-a");
		expect(json.chores).toContainEqual(
			expect.objectContaining({
				key: "fleet:editable",
				creatorSeatId: "seat-a",
			}),
		);
	});

	it("ignores unknown roster and state fields while list, run, and ack keep working", () => {
		expect(
			dispatchChore(["add", "future", "--probe", "printf value"], libraryDeps()).exitCode,
		).toBe(0);
		expect(dispatchChore(["run"], libraryDeps()).exitCode).toBe(0);

		const rosterPath = join(pijHome, "seat-a", "chores.json");
		const roster = JSON.parse(readFileSync(rosterPath, "utf8")) as {
			chores: Array<Record<string, unknown>>;
			[key: string]: unknown;
		};
		roster.futureRoot = { version: 2 };
		if (roster.chores[0]) roster.chores[0].futureChore = "ignored";
		writeFileSync(rosterPath, JSON.stringify(roster));

		const statePath = join(pijHome, "seat-a", "chore-state.json");
		const state = JSON.parse(readFileSync(statePath, "utf8")) as {
			entries: Record<string, Record<string, unknown>>;
			[key: string]: unknown;
		};
		state.futureRoot = { version: 2 };
		const entry = state.entries["seat:future"];
		if (entry) {
			entry.futureEntry = "ignored";
			entry.lastStatus = "future-status";
			const pending = entry.pending;
			if (typeof pending === "object" && pending !== null) {
				(pending as Record<string, unknown>).futurePending = "ignored";
			}
		}
		writeFileSync(statePath, JSON.stringify(state));

		expect(dispatchChore(["list", "--verbose"], libraryDeps()).exitCode).toBe(0);
		expect(dispatchChore(["run"], libraryDeps()).stdout).toContain("CHANGED-VALUE seat:future:");
		expect(dispatchChore(["ack", "future"], libraryDeps()).exitCode).toBe(0);
		expect(dispatchChore(["run"], libraryDeps()).stdout).toContain("NO CHANGE");
	});

	it("reports direct roster probe edits as re-instrumentation, not world movement", () => {
		expect(
			dispatchChore(["add", "instrument", "--probe", "printf old"], libraryDeps()).exitCode,
		).toBe(0);
		expect(dispatchChore(["run"], libraryDeps()).exitCode).toBe(0);
		expect(dispatchChore(["ack", "instrument"], libraryDeps()).exitCode).toBe(0);

		const rosterPath = join(pijHome, "seat-a", "chores.json");
		const roster = JSON.parse(readFileSync(rosterPath, "utf8")) as {
			chores: Array<{ name: string; probe: string }>;
		};
		const instrument = roster.chores.find((chore) => chore.name === "instrument");
		expect(instrument).toBeDefined();
		if (instrument) instrument.probe = "printf new";
		writeFileSync(rosterPath, JSON.stringify(roster));

		const changedInstrument = dispatchChore(["run"], libraryDeps());
		expect(changedInstrument.stdout).toContain(
			"CHANGED-PROBE seat:instrument: instrument changed; ack resets baseline",
		);
		expect(changedInstrument.stdout).not.toMatch(/^CHANGED-VALUE seat:instrument/m);
		expect(changedInstrument.stdout).toContain("  | new");

		expect(dispatchChore(["run"], libraryDeps()).stdout).toContain(
			"CHANGED-PROBE seat:instrument:",
		);
		expect(dispatchChore(["ack", "instrument"], libraryDeps()).exitCode).toBe(0);
		const next = dispatchChore(["run"], libraryDeps());
		expect(next.stdout).toContain("NO CHANGE — 1 chores probed, 0 moved");
		expect(next.stdout).toContain("UNCHANGED seat:instrument");
	});

	it("reports path-referenced script edits as probe changes, not value changes", () => {
		writeFileSync(join(repoRoot, "watched-script.txt"), "A");
		writeFileSync(join(repoRoot, "probe.sh"), "cat watched-script.txt\n");
		expect(
			dispatchChore(["add", "scripted", "--probe", "sh probe.sh"], libraryDeps()).exitCode,
		).toBe(0);
		expect(dispatchChore(["run"], libraryDeps()).exitCode).toBe(0);
		expect(dispatchChore(["ack", "scripted"], libraryDeps()).exitCode).toBe(0);

		writeFileSync(join(repoRoot, "watched-script.txt"), "B");
		const worldChange = dispatchChore(["run"], libraryDeps());
		expect(worldChange.stdout).toContain("CHANGED-VALUE seat:scripted:");
		expect(worldChange.stdout).not.toMatch(/^CHANGED-PROBE seat:scripted/m);

		writeFileSync(join(repoRoot, "probe.sh"), "printf instrument-v2\n");
		const probeChange = dispatchChore(["run"], libraryDeps());
		expect(probeChange.stdout).toContain(
			"CHANGED-PROBE seat:scripted: instrument changed; ack resets baseline",
		);
		expect(probeChange.stdout).toContain(
			"CHANGED-VALUE seat:scripted: pending before instrument changed",
		);
		expect(probeChange.stdout).toContain("  | A");
		expect(probeChange.stdout).toContain("  | B");
		expect(probeChange.stdout).toContain("  | instrument-v2");
		expect(dispatchChore(["run"], libraryDeps()).stdout).toContain(
			"CHANGED-VALUE seat:scripted: pending before instrument changed",
		);
		expect(dispatchChore(["ack", "scripted"], libraryDeps()).exitCode).toBe(0);
		expect(dispatchChore(["run"], libraryDeps()).stdout).toContain("UNCHANGED seat:scripted");
	});

	it("accepts free-text values that begin with dashes", () => {
		expect(
			dispatchChore(["add", "dash-probe", "--probe", "--not-a-flag"], libraryDeps()).exitCode,
		).toBe(0);
		const reason = "--full without --full-every is inert";
		const removed = dispatchChore(["remove", "seat:dash-probe", "--reason", reason], libraryDeps());
		expect(removed.exitCode).toBe(0);
		expect(removed.stdout).toContain(reason);
		const roster = JSON.parse(readFileSync(join(pijHome, "seat-a", "chores.json"), "utf8")) as {
			removals: Array<{ reason: string }>;
		};
		expect(roster.removals.at(-1)?.reason).toBe(reason);
	});

	it("keeps a repo chore baseline independent for two seats", () => {
		writeFileSync(join(repoRoot, "shared.txt"), "shared\n");
		expect(
			dispatchChore(
				["add", "shared", "--probe", "cat shared.txt", "--scope", "repo"],
				libraryDeps("seat-a"),
			).exitCode,
		).toBe(0);

		expect(dispatchChore(["run"], libraryDeps("seat-a")).stdout).toContain(
			"CHANGED-VALUE repo:shared",
		);
		expect(dispatchChore(["ack", "repo:shared"], libraryDeps("seat-a")).exitCode).toBe(0);
		expect(dispatchChore(["run"], libraryDeps("seat-a")).stdout).toContain("NO CHANGE");

		const seatB = dispatchChore(["run"], libraryDeps("seat-b"));
		expect(seatB.stdout).toContain("CHANGED-VALUE repo:shared:");
		expect(seatB.stdout).toContain("  OLD fingerprint=none");
		expect(readFileSync(join(pijHome, "seat-b", "chore-state.json"), "utf8")).not.toContain(
			'"baseline"',
		);
	});

	it("persists full-command cadence across fresh store instances on the third and sixth runs", () => {
		expect(
			dispatchChore(
				[
					"add",
					"periodic",
					"--probe",
					"printf fingerprint",
					"--full",
					"printf details",
					"--full-every",
					"3",
				],
				libraryDeps(),
			).exitCode,
		).toBe(0);
		expect(dispatchChore(["run"], libraryDeps()).stdout).toContain(
			"FULL seat:periodic\n  | details",
		);
		expect(dispatchChore(["ack", "periodic"], libraryDeps()).exitCode).toBe(0);

		const outputs = Array.from({ length: 6 }, () => dispatchChore(["run"], libraryDeps()).stdout);
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

	it("runs a configured full command on every delta even without a periodic cadence", () => {
		const watched = join(repoRoot, "full-on-delta.txt");
		writeFileSync(watched, "before");
		expect(
			dispatchChore(
				[
					"add",
					"full-on-delta",
					"--probe",
					"cat full-on-delta.txt",
					"--full",
					"cat full-on-delta.txt",
				],
				libraryDeps(),
			).exitCode,
		).toBe(0);
		expect(dispatchChore(["run"], libraryDeps()).stdout).toContain(
			"FULL seat:full-on-delta\n  | before",
		);
		expect(dispatchChore(["ack", "full-on-delta"], libraryDeps()).exitCode).toBe(0);

		writeFileSync(watched, "after");
		const human = dispatchChore(["run"], libraryDeps());
		expect(human.stdout).toContain("CHANGED-VALUE seat:full-on-delta:");
		expect(human.stdout).toContain("FULL seat:full-on-delta\n  | after");

		const json = JSON.parse(dispatchChore(["run", "--json"], libraryDeps()).stdout) as {
			chores: Array<{ name: string; fullOutput?: string }>;
		};
		expect(json.chores.find((item) => item.name === "full-on-delta")?.fullOutput).toBe("after");
	});

	it("remove then re-add starts from a clean first observation", () => {
		expect(
			dispatchChore(["add", "replaceable", "--probe", "printf stable"], libraryDeps()).exitCode,
		).toBe(0);
		expect(dispatchChore(["run"], libraryDeps()).stdout).toContain(
			"CHANGED-VALUE seat:replaceable",
		);
		expect(dispatchChore(["ack", "replaceable"], libraryDeps()).exitCode).toBe(0);
		expect(dispatchChore(["run"], libraryDeps()).stdout).toContain("NO CHANGE");

		expect(
			dispatchChore(["remove", "seat:replaceable", "--reason", "replace definition"], libraryDeps())
				.exitCode,
		).toBe(0);
		expect(
			dispatchChore(["add", "replaceable", "--probe", "printf stable"], libraryDeps()).exitCode,
		).toBe(0);

		expect(dispatchChore(["run"], libraryDeps()).stdout).toContain(
			"CHANGED-VALUE seat:replaceable:",
		);
	});
});
