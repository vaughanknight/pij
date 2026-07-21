#!/usr/bin/env tsx

import { execFileSync, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { FsChannel } from "../../../../.pi/extensions/pij/adapters/channel.js";
import { FsRegistry } from "../../../../.pi/extensions/pij/adapters/fs-registry.js";
import { FsWatchdogStore } from "../../../../.pi/extensions/pij/adapters/watchdog-store.js";
import type { DaemonPorts } from "../../../../.pi/extensions/pij/core/daemon/loop.js";
import type {
	DeliveryPort,
	EventLogPort,
	PiRuntimePort,
	ProcessPort,
	RegistryPort,
	TmuxPort,
} from "../../../../.pi/extensions/pij/core/ports.js";
import { PijSession } from "../../../../.pi/extensions/pij/core/session.js";
import {
	buildSpawnCommand,
	parseSpawnArgs,
} from "../../../../.pi/extensions/pij/core/spawn.js";
import type {
	PijEvent,
	SessionDescriptor,
} from "../../../../.pi/extensions/pij/core/types.js";
import {
	DEFAULT_CAPTURE_BYTES,
	DEFAULT_CAPTURE_LINES,
	DEFAULT_WATCHDOG_INTERVAL_MS,
	MAX_CAPTURE_BYTES,
	MAX_CAPTURE_LINES,
} from "../../../../.pi/extensions/pij/core/watchdog.js";
import { Daemon } from "../../../../.pi/extensions/pij/daemon.js";

const REPO_ROOT = resolve(join(dirname(import.meta.filename), "..", "..", "..", ".."));
const CLI_PATH = join(REPO_ROOT, ".pi", "extensions", "pij", "cli.ts");
const nodeRequire = createRequire(import.meta.url);
const TSX_CLI = nodeRequire.resolve("tsx/cli");
const LIVE_HOME = resolve(join(homedir(), ".pij"));
const HOME_PATTERN = join(tmpdir(), "pij-watchdog-proof-<scenario>-<run>");
const EPOCH = new Date(0).toISOString();
const TMUX_AVAILABLE = spawnSync("tmux", ["-V"], { encoding: "utf8" }).status === 0;

const AC_IDS = [
	"AC-01",
	"AC-02",
	"AC-03",
	"AC-04",
	"AC-05",
	"AC-06",
	"AC-07",
	"AC-08",
	"AC-10",
] as const;
type ProvedAc = (typeof AC_IDS)[number];
type Verdict = "PASS" | "SKIP" | "FAIL";

interface ScenarioResult {
	readonly name: string;
	readonly acs: readonly ProvedAc[];
	readonly verdict: Verdict;
	readonly evidence: Readonly<Record<string, unknown>>;
	readonly reason?: string;
}

interface ScenarioDefinition {
	readonly name: string;
	readonly acs: readonly ProvedAc[];
	readonly requiresTmux: boolean;
	readonly run: () => Readonly<Record<string, unknown>>;
}

interface CliRun {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}

function assertThat(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function sleepSync(ms: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function descriptor(
	home: string,
	id: string,
	overrides: Partial<SessionDescriptor> = {},
): SessionDescriptor {
	return {
		id,
		folder: REPO_ROOT,
		dataDir: join(home, id),
		eventsPath: join(home, id, "events.ndjson"),
		pid: process.pid,
		startedAt: EPOCH,
		state: "idle",
		lastEventAt: EPOCH,
		harness: "pi",
		...overrides,
	};
}

function withIsolatedHome<T>(label: string, run: (home: string) => T): T {
	const home = mkdtempSync(join(tmpdir(), `pij-watchdog-proof-${label}-`));
	assertThat(resolve(home) !== LIVE_HOME, "refusing to use the live PIJ home");
	const previousHome = process.env.PIJ_HOME;
	process.env.PIJ_HOME = home;
	try {
		return run(home);
	} finally {
		if (previousHome === undefined) delete process.env.PIJ_HOME;
		else process.env.PIJ_HOME = previousHome;
		rmSync(home, { recursive: true, force: true });
	}
}

let paneOrdinal = 0;
class ScratchPane {
	readonly session: string;
	readonly paneId: string;

	constructor(label: string, initialFile?: string) {
		this.session = `pij-wd-${label}-${process.pid}-${paneOrdinal++}`;
		const command =
			initialFile === undefined
				? "cat"
				: `cat '${initialFile.replaceAll("'", "'\\''")}'; exec cat`;
		this.paneId = execFileSync(
			"tmux",
			[
				"new-session",
				"-d",
				"-P",
				"-F",
				"#{pane_id}",
				"-s",
				this.session,
				"-x",
				"120",
				"-y",
				"80",
				command,
			],
			{ encoding: "utf8" },
		).trim();
		assertThat(/^%\d+$/u.test(this.paneId), `tmux returned invalid pane id ${this.paneId}`);
	}

	write(text: string): void {
		const buffer = `pij-wd-buffer-${process.pid}-${paneOrdinal++}`;
		execFileSync("tmux", ["load-buffer", "-b", buffer, "-"], {
			input: `${text}\n`,
			stdio: ["pipe", "ignore", "pipe"],
		});
		execFileSync("tmux", ["paste-buffer", "-d", "-b", buffer, "-t", this.paneId], {
			stdio: ["ignore", "ignore", "pipe"],
		});
	}

	capture(): string {
		return execFileSync(
			"tmux",
			["capture-pane", "-p", "-J", "-t", this.paneId, "-S", "-"],
			{ encoding: "utf8" },
		).replace(/\s+$/u, "");
	}

	dispose(): void {
		try {
			execFileSync("tmux", ["kill-session", "-t", this.session], {
				stdio: ["ignore", "ignore", "ignore"],
			});
		} catch {
			// Scratch teardown is idempotent.
		}
	}
}

function withScratchPane<T>(
	label: string,
	run: (pane: ScratchPane) => T,
	initialFile?: string,
): T {
	const pane = new ScratchPane(label, initialFile);
	try {
		return run(pane);
	} finally {
		pane.dispose();
	}
}

function daemonPorts(
	home: string,
	now: () => number,
	paneFor: (paneId: string) => ScratchPane | undefined,
	onSend: (paneId: string, text: string) => void,
): DaemonPorts {
	return {
		capturePane: (paneId) => paneFor(paneId)?.capture() ?? "",
		isPaneDead: () => false,
		sendText: (paneId, text) => {
			onSend(paneId, text);
			return "confirmed";
		},
		sendKey: () => {},
		killPane: () => {},
		listTranscripts: () => [],
		home: () => home,
		now,
		isAlive: () => true,
	};
}

function runCli(home: string, args: readonly string[], self?: string): CliRun {
	const agentHome = join(home, "agent-home");
	const result = spawnSync(process.execPath, [TSX_CLI, CLI_PATH, ...args], {
		cwd: REPO_ROOT,
		env: {
			...process.env,
			HOME: agentHome,
			USERPROFILE: agentHome,
			PIJ_HOME: home,
			PIJ_SESSION_ID: self ?? "",
			TMUX: "",
			TMUX_PANE: "",
			CLAUDE_CODE_SESSION_ID: "",
			COPILOT_AGENT_SESSION_ID: "",
			CODEX_THREAD_ID: "",
		},
		encoding: "utf8",
		timeout: 15_000,
	});
	if (result.error) throw result.error;
	return {
		code: result.status ?? 1,
		stdout: result.stdout.trim(),
		stderr: result.stderr.trim(),
	};
}

function requireCli(home: string, args: readonly string[], self?: string): CliRun {
	const result = runCli(home, args, self);
	assertThat(
		result.code === 0,
		`pij ${args.join(" ")} exited ${result.code}: ${result.stderr || result.stdout}`,
	);
	return result;
}

function parseJsonObject(text: string): Record<string, unknown> {
	const value = JSON.parse(text) as unknown;
	assertThat(value !== null && typeof value === "object" && !Array.isArray(value), "expected JSON object");
	return value as Record<string, unknown>;
}

function parseJsonRows(text: string): readonly Record<string, unknown>[] {
	const value = JSON.parse(text) as unknown;
	assertThat(Array.isArray(value), "expected JSON array");
	return value.map((row) => {
		assertThat(row !== null && typeof row === "object" && !Array.isArray(row), "expected row object");
		return row as Record<string, unknown>;
	});
}

function unreadBodies(channel: FsChannel, id: string): readonly string[] {
	const unread = channel.listUnread(id);
	if (!unread.ok) throw new Error(unread.message);
	return unread.value.map((message) => message.body);
}

function runUniversalAndTeaching(): Readonly<Record<string, unknown>> {
	return withIsolatedHome("default", (home) =>
		withScratchPane("default", (pane) => {
			const registry = new FsRegistry(home);
			const channel = new FsChannel(home);
			const store = new FsWatchdogStore(home);
			registry.write(
				descriptor(home, "tmux-default", {
					harness: "claude",
					lifecycle: "bound",
					paneId: pane.paneId,
					harnessSessionId: "scratch-default",
				}),
			);
			assertThat(store.read("tmux-default") === undefined, "default proof unexpectedly has a sidecar");
			let nowMs = DEFAULT_WATCHDOG_INTERVAL_MS;
			const sent: string[] = [];
			const daemon = new Daemon(
				home,
				daemonPorts(home, () => nowMs, (id) => (id === pane.paneId ? pane : undefined), (_id, text) => {
					sent.push(text);
					pane.write(text);
				}),
				registry,
				channel,
			);
			daemon.tick();
			daemon.dispose();
			sleepSync(25);
			const body = sent[0] ?? "";
			const paneText = pane.capture();
			const firedAt = registry.read("tmux-default")?.lastWatchdogFireAt;
			assertThat(sent.length === 1, `expected one default fire, got ${sent.length}`);
			assertThat(firedAt === new Date(nowMs).toISOString(), "default fire was not descriptor-stamped");
			assertThat(body.includes("[pij watchdog #1 for tmux-default]"), "turn ordinal/id missing");
			assertThat(body.includes("pij watchdog pause tmux-default"), "pause command missing");
			assertThat(body.includes("pij watchdog resume tmux-default"), "resume command missing");
			assertThat(body.includes("If done, pause me"), "pause etiquette missing");
			assertThat(paneText.includes("pij watchdog pause tmux-default"), "turn did not reach scratch pane");
			return {
				isolatedHome: HOME_PATTERN,
				intervalMs: DEFAULT_WATCHDOG_INTERVAL_MS,
				sidecarAbsent: true,
				fires: sent.length,
				lastWatchdogFireAt: firedAt ?? null,
				paneEvidence: "pause/resume commands and etiquette visible in scratch pane",
			};
		}),
	);
}

function runPauseResumeAndState(): Readonly<Record<string, unknown>> {
	return withIsolatedHome("pause", (home) => {
		const registry = new FsRegistry(home);
		const channel = new FsChannel(home);
		const target = descriptor(home, "pause-target");
		registry.write(target);
		let nowMs = DEFAULT_WATCHDOG_INTERVAL_MS;
		const daemon = new Daemon(
			home,
			daemonPorts(home, () => nowMs, () => undefined, () => {}),
			registry,
			channel,
		);
		daemon.tick();
		const firstCount = unreadBodies(channel, target.id).filter((body) => body.startsWith("[pij watchdog")).length;
		assertThat(firstCount === 1, "initial paneless fire missing");

		requireCli(home, ["watchdog", "pause", target.id, "--json"], target.id);
		nowMs += DEFAULT_WATCHDOG_INTERVAL_MS;
		daemon.tick();
		const pausedCount = unreadBodies(channel, target.id).filter((body) => body.startsWith("[pij watchdog")).length;
		assertThat(pausedCount === firstCount, "self pause allowed another fire");

		const pausedState = parseJsonObject(requireCli(home, ["state", target.id, "--json"], target.id).stdout);
		const pausedList = parseJsonRows(requireCli(home, ["list", "--json"], target.id).stdout);
		const pausedWatchdogList = parseJsonRows(
			requireCli(home, ["watchdog", "list", "--json"], target.id).stdout,
		);
		const pausedBlock = pausedState.watchdog as Record<string, unknown> | undefined;
		const pausedRow = pausedList.find((row) => row.id === target.id);
		const pausedWatchdogRow = pausedWatchdogList.find((row) => row.id === target.id);
		const expectedPausedProjection = {
			enabled: true,
			intervalMs: DEFAULT_WATCHDOG_INTERVAL_MS,
			pausedBy: "self",
			exempt: false,
			lastFireAt: new Date(DEFAULT_WATCHDOG_INTERVAL_MS).toISOString(),
			watchers: [],
		};
		assertThat(pausedBlock?.pausedBy === "self", "state JSON omitted self pause");
		assertThat(
			(pausedRow?.watchdog as Record<string, unknown> | undefined)?.pausedBy === "self",
			"list JSON omitted self pause",
		);
		assertThat(pausedWatchdogRow !== undefined, "watchdog list omitted paused target");
		assertThat(
			JSON.stringify(pausedWatchdogRow.watchdog) === JSON.stringify(expectedPausedProjection),
			`watchdog list paused projection mismatch: ${JSON.stringify(pausedWatchdogRow.watchdog)}`,
		);

		requireCli(home, ["watchdog", "resume", target.id, "--json"], target.id);
		daemon.tick();
		const resumedCount = unreadBodies(channel, target.id).filter((body) => body.startsWith("[pij watchdog")).length;
		assertThat(resumedCount === firstCount + 1, "resume did not restart firing");
		const resumedState = parseJsonObject(requireCli(home, ["state", target.id, "--json"], target.id).stdout);
		const resumedList = parseJsonRows(requireCli(home, ["list", "--json"], target.id).stdout);
		const resumedWatchdogList = parseJsonRows(
			requireCli(home, ["watchdog", "list", "--json"], target.id).stdout,
		);
		const resumedBlock = resumedState.watchdog as Record<string, unknown> | undefined;
		const resumedRow = resumedList.find((row) => row.id === target.id);
		const resumedWatchdogRow = resumedWatchdogList.find((row) => row.id === target.id);
		const expectedResumedProjection = {
			enabled: true,
			intervalMs: DEFAULT_WATCHDOG_INTERVAL_MS,
			pausedBy: null,
			exempt: false,
			lastFireAt: new Date(nowMs).toISOString(),
			watchers: [],
		};
		assertThat(resumedBlock?.pausedBy === null, "state JSON did not show resumed watchdog");
		assertThat(
			(resumedRow?.watchdog as Record<string, unknown> | undefined)?.pausedBy === null,
			"list JSON did not show resumed watchdog",
		);
		assertThat(resumedWatchdogRow !== undefined, "watchdog list omitted resumed target");
		assertThat(
			JSON.stringify(resumedWatchdogRow.watchdog) === JSON.stringify(expectedResumedProjection),
			`watchdog list resumed projection mismatch: ${JSON.stringify(resumedWatchdogRow.watchdog)}`,
		);
		daemon.dispose();
		return {
			isolatedHome: HOME_PATTERN,
			firstCount,
			pausedCount,
			resumedCount,
			statePausedBy: pausedBlock.pausedBy,
			listPausedBy: (pausedRow?.watchdog as Record<string, unknown>).pausedBy,
			watchdogListPausedProjection: pausedWatchdogRow.watchdog,
			watchdogListResumedProjection: resumedWatchdogRow.watchdog,
		};
	});
}

class MemoryEventLog implements EventLogPort {
	private readonly events: PijEvent[] = [];
	append(event: PijEvent): void {
		this.events.push(event);
	}
	read(): PijEvent[] {
		return [...this.events];
	}
	lastSeq(): number {
		return this.events.at(-1)?.seq ?? 0;
	}
	count(): number {
		return this.events.length;
	}
}

const UNUSED_TMUX: TmuxPort = {
	newWindow: () => ({ ok: false, code: "E-NOTMUX", message: "unused in isolated proof" }),
	splitWindow: () => ({ ok: false, code: "E-NOTMUX", message: "unused in isolated proof" }),
	killWindow: () => ({ ok: true, value: undefined }),
	killPane: () => ({ ok: true, value: undefined }),
	currentSession: () => null,
	currentPane: () => null,
	currentWindowPanes: () => [],
};

function proofSession(
	home: string,
	id: string,
	registry: RegistryPort,
	delivery: DeliveryPort,
	store: FsWatchdogStore,
	environment: Readonly<Record<string, string>>,
	now: () => number,
	pi: PiRuntimePort,
): PijSession {
	const processPort: ProcessPort = {
		pid: () => process.pid,
		isAlive: () => true,
		now,
		env: (key) => environment[key],
	};
	const session = new PijSession({
		registry,
		eventLog: new MemoryEventLog(),
		delivery,
		pi,
		process: processPort,
		tmux: UNUSED_TMUX,
		watchdog: store,
	});
	session.boot({
		id,
		folder: REPO_ROOT,
		dataDir: join(home, id),
		eventsPath: join(home, id, "events.ndjson"),
		harness: "pi",
	});
	return session;
}

function runCompactBothPaths(): Readonly<Record<string, unknown>> {
	return withIsolatedHome("compact", (home) =>
		withScratchPane("compact", (pane) => {
			const registry = new FsRegistry(home);
			const channel = new FsChannel(home);
			const store = new FsWatchdogStore(home);
			registry.write(descriptor(home, "compact-owner"));
			registry.write(
				descriptor(home, "compact-tmux", {
					harness: "claude",
					lifecycle: "bound",
					paneId: pane.paneId,
					harnessSessionId: "scratch-compact",
				}),
			);
			store.write("compact-owner", { pausedBy: "exempt", pausedAtMs: 0 });
			let nowMs = 10;
			const tmuxInjected: string[] = [];
			const daemon = new Daemon(
				home,
				daemonPorts(home, () => nowMs, (id) => (id === pane.paneId ? pane : undefined), (_id, text) => {
					tmuxInjected.push(`${store.read("compact-tmux")?.pausedBy ?? "active"}:${text}`);
					pane.write(text);
				}),
				registry,
				channel,
			);
			requireCli(
				home,
				["send", "compact-tmux", "--command", "compact", "--json"],
				"compact-owner",
			);
			daemon.tick();
			assertThat(store.read("compact-tmux")?.pausedBy === "compact", "tmux compact was not paused");
			assertThat(tmuxInjected.includes("compact:/compact"), "tmux compact was not persisted before inject");
			const tmuxBeforeWork = registry.read("compact-tmux");
			assertThat(tmuxBeforeWork !== null, "tmux target disappeared");
			registry.write({ ...tmuxBeforeWork, state: "working" });
			pane.write("REAL WORK AFTER COMPACT");
			nowMs = 11;
			daemon.tick();
			assertThat(store.read("compact-tmux")?.pausedBy === undefined, "tmux compact did not auto-resume");

			let compactCalls = 0;
			let piPersistedBeforeCompact = false;
			let piNow = 20;
			const pi = proofSession(
				home,
				"compact-pi",
				registry,
				channel,
				store,
				{},
				() => piNow,
				{
					isIdle: () => true,
					inject: () => {},
					compact: () => {
						assertThat(
							store.read("compact-pi")?.pausedBy === "compact",
							"pi compact sidecar was not persisted before runtime compact",
						);
						piPersistedBeforeCompact = true;
						compactCalls += 1;
					},
					control: () => true,
				},
			);
			requireCli(home, ["send", "compact-pi", "/compact", "--json"], "compact-owner");
			const unread = channel.listUnread("compact-pi");
			if (!unread.ok) throw new Error(unread.message);
			const compactMessage = unread.value.find((message) => message.command === "compact");
			assertThat(compactMessage !== undefined, "bare /compact was not parsed as a command");
			const inbound = pi.onInbound(compactMessage, compactMessage.messageId);
			assertThat(inbound.kind === "command-executed", "pi compact command did not execute");
			assertThat(store.read("compact-pi")?.pausedBy === "compact", "pi compact was not paused");
			assertThat(compactCalls === 1, "pi runtime compact seam was not called once");
			piNow = 21;
			pi.onTurnStart(new Date(piNow).toISOString());
			assertThat(store.read("compact-pi")?.pausedBy === undefined, "pi compact did not auto-resume");
			daemon.dispose();
			return {
				isolatedHome: HOME_PATTERN,
				tmuxCommand: "pij send compact-tmux --command compact",
				tmuxPersistBeforeInject: tmuxInjected.includes("compact:/compact"),
				tmuxResumedOnWorking: true,
				piCommand: "pij send compact-pi /compact",
				piPersistedBeforeCompact,
				piCompactCalls: compactCalls,
				piResumedOnTurnStart: true,
			};
		}),
	);
}

function frozenPaneEvidence(): Readonly<Record<string, unknown>> {
	return withIsolatedHome("frozen", (home) =>
		withScratchPane("frozen", (pane) => {
			pane.write("FROZEN PEER OUTPUT");
			const registry = new FsRegistry(home);
			const channel = new FsChannel(home);
			const store = new FsWatchdogStore(home);
			registry.write(
				descriptor(home, "frozen-peer", {
					harness: "claude",
					lifecycle: "bound",
					paneId: pane.paneId,
					harnessSessionId: "scratch-frozen",
					spawnedBy: "owner",
				}),
			);
			store.write("frozen-peer", {
				intervalMs: 100,
				watchers: [{ watcherId: "watcher", addedAt: EPOCH, capture: { mode: "anomaly" } }],
			});
			let nowMs = 100;
			const fires: string[] = [];
			const daemon = new Daemon(
				home,
				daemonPorts(home, () => nowMs, (id) => (id === pane.paneId ? pane : undefined), (_id, text) => {
					fires.push(text);
					pane.write(text);
				}),
				registry,
				channel,
			);
			for (nowMs of [100, 200, 300, 400]) daemon.tick();
			const stallNoticeCounts = (): { readonly owner: number; readonly watcher: number } => ({
				owner: unreadBodies(channel, "owner").filter((body) => body.includes("stalled")).length,
				watcher: unreadBodies(channel, "watcher").filter((body) =>
					body.startsWith("watchdog stalled:"),
				).length,
			});
			const firstEpisodeNotices = stallNoticeCounts();
			assertThat(fires.length === 4, `blind scheduling skipped a fire: ${fires.length}`);
			assertThat(registry.read("frozen-peer")?.failureReason === "stalled", "frozen peer not stamped stalled");
			assertThat(firstEpisodeNotices.owner === 1, `owner stalled notices=${firstEpisodeNotices.owner}`);
			assertThat(firstEpisodeNotices.watcher === 1, `watcher stalled notices=${firstEpisodeNotices.watcher}`);

			// A real harness briefly goes busy for the injected watchdog turn, then
			// returns idle. Drive that typed, watchdog-attributed pair explicitly;
			// the scratch `cat` process has no harness footer from which the daemon
			// could derive those states itself.
			const afterFinalFire = registry.read("frozen-peer");
			assertThat(afterFinalFire !== null, "frozen peer disappeared after final fire");
			const activityAnchor = afterFinalFire.lastEventAt;
			assertThat(activityAnchor === EPOCH, "watchdog fires moved descriptor activity");
			registry.write({ ...afterFinalFire, state: "working" });
			nowMs = 401;
			daemon.tick();
			const afterAttributedWork = registry.read("frozen-peer");
			assertThat(afterAttributedWork !== null, "frozen peer disappeared during attribution");
			const workEdgeNotices = stallNoticeCounts();
			assertThat(afterAttributedWork.failureReason === "stalled", "attributed working edge cleared stalled");
			assertThat(afterAttributedWork.lastEventAt === activityAnchor, "attributed working edge moved activity");
			assertThat(workEdgeNotices.owner === 1, `attributed working edge owner notices=${workEdgeNotices.owner}`);
			assertThat(workEdgeNotices.watcher === 1, `attributed working edge watcher notices=${workEdgeNotices.watcher}`);
			registry.write({ ...afterAttributedWork, state: "idle" });
			nowMs = 402;
			daemon.tick();
			const afterAttributedIdle = registry.read("frozen-peer");
			assertThat(afterAttributedIdle !== null, "frozen peer disappeared on attributed idle return");
			const idleEdgeNotices = stallNoticeCounts();
			assertThat(afterAttributedIdle.failureReason === "stalled", "attributed idle edge cleared stalled");
			assertThat(afterAttributedIdle.lastEventAt === activityAnchor, "attributed idle edge moved activity");
			assertThat(idleEdgeNotices.owner === 1, `attributed idle edge owner notices=${idleEdgeNotices.owner}`);
			assertThat(idleEdgeNotices.watcher === 1, `attributed idle edge watcher notices=${idleEdgeNotices.watcher}`);

			registry.write({ ...afterAttributedIdle, state: "working" });
			pane.write("REAL RECOVERY OUTPUT");
			nowMs = 403;
			daemon.tick();
			const recovered = registry.read("frozen-peer");
			assertThat(recovered !== null, "frozen peer disappeared after recovery");
			assertThat(recovered.failureReason === undefined, "typed real output did not clear stalled");
			assertThat(
				recovered.lastEventAt === new Date(nowMs).toISOString(),
				"typed real output did not move descriptor activity",
			);
			const recoveredFailureReason = recovered.failureReason ?? null;
			const recoveredLastEventAt = recovered.lastEventAt ?? null;

			for (nowMs of [503, 603, 703, 803]) daemon.tick();
			const secondEpisodeNotices = stallNoticeCounts();
			assertThat(fires.length === 8, `second silent episode skipped a fire: ${fires.length}`);
			assertThat(
				registry.read("frozen-peer")?.failureReason === "stalled",
				"second silent episode did not restamp stalled",
			);
			assertThat(
				secondEpisodeNotices.owner === 2,
				`recovered owner latch did not emit exactly once: ${secondEpisodeNotices.owner}`,
			);
			assertThat(
				secondEpisodeNotices.watcher === 2,
				`recovered watcher latch did not emit exactly once: ${secondEpisodeNotices.watcher}`,
			);
			daemon.dispose();
			return {
				fires: fires.length,
				firstEpisodeNotices,
				attributedWorking: {
					failureReason: afterAttributedWork.failureReason ?? null,
					lastEventAt: afterAttributedWork.lastEventAt ?? null,
					notices: workEdgeNotices,
				},
				attributedIdle: {
					failureReason: afterAttributedIdle.failureReason ?? null,
					lastEventAt: afterAttributedIdle.lastEventAt ?? null,
					notices: idleEdgeNotices,
				},
				recoveredFailureReason,
				lastEventAtAfterRecovery: recoveredLastEventAt,
				secondEpisodeNotices,
				secondEpisodeFailureReason: registry.read("frozen-peer")?.failureReason ?? null,
			};
		}),
	);
}

function rootStallEvidence(): Readonly<Record<string, unknown>> {
	return withIsolatedHome("root", (home) => {
		const registry = new FsRegistry(home);
		const channel = new FsChannel(home);
		new FsWatchdogStore(home).write("root", { intervalMs: 1 });
		registry.write(descriptor(home, "root"));
		let nowMs = 1;
		const daemon = new Daemon(
			home,
			daemonPorts(home, () => nowMs, () => undefined, () => {}),
			registry,
			channel,
		);
		for (nowMs of [1, 2, 3]) daemon.tick();
		const failureReason = registry.read("root")?.failureReason ?? null;
		assertThat(failureReason === "stalled", "unowned root was not stamped stalled");
		daemon.dispose();
		return { failureReason, spawnedBy: registry.read("root")?.spawnedBy ?? null };
	});
}

function runFrozenStallAndRecovery(): Readonly<Record<string, unknown>> {
	return {
		isolatedHome: HOME_PATTERN,
		frozenPane: frozenPaneEvidence(),
		rootSession: rootStallEvidence(),
	};
}

function lineCount(text: string): number {
	return text === "" ? 0 : text.split("\n").length;
}

function pointerFromNotice(body: string): string {
	const line = body.split("\n").find((value) => value.startsWith("capture: "));
	assertThat(line !== undefined, `capture pointer missing from notice: ${body}`);
	return line.slice("capture: ".length);
}

function inlineCaptureFromNotice(body: string): readonly string[] {
	const lines = body.split("\n");
	const pointerIndex = lines.findIndex((line) => line.startsWith("capture: "));
	assertThat(pointerIndex >= 0, `capture pointer missing from notice: ${body}`);
	return lines.slice(pointerIndex + 1);
}

/** Independent expected-value implementation for the end-to-end proof. */
function expectedCaptureTail(source: string, maxLines: number, maxBytes: number): string {
	const lineTail = source.split("\n").slice(-maxLines).join("\n");
	const bytes = Buffer.from(lineTail, "utf8");
	if (bytes.byteLength <= maxBytes) return lineTail;
	let start = bytes.byteLength - maxBytes;
	while (start < bytes.byteLength && (bytes[start] ?? 0) >> 6 === 2) start += 1;
	return bytes.subarray(start).toString("utf8");
}

function assertCaptureContent(
	label: string,
	captured: string,
	source: string,
	inlineLines: readonly string[],
	maxLines: number,
	maxBytes: number,
	orderedMarkers: readonly string[],
): void {
	const expected = expectedCaptureTail(source, maxLines, maxBytes);
	const lineTail = source.split("\n").slice(-maxLines).join("\n");
	const tailBytes = Buffer.from(lineTail, "utf8");
	const naiveStart = tailBytes.byteLength - maxBytes;
	assertThat(!lineTail.includes("\uFFFD"), `${label} source tail was not valid UTF-8 pane text`);
	assertThat(!expected.includes("\uFFFD"), `${label} expected tail split a UTF-8 code point`);
	assertThat(captured.length > 0, `${label} capture was empty`);
	assertThat(tailBytes.byteLength > maxBytes, `${label} did not exercise byte truncation`);
	assertThat(
		((tailBytes[naiveStart] ?? 0) >> 6) === 2,
		`${label} byte limit did not bisect a multibyte fixture code point`,
	);
	assertThat(captured === expected, `${label} was not the exact bounded pane tail`);
	assertThat(lineCount(captured) <= maxLines, `${label} line cap exceeded`);
	assertThat(Buffer.byteLength(captured, "utf8") <= maxBytes, `${label} byte cap exceeded`);
	assertThat(!captured.includes("\uFFFD"), `${label} split a UTF-8 code point`);
	assertThat(
		Buffer.from(captured, "utf8").toString("utf8") === captured,
		`${label} did not round-trip as UTF-8`,
	);
	let previousMarker = -1;
	for (const marker of orderedMarkers) {
		const markerIndex = captured.indexOf(marker);
		assertThat(markerIndex >= 0, `${label} omitted deterministic tail marker ${marker}`);
		assertThat(markerIndex > previousMarker, `${label} reordered deterministic tail marker ${marker}`);
		previousMarker = markerIndex;
	}
	const expectedInline = captured.split("\n").slice(0, 5);
	assertThat(inlineLines.length <= 5, `${label} inline head exceeded five lines`);
	assertThat(
		JSON.stringify(inlineLines) === JSON.stringify(expectedInline),
		`${label} inline head did not equal the stored slice head`,
	);
}

function runBoundedCapture(): Readonly<Record<string, unknown>> {
	return withIsolatedHome("capture", (home) => {
		const fixtureLines = Array.from({ length: 260 }, (_, index) => {
			const ordinal = String(index).padStart(3, "0");
			return `WD-CAP-${ordinal}|xxx${"€".repeat(48)}|TAIL-${ordinal}`;
		});
		const fixturePath = join(home, "capture-fixture.txt");
		writeFileSync(fixturePath, fixtureLines.join("\n"), "utf8");
		return withScratchPane("capture", (pane) => {
			const orderedTailMarkers = ["WD-CAP-258", "WD-CAP-259"];
			sleepSync(25);
			const healthySource = pane.capture();
			assertThat(
				orderedTailMarkers.every((marker) => healthySource.includes(marker)),
				"scratch pane omitted deterministic capture markers",
			);
			const registry = new FsRegistry(home);
			const channel = new FsChannel(home);
			const store = new FsWatchdogStore(home);
			registry.write(
				descriptor(home, "capture-peer", {
					harness: "claude",
					lifecycle: "bound",
					paneId: pane.paneId,
					harnessSessionId: "scratch-capture",
				}),
			);
			store.write("capture-peer", {
				intervalMs: 100,
				watchers: [
					{ watcherId: "anomaly-watcher", addedAt: EPOCH },
					{
						watcherId: "always-watcher",
						addedAt: EPOCH,
						capture: { mode: "always", maxLines: 999, maxBytes: 999_999 },
					},
				],
			});
			let nowMs = 100;
			const daemon = new Daemon(
				home,
				daemonPorts(home, () => nowMs, (id) => (id === pane.paneId ? pane : undefined), (_id, text) => pane.write(`${text}.`)),
				registry,
				channel,
			);
			daemon.tick();
			assertThat(unreadBodies(channel, "anomaly-watcher").length === 0, "anomaly watcher captured healthy fire");
			const alwaysFirst = unreadBodies(channel, "always-watcher")[0];
			assertThat(alwaysFirst !== undefined && alwaysFirst.startsWith("watchdog responsive:"), "always mode missed healthy fire");
			const alwaysPath = pointerFromNotice(alwaysFirst);
			assertThat(
				alwaysPath.startsWith(join(home, "always-watcher", "watchdog-captures")),
				"always pointer escaped watcher capture directory",
			);
			assertThat(existsSync(alwaysPath), "always capture pointer file missing");
			const alwaysCapture = readFileSync(alwaysPath, "utf8");
			const alwaysInline = inlineCaptureFromNotice(alwaysFirst);
			assertCaptureContent(
				"healthy always-mode",
				alwaysCapture,
				healthySource,
				alwaysInline,
				MAX_CAPTURE_LINES,
				MAX_CAPTURE_BYTES,
				orderedTailMarkers,
			);

			sleepSync(25);
			const anomalySource = pane.capture();
			assertThat(
				orderedTailMarkers.every((marker) => anomalySource.includes(marker)),
				"watchdog turn displaced deterministic anomaly markers",
			);
			nowMs = 200;
			daemon.tick();
			const anomalyNotice = unreadBodies(channel, "anomaly-watcher")[0];
			assertThat(anomalyNotice !== undefined && anomalyNotice.startsWith("watchdog suspect:"), "anomaly capture missing");
			const anomalyPath = pointerFromNotice(anomalyNotice);
			const anomalyCapture = readFileSync(anomalyPath, "utf8");
			const anomalyInline = inlineCaptureFromNotice(anomalyNotice);
			assertThat(anomalyPath.startsWith(join(home, "anomaly-watcher", "watchdog-captures")), "pointer escaped watcher capture directory");
			assertThat(existsSync(anomalyPath), "capture pointer file missing");
			assertCaptureContent(
				"default anomaly",
				anomalyCapture,
				anomalySource,
				anomalyInline,
				DEFAULT_CAPTURE_LINES,
				DEFAULT_CAPTURE_BYTES,
				orderedTailMarkers,
			);
			daemon.dispose();
			return {
				isolatedHome: HOME_PATTERN,
				anomalyHealthyNotices: 0,
				anomalyPointer: anomalyPath.replace(home, "<PIJ_HOME>"),
				anomalyLines: lineCount(anomalyCapture),
				anomalyBytes: Buffer.byteLength(anomalyCapture, "utf8"),
				anomalyInlineHead: anomalyInline,
				defaultCaps: { lines: DEFAULT_CAPTURE_LINES, bytes: DEFAULT_CAPTURE_BYTES },
				alwaysHealthyNotice: true,
				alwaysPointer: alwaysPath.replace(home, "<PIJ_HOME>"),
				hardCapLines: lineCount(alwaysCapture),
				hardCapBytes: Buffer.byteLength(alwaysCapture, "utf8"),
				alwaysInlineHead: alwaysInline,
				tailMarkersInOrder: orderedTailMarkers,
				utf8RoundTrip: true,
				hardCeilings: { lines: MAX_CAPTURE_LINES, bytes: MAX_CAPTURE_BYTES },
			};
		}, fixturePath);
	});
}

function runSpawnExemption(): Readonly<Record<string, unknown>> {
	return withIsolatedHome("exempt", (home) => {
		const parsed = parseSpawnArgs(["--harness", "pi", "--no-watchdog"]);
		assertThat(parsed.ok && parsed.value.noWatchdog === true, "spawn flag did not parse");
		const command = buildSpawnCommand({
			spawnId: "proof-spawn",
			announceTo: "",
			cwd: REPO_ROOT,
			role: "worker",
			noWatchdog: true,
		});
		assertThat(command.env.PIJ_NO_WATCHDOG === "1", "spawn flag did not reach child environment");
		const registry = new FsRegistry(home);
		const channel = new FsChannel(home);
		const store = new FsWatchdogStore(home);
		let nowMs = 50;
		proofSession(
			home,
			"exempt-child",
			registry,
			channel,
			store,
			command.env,
			() => nowMs,
			{ isIdle: () => true, inject: () => {}, compact: () => {}, control: () => true },
		);
		assertThat(store.read("exempt-child")?.pausedBy === "exempt", "child boot did not persist exemption");
		nowMs = DEFAULT_WATCHDOG_INTERVAL_MS * 3;
		const daemon = new Daemon(
			home,
			daemonPorts(home, () => nowMs, () => undefined, () => {}),
			registry,
			channel,
		);
		daemon.tick();
		const watchdogTurns = unreadBodies(channel, "exempt-child").filter((body) =>
			body.startsWith("[pij watchdog"),
		);
		assertThat(watchdogTurns.length === 0, "exempt child received a watchdog fire");
		assertThat(registry.read("exempt-child")?.failureReason === undefined, "exempt child was derived stalled");
		const state = parseJsonObject(requireCli(home, ["state", "exempt-child", "--json"], "exempt-child").stdout);
		const rows = parseJsonRows(requireCli(home, ["list", "--json"], "exempt-child").stdout);
		const stateWatchdog = state.watchdog as Record<string, unknown> | undefined;
		const listWatchdog = rows.find((row) => row.id === "exempt-child")?.watchdog as
			| Record<string, unknown>
			| undefined;
		assertThat(stateWatchdog?.exempt === true && stateWatchdog.pausedBy === "exempt", "state omitted exemption");
		assertThat(listWatchdog?.exempt === true && listWatchdog.pausedBy === "exempt", "list omitted exemption");
		daemon.dispose();
		return {
			isolatedHome: HOME_PATTERN,
			spawnFlagParsed: true,
			childEnvironmentMarker: command.env.PIJ_NO_WATCHDOG,
			pausedBy: store.read("exempt-child")?.pausedBy ?? null,
			watchdogTurns: watchdogTurns.length,
			failureReason: registry.read("exempt-child")?.failureReason ?? null,
			stateVisible: stateWatchdog,
			listVisible: listWatchdog,
		};
	});
}

function runDeliverySplit(): Readonly<Record<string, unknown>> {
	return withIsolatedHome("delivery", (home) =>
		withScratchPane("delivery", (pane) => {
			const registry = new FsRegistry(home);
			const channel = new FsChannel(home);
			const store = new FsWatchdogStore(home);
			registry.write(
				descriptor(home, "tmux-peer", {
					harness: "claude",
					lifecycle: "bound",
					paneId: pane.paneId,
					harnessSessionId: "scratch-delivery",
				}),
			);
			registry.write(descriptor(home, "pi-peer"));
			registry.write(
				descriptor(home, "prebind-peer", {
					harness: "claude",
					lifecycle: "ready",
					paneId: pane.paneId,
				}),
			);
			store.write("tmux-peer", { intervalMs: 1 });
			store.write("pi-peer", {
				intervalMs: 1,
				watchers: [{ watcherId: "split-watcher", addedAt: EPOCH, capture: { mode: "anomaly" } }],
			});
			store.write("prebind-peer", { intervalMs: 1 });
			let nowMs = 1;
			const tmuxTurns: string[] = [];
			const daemon = new Daemon(
				home,
				daemonPorts(home, () => nowMs, (id) => (id === pane.paneId ? pane : undefined), (_id, text) => {
					tmuxTurns.push(text);
					pane.write(text);
				}),
				registry,
				channel,
			);
			daemon.tick();
			const queuedTmuxTurns = unreadBodies(channel, "tmux-peer").filter((body) =>
				body.startsWith("[pij watchdog"),
			);
			const firstPiTurns = unreadBodies(channel, "pi-peer").filter((body) =>
				body.startsWith("[pij watchdog"),
			);
			assertThat(tmuxTurns.length === 0, "tmux watchdog bypassed the durable channel");
			assertThat(queuedTmuxTurns.length === 1, "tmux watchdog turn was not queued");
			assertThat(firstPiTurns.length === 1, "pi peer did not receive durable inbox turn");
			assertThat(firstPiTurns[0]?.includes("Pane capture unavailable"), "pi turn faked pane availability");
			assertThat(unreadBodies(channel, "prebind-peer").length === 0, "pre-bind peer received inbox turn");
			daemon.tick();
			assertThat(tmuxTurns.length === 1, `tmux queued delivery count=${tmuxTurns.length}`);

			for (nowMs of [2, 3]) daemon.tick();
			const splitNotice = unreadBodies(channel, "split-watcher").find((body) =>
				body.startsWith("watchdog stalled:"),
			);
			assertThat(registry.read("pi-peer")?.failureReason === "stalled", "paneless event-only peer did not stall");
			assertThat(splitNotice?.includes("capture unavailable (paneless target)"), "paneless watcher notice faked a capture");
			assertThat(
				!existsSync(join(home, "split-watcher", "watchdog-captures")),
				"paneless watcher unexpectedly wrote a capture file",
			);
			assertThat(registry.read("prebind-peer")?.lastWatchdogFireAt === undefined, "pre-bind peer was fired");
			daemon.dispose();
			return {
				isolatedHome: HOME_PATTERN,
				tmuxSendTextTurns: tmuxTurns.length,
				piInboxTurns: unreadBodies(channel, "pi-peer").filter((body) => body.startsWith("[pij watchdog")).length,
				piEventOnlyFailureReason: registry.read("pi-peer")?.failureReason ?? null,
				panelessNotice: splitNotice ?? null,
				panelessCaptureDirectoryExists: false,
				prebindLastFireAt: registry.read("prebind-peer")?.lastWatchdogFireAt ?? null,
			};
		}),
	);
}

function runSmokeComposite(): Readonly<Record<string, unknown>> {
	return withIsolatedHome("smoke", (home) =>
		withScratchPane("smoke", (pane) => {
			const registry = new FsRegistry(home);
			const channel = new FsChannel(home);
			const store = new FsWatchdogStore(home);
			registry.write(descriptor(home, "smoke-owner"));
			registry.write(
				descriptor(home, "smoke-peer", {
					harness: "claude",
					lifecycle: "bound",
					paneId: pane.paneId,
					harnessSessionId: "scratch-smoke",
				}),
			);
			store.write("smoke-owner", { pausedBy: "exempt", pausedAtMs: 0 });
			store.write("smoke-peer", {
				intervalMs: 100,
				watchers: [{ watcherId: "smoke-owner", addedAt: EPOCH, capture: { mode: "always" } }],
			});
			let nowMs = 100;
			const turns: string[] = [];
			const daemon = new Daemon(
				home,
				daemonPorts(home, () => nowMs, (id) => (id === pane.paneId ? pane : undefined), (_id, text) => {
					turns.push(text);
					pane.write(text);
				}),
				registry,
				channel,
			);
			daemon.tick();
			assertThat(turns.length === 0, "smoke watchdog bypassed the durable channel");
			assertThat(
				unreadBodies(channel, "smoke-peer").some((body) => body.startsWith("[pij watchdog #1")),
				"smoke first fire was not queued",
			);
			daemon.tick();
			assertThat(turns.length === 1, "smoke queued first fire missing");
			requireCli(home, ["watchdog", "pause", "smoke-peer", "--json"], "smoke-owner");
			nowMs = 200;
			daemon.tick();
			assertThat(turns.length === 1, "smoke pause failed");
			requireCli(home, ["watchdog", "resume", "smoke-peer", "--json"], "smoke-owner");
			daemon.tick();
			assertThat(turns.length === 1, "smoke resumed fire bypassed the durable channel");
			daemon.tick();
			assertThat(turns.length === 2, "smoke queued resume missing");

			// Complete the resumed watchdog turn's attributed working→idle pair
			// before compact; the scratch `cat` pane has no harness footer that can
			// derive these lifecycle edges automatically.
			const afterResume = registry.read("smoke-peer");
			assertThat(afterResume !== null, "smoke peer disappeared after resume");
			registry.write({ ...afterResume, state: "working" });
			nowMs = 201;
			daemon.tick();
			const afterAttributedWork = registry.read("smoke-peer");
			assertThat(afterAttributedWork !== null, "smoke peer disappeared during attribution");
			registry.write({ ...afterAttributedWork, state: "idle" });
			nowMs = 202;
			daemon.tick();

			requireCli(home, ["send", "smoke-peer", "--command", "compact", "--json"], "smoke-owner");
			nowMs = 203;
			daemon.tick();
			assertThat(store.read("smoke-peer")?.pausedBy === "compact", "smoke compact pause failed");
			const target = registry.read("smoke-peer");
			assertThat(target !== null, "smoke peer disappeared");
			registry.write({ ...target, state: "working" });
			pane.write("SMOKE REAL WORK");
			nowMs = 204;
			daemon.tick();
			assertThat(store.read("smoke-peer")?.pausedBy === undefined, "smoke compact resume failed");
			const notice = unreadBodies(channel, "smoke-owner").find((body) => body.includes("capture: "));
			assertThat(notice !== undefined, "smoke capture notice missing");
			const pointer = pointerFromNotice(notice);
			assertThat(existsSync(pointer), "smoke capture pointer missing");
			daemon.dispose();
			return {
				isolatedHome: HOME_PATTERN,
				spawnedScratchPane: true,
				firstFire: true,
				pauseSuppressedFire: true,
				resumeFired: true,
				compactPausedBeforeInjection: true,
				compactResumedOnWorking: true,
				capturePointer: pointer.replace(home, "<PIJ_HOME>"),
			};
		}),
	);
}

const SCENARIOS: readonly ScenarioDefinition[] = [
	{
		name: "AC-01/02 default-on tmux fire and self-teaching turn",
		acs: ["AC-01", "AC-02"],
		requiresTmux: true,
		run: runUniversalAndTeaching,
	},
	{
		name: "AC-03 pause/resume CLI and JSON surfaces",
		acs: ["AC-03"],
		requiresTmux: false,
		run: runPauseResumeAndState,
	},
	{
		name: "AC-04 compact auto-pause on tmux and pi paths",
		acs: ["AC-04"],
		requiresTmux: true,
		run: runCompactBothPaths,
	},
	{
		name: "AC-05/06 blind frozen-pane fire, shared latch, recovery, and root stamp",
		acs: ["AC-05", "AC-06"],
		requiresTmux: true,
		run: runFrozenStallAndRecovery,
	},
	{
		name: "AC-07 anomaly/always capture pointers and caps",
		acs: ["AC-07"],
		requiresTmux: true,
		run: runBoundedCapture,
	},
	{
		name: "AC-08 spawn --no-watchdog exemption and visibility",
		acs: ["AC-08"],
		requiresTmux: false,
		run: runSpawnExemption,
	},
	{
		name: "AC-10 tmux/inbox delivery split, paneless degradation, and pre-bind skip",
		acs: ["AC-10"],
		requiresTmux: true,
		run: runDeliverySplit,
	},
];

function executeScenario(definition: ScenarioDefinition): ScenarioResult {
	if (definition.requiresTmux && !TMUX_AVAILABLE) {
		return {
			name: definition.name,
			acs: definition.acs,
			verdict: "SKIP",
			evidence: { isolatedHome: HOME_PATTERN, tmuxAvailable: false },
			reason: "tmux is unavailable; pane-backed proof cannot run",
		};
	}
	try {
		return {
			name: definition.name,
			acs: definition.acs,
			verdict: "PASS",
			evidence: definition.run(),
		};
	} catch (error) {
		return {
			name: definition.name,
			acs: definition.acs,
			verdict: "FAIL",
			evidence: { isolatedHome: HOME_PATTERN },
			reason: error instanceof Error ? error.message : String(error),
		};
	}
}

function main(): void {
	if (process.argv.includes("--list")) {
		for (const scenario of SCENARIOS) {
			process.stdout.write(`${scenario.acs.join(",")} ${scenario.name}\n`);
		}
		process.stdout.write("SMOKE spawn → fire → pause → resume → compact-pause → capture\n");
		return;
	}

	if (process.argv.includes("--smoke")) {
		if (!TMUX_AVAILABLE) {
			process.stdout.write(
				`${JSON.stringify({ name: "watchdog smoke", verdict: "SKIP", reason: "tmux unavailable" })}\n`,
			);
			return;
		}
		const smoke = executeScenario({
			name: "watchdog smoke",
			acs: [],
			requiresTmux: true,
			run: runSmokeComposite,
		});
		process.stdout.write(`${JSON.stringify(smoke, null, 2)}\n`);
		if (smoke.verdict === "FAIL") process.exitCode = 1;
		return;
	}

	const results: ScenarioResult[] = [];
	for (const scenario of SCENARIOS) {
		const result = executeScenario(scenario);
		results.push(result);
		if (result.verdict === "FAIL") break;
	}
	const acceptance = AC_IDS.map((ac) => {
		const result = results.find((candidate) => candidate.acs.includes(ac));
		return result
			? { ac, verdict: result.verdict, scenario: result.name, reason: result.reason }
			: { ac, verdict: "SKIP" as const, scenario: null, reason: "not run after earlier failure" };
	});
	const anyFail = acceptance.some((row) => row.verdict === "FAIL");
	const anySkip = acceptance.some((row) => row.verdict === "SKIP");
	const ac09Verdict: Verdict = anyFail ? "FAIL" : anySkip ? "SKIP" : "PASS";
	const output = {
		environment: {
			isolatedHome: HOME_PATTERN,
			realHome: `${LIVE_HOME} (rejected by runner)`,
			tmuxAvailable: TMUX_AVAILABLE,
			eventsNdjsonUsedAsActivityEvidence: false,
		},
		scenarios: results,
		acceptance: [
			...acceptance,
			{
				ac: "AC-09",
				verdict: ac09Verdict,
				scenario: "aggregate isolated proof",
				reason:
					ac09Verdict === "PASS"
						? "AC-01..08 and AC-10 all passed in disposable homes"
						: "the complete acceptance set did not pass",
			},
		],
		summary: {
			verdict: ac09Verdict,
			passed: acceptance.filter((row) => row.verdict === "PASS").length,
			skipped: acceptance.filter((row) => row.verdict === "SKIP").length,
			failed: acceptance.filter((row) => row.verdict === "FAIL").length,
		},
	};
	process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
	if (anyFail) process.exitCode = 1;
}

main();
