// Offline conformance harness for the pij OSC 7337 emitter (Producer B).
// vitest-free (runs under bare `tsx`) so it doubles as: (1) the in-branch proof
// of the § Producer B mapping, and (2) a byte generator for CROSS-REPO decode —
// pass an out-path and it writes a representative transcript of framed OSC bytes
// for the trex Phase-2 chain to decode (AC-03).
//
//   tsx conformance.ts            # assert the mapping, print PIJ_OSC_CONFORMANCE PASS
//   tsx conformance.ts out.bin    # also write framed bytes to out.bin
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";

import { emitLiveness, emitStateWrite, oscFrame, type Sink } from "./osc-7337-producer.js";

function fakeSink(): { sink: Sink; events: () => Record<string, unknown>[]; bytes: () => string } {
	const chunks: string[] = [];
	return {
		sink: (b) => chunks.push(b),
		bytes: () => chunks.join(""),
		events: () =>
			chunks.flatMap((c) => {
				const out: Record<string, unknown>[] = [];
				const re = /\x1b\]7337;([\s\S]*?)\x07/g;
				let m: RegExpExecArray | null;
				while ((m = re.exec(c))) out.push(JSON.parse(m[1]));
				return out;
			}),
	};
}
const SRC = "pij";

// 1. plain semantic write → agent.state only (semantic word, e.g. ready)
{
	const f = fakeSink();
	emitStateWrite({ nodeId: "n1", word: "ready" }, f.sink);
	assert.deepEqual(f.events(), [{ v: 2, cmd: "agent.state", state: "ready", source: SRC }]);
}
// 2. entering question → state + interrupt raised (kind question)
{
	const f = fakeSink();
	emitStateWrite({ nodeId: "n1", word: "question", prevWord: "ready", note: "which branch?" }, f.sink);
	assert.deepEqual(f.events(), [
		{ v: 2, cmd: "agent.state", state: "question", detail: "which branch?", source: SRC },
		{ v: 2, cmd: "agent.event", kind: "interrupt", phase: "raised", id: "intr-n1", interrupt_kind: "question", detail: "which branch?", source: SRC },
	]);
}
// 3. leaving question (→ another semantic word) → state + interrupt cleared (paired id)
{
	const f = fakeSink();
	emitStateWrite({ nodeId: "n1", word: "ready", prevWord: "question" }, f.sink);
	assert.deepEqual(f.events(), [
		{ v: 2, cmd: "agent.state", state: "ready", source: SRC },
		{ v: 2, cmd: "agent.event", kind: "interrupt", phase: "cleared", id: "intr-n1", source: SRC },
	]);
}
// 4. done + refs → state done + claim with evidence
{
	const f = fakeSink();
	emitStateWrite({ nodeId: "n1", word: "done", note: "s080 P4 done", refs: ["state:done", "sha:f66d1a9", "branch:feat/x", "selftest:A/t", "file:x.md"] }, f.sink);
	assert.deepEqual(f.events(), [
		{ v: 2, cmd: "agent.state", state: "done", detail: "s080 P4 done", source: SRC },
		{ v: 2, cmd: "agent.event", kind: "claim", id: "claim-n1", claim: "s080 P4 done", evidence: { sha: "f66d1a9", branch: "feat/x", selftests: ["A/t"], files: ["x.md"] }, source: SRC },
	]);
}
// 5. liveness → agent.state working|idle only
{
	const f = fakeSink();
	emitLiveness({ nodeId: "n1", liveness: "idle" }, f.sink);
	assert.deepEqual(f.events(), [{ v: 2, cmd: "agent.state", state: "idle", source: SRC }]);
}
// 6. HONESTY: never tool/turn/usage across the full word set
{
	const f = fakeSink();
	for (const w of ["blocked", "question", "hold", "waiting", "ready", "failed", "cancelled", "done"] as const) {
		emitStateWrite({ nodeId: "n", word: w, prevWord: "ready" }, f.sink);
	}
	emitLiveness({ nodeId: "n", liveness: "working" }, f.sink);
	assert.equal(f.events().filter((e) => e.kind === "tool" || e.kind === "turn" || e.kind === "usage").length, 0);
}
// 7. tmux framing
assert.ok(oscFrame('{"x":1}', { tmux: true }).startsWith("\x1bPtmux;\x1b\x1b]7337;"));
assert.ok(oscFrame('{"x":1}', { tmux: true }).endsWith("\x07\x1b\\"));

// Optional: write a representative transcript of framed bytes for cross-repo decode.
const outPath = process.argv[2];
if (outPath) {
	const g = fakeSink();
	emitLiveness({ nodeId: "worker1", liveness: "working" }, g.sink);
	emitStateWrite({ nodeId: "worker1", word: "question", prevWord: "ready", note: "which branch?" }, g.sink);
	emitStateWrite({ nodeId: "worker1", word: "ready", prevWord: "question" }, g.sink);
	emitStateWrite({ nodeId: "worker1", word: "done", note: "s080 P4 done", refs: ["sha:f66d1a9", "branch:feat/x", "selftest:A/t", "file:x.md"] }, g.sink);
	emitLiveness({ nodeId: "worker1", liveness: "idle" }, g.sink);
	writeFileSync(outPath, "pij emitter output\n" + g.bytes() + "\ndone\n");
	console.log(`PIJ_OSC_CONFORMANCE wrote ${g.bytes().length} bytes → ${outPath}`);
}

console.log("PIJ_OSC_CONFORMANCE PASS — 7 mapping checks (agent.state · interrupt raise/clear · claim+evidence · liveness · honesty · tmux), fakes only, zero trex");
