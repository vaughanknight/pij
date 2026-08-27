// pij → OSC 7337 Delegation Ledger emitter (Producer B — PROPOSAL, plan 080).
//
// Contract: trex-streams `shared-assets/protocol/delegation-ledger.md`. pij is
// the SECOND independent producer: it mirrors ITS OWN semantic-state writes and
// node liveness onto the owning pane's tty, so a trex terminal governing that
// pane decodes them through the same shipped chain the conformance fixture
// drives — no pij-specific parsing anywhere in trex.
//
// HONESTY RULE (spec): pij emits ONLY what it knows — semantic states, the
// interrupts/claims those imply, and liveness. It never sees a session's
// tool/turn/usage internals, so it emits none of them. The word set is imported
// verbatim from pij's own SEMANTIC_STATES (L5 — one source, no synonym minted).
//
// This module is pure + sink-injected: the FAKE sink drives the in-branch
// tests; the real `paneTtySink` writes onto a pane in production. It is wired at
// pij's single state-write choke point (see PROPOSAL.md) — NOT merged.

import { SEMANTIC_STATES, type SemanticState } from "../core/types.js";

/** A sink receives already-framed OSC 7337 bytes and puts them on a wire. */
export type Sink = (bytes: string) => void;

/** One semantic-state write pij just persisted, normalized for the emitter. */
export interface StateWrite {
	readonly nodeId: string;
	readonly word: SemanticState;
	readonly prevWord?: SemanticState;
	readonly note?: string; // stateNote → detail / claim text
	readonly refs?: readonly string[]; // structured refs: "sha:…","branch:…","selftest:…","file:…"
}

/** A node liveness transition (working ⇆ idle). */
export interface LivenessTransition {
	readonly nodeId: string;
	readonly liveness: "working" | "idle";
}

export interface EvidenceRefs {
	sha?: string;
	branch?: string;
	selftests?: string[];
	files?: string[];
}

const SOURCE = "pij";
const isQuestionish = (w?: string): boolean => w === "question" || w === "blocked";
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);

/** Frame a payload as OSC 7337 (BEL-terminated); tmux-passthrough aware. */
export function oscFrame(payload: string, opts?: { tmux?: boolean }): string {
	const seq = `\x1b]7337;${payload}\x07`;
	// tmux passthrough: \ePtmux;\e<seq, every ESC doubled>\e\\ — our seq has one ESC.
	return opts?.tmux ? `\x1bPtmux;${seq.replace(/\x1b/g, "\x1b\x1b")}\x1b\\` : seq;
}

/** Parse pij's structured refs into a spec evidence object (undefined if none). */
export function evidenceFromRefs(refs?: readonly string[]): EvidenceRefs | undefined {
	if (!refs || refs.length === 0) return undefined;
	const ev: EvidenceRefs = {};
	for (const ref of refs) {
		const i = ref.indexOf(":");
		if (i < 0) continue;
		const key = ref.slice(0, i);
		const val = ref.slice(i + 1);
		if (!val) continue;
		if (key === "sha") ev.sha = clip(val, 40);
		else if (key === "branch") ev.branch = clip(val, 80);
		else if (key === "selftest") (ev.selftests ??= []).push(clip(val, 120));
		else if (key === "file") (ev.files ??= []).push(clip(val, 200));
	}
	if (ev.selftests && ev.selftests.length > 8) ev.selftests = ev.selftests.slice(0, 8);
	if (ev.files && ev.files.length > 32) ev.files = ev.files.slice(0, 32);
	return Object.keys(ev).length ? ev : undefined;
}

function stateEvent(state: string, detail: string | undefined): string {
	const o: Record<string, unknown> = { v: 2, cmd: "agent.state", state };
	if (detail) o.detail = clip(detail, 120);
	o.source = SOURCE;
	return JSON.stringify(o);
}

function interruptEvent(
	phase: "raised" | "cleared",
	id: string,
	kind?: string,
	detail?: string,
): string {
	const o: Record<string, unknown> = { v: 2, cmd: "agent.event", kind: "interrupt", phase, id };
	if (kind) o.interrupt_kind = kind;
	if (detail) o.detail = clip(detail, 120);
	o.source = SOURCE;
	return JSON.stringify(o);
}

function claimEvent(id: string, claim: string, evidence?: EvidenceRefs): string {
	const o: Record<string, unknown> = {
		v: 2,
		cmd: "agent.event",
		kind: "claim",
		id,
		claim: clip(claim, 120),
	};
	if (evidence) o.evidence = evidence;
	o.source = SOURCE;
	return JSON.stringify(o);
}

/**
 * Mirror one semantic-state write onto the wire (spec § Producer maps, B):
 *  - ALWAYS  → `agent.state <word>`  (the semantic eight ride D7)
 *  - entering question/blocked → `interrupt raised` (interrupt_kind: question)
 *  - leaving  question/blocked → `interrupt cleared`
 *  - word `done` (+refs)       → `claim` (evidence mapped from the refs)
 * One open question-interrupt per node → id `intr-<node>` pairs raise↔clear.
 */
export function emitStateWrite(w: StateWrite, sink: Sink, opts?: { tmux?: boolean }): void {
	if (!(SEMANTIC_STATES as readonly string[]).includes(w.word)) return; // honesty: only ruled words
	const frame = (p: string): void => sink(oscFrame(p, opts));

	frame(stateEvent(w.word, w.note));

	if (isQuestionish(w.word) && !isQuestionish(w.prevWord)) {
		frame(interruptEvent("raised", `intr-${w.nodeId}`, "question", w.note));
	} else if (!isQuestionish(w.word) && isQuestionish(w.prevWord)) {
		frame(interruptEvent("cleared", `intr-${w.nodeId}`));
	}

	if (w.word === "done") {
		frame(claimEvent(`claim-${w.nodeId}`, w.note ?? `${w.nodeId} done`, evidenceFromRefs(w.refs)));
	}
}

/** Mirror a node liveness transition → `agent.state working|idle`. */
export function emitLiveness(t: LivenessTransition, sink: Sink, opts?: { tmux?: boolean }): void {
	sink(oscFrame(stateEvent(t.liveness, undefined), opts));
}

/**
 * Production sink: write framed bytes onto a pane's tty. `writeBytes` is
 * injected (in pij, the tmux adapter resolves `#{pane_tty}` and appends) so this
 * module stays fs-free and unit-testable. The choke-point caller sets tmux:true
 * when the pane runs under tmux (allow-passthrough required).
 */
export function paneTtySink(writeBytes: (bytes: string) => void): Sink {
	return (bytes: string): void => writeBytes(bytes);
}
