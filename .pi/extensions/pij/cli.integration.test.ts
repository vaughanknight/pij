// pij-messaging — Phase 5 two-peer integration smoke (AC-1,3,5,7,8,9,10,11,13).
//
// The Driver `Step` union is TUI-only and `pijHome` was hardcoded, so a literal
// "two real pi windows" smoke can neither be sandboxed nor asserted through. This
// proves the SAME two-peer protocol deterministically and in-CI (runs under
// `just test`): two real `PijSession` coordinators + the real fs adapters over a
// tmp `PIJ_HOME`, observed end-to-end through the real `cli.ts` bin (subprocess).
//
// What stays local-only (tmux + pi binary): the in-pi boot/announce proof —
// `.pi/extensions/pij/smoke.ts` (`/pij` status line via the Driver SDK).

import { execFileSync, spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir, uptime } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FsChannel } from "./adapters/channel.js";
import { FsEventLog } from "./adapters/event-log.js";
import { FakePiRuntime } from "./adapters/fakes.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { NodeProcess } from "./adapters/process.js";
import { FsSpawnExpectationStore } from "./adapters/spawn-expectation-store.js";
import { FsSpineLog } from "./adapters/spine-store.js";
import { SqliteQueue } from "./adapters/sqlite-queue.js";
import { verifyPersistedAdoptDescriptor } from "./cli.js";
import { reattachIdentity } from "./core/binding.js";
import { transcriptDir } from "./core/harness/claude.js";
import { PA_VERB_CLASSIFICATION } from "./core/orchestration/pa-capability.js";
import { renderSpineMd } from "./core/platform/render-spine-md.js";
import type { BootInput, PijPorts } from "./core/session.js";
import { PijSession } from "./core/session.js";
import { DEFAULT_SPAWN_EXPECTATION_TTL_MS } from "./core/spawn-expectation.js";
import type { PijMessage, SessionDescriptor } from "./core/types.js";

const CLI = join(import.meta.dirname, "cli.ts");
const TSX = join(import.meta.dirname, "..", "..", "..", "node_modules", ".bin", "tsx");
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

let HOME: string;
let FOLDER: string;
let BIN: string;
/** A PATH with NOTHING on it — the s072 FIX-2 "tmux binary absent" case. */
let EMPTY_BIN: string;
let TMUX_LOG: string;

function clearSpawnExpectations(): void {
	rmSync(join(HOME, "spawn-expectations"), { recursive: true, force: true });
}

function prelaunchSnapshots(): string[] {
	return readFileSync(TMUX_LOG, "utf8")
		.split("\n")
		.filter((line) => line.startsWith("PRELAUNCH ") && line.includes('"spawnId"'));
}

/** Run the real cli.ts bin in the sandbox. Returns stdout + exit code. */
function pij(
	args: string[],
	extraEnv: Record<string, string> = {},
	cwd = FOLDER,
): { out: string; code: number } {
	const env = {
		...process.env,
		PIJ_HOME: HOME,
		PIJ_QUEUE_BACKEND: "fs",
		PATH: `${BIN}:${process.env.PATH ?? ""}`,
		TMUX_PANE: "%1",
		CLAUDE_CODE_SESSION_ID: "",
		COPILOT_AGENT_SESSION_ID: "",
		CODEX_THREAD_ID: "",
		FAKE_TMUX_CWD: cwd,
		FAKE_TMUX_PID: String(process.pid),
		FAKE_TMUX_LOG: TMUX_LOG,
		...extraEnv,
	};
	try {
		const out = execFileSync(TSX, [CLI, ...args], {
			cwd,
			env,
			encoding: "utf8",
			timeout: 10_000,
		});
		return { out, code: 0 };
	} catch (e) {
		const err = e as { status?: number; stdout?: string; stderr?: string };
		return { out: (err.stdout ?? "") + (err.stderr ?? ""), code: err.status ?? 1 };
	}
}

/** Boot a real PijSession over the sandbox home (real adapters, faked pi runtime). */
function boot(id: string, role: "parent" | "worker", idle = true): PijSession {
	const dataDir = join(HOME, id);
	const ports: PijPorts = {
		registry: new FsRegistry(HOME),
		eventLog: new FsEventLog(HOME, id),
		delivery: new FsChannel(HOME),
		pi: new FakePiRuntime(idle),
		process: new NodeProcess(), // real pid => CLI liveness sees it alive
	};
	const input: BootInput = {
		id,
		role,
		folder: FOLDER,
		dataDir,
		eventsPath: join(dataDir, "events.ndjson"),
	};
	const s = new PijSession(ports);
	s.boot(input);
	return s;
}

function createCopilotState(home: string, sessionId: string, mtimeMs: number): void {
	const dir = join(home, ".copilot", "session-state", sessionId);
	mkdirSync(dir, { recursive: true });
	const at = new Date(mtimeMs);
	utimesSync(dir, at, at);
}

let A: PijSession;
let B: PijSession;

beforeAll(() => {
	HOME = mkdtempSync(join(tmpdir(), "pij-smoke-"));
	// realpath: on macOS mkdtemp returns a /var symlink; the CLI's `--here` reads
	// the real cwd, so the descriptor folder must be the resolved path to match.
	FOLDER = realpathSync(mkdtempSync(join(tmpdir(), "pij-folder-")));
	BIN = mkdtempSync(join(tmpdir(), "pij-bin-"));
	EMPTY_BIN = mkdtempSync(join(tmpdir(), "pij-emptybin-"));
	TMUX_LOG = join(HOME, "tmux.log");
	const tmux = join(BIN, "tmux");
	writeFileSync(
		tmux,
		`#!/bin/sh
printf '%s\n' "$*" >> "$FAKE_TMUX_LOG"
if [ "$1" = "split-window" ] || [ "$1" = "new-window" ]; then
	for expectation in "$PIJ_HOME"/spawn-expectations/*.json; do
		if [ -f "$expectation" ]; then
			printf 'PRELAUNCH ' >> "$FAKE_TMUX_LOG"
			cat "$expectation" >> "$FAKE_TMUX_LOG"
			printf '\n' >> "$FAKE_TMUX_LOG"
		fi
	done
fi
if [ "$FAKE_TMUX_FAIL" = "1" ] && { [ "$1" = "split-window" ] || [ "$1" = "new-window" ]; }; then
	exit 1
fi
if [ -n "$FAKE_TMUX_DELETE_DESCRIPTOR" ] && { [ "$1" = "split-window" ] || [ "$1" = "new-window" ]; }; then
	rm -f "$PIJ_HOME/$FAKE_TMUX_DELETE_DESCRIPTOR.json"
fi
case "$1" in
	display-message)
		if [ "$FAKE_TMUX_NO_SERVER" = "1" ]; then
			printf 'error connecting to /tmp/tmux-501/default (No such file or directory)\n' >&2
			exit 1
		fi
		case "$*" in
			*pane_current_path*) printf '%s\t%s\n' "$FAKE_TMUX_CWD" "$FAKE_TMUX_PID" ;;
			# s072 FIX-1: the pane-IDENTITY probe. Real tmux exits 0 with an EMPTY
			# body when the server is up but the addressed pane does not exist, so
			# the shim must too — "no such pane" is an answer, and it is the one
			# that lets the classifier say \`gone\` rather than \`unprobed\`.
			*pane_dead*pane_pid*)
				if [ "$4" = "\${FAKE_TMUX_LIVE_PANE:-%none}" ]; then
					printf '0,%s\n' "$FAKE_TMUX_PID"
				fi
				;;
			# The pid of whatever occupies a pane RIGHT NOW (focusPanePid), as
			# distinct from the identity probe above. Overridable so a test can put
			# a DIFFERENT process in the pane it attaches to — the real machine
			# never hands the same pid to two panes, but this shim otherwise would.
			*pane_pid*) printf '%s\n' "\${FAKE_TMUX_FOCUS_PID:-$FAKE_TMUX_PID}" ;;
			*session_name*) printf 'pij-test\n' ;;
			*pane_dead*) if [ "$4" = "\${FAKE_TMUX_LIVE_PANE:-%none}" ]; then printf '0\n'; else printf '1\n'; fi ;;
			*window_id*) printf '@9\n' ;;
		esac
		;;
	list-panes) printf '%s\n' "\${TMUX_PANE:-%1}" ;;
	list-windows) exit 0 ;;
	split-window) printf '%%91\n' ;;
	new-window) printf '%%90\n' ;;
esac
`,
	);
	chmodSync(tmux, 0o755);
	A = boot("pij-A", "parent");
	B = boot("pij-B", "worker");
	boot("pij-C2", "worker");
	// Seed B with a couple of activity events so tail/state have content.
	B.capture("tool_call", { toolName: "bash" });
	B.capture("message", { role: "assistant" });
});

afterAll(() => {
	rmSync(HOME, { recursive: true, force: true });
	rmSync(FOLDER, { recursive: true, force: true });
	rmSync(BIN, { recursive: true, force: true });
	rmSync(EMPTY_BIN, { recursive: true, force: true });
});

describe("pij two-peer integration (real coordinators + real CLI over sandbox PIJ_HOME)", () => {
	it("top-level help advertises the prime list filter", () => {
		const result = pij(["--help"]);
		expect(result.code).toBe(0);
		expect(result.out).toContain("pij list [--here] [--prime] [--archived] [--badge] [--json]");
		expect(result.out).toContain("pij tree [<id> | --global]");
		expect(result.out).toContain("pij link <child> --parent <parent> | --root");
		expect(result.out).toContain('pij adopt "$TMUX_PANE" --harness <h> [--parent <id>]');
	});

	it("report help prints only the report family block", () => {
		const result = pij(["report", "--help"]);
		expect(result.code).toBe(0);
		expect(result.out).toContain('pij report now "<did>" "<next>"');
		expect(result.out).toContain("pij report state <state>");
		expect(result.out).toContain("pij report clear");
		expect(result.out).toContain("pij report verify <node>");
		expect(result.out).not.toContain("pij spawn");
	});

	it("top-level help and skill guidance distinguish pull from push delivery", () => {
		const result = pij(["--help"]);
		expect(result.code).toBe(0);
		expect(result.out).toContain("non-tmux external peers use 'pij inbox --wait'");
		expect(result.out).toContain("tmux/pi stay push-first");

		const routing = readFileSync(join(REPO_ROOT, "skills/pij/references/00-routing.md"), "utf8");
		const peer = readFileSync(join(REPO_ROOT, "skills/pij/references/routes/peer.md"), "utf8");
		const skillGuidance = `${routing}\n${peer}`;
		const tableCells = (prefix: string): string[] => {
			const row = routing.split("\n").find((line) => line.startsWith(prefix));
			if (!row) throw new Error(`missing routing row: ${prefix}`);
			return row
				.split("|")
				.slice(1, -1)
				.map((cell) => cell.trim());
		};
		expect(tableCells("| Intent |")).toEqual([
			"Intent",
			"pi push",
			"tmux control-plane push",
			"external pull",
		]);
		expect(tableCells("| receive |")).toEqual([
			"receive",
			"automatic injected turn",
			"automatic daemon-injected turn",
			"`pij inbox --wait [ms]`",
		]);
		expect(routing).toContain("Pi injects in-process.");
		expect(peer).toContain(
			"pij inbox --wait [ms]    # non-tmux receive path; first use auto-registers",
		);
		expect(peer).toContain("Pi/tmux replies arrive as `[pij from <id>]` injected turns.");
		expect(peer).toContain("This is pull delivery, not `pij state` polling (§ C7).");
		const deliveryOwner = routing.indexOf("| E | Delivery owner |");
		const selfRegistration = routing.indexOf("| F | Self registration |");
		expect(deliveryOwner).toBeGreaterThanOrEqual(0);
		expect(selfRegistration).toBeGreaterThan(deliveryOwner);
		expect(routing).toContain(
			"Delivery-owner detection happens before any self-registration advice.",
		);
		expect(tableCells("| prereq |")).toEqual([
			"prereq",
			"pi extension loaded",
			`daemon (spawn auto-starts it) + self-adopt once using only the exact non-empty current-process pane: \`pij adopt "$TMUX_PANE" --harness <h> \${PIJ_PARENT_ID:+--parent "$PIJ_PARENT_ID"}\``,
			"`pij inbox register` or first `pij inbox --wait` — auto-registers the ambient session as pull-owned",
		]);

		const externalPullBan = [
			"Empty or absent `TMUX_PANE` means external pull mode.",
			"In external pull mode, never run `tmux list-panes`, `tmux display-message`, or any other pane-discovery command.",
			"Never infer, guess, select, or adopt any pane id.",
			"Redirect `/pij adopt` intent to `pij inbox register` (or the first `pij inbox --wait`, which auto-registers).",
		];
		for (const clause of externalPullBan) {
			expect(routing).toContain(clause);
			expect(peer).toContain(clause);
		}
		const exactTmuxAdopt = `Tmux self-adopt may use only the exact non-empty \`$TMUX_PANE\` supplied by the current process: \`pij adopt "$TMUX_PANE" --harness <h> \${PIJ_PARENT_ID:+--parent "$PIJ_PARENT_ID"}\`.`;
		expect(routing).toContain(exactTmuxAdopt);
		expect(peer).toContain(
			'Tmux control-plane mode needs one-time self-adopt using only the exact non-empty `$TMUX_PANE` supplied by the current process: `pij adopt "$TMUX_PANE" --harness <h>`.',
		);
		expect(peer).toContain(
			"`E-NOID` for self outside tmux | run `pij inbox --wait` or `pij inbox register`",
		);
		const externalIdentity = peer.indexOf("**External pull identity — first action**");
		const externalRegister = peer.indexOf("pij inbox register --json", externalIdentity);
		const externalWhoami = peer.indexOf("pij whoami [--json]", externalIdentity);
		expect(externalIdentity).toBeGreaterThanOrEqual(0);
		expect(externalRegister).toBeGreaterThan(externalIdentity);
		expect(externalWhoami).toBeGreaterThan(externalRegister);
		expect(routing).toContain(
			"In external pull mode, `pij inbox register --json` is the first identity action",
		);
		expect(skillGuidance).not.toMatch(/E-NOID[^\n]*adopt first/i);
		expect(skillGuidance).not.toContain("adopt before anything conversational");
	});

	it("skill guidance routes first-person reports and retires completion self-pause", () => {
		const skill = readFileSync(join(REPO_ROOT, "skills/pij/SKILL.md"), "utf8");
		const routing = readFileSync(join(REPO_ROOT, "skills/pij/references/00-routing.md"), "utf8");
		const node = readFileSync(join(REPO_ROOT, "skills/pij/references/routes/node.md"), "utf8");
		const watchdog = readFileSync(join(REPO_ROOT, "docs/how/pij-watchdog.md"), "utf8");

		expect(skill).toContain("`report` (`now/question/blocked/state/clear/verify`)");
		expect(node).toContain("Everything under `report` is a first-person claim about yourself.");
		expect(node).toContain('pij report question "<what I need from you>"');
		expect(node).toContain('pij report blocked "<what I am waiting on>"');
		expect(node).toMatch(/Actively working has no semantic\s+state\s+word/);
		expect(node).toContain("Inline markdown is supported");
		expect(node).toContain("newlines are refused");

		const liveGuidance = `${routing}\n${watchdog}`;
		expect(liveGuidance).toContain("If done, run `pij report state done`");
		expect(liveGuidance).not.toContain("If done, pause me");
		expect(liveGuidance).not.toContain("pause the watchdog explicitly");
		expect(liveGuidance).not.toContain("Genuinely done → `pij watchdog pause");
		expect(liveGuidance).not.toContain("self-pause (`pij watchdog pause");
	});

	it("auto-registers an ambient session before E-NOREG and aliases adopt --current", {
		timeout: 30_000,
	}, () => {
		const registrationHome = mkdtempSync(join(tmpdir(), "pij-current-registration-"));
		const nativeId = "claude-current-registration";
		const env = {
			PIJ_HOME: registrationHome,
			PIJ_SESSION_ID: "",
			TMUX_PANE: "",
			CLAUDE_CODE_SESSION_ID: nativeId,
			COPILOT_AGENT_SESSION_ID: "",
			CODEX_THREAD_ID: "",
		};
		try {
			const first = pij(["inbox", "register", "--json"], env);
			expect(first.code).toBe(0);
			const registered = JSON.parse(first.out) as {
				id: string;
				harness: string;
				harnessSessionId: string;
				deliveryMode: string;
				existing: boolean;
			};
			expect(registered).toMatchObject({
				harness: "claude",
				harnessSessionId: nativeId,
				deliveryMode: "pull",
				existing: false,
			});

			const registry = new FsRegistry(registrationHome);
			const descriptor = registry.read(registered.id);
			expect(descriptor).toMatchObject({
				id: registered.id,
				harness: "claude",
				harnessSessionId: nativeId,
				deliveryMode: "pull",
				lifecycle: "bound",
				folder: FOLDER,
			});
			if (!descriptor) throw new Error("missing registered descriptor");
			// Declares "cli" — `prime` is a CLI-owned field, and this line is standing in
			// for the verb that would set it (plan 071 review §1.2).
			registry.write({ ...descriptor, prime: true }, "cli");

			const repeat = JSON.parse(pij(["inbox", "register", "--json"], env).out);
			expect(repeat).toMatchObject({ id: registered.id, existing: true });
			expect(registry.read(registered.id)?.prime).toBe(true);

			const alias = JSON.parse(pij(["adopt", "--current", "--json"], env).out);
			expect(alias).toMatchObject({ id: registered.id, existing: true });
			expect(pij(["--help"], env).out).toContain("pij inbox [check|register]");
		} finally {
			rmSync(registrationHome, { recursive: true, force: true });
		}
	});

	it("rejects and repairs a contaminated external ambient identity in place", {
		timeout: 30_000,
	}, () => {
		const repairHome = mkdtempSync(join(tmpdir(), "pij-contaminated-identity-"));
		const nativeId = "claude-contaminated-current";
		const id = "pij-contaminated";
		const dataDir = join(repairHome, id);
		const eventsPath = join(dataDir, "events.ndjson");
		const startedAt = "2026-07-01T00:00:00.000Z";
		const lastEventAt = "2026-07-12T00:00:00.000Z";
		const reportedAt = "2026-07-11T01:00:00.000Z";
		const env = {
			PIJ_HOME: repairHome,
			PIJ_SESSION_ID: "",
			TMUX_PANE: "",
			CLAUDE_CODE_SESSION_ID: nativeId,
			COPILOT_AGENT_SESSION_ID: "",
			CODEX_THREAD_ID: "",
		};
		try {
			const registry = new FsRegistry(repairHome);
			registry.write({
				id,
				role: "worker",
				prime: true,
				folder: "/stale",
				dataDir,
				eventsPath,
				pid: 7,
				startedAt,
				state: "working",
				lastEventAt,
				lastTickAt: "2026-07-12T00:00:01.000Z",
				paneId: "%0",
				spawnedBy: "pij-parent",
				harness: "claude",
				harnessSessionId: nativeId,
				plannedHarnessSessionId: nativeId,
				initInjectedAt: "2026-07-01T00:00:01.000Z",
				lifecycle: "bound",
				transcriptsAtSpawn: ["/stale/before.jsonl"],
				branchedFrom: "claude-source",
				boundModel: "claude-sonnet-5",
				effort: "xhigh",
				failureReason: "dead",
				agentPack: "flowspace-search",
				agentPackDir: join(dataDir, "pack"),
				agentOnce: true,
				reportedAt,
			});

			const exactPane = pij(["whoami", "--json"], { ...env, TMUX_PANE: "%0" });
			expect(exactPane.code).toBe(0);
			expect(JSON.parse(exactPane.out)).toMatchObject({ id });
			const exactRegistration = pij(["inbox", "register", "--json"], {
				...env,
				TMUX_PANE: "%0",
			});
			expect(exactRegistration.code).toBe(0);
			expect(JSON.parse(exactRegistration.out)).toMatchObject({
				id,
				deliveryMode: "push",
				existing: true,
			});
			expect(registry.read(id)).toMatchObject({ paneId: "%0", state: "working" });
			const takeover = pij(["inbox", "register", "--json"], { ...env, TMUX_PANE: "%9" });
			expect(takeover.code).toBe(2);
			expect(takeover.out).toContain('pij adopt "$TMUX_PANE"');
			expect(registry.read(id)).toMatchObject({ paneId: "%0", state: "working" });

			const rejected = pij(["whoami", "--json"], env);
			expect(rejected.code).toBe(2);
			expect(rejected.out).toContain("E-NOID");
			expect(rejected.out).toContain("pij inbox register");
			expect(rejected.out).not.toContain(`"id":"${id}"`);

			const explicitEnv = { ...env, PIJ_SESSION_ID: id };
			const explicitRejected = pij(["whoami", "--json"], explicitEnv);
			expect(explicitRejected.code).toBe(2);
			expect(explicitRejected.out).toContain("E-NOID");
			expect(explicitRejected.out).toContain("pij inbox register");
			expect(explicitRejected.out).not.toContain(`"id":"${id}"`);

			const repairedResult = pij(["inbox", "register", "--json"], env);
			expect(repairedResult.code).toBe(0);
			expect(JSON.parse(repairedResult.out)).toMatchObject({
				id,
				deliveryMode: "pull",
				existing: true,
			});
			const repaired = registry.read(id);
			expect(repaired).toMatchObject({
				id,
				role: "worker",
				prime: true,
				folder: FOLDER,
				dataDir,
				eventsPath,
				startedAt,
				state: "idle",
				lastEventAt,
				spawnedBy: "pij-parent",
				harness: "claude",
				harnessSessionId: nativeId,
				lifecycle: "bound",
				deliveryMode: "pull",
				branchedFrom: "claude-source",
				boundModel: "claude-sonnet-5",
				effort: "xhigh",
				agentPack: "flowspace-search",
				agentPackDir: join(dataDir, "pack"),
			});
			expect(repaired?.pid).toBeGreaterThan(1);
			expect(repaired?.pid).not.toBe(7);
			expect(repaired?.paneId).toBeUndefined();
			expect(repaired?.lastTickAt).toBeUndefined();
			expect(repaired?.failureReason).toBeUndefined();
			expect(repaired?.plannedHarnessSessionId).toBeUndefined();
			expect(repaired?.initInjectedAt).toBeUndefined();
			expect(repaired?.transcriptsAtSpawn).toBeUndefined();
			expect(repaired?.agentOnce).toBeUndefined();
			expect(repaired?.reportedAt).toBe(reportedAt);

			const repeat = pij(["inbox", "register", "--json"], env);
			expect(repeat.code).toBe(0);
			expect(JSON.parse(repeat.out)).toMatchObject({
				id,
				deliveryMode: "pull",
				existing: true,
			});
			const repeated = registry.read(id);
			if (!repaired || !repeated) throw new Error("missing repaired descriptor");
			const { pid: _firstPid, ...firstStable } = repaired;
			const { pid: _repeatPid, ...repeatStable } = repeated;
			expect(repeatStable).toEqual(firstStable);

			const resolved = pij(["whoami", "--json"], env);
			expect(resolved.code).toBe(0);
			expect(JSON.parse(resolved.out)).toMatchObject({ id });

			const explicitResolved = pij(["whoami", "--json"], explicitEnv);
			expect(explicitResolved.code).toBe(0);
			expect(JSON.parse(explicitResolved.out)).toMatchObject({ id });
		} finally {
			rmSync(repairHome, { recursive: true, force: true });
		}
	});

	it.each([
		{
			label: "invalid Copilot UUID",
			signals: { COPILOT_AGENT_SESSION_ID: "not-a-uuid" },
			error: "E-AMBIG",
		},
		{
			label: "Copilot UUID without matching session-state metadata",
			signals: {
				COPILOT_AGENT_SESSION_ID: "11111111-2222-4333-8444-555555555555",
			},
			error: "E-NOID",
		},
		{
			label: "invalid Codex UUID",
			signals: { CODEX_THREAD_ID: "not-a-uuid" },
			error: "E-AMBIG",
		},
		{
			label: "Codex UUID without matching rollout",
			signals: { CODEX_THREAD_ID: "aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb" },
			error: "E-NOID",
		},
	])("$label prevents pane/cwd fallback", { timeout: 30_000 }, ({ signals, error }) => {
		const probeHome = mkdtempSync(join(tmpdir(), "pij-invalid-ambient-"));
		const unrelatedId = "pij-unrelated-pane";
		try {
			new FsRegistry(probeHome).write({
				id: unrelatedId,
				folder: FOLDER,
				dataDir: join(probeHome, unrelatedId),
				eventsPath: join(probeHome, unrelatedId, "events.ndjson"),
				pid: process.pid,
				startedAt: "2026-07-12T00:00:00.000Z",
				paneId: "%1",
				harness: "claude",
				harnessSessionId: "unrelated-native",
				lifecycle: "bound",
			});
			const result = pij(["whoami", "--json"], {
				PIJ_HOME: probeHome,
				HOME: probeHome,
				USERPROFILE: probeHome,
				PIJ_SESSION_ID: "",
				CLAUDE_CODE_SESSION_ID: "",
				COPILOT_AGENT_SESSION_ID: "",
				CODEX_THREAD_ID: "",
				...signals,
			});
			expect(result.code).toBe(2);
			expect(result.out).toContain(error);
			expect(result.out).not.toContain(`"id":"${unrelatedId}"`);
		} finally {
			rmSync(probeHome, { recursive: true, force: true });
		}
	});

	// ~6 sequential real-CLI subprocess spawns; exceeds the 5s default on slow CI runners.
	it("sets, filters, unsets, and durably reattaches prime designations through the real CLI", {
		timeout: 30_000,
	}, () => {
		const selfSet = pij(["orchestration", "prime", "set", "--json"], {
			PIJ_SESSION_ID: "pij-A",
		});
		expect(selfSet.code).toBe(0);
		expect(JSON.parse(selfSet.out)).toEqual({
			id: "pij-A",
			prime: true,
			changed: true,
		});

		const explicitOther = pij(["orchestration", "prime", "set", "pij-B", "--json"], {
			PIJ_SESSION_ID: "",
		});
		expect(explicitOther.code).toBe(0);
		expect(JSON.parse(explicitOther.out)).toMatchObject({ id: "pij-B", prime: true });

		const primesHere = pij(["list", "--prime", "--here", "--json"]);
		expect(primesHere.code).toBe(0);
		expect(
			(JSON.parse(primesHere.out) as Array<{ id: string; prime: boolean }>).map(
				({ id, prime }) => ({
					id,
					prime,
				}),
			),
		).toEqual([
			{ id: "pij-A", prime: true },
			{ id: "pij-B", prime: true },
		]);

		const unset = pij(["orchestration", "prime", "unset", "--json"], {
			PIJ_SESSION_ID: "pij-A",
		});
		expect(JSON.parse(unset.out)).toMatchObject({ id: "pij-A", prime: false, changed: true });
		expect(new FsRegistry(HOME).read("pij-A")?.prime).toBe(false);

		const beforeUnknown = readFileSync(join(HOME, "pij-B.json"), "utf8");
		const unknown = pij(["orchestration", "prime", "set", "missing"], {
			PIJ_SESSION_ID: "",
		});
		expect(unknown.code).toBe(2);
		expect(unknown.out).toContain("E-NOID");
		expect(readFileSync(join(HOME, "pij-B.json"), "utf8")).toBe(beforeUnknown);

		const ambiguous = pij(["orchestration", "prime", "set"], { PIJ_SESSION_ID: "" });
		expect(ambiguous.code).toBe(2);
		expect(ambiguous.out).toContain("E-AMBIG");

		const registry = new FsRegistry(HOME);
		registry.write({
			id: "pij-durable",
			folder: FOLDER,
			dataDir: join(HOME, "pij-durable"),
			eventsPath: join(HOME, "pij-durable", "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-11T00:00:00.000Z",
			harness: "claude",
			harnessSessionId: "native-prime",
			lifecycle: "bound",
		});
		expect(pij(["orchestration", "prime", "set", "pij-durable"]).code).toBe(0);
		registry.remove("pij-durable");
		const snapshot = new FsRegistry(HOME).resolveIdentitySnapshot("claude", "native-prime");
		expect(snapshot).toMatchObject({ ok: true, value: { id: "pij-durable", prime: true } });
		if (!snapshot.ok || !snapshot.value) throw new Error("expected durable descriptor snapshot");
		new FsRegistry(HOME).write(
			reattachIdentity(snapshot.value, {
				harness: "claude",
				harnessSessionId: "native-prime",
				folder: FOLDER,
				pid: process.pid,
				paneId: "%99",
			}),
		);
		expect(new FsRegistry(HOME).read("pij-durable")?.prime).toBe(true);
	});

	it("rejects valued --prime=false instead of silently disabling the filter", () => {
		const result = pij(["list", "--prime=false", "--json"]);
		expect(result.code).toBe(64);
		expect(result.out).toContain("E-ARG");
		expect(result.out).toContain("--prime does not take a value");
		expect(result.out).not.toContain('"id":"pij-A"');
	});

	it("AC-1 discovery: list --here sees both peers in this folder", () => {
		const r = pij(["list", "--here"]);
		expect(r.code).toBe(0);
		expect(r.out).toContain("pij-A");
		expect(r.out).toContain("pij-B");
	});

	it("AC-5/whoami: PIJ_SESSION_ID resolves self unambiguously", () => {
		const r = pij(["whoami"], { PIJ_SESSION_ID: "pij-A" });
		expect(r.code).toBe(0);
		expect(r.out).toContain("pij-A");
	});

	it("AC-3 send: message reaches the peer's inbox on disk (raw body)", () => {
		const r = pij(["send", "pij-B", "hello from A"], { PIJ_SESSION_ID: "pij-A" });
		expect(r.code).toBe(0);
		const inbox = readdirSync(join(HOME, "pij-B", "inbox"));
		expect(inbox.length).toBeGreaterThan(0);
		const msg = JSON.parse(readFileSync(join(HOME, "pij-B", "inbox", inbox[0] as string), "utf8"));
		expect(msg).toMatchObject({ from: "pij-A", to: "pij-B", body: "hello from A" });
	});

	it("broadcast send writes the same raw body once to each target inbox", () => {
		const r = pij(["send", "--to", "pij-B", "--to", "pij-C2", "hello both", "--json"], {
			PIJ_SESSION_ID: "pij-A",
		});
		expect(r.code).toBe(0);
		const output = JSON.parse(r.out) as {
			from: string;
			results: Array<{ to: string; messageId: string }>;
		};
		expect(output).toMatchObject({
			from: "pij-A",
			results: [{ to: "pij-B" }, { to: "pij-C2" }],
		});
		expect(output.results.map(({ to }) => to)).toEqual(["pij-B", "pij-C2"]);
		expect(new Set(output.results.map(({ messageId }) => messageId)).size).toBe(2);

		for (const target of ["pij-B", "pij-C2"]) {
			const messages = readdirSync(join(HOME, target, "inbox")).map(
				(file) => JSON.parse(readFileSync(join(HOME, target, "inbox", file), "utf8")) as PijMessage,
			);
			expect(
				messages.filter(
					(message) =>
						message.from === "pij-A" && message.to === target && message.body === "hello both",
				),
			).toHaveLength(1);
		}
	});

	it("broadcast --wait timeout names every unresolved target", () => {
		const r = pij(["send", "--to", "pij-B", "--to", "pij-C2", "wait for both", "--wait", "10"], {
			PIJ_SESSION_ID: "pij-A",
		});
		expect(r.code).toBe(0);
		const timeoutLine = r.out.split("\n").find((line) => line.includes("timeout"));
		expect(timeoutLine).toContain("unresolved");
		expect(timeoutLine).toContain("pij-B");
		expect(timeoutLine).toContain("pij-C2");
	});

	it("single-target --wait timeout output remains byte-identical", () => {
		const r = pij(["send", "pij-B", "wait for one", "--wait", "10"], {
			PIJ_SESSION_ID: "pij-A",
		});
		expect(r.code).toBe(0);
		const timeoutLine = r.out.split("\n").find((line) => line.includes("timeout"));
		expect(timeoutLine).toBe("receipt → (timeout; check `pij tail` later)");
	});

	it("broadcast preflights the full target set before writing any inbox", () => {
		const before = new Map(
			["pij-B", "pij-C2"].map((target) => [
				target,
				readdirSync(join(HOME, target, "inbox")).length,
			]),
		);
		const r = pij(["send", "--to", "pij-B", "--to", "pij-MISSING", "must not land"], {
			PIJ_SESSION_ID: "pij-A",
		});

		expect(r.code).toBe(2);
		expect(r.out).toContain("E-NOID");
		for (const target of ["pij-B", "pij-C2"]) {
			expect(readdirSync(join(HOME, target, "inbox"))).toHaveLength(before.get(target) ?? 0);
		}
	});

	it("AC-7/8 tail: --since filters to seq>N, events are ordered + timestamped", () => {
		const all = pij(["tail", "pij-B", "--since", "0"]);
		expect(all.code).toBe(0);
		expect(all.out).toContain("tool_call");
		const since = pij(["tail", "pij-B", "--since", "1"]);
		expect(since.out).not.toContain("\n1 "); // seq 1 excluded
	});

	it("AC-9/10 state: reports state + liveness without a stream parse", () => {
		const r = pij(["state", "pij-B"]);
		expect(r.code).toBe(0);
		expect(r.out).toMatch(/active|stale|dead/);
	});

	it("AC-11 path: prints the readable events.ndjson path", () => {
		const r = pij(["path", "pij-B", "--events"]);
		expect(r.code).toBe(0);
		expect(r.out.trim()).toBe(join(HOME, "pij-B", "events.ndjson"));
	});

	it("AC-6 errors: invalid target exit codes are honored (E-NOID exit 2)", () => {
		const r = pij(["send", "pij-MISSING", "hi"], { PIJ_SESSION_ID: "pij-A" });
		expect(r.code).toBe(2);
	});

	it("standalone pi spawn persists a pane-correlated five-minute expectation before launch without a descriptor", () => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const result = pij(["spawn", "--harness", "pi", "--json"], {
			PIJ_SESSION_ID: "pij-A",
		});
		expect(result.code).toBe(0);
		const output = JSON.parse(result.out) as { paneId: string };
		const expectations = new FsSpawnExpectationStore(HOME).list();
		expect(expectations).toHaveLength(1);
		const expectation = expectations[0];
		expect(expectation).toMatchObject({
			creatorId: "pij-A",
			requestedHarness: "pi",
			paneId: output.paneId,
		});
		expect(
			Date.parse(expectation?.deadlineAt ?? "") - Date.parse(expectation?.requestedAt ?? ""),
		).toBe(DEFAULT_SPAWN_EXPECTATION_TTL_MS);
		expect(
			new FsRegistry(HOME).list().some((descriptor) => descriptor.spawnId === expectation?.spawnId),
		).toBe(false);
		const prelaunch = prelaunchSnapshots().map((line) =>
			JSON.parse(line.slice("PRELAUNCH ".length)),
		);
		expect(prelaunch).toEqual([
			expect.objectContaining({ spawnId: expectation?.spawnId, requestedHarness: "pi" }),
		]);
		expect(prelaunch[0]).not.toHaveProperty("paneId");
		const namingLog = readFileSync(TMUX_LOG, "utf8");
		expect(namingLog).toContain("select-pane -t %91 -T");
		expect(namingLog).not.toContain("pi-peer");
	});

	it("pins an ambiguous OMP model to github-copilot before tmux launch", () => {
		const modelsPath = join(HOME, ".pi", "agent", "models.json");
		mkdirSync(join(HOME, ".pi", "agent"), { recursive: true });
		writeFileSync(
			modelsPath,
			JSON.stringify({
				providers: {
					"github-copilot": { models: [{ id: "gpt-5.6-sol", name: "GPT-5.6 Sol" }] },
					openrouter: { models: [{ id: "shared-model", name: "Shared" }] },
					sakana: { models: [{ id: "shared-model", name: "Shared" }] },
				},
			}),
		);
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");

		const result = pij(
			["spawn", "--harness", "pi", "--bin", "omp", "--model", "gpt-5.6-sol", "--json"],
			{ PIJ_SESSION_ID: "pij-A", HOME },
		);

		expect(result.code).toBe(0);
		const log = readFileSync(TMUX_LOG, "utf8");
		expect(log).toContain("omp");
		expect(log).toContain("--model github-copilot/gpt-5.6-sol");
		expect(log).not.toMatch(/--model gpt-5\.6-sol(?:\s|$)/);
	});

	it("refuses other provider ambiguity before expectation or tmux mutation", () => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");

		const result = pij(
			["spawn", "--harness", "pi", "--bin", "omp", "--model", "shared-model", "--json"],
			{ PIJ_SESSION_ID: "pij-A", HOME },
		);

		expect(result.code).toBe(64);
		expect(result.out).toContain("E-AMBIGUOUS");
		expect(result.out).toContain("openrouter/shared-model");
		expect(result.out).toContain("sakana/shared-model");
		expect(readFileSync(TMUX_LOG, "utf8")).toBe("");
		expect(new FsSpawnExpectationStore(HOME).list()).toEqual([]);
	});

	it("control-plane spawn correlates one prelaunch expectation with descriptor and pane", () => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const result = pij(["spawn", "--harness", "claude", "--json"], {
			PIJ_SESSION_ID: "pij-A",
		});
		expect(result.code).toBe(0);
		const jsonLine = result.out
			.trim()
			.split("\n")
			.findLast((line) => line.startsWith("{"));
		const output = JSON.parse(jsonLine ?? "{}") as { id: string; paneId: string };
		expect(output.id).toMatch(/^pij-[a-z]+(-[a-z]+)*$/);
		const descriptor = new FsRegistry(HOME).read(output.id);
		expect(descriptor).toMatchObject({
			id: output.id,
			paneId: output.paneId,
			spawnedBy: "pij-A",
			parentId: "pij-A",
			lifecycle: "pending",
		});
		const expectation = new FsSpawnExpectationStore(HOME).read(descriptor?.spawnId ?? "");
		expect(expectation).toMatchObject({
			spawnId: descriptor?.spawnId,
			creatorId: "pij-A",
			requestedHarness: "claude",
			paneId: output.paneId,
			sessionId: output.id,
		});
		expect(readFileSync(TMUX_LOG, "utf8")).toContain(`PIJ_SESSION_ID=${output.id}`);
		expect(prelaunchSnapshots()).toEqual([
			expect.stringContaining(`"spawnId":"${descriptor?.spawnId}"`),
		]);
		expect(prelaunchSnapshots()[0]).not.toContain('"paneId"');
		expect(new FsRegistry(HOME).hasReservation(output.id)).toEqual({
			ok: true,
			value: false,
		});
	});

	it("real pi and daemon-bound spawns carry unresolved and not-probeable plan warnings into JSON and human receipts", () => {
		const unresolvedPlanId = "missing-plan-receipt";
		const cases = [
			{
				planId: unresolvedPlanId,
				warning: `warning: plan id '${unresolvedPlanId}' does not resolve to '${join(FOLDER, "docs", "plans", unresolvedPlanId)}' — spawn continues`,
			},
			{
				planId: "../../opaque/value",
				warning:
					"warning: plan id '../../opaque/value' was not checked against docs/plans (not a simple path segment) — spawn continues",
			},
		] as const;
		const receipts: Array<{
			harness: "pi" | "claude";
			planId: string;
			format: "json" | "human";
			warnings: readonly string[];
		}> = [];

		for (const harness of ["pi", "claude"] as const) {
			for (const { planId } of cases) {
				for (const json of [true, false] as const) {
					clearSpawnExpectations();
					writeFileSync(TMUX_LOG, "");
					const args = ["spawn", "--harness", harness, "--plan-id", planId];
					if (json) args.push("--json");

					const result = pij(args, { PIJ_SESSION_ID: "pij-A" });

					expect(result.code).toBe(0);
					if (json) {
						const jsonLine = result.out
							.trim()
							.split("\n")
							.findLast((line) => line.startsWith("{"));
						const output = JSON.parse(jsonLine ?? "{}") as { warnings?: string[] };
						receipts.push({
							harness,
							planId,
							format: "json",
							warnings: output.warnings ?? [],
						});
					} else {
						receipts.push({
							harness,
							planId,
							format: "human",
							warnings: result.out
								.split("\n")
								.filter((line) => line.startsWith("warning: plan id")),
						});
					}
				}
			}
		}

		expect(receipts).toEqual(
			(["pi", "claude"] as const).flatMap((harness) =>
				cases.flatMap(({ planId, warning }) =>
					(["json", "human"] as const).map((format) => ({
						harness,
						planId,
						format,
						warnings: [warning],
					})),
				),
			),
		);
	});

	it("revives a dissolved Claude session under the same pij id with fail-loud resume argv", () => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const id = "pij-finished-fox";
		const nativeId = "11111111-2222-4333-8444-555555555555";
		const transcript = join(transcriptDir(HOME, FOLDER), `${nativeId}.jsonl`);
		mkdirSync(transcriptDir(HOME, FOLDER), { recursive: true });
		writeFileSync(
			transcript,
			`${JSON.stringify({ type: "user", message: { content: "seed" } })}\n`,
		);
		new FsRegistry(HOME).write({
			id,
			role: "worker",
			folder: FOLDER,
			dataDir: join(HOME, id),
			eventsPath: join(HOME, id, "events.ndjson"),
			pid: 101,
			startedAt: "2026-07-24T00:00:00.000Z",
			state: "idle",
			harness: "claude",
			harnessSessionId: nativeId,
			boundModel: "claude-sonnet-5",
			effort: "high",
			paneId: "%7",
			spawnedBy: "pij-A",
			parentId: "pij-A",
			lifecycle: "dissolved",
			closeIntent: {
				actor: "pij-A",
				kind: "cli-close",
				requestedAt: "2026-07-24T01:00:00.000Z",
			},
			terminal: {
				disposition: "requested",
				observedAt: "2026-07-24T01:00:01.000Z",
				evidence: "pane-missing",
			},
		});

		const result = pij(["revive", id, "--json"], { PIJ_SESSION_ID: "pij-A", HOME });

		expect(result.code, result.out).toBe(0);
		const output = JSON.parse(
			result.out
				.trim()
				.split("\n")
				.findLast((line) => line.startsWith("{")) ?? "{}",
		) as { id: string; state: string; paneId: string };
		expect(output).toMatchObject({ id, state: "pending-canary", paneId: "%91" });
		expect(new FsRegistry(HOME).read(id)).toMatchObject({
			id,
			lifecycle: "pending",
			plannedHarnessSessionId: nativeId,
			revivePendingAt: expect.any(String),
		});
		expect(new FsRegistry(HOME).read(id)).not.toHaveProperty("terminal");
		const log = readFileSync(TMUX_LOG, "utf8");
		expect(log).toContain(`claude --dangerously-skip-permissions --resume ${nativeId}`);
		expect(log).not.toContain("--session-id");
		expect(log).not.toContain("--fork-session");
		expect(log).toMatch(new RegExp(`select-pane -t %91 -T .* revive · ${id}`));
		expect(prelaunchSnapshots()[0]).not.toContain('"sessionId"');
	});

	// ── s072 reboot rehydrate: the REAL cli path, not fakes ────────────────
	// Its own folder: the shared FOLDER already holds other tests' seats (some of
	// them prime), and D1 resolution is BY FOLDER.
	const S072_FOLDER = realpathSync(mkdtempSync(join(tmpdir(), "pij-s072-")));

	function seedRebootedClaudeSeat(id: string, nativeId: string, prime: boolean): void {
		mkdirSync(transcriptDir(HOME, S072_FOLDER), { recursive: true });
		writeFileSync(
			join(transcriptDir(HOME, S072_FOLDER), `${nativeId}.jsonl`),
			`${JSON.stringify({ type: "user", message: { content: "seed" } })}\n`,
		);
		new FsRegistry(HOME).write({
			id,
			role: "worker",
			folder: S072_FOLDER,
			dataDir: join(HOME, id),
			eventsPath: join(HOME, id, "events.ndjson"),
			// A pid no live process can hold: post-reboot the recorded pid is dead.
			pid: 999_999_999,
			// RELATIVE TO HOST BOOT, never an absolute date. These tests are about the
			// PANE axis (ours / reused / unprobed). Boot-time invalidation runs FIRST and
			// is unconditional — "the host booted after this seat's last activity" ends the
			// classification before the pane is ever considered. A hardcoded past date
			// therefore silently STOPS EXERCISING the pane axis the moment the machine
			// reboots: green for weeks, then two failures on 2026-07-27 caused by the
			// operator restarting their laptop rather than by any code change.
			startedAt: new Date(Date.now() - 60_000).toISOString(),
			state: "idle",
			harness: "claude",
			harnessSessionId: nativeId,
			boundModel: "claude-sonnet-5",
			effort: "high",
			// The reboot signature: still `bound`, pane id from the dead tmux server.
			paneId: "%7",
			lifecycle: "bound",
			...(prime ? { prime: true } : {}),
		});
	}

	it("resolves the prime seat from the CURRENT FOLDER and prints a paste-able line", () => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const id = "pij-rebooted-prime";
		const nativeId = "77777777-2222-4333-8444-555555555555";
		seedRebootedClaudeSeat(id, nativeId, true);
		const before = readFileSync(join(HOME, `${id}.json`), "utf8");

		const result = pij(["revive", "--print", "--json"], { PIJ_SESSION_ID: "", HOME }, S072_FOLDER);

		expect(result.code, result.out).toBe(0);
		// --json is machine output: ONE line, nothing else on stdout.
		expect(result.out.trim().split("\n")).toHaveLength(1);
		const printed = JSON.parse(result.out.trim()) as Record<string, unknown>;
		expect(printed).toMatchObject({
			id,
			harness: "claude",
			runtime: "claude",
			model: "claude-sonnet-5",
			effort: "high",
			cmd: "claude",
			tier: "hot",
			selfAdopts: false,
			priorAttachment: "stale",
			priorPane: "gone",
		});
		expect(printed.shellLine).toBe(
			`pij revive ${id} --attach "$TMUX_PANE" && PIJ_SESSION_ID=${id} PIJ_HARNESS=claude ` +
				`PIJ_SPAWN_ID=${(printed.env as Record<string, string>).PIJ_SPAWN_ID} ` +
				`claude --dangerously-skip-permissions --resume ${nativeId} --model claude-sonnet-5 --effort high`,
		);
		// --print mutates NOTHING: descriptor byte-identical, no pane touched, no
		// spawn expectation written.
		expect(readFileSync(join(HOME, `${id}.json`), "utf8")).toBe(before);
		// s072 FIX-2, amended contract: --print MAY issue READ-ONLY tmux queries —
		// knowing whether the old attachment is still alive is worth having before
		// you paste. What it may never do is mutate. The one call below is the
		// pane-identity probe; `display-message -p` is a read.
		expect(readFileSync(TMUX_LOG, "utf8")).toBe(
			"display-message -p -t %7 #{pane_dead},#{pane_pid}\n",
		);
		expect(existsSync(join(HOME, "spawn-expectations"))).toBe(false);
	});

	// s072 FIX-1 / reviewer F-001, through the REAL cli: a fresh tmux server hands
	// the recorded `%7` to an unrelated pane. The bare id matches; the pane's own
	// pid does not. That must NOT read as proof of life.
	it("a REUSED pane id reads uncertain, not live, and says which id was recycled", () => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const id = "pij-rebooted-reused-pane";
		const nativeId = "b0b0b0b0-2222-4333-8444-555555555555";
		seedRebootedClaudeSeat(id, nativeId, false);

		const printed = pij(
			["revive", id, "--print", "--json"],
			// %7 is live in the NEW server, but it is running this test process,
			// not the seat's recorded pid 999_999_999.
			{ PIJ_SESSION_ID: "", HOME, FAKE_TMUX_LIVE_PANE: "%7" },
			S072_FOLDER,
		);
		expect(printed.code, printed.out).toBe(0);
		expect(JSON.parse(printed.out.trim())).toMatchObject({
			id,
			priorAttachment: "uncertain",
			priorPane: "not-ours",
		});

		// It is uncertain, so a WRITE is refused...
		const refused = pij(
			["revive", id],
			{ PIJ_SESSION_ID: "", HOME, FAKE_TMUX_LIVE_PANE: "%7" },
			S072_FOLDER,
		);
		expect(refused.code).not.toBe(0);
		expect(refused.out).toContain("re-issues pane ids from %0");
		// ...and the documented escape hatch still rescues the reboot path, which a
		// `live` verdict could not (planRevive refuses `live` before --assume-dead).
		const forced = pij(
			["revive", id, "--attach", "%42", "--assume-dead", "--json"],
			{ PIJ_SESSION_ID: "", HOME, FAKE_TMUX_LIVE_PANE: "%42" },
			S072_FOLDER,
		);
		expect(forced.code, forced.out).toBe(0);
		expect(new FsRegistry(HOME).read(id)).toMatchObject({ id, paneId: "%42" });
	});

	// s072 FIX-6 / reviewer round 2, through the REAL cli. The compound case: a
	// fresh server hands back the recorded `%7` AND that pane's `#{pane_pid}`
	// equals the pid the descriptor recorded — a recycled pane id "corroborated"
	// by a recycled pid. Both halves of that proof come from allocators the reboot
	// reset, so only absolute time can settle it.
	function seedRecycledPidSeat(id: string, nativeId: string, startedAt: string): void {
		mkdirSync(transcriptDir(HOME, S072_FOLDER), { recursive: true });
		writeFileSync(
			join(transcriptDir(HOME, S072_FOLDER), `${nativeId}.jsonl`),
			`${JSON.stringify({ type: "user", message: { content: "seed" } })}\n`,
		);
		new FsRegistry(HOME).write({
			id,
			role: "worker",
			folder: S072_FOLDER,
			dataDir: join(HOME, id),
			eventsPath: join(HOME, id, "events.ndjson"),
			// THE recycled pid: the fake tmux reports this same pid as `#{pane_pid}`
			// for the live pane, so the identity check matches exactly.
			pid: process.pid,
			startedAt,
			state: "idle",
			harness: "claude",
			harnessSessionId: nativeId,
			boundModel: "claude-sonnet-5",
			effort: "high",
			paneId: "%7",
			lifecycle: "bound",
		});
	}

	it("a matching pane pid does NOT rescue a descriptor that predates this host's boot", () => {
		clearSpawnExpectations();
		const id = "pij-rebooted-recycled-pid";
		const nativeId = "c0c0c0c0-2222-4333-8444-555555555555";
		// Older than any plausible uptime, so host-boot evidence is decisive on
		// every machine this suite runs on.
		seedRecycledPidSeat(id, nativeId, "2020-01-01T00:00:00.000Z");

		const printed = pij(
			["revive", id, "--print", "--json"],
			{ PIJ_SESSION_ID: "", HOME, FAKE_TMUX_LIVE_PANE: "%7" },
			S072_FOLDER,
		);
		expect(printed.code, printed.out).toBe(0);
		// The pane still reports as ours — and the verdict is still NOT live.
		expect(JSON.parse(printed.out.trim())).toMatchObject({
			id,
			priorPane: "ours",
			priorAttachment: "stale",
		});

		// Before FIX-6 this errored with "still has a live prior attachment"
		// irrevocably, ahead of --assume-dead. The boot evidence proves the old
		// process cannot exist, so the revive path is reachable with NO override.
		const revived = pij(
			["revive", id, "--attach", "%42", "--json"],
			{ PIJ_SESSION_ID: "", HOME, FAKE_TMUX_LIVE_PANE: "%42", FAKE_TMUX_FOCUS_PID: "424242" },
			S072_FOLDER,
		);
		expect(revived.code, revived.out).toBe(0);
		expect(new FsRegistry(HOME).read(id)).toMatchObject({ id, paneId: "%42" });
	});

	// The second, weaker rung: boot time cannot settle it (the seat WAS active in
	// this boot epoch), so the non-recycled signal has to be the pane process's
	// own start time — `ps -o lstart=`.
	it("a matching pane pid is uncertain when ps says that process started after our last event", () => {
		clearSpawnExpectations();
		const id = "pij-rebooted-young-pane-process";
		const nativeId = "d0d0d0d0-2222-4333-8444-555555555555";
		const paneProcessStartedMs = Date.parse(
			execFileSync("ps", ["-o", "lstart=", "-p", String(process.pid)], {
				encoding: "utf8",
			}).trim(),
		);
		const bootMs = Date.now() - uptime() * 1000;
		// Inside this boot epoch, but a minute BEFORE the process now in the pane.
		const anchorMs = paneProcessStartedMs - 60_000;
		expect(anchorMs).toBeGreaterThan(bootMs);
		seedRecycledPidSeat(id, nativeId, new Date(anchorMs).toISOString());

		const printed = pij(
			["revive", id, "--print", "--json"],
			{ PIJ_SESSION_ID: "", HOME, FAKE_TMUX_LIVE_PANE: "%7" },
			S072_FOLDER,
		);
		expect(printed.code, printed.out).toBe(0);
		expect(JSON.parse(printed.out.trim())).toMatchObject({
			id,
			priorPane: "ours",
			priorAttachment: "uncertain",
		});

		// Uncertain gates the write and names the signal that disqualified the pid.
		const refused = pij(
			["revive", id],
			{ PIJ_SESSION_ID: "", HOME, FAKE_TMUX_LIVE_PANE: "%7" },
			S072_FOLDER,
		);
		expect(refused.code).not.toBe(0);
		expect(refused.out).toContain(
			"did not start before this seat's last recorded activity (ps lstart",
		);
		// ...and it remains overridable, which a `live` verdict never was.
		const forced = pij(
			["revive", id, "--attach", "%42", "--assume-dead", "--json"],
			{ PIJ_SESSION_ID: "", HOME, FAKE_TMUX_LIVE_PANE: "%42", FAKE_TMUX_FOCUS_PID: "424243" },
			S072_FOLDER,
		);
		expect(forced.code, forced.out).toBe(0);
		expect(new FsRegistry(HOME).read(id)).toMatchObject({ id, paneId: "%42" });
	});

	// s072 FIX-7 / reviewer round 3, through the real CLI. The reviewer's case:
	// a fresh %0 server whose pane process started at 03:30:25Z against a matching
	// post-boot descriptor last active at 03:30:21Z. That returned an irrevocable
	// `live` before the fix, ahead of --assume-dead.
	it("a pane process born FOUR SECONDS after our last activity is uncertain, not live", () => {
		clearSpawnExpectations();
		const id = "pij-skew-window";
		const nativeId = "e0e0e0e0-2222-4333-8444-555555555555";
		const paneProcessStartedMs = Date.parse(
			execFileSync("ps", ["-o", "lstart=", "-p", String(process.pid)], {
				encoding: "utf8",
			}).trim(),
		);
		// Activity four seconds BEFORE the process now in the pane — the exact
		// window the old `activity + 5s` tolerance called proof of life.
		const anchorMs = paneProcessStartedMs - 4_000;
		expect(anchorMs).toBeGreaterThan(Date.now() - uptime() * 1000);
		seedRecycledPidSeat(id, nativeId, new Date(anchorMs).toISOString());

		const printed = pij(
			["revive", id, "--print", "--json"],
			{ PIJ_SESSION_ID: "", HOME, FAKE_TMUX_LIVE_PANE: "%7" },
			S072_FOLDER,
		);
		expect(printed.code, printed.out).toBe(0);
		expect(JSON.parse(printed.out.trim())).toMatchObject({
			id,
			priorPane: "ours",
			priorAttachment: "uncertain",
		});

		// The whole point of the ruling: the operator can still get through.
		const forced = pij(
			["revive", id, "--attach", "%42", "--assume-dead", "--json"],
			{ PIJ_SESSION_ID: "", HOME, FAKE_TMUX_LIVE_PANE: "%42", FAKE_TMUX_FOCUS_PID: "424244" },
			S072_FOLDER,
		);
		expect(forced.code, forced.out).toBe(0);
		expect(new FsRegistry(HOME).read(id)).toMatchObject({ id, paneId: "%42" });
	});

	// s072 FIX-2: the actual reboot case is that there is no tmux server at all
	// yet. --print must still hand over the line, reporting the pane as unprobed.
	it("--print survives tmux being unreachable, degrading to an unprobed pane", () => {
		clearSpawnExpectations();
		const id = "pij-rebooted-no-tmux";
		const nativeId = "aaaaaaaa-2222-4333-8444-555555555555";
		seedRebootedClaudeSeat(id, nativeId, false);
		const before = readFileSync(join(HOME, `${id}.json`), "utf8");

		// (a) a tmux binary that cannot reach a server — real tmux exits non-zero
		//     with "error connecting to /tmp/tmux-.../default".
		const noServer = pij(
			["revive", id, "--print", "--json"],
			{ PIJ_SESSION_ID: "", HOME, FAKE_TMUX_NO_SERVER: "1", TMUX_PANE: "" },
			S072_FOLDER,
		);
		expect(noServer.code, noServer.out).toBe(0);
		expect(JSON.parse(noServer.out.trim())).toMatchObject({
			id,
			priorPane: "unprobed",
			priorAttachment: "uncertain",
		});

		// (b) no tmux binary on PATH at all.
		const noBinary = pij(
			["revive", id, "--print"],
			{
				PIJ_SESSION_ID: "",
				HOME,
				PATH: `${EMPTY_BIN}:${dirname(process.execPath)}`,
				TMUX_PANE: "",
			},
			S072_FOLDER,
		);
		expect(noBinary.code, noBinary.out).toBe(0);
		expect(noBinary.out).toContain("pane %7: unprobed");
		expect(noBinary.out).toContain(
			"nothing was written: --print issues read-only tmux and ps queries only",
		);
		expect(noBinary.out).toContain("tmux could not be reached");
		expect(readFileSync(join(HOME, `${id}.json`), "utf8")).toBe(before);
	});

	it("--attach binds the operator's OWN pane to the seat without spawning one", () => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const id = "pij-rebooted-attach";
		const nativeId = "88888888-2222-4333-8444-555555555555";
		seedRebootedClaudeSeat(id, nativeId, false);

		const result = pij(
			["revive", id, "--attach", "%42", "--json"],
			{ PIJ_SESSION_ID: "pij-A", HOME, FAKE_TMUX_LIVE_PANE: "%42" },
			S072_FOLDER,
		);

		expect(result.code, result.out).toBe(0);
		expect(
			JSON.parse(
				result.out
					.trim()
					.split("\n")
					.findLast((line) => line.startsWith("{")) ?? "{}",
			),
		).toMatchObject({ id, paneId: "%42", attached: true, state: "pending-canary" });
		expect(new FsRegistry(HOME).read(id)).toMatchObject({
			id,
			paneId: "%42",
			lifecycle: "pending",
			plannedHarnessSessionId: nativeId,
			revivePendingAt: expect.any(String),
		});
		// It attached — it never launched the harness itself. (`new-window` does
		// appear: claude revival auto-starts the daemon, which lives in its own
		// window. That is the daemon, not the seat.)
		const log = readFileSync(TMUX_LOG, "utf8");
		expect(log).not.toContain("split-window");
		expect(log).not.toContain("claude --dangerously-skip-permissions");
		expect(log).toContain("display-message -p -t %42 #{pane_dead}");
	});

	it("resolves an ARCHIVED seat and --print leaves it archived", () => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const archivedFolder = realpathSync(mkdtempSync(join(tmpdir(), "pij-s072-arch-")));
		const id = "pij-buried-seat";
		const nativeId = "99999999-2222-4333-8444-555555555555";
		mkdirSync(transcriptDir(HOME, archivedFolder), { recursive: true });
		writeFileSync(
			join(transcriptDir(HOME, archivedFolder), `${nativeId}.jsonl`),
			`${JSON.stringify({ type: "user", message: { content: "seed" } })}\n`,
		);
		const registry = new FsRegistry(HOME);
		registry.write({
			id,
			folder: archivedFolder,
			dataDir: join(HOME, id),
			eventsPath: join(HOME, id, "events.ndjson"),
			pid: 999_999_998,
			startedAt: "2026-05-01T00:00:00.000Z",
			harness: "claude",
			harnessSessionId: nativeId,
			boundModel: "claude-sonnet-5",
			lifecycle: "dissolved",
		});
		expect(registry.archive(id, Date.parse("2026-07-24T00:00:00.000Z"))).toBe("archived");
		expect(existsSync(join(HOME, `${id}.json`))).toBe(false);

		const result = pij(
			["revive", "--print", "--json"],
			{ PIJ_SESSION_ID: "", HOME },
			archivedFolder,
		);

		expect(result.code, result.out).toBe(0);
		expect(
			JSON.parse(
				result.out
					.trim()
					.split("\n")
					.findLast((line) => line.startsWith("{")) ?? "{}",
			),
		).toMatchObject({ id, tier: "archive" });
		// The whole point of --print: it did NOT pull the record back to the hot
		// tier the way a real revive does.
		expect(existsSync(join(HOME, `${id}.json`))).toBe(false);
		expect(existsSync(join(HOME, "archive", `${id}.json`))).toBe(true);

		// The tier is read from DISK, so an EXPLICITLY named archived seat is
		// reported as archived too — not silently labelled hot.
		const byId = pij(["revive", id, "--print", "--json"], { PIJ_SESSION_ID: "", HOME });
		expect(byId.code, byId.out).toBe(0);
		expect(JSON.parse(byId.out.trim())).toMatchObject({ id, tier: "archive" });
		expect(existsSync(join(HOME, `${id}.json`))).toBe(false);
		rmSync(archivedFolder, { recursive: true, force: true });
	});

	it("prints the human-readable form with the self-adopt truth spelled out", () => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const id = "pij-rebooted-human";
		seedRebootedClaudeSeat(id, "66666666-2222-4333-8444-555555555555", false);
		const before = readFileSync(join(HOME, `${id}.json`), "utf8");

		const result = pij(["revive", id, "--print"], { PIJ_SESSION_ID: "", HOME }, S072_FOLDER);

		expect(result.code, result.out).toBe(0);
		expect(result.out).toContain("paste this into the pane you already opened:");
		expect(result.out).toContain(`pij revive ${id} --attach "$TMUX_PANE" &&`);
		expect(result.out).toContain("claude does NOT self-adopt");
		expect(result.out).toContain("nothing was written");
		expect(readFileSync(join(HOME, `${id}.json`), "utf8")).toBe(before);
		expect(readFileSync(TMUX_LOG, "utf8")).not.toMatch(/new-window|split-window/);
	});

	// s072 FIX-4 / reviewer: the pi/omp branch used to tell the operator that pi
	// "reads PIJ_SESSION_ID at boot". It does not — `PIJ_SESSION_ID` is produced
	// at boot, not consumed from this line. Resumed pi re-derives its identity
	// from its native session artifact, finds the dissolved descriptor, and calls
	// registry.revive() itself (core/session.ts boot(), `wasDissolved`).
	it("states the REAL reason a pi seat needs no attach step", () => {
		clearSpawnExpectations();
		const id = "pij-rebooted-pi";
		const nativeId = "c0c0c0c0-2222-4333-8444-555555555555";
		const sessions = join(HOME, ".pi", "agent", "sessions");
		mkdirSync(sessions, { recursive: true });
		writeFileSync(join(sessions, `2026-07-24_${nativeId}.jsonl`), "{}\n");
		new FsRegistry(HOME).write({
			id,
			role: "worker",
			folder: S072_FOLDER,
			dataDir: join(HOME, id),
			eventsPath: join(HOME, id, "events.ndjson"),
			pid: 999_999_999,
			startedAt: "2026-07-24T00:00:00.000Z",
			state: "idle",
			harness: "pi",
			harnessSessionId: nativeId,
			paneId: "%7",
			lifecycle: "bound",
		});

		const result = pij(["revive", id, "--print"], { PIJ_SESSION_ID: "", HOME }, S072_FOLDER);

		expect(result.code, result.out).toBe(0);
		expect(result.out).toContain("pi self-adopts");
		expect(result.out).toContain(
			"re-derives its own pij identity from its native session artifact",
		);
		expect(result.out).toContain("registry.revive()");
		// The retracted rationale must not come back.
		expect(result.out).not.toContain("reads PIJ_SESSION_ID at boot");
	});

	it("an UNAVAILABLE terminal observation is not evidence of death", () => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const id = "pij-unavailable-obs";
		const nativeId = "55555555-2222-4333-8444-555555555555";
		mkdirSync(transcriptDir(HOME, S072_FOLDER), { recursive: true });
		writeFileSync(join(transcriptDir(HOME, S072_FOLDER), `${nativeId}.jsonl`), "{}\n");
		new FsRegistry(HOME).write({
			id,
			folder: S072_FOLDER,
			dataDir: join(HOME, id),
			eventsPath: join(HOME, id, "events.ndjson"),
			pid: process.pid, // alive
			// Same reason as seedRebootedClaudeSeat: an absolute past date lets HOST BOOT
			// decide this case. This test is about a LIVE pid whose terminal observation
			// was `unavailable` — but "the host booted after its last activity" is a
			// stronger, earlier signal and correctly returns `stale`, so after a reboot the
			// fixture stopped reaching the rule it exists to pin.
			startedAt: new Date(Date.now() - 60_000).toISOString(),
			harness: "claude",
			harnessSessionId: nativeId,
			paneId: "%gone-too",
			lifecycle: "bound",
			terminal: {
				disposition: "unavailable",
				observedAt: "2026-07-24T01:00:00.000Z",
				evidence: "observation-unavailable",
				unavailableReason: "tmux not reachable",
			},
		});

		// pij saying "I could not look" must not be read as "it is dead".
		const result = pij(["revive", id, "--json"], { PIJ_SESSION_ID: "pij-A", HOME }, S072_FOLDER);
		expect(result.code).toBe(64);
		expect(result.out).toContain("may have recycled");
		expect(readFileSync(TMUX_LOG, "utf8")).not.toMatch(/new-window|split-window/);
	});

	it("refuses to print for a folder that has no seat, naming the folder", () => {
		const empty = realpathSync(mkdtempSync(join(tmpdir(), "pij-nofolder-")));
		const result = pij(["revive", "--print"], { PIJ_SESSION_ID: "", HOME }, empty);
		expect(result.code).not.toBe(0);
		expect(result.out).toContain("E-NOID");
		expect(result.out).toContain(empty);
		rmSync(empty, { recursive: true, force: true });
	});

	it("cleans the expectation when revival pane launch fails", () => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const id = "pij-revive-spawn-failure";
		const nativeId = "21111111-2222-4333-8444-555555555555";
		const transcript = join(transcriptDir(HOME, FOLDER), `${nativeId}.jsonl`);
		mkdirSync(transcriptDir(HOME, FOLDER), { recursive: true });
		writeFileSync(transcript, "{}\n");
		new FsRegistry(HOME).write({
			id,
			folder: FOLDER,
			dataDir: join(HOME, id),
			eventsPath: join(HOME, id, "events.ndjson"),
			pid: 201,
			startedAt: "2026-07-24T00:00:00.000Z",
			harness: "claude",
			harnessSessionId: nativeId,
			lifecycle: "dissolved",
			terminal: {
				disposition: "unrequested-by-pij",
				observedAt: "2026-07-24T01:00:00.000Z",
				evidence: "pid-missing",
			},
		});
		const result = pij(["revive", id, "--json"], {
			PIJ_SESSION_ID: "pij-A",
			HOME,
			FAKE_TMUX_FAIL: "1",
		});
		expect(result.code).toBe(2);
		expect(new FsSpawnExpectationStore(HOME).list()).toEqual([]);
		expect(new FsRegistry(HOME).read(id)?.lifecycle).toBe("dissolved");
	});

	it("kills the spawned pane and removes its expectation when tombstone replacement fails", () => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const id = "pij-revive-registry-race";
		const nativeId = "31111111-2222-4333-8444-555555555555";
		const transcript = join(transcriptDir(HOME, FOLDER), `${nativeId}.jsonl`);
		mkdirSync(transcriptDir(HOME, FOLDER), { recursive: true });
		writeFileSync(transcript, "{}\n");
		new FsRegistry(HOME).write({
			id,
			folder: FOLDER,
			dataDir: join(HOME, id),
			eventsPath: join(HOME, id, "events.ndjson"),
			pid: 202,
			startedAt: "2026-07-24T00:00:00.000Z",
			harness: "claude",
			harnessSessionId: nativeId,
			lifecycle: "dissolved",
			terminal: {
				disposition: "unrequested-by-pij",
				observedAt: "2026-07-24T01:00:00.000Z",
				evidence: "pid-missing",
			},
		});
		const result = pij(["revive", id, "--json"], {
			PIJ_SESSION_ID: "pij-A",
			HOME,
			FAKE_TMUX_DELETE_DESCRIPTOR: id,
		});
		expect(result.code).toBe(2);
		expect(readFileSync(TMUX_LOG, "utf8")).toContain("kill-pane -t %91");
		expect(new FsSpawnExpectationStore(HOME).list()).toEqual([]);
	});

	it.each([
		["pi", ".pi", "pi --session"],
		["omp", ".omp", "omp --auto-approve"],
	] as const)("launches %s revival asynchronously with an unconditional reframe", (runtime, store, command) => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const id = `pij-${runtime}-revival`;
		const nativeId =
			runtime === "pi"
				? "41111111-2222-4333-8444-555555555555"
				: "51111111-2222-4333-8444-555555555555";
		const sessions = join(HOME, store, "agent", "sessions", "repo");
		mkdirSync(sessions, { recursive: true });
		writeFileSync(join(sessions, `2026-07-25T00-00-00_${nativeId}.jsonl`), "{}\n");
		new FsRegistry(HOME).write({
			id,
			folder: FOLDER,
			dataDir: join(HOME, id),
			eventsPath: join(HOME, id, "events.ndjson"),
			pid: 203,
			startedAt: "2026-07-24T00:00:00.000Z",
			harness: "pi",
			harnessSessionId: nativeId,
			runtimeBin: runtime,
			lifecycle: "dissolved",
			terminal: {
				disposition: "unrequested-by-pij",
				observedAt: "2026-07-24T01:00:00.000Z",
				evidence: "pid-missing",
			},
		});
		const result = pij(["revive", id, "--json"], { PIJ_SESSION_ID: "pij-A", HOME });
		expect(result.code, result.out).toBe(0);
		const log = readFileSync(TMUX_LOG, "utf8");
		expect(log).toContain(command);
		expect(log).toContain("PIJ_SPAWN_TASK=You are a REVIVED session");
		expect(log).not.toContain("kill-pane");
		const expectation = new FsSpawnExpectationStore(HOME).list()[0];
		expect(expectation).toMatchObject({ paneId: "%91" });
		expect(expectation).not.toHaveProperty("sessionId");
	});

	it("reports the interim Copilot session-in-use action instead of waiting silently", () => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const id = "pij-copilot-needs-human";
		const nativeId = "71111111-2222-4333-8444-555555555555";
		const events = join(HOME, ".copilot", "session-state", nativeId, "events.jsonl");
		mkdirSync(join(HOME, ".copilot", "session-state", nativeId), { recursive: true });
		writeFileSync(events, "{}\n");
		new FsRegistry(HOME).write({
			id,
			folder: FOLDER,
			dataDir: join(HOME, id),
			eventsPath: join(HOME, id, "events.ndjson"),
			pid: 204,
			startedAt: "2026-07-24T00:00:00.000Z",
			harness: "copilot",
			harnessSessionId: nativeId,
			lifecycle: "dissolved",
			terminal: {
				disposition: "unrequested-by-pij",
				observedAt: "2026-07-24T01:00:00.000Z",
				evidence: "pid-missing",
			},
		});
		const result = pij(["revive", id, "--json"], { PIJ_SESSION_ID: "pij-A", HOME });
		expect(result.code, result.out).toBe(0);
		const output = JSON.parse(
			result.out
				.trim()
				.split("\n")
				.findLast((line) => line.startsWith("{")) ?? "{}",
		) as { operatorAction?: string };
		expect(output.operatorAction).toContain("needs-human");
		expect(output.operatorAction).toContain("press 1");
	});

	it("refuses a missing Copilot native artifact before tmux mutation", () => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const id = "pij-missing-memory";
		new FsRegistry(HOME).write({
			id,
			folder: FOLDER,
			dataDir: join(HOME, id),
			eventsPath: join(HOME, id, "events.ndjson"),
			pid: 102,
			startedAt: "2026-07-24T00:00:00.000Z",
			harness: "copilot",
			harnessSessionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
			paneId: "%8",
			lifecycle: "dissolved",
			terminal: {
				disposition: "unrequested-by-pij",
				observedAt: "2026-07-24T01:00:00.000Z",
				evidence: "pid-missing",
			},
		});
		const result = pij(["revive", id, "--json"], { PIJ_SESSION_ID: "pij-A", HOME });

		expect(result.code).toBe(3);
		expect(result.out).toContain("E-NOREG");
		expect(readFileSync(TMUX_LOG, "utf8")).toBe(
			"display-message -p -t %8 #{pane_dead},#{pane_pid}\n",
		);
		expect(new FsSpawnExpectationStore(HOME).list()).toEqual([]);
	});

	it("refuses revival while the prior process incarnation is still alive", () => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const id = "pij-still-live";
		const nativeId = "61111111-2222-4333-8444-555555555555";
		const transcript = join(transcriptDir(HOME, FOLDER), `${nativeId}.jsonl`);
		mkdirSync(transcriptDir(HOME, FOLDER), { recursive: true });
		writeFileSync(transcript, "{}\n");
		new FsRegistry(HOME).write({
			id,
			folder: FOLDER,
			dataDir: join(HOME, id),
			eventsPath: join(HOME, id, "events.ndjson"),
			pid: process.pid,
			// s072 FIX-6/FIX-7: this fixture stands for a GENUINELY live seat, so its
			// recorded activity must sit a provable full second AFTER the start of the
			// process actually holding the pane — the classifier compares the two
			// (`ps -o lstart=`, whole seconds) and now requires that lead before it
			// will say `live`. Anchoring on this process's own start instead of a bare
			// `new Date()` keeps the fixture's meaning independent of how quickly
			// vitest reached this line.
			startedAt: new Date(
				Math.max(Date.now(), Date.now() - process.uptime() * 1000 + 2_000),
			).toISOString(),
			harness: "claude",
			harnessSessionId: nativeId,
			paneId: "%gone",
			lifecycle: "bound",
		});
		// s072 D3: pane gone + pid alive is UNCERTAIN, not proven-live — the OS
		// recycles pids across a reboot. Still refused, now with the honest reason
		// and an explicit override rather than a silent guess.
		const uncertain = pij(["revive", id, "--json"], { PIJ_SESSION_ID: "pij-A", HOME });
		expect(uncertain.code).toBe(64);
		expect(uncertain.out).toContain("may have recycled");
		expect(readFileSync(TMUX_LOG, "utf8")).not.toMatch(/new-window|split-window/);

		// A pane that is genuinely still there is the un-overridable case.
		const live = pij(["revive", id, "--json"], {
			PIJ_SESSION_ID: "pij-A",
			HOME,
			FAKE_TMUX_LIVE_PANE: "%gone",
		});
		expect(live.code).toBe(64);
		expect(live.out).toContain("live prior attachment");
		expect(readFileSync(TMUX_LOG, "utf8")).not.toMatch(/new-window|split-window/);
	});

	it("daemon-bound Copilot descriptor records github-copilot provider", () => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const result = pij(["spawn", "--harness", "copilot", "--model", "gpt-5.6-sol", "--json"], {
			PIJ_SESSION_ID: "pij-A",
		});
		expect(result.code).toBe(0);
		const jsonLine = result.out
			.trim()
			.split("\n")
			.findLast((line) => line.startsWith("{"));
		const output = JSON.parse(jsonLine ?? "{}") as { id: string };
		expect(new FsRegistry(HOME).read(output.id)).toMatchObject({
			harness: "copilot",
			boundModel: "gpt-5.6-sol",
			boundProvider: "github-copilot",
		});
	});

	it.each([
		{
			name: "peer denied",
			args: ["spawn", "--harness", "copilot", "--model", "gemini-3.6-flash", "--json"],
			model: "gemini-3.6-flash",
			longContext: false,
		},
		{
			name: "peer allowed",
			args: ["spawn", "--harness", "copilot", "--model", "gpt-5.6-sol", "--json"],
			model: "gpt-5.6-sol",
			longContext: true,
		},
		{
			name: "agent denied",
			args: [
				"agent",
				"spawn",
				"--prompt",
				"Inspect the current diff.",
				"--harness",
				"copilot",
				"--model",
				"gemini-3.6-flash",
				"--json",
			],
			model: "gemini-3.6-flash",
			longContext: false,
		},
		{
			name: "agent allowed",
			args: [
				"agent",
				"spawn",
				"--prompt",
				"Inspect the current diff.",
				"--harness",
				"copilot",
				"--model",
				"gpt-5.6-sol",
				"--json",
			],
			model: "gpt-5.6-sol",
			longContext: true,
		},
	])("$name Copilot spawn composes the model-specific long-context argv", ({
		args,
		model,
		longContext,
	}) => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const result = pij(args, { PIJ_SESSION_ID: "pij-A", HOME });

		expect(result.code).toBe(0);
		const log = readFileSync(TMUX_LOG, "utf8");
		expect(log).toContain(model);
		if (longContext) {
			expect(log).toContain("long_context");
		} else {
			expect(log).not.toContain("long_context");
		}
	});

	// FLAKY (quarantined 2026-07-21, Jordan ruling): passes in isolation, fails under full-suite parallel-load contention. Re-enable when the suite is de-contended.
	it.skip("known pane-launch failure releases only its reservation and expectation", () => {
		clearSpawnExpectations();
		const expectationStore = new FsSpawnExpectationStore(HOME);
		expectationStore.write({
			spawnId: "sentinel",
			requestedHarness: "pi",
			requestedAt: "2026-07-20T00:00:00.000Z",
		});
		writeFileSync(TMUX_LOG, "");
		const result = pij(["spawn", "--harness", "claude", "--json"], {
			PIJ_SESSION_ID: "pij-A",
			FAKE_TMUX_FAIL: "1",
		});
		expect(result.code).toBe(2);
		const log = readFileSync(TMUX_LOG, "utf8");
		const id = log.match(/PIJ_SESSION_ID=(pij-[a-z]+(?:-[a-z]+)*)/)?.[1];
		expect(id).toBeDefined();
		expect(new FsRegistry(HOME).read(id as string)).toBeNull();
		expect(new FsRegistry(HOME).hasReservation(id as string)).toEqual({
			ok: true,
			value: false,
		});
		expect(expectationStore.list().map((expectation) => expectation.spawnId)).toEqual(["sentinel"]);
	});

	it("agent spawn correlates its prelaunch expectation, pane, descriptor, and harness", () => {
		clearSpawnExpectations();
		writeFileSync(TMUX_LOG, "");
		const result = pij(
			["agent", "spawn", "--prompt", "Inspect the current diff.", "--harness", "claude", "--json"],
			{ PIJ_SESSION_ID: "pij-A" },
		);
		expect(result.code).toBe(0);
		const jsonLine = result.out
			.trim()
			.split("\n")
			.findLast((line) => line.startsWith("{"));
		const output = JSON.parse(jsonLine ?? "{}") as { id: string; agentPack: string };
		expect(output.id).toMatch(/^pij-[a-z]+(?:-[a-z]+)*$/);
		expect(output.agentPack).toBe("inline");
		const descriptor = new FsRegistry(HOME).read(output.id);
		expect(descriptor).toMatchObject({
			id: output.id,
			agentPack: "inline",
			parentId: "pij-A",
			lifecycle: "pending",
		});
		expect(new FsSpawnExpectationStore(HOME).read(descriptor?.spawnId ?? "")).toMatchObject({
			spawnId: descriptor?.spawnId,
			creatorId: "pij-A",
			requestedHarness: "claude",
			paneId: descriptor?.paneId,
			sessionId: output.id,
			runtimeHarness: "claude",
		});
		expect(prelaunchSnapshots()).toEqual([
			expect.stringContaining(`"spawnId":"${descriptor?.spawnId}"`),
		]);
		expect(prelaunchSnapshots()[0]).not.toContain('"paneId"');
		expect(new FsRegistry(HOME).hasReservation(output.id)).toEqual({
			ok: true,
			value: false,
		});
	});

	it("CLI close traces intent → kill → requested terminal → dissolve and retains history", () => {
		const id = "pij-close-p3";
		const spawnId = "spawn-close-p3";
		new FsRegistry(HOME).write({
			id,
			folder: FOLDER,
			dataDir: join(HOME, id),
			eventsPath: join(HOME, id, "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-20T00:00:00.000Z",
			paneId: "%88",
			spawnedBy: "pij-A",
			harness: "claude",
			lifecycle: "bound",
			spawnId,
		});
		new FsSpawnExpectationStore(HOME).write({
			spawnId,
			creatorId: "pij-A",
			requestedHarness: "claude",
			requestedAt: "2026-07-20T00:00:00.000Z",
			deadlineAt: "2026-07-20T00:05:00.000Z",
			paneId: "%88",
		});
		const tracePath = join(HOME, "p3-close.trace");
		const result = pij(["close", id], {
			PIJ_SESSION_ID: "pij-A",
			PIJ_TEST_P3_TRACE: tracePath,
		});
		expect(result.code).toBe(0);
		expect(readFileSync(tracePath, "utf8").trim().split("\n")).toEqual([
			"close:intent-write",
			"close:kill",
			"close:terminal-write",
			"close:dissolve",
		]);
		expect(new FsRegistry(HOME).read(id)).toMatchObject({
			lifecycle: "dissolved",
			closeIntent: { actor: "pij-A", kind: "cli-close" },
			terminal: { disposition: "requested", evidence: "pane-missing" },
		});
		expect(new FsSpawnExpectationStore(HOME).read(spawnId)).toMatchObject({
			spawnId,
			closeIntent: { actor: "pij-A", kind: "cli-close" },
		});
	});

	it("Copilot adopt uses only the validated current env uuid, never the global newest session", () => {
		const registry = new FsRegistry(HOME);
		const oldId = "pij-old-copilot";
		const oldUuid = "2a870000-1111-4222-8333-444444444444";
		const currentUuid = "df4f0000-5555-4666-8777-888888888888";
		const copilotHome = join(HOME, "copilot-current-home");
		createCopilotState(copilotHome, currentUuid, 1000);
		createCopilotState(copilotHome, oldUuid, 9000);
		registry.write({
			id: oldId,
			folder: FOLDER,
			dataDir: join(HOME, oldId),
			eventsPath: join(HOME, oldId, "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-11T00:00:00.000Z",
			harness: "copilot",
			harnessSessionId: oldUuid,
			paneId: "%66",
			lifecycle: "bound",
		});
		const oldPath = join(HOME, `${oldId}.json`);
		const oldBytes = readFileSync(oldPath, "utf8");

		const current = pij(["adopt", "%7", "--harness", "copilot", "--json"], {
			HOME: copilotHome,
			COPILOT_AGENT_SESSION_ID: currentUuid,
		});
		expect(current.code).toBe(0);
		const output = JSON.parse(current.out) as { id: string; harnessSessionId: string };
		expect(output.harnessSessionId).toBe(currentUuid);
		expect(output.id).not.toBe(oldId);
		expect(registry.read(output.id)).toMatchObject({
			harness: "copilot",
			harnessSessionId: currentUuid,
			paneId: "%7",
			lifecycle: "bound",
		});
		expect(readFileSync(oldPath, "utf8")).toBe(oldBytes);
		expect(registry.read(oldId)).toMatchObject({
			harnessSessionId: oldUuid,
			paneId: "%66",
		});

		const explicitUuid = "61f70000-9999-4aaa-8bbb-cccccccccccc";
		const explicit = pij(
			["adopt", "%9", "--harness", "copilot", "--session-id", explicitUuid, "--json"],
			{
				HOME: copilotHome,
				COPILOT_AGENT_SESSION_ID: currentUuid,
			},
		);
		expect(explicit.code).toBe(0);
		expect(JSON.parse(explicit.out)).toMatchObject({ harnessSessionId: explicitUuid });
	});

	it("Copilot adopt ignores global newest when env is absent, then phonehome binds the pending id", () => {
		const registry = new FsRegistry(HOME);
		const oldId = "pij-old-copilot-pending";
		const oldUuid = "2a871111-1111-4222-8333-444444444444";
		const currentUuid = "df4f1111-5555-4666-8777-888888888888";
		const copilotHome = join(HOME, "copilot-pending-home");
		createCopilotState(copilotHome, oldUuid, 9000);
		registry.write({
			id: oldId,
			folder: FOLDER,
			dataDir: join(HOME, oldId),
			eventsPath: join(HOME, oldId, "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-11T00:00:00.000Z",
			harness: "copilot",
			harnessSessionId: oldUuid,
			paneId: "%77",
			lifecycle: "bound",
		});
		const oldPath = join(HOME, `${oldId}.json`);
		const oldBytes = readFileSync(oldPath, "utf8");

		const adopted = pij(["adopt", "%8", "--harness", "copilot", "--json"], {
			HOME: copilotHome,
			COPILOT_AGENT_SESSION_ID: "",
		});
		expect(adopted.code).toBe(0);
		const pending = JSON.parse(adopted.out) as {
			id: string;
			harnessSessionId: null;
			lifecycle: string;
			bindingIssue?: string;
		};
		expect(pending.id).not.toBe(oldId);
		expect(pending).toMatchObject({ harnessSessionId: null, lifecycle: "pending" });
		expect(pending.bindingIssue).toContain("COPILOT_AGENT_SESSION_ID");
		expect(readFileSync(oldPath, "utf8")).toBe(oldBytes);

		createCopilotState(copilotHome, currentUuid, 1000);
		const phoned = pij(["phonehome", "--json"], {
			HOME: copilotHome,
			PIJ_SESSION_ID: pending.id,
			COPILOT_AGENT_SESSION_ID: currentUuid,
			CLAUDE_CODE_SESSION_ID: "claude-wrong",
		});
		expect(phoned.code).toBe(0);
		expect(JSON.parse(phoned.out)).toMatchObject({
			id: pending.id,
			harness: "copilot",
			harnessSessionId: currentUuid,
			lifecycle: "bound",
			confirmed: true,
		});
		expect(registry.read(pending.id)).toMatchObject({
			harnessSessionId: currentUuid,
			lifecycle: "bound",
		});
		expect(readFileSync(oldPath, "utf8")).toBe(oldBytes);
	});

	it("adopt --id renders the stored final binding when no native artifact is discoverable", () => {
		const id = "pij-existing-bound";
		new FsRegistry(HOME).write({
			id,
			folder: FOLDER,
			dataDir: join(HOME, id),
			eventsPath: join(HOME, id, "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-11T00:00:00.000Z",
			harness: "claude",
			harnessSessionId: "native-stored",
			lifecycle: "bound",
		});
		const env = { CLAUDE_CODE_SESSION_ID: "" };
		const json = pij(["adopt", "%7", "--harness", "claude", "--id", id, "--json"], env);
		expect(json.code).toBe(0);
		expect(JSON.parse(json.out)).toMatchObject({
			id,
			harnessSessionId: "native-stored",
			lifecycle: "bound",
		});

		const human = pij(["adopt", "%7", "--harness", "claude", "--id", id], env);
		expect(human.code).toBe(0);
		expect(human.out).toContain(`adopted ${id} ↔ claude session native-stored`);
		expect(human.out).toContain("(pane %7, bound)");
		expect(human.out).not.toContain("pending");
	});

	it("T001 regression-locks live and pending adopt outcomes before dissolved recovery", () => {
		const registry = new FsRegistry(HOME);
		const id = "pij-adopt-live-regression";
		const harnessSessionId = "native-adopt-live-regression";
		registry.write({
			id,
			folder: FOLDER,
			dataDir: join(HOME, id),
			eventsPath: join(HOME, id, "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-29T00:00:00.000Z",
			state: "idle",
			harness: "claude",
			harnessSessionId,
			paneId: "%70",
			lifecycle: "bound",
		});

		const adopted = pij([
			"adopt",
			"%71",
			"--harness",
			"claude",
			"--id",
			id,
			"--session-id",
			harnessSessionId,
		]);
		expect(adopted.code).toBe(0);
		expect(adopted.out).toContain(
			`adopted ${id} ↔ claude session ${harnessSessionId} (pane %71, bound)`,
		);
		expect(new FsRegistry(HOME).read(id)).toMatchObject({
			id,
			harnessSessionId,
			paneId: "%71",
			lifecycle: "bound",
		});

		const whoami = pij(["whoami"], {
			PIJ_SESSION_ID: id,
			TMUX_PANE: "%71",
			CLAUDE_CODE_SESSION_ID: harnessSessionId,
		});
		expect(whoami.code).toBe(0);
		expect(whoami.out).toContain(id);

		const phoned = pij(["phonehome"], {
			PIJ_SESSION_ID: id,
			TMUX_PANE: "%71",
			CLAUDE_CODE_SESSION_ID: harnessSessionId,
		});
		expect(phoned.code).toBe(0);
		expect(phoned.out).toContain(`phoned home: ${id}`);
		expect(phoned.out).toContain("(bound)");

		const pending = pij(["adopt", "%72", "--harness", "claude"], {
			CLAUDE_CODE_SESSION_ID: "",
		});
		expect(pending.code).toBe(0);
		expect(pending.out).toContain("(pane %72, pending)");
		expect(pending.out).not.toContain("bound");
	});

	it("T002 refuses to report a dissolved adopt binding that was not persisted", () => {
		const registry = new FsRegistry(HOME);
		const id = "pij-adopt-dissolved-honesty";
		const harnessSessionId = "native-adopt-dissolved-honesty";
		registry.write({
			id,
			folder: FOLDER,
			dataDir: join(HOME, id),
			eventsPath: join(HOME, id, "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-29T00:00:00.000Z",
			state: "idle",
			harness: "claude",
			harnessSessionId,
			paneId: "%73",
			lifecycle: "bound",
			systemState: "dead",
			closeIntent: { actor: "pij-parent", kind: "cli-close" },
			terminal: { disposition: "requested", evidence: "pane-missing" },
			deathNoticeLatchedAt: "2026-07-29T00:01:00.000Z",
			failureReason: "dead",
		});
		registry.dissolve(id);

		const adopted = pij([
			"adopt",
			"%74",
			"--harness",
			"claude",
			"--id",
			id,
			"--session-id",
			harnessSessionId,
		]);
		const persisted = new FsRegistry(HOME).read(id);
		const bindingPersisted =
			persisted?.lifecycle === "bound" &&
			persisted.harnessSessionId === harnessSessionId &&
			persisted.paneId === "%74";
		const namedRefusal =
			adopted.code !== 0 &&
			/^E-[A-Z]+:/.test(adopted.out) &&
			adopted.out.includes(`pij revive ${id} --attach "$TMUX_PANE"`);
		expect(
			bindingPersisted || namedRefusal,
			`AC-10: dissolved adopt must persist the reported binding or return a named error with a working revive remediation; exit=${adopted.code}; output=${JSON.stringify(adopted.out)}; persisted=${JSON.stringify(persisted)}`,
		).toBe(true);
		if (bindingPersisted) {
			for (const key of [
				"closeIntent",
				"deathNoticeLatchedAt",
				"failureReason",
				"systemState",
				"terminal",
			]) {
				expect(persisted).not.toHaveProperty(key);
			}
		} else {
			expect(adopted.out).not.toContain("bound");
		}

		expect.soft(verifyPersistedAdoptDescriptor(null, "%74")).toEqual({
			ok: false,
			reason: "missing",
		});

		const stillDissolved: SessionDescriptor = {
			id: "pij-adopt-still-dissolved",
			folder: FOLDER,
			dataDir: join(HOME, "pij-adopt-still-dissolved"),
			eventsPath: join(HOME, "pij-adopt-still-dissolved", "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-29T00:00:00.000Z",
			paneId: "%74",
			lifecycle: "dissolved",
		};
		expect
			.soft(verifyPersistedAdoptDescriptor(stillDissolved, "%74"))
			.toEqual({ ok: false, reason: "dissolved" });

		const wrongPane: SessionDescriptor = {
			id: "pij-adopt-wrong-pane",
			folder: FOLDER,
			dataDir: join(HOME, "pij-adopt-wrong-pane"),
			eventsPath: join(HOME, "pij-adopt-wrong-pane", "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-29T00:00:00.000Z",
			paneId: "%73",
			lifecycle: "bound",
		};
		expect
			.soft(verifyPersistedAdoptDescriptor(wrongPane, "%74"))
			.toEqual({ ok: false, reason: "pane-mismatch" });
	});

	it("T005 whoami directs a dissolved ambient identity to revive", () => {
		const registry = new FsRegistry(HOME);
		const id = "pij-whoami-dissolved-remediation";
		const harnessSessionId = "native-whoami-dissolved-remediation";
		registry.write({
			id,
			folder: FOLDER,
			dataDir: join(HOME, id),
			eventsPath: join(HOME, id, "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-29T00:00:00.000Z",
			state: "idle",
			harness: "claude",
			harnessSessionId,
			paneId: "%75",
			lifecycle: "bound",
		});
		registry.dissolve(id);

		const whoami = pij(["whoami"], {
			PIJ_SESSION_ID: "",
			TMUX_PANE: "%75",
			CLAUDE_CODE_SESSION_ID: harnessSessionId,
		});
		expect(whoami.code).toBe(2);
		expect(whoami.out).toContain("E-NOID");
		expect(whoami.out).toContain(`pij revive ${id} --attach "$TMUX_PANE"`);
		expect(whoami.out).not.toContain("pij adopt");
	});

	it("adopt --id is reattachment-only, preserves prime, and can explicitly recover a reservation", () => {
		const registry = new FsRegistry(HOME);
		const opaque = "pij-existing-opaque";
		registry.write({
			id: opaque,
			prime: true,
			folder: FOLDER,
			dataDir: join(HOME, opaque),
			eventsPath: join(HOME, opaque, "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-11T00:00:00.000Z",
		});
		const existing = pij([
			"adopt",
			"%7",
			"--harness",
			"claude",
			"--id",
			opaque,
			"--session-id",
			"native-existing",
			"--json",
		]);
		expect(existing.code).toBe(0);
		expect(JSON.parse(existing.out)).toMatchObject({
			id: opaque,
			harnessSessionId: "native-existing",
		});
		expect(registry.read(opaque)?.prime).toBe(true);
		const conflict = pij([
			"adopt",
			"%7",
			"--harness",
			"claude",
			"--id",
			opaque,
			"--session-id",
			"native-conflict",
		]);
		expect(conflict.code).toBe(2);
		expect(conflict.out).toContain("E-AMBIG");

		const unknown = pij([
			"adopt",
			"%7",
			"--harness",
			"claude",
			"--id",
			"pij-caller-chosen",
			"--session-id",
			"native-unknown",
		]);
		expect(unknown.code).toBe(2);
		expect(unknown.out).toContain("E-NOID");
		expect(registry.read("pij-caller-chosen")).toBeNull();

		const reserved = registry.reserveMemorableId("crash-orphan", "dead-owner", 999_999);
		if (!reserved.ok) throw new Error(reserved.message);
		const recovered = pij([
			"adopt",
			"%7",
			"--harness",
			"claude",
			"--id",
			reserved.value.id,
			"--session-id",
			"native-recovered",
			"--json",
		]);
		expect(recovered.code).toBe(0);
		expect(JSON.parse(recovered.out)).toMatchObject({
			id: reserved.value.id,
			harnessSessionId: "native-recovered",
		});
		expect(registry.hasReservation(reserved.value.id)).toEqual({ ok: true, value: false });
	});

	it("first adopt without --id allocates a memorable primary id", () => {
		const result = pij([
			"adopt",
			"%7",
			"--harness",
			"claude",
			"--session-id",
			"native-first-adopt",
			"--json",
		]);
		expect(result.code).toBe(0);
		const output = JSON.parse(result.out) as { id: string; harnessSessionId: string };
		expect(output).toMatchObject({ harnessSessionId: "native-first-adopt" });
		expect(output.id).toMatch(/^pij-[a-z]+(-[a-z]+)*$/);
	});

	it("no-native adopt reserves then publishes one memorable pending descriptor", () => {
		const result = pij(["adopt", "%8", "--harness", "claude", "--json"], {
			CLAUDE_CODE_SESSION_ID: "",
		});
		expect(result.code).toBe(0);
		const output = JSON.parse(result.out) as {
			id: string;
			harnessSessionId: null;
			lifecycle: string;
		};
		expect(output.id).toMatch(/^pij-[a-z]+(-[a-z]+)*$/);
		expect(output).toMatchObject({ harnessSessionId: null, lifecycle: "pending" });
		expect(new FsRegistry(HOME).read(output.id)).toMatchObject({
			id: output.id,
			paneId: "%8",
			lifecycle: "pending",
		});
		expect(new FsRegistry(HOME).hasReservation(output.id)).toEqual({
			ok: true,
			value: false,
		});
	});

	it("tree/link/adopt/spawn compose over a real repository, linked worktree, and scratch registry", {
		timeout: 30_000,
	}, () => {
		const root = realpathSync(mkdtempSync(join(tmpdir(), "pij-tree-integration-")));
		const home = join(root, "home");
		const main = join(root, "main");
		const worktree = join(root, "worktree");
		const other = join(root, "other");
		mkdirSync(home, { recursive: true });
		mkdirSync(main, { recursive: true });
		mkdirSync(other, { recursive: true });
		const git = (cwd: string, args: string[]): string =>
			execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
		const seedRepository = (cwd: string, name: string): void => {
			git(cwd, ["init", "-q"]);
			git(cwd, ["config", "user.email", "pij@example.test"]);
			git(cwd, ["config", "user.name", "pij test"]);
			writeFileSync(join(cwd, "README.md"), `${name}\n`);
			git(cwd, ["add", "README.md"]);
			git(cwd, ["commit", "-qm", "seed"]);
		};

		try {
			seedRepository(main, "main");
			git(main, ["worktree", "add", "-q", "-b", "linked", worktree]);
			seedRepository(other, "other");
			const commonDir = git(main, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
			const otherCommonDir = git(other, [
				"rev-parse",
				"--path-format=absolute",
				"--git-common-dir",
			]);
			const registry = new FsRegistry(home);
			const write = (id: string, folder: string, extra: Partial<SessionDescriptor> = {}): void => {
				registry.write({
					id,
					folder,
					dataDir: join(home, id),
					eventsPath: join(home, id, "events.ndjson"),
					pid: process.pid,
					startedAt: "2026-07-13T00:00:00.000Z",
					state: "idle",
					...extra,
				});
			};
			write("pij-root", main, {
				parentId: null,
				gitCommonDir: commonDir,
				prime: true,
				harness: "claude",
				harnessSessionId: "native-root",
				lifecycle: "bound",
			});
			write("pij-child", worktree, {
				parentId: "pij-root",
				spawnedBy: "pij-close-owner",
				oldPrime: true,
			});
			write("pij-grandchild", worktree, { parentId: "pij-child" });
			write("pij-other", other, { parentId: null, gitCommonDir: otherCommonDir });
			write("pij-closed", main, {
				parentId: "pij-root",
				gitCommonDir: commonDir,
				lifecycle: "dissolved",
			});

			const env = { PIJ_HOME: home, CLAUDE_CODE_SESSION_ID: "" };
			const repositoryTree = pij(["tree", "--json"], env, main);
			expect(repositoryTree.code).toBe(0);
			expect(repositoryTree.out).toContain("pij-root");
			expect(repositoryTree.out).toContain("pij-child");
			expect(repositoryTree.out).not.toContain("pij-other");
			expect(repositoryTree.out).not.toContain("pij-closed");

			const globalTree = pij(["tree", "--global", "--all", "--json"], env, main);
			expect(globalTree.code).toBe(0);
			expect(globalTree.out).toContain("pij-other");
			// `--all` shows the dead, never the buried — a dissolved seat is hidden
			// from `list`, so emitting it here is a card with no row behind it.
			expect(globalTree.out).not.toContain('"lifecycle":"dissolved"');
			expect(globalTree.out).not.toContain("pij-closed");
			// Burial stays reachable on an explicit axis.
			const buried = pij(["tree", "--global", "--lifecycle", "dissolved", "--json"], env, main);
			expect(buried.out).toContain("pij-closed");
			const human = pij(["tree", "--global", "--all"], env, main);
			expect(human.out).toContain("P pij-root");
			expect(human.out).toContain("O pij-child");
			expect(human.out).not.toContain("pij-closed");

			const subtree = pij(["tree", "pij-other", "--json"], env, main);
			expect(subtree.code).toBe(0);
			expect(subtree.out).toContain("pij-other");
			expect(subtree.out).not.toContain("pij-root");

			const beforeCycle = readFileSync(join(home, "pij-root.json"), "utf8");
			const cycle = pij(["link", "pij-root", "--parent", "pij-grandchild"], env, main);
			expect(cycle.code).not.toBe(0);
			expect(readFileSync(join(home, "pij-root.json"), "utf8")).toBe(beforeCycle);

			// P3 T004: with the bin's platform stores wired, link is an audited
			// write verb (F2) — an unattributable caller is refused BEFORE any
			// descriptor write, naming the --actor escape hatch.
			//
			// "Unattributable" has to be CONSTRUCTED, not assumed: resolveSelf has
			// three ways in, and this probe must close all of them or it proves
			// nothing. Run from `root` (no descriptor claims it as its folder, so
			// the lone-local branch can't fire — from `main` it would, since
			// pij-root lives there) with the pane hint cleared (the helper pins
			// TMUX_PANE=%1 for every other call) and no session id.
			// Prior to this, `root` was not realpathed and the probe only LOOKED refused
			// on macOS, where
			// mkdtemp's /var symlink defeats the folder match that Linux makes —
			// so it passed locally and failed in CI against correct product code.
			const unattributedEnv = { ...env, PIJ_SESSION_ID: "", TMUX_PANE: "" };
			const unattributed = pij(["link", "pij-child", "--root", "--json"], unattributedEnv, root);
			expect(unattributed.code).not.toBe(0);
			expect(unattributed.out).toContain("--actor");
			expect(registry.read("pij-child")?.parentId).toBe("pij-root");

			const asRoot = { ...env, PIJ_SESSION_ID: "pij-root" };
			const rooted = pij(["link", "pij-child", "--root", "--json"], asRoot, main);
			expect(rooted.code).toBe(0);
			expect(registry.read("pij-child")).toMatchObject({
				parentId: null,
				spawnedBy: "pij-close-owner",
			});
			const reparented = pij(["link", "pij-child", "--parent", "pij-root", "--json"], asRoot, main);
			expect(reparented.code).toBe(0);
			// The re-parent history is on the spine, end to end through the bin.
			const hops = pij(["spine", "events", "--peer", "pij-child", "--json"], asRoot, main);
			expect(hops.code).toBe(0);
			const hopEvents = JSON.parse(hops.out) as Array<Record<string, unknown>>;
			expect(hopEvents.filter((e) => e.kind === "node-linked")).toHaveLength(2);

			const adopted = pij(
				[
					"adopt",
					"%7",
					"--harness",
					"claude",
					"--session-id",
					"native-adopted",
					"--parent",
					"pij-root",
					"--json",
				],
				env,
				main,
			);
			expect(adopted.code).toBe(0);
			const adoptedId = (JSON.parse(adopted.out) as { id: string }).id;
			expect(registry.read(adoptedId)).toMatchObject({
				parentId: "pij-root",
				gitCommonDir: commonDir,
			});

			const beforeUnknown = readdirSync(home)
				.filter((name) => name.endsWith(".json"))
				.sort();
			const unknownParent = pij(
				[
					"adopt",
					"%8",
					"--harness",
					"claude",
					"--session-id",
					"native-unknown-parent",
					"--parent",
					"missing",
				],
				env,
				main,
			);
			expect(unknownParent.code).not.toBe(0);
			expect(
				readdirSync(home)
					.filter((name) => name.endsWith(".json"))
					.sort(),
			).toEqual(beforeUnknown);

			const beforeAdoptCycle = readFileSync(join(home, "pij-root.json"), "utf8");
			const adoptCycle = pij(
				[
					"adopt",
					"%9",
					"--harness",
					"claude",
					"--id",
					"pij-root",
					"--session-id",
					"native-root",
					"--parent",
					"pij-grandchild",
				],
				env,
				main,
			);
			expect(adoptCycle.code).not.toBe(0);
			expect(readFileSync(join(home, "pij-root.json"), "utf8")).toBe(beforeAdoptCycle);

			writeFileSync(TMUX_LOG, "");
			const spawned = pij(
				["spawn", "--harness", "claude", "--json"],
				{ ...env, PIJ_SESSION_ID: "pij-root" },
				main,
			);
			expect(spawned.code).toBe(0);
			const jsonLine = spawned.out
				.trim()
				.split("\n")
				.findLast((line) => line.startsWith("{"));
			const spawnedId = (JSON.parse(jsonLine ?? "{}") as { id: string }).id;
			expect(registry.read(spawnedId)).toMatchObject({
				spawnedBy: "pij-root",
				parentId: "pij-root",
				gitCommonDir: commonDir,
			});

			writeFileSync(TMUX_LOG, "");
			const agentSpawned = pij(
				[
					"agent",
					"spawn",
					"--prompt",
					"Inspect the current tree.",
					"--harness",
					"claude",
					"--json",
				],
				{ ...env, PIJ_SESSION_ID: "pij-root" },
				main,
			);
			expect(agentSpawned.code).toBe(0);
			const agentJsonLine = agentSpawned.out
				.trim()
				.split("\n")
				.findLast((line) => line.startsWith("{"));
			const agentSpawnedId = (JSON.parse(agentJsonLine ?? "{}") as { id: string }).id;
			expect(registry.read(agentSpawnedId)).toMatchObject({
				spawnedBy: "pij-root",
				parentId: "pij-root",
				gitCommonDir: commonDir,
				agentPack: "inline",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("AC-6 command: send --command compact is accepted + the peer executes it", () => {
		const r = pij(["send", "pij-B", "--command", "compact"], { PIJ_SESSION_ID: "pij-A" });
		expect(r.code).toBe(0);
		const cmd = readdirSync(join(HOME, "pij-B", "inbox"))
			.map((f) => JSON.parse(readFileSync(join(HOME, "pij-B", "inbox", f), "utf8")) as PijMessage)
			.find((m) => m.command === "compact");
		expect(cmd).toBeTruthy();
		// the receiver runs the allow-listed command through its runtime (real coordinator).
		const res = B.onInbound(cmd as PijMessage, "m-cmd-1");
		expect(res).toMatchObject({ kind: "command-executed", command: "compact" });
	});

	it("AC-13 receipt loop: B records inbound + emits a receipt; A records it; tail shows it", () => {
		// A -> B free text (idle B injects + emits the 'delivered' receipt to A's inbox).
		const msg: PijMessage = { from: "pij-A", to: "pij-B", body: "ping" };
		B.onInbound(msg, "m-int-1");
		const aInbox = join(HOME, "pij-A", "inbox");
		const files = readdirSync(aInbox);
		expect(files.length).toBeGreaterThan(0);
		const receipt = JSON.parse(
			readFileSync(join(aInbox, files[0] as string), "utf8"),
		) as PijMessage;
		expect(receipt).toMatchObject({ from: "pij-B", to: "pij-A", kind: "receipt" });
		// A records the receipt as an event (never injected); tail surfaces it (AC-13).
		A.onInbound(receipt, "m-int-2");
		const r = pij(["tail", "pij-A", "--type", "receipt", "--since", "0"]);
		expect(r.code).toBe(0);
		expect(r.out).toContain("receipt");
	});

	it("peer watch CLI mutates the caller sidecar via PIJ_SESSION_ID", () => {
		new FsRegistry(HOME).write({
			id: "pij-C",
			folder: FOLDER,
			dataDir: join(HOME, "pij-C"),
			eventsPath: join(HOME, "pij-C", "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-06T00:00:00.000Z",
			harness: "claude",
			lifecycle: "bound",
		});
		const watched = pij(["watch", "src/**/*.ts"], { PIJ_SESSION_ID: "pij-C" });
		expect(watched.code).toBe(0);
		const sidecarPath = join(HOME, "pij-C", "watches.json");
		const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8")) as {
			watches: Array<{ dir: string; patterns: string[] }>;
		};
		expect(sidecar.watches).toHaveLength(1);
		expect(sidecar.watches[0]).toMatchObject({ dir: "src", patterns: ["**/*.ts"] });

		const unwatched = pij(["unwatch", "src/**/*.ts"], { PIJ_SESSION_ID: "pij-C" });
		expect(unwatched.code).toBe(0);
		const after = JSON.parse(readFileSync(sidecarPath, "utf8")) as { watches: unknown[] };
		expect(after.watches).toEqual([]);
	});

	it("peer watch CLI parses and upserts --debounce values", () => {
		new FsRegistry(HOME).write({
			id: "pij-D",
			folder: FOLDER,
			dataDir: join(HOME, "pij-D"),
			eventsPath: join(HOME, "pij-D", "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-10T00:00:00.000Z",
			harness: "copilot",
			lifecycle: "bound",
		});
		const sidecarPath = join(HOME, "pij-D", "watches.json");
		const readDebounce = (): number | undefined => {
			const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8")) as {
				watches: Array<{ debounceMs?: number }>;
			};
			expect(sidecar.watches).toHaveLength(1);
			return sidecar.watches[0]?.debounceMs;
		};

		expect(
			pij(["watch", "--debounce", "750", "src/**/*.ts"], { PIJ_SESSION_ID: "pij-D" }).code,
		).toBe(0);
		expect(readDebounce()).toBe(750);

		expect(
			pij(["watch", "--debounce", "2s", "src/**/*.ts"], { PIJ_SESSION_ID: "pij-D" }).code,
		).toBe(0);
		expect(readDebounce()).toBe(2000);

		expect(
			pij(["watch", "--debounce", "750ms", "src/**/*.ts"], { PIJ_SESSION_ID: "pij-D" }).code,
		).toBe(0);
		expect(readDebounce()).toBe(750);
	});

	it("peer watch CLI rejects invalid debounce values before writing a sidecar", () => {
		new FsRegistry(HOME).write({
			id: "pij-E",
			folder: FOLDER,
			dataDir: join(HOME, "pij-E"),
			eventsPath: join(HOME, "pij-E", "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-10T00:00:00.000Z",
			harness: "claude",
			lifecycle: "bound",
		});
		const sidecarPath = join(HOME, "pij-E", "watches.json");
		for (const value of ["0", "-1", "NaN", "1m"]) {
			const result = pij(["watch", "--debounce", value, "src/**/*.ts"], {
				PIJ_SESSION_ID: "pij-E",
			});
			expect(result.code).toBe(64);
			expect(result.out).toContain("--debounce");
			expect(existsSync(sidecarPath)).toBe(false);
		}
	});

	it("peer watch CLI errors for unresolved self, missing args, and pi sessions", () => {
		expect(pij(["watch", "src/**/*.ts"], { PIJ_SESSION_ID: "missing" }).code).not.toBe(0);
		expect(pij(["watch"], { PIJ_SESSION_ID: "pij-A" }).code).not.toBe(0);
		expect(pij(["watch", "src/**/*.ts"], { PIJ_SESSION_ID: "pij-A" }).out).toContain(
			"non-pi peers only",
		);
	});

	it("state clear round-trips through the real CLI without materializing a second assignment", () => {
		const caller = { PIJ_SESSION_ID: "pij-B" };
		const set = pij(["report", "state", "hold", "--json"], caller);
		expect(set.code).toBe(0);
		const clear = pij(["report", "clear", "--json"], caller);
		expect(clear.code).toBe(0);
		expect(JSON.parse(clear.out)).toMatchObject({ kind: "state-cleared", peer: "pij-B" });
		const card = pij(["node", "show", "pij-B", "--json"]);
		expect(card.code).toBe(0);
		expect(JSON.parse(card.out)).toMatchObject({ semanticState: null });
		const repeat = pij(["report", "clear"], caller);
		expect(repeat.code).toBe(64);
		expect(repeat.out).toContain("undeclared");
	});

	it("report now round-trips state-set → status and projects the durable denorm", () => {
		const caller = { PIJ_SESSION_ID: "pij-B" };
		const result = pij(
			["report", "now", "fixed the CLI", "review the diff", "--state", "ready", "--json"],
			caller,
		);
		expect(result.code).toBe(0);
		const status = JSON.parse(result.out) as { kind: string; seq: number; refs: string[] };
		expect(status.kind).toBe("status");
		expect(status.refs.some((ref) => ref.startsWith("state-set:"))).toBe(true);
		const events = new FsSpineLog(HOME).read({ peer: "pij-B" });
		expect(events.slice(-2).map((event) => event.kind)).toEqual(["state-set", "status"]);
		const card = pij(["node", "show", "pij-B", "--json"]);
		expect(card.code).toBe(0);
		expect(JSON.parse(card.out)).toMatchObject({
			semanticState: "ready",
			statusPrev: "fixed the CLI",
			statusNext: "review the diff",
			statusSeq: status.seq,
		});
	});
});

// ─── P3 caller-truth parent derivation (plan 054 — AC-08, issue #20) ─────────
// Behavior contracts through the REAL bin (SW-7 law: outcomes only — these
// must survive s051's identity/ownership rewrite unchanged). The parent of a
// spawned node is the INVOKING SESSION, resolved from identity alone
// (PIJ_SESSION_ID, else a unique pane-exact match across the FULL registry);
// cwd cohabitation never makes a parent.
describe("caller-truth spawn parent (AC-08)", () => {
	let WORKTREE: string;
	let LONELY: string;

	beforeAll(() => {
		WORKTREE = realpathSync(mkdtempSync(join(tmpdir(), "pij-worktree-")));
		LONELY = realpathSync(mkdtempSync(join(tmpdir(), "pij-lonely-")));
		const reg = new FsRegistry(HOME);
		// A cwd cohabitant of WORKTREE — the issue-#20 bait. Never a parent.
		reg.write({
			id: "pij-neighbor",
			folder: WORKTREE,
			dataDir: join(HOME, "pij-neighbor"),
			eventsPath: join(HOME, "pij-neighbor", "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-17T00:00:00.000Z",
			harness: "claude",
			lifecycle: "bound",
		});
		// The real caller: registered under a DIFFERENT folder, identified by
		// its pane (adopted-peer-in-worktree shape).
		reg.write({
			id: "pij-crosscwd",
			folder: LONELY,
			dataDir: join(HOME, "pij-crosscwd"),
			eventsPath: join(HOME, "pij-crosscwd", "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-17T00:00:00.000Z",
			paneId: "%777",
			harness: "claude",
			lifecycle: "bound",
		});
	});

	afterAll(() => {
		rmSync(WORKTREE, { recursive: true, force: true });
		rmSync(LONELY, { recursive: true, force: true });
	});

	function spawnedDescriptor(
		extraEnv: Record<string, string>,
		cwd: string,
	): SessionDescriptor & Record<string, unknown> {
		writeFileSync(TMUX_LOG, "");
		const result = pij(["spawn", "--harness", "claude", "--json"], extraEnv, cwd);
		expect(result.code).toBe(0);
		const jsonLine = result.out
			.trim()
			.split("\n")
			.findLast((line) => line.startsWith("{"));
		const output = JSON.parse(jsonLine ?? "{}") as { id: string };
		const descriptor = new FsRegistry(HOME).read(output.id);
		expect(descriptor).not.toBeNull();
		return descriptor as SessionDescriptor & Record<string, unknown>;
	}

	it("issue-#20 kill: env unset + no pane match ⇒ NO parent, even with a lone cwd cohabitant", () => {
		const d = spawnedDescriptor({ PIJ_SESSION_ID: "", TMUX_PANE: "%none" }, WORKTREE);
		expect(d.parentId).toBeUndefined();
		expect(d.spawnedBy).toBeUndefined();
	});

	it("env unset + pane-exact match resolves the caller across the FULL registry (cross-cwd)", () => {
		// Invoked from WORKTREE; the caller's registered folder is LONELY. The
		// pane identity alone must resolve it — cwd filtering would lose it.
		const d = spawnedDescriptor({ PIJ_SESSION_ID: "", TMUX_PANE: "%777" }, WORKTREE);
		expect(d.parentId).toBe("pij-crosscwd");
		expect(d.spawnedBy).toBe("pij-crosscwd");
	});

	it("PIJ_SESSION_ID wins over both cwd cohabitants and pane matches", () => {
		const d = spawnedDescriptor({ PIJ_SESSION_ID: "pij-A", TMUX_PANE: "%777" }, WORKTREE);
		expect(d.parentId).toBe("pij-A");
		expect(d.spawnedBy).toBe("pij-A");
	});

	it("pi spawn announce target follows the same rule: pane identity yes, cwd cohabitant no", () => {
		// Cohabitant-only shape: announce must NOT name the neighbor.
		writeFileSync(TMUX_LOG, "");
		const bare = pij(
			["spawn", "--harness", "pi", "--json"],
			{ PIJ_SESSION_ID: "", TMUX_PANE: "%none" },
			WORKTREE,
		);
		expect(bare.code).toBe(0);
		expect(readFileSync(TMUX_LOG, "utf8")).toContain("PIJ_ANNOUNCE_TO= ");
		// Cross-cwd pane identity: announce resolves the true caller.
		writeFileSync(TMUX_LOG, "");
		const paned = pij(
			["spawn", "--harness", "pi", "--json"],
			{ PIJ_SESSION_ID: "", TMUX_PANE: "%777" },
			WORKTREE,
		);
		expect(paned.code).toBe(0);
		expect(readFileSync(TMUX_LOG, "utf8")).toContain("PIJ_ANNOUNCE_TO=pij-crosscwd");
	});

	it("adopt honors --parent end-to-end and stays parentless without it", () => {
		const withParent = pij(
			["adopt", "%81", "--harness", "claude", "--parent", "pij-A", "--json"],
			{ PIJ_SESSION_ID: "", FAKE_TMUX_CWD: LONELY },
			LONELY,
		);
		expect(withParent.code).toBe(0);
		const adoptedId = (JSON.parse(withParent.out) as { id: string }).id;
		const adopted = new FsRegistry(HOME).read(adoptedId);
		expect(adopted?.parentId).toBe("pij-A");

		const bare = pij(
			["adopt", "%82", "--harness", "claude", "--json"],
			{ PIJ_SESSION_ID: "", FAKE_TMUX_CWD: LONELY },
			LONELY,
		);
		expect(bare.code).toBe(0);
		const bareId = (JSON.parse(bare.out) as { id: string }).id;
		const bareDescriptor = new FsRegistry(HOME).read(bareId);
		expect(bareDescriptor?.parentId).toBeUndefined();
		expect(bareDescriptor?.spawnedBy).toBeUndefined();
	});
});

// ─── plan 054 P4 T002 — `pij spine render` through the real bin (AC-10) ─────
// The write is BIN-owned: core's parse tables carry the row for E-ARG/usage
// parity, but the markdown lands via the bin's intercept (SpineLogPort has no
// markdown-write method by design). Proofs: the file lands under
// $PIJ_HOME/spine/spine.md, is byte-identical to the pure render of the log,
// and re-rendering an unchanged log is byte-stable.

describe("pij spine render (P4 T002 — bin-owned write, AC-10)", () => {
	it("writes spine/spine.md byte-identical to the pure render; --json reports path/bytes/events", () => {
		// Attributed appends so the log is non-empty regardless of suite order.
		const asActor = { PIJ_SESSION_ID: "", TMUX_PANE: "" };
		const a = pij(
			[
				"spine",
				"append",
				"--kind",
				"render-probe",
				"--peer",
				"pij-render-a",
				"--actor",
				"render-tester",
			],
			asActor,
		);
		expect(a.code).toBe(0);
		const b = pij(
			[
				"spine",
				"append",
				"--kind",
				"render-probe",
				"--refs",
				"node:pij-render-a",
				"--actor",
				"render-tester",
			],
			asActor,
		);
		expect(b.code).toBe(0);

		const r = pij(["spine", "render", "--json"]);
		expect(r.code).toBe(0);
		const envlp = JSON.parse(r.out) as { path: string; bytes: number; events: number };
		expect(envlp.path).toBe(join(HOME, "spine", "spine.md"));

		const written = readFileSync(envlp.path, "utf8");
		const events = new FsSpineLog(HOME).read();
		expect(written).toBe(renderSpineMd(events));
		expect(envlp.events).toBe(events.length);
		expect(envlp.bytes).toBe(Buffer.byteLength(written, "utf8"));
		expect(written).toContain("render-probe");
	});

	it("re-render of an unchanged log is byte-stable; human mode names the path", () => {
		const before = readFileSync(join(HOME, "spine", "spine.md"), "utf8");
		const again = pij(["spine", "render"]);
		expect(again.code).toBe(0);
		expect(again.out).toContain(join(HOME, "spine", "spine.md"));
		expect(readFileSync(join(HOME, "spine", "spine.md"), "utf8")).toBe(before);
	});

	it("renders an EMPTY spine as the header-only document (fresh temp home)", () => {
		const freshHome = mkdtempSync(join(tmpdir(), "pij-render-empty-"));
		const r = pij(["spine", "render", "--json"], { PIJ_HOME: freshHome });
		expect(r.code).toBe(0);
		const envlp = JSON.parse(r.out) as { path: string; events: number };
		expect(envlp.events).toBe(0);
		const written = readFileSync(join(freshHome, "spine", "spine.md"), "utf8");
		expect(written).toBe(renderSpineMd([]));
		expect(written).toContain("_No events._");
		rmSync(freshHome, { recursive: true, force: true });
	});

	it("--project publishes a FILTERED view to spine/<slug>.spine.md — spine.md untouched (s057)", () => {
		const asActor = { PIJ_SESSION_ID: "", TMUX_PANE: "" };
		const a = pij(
			[
				"spine",
				"append",
				"--kind",
				"render-probe",
				"--project",
				"render-proj",
				"--actor",
				"render-tester",
			],
			asActor,
		);
		expect(a.code).toBe(0);
		const before = readFileSync(join(HOME, "spine", "spine.md"), "utf8");
		const r = pij(["spine", "render", "--project", "render-proj", "--json"]);
		expect(r.code).toBe(0);
		const envlp = JSON.parse(r.out) as { path: string; bytes: number; events: number };
		expect(envlp.path).toBe(join(HOME, "spine", "render-proj.spine.md"));
		const written = readFileSync(envlp.path, "utf8");
		const events = new FsSpineLog(HOME).read({ project: "render-proj" });
		expect(events.length).toBeGreaterThan(0);
		expect(written).toBe(renderSpineMd(events, { title: "pij spine — project render-proj" }));
		expect(envlp.events).toBe(events.length);
		expect(envlp.bytes).toBe(Buffer.byteLength(written, "utf8"));
		// A filtered view must NEVER overwrite the machine-wide spine.md.
		expect(readFileSync(join(HOME, "spine", "spine.md"), "utf8")).toBe(before);
	});

	it("--project rejects a non-slug shape with E-ARG (the slug becomes a filename)", () => {
		const r = pij(["spine", "render", "--project", "../escape"]);
		expect(r.code).toBe(64);
		expect(r.out).toContain("E-ARG");
	});
});

describe("large --json output survives the 64KB pipe boundary (s057 dogfood)", () => {
	// A hard process.exit() after write() raced the stdout pipe buffer: any
	// payload past 64KB was cut at exactly 65536 bytes (found live: `tree
	// --global --json` over 1394 real descriptors returned unparseable JSON).
	it("tree --global --liveness dead --json over 1200 descriptors parses complete THROUGH A REAL PIPE", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-bigout-"));
		for (let i = 0; i < 1200; i++) {
			const id = `pij-big-${String(i).padStart(4, "0")}`;
			writeFileSync(
				join(home, `${id}.json`),
				JSON.stringify({
					id,
					folder: `/tmp/big/${i}`,
					dataDir: join(home, id),
					eventsPath: join(home, id, "events.ndjson"),
					pid: 90_000_000 + i,
					startedAt: new Date(1752800000000 + i).toISOString(),
					state: "idle",
					systemState: "idle",
					lifecycle: "bound",
					harness: "claude",
				}),
			);
		}
		const env = { ...process.env, PIJ_HOME: home, TMUX_PANE: "" };
		const args = ["tree", "--global", "--liveness", "dead", "--json"];
		// Direct capture only tells us the FULL size: execFileSync drains the pipe
		// eagerly, so the child never hits the OS pipe-buffer backpressure that
		// causes the real exit-race truncation — which is why the prior version of
		// this test was VACUOUS (green while `pij ... | wc -c` truncated live).
		const full = Buffer.byteLength(
			execFileSync(TSX, [CLI, ...args], {
				env,
				encoding: "utf8",
				maxBuffer: 16 * 1024 * 1024,
				timeout: 30_000,
			}),
			"utf8",
		);
		expect(full).toBeGreaterThan(200_000); // well past any 64/128KB pipe boundary
		// THROUGH A REAL PIPE WITH A DELAYED READER — the live truncation scenario.
		// A plain `| cat` cannot catch it: an eager reader keeps the OS pipe buffer
		// drained, so the child never sustains backpressure. `( sleep 0.5; cat )`
		// lets the buffer FILL, so a hard process.exit() (or an empty-string write
		// callback that fast-paths, the old 5db11c1 pattern) drops libuv's unflushed
		// queue and cuts the payload at the pipe boundary. Only a drain-safe exit
		// (process.exitCode + natural return) blocks until the reader drains. Verified
		// non-vacuous: old cut at ~64-80KB across runs; the fix equals `full` every run.
		const piped = execFileSync(
			"sh",
			["-c", `'${TSX}' '${CLI}' ${args.join(" ")} | ( sleep 0.5; cat )`],
			{ env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 30_000 },
		);
		expect(Buffer.byteLength(piped, "utf8")).toBe(full); // NOT truncated at the pipe boundary
		const forest = JSON.parse(piped) as { roots: Array<{ id?: string }> };
		expect((piped.match(/pij-big-/g) ?? []).length).toBeGreaterThanOrEqual(1200);
		expect(forest.roots.length).toBeGreaterThanOrEqual(1200);
		rmSync(home, { recursive: true, force: true });
	});
});

describe("bin-owned output survives the 64 KiB pipe boundary (AC-16)", () => {
	it("pij queue emits all 812 rows through a piped stdout", () => {
		const home = mkdtempSync(join(tmpdir(), "pij-queue-bigout-"));
		try {
			const queue = new SqliteQueue(home);
			try {
				for (let i = 0; i < 812; i++) {
					const suffix = String(i).padStart(4, "0");
					const delivered = queue.deliver({
						from: `pij-stdout-source-${suffix}`,
						to: `pij-stdout-target-${suffix}`,
						body: "x",
					});
					expect(delivered.ok).toBe(true);
				}
			} finally {
				queue.close();
			}

			const result = spawnSync(TSX, [CLI, "queue"], {
				env: { ...process.env, PIJ_HOME: home, PIJ_QUEUE_BACKEND: "sqlite", TMUX_PANE: "" },
				encoding: "utf8",
				maxBuffer: 16 * 1024 * 1024,
				timeout: 30_000,
			});
			expect(result.error).toBeUndefined();
			expect(result.status).toBe(0);
			expect(Buffer.byteLength(result.stdout, "utf8")).toBeGreaterThan(65_536);
			expect(result.stdout.trimEnd().split("\n").at(-1)).toContain("pij-stdout-target-0811");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});

// ── plan 084 Phase 2, AC-06: the allowance must survive BOTH gate seams ─────
// THE TEST THAT WOULD HAVE CAUGHT KEY FINDING 02. The gate has two seams: the
// bin's `paBinRefusal` runs on raw argv before core parse, and `paGate` runs
// inside `dispatch()`. Every other PA test in this repo calls the pure
// predicate, so a fix that lived only in `paGate` would pass all of them and
// STILL refuse at the command line. This drives the REAL bin as a subprocess.
//
// Ambient identity is established deliberately (`harness`/`harnessSessionId` +
// `CLAUDE_CODE_SESSION_ID`) rather than relying on `PIJ_SESSION_ID`, because
// the bin seam resolves the caller through `resolveAmbientSelf` and does NOT
// read `PIJ_SESSION_ID` — a test that set only the env var would leave the bin
// seam failing open and prove nothing about it.
describe("PA capability gate — enforced identically at BOTH seams (AC-06)", () => {
	function sandbox(): { home: string; folder: string; env: Record<string, string> } {
		const root = realpathSync(mkdtempSync(join(tmpdir(), "pij-pa-seams-")));
		const home = join(root, "home");
		const folder = join(root, "repo");
		mkdirSync(home, { recursive: true });
		mkdirSync(folder, { recursive: true });
		const registry = new FsRegistry(home);
		const write = (id: string, extra: Partial<SessionDescriptor> = {}): void => {
			registry.write({
				id,
				folder,
				dataDir: join(home, id),
				eventsPath: join(home, id, "events.ndjson"),
				pid: process.pid,
				startedAt: "2026-08-05T00:00:00.000Z",
				state: "idle",
				...extra,
			});
		};
		// A `pm`, NOT a prime. The gate keys on effectiveParent and the
		// parent's ROLE is no part of the rule — but every fixture here was
		// once a prime, so a regression requiring a prime parent would have
		// passed the whole suite while breaking the real configuration this
		// phase's live proof ran on (a PA whose parent is a `pm`).
		write("pij-parent", { parentId: null, orchestrationRole: "pm" });
		write("pij-pa", {
			parentId: "pij-parent",
			orchestrationRole: "pa",
			harness: "claude",
			harnessSessionId: "native-pa",
			paneId: "%1",
			lifecycle: "bound",
		});
		write("pij-stranger", { parentId: null });
		return {
			home,
			folder,
			// CLAUDE_CODE_SESSION_ID is what makes the BIN seam resolve this caller
			// as the PA. Without it the bin fails open and only seam 2 is exercised.
			env: { PIJ_HOME: home, PIJ_SESSION_ID: "pij-pa", CLAUDE_CODE_SESSION_ID: "native-pa" },
		};
	}

	it("lets a PA watch and unwatch its own parent THROUGH THE REAL BIN", () => {
		const { home, folder, env } = sandbox();
		try {
			const watched = pij(["watchdog", "watch", "pij-parent"], env, folder);
			expect(watched.code, `bin refused a permitted watch: ${watched.out}`).toBe(0);

			// Verified through `pij state`, not `watchdog status` — a PA is refused
			// `status` (it is not watch/unwatch), and `pij state` is the read
			// Phase 1 made carry this. That is Phase 1 earning its stated purpose:
			// the projection is the instrument this phase is verified WITH.
			const roster = pij(["state", "pij-parent", "--json"], env, folder);
			expect(roster.code).toBe(0);
			const before = JSON.parse(roster.out) as { watchdog: { watchers: string[] } };
			expect(before.watchdog.watchers).toContain("pij-pa");

			const unwatched = pij(["watchdog", "unwatch", "pij-parent"], env, folder);
			expect(unwatched.code, `bin refused a permitted unwatch: ${unwatched.out}`).toBe(0);

			const after = JSON.parse(pij(["state", "pij-parent", "--json"], env, folder).out) as {
				watchdog: { watchers: string[] };
			};
			expect(after.watchdog.watchers).not.toContain("pij-pa");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("refuses a PA watching a stranger THROUGH THE REAL BIN, naming role and field", () => {
		const { home, folder, env } = sandbox();
		try {
			const refused = pij(["watchdog", "watch", "pij-stranger"], env, folder);
			expect(refused.code).not.toBe(0);
			expect(refused.out).toContain("E-OWN");
			expect(refused.out).toContain("role 'pa'");
			expect(refused.out).toContain("orchestrationRole");
			// The refusal must be identical text at both seams — it is built in one
			// place by design, and this is the end-to-end confirmation of that.
			expect(refused.out).toContain("pij whoami --json");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("refuses a policy-changing watchdog action through the bin, even on its own parent", () => {
		const { home, folder, env } = sandbox();
		try {
			const refused = pij(["watchdog", "pause", "pij-parent"], env, folder);
			expect(refused.code).not.toBe(0);
			expect(refused.out).toContain("role 'pa'");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("still refuses a FLATLY refused verb at the bin seam — the gate is not disarmed", () => {
		// The control for the whole conditional mechanism: introducing a third
		// arm must not have turned the bin seam into a pass-through.
		const { home, folder, env } = sandbox();
		try {
			const refused = pij(["close", "pij-stranger"], env, folder);
			expect(refused.code).not.toBe(0);
			expect(refused.out).toContain("E-OWN");
			expect(refused.out).toContain("role 'pa'");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("whoami through the bin reports watchdog as CONDITIONAL, not flatly refused", () => {
		const { home, folder, env } = sandbox();
		try {
			const card = pij(["whoami", "--json"], env, folder);
			expect(card.code).toBe(0);
			const parsed = JSON.parse(card.out) as {
				orchestrationRole: string;
				capabilitySchema: number;
				verbs: Record<string, string>;
			};
			expect(parsed.orchestrationRole).toBe("pa");
			// Plan 094 task 2.6 — the two lists became one exhaustive map, and the
			// assertions came out stronger. `conditionalVerbs.toContain("watchdog")`
			// plus `refusedVerbs.not.toContain("watchdog")` were two weaker halves
			// of the single claim below; and the payload is now asserted TOTAL at
			// this seam too, so a bin build emitting a partial map is caught here
			// rather than only in-process.
			expect(parsed.capabilitySchema).toBe(2);
			expect(parsed.verbs.watchdog).toBe("conditional");
			expect(parsed.verbs.close).toBe("refuse");
			expect(Object.keys(parsed.verbs).sort()).toEqual(Object.keys(PA_VERB_CLASSIFICATION).sort());
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	// ── plan 094 Phase 1, task 1.12 (AC-02 at the BIN seam) ──────────────────
	// `chore add` is the verb that exercises the raw-argv mapping
	// `paCapabilityVerb(top, process.argv[3])`. Every other PA test reaching a
	// `chore` subverb goes through the pure predicate, so a widening that landed
	// only in the table's family row — or a bin seam that stopped consulting the
	// table per-subverb at all — would pass all of them and still refuse here.
	//
	// WHAT THIS TEST DOES AND DOES NOT PROVE (prime's ruling, 2026-08-08): on its
	// own, a positive result is also what you would see if the bin seam never
	// consulted the table. The proof that the MAPPING is live is mutation 2 —
	// flip `chore add` back to `refuse` and this test must go red beside the unit
	// test. The `close` control below proves the bin gate fires at all; it cannot
	// prove the subverb mapping, because `close` has no subverb.
	it("lets a PA `chore add` THROUGH THE REAL BIN — the raw-argv subverb mapping", () => {
		const { home, folder, env } = sandbox();
		try {
			const added = pij(
				["chore", "add", "sweep-inbox", "--probe", "true", "--scope", "seat", "--json"],
				env,
				folder,
			);
			expect(added.code, `bin refused a permitted chore add: ${added.out}`).toBe(0);
			// The write actually landed — a gate that permits into a no-op proves
			// nothing about the duty roster this widening exists to let a PA repair.
			const listed = pij(["chore", "list", "--json"], env, folder);
			expect(listed.code).toBe(0);
			expect(listed.out).toContain("sweep-inbox");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});

// ── plan 084 Phase 3, AC-07/08/09/10: the repair path THROUGH THE REAL BIN ──
// The unit tests drive `dispatch()`. This drives the actual binary, because a
// new FLAG has a parse seam the pure tests never touch — an unregistered flag
// fails at the bin with "unknown flag" long before any handler logic runs.
describe("watchdog --for and addedAt — the repair path through the real bin", () => {
	function sandbox(): { home: string; folder: string; env: Record<string, string> } {
		const root = realpathSync(mkdtempSync(join(tmpdir(), "pij-repair-")));
		const home = join(root, "home");
		const folder = join(root, "repo");
		mkdirSync(home, { recursive: true });
		mkdirSync(folder, { recursive: true });
		const registry = new FsRegistry(home);
		const write = (id: string, extra: Partial<SessionDescriptor> = {}): void => {
			registry.write({
				id,
				folder,
				dataDir: join(home, id),
				eventsPath: join(home, id, "events.ndjson"),
				pid: process.pid,
				startedAt: "2026-08-05T00:00:00.000Z",
				state: "idle",
				...extra,
			});
		};
		write("pij-boss", {
			parentId: null,
			orchestrationRole: "pm",
			harness: "claude",
			harnessSessionId: "native-boss",
			paneId: "%1",
			lifecycle: "bound",
		});
		write("pij-target", { parentId: "pij-boss" });
		// The seat bound BY the caller and never equal to it — the whole point of
		// `--for` is that watcher and caller differ.
		write("pij-absent", { parentId: "pij-boss" });
		return {
			home,
			folder,
			env: { PIJ_HOME: home, PIJ_SESSION_ID: "pij-boss", CLAUDE_CODE_SESSION_ID: "native-boss" },
		};
	}

	const watchers = (env: Record<string, string>, folder: string, id: string): string[] =>
		(
			JSON.parse(pij(["state", id, "--json"], env, folder).out) as {
				watchdog: { watchers: string[] };
			}
		).watchdog.watchers;

	it("registers the NAMED seat, re-binds without duplicating, and unwatches it again", () => {
		const { home, folder, env } = sandbox();
		try {
			const bound = pij(["watchdog", "watch", "pij-target", "--for", "pij-absent"], env, folder);
			expect(bound.code, `--for rejected at the bin: ${bound.out}`).toBe(0);
			expect(watchers(env, folder, "pij-target")).toEqual(["pij-absent"]);

			// Re-bind: one entry, not two. This is the KF-03 duplicate.
			const again = pij(["watchdog", "watch", "pij-target", "--for", "pij-absent"], env, folder);
			expect(again.code).toBe(0);
			expect(again.out).toContain("re-bound");
			expect(watchers(env, folder, "pij-target")).toEqual(["pij-absent"]);

			// And the owner's subscription is removable — the KF-03 orphan.
			const removed = pij(
				["watchdog", "unwatch", "pij-target", "--for", "pij-absent"],
				env,
				folder,
			);
			expect(removed.code).toBe(0);
			expect(watchers(env, folder, "pij-target")).toEqual([]);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("preserves addedAt across a re-bind THROUGH THE BIN, and stamps a new one", () => {
		const { home, folder, env } = sandbox();
		try {
			expect(pij(["watchdog", "watch", "pij-target"], env, folder).code).toBe(0);
			const sidecarPath = join(home, "pij-target", "watchdog.json");
			const readAddedAt = (): string => {
				const raw = JSON.parse(readFileSync(sidecarPath, "utf8")) as {
					watchers?: Array<{ watcherId: string; addedAt: string }>;
				};
				const entry = (raw.watchers ?? []).find((w) => w.watcherId === "pij-boss");
				if (!entry) throw new Error(`no watcher entry for pij-boss in ${sidecarPath}`);
				return entry.addedAt;
			};
			const original = readAddedAt();

			const rebound = pij(
				["watchdog", "watch", "pij-target", "--capture", "always", "--json"],
				env,
				folder,
			);
			expect(rebound.code).toBe(0);
			expect(JSON.parse(rebound.out).watcherRebound).toBe(true);
			expect(readAddedAt()).toBe(original);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("refuses --for to a PA through the bin, while the plain form still works", () => {
		const { home, folder, env } = sandbox();
		try {
			// Re-stamp the caller as a PA whose parent IS the target, so the Phase-2
			// target rule would ALLOW it — only the --for rule can refuse.
			const registry = new FsRegistry(home);
			const boss = registry.read("pij-boss");
			if (!boss) throw new Error("fixture missing");
			registry.write({ ...boss, orchestrationRole: "pa", parentId: "pij-target" }, "cli");

			// CONTROL: permitted without the flag.
			expect(pij(["watchdog", "watch", "pij-target"], env, folder).code).toBe(0);

			const refused = pij(["watchdog", "watch", "pij-target", "--for", "pij-absent"], env, folder);
			expect(refused.code).not.toBe(0);
			expect(refused.out).toContain("E-OWN");
			expect(refused.out).toContain("role 'pa'");
			expect(refused.out).toContain("--for");
			// The refusal did not bind anyone.
			expect(watchers(env, folder, "pij-target")).toEqual(["pij-boss"]);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});

// ── review-3 fix 3: the help a HUMAN reads must document the recovery path ──
// We documented `--for` in the one-line usage at cli.ts:332 because
// `usage-flags.test.ts` pinned it, and left the dedicated `pij watchdog --help`
// block — the canonical place a prime actually looks — silent. The flag was
// therefore documented in the string a TEST reads and not in the one a HUMAN
// reads, which is this plan's own defect wearing a patch: a prime cannot use a
// recovery path it cannot discover.
//
// This pins the HELP PATH ITSELF, not the flag list, so the failure mode
// recurs loudly rather than silently for the next flag too.
describe("pij watchdog --help documents every watcher flag it accepts", () => {
	function helpText(): string {
		const root = realpathSync(mkdtempSync(join(tmpdir(), "pij-help-")));
		const home = join(root, "home");
		mkdirSync(home, { recursive: true });
		try {
			const out = pij(["watchdog", "--help"], { PIJ_HOME: home }, root);
			expect(out.code, `watchdog --help failed: ${out.out}`).toBe(0);
			return out.out;
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}

	it("names --for on BOTH the watch and the unwatch usage lines", () => {
		const text = helpText();
		const lines = text.split("\n");
		const watchLine = lines.find((l) => l.includes("pij watchdog watch <id>"));
		const unwatchLine = lines.find((l) => l.includes("pij watchdog unwatch <id>"));
		expect(watchLine, "no `pij watchdog watch <id>` usage line in --help").toBeDefined();
		expect(unwatchLine, "no `pij watchdog unwatch <id>` usage line in --help").toBeDefined();
		expect(watchLine).toContain("--for");
		expect(unwatchLine).toContain("--for");
	});

	it("explains what --for DOES, not merely that it exists", () => {
		// A flag name in a usage line tells a prime the syntax and nothing about
		// whether it is the thing they need. The recovery path has to be findable
		// by someone who does not already know its name.
		const text = helpText().toLowerCase();
		expect(text).toContain("behalf");
		expect(text).toContain("addedat");
	});

	it("the help path is REACHABLE — guards this whole pin against being vacuous", () => {
		// If `watchdog --help` ever stopped printing the watchdog block, every
		// assertion above would still pass against whatever text came back. Pin a
		// token that only this block contains.
		expect(helpText()).toContain("pij watchdog — supervise peer progress");
	});
});
