// pij platform — FsSpineLog adapter specs (plan 054, WS-3 + review 001 F1:
// port-side seq allocation). ONE unified log at <pijHome>/spine/events.ndjson.
// Pins: ndjson format (one JSON line per append, stamped in canonical field
// order), seq allocation INSIDE the port under the cross-process events.lock
// (held → E-NOREG after the budget; NEVER stolen, review 002 G1), the
// review-001 race regression (two instances, exclusive cursor, no lost event),
// lastSeq recovery over torn tails, DURABLE appendOnce key-dedupe returning
// the ORIGINALLY stamped event (AC-03), append-only immutability, exact read
// filters (AC-02), and the subdir law (no top-level pijHome writes —
// phantom-peer regression).

import { spawn } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type BuildSpineEventInput, buildSpineEvent } from "../core/platform/spine.js";
import {
	isProject,
	isSpineEvent,
	type Project,
	type SpineEvent,
	type SpineEventDraft,
} from "../core/platform/types.js";
import type { Result } from "../core/types.js";
import { FsRegistry } from "./fs-registry.js";
import { FsSpineLog } from "./spine-store.js";

const T = Date.parse("2026-07-16T12:00:00.000Z");

const nodeRequire = createRequire(import.meta.url);
const TSX_CLI = nodeRequire.resolve("tsx/cli");
const SPINE_MODULE = pathToFileURL(join(import.meta.dirname, "spine-store.ts")).href;

async function waitUntil(check: () => boolean, timeoutMs = 10_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!check()) {
		if (Date.now() >= deadline) throw new Error("timed out waiting for append workers");
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

interface AppendWorkerOutcome {
	readonly ok: boolean;
	readonly seqs?: number[];
	readonly message?: string;
}

/** Spawn one real child process (fs-registry.test.ts precedent) that waits on
 *  the barrier file, then appends `count` drafts through its own FsSpineLog. */
function spawnAppendWorker(
	script: string,
	home: string,
	worker: number,
	count: number,
	barrier: string,
	ready: string,
): Promise<AppendWorkerOutcome> {
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[TSX_CLI, script, home, String(worker), String(count), barrier, ready],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code !== 0) {
				reject(new Error(`append worker exited ${code}: ${stderr}`));
				return;
			}
			resolve(JSON.parse(stdout) as AppendWorkerOutcome);
		});
	});
}

/** Draft under test: buildSpineEvent's canonical seq-less shape — the port
 *  stamps seq itself (review 001 F1). `n` only varies ts between drafts. */
function draft(n: number, over: Partial<BuildSpineEventInput> = {}): SpineEventDraft {
	// buildSpineEvent is fallible on the clock (review 001 F7); the fixed
	// test clock is always valid, so unwrap keeps call sites draft-shaped.
	const result = buildSpineEvent({ nowMs: T + n * 1000, actor: "tester", kind: "note", ...over });
	if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
	return result.value;
}

/** Fully stamped event, for PLANTING lines that simulate an external writer —
 *  seq lands in the canonical field order the port itself stamps. */
function stampedEv(seq: number, over: Partial<BuildSpineEventInput> = {}): SpineEvent {
	const { schema_version, ts, actor, kind, refs, ...optionals } = draft(seq, over);
	return { schema_version, seq, ts, actor, kind, refs, ...optionals };
}

function expectOk<T>(result: Result<T>): T {
	if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.message}`);
	return result.value;
}

describe("FsSpineLog", () => {
	let home: string;
	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-plat-"));
	});
	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	const spineFile = () => join(home, "spine", "events.ndjson");
	const lockFile = () => join(home, "spine", "events.lock");

	it("append stamps port-allocated seqs and writes one JSON line each under spine/events.ndjson", () => {
		const log = new FsSpineLog(home);
		const first = expectOk(log.append(draft(1)));
		const second = expectOk(log.append(draft(2, { peer: "pij-a", project: "alpha" })));
		const third = expectOk(log.append(draft(3)));
		expect([first.seq, second.seq, third.seq]).toEqual([1, 2, 3]);
		const raw = readFileSync(spineFile(), "utf8");
		expect(raw.endsWith("\n")).toBe(true);
		const lines = raw.split("\n").filter((line) => line.length > 0);
		expect(lines).toHaveLength(3);
		for (const line of lines) {
			expect(isSpineEvent(JSON.parse(line))).toBe(true);
			// Canonical field order: schema_version, seq, ts, actor, kind, refs, …
			expect(line.startsWith('{"schema_version":1,"seq":')).toBe(true);
		}
		expect(lines.map((line) => (JSON.parse(line) as SpineEvent).seq)).toEqual([1, 2, 3]);
		// The returned stamped event IS the on-disk record.
		expect(JSON.parse(lines[1] ?? "")).toEqual(second);
		// The write lock never outlives the operation.
		expect(existsSync(lockFile())).toBe(false);
	});

	it("lastSeq is 0 when empty and allocation resumes above any planted on-disk seq", () => {
		const log = new FsSpineLog(home);
		expect(log.lastSeq()).toBe(0);
		expectOk(log.append(draft(1)));
		// An external writer's line with a higher seq: recovery + allocation
		// must both derive from the file, not an in-memory counter.
		appendFileSync(spineFile(), `${JSON.stringify(stampedEv(7))}\n`);
		expect(log.lastSeq()).toBe(7);
		expect(new FsSpineLog(home).lastSeq()).toBe(7);
		expect(expectOk(log.append(draft(2))).seq).toBe(8);
	});

	it("crash recovery: a torn trailing half-line is skipped by lastSeq and read", () => {
		const log = new FsSpineLog(home);
		expectOk(log.append(draft(1)));
		expectOk(log.append(draft(2)));
		// Simulate a crash mid-write: partial JSON, no trailing newline.
		appendFileSync(spineFile(), '{"schema_version":1,"seq":99,"ts":');
		expect(log.lastSeq()).toBe(2);
		expect(log.read().map((e) => e.seq)).toEqual([1, 2]);
		// A fresh adapter over the same file recovers identically (post-restart).
		expect(new FsSpineLog(home).lastSeq()).toBe(2);
		expect(new FsSpineLog(home).read().map((e) => e.seq)).toEqual([1, 2]);
	});

	it("append newline-guards a torn tail: the next writer's event still lands (coder ruling)", () => {
		// The spine is a MULTI-writer machine-wide log (WS-5): writer A's crash
		// must never swallow writer B's next event. Stronger than the FsEventLog
		// blind-append precedent (single daemon writer) — ratified deviation.
		const log = new FsSpineLog(home);
		expectOk(log.append(draft(1)));
		expectOk(log.append(draft(2)));
		appendFileSync(spineFile(), '{"schema_version":1,"seq":99,"ts":');
		expect(expectOk(log.append(draft(3))).seq).toBe(3);
		expect(log.lastSeq()).toBe(3);
		expect(log.read().map((e) => e.seq)).toEqual([1, 2, 3]);
		// The torn fragment stays inert on disk; a fresh adapter agrees.
		expect(new FsSpineLog(home).read().map((e) => e.seq)).toEqual([1, 2, 3]);
	});

	it("race regression (review 001 F1): a second instance's append gets a fresh seq — never lost behind an advanced cursor", () => {
		const a = new FsSpineLog(home);
		const b = new FsSpineLog(home);
		const first = expectOk(a.append(draft(1)));
		// The consumer reads everything and advances an EXCLUSIVE cursor.
		const seen = a.read();
		expect(seen.map((e) => e.seq)).toEqual([first.seq]);
		const cursor = seen[seen.length - 1]?.seq ?? 0;
		// Pre-fix, B minting lastSeq()+1 caller-side could duplicate A's seq and
		// the event vanished behind the cursor. Port-side allocation forbids it.
		const second = expectOk(b.append(draft(2)));
		expect(second.seq).toBeGreaterThan(cursor);
		expect(a.read({ since: cursor })).toEqual([second]);
		// No event lost, no seq duplicated.
		expect(a.read().map((e) => e.seq)).toEqual([first.seq, second.seq]);
		expect(new Set([first.seq, second.seq]).size).toBe(2);
	});

	// Real overlapping processes: exceeds the 5s default on slow CI runners.
	it("multi-process atomicity: 4 concurrent writers x 25 appends allocate seqs exactly 1..100", {
		timeout: 30_000,
	}, async () => {
		// The F1 law under TRUE concurrency: allocate+write must hold the lock
		// ACROSS lastSeq()+1 and the file write. An impl that computes the seq
		// before acquiring (or acquires, releases, then writes unlocked) yields
		// duplicate/gapped seqs here — the sequential tests above cannot see it.
		const WORKERS = 4;
		const APPENDS = 25;
		const script = join(home, "append-worker.ts");
		const barrier = join(home, "start");
		writeFileSync(
			script,
			`import { existsSync, writeFileSync } from "node:fs";
import { FsSpineLog } from ${JSON.stringify(SPINE_MODULE)};

const [home, worker, count, barrier, ready] = process.argv.slice(2);
if (!home || !worker || !count || !barrier || !ready) process.exit(64);
writeFileSync(ready, "");
const sleeper = new Int32Array(new SharedArrayBuffer(4));
while (!existsSync(barrier)) Atomics.wait(sleeper, 0, 0, 5);
const log = new FsSpineLog(home);
const seqs: number[] = [];
for (let i = 0; i < Number(count); i++) {
	const result = log.append({
		schema_version: 1,
		ts: new Date(${T} + i * 1000).toISOString(),
		actor: \`worker-\${worker}\`,
		kind: "note",
		refs: [],
	});
	if (!result.ok) {
		process.stdout.write(JSON.stringify({ ok: false, message: \`\${result.code}: \${result.message}\` }));
		process.exit(0);
	}
	seqs.push(result.value.seq);
}
process.stdout.write(JSON.stringify({ ok: true, seqs }));
`,
		);
		const readyPaths = Array.from({ length: WORKERS }, (_, index) => join(home, `ready-${index}`));
		const outcomes = readyPaths.map((ready, index) =>
			spawnAppendWorker(script, home, index, APPENDS, barrier, ready),
		);
		await waitUntil(() => readyPaths.every(existsSync));
		writeFileSync(barrier, "go");
		const results = await Promise.all(outcomes);
		for (const result of results) {
			expect(result.ok, result.message ?? "").toBe(true);
			// Each worker's own appends are sequential: its seqs strictly increase.
			const seqs = result.seqs ?? [];
			expect([...seqs].sort((left, right) => left - right)).toEqual(seqs);
		}
		// Across ALL workers: exactly 1..N*M — unique, gapless, none lost.
		const expected = Array.from({ length: WORKERS * APPENDS }, (_, i) => i + 1);
		const all = results.flatMap((result) => result.seqs ?? []);
		expect([...all].sort((left, right) => left - right)).toEqual(expected);
		const log = new FsSpineLog(home);
		expect(log.lastSeq()).toBe(WORKERS * APPENDS);
		expect(log.read().map((e) => e.seq)).toEqual(expected);
		expect(existsSync(lockFile())).toBe(false);
	});

	it("alternating-instance stress: 20 appends across two instances allocate seqs exactly 1..20", () => {
		const a = new FsSpineLog(home);
		const b = new FsSpineLog(home);
		const seqs: number[] = [];
		for (let i = 1; i <= 20; i++) {
			seqs.push(expectOk((i % 2 === 0 ? b : a).append(draft(i))).seq);
		}
		expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
		expect(a.read().map((e) => e.seq)).toEqual(seqs);
		expect(b.lastSeq()).toBe(20);
	});

	it("a held (fresh) events.lock makes append err E-NOREG after the acquisition budget", () => {
		const log = new FsSpineLog(home);
		// A live writer's lock: fresh mtime, must NOT be stolen.
		writeFileSync(lockFile(), `${process.pid}\n`);
		const result = log.append(draft(1));
		expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
		if (!result.ok) expect(result.message).toContain("events.lock");
		// The holder's lock survives the failed acquisition; the log gained nothing.
		expect(existsSync(lockFile())).toBe(true);
		expect(log.read()).toEqual([]);
	});

	it("a manually removed wedged lock unblocks the next writer (the ONLY recovery path — review 002 G1)", () => {
		const log = new FsSpineLog(home, { lockBudgetMs: 60 });
		// A crashed writer's leftover lock wedges appends…
		writeFileSync(lockFile(), "crashed-writer\n");
		expect(log.append(draft(1))).toMatchObject({ ok: false, code: "E-NOREG" });
		// …until a HUMAN removes it, exactly as the diagnostic instructs.
		rmSync(lockFile());
		expect(expectOk(log.append(draft(1))).seq).toBe(1);
		expect(log.read().map((e) => e.seq)).toEqual([1]);
		expect(existsSync(lockFile())).toBe(false);
	});

	it("appendOnce dedupes by key: replay returns the ORIGINAL stamped event (AC-03) and distinct keys land", () => {
		const log = new FsSpineLog(home);
		const first = expectOk(log.appendOnce("claim-alpha", draft(1, { kind: "claim" })));
		expect(first.outcome).toBe("appended");
		expect(first.event.seq).toBe(1);
		// Duplicate replay gains the log nothing: the original event, exactly once.
		const replay = expectOk(log.appendOnce("claim-alpha", draft(2, { kind: "usurper" })));
		expect(replay).toEqual({ outcome: "existing", event: first.event });
		expect(log.read()).toEqual([first.event]);
		expect(log.lastSeq()).toBe(1);
		const beta = expectOk(log.appendOnce("claim-beta", draft(2)));
		expect(beta.outcome).toBe("appended");
		expect(beta.event.seq).toBe(2);
		expect(log.read().map((e) => e.seq)).toEqual([1, 2]);
		// The once-publish staging discipline leaks no temp files into spine/.
		const leftovers = readdirSync(join(home, "spine")).filter(
			(name) => name.startsWith(".") || name.includes(".tmp") || name.includes(".claim-"),
		);
		expect(leftovers).toEqual([]);
	});

	it("appendOnce replay across instances is durable: outcome existing with the ORIGINAL stamped event", () => {
		// Dedupe must be DURABLE (FsEventLog hard-link precedent), not an
		// in-memory key set: a fresh adapter over the same home — the AC-03
		// process-restart replay — still returns what the first call stamped.
		const a = new FsSpineLog(home);
		const original = expectOk(a.appendOnce("claim-alpha", draft(1, { kind: "claim" })));
		expect(original.outcome).toBe("appended");
		const b = new FsSpineLog(home);
		const replay = expectOk(b.appendOnce("claim-alpha", draft(9, { kind: "usurper" })));
		expect(replay.outcome).toBe("existing");
		expect(replay.event).toEqual(original.event);
		expect(b.read()).toEqual([original.event]);
		expect(b.lastSeq()).toBe(original.event.seq);
	});

	it("append-only: planted non-canonical and foreign bytes survive appends verbatim", () => {
		const log = new FsSpineLog(home);
		expectOk(log.append(draft(1)));
		// A guard-VALID event line no re-serializer reproduces: extra whitespace,
		// reordered keys — JSON.stringify(JSON.parse(line)) differs byte-wise, so
		// a readAll→rewrite implementation cannot regenerate it.
		const oddball = `{ "kind": "note",  "refs": [],  "actor": "tester", "ts": "${new Date(
			T + 2000,
		).toISOString()}", "seq": 2, "schema_version": 1 }`;
		expect(isSpineEvent(JSON.parse(oddball))).toBe(true);
		expect(JSON.stringify(JSON.parse(oddball))).not.toBe(oddball);
		appendFileSync(spineFile(), `${oddball}\n`);
		// A guard-FILTERING rewriter would silently drop this valid-JSON foreign line.
		const foreign: Project = {
			schema_version: 1,
			slug: "demo",
			description: "not a spine event",
			created: { actor: "tester", ts: new Date(T).toISOString() },
		};
		appendFileSync(spineFile(), `${JSON.stringify(foreign)}\n`);
		const beforeRaw = readFileSync(spineFile(), "utf8");
		// Allocation also respects the planted seq 2: the next appends take 3, 4.
		expect(expectOk(log.append(draft(3))).seq).toBe(3);
		expect(expectOk(log.append(draft(4))).seq).toBe(4);
		// The grown file must START with the exact prior bytes: a whole-file
		// rewriter (canonicalizing or filtering) fails; a true appender passes.
		expect(readFileSync(spineFile(), "utf8").startsWith(beforeRaw)).toBe(true);
		expect(log.read().map((e) => e.seq)).toEqual([1, 2, 3, 4]);
		expect(log.lastSeq()).toBe(4);
	});

	it("read since is exclusive (seq > since)", () => {
		const log = new FsSpineLog(home);
		for (const n of [1, 2, 3]) expectOk(log.append(draft(n)));
		expect(log.read({ since: 2 }).map((e) => e.seq)).toEqual([3]);
		expect(log.read({ since: 0 }).map((e) => e.seq)).toEqual([1, 2, 3]);
		expect(log.read({ since: 3 })).toEqual([]);
	});

	it("read peer filter is exact — pij-a never matches pij-ab", () => {
		const log = new FsSpineLog(home);
		expectOk(log.append(draft(1, { peer: "pij-a" })));
		expectOk(log.append(draft(2, { peer: "pij-ab" })));
		expectOk(log.append(draft(3)));
		expect(log.read({ peer: "pij-a" }).map((e) => e.seq)).toEqual([1]);
		expect(log.read({ peer: "pij-ab" }).map((e) => e.seq)).toEqual([2]);
	});

	it("read project filter is exact", () => {
		const log = new FsSpineLog(home);
		expectOk(log.append(draft(1, { project: "alpha" })));
		expectOk(log.append(draft(2, { project: "alpha-2" })));
		expect(log.read({ project: "alpha" }).map((e) => e.seq)).toEqual([1]);
	});

	it("read returns a seq-ascending merge including appendOnce events", () => {
		const log = new FsSpineLog(home);
		expectOk(log.append(draft(1, { peer: "pij-a", project: "alpha" })));
		const mid = expectOk(log.appendOnce("mid", draft(2, { peer: "pij-a", project: "alpha" })));
		expect(mid.outcome).toBe("appended");
		expect(mid.event.seq).toBe(2);
		expectOk(log.append(draft(3, { peer: "pij-a", project: "alpha" })));
		expect(log.read().map((e) => e.seq)).toEqual([1, 2, 3]);
		expect(log.read({ peer: "pij-a", project: "alpha", since: 1 }).map((e) => e.seq)).toEqual([
			2, 3,
		]);
	});

	it("read skips valid-JSON foreign records (a Project line is guard-filtered)", () => {
		const log = new FsSpineLog(home);
		expectOk(log.append(draft(1)));
		const foreign: Project = {
			schema_version: 1,
			slug: "demo",
			description: "not a spine event",
			created: { actor: "tester", ts: new Date(T).toISOString() },
		};
		// Sanity: the fixture is a valid foreign record, not a corrupt line.
		expect(isProject(foreign)).toBe(true);
		expect(isSpineEvent(foreign)).toBe(false);
		appendFileSync(spineFile(), `${JSON.stringify(foreign)}\n`);
		expectOk(log.append(draft(2)));
		expect(log.read().map((e) => e.seq)).toEqual([1, 2]);
		expect(log.lastSeq()).toBe(2);
	});

	it("keeps every write below spine/ — nothing at the top of pijHome", () => {
		const log = new FsSpineLog(home);
		expectOk(log.append(draft(1)));
		expectOk(log.appendOnce("once", draft(2)));
		expect(readdirSync(home)).toEqual(["spine"]);
	});

	it("phantom-peer regression: FsRegistry.list() stays empty after spine writes", () => {
		const log = new FsSpineLog(home);
		expectOk(log.append(draft(1)));
		expectOk(log.appendOnce("once", draft(2)));
		expect(new FsRegistry(home).list()).toEqual([]);
	});

	// ─── review 002 G1 — locks are NEVER stolen ─────────────────────────────
	// mtime-only staleness + non-atomic steal could evict a LIVE holder (the
	// reviewer's three-writer handoff probe) and any >stale-horizon critical
	// section was stealable. Ruling: no automatic stealing at all — a stuck
	// lock times out with the manual-removal diagnostic, fail loudly.

	it("an AGED lock is never stolen: append times out E-NOREG and the holder's lock survives byte-identical (review 002 G1)", () => {
		const log = new FsSpineLog(home, { lockBudgetMs: 60 });
		// A LIVE holder inside a long critical section: old mtime, real pid.
		writeFileSync(lockFile(), `${process.pid}:live-holder-token\n`);
		const agedSec = (Date.now() - 60_000) / 1000;
		utimesSync(lockFile(), agedSec, agedSec);
		const before = readFileSync(lockFile(), "utf8");
		const result = log.append(draft(1));
		expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
		if (!result.ok) {
			expect(result.message).toContain("events.lock");
			// The diagnostic must route humans to MANUAL removal, not promise a steal.
			expect(result.message).toMatch(/remove/i);
		}
		expect(readFileSync(lockFile(), "utf8")).toBe(before);
		expect(log.read()).toEqual([]);
		// No steal machinery: no moved-aside lock debris can exist either.
		expect(readdirSync(join(home, "spine")).filter((n) => n.includes(".steal."))).toEqual([]);
	});

	it("stale observation then release + fresh reacquire: the fresh holder's lock is never moved or deleted (review 002 G1 three-writer handoff)", () => {
		const log = new FsSpineLog(home, { lockBudgetMs: 60 });
		// Writer H's lock, aged far past the old staleness horizon — the probe's
		// "stale observation" step.
		writeFileSync(lockFile(), "holder-H\n");
		const agedSec = (Date.now() - 60_000) / 1000;
		utimesSync(lockFile(), agedSec, agedSec);
		expect(log.append(draft(1))).toMatchObject({ ok: false, code: "E-NOREG" });
		// H releases and writer A acquires a FRESH lock — the handoff the probe
		// exploited: a pre-observed stale path confers no right to move whatever
		// lives at that path now.
		rmSync(lockFile());
		writeFileSync(lockFile(), "holder-A\n");
		const result = log.append(draft(2));
		expect(result).toMatchObject({ ok: false, code: "E-NOREG" });
		expect(readFileSync(lockFile(), "utf8")).toBe("holder-A\n");
		expect(log.read()).toEqual([]);
		expect(readdirSync(join(home, "spine")).filter((n) => n.includes(".steal."))).toEqual([]);
	});
});
