import { describe, expect, it } from "vitest";

import { FakeDelivery, FakeEventLog, FakeProcess, FakeRegistry } from "../adapters/fakes.js";
import type { CliDeps } from "./cli.js";
import { dispatch } from "./cli.js";
import { buildExportLines, buildSessionJoinRows } from "./session-join.js";
import type { SessionDescriptor } from "./types.js";

/** Minimal descriptor factory — only the fields the join tuple projects. */
function desc(over: Partial<SessionDescriptor>): SessionDescriptor {
	return {
		id: "pij-x",
		folder: "/repo",
		dataDir: "/Users/jo/.pij/pij-x",
		eventsPath: "/Users/jo/.pij/pij-x/events.ndjson",
		pid: 100,
		startedAt: "2026-07-04T00:00:00.000Z",
		...over,
	};
}

describe("buildSessionJoinRows (the telemetry join tuple, AC-1)", () => {
	it("projects a bound copilot peer with model + spawnedBy (no transcriptPath)", () => {
		const rows = buildSessionJoinRows([
			desc({
				id: "pij-cop",
				harness: "copilot",
				harnessSessionId: "9a8f8be6-3670-4e5c-b43e-09f46fe4dfad",
				boundModel: "gpt-5.5",
				spawnedBy: "pij-parent",
				lifecycle: "bound",
			}),
		]);
		expect(rows).toEqual([
			{
				pijId: "pij-cop",
				harness: "copilot",
				harnessSessionId: "9a8f8be6-3670-4e5c-b43e-09f46fe4dfad",
				boundModel: "gpt-5.5",
				spawnedBy: "pij-parent",
				lifecycle: "bound",
			},
		]);
		// transcriptPath must be OMITTED (never invented), not null.
		expect(Object.hasOwn(rows[0] as object, "transcriptPath")).toBe(false);
	});

	it("projects a bound codex peer with its absolute transcriptPath", () => {
		const rows = buildSessionJoinRows([
			desc({
				id: "pij-cx",
				harness: "codex",
				harnessSessionId: "11111111-2222-3333-4444-555555555555",
				transcriptPath: "/Users/jo/.codex/sessions/2026/07/04/rollout-x.jsonl",
				lifecycle: "bound",
			}),
		]);
		expect(rows[0]).toEqual({
			pijId: "pij-cx",
			harness: "codex",
			harnessSessionId: "11111111-2222-3333-4444-555555555555",
			transcriptPath: "/Users/jo/.codex/sessions/2026/07/04/rollout-x.jsonl",
			lifecycle: "bound",
		});
	});

	it("shows null harnessSessionId for a pending (unbound) peer, absent fields omitted", () => {
		const rows = buildSessionJoinRows([
			desc({ id: "pij-pend", harness: "claude", lifecycle: "pending" }),
		]);
		expect(rows[0]).toEqual({
			pijId: "pij-pend",
			harness: "claude",
			harnessSessionId: null,
			lifecycle: "pending",
		});
		const r = rows[0] as object;
		expect(Object.hasOwn(r, "transcriptPath")).toBe(false);
		expect(Object.hasOwn(r, "boundModel")).toBe(false);
		expect(Object.hasOwn(r, "spawnedBy")).toBe(false);
	});

	it("shows null harness + null harnessSessionId for a legacy peer with no harness/spawnedBy", () => {
		const rows = buildSessionJoinRows([desc({ id: "pij-legacy" })]);
		expect(rows[0]).toEqual({
			pijId: "pij-legacy",
			harness: null,
			harnessSessionId: null,
		});
	});

	it("preserves input order across multiple descriptors", () => {
		const rows = buildSessionJoinRows([
			desc({ id: "pij-a", harness: "claude", harnessSessionId: "a" }),
			desc({ id: "pij-b", harness: "codex", harnessSessionId: "b" }),
		]);
		expect(rows.map((r) => r.pijId)).toEqual(["pij-a", "pij-b"]);
	});
});

describe("buildExportLines (eval-able self-identity, AC-5)", () => {
	it("emits export PIJ_SESSION_ID alone when only the id is known", () => {
		expect(buildExportLines(desc({ id: "pij-solo" }))).toBe("export PIJ_SESSION_ID='pij-solo'");
	});

	it("adds PIJ_PARENT_ID and PIJ_ROLE when known", () => {
		const line = buildExportLines(
			desc({ id: "pij-child", spawnedBy: "pij-parent", role: "worker" }),
		);
		expect(line).toBe(
			[
				"export PIJ_SESSION_ID='pij-child'",
				"export PIJ_PARENT_ID='pij-parent'",
				"export PIJ_ROLE='worker'",
			].join("\n"),
		);
	});

	it("single-quotes and escapes embedded single quotes (eval-safe)", () => {
		const line = buildExportLines(desc({ id: "pij-'x" }));
		expect(line).toBe("export PIJ_SESSION_ID='pij-'\\''x'");
	});
});

// ─── T004: `sessions` dispatch smoke over a fake registry (wiring check) ─────

describe("dispatch('sessions') smoke", () => {
	function deps(descs: SessionDescriptor[]): CliDeps {
		return {
			registry: new FakeRegistry(descs),
			delivery: new FakeDelivery(),
			process: new FakeProcess(999, Date.parse("2026-07-04T12:00:00.000Z"), {}, [100]),
			cwd: "/repo",
			pijHome: "/home/.pij",
			eventLogFor: () => new FakeEventLog([]),
		};
	}

	const DESCS: SessionDescriptor[] = [
		desc({
			id: "pij-cop",
			harness: "copilot",
			harnessSessionId: "9a8f8be6-3670-4e5c-b43e-09f46fe4dfad",
			boundModel: "gpt-5.5",
			lifecycle: "bound",
		}),
		desc({
			id: "pij-cx",
			harness: "codex",
			harnessSessionId: "11111111-2222-3333-4444-555555555555",
			transcriptPath: "/Users/jo/.codex/sessions/2026/07/04/rollout-x.jsonl",
			lifecycle: "bound",
		}),
	];

	it("--json emits the join tuple for every descriptor", () => {
		const res = dispatch({ verb: "sessions", here: false, json: true }, deps(DESCS));
		expect(res.exitCode).toBe(0);
		const rows = JSON.parse(res.stdout) as Array<Record<string, unknown>>;
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ pijId: "pij-cop", harness: "copilot", boundModel: "gpt-5.5" });
		expect(rows[1]).toMatchObject({
			pijId: "pij-cx",
			harness: "codex",
			transcriptPath: "/Users/jo/.codex/sessions/2026/07/04/rollout-x.jsonl",
		});
	});

	it("text mode prints an aligned table naming the join keys", () => {
		const res = dispatch({ verb: "sessions", here: false, json: false }, deps(DESCS));
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("harness-session");
		expect(res.stdout).toContain("pij-cop");
		expect(res.stdout).toContain("9a8f8be6-3670-4e5c-b43e-09f46fe4dfad");
		expect(res.stdout).toContain("2 session(s)");
	});

	it("text mode carries transcriptPath — same-tuple parity with --json (AC-2)", () => {
		const res = dispatch({ verb: "sessions", here: false, json: false }, deps(DESCS));
		expect(res.exitCode).toBe(0);
		// The header advertises the column…
		expect(res.stdout).toContain("transcript");
		const codexLine = res.stdout.split("\n").find((l) => l.includes("pij-cx"));
		const copilotLine = res.stdout.split("\n").find((l) => l.includes("pij-cop"));
		// …and the codex row surfaces its absolute rollout path (fails if omitted —
		// the exact regression cross-model review found).
		expect(codexLine).toContain("/Users/jo/.codex/sessions/2026/07/04/rollout-x.jsonl");
		// A non-codex row renders the null transcriptPath as `—`, the last column.
		expect(copilotLine?.trimEnd().endsWith("—")).toBe(true);
	});

	it("empty registry prints a friendly no-sessions line", () => {
		const res = dispatch({ verb: "sessions", here: false, json: false }, deps([]));
		expect(res.stdout).toBe("no pij sessions");
	});
});
