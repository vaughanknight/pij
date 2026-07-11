import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
				env: { ...process.env, PIJ_HOME: home, PIJ_SESSION_ID: actor },
				encoding: "utf8",
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
	};
}

describe("CliBatonNoticeSink production classification", () => {
	it.each<{
		readonly label: string;
		readonly target: SessionDescriptor;
		readonly expected: ReceiptState;
	}>([
		{
			label: "delivered for an idle live pi target",
			target: descriptor({ state: "idle", pid: process.pid }),
			expected: "delivered",
		},
		{
			label: "queued for a working live pi target",
			target: descriptor({ state: "working", pid: process.pid }),
			expected: "queued",
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
		},
		{
			label: "unverified for a dead target",
			target: descriptor({ state: "idle", pid: 2_147_483_647 }),
			expected: "unverified",
		},
	])("$label", ({ target, expected }) => {
		const home = mkdtempSync(join(tmpdir(), "pij-baton-notice-"));
		try {
			expect(
				run(
					home,
					["orchestration", "baton", "define", "git-index", "--resource", "shared git index"],
					"pij-target",
				).code,
			).toBe(0);
			writeFileSync(join(home, "pij-target.json"), JSON.stringify(target));

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
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});
