// s101 / pij#181 — the cost AND the equivalence of the suspension probe, measured
// on live pids.
//
// The fix replaces ONE `ps` PER DESCRIPTOR with ONE `ps` PER TICK. This measures
// both halves of that claim against the real registry on this machine:
//
//   COST        — wall clock for the per-pid shape vs the whole-table shape.
//   EQUIVALENCE — for every pid, does the batched verdict EQUAL the per-pid
//                 verdict it replaces? A cost win that changed an answer would be
//                 a regression wearing a benchmark as a disguise, and the 95.9%
//                 dead-pid population is exactly where a null/false confusion
//                 would hide.
//
// Read-only. Touches no daemon, no registry file, no tmux.
//
// Usage:  node docs/plans/101-daemon-tick-cost/assets/bench/suspension-probe-cost.mjs

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PIJ_HOME = process.env.PIJ_HOME || join(homedir(), ".pij");

// ── the population the daemon actually probes ────────────────────────────────
// `list()` excludes `dissolved`; the runtime axis asks the question only for a
// descriptor that HAS a paneId. Same filter, so the count is the tick's count.
const pids = [];
let hot = 0;
for (const name of readdirSync(PIJ_HOME)) {
	if (!name.endsWith(".json")) continue;
	let d;
	try {
		d = JSON.parse(readFileSync(join(PIJ_HOME, name), "utf8"));
	} catch {
		continue;
	}
	if (typeof d?.id !== "string") continue;
	if (d.lifecycle === "dissolved") continue;
	hot += 1;
	if (d.paneId !== undefined && typeof d.pid === "number") pids.push(d.pid);
}

// ── the two shapes ───────────────────────────────────────────────────────────
/** The PRE-FIX probe, verbatim from daemon.ts:346 before this stream. */
function perPidSuspended(pid) {
	try {
		const state = execFileSync("ps", ["-o", "state=", "-p", String(pid)], {
			encoding: "utf8",
		}).trim();
		return state === "" ? null : state.startsWith("T");
	} catch {
		return null;
	}
}

/** The POST-FIX capture, verbatim from adapters/process-states.ts. */
function captureStates() {
	let stdout;
	try {
		stdout = execFileSync("ps", ["-Ao", "pid=,state="], {
			encoding: "utf8",
			maxBuffer: 8 * 1024 * 1024,
			timeout: 5000,
		});
	} catch (e) {
		return { ok: false, reason: String(e) };
	}
	const states = new Map();
	for (const row of stdout.split("\n")) {
		const m = /^\s*(\d+)\s+(\S+)\s*$/.exec(row);
		if (m) states.set(Number(m[1]), m[2]);
	}
	return states.size === 0 ? { ok: false, reason: "no rows" } : { ok: true, states };
}

function batchedSuspended(table, pid) {
	if (!table.ok) return null;
	const state = table.states.get(pid);
	return state === undefined ? null : state.startsWith("T");
}

// ── PROVE THE INSTRUMENT (F-701) ─────────────────────────────────────────────
// A no-op loop of the same trip count must measure ~0. Without this, any number
// below could be loop overhead rather than subprocess cost.
let t = process.hrtime.bigint();
for (let i = 0; i < pids.length; i++) {
	/* deliberately nothing */
}
const noopMs = Number(process.hrtime.bigint() - t) / 1e6;

// ── COST ─────────────────────────────────────────────────────────────────────
const REPS = 3;
const perPidRuns = [];
const batchedRuns = [];
for (let r = 0; r < REPS; r++) {
	t = process.hrtime.bigint();
	for (const pid of pids) perPidSuspended(pid);
	perPidRuns.push(Number(process.hrtime.bigint() - t) / 1e6);

	t = process.hrtime.bigint();
	captureStates();
	batchedRuns.push(Number(process.hrtime.bigint() - t) / 1e6);
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const perPidMs = median(perPidRuns);
const batchedMs = median(batchedRuns);

// ── EQUIVALENCE ──────────────────────────────────────────────────────────────
// Taken back-to-back so a pid that genuinely changes state between the two reads
// is the only source of disagreement — and if that happens it is REPORTED, not
// averaged away.
const table = captureStates();
let agree = 0;
const disagreements = [];
const verdicts = { null: 0, true: 0, false: 0 };
for (const pid of pids) {
	const a = perPidSuspended(pid);
	const b = batchedSuspended(table, pid);
	verdicts[String(a)] += 1;
	if (a === b) agree += 1;
	else disagreements.push({ pid, perPid: a, batched: b });
}

console.log(
	JSON.stringify(
		{
			pijHome: PIJ_HOME,
			population: { hotDescriptors: hot, probedPids: pids.length },
			instrumentProof: { noopLoopMs: +noopMs.toFixed(4) },
			cost: {
				reps: REPS,
				perPidTotalMs: +perPidMs.toFixed(1),
				perPidPerCallMs: +(perPidMs / pids.length).toFixed(3),
				batchedTotalMs: +batchedMs.toFixed(1),
				speedup: +(perPidMs / batchedMs).toFixed(1),
				savedMsPerTick: +(perPidMs - batchedMs).toFixed(1),
			},
			subprocessesPerTick: { before: pids.length, after: 1 },
			equivalence: {
				comparedPids: pids.length,
				agreed: agree,
				disagreed: disagreements.length,
				disagreements: disagreements.slice(0, 10),
				perPidVerdictBreakdown: verdicts,
			},
		},
		null,
		1,
	),
);
