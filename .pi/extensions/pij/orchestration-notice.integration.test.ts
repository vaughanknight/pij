import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { HarnessKind, ReceiptState, SessionDescriptor } from "./core/types.js";

const CLI = join(import.meta.dirname, "cli.ts");
const TSX = join(import.meta.dirname, "..", "..", "..", "node_modules", ".bin", "tsx");

function run(
	home: string,
	args: readonly string[],
	actor: string,
): { readonly code: number; readonly stdout: string } {
	try {
		return {
			code: 0,
			stdout: execFileSync(TSX, [CLI, ...args], {
				env: { ...process.env, PIJ_HOME: home, PIJ_QUEUE_BACKEND: "fs", PIJ_SESSION_ID: actor },
				encoding: "utf8",
				timeout: 10_000,
			}),
		};
	} catch (error) {
		const failure = error as { status?: number; stdout?: string; stderr?: string };
		return {
			code: failure.status ?? 1,
			stdout: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
		};
	}
}

function descriptor(input: {
	readonly state: "idle" | "working";
	readonly pid: number;
	readonly harness?: HarnessKind;
	readonly lastTickAt?: string;
	readonly deliveryMode?: SessionDescriptor["deliveryMode"];
	readonly lifecycle?: SessionDescriptor["lifecycle"];
}): SessionDescriptor {
	return {
		id: "pij-target",
		folder: "/repo",
		dataDir: "/tmp/pij-target",
		eventsPath: "/tmp/pij-target/events.ndjson",
		pid: input.pid,
		startedAt: "2026-07-11T09:00:00.000Z",
		state: input.state,
		...(input.harness ? { harness: input.harness } : {}),
		...(input.lastTickAt ? { lastTickAt: input.lastTickAt } : {}),
		...(input.deliveryMode ? { deliveryMode: input.deliveryMode } : {}),
		...(input.lifecycle ? { lifecycle: input.lifecycle } : {}),
	};
}

function inboxMessageCount(home: string, id: string): number {
	try {
		return readdirSync(join(home, id, "inbox")).filter(
			(name) => name.startsWith("msg-") && name.endsWith(".json"),
		).length;
	} catch {
		return 0;
	}
}

describe("CliBatonNoticeSink production classification", () => {
	it.each<{
		readonly label: string;
		readonly target?: SessionDescriptor;
		readonly expected: ReceiptState;
		readonly expectedNewMessages: number;
	}>([
		{
			label: "delivered for an idle live pi target",
			target: descriptor({ state: "idle", pid: process.pid }),
			expected: "delivered",
			expectedNewMessages: 1,
		},
		{
			label: "queued for a working live pi target",
			target: descriptor({ state: "working", pid: process.pid }),
			expected: "queued",
			expectedNewMessages: 1,
		},
		{
			label: "queued for a live control-plane target with a fresh heartbeat",
			target: descriptor({
				state: "idle",
				pid: process.pid,
				harness: "codex",
				lastTickAt: new Date(Date.now() + 60_000).toISOString(),
			}),
			expected: "queued",
			expectedNewMessages: 1,
		},
		{
			label: "unverified for a live control-plane target with a stale heartbeat",
			target: descriptor({
				state: "idle",
				pid: process.pid,
				harness: "copilot",
				lastTickAt: "2026-01-01T00:00:00.000Z",
			}),
			expected: "unverified",
			expectedNewMessages: 1,
		},
		{
			label: "unverified for a dead target",
			target: descriptor({ state: "idle", pid: 2_147_483_647 }),
			expected: "unverified",
			expectedNewMessages: 1,
		},
		{
			label: "unverified without persisting for a missing target",
			expected: "unverified",
			expectedNewMessages: 0,
		},
		{
			label: "unverified without persisting for a dissolved pull target",
			target: descriptor({
				state: "idle",
				pid: process.pid,
				harness: "copilot",
				deliveryMode: "pull",
				lifecycle: "dissolved",
			}),
			expected: "unverified",
			expectedNewMessages: 0,
		},
		{
			label: "queued with one persisted notice for a live pull target",
			target: descriptor({
				state: "idle",
				pid: process.pid,
				harness: "copilot",
				deliveryMode: "pull",
				lifecycle: "bound",
			}),
			expected: "queued",
			expectedNewMessages: 1,
		},
	])("$label", { timeout: 30_000 }, ({ target, expected, expectedNewMessages }) => {
		const home = mkdtempSync(join(tmpdir(), "pij-baton-notice-"));
		try {
			expect(
				run(
					home,
					["orchestration", "baton", "define", "git-index", "--resource", "shared git index"],
					"pij-target",
				).code,
			).toBe(0);
			if (target) writeFileSync(join(home, "pij-target.json"), JSON.stringify(target));
			const before = inboxMessageCount(home, "pij-target");

			const requested = run(
				home,
				[
					"orchestration",
					"baton",
					"request",
					"git-index",
					"--purpose",
					"stage the commit",
					"--json",
				],
				"pij-requester",
			);

			expect(requested.code).toBe(0);
			expect(JSON.parse(requested.stdout)).toMatchObject({
				receipt: { state: expected },
			});
			expect(inboxMessageCount(home, "pij-target") - before).toBe(expectedNewMessages);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});
