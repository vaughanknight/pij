import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep, win32 } from "node:path";
import { describe, expect, it } from "vitest";

import type { SessionDescriptor } from "../types.js";
import { IndexState } from "./index-state.js";

function desc(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: "/repo",
		dataDir: `/home/.pij/${over.id}`,
		eventsPath: `/home/.pij/${over.id}/events.ndjson`,
		pid: 100,
		startedAt: "2026-06-27T00:00:00.000Z",
		...over,
	};
}

const SNAPSHOT: SessionDescriptor[] = [
	desc({ id: "pi-a", harness: "pi" }),
	desc({
		id: "claude-b",
		harness: "claude",
		harnessSessionId: "sess-b",
		paneId: "%2",
		lifecycle: "bound",
		initInjectedAt: "2026-06-27T00:00:05.000Z",
	}),
	desc({ id: "claude-c", harness: "claude", paneId: "%3", lifecycle: "pending" }),
];

interface PathSemantics {
	relative(from: string, to: string): string;
	readonly sep: string;
}

const HOST_PATH: PathSemantics = { relative, sep };
const SHARED_RESOLVER_LINE =
	"(descriptor) => descriptor.paneId === paneId && isPaneDeliveryTarget(descriptor),";
const PENDING_OCCUPANT_LINE = "descriptor.paneId === pane &&";
const PENDING_OCCUPANT_LIFECYCLE_LINE =
	'(descriptor.lifecycle === "pending" || descriptor.lifecycle === "ready"),';

function stripComments(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
		.replace(/\/\/.*$/gm, "");
}

function isPaneResolutionComparison(line: string): boolean {
	if (/\bundefined\s*===|===\s*undefined\b/.test(line)) return false;
	return (
		/\b[\w$.[\]]+\.paneId\s*===/.test(line) ||
		/===\s*[\w$.[\]]+\.paneId\b/.test(line) ||
		/\(\s*\{\s*paneId(?:\s*:\s*[\w$]+)?\s*\}\s*\)\s*=>.*\bpaneId\s*===/.test(line)
	);
}

function paneResolutionViolations(
	root: string,
	file: string,
	source: string,
	pathSemantics: PathSemantics = HOST_PATH,
): string[] {
	const lines = stripComments(source).split("\n");
	const violations: string[] = [];
	const relativePath = pathSemantics.relative(root, file).split(pathSemantics.sep).join("/");
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? "";
		if (!isPaneResolutionComparison(line)) continue;
		const trimmed = line.trim();
		const sharedResolver = relativePath === "core/discovery.ts" && trimmed === SHARED_RESOLVER_LINE;
		const pendingOccupant =
			relativePath === "core/current-session.ts" &&
			trimmed === PENDING_OCCUPANT_LINE &&
			(lines[index + 1] ?? "").trim() === PENDING_OCCUPANT_LIFECYCLE_LINE;
		if (!sharedResolver && !pendingOccupant) {
			violations.push(`${relativePath}:${index + 1}: ${trimmed}`);
		}
	}
	return violations;
}

describe("IndexState", () => {
	it("indexes by id, harness session, and pane", () => {
		const ix = IndexState.from(SNAPSHOT);
		expect(ix.get("claude-b")?.harnessSessionId).toBe("sess-b");
		expect(ix.resolveHarnessSession("sess-b")).toBe("claude-b");
		expect(ix.resolvePane("%2")).toEqual({ ok: true, value: "claude-b" });
		expect(ix.resolvePane("%3")).toEqual({ ok: true, value: "claude-c" });
		expect(ix.all()).toHaveLength(3);
	});

	it("indexes exact harness-native tuples without cross-harness collisions", () => {
		const ix = IndexState.from([
			desc({ id: "claude-x", harness: "claude", harnessSessionId: "shared" }),
			desc({ id: "copilot-x", harness: "copilot", harnessSessionId: "shared" }),
		]);
		expect(ix.resolveHarnessIdentity("claude", "shared")).toEqual({
			ok: true,
			value: "claude-x",
		});
		expect(ix.resolveHarnessIdentity("copilot", "shared")).toEqual({
			ok: true,
			value: "copilot-x",
		});
	});

	it("fails loudly when one exact tuple maps to multiple pij ids", () => {
		const ix = IndexState.from([
			desc({ id: "claude-a", harness: "claude", harnessSessionId: "duplicate" }),
			desc({ id: "claude-b", harness: "claude", harnessSessionId: "duplicate" }),
		]);
		expect(ix.resolveHarnessIdentity("claude", "duplicate")).toMatchObject({
			ok: false,
			code: "E-AMBIG",
		});
	});

	it("lists only pending sessions for the daemon to drive", () => {
		const ix = IndexState.from(SNAPSHOT);
		expect(ix.pending().map((d) => d.id)).toEqual(["claude-c"]);
	});

	it("needsInit reflects the persisted marker (AC-02/12): injected=false, fresh=true", () => {
		const ix = IndexState.from(SNAPSHOT);
		expect(ix.needsInit("claude-b")).toBe(false); // initInjectedAt set
		expect(ix.needsInit("claude-c")).toBe(true); // no marker yet
		expect(ix.needsInit("ghost")).toBe(false); // unknown → nothing to inject
	});

	it("rebuild replaces the whole index from a new snapshot (restart with no lost bindings)", () => {
		const ix = IndexState.from(SNAPSHOT);
		// Simulate a restart reading the same files plus a newly-bound c.
		ix.rebuild([
			SNAPSHOT[0] as SessionDescriptor,
			SNAPSHOT[1] as SessionDescriptor,
			desc({
				id: "claude-c",
				harness: "claude",
				harnessSessionId: "sess-c",
				paneId: "%3",
				lifecycle: "bound",
				initInjectedAt: "2026-06-27T00:01:00.000Z",
			}),
		]);
		expect(ix.resolveHarnessSession("sess-c")).toBe("claude-c");
		expect(ix.pending()).toHaveLength(0); // c is now bound
		expect(ix.needsInit("claude-c")).toBe(false); // marker survived the restart → no re-inject
	});

	it("stale pane mapping is dropped on rebuild (a closed pane no longer resolves)", () => {
		const ix = IndexState.from(SNAPSHOT);
		ix.rebuild([desc({ id: "pi-a", harness: "pi" })]);
		expect(ix.resolvePane("%2")).toEqual({ ok: true, value: undefined });
		expect(ix.resolveHarnessSession("sess-b")).toBeUndefined();
	});

	it("resolves bound and pending panes but never dissolved or failed panes", () => {
		const ix = IndexState.from([
			desc({ id: "bound", paneId: "%1", lifecycle: "bound" }),
			desc({ id: "dissolved", paneId: "%2", lifecycle: "dissolved" }),
			desc({ id: "failed", paneId: "%3", lifecycle: "failed" }),
			desc({ id: "pending", paneId: "%4", lifecycle: "pending" }),
		]);

		expect(ix.resolvePane("%1")).toEqual({ ok: true, value: "bound" });
		expect(ix.resolvePane("%2")).toEqual({ ok: true, value: undefined });
		expect(ix.resolvePane("%3")).toEqual({ ok: true, value: undefined });
		expect(ix.resolvePane("%4")).toEqual({ ok: true, value: "pending" });
		expect(ix.get("dissolved")?.lifecycle).toBe("dissolved");
		expect(ix.get("failed")?.lifecycle).toBe("failed");
	});

	it("a terminal descriptor cannot overwrite the fresh seat that reused its pane", () => {
		const ix = IndexState.from([
			desc({ id: "fresh-bound", paneId: "%1", lifecycle: "bound" }),
			desc({ id: "closed-old", paneId: "%1", lifecycle: "dissolved" }),
		]);

		expect(ix.resolvePane("%1")).toEqual({ ok: true, value: "fresh-bound" });
		expect(ix.get("closed-old")?.lifecycle).toBe("dissolved");
	});

	it("reports E-AMBIG when multiple live delivery targets claim one pane", () => {
		const ix = IndexState.from([
			desc({ id: "live-a", paneId: "%1", lifecycle: "bound" }),
			desc({ id: "live-b", paneId: "%1", lifecycle: "pending" }),
		]);

		expect(ix.resolvePane("%1")).toMatchObject({ ok: false, code: "E-AMBIG" });
	});

	it("keeps the shared discovery resolver allowlisted with Windows path separators", () => {
		const root = win32.join("C:\\", "repo", ".pi", "extensions", "pij");
		const file = win32.join(root, "core", "discovery.ts");
		const source =
			"const matches = descriptors.filter(\n" +
			"\t(descriptor) => descriptor.paneId === paneId && isPaneDeliveryTarget(descriptor),\n" +
			");";

		expect(
			paneResolutionViolations(root, file, source, {
				relative: win32.relative,
				sep: win32.sep,
			}),
		).toEqual([]);
	});

	it.each([
		{
			label: "reversed operands",
			source: "const match = descriptors.find((descriptor) => paneId === descriptor.paneId);",
		},
		{
			label: "destructured pane id",
			source: "const match = descriptors.find(({ paneId }) => paneId === targetPaneId);",
		},
	])("flags the $label pane-resolution bypass", ({ source }) => {
		const violations = paneResolutionViolations(
			"/repo/.pi/extensions/pij",
			"/repo/.pi/extensions/pij/core/rogue.ts",
			source,
		);

		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain("core/rogue.ts:1");
	});

	it("ignores pane-resolution shapes that appear only in comments", () => {
		const source = [
			"// descriptor.paneId === paneId",
			"const value = 1;",
			"/*",
			"descriptor.paneId === paneId",
			"*/",
		].join("\n");

		expect(
			paneResolutionViolations(
				"/repo/.pi/extensions/pij",
				"/repo/.pi/extensions/pij/core/rogue.ts",
				source,
			),
		).toEqual([]);
	});

	it("keeps runtime pane resolution behind the shared lifecycle-filtered resolver", () => {
		const root = resolve(import.meta.dirname, "..", "..");
		const files: string[] = [];
		const walk = (dir: string): void => {
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				const path = join(dir, entry.name);
				if (entry.isDirectory()) walk(path);
				else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) files.push(path);
			}
		};
		walk(root);

		const violations: string[] = [];
		for (const file of files) {
			violations.push(...paneResolutionViolations(root, file, readFileSync(file, "utf8")));
		}

		expect(violations).toEqual([]);
	});
});
