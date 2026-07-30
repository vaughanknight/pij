// plan 054 — ACCEPTANCE SWEEP (P4 T007, V-04): all 12 ACs demonstrated in ONE
// isolated harness. R3 fence: temp PIJ_HOME + real fs adapters, FAKE process/
// clock/tmux-liveness, daemon logic driven ONLY by single-step tick() (no live
// daemon, no real ~/.pij, no global state). The one subprocess is the real bin
// running `spine render` against the SAME temp home (bin-owned verb, AC-10).
//
// AC → generating step → assertion map (each `it` carries its AC in the name):
//   AC-01 project create/list/set …… step 2 — record file, attribution, collision slug, list, set-links
//   AC-02 spine filters exact ……… step 3 — --peer/--project return sets == manual exact filter
//   AC-03 append-only + idempotent … step 4 — appendOnce replay dedupe; prefix immutability re-proved in step 11
//   AC-04 runtime axis verdicts …… step 8 — starting / stopped / unknown (+ working) persisted + V-05 daemon events
//   AC-05 task/state + badge ……… step 5 — implicit general + explicit assignment, denorms, worst-first badge
//   AC-06 done is a claim …………… steps 6+7 — unverified render + anomaly, verify flips it
//   AC-07 anomalies + parent latch … step 7 — all three kinds w/ evidence; sweep alerts once, re-tick alerts 0
//   AC-08 adoption + link …………… step 9 — unadopted projection, evented re-parent, cycle rejection, spawnedBy immutable
//   AC-09 full node card ……………… step 10 — field-by-field incl. axes, gauges, windowId
//   AC-10 spine render ……………… step 11 — real bin writes spine/spine.md byte-identical to the pure render
//   AC-11 legacy round-trip ………… step 1 — pre-054 descriptor loads, lists, round-trips byte-stably
//   AC-12 public contract shipped … step 12 — platform doc + README pointer + skill node route present

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FsAllocationStore } from "./adapters/allocation-store.js";
import { FsAssignmentStore } from "./adapters/assignment-store.js";
import { FsDispatchStore } from "./adapters/dispatch-store.js";
import { FakeProcess } from "./adapters/fakes.js";
import { FsFenceStore } from "./adapters/fence-store.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { FsOpJournal } from "./adapters/op-journal.js";
import { FsPlatformWriteLock } from "./adapters/platform-write-lock.js";
import { FsProjectStore } from "./adapters/project-store.js";
import { FsSpineLog } from "./adapters/spine-store.js";
import { type CliDeps, type CliResult, dispatch, parseArgs } from "./core/cli.js";
import { AnomalySweep } from "./core/daemon/anomaly-sweep.js";
import { RuntimeAxisTracker } from "./core/daemon/runtime-axis.js";
import { renderSpineMd } from "./core/platform/render-spine-md.js";
import { SPINE_KIND_STATE_SET, type SpineEvent } from "./core/platform/types.js";
import type { PijMessage, SessionDescriptor } from "./core/types.js";

const NOW = Date.parse("2026-07-17T06:00:00.000Z");
const ISO_RECENT = new Date(NOW - 30_000).toISOString();
const ACTOR = "pij-prime-seat";
const REPO_DOCS = join(import.meta.dirname, "..", "..", "..");
const CLI = join(import.meta.dirname, "cli.ts");
const TSX = join(import.meta.dirname, "..", "..", "..", "node_modules", ".bin", "tsx");

let HOME: string;
let registry: FsRegistry;
let projectStore: FsProjectStore;
let assignmentStore: FsAssignmentStore;
let allocationStore: FsAllocationStore;
let fenceStore: FsFenceStore;
let dispatchStore: FsDispatchStore;
let spineLog: FsSpineLog;
let opJournal: FsOpJournal;
let platformWriteLock: FsPlatformWriteLock;

/** Real-fs CliDeps over the temp home; identity + clock faked (R3). */
function deps(self = ACTOR): CliDeps {
	return {
		registry,
		eventLogFor: () => ({ append: () => 0, read: () => [], lastSeq: () => 0 }) as never,
		delivery: { deliver: () => undefined },
		process: new FakeProcess(999, NOW, { PIJ_SESSION_ID: self }, [100, 4242, 4243, 4244, 4245]),
		cwd: "/sweep/repo",
		pijHome: HOME,
		models: [{ id: "test-model", contextWindow: 200_000 }, { id: "windowless-model" }] as never,
		treeDescriptors: registry.list(),
		projectStore,
		assignmentStore,
		allocationStore,
		fenceStore,
		dispatchStore,
		spineLog,
		opJournal,
		platformWriteLock,
		contextReader: {
			current: () => ({ value: 1234, asOf: new Date(NOW).toISOString(), provenance: "fake-gauge" }),
		},
	};
}

function run(argv: readonly string[], self = ACTOR): CliResult {
	const parsed = parseArgs(argv);
	if (!parsed.ok) {
		return { stdout: "", stderr: `${parsed.code}: ${parsed.message}`, exitCode: 64 };
	}
	return dispatch(parsed.value, deps(self));
}

function runJson<T>(argv: readonly string[], self = ACTOR): T {
	const r = run(argv, self);
	expect(r.exitCode, `${argv.join(" ")} → ${r.stderr}`).toBe(0);
	return JSON.parse(r.stdout) as T;
}

function appendHistoricalState(nodeId: string, state: string, actor: string): void {
	const descriptor = registry.read(nodeId);
	const assignmentId = descriptor?.currentAssignment;
	if (assignmentId === undefined) throw new Error(`node '${nodeId}' has no current assignment`);
	const assignment = assignmentStore.read(assignmentId);
	if (assignment === null) throw new Error(`assignment '${assignmentId}' is missing`);
	const appended = spineLog.append({
		schema_version: 1,
		ts: new Date(NOW).toISOString(),
		actor,
		kind: SPINE_KIND_STATE_SET,
		refs: [`node:${nodeId}`, `assignment:${assignmentId}`, `state:${state}`],
		peer: nodeId,
		project: assignment.projectSlug,
	});
	if (!appended.ok) throw new Error(appended.message);
	const written = assignmentStore.write({
		...assignment,
		states: [...assignment.states, appended.value.seq],
	});
	if (!written.ok) throw new Error(written.message);
}

function desc(over: Partial<SessionDescriptor> & { id: string }): SessionDescriptor {
	return {
		folder: "/sweep/repo",
		dataDir: join(HOME, over.id),
		eventsPath: join(HOME, over.id, "events.ndjson"),
		pid: 4242,
		startedAt: ISO_RECENT,
		role: "worker",
		...over,
	};
}

// Shared chain state across ordered steps.
let legacyLoaded: SessionDescriptor;
let assignmentA = "";
let logSnapshotAtStep4: SpineEvent[] = [];

beforeAll(() => {
	HOME = mkdtempSync(join(tmpdir(), "pij-acceptance-sweep-"));
	registry = new FsRegistry(HOME);
	projectStore = new FsProjectStore(HOME);
	assignmentStore = new FsAssignmentStore(HOME);
	allocationStore = new FsAllocationStore(HOME);
	fenceStore = new FsFenceStore(HOME);
	dispatchStore = new FsDispatchStore(HOME);
	spineLog = new FsSpineLog(HOME);
	opJournal = new FsOpJournal(HOME);
	platformWriteLock = new FsPlatformWriteLock(HOME);

	// AC-11 seed: a PRE-054 descriptor (none of the plan's fields) written RAW,
	// before anything else touches the home.
	mkdirSync(join(HOME, "pij-legacy"), { recursive: true });
	writeFileSync(
		join(HOME, "pij-legacy.json"),
		JSON.stringify({
			id: "pij-legacy",
			folder: "/old/repo",
			dataDir: join(HOME, "pij-legacy"),
			eventsPath: join(HOME, "pij-legacy", "events.ndjson"),
			pid: 100,
			startedAt: "2026-01-01T00:00:00.000Z",
			role: "worker",
			state: "idle",
		}),
	);

	registry.write(desc({ id: ACTOR, role: "parent", prime: true, pid: 100 }));
	registry.write(
		desc({
			id: "pij-worker",
			spawnedBy: ACTOR,
			lifecycle: "bound",
			state: "working",
			lastEventAt: ISO_RECENT,
			paneId: "%42",
			windowId: "@7",
			harness: "pi",
			boundModel: "test-model",
			effort: "high",
		}),
	);
	// The lost-dispatch shape (AC-07): mechanically idle for 5h. The seat must
	// be OLDER than its last event — idle duration is bounded by node age
	// (kingfisher fix, dogfood #2), so a recent startedAt would honestly read
	// as a fresh spawn, not a lost dispatch.
	registry.write(
		desc({
			id: "pij-idler",
			parentId: ACTOR,
			lifecycle: "bound",
			state: "idle",
			pid: 4243,
			startedAt: new Date(NOW - 6 * 3_600_000).toISOString(),
			lastEventAt: new Date(NOW - 5 * 3_600_000).toISOString(),
		}),
	);
	// Non-prime, no parent of any kind → the unadopted case (AC-08).
	registry.write(desc({ id: "pij-stray", pid: 4244 }));
});

afterAll(() => {
	rmSync(HOME, { recursive: true, force: true });
});

describe("plan 054 acceptance sweep — 12 ACs, one isolated roundtrip (R3-fenced)", () => {
	it("step 1 · AC-11 — a pre-054 descriptor loads, lists, and round-trips unchanged", () => {
		const loaded = registry.read("pij-legacy");
		expect(loaded).not.toBeNull();
		legacyLoaded = loaded as SessionDescriptor;
		expect(legacyLoaded).toMatchObject({ id: "pij-legacy", pid: 100, role: "worker" });
		// None of the plan-054 fields were invented on load.
		expect(legacyLoaded.systemState).toBeUndefined();
		expect(legacyLoaded.semanticState).toBeUndefined();
		expect(legacyLoaded.contextCurrent).toBeUndefined();
		// Enumerable through the CLI beside modern nodes.
		const rows = runJson<Array<{ id: string; unadopted: boolean }>>(["list", "--json"]);
		expect(rows.map((r) => r.id)).toContain("pij-legacy");
		// Round-trip through the registry writer: identical record back.
		registry.write(legacyLoaded);
		expect(registry.read("pij-legacy")).toEqual(legacyLoaded);
	});

	it("step 2 · AC-01 — project create (schema-versioned, attributed, collision-slugged), list, set", () => {
		const created = runJson<{ slug: string }>(["project", "create", "Fix the CLI", "--json"]);
		expect(created.slug).toBe("fix-the-cli");
		const onDisk = JSON.parse(
			readFileSync(join(HOME, "projects", "fix-the-cli", "project.json"), "utf8"),
		) as Record<string, unknown>;
		expect(onDisk).toMatchObject({
			schema_version: 1,
			slug: "fix-the-cli",
			description: "Fix the CLI",
			created: { actor: ACTOR },
		});
		// Collision → -2 suffix, its own directory.
		const second = runJson<{ slug: string }>(["project", "create", "Fix the CLI", "--json"]);
		expect(second.slug).toBe("fix-the-cli-2");
		const listed = runJson<Array<{ slug: string }>>(["project", "list", "--json"]);
		expect(listed.map((p) => p.slug).sort()).toEqual(["fix-the-cli", "fix-the-cli-2"]);
		// set links plan + prime after creation.
		const set = run([
			"project",
			"set",
			"fix-the-cli",
			"--plan",
			"docs/plans/054/plan.md",
			"--prime",
			ACTOR,
			"--json",
		]);
		expect(set.exitCode).toBe(0);
		expect(projectStore.read("fix-the-cli")).toMatchObject({
			planPath: "docs/plans/054/plan.md",
			primeId: ACTOR,
		});
		// Attribution provenance on the audit events (resolved self, not asserted).
		const events = spineLog.read({ project: "fix-the-cli" });
		expect(events.some((e) => e.kind === "project-created")).toBe(true);
		for (const e of events) expect(e.actor).toBe(ACTOR);
	});

	it("step 3 · AC-02 — --peer/--project filters return EXACTLY the matching set", () => {
		for (const args of [
			["spine", "append", "--kind", "probe", "--peer", "pij-worker", "--project", "fix-the-cli"],
			["spine", "append", "--kind", "probe", "--peer", "pij-workerx"], // near-miss peer
			["spine", "append", "--kind", "probe", "--project", "fix-the-cli-2"], // near-miss project
			["spine", "append", "--kind", "probe", "--bare"],
		]) {
			expect(run(args).exitCode).toBe(0);
		}
		const all = spineLog.read();
		const byPeer = runJson<SpineEvent[]>(["spine", "events", "--peer", "pij-worker", "--json"]);
		expect(byPeer.map((e) => e.seq)).toEqual(
			all.filter((e) => e.peer === "pij-worker").map((e) => e.seq),
		);
		expect(byPeer.length).toBeGreaterThan(0);
		expect(byPeer.every((e) => e.peer === "pij-worker")).toBe(true); // pij-workerx excluded
		const byProject = runJson<SpineEvent[]>([
			"spine",
			"events",
			"--project",
			"fix-the-cli",
			"--json",
		]);
		expect(byProject.map((e) => e.seq)).toEqual(
			all.filter((e) => e.project === "fix-the-cli").map((e) => e.seq),
		);
		expect(byProject.every((e) => e.project === "fix-the-cli")).toBe(true); // -2 excluded
	});

	it("step 4 · AC-03 — duplicate/replayed appends are idempotent; the log only grows", () => {
		const before = spineLog.read();
		const draft = {
			schema_version: 1 as const,
			ts: new Date(NOW).toISOString(),
			actor: ACTOR,
			kind: "replay-probe",
			refs: [],
		};
		const first = spineLog.appendOnce("sweep-replay-op", draft);
		expect(first.ok).toBe(true);
		const second = spineLog.appendOnce("sweep-replay-op", draft);
		expect(second.ok).toBe(true); // replay is a success, not a duplicate line
		const after = spineLog.read();
		expect(after.length).toBe(before.length + 1);
		// Prior lines byte-stable (append-only: nothing mutated or deleted).
		expect(after.slice(0, before.length)).toEqual(before);
		logSnapshotAtStep4 = after;
	});

	it("step 5 · AC-05 — implicit general + explicit assignments, denorms, worst-first badge", () => {
		// Implicit: a state write on a node with NO assignment materializes
		// the fixed-id general assignment.
		expect(run(["report", "state", "waiting"], "pij-stray").exitCode).toBe(0);
		const general = JSON.parse(
			readFileSync(join(HOME, "assignments", "asg-general-pij-stray.json"), "utf8"),
		) as Record<string, unknown>;
		expect(general).toMatchObject({
			schema_version: 1,
			id: "asg-general-pij-stray",
			nodeId: "pij-stray",
		});
		expect(registry.read("pij-stray")?.semanticState).toBe("waiting");
		// Badge with no system verdict: worst of {waiting} is waiting.
		const strayCard = runJson<{ badge: string }>(["node", "show", "pij-stray", "--json"]);
		expect(strayCard.badge).toBe("waiting");

		// Explicit: task set opens a project-joined assignment + denorms.
		const opened = runJson<{ id: string; projectSlug: string }>([
			"task",
			"set",
			"pij-worker",
			"build the sweep",
			"--project",
			"fix-the-cli",
			"--json",
		]);
		assignmentA = opened.id;
		expect(opened.projectSlug).toBe("fix-the-cli");
		const worker = registry.read("pij-worker");
		expect(worker?.currentAssignment).toBe(assignmentA);
		expect(worker?.currentTask).toBe("build the sweep");
		// Declared done on the explicit assignment (the AC-06 claim under test).
		expect(
			run(["report", "state", "done", "--assignment", assignmentA], "pij-worker").exitCode,
		).toBe(0);
		expect(registry.read("pij-worker")?.semanticState).toBe("done");
	});

	it("step 6 · AC-06 — done renders UNVERIFIED until a verify write flips it", () => {
		const card = runJson<{
			assignments: Array<{
				id: string;
				state: string;
				verified: boolean | null;
				verifiedBy: string | null;
			}>;
		}>(["node", "show", "pij-worker", "--json"]);
		const a = card.assignments.find((x) => x.id === assignmentA);
		expect(a).toMatchObject({ state: "done", verified: false, verifiedBy: null });
		const anomalies = runJson<Array<{ kind: string; assignmentId?: string; evidence: number[] }>>([
			"anomalies",
			"--json",
		]);
		const unverified = anomalies.find(
			(x) => x.kind === "unverified-done" && x.assignmentId === assignmentA,
		);
		expect(unverified).toBeDefined();
		expect(unverified?.evidence.length).toBeGreaterThan(0);
	});

	it("step 7 · AC-07 (+AC-06 flip) — all three anomaly kinds with evidence; parent alert exactly once per transition", () => {
		// foreign-hold-clear: hold by the resolved self, cleared by an ASSERTED
		// other — on an assignment joined to fix-the-cli (primeId = ACTOR from
		// step 2), so the unadopted stray exercises the project-prime fallback.
		expect(
			run(["task", "set", "pij-stray", "stray errand", "--project", "fix-the-cli"]).exitCode,
		).toBe(0);
		expect(run(["report", "state", "hold"], "pij-stray").exitCode).toBe(0);
		appendHistoricalState("pij-stray", "ready", "pij-other");
		// axis-disagreement: open undeclared assignment on a 5h-idle node.
		registry.write({ ...(registry.read("pij-idler") as SessionDescriptor), systemState: "idle" });
		expect(run(["task", "set", "pij-idler", "lost dispatch"]).exitCode).toBe(0);

		const anomalies = runJson<Array<{ kind: string; nodeId: string; evidence: number[] }>>([
			"anomalies",
			"--json",
		]);
		const kinds = anomalies.map((a) => a.kind);
		expect(kinds).toContain("unverified-done");
		expect(kinds).toContain("foreign-hold-clear");
		expect(kinds).toContain("axis-disagreement");
		for (const a of anomalies) expect(a.evidence.length).toBeGreaterThan(0);

		// Parent alerts: once per transition, never twice, never an action.
		const delivered: PijMessage[] = [];
		const logged: string[] = [];
		const sweep = new AnomalySweep({
			registry,
			assignmentStore,
			spineLog,
			delivery: { deliver: (m) => void delivered.push(m as PijMessage) },
			now: () => NOW,
			projectStore,
			log: (line) => void logged.push(line),
		});
		const first = sweep.tick();
		expect(first.anomalies).toBe(anomalies.length);
		// The worker + idler anomalies alert their effectiveParent (the prime
		// seat); the unadopted stray reaches the SAME seat via its assignment's
		// project prime (s057 fallback) — nothing dropped this tick.
		expect(delivered.length).toBeGreaterThan(0);
		expect(delivered.every((m) => m.to === ACTOR)).toBe(true);
		expect(delivered.some((m) => m.from === "pij-stray")).toBe(true);
		expect(first.dropped).toBe(0);
		const second = sweep.tick();
		expect(second.alerts).toBe(0); // the latch: a quiet tick re-alerts nothing
		expect(second.dropped).toBe(0);

		// No-prime path: the same dance joined to fix-the-cli-2 (NO primeId on
		// record) has nobody to alert — counted + logged, never silent, latched.
		expect(
			run(["task", "set", "pij-stray", "primeless errand", "--project", "fix-the-cli-2"]).exitCode,
		).toBe(0);
		expect(run(["report", "state", "hold"], "pij-stray").exitCode).toBe(0);
		appendHistoricalState("pij-stray", "ready", "pij-other");
		const third = sweep.tick();
		expect(third.alerts).toBe(0);
		expect(third.dropped).toBe(1);
		expect(delivered.every((m) => m.to === ACTOR)).toBe(true); // nothing new delivered
		expect(logged.some((line) => line.includes("anomaly alert dropped"))).toBe(true);
		const fourth = sweep.tick();
		expect(fourth.dropped).toBe(0); // dropped transitions latch like delivered ones

		// AC-06 flip: verify stamps verifiedBy and clears the anomaly.
		expect(run(["report", "verify", "pij-worker", "--assignment", assignmentA]).exitCode).toBe(0);
		const card = runJson<{
			assignments: Array<{ id: string; verified: boolean | null; verifiedBy: string | null }>;
		}>(["node", "show", "pij-worker", "--json"]);
		expect(card.assignments.find((x) => x.id === assignmentA)).toMatchObject({
			verified: true,
			verifiedBy: ACTOR,
		});
		const after = runJson<Array<{ kind: string; assignmentId?: string }>>(["anomalies", "--json"]);
		expect(after.some((x) => x.kind === "unverified-done" && x.assignmentId === assignmentA)).toBe(
			false,
		);
	});

	it("step 8 · AC-04 — runtime axis: starting-hold, suspended→stopped, missing-telemetry→unknown; V-05 daemon events", () => {
		registry.write(desc({ id: "pij-starting", lifecycle: "pending", pid: 4245 }));
		registry.write(desc({ id: "pij-unknown", lifecycle: "bound", pid: 4245 }));
		registry.write(
			desc({ id: "pij-stopped", lifecycle: "bound", state: "working", paneId: "%9", pid: 4245 }),
		);
		const suspendedPids = new Set([4245]);
		const tracker = new RuntimeAxisTracker({
			registry,
			spineLog,
			opJournal,
			projectStore,
			assignmentStore,
			allocationStore,
			fenceStore,
			dispatchStore,
			platformWriteLock,
			now: () => NOW,
			isAlive: (pid) => pid !== 999_999,
			isSuspended: (pid) =>
				pid === 4242 || pid === 100 || pid === 4243 ? false : suspendedPids.has(pid),
			log: () => undefined,
		});
		// pij-stopped shares pid 4245 with starting/unknown; suspension only
		// matters for BOUND nodes with telemetry, so scope it per-node instead:
		tracker.tick(
			registry
				.list()
				.map((d) => (d.id === "pij-starting" || d.id === "pij-unknown" ? { ...d, pid: 4243 } : d)),
		);
		expect(registry.read("pij-starting")?.systemState).toBe("starting"); // pre-bind hold
		expect(registry.read("pij-stopped")?.systemState).toBe("stopped"); // suspended-but-alive
		expect(registry.read("pij-unknown")?.systemState).toBe("unknown"); // never inferred idle
		expect(registry.read("pij-worker")?.systemState).toBe("working");
		const axisEvents = spineLog.read().filter((e) => e.kind === "system-state");
		expect(axisEvents.length).toBeGreaterThanOrEqual(4);
		for (const e of axisEvents) expect(e.actor).toBe("daemon");
		const unknownEvent = axisEvents.find((e) => e.peer === "pij-unknown");
		expect(unknownEvent?.refs).toContain("reason:missing-telemetry");
	});

	it("step 9 · AC-08 — unadopted projection, evented re-parent, cycle rejection, spawnedBy immutable", () => {
		type Node = { id: string; unadopted?: true; children: Node[] };
		const flatten = (nodes: Node[]): Node[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);
		const forest = runJson<{ roots: Node[] }>(["tree", "--global", "--all", "--json"]);
		const nodes = flatten(forest.roots);
		expect(nodes.find((n) => n.id === "pij-stray")?.unadopted).toBe(true);
		expect(nodes.find((n) => n.id === ACTOR)?.unadopted).toBeUndefined(); // prime = legal root
		const rows = runJson<Array<{ id: string; unadopted: boolean }>>(["list", "--json"]);
		expect(rows.find((r) => r.id === "pij-stray")?.unadopted).toBe(true);
		expect(rows.find((r) => r.id === ACTOR)?.unadopted).toBe(false);

		// Evented re-parent.
		const linked = runJson<{ spineSeq: number | null }>([
			"link",
			"pij-stray",
			"--parent",
			"pij-worker",
			"--json",
		]);
		expect(typeof linked.spineSeq).toBe("number");
		const stray = registry.read("pij-stray");
		expect(stray?.parentId).toBe("pij-worker");
		expect(stray?.spawnedBy).toBeUndefined(); // provenance never invented/rewritten
		const hop = spineLog.read().find((e) => e.seq === linked.spineSeq);
		expect(hop).toMatchObject({ kind: "node-linked", peer: "pij-stray", next: "pij-worker" });
		expect(hop?.refs).toContain("node:pij-stray");
		expect(hop?.refs).toContain("parent:pij-worker");
		// Adoption flag drops once linked.
		const after = flatten(
			runJson<{ roots: Node[] }>(["tree", "--global", "--all", "--json"]).roots,
		);
		expect(after.find((n) => n.id === "pij-stray")?.unadopted).toBeUndefined();
		// Cycles stay rejected.
		const cyclic = run(["link", "pij-worker", "--parent", "pij-stray"]);
		expect(cyclic.exitCode).not.toBe(0);
		expect(cyclic.stderr.toLowerCase()).toContain("cycle");
	});

	it("step 10 · AC-09 — the full node card, field by field (axes, gauges, addressability)", () => {
		const card = runJson<Record<string, unknown>>(["node", "show", "pij-worker", "--json"]);
		expect(card).toMatchObject({
			id: "pij-worker",
			harness: "pi",
			parent: ACTOR, // effectiveParent via spawnedBy
			spawnedBy: ACTOR,
			systemState: "working",
			semanticState: "done",
			badge: "working", // worst-first: working outranks done
			currentAssignment: assignmentA,
			currentTask: "build the sweep",
			paneId: "%42",
			windowId: "@7", // tmux select-window -t @7 — terminal addressability
			boundModel: "test-model",
			effort: "high",
			contextMax: 200_000, // models.json join (sole source — T006c ruling)
			contextCurrent: { value: 1234, provenance: "fake-gauge" },
		});
	});

	it("step 11 · AC-10 (+AC-03 immutability) — the real bin renders spine.md byte-identical to the pure render", () => {
		const out = execFileSync(TSX, [CLI, "spine", "render", "--json"], {
			env: { ...process.env, PIJ_HOME: HOME, PIJ_SESSION_ID: "", TMUX_PANE: "" },
			encoding: "utf8",
			timeout: 15_000,
		});
		const envelope = JSON.parse(out) as { path: string; bytes: number; events: number };
		const events = spineLog.read();
		const written = readFileSync(join(HOME, "spine", "spine.md"), "utf8");
		expect(written).toBe(renderSpineMd(events));
		expect(envelope.events).toBe(events.length);
		expect(written).toContain("node-linked");
		expect(written).toContain("system-state");
		// AC-03 across the WHOLE sweep: everything appended since step 4 only
		// ever extended the log — the step-4 prefix is untouched.
		expect(events.slice(0, logSnapshotAtStep4.length)).toEqual(logSnapshotAtStep4);
	});

	it("step 12 · AC-12 — the public contract is shipped: platform doc, README pointer, skill route", () => {
		const platformDoc = readFileSync(join(REPO_DOCS, "docs", "how", "pij-platform.md"), "utf8");
		expect(platformDoc).toContain("on-disk public contract");
		expect(platformDoc).toContain("projects/<slug>/project.json");
		expect(readFileSync(join(REPO_DOCS, "README.md"), "utf8")).toContain(
			"docs/how/pij-platform.md",
		);
		const route = readFileSync(
			join(REPO_DOCS, "skills", "pij", "references", "routes", "node.md"),
			"utf8",
		);
		expect(route).toContain("pij task set");
		expect(readFileSync(join(REPO_DOCS, "skills", "pij", "SKILL.md"), "utf8")).toContain(
			"references/routes/node.md",
		);
	});

	it("plan 074 P9 · PM routes automate start/stop reports and governors designate roles", () => {
		const ready = readFileSync(
			join(REPO_DOCS, "skills", "pij", "references", "routes", "ready.md"),
			"utf8",
		);
		const pair = readFileSync(
			join(REPO_DOCS, "skills", "pij", "references", "routes", "pair.md"),
			"utf8",
		);
		const orchestrator = readFileSync(
			join(REPO_DOCS, "skills", "pij", "references", "prime", "orchestrator.md"),
			"utf8",
		);
		const kickoff = readFileSync(
			join(REPO_DOCS, "skills", "pij", "references", "prime", "rituals", "kickoff.md"),
			"utf8",
		);

		expect(ready).not.toMatch(/--role|orchestration role set/);
		expect(kickoff).toContain("pij link <id> --parent <o-prime-id> --role pm --json");
		for (const route of [pair, orchestrator]) {
			expect(route).toContain("Start-of-work report");
			expect(route).toContain("Stop-of-work report");
		}
		// Pin the two required commands per route, NOT a global occurrence count.
		// The count proxy broke the moment orchestrator.md legitimately mentioned
		// `pij report now` a third time (relaying it while supervising the fleet's
		// cards) — which is not a regression in the two required steps this AC is
		// about. Asserting the commands is both stricter and stable.
		expect(orchestrator).toContain(
			"pij report now 'Starting **<plan>**' 'Run the next Builder or pair step'",
		);
		expect(orchestrator).toContain(
			"pij report now 'Completed **<phase>** after `harness checks`' 'Send the [phase report](<path>) and begin the next approved step'",
		);
		expect(pair).toContain(
			"pij report now 'Starting **<phase>**' 'Compile the packet and dispatch the coder'",
		);
		expect(pair).toContain(
			"pij report now 'Approved **<phase>** after `harness checks`' 'Send the [report](<path>) and await the next assignment'",
		);
	});

	it("state clear makes a parked assignment undeclared without disturbing its mechanical axis", () => {
		registry.write({ ...(registry.read("pij-stray") as SessionDescriptor), systemState: "idle" });
		expect(run(["report", "state", "hold"], "pij-stray").exitCode).toBe(0);
		const cleared = runJson<SpineEvent>(["report", "clear", "--json"], "pij-stray");
		expect(cleared).toMatchObject({ kind: "state-cleared", peer: "pij-stray" });
		const card = runJson<{ semanticState: string | null; systemState: string | null }>([
			"node",
			"show",
			"pij-stray",
			"--json",
		]);
		expect(card).toMatchObject({ semanticState: null, systemState: "idle" });
		expect(registry.read("pij-stray")?.semanticState).toBeUndefined();
	});
});
