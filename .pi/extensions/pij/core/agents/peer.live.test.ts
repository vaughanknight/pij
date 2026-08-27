// Live ship gate for agent-pack-as-peer (Plan 029 Phase 3, T009 / AC-18) —
// gated behind PIJ_AGENT_LIVE=1. Follows the repo's live-gate pattern
// (adapters.live.test.ts): `describe.skipIf` for the real scenario + a
// self-documenting `it.skip` so `just test` shows WHY it skipped.
//
//   PIJ_AGENT_LIVE=1 npx vitest run peer.live
//
// Requires: `claude` on PATH, a live pij daemon, a built fs2 graph for this repo,
// and a RESOLVABLE pij identity for the driver (set PIJ_SESSION_ID to a registered
// session, or `pij adopt "$TMUX_PANE"` first) — otherwise `spawnedBy` is never
// stamped and the report round-trip can't complete (cli.ts resolveSelf →
// finalizeAgentSpawn). Spends API tokens; NOT part of self-check.
//
// EVIDENCE SOURCE (rev-0004 Finding 2 / AC-18): this gate runs with a
// DAEMON-DRAINED driver — the driver (`self`) is a real bound tmux session, and
// the daemon rm's each report message file the instant it injects it into the
// driver's pane (daemon.ts drainInbox; proven by daemon.test.ts). So polling the
// driver's inbox FILES for the report is a race the daemon always wins. Instead we
// assert on a DURABLE, non-drained signal: `pij agent report` stamps `reportedAt`
// on the SPAWNED PEER's own descriptor (which the daemon never drains, and — after
// Finding 1 — never clobbers). reportedAt is stamped only AFTER the report was
// delivered to the driver's inbox, so it is proof the round-trip completed.
//
// PLACEMENT NOTE: `pij agent spawn` defaults to the side stack (cli.ts
// spawnAgentPane → planPlacement) — first peer opens a ~1/3 right column, later
// peers append below (uncapped, evens itself). The old main+2 E-FULL cap now
// applies only to explicit --layout right|below; a scratch window is no longer
// required to dodge it.
//
// SCOPE NOTE (fleet-context addendum, delegation dlg-0003): the RESIDENT leg rides
// the ALREADY-RUNNING shared daemon (packet delivery + report transport are generic
// inbox mechanics the live daemon performs today). The `--once` AUTO-CLOSE leg needs
// the NEW daemon tick code (T008) which the running daemon has NOT loaded (tsx off
// source, no hot-reload) — so it is run post-restart by the orchestrator at review
// time (the daemon carries this fleet's comms; the orchestrator owns the restart).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const LIVE = process.env.PIJ_AGENT_LIVE === "1";
const PIJ_HOME = process.env.PIJ_HOME ?? join(homedir(), ".pij");
const CLI = fileURLToPath(new URL("../../cli.ts", import.meta.url));

/** Run the pij CLI bin (tsx) and return trimmed stdout; throws on non-zero. */
function pij(args: string[]): string {
	return execFileSync("npx", ["tsx", CLI, ...args], { encoding: "utf8" }).trim();
}

function readDescriptor(id: string): Record<string, unknown> | null {
	try {
		return JSON.parse(readFileSync(join(PIJ_HOME, `${id}.json`), "utf8")) as Record<
			string,
			unknown
		>;
	} catch {
		return null;
	}
}

/** Durable proof a spawned peer pushed its report: `pij agent report` stamps
 *  `reportedAt` on the peer's OWN descriptor AFTER delivering to the spawner. The
 *  daemon never drains a descriptor (only inbox message files), and Finding 1
 *  stops the tick loop clobbering it — so this survives where an inbox poll can't. */
function hasReported(id: string): boolean {
	return typeof readDescriptor(id)?.reportedAt === "string";
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Poll `check` until it returns true or the deadline passes. */
async function waitFor(check: () => boolean, timeoutMs: number, everyMs = 2000): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (check()) return true;
		await sleep(everyMs);
	}
	return check();
}

describe.skipIf(!LIVE)("agent pack as peer — live (AC-18)", async () => {
	const spawned: string[] = [];
	afterAll(() => {
		// Always tear down any test-spawned peer (never leave a stray pane).
		for (const id of spawned) {
			try {
				pij(["close", id, "--force"]);
			} catch {
				/* already gone */
			}
		}
	});

	it("resident: spawn flowspace-search → packet injected → real fs2 answer → report round-trip → follow-up", {
		timeout: 300_000,
	}, async () => {
		const self = process.env.PIJ_SESSION_ID;
		expect(self, "PIJ_SESSION_ID must be a registered session for the round-trip").toBeTruthy();
		if (!self) throw new Error("PIJ_SESSION_ID unset");

		// 1) Spawn the built-in flowspace-search pack as a RESIDENT claude peer.
		const out = pij([
			"agent",
			"spawn",
			"flowspace-search",
			"-p",
			"query=where is the daemon stall watchdog implemented?",
			"--json",
		]);
		const meta = JSON.parse(out.split("\n").at(-1) as string) as {
			id: string;
			lifecycle: string;
			agentPack: string;
		};
		spawned.push(meta.id);
		expect(meta.agentPack).toBe("flowspace-search");
		expect(meta.lifecycle).toBe("resident");

		// 2) The descriptor carries the agent fields + the packet file is on disk
		//    (the packet pointer is queued to the peer's inbox, but the daemon drains
		//    it into the peer's pane on bind, so packet.md existence is the durable
		//    proof finalizeAgentSpawn ran — not a transient inbox poll).
		const d = readDescriptor(meta.id);
		expect(d?.agentPack).toBe("flowspace-search");
		expect(d?.agentOnce).toBe(false);
		expect(existsSync(join(PIJ_HOME, meta.id, "packet.md"))).toBe(true);

		// 3) The daemon binds the peer, injects the packet, the peer runs fs2 and
		//    `pij agent report` — proven by the DURABLE reportedAt stamp on the peer's
		//    own descriptor (see EVIDENCE SOURCE note; the report message file itself
		//    is drained from OUR inbox the instant the daemon injects it).
		const got = await waitFor(() => hasReported(meta.id), 240_000);
		expect(got, "expected the peer to stamp reportedAt after pushing its report").toBe(true);

		// 4) Follow-up: a resident peer answers a `pij send`, and stays open.
		pij(["send", meta.id, "Also: where is the stall threshold constant defined?"]);
		expect(readDescriptor(meta.id), "resident peer must stay registered").not.toBeNull();
	});

	// The `--once` auto-close is driven by the daemon tick hook (T008 `planOnceClose`),
	// so this leg needs a daemon running the current source (tsx loads at start, no
	// hot-reload) — restart the daemon after touching daemon code before running it.
	it("once: spawn --once flowspace-search → reports → daemon auto-closes the pane (DAEMON-RESTART-PENDING)", {
		timeout: 300_000,
	}, async () => {
		// PIJ_SESSION_ID must resolve so the spawn stamps `spawnedBy` (the report
		// target); without it the peer's `pij agent report` E-NOREPORTTARGETs.
		expect(
			process.env.PIJ_SESSION_ID,
			"PIJ_SESSION_ID must be a registered session for the round-trip",
		).toBeTruthy();
		const out = pij([
			"agent",
			"spawn",
			"flowspace-search",
			"--once",
			"-p",
			"query=name one exported function in core/daemon.ts",
			"--json",
		]);
		const meta = JSON.parse(out.split("\n").at(-1) as string) as {
			id: string;
			lifecycle: string;
		};
		spawned.push(meta.id);
		expect(meta.lifecycle).toBe("once");
		expect(readDescriptor(meta.id)?.agentOnce).toBe(true);

		// The peer reports — proven by the DURABLE reportedAt stamp (not a drained
		// inbox file). The very next daemon tick auto-closes the peer (planOnceClose
		// requires reportedAt), so the descriptor may ALREADY be gone by the time we
		// poll — accept either a live reportedAt OR an already-removed descriptor
		// (removal itself proves the report, since close only fires post-stamp).
		const reported = await waitFor(
			() => readDescriptor(meta.id) === null || hasReported(meta.id),
			240_000,
		);
		expect(reported).toBe(true);

		// …then the daemon tick auto-closes the pane + removes the descriptor.
		const closed = await waitFor(() => readDescriptor(meta.id) === null, 30_000);
		expect(closed, "once-mode peer should be auto-closed after its report").toBe(true);
	});
});

if (!LIVE) {
	describe("agent pack as peer — live (AC-18)", () => {
		it.skip("PIJ_AGENT_LIVE=1 not set — run `PIJ_AGENT_LIVE=1 npx vitest run peer.live`", () => {});
	});
}
