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

import { execFileSync } from "node:child_process";
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
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FsChannel } from "./adapters/channel.js";
import { FsEventLog } from "./adapters/event-log.js";
import { FakePiRuntime } from "./adapters/fakes.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { NodeProcess } from "./adapters/process.js";
import { reattachIdentity } from "./core/binding.js";
import type { BootInput, PijPorts } from "./core/session.js";
import { PijSession } from "./core/session.js";
import type { PijMessage } from "./core/types.js";

const CLI = join(import.meta.dirname, "cli.ts");
const TSX = join(import.meta.dirname, "..", "..", "..", "node_modules", ".bin", "tsx");
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

let HOME: string;
let FOLDER: string;
let BIN: string;
let TMUX_LOG: string;

/** Run the real cli.ts bin in the sandbox. Returns stdout + exit code. */
function pij(args: string[], extraEnv: Record<string, string> = {}): { out: string; code: number } {
	const env = {
		...process.env,
		PIJ_HOME: HOME,
		PATH: `${BIN}:${process.env.PATH ?? ""}`,
		TMUX_PANE: "%1",
		CLAUDE_CODE_SESSION_ID: "",
		COPILOT_AGENT_SESSION_ID: "",
		CODEX_THREAD_ID: "",
		FAKE_TMUX_CWD: FOLDER,
		FAKE_TMUX_PID: String(process.pid),
		FAKE_TMUX_LOG: TMUX_LOG,
		...extraEnv,
	};
	try {
		const out = execFileSync(TSX, [CLI, ...args], {
			cwd: FOLDER,
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
	TMUX_LOG = join(HOME, "tmux.log");
	const tmux = join(BIN, "tmux");
	writeFileSync(
		tmux,
		`#!/bin/sh
printf '%s\n' "$*" >> "$FAKE_TMUX_LOG"
if [ "$FAKE_TMUX_FAIL" = "1" ] && { [ "$1" = "split-window" ] || [ "$1" = "new-window" ]; }; then
	exit 1
fi
case "$1" in
	display-message)
		case "$*" in
			*pane_current_path*) printf '%s\t%s\n' "$FAKE_TMUX_CWD" "$FAKE_TMUX_PID" ;;
			*pane_pid*) printf '%s\n' "$FAKE_TMUX_PID" ;;
			*session_name*) printf 'pij-test\n' ;;
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
});

describe("pij two-peer integration (real coordinators + real CLI over sandbox PIJ_HOME)", () => {
	it("top-level help advertises the prime list filter", () => {
		const result = pij(["--help"]);
		expect(result.code).toBe(0);
		expect(result.out).toContain("pij list [--here] [--prime] [--json]");
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
			'daemon (spawn auto-starts it) + self-adopt once using only the exact non-empty current-process pane: `pij adopt "$TMUX_PANE" --harness <h>`',
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
		const exactTmuxAdopt =
			'Tmux self-adopt may use only the exact non-empty `$TMUX_PANE` supplied by the current process: `pij adopt "$TMUX_PANE" --harness <h>`.';
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
			registry.write({ ...descriptor, prime: true });

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

	it("control-plane spawn reserves a memorable id before launch and publishes that exact id", () => {
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
		expect(output.id).toMatch(/^pij-[a-z]+-[a-z]+$/);
		expect(new FsRegistry(HOME).read(output.id)).toMatchObject({
			id: output.id,
			paneId: output.paneId,
			spawnedBy: "pij-A",
			lifecycle: "pending",
		});
		expect(readFileSync(TMUX_LOG, "utf8")).toContain(`PIJ_SESSION_ID=${output.id}`);
		expect(new FsRegistry(HOME).hasReservation(output.id)).toEqual({
			ok: true,
			value: false,
		});
	});

	it("known pane-launch failure releases only the reservation it owns", () => {
		writeFileSync(TMUX_LOG, "");
		const result = pij(["spawn", "--harness", "claude", "--json"], {
			PIJ_SESSION_ID: "pij-A",
			FAKE_TMUX_FAIL: "1",
		});
		expect(result.code).toBe(2);
		const log = readFileSync(TMUX_LOG, "utf8");
		const id = log.match(/PIJ_SESSION_ID=(pij-[a-z]+-[a-z]+)/)?.[1];
		expect(id).toBeDefined();
		expect(new FsRegistry(HOME).read(id as string)).toBeNull();
		expect(new FsRegistry(HOME).hasReservation(id as string)).toEqual({
			ok: true,
			value: false,
		});
	});

	it("agent spawn uses and consumes the same pre-bind memorable reservation", () => {
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
		expect(output.id).toMatch(/^pij-[a-z]+-[a-z]+$/);
		expect(output.agentPack).toBe("inline");
		expect(new FsRegistry(HOME).read(output.id)).toMatchObject({
			id: output.id,
			agentPack: "inline",
			lifecycle: "pending",
		});
		expect(new FsRegistry(HOME).hasReservation(output.id)).toEqual({
			ok: true,
			value: false,
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
		expect(output.id).toMatch(/^pij-[a-z]+-[a-z]+$/);
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
		expect(output.id).toMatch(/^pij-[a-z]+-[a-z]+$/);
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
});
