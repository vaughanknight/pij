import { describe, expect, it } from "vitest";

import {
	emitLiveness,
	emitStateWrite,
	evidenceFromRefs,
	oscFrame,
	type Sink,
	type StateWrite,
} from "./osc-7337-producer.js";

// A FAKE tty sink (ADR-0004 / brief: fakes only): collects framed bytes, then
// decodes them back to payload objects so tests assert on spec fields, not on
// escape framing. This is the SAME wire trex's scanner extracts.
function fakeSink(): { sink: Sink; events: () => Record<string, unknown>[]; raw: () => string[] } {
	const chunks: string[] = [];
	const sink: Sink = (b) => chunks.push(b);
	const events = () =>
		chunks.flatMap((c) => {
			const out: Record<string, unknown>[] = [];
			const re = /\x1b\]7337;([\s\S]*?)\x07/g;
			let m: RegExpExecArray | null;
			while ((m = re.exec(c))) out.push(JSON.parse(m[1]));
			return out;
		});
	return { sink, events, raw: () => [...chunks] };
}

const SRC = "pij";

describe("pij OSC 7337 emitter — Producer B mapping", () => {
	it("any semantic write → agent.state <word> (verbatim, source pij)", () => {
		const f = fakeSink();
		emitStateWrite({ nodeId: "n1", word: "ready" }, f.sink);
		expect(f.events()).toEqual([{ v: 2, cmd: "agent.state", state: "ready", source: SRC }]);
	});

	it("entering question → agent.state question + interrupt raised (kind question)", () => {
		const f = fakeSink();
		emitStateWrite({ nodeId: "n1", word: "question", prevWord: "ready", note: "which branch?" }, f.sink);
		expect(f.events()).toEqual([
			{ v: 2, cmd: "agent.state", state: "question", detail: "which branch?", source: SRC },
			{ v: 2, cmd: "agent.event", kind: "interrupt", phase: "raised", id: "intr-n1", interrupt_kind: "question", detail: "which branch?", source: SRC },
		]);
	});

	it("blocked also maps to interrupt_kind question (R7 taxonomy)", () => {
		const f = fakeSink();
		emitStateWrite({ nodeId: "n2", word: "blocked", prevWord: "ready" }, f.sink);
		const ev = f.events();
		expect(ev[1]).toMatchObject({ kind: "interrupt", phase: "raised", interrupt_kind: "question", id: "intr-n2" });
	});

	it("leaving question/blocked → interrupt cleared (paired id)", () => {
		const f = fakeSink();
		emitStateWrite({ nodeId: "n1", word: "ready", prevWord: "question" }, f.sink);
		expect(f.events()).toEqual([
			{ v: 2, cmd: "agent.state", state: "ready", source: SRC },
			{ v: 2, cmd: "agent.event", kind: "interrupt", phase: "cleared", id: "intr-n1", source: SRC },
		]);
	});

	it("staying within question→blocked emits no raise and no clear", () => {
		const f = fakeSink();
		emitStateWrite({ nodeId: "n1", word: "blocked", prevWord: "question" }, f.sink);
		const kinds = f.events().map((e) => `${e.cmd}:${e.kind ?? e.state}`);
		expect(kinds).toEqual(["agent.state:blocked"]); // only the state word
	});

	it("done + refs → agent.state done + claim with evidence mapped from refs", () => {
		const f = fakeSink();
		emitStateWrite(
			{ nodeId: "n1", word: "done", prevWord: "ready", note: "s080 P4 done", refs: ["state:done", "sha:f66d1a9", "branch:feat/x", "selftest:A/t", "selftest:B/u", "file:x.md"] },
			f.sink,
		);
		expect(f.events()).toEqual([
			{ v: 2, cmd: "agent.state", state: "done", detail: "s080 P4 done", source: SRC },
			{ v: 2, cmd: "agent.event", kind: "claim", id: "claim-n1", claim: "s080 P4 done", evidence: { sha: "f66d1a9", branch: "feat/x", selftests: ["A/t", "B/u"], files: ["x.md"] }, source: SRC },
		]);
	});

	it("done with NO refs → claim with no evidence (UNCORROBORATED, honest)", () => {
		const f = fakeSink();
		emitStateWrite({ nodeId: "n1", word: "done" }, f.sink);
		const claim = f.events().find((e) => e.kind === "claim");
		expect(claim).toBeDefined();
		expect(claim).not.toHaveProperty("evidence");
	});

	it("liveness transition → agent.state working|idle, nothing else", () => {
		const f = fakeSink();
		emitLiveness({ nodeId: "n1", liveness: "idle" }, f.sink);
		expect(f.events()).toEqual([{ v: 2, cmd: "agent.state", state: "idle", source: SRC }]);
	});

	it("HONESTY: emits ONLY interrupt/claim/agent.state — never tool/turn/usage", () => {
		const f = fakeSink();
		for (const w of ["blocked", "question", "hold", "waiting", "ready", "failed", "cancelled", "done"] as const) {
			emitStateWrite({ nodeId: "n", word: w, prevWord: "ready" }, f.sink);
		}
		emitLiveness({ nodeId: "n", liveness: "working" }, f.sink);
		const bad = f.events().filter((e) => e.kind === "tool" || e.kind === "turn" || e.kind === "usage");
		expect(bad).toEqual([]);
	});

	it("clamps: detail ≤120, sha ≤40, ≤8 selftests, ≤32 files", () => {
		const long = "x".repeat(300);
		const many = Array.from({ length: 40 }, (_, i) => `file:f${i}`);
		const ev = evidenceFromRefs(["sha:" + "a".repeat(60), ...many, ...Array.from({ length: 12 }, (_, i) => `selftest:s${i}`)]);
		expect(ev?.sha?.length).toBe(40);
		expect(ev?.files?.length).toBe(32);
		expect(ev?.selftests?.length).toBe(8);
		const f = fakeSink();
		emitStateWrite({ nodeId: "n", word: "question", prevWord: "ready", note: long }, f.sink);
		expect((f.events()[0].detail as string).length).toBe(120);
	});

	it("tmux passthrough framing wraps the sequence", () => {
		const framed = oscFrame('{"x":1}', { tmux: true });
		expect(framed.startsWith("\x1bPtmux;\x1b\x1b]7337;")).toBe(true);
		expect(framed.endsWith("\x07\x1b\\")).toBe(true);
		expect(oscFrame('{"x":1}').startsWith("\x1b]7337;")).toBe(true);
	});
});
