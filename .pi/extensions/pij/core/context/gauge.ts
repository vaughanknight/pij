// pij-control-plane — context-gauge pure logic + port (plan 054 P2 T007).
//
// AC-09's honest-gauge law lives here: a contextCurrent reading is a REAL
// number parsed from a harness's own artifacts, or null — never an estimate,
// never a heuristic. The fs/process side (which file to read, per harness)
// is the adapters/context-reader.ts seam; this module parses already-read
// text and joins registry capacities. Purity sensor: fs-free, process-free
// (enforced by core/platform/boundary.test.ts since P3 T006).
//
// Source shapes (captured from live files 2026-07-17):
//  • claude transcript line: {message: {usage: {input_tokens,
//    cache_creation_input_tokens, cache_read_input_tokens, output_tokens}}}
//    — the LAST usage block is the current context occupancy.
//  • codex rollout line: {type: "event_msg", payload: {type: "token_count",
//    info: {total_token_usage, last_token_usage, model_context_window}}}.
//    total_token_usage is CUMULATIVE across turns (a real rollout showed 72M
//    against a 258k window) — a gauge from it would lie, so the reading is
//    last_token_usage.input_tokens + output_tokens of the newest line whose
//    last usage is non-zero (a zero tail is a post-compaction/idle echo).
//  • pi events.ndjson line: {type: "message", data: {message: {role:
//    "assistant", usage: {input, output, cacheRead, cacheWrite,
//    totalTokens}}}} — the LAST assistant usage's totalTokens.

import type { ModelEntry } from "../models/registry.js";
import type { ContextGauge, SessionDescriptor } from "../types.js";

/** Read one node's current context usage — a real reading or an honest
 *  unknown, provenance always naming the source (attempted). The bin wires
 *  adapters/context-reader.ts; tests use fakes. */
export interface ContextReaderPort {
	current(descriptor: SessionDescriptor): ContextGauge;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteOrZero(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseLines(text: string): Record<string, unknown>[] {
	const out: Record<string, unknown>[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "") continue;
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (isRecord(parsed)) out.push(parsed);
		} catch {
			// tolerate torn/noise lines — a transcript mid-write is normal
		}
	}
	return out;
}

/** Current claude context occupancy: the LAST `message.usage` block's four
 *  token components summed. Null when no usage block exists. */
export function claudeContextFromTranscript(jsonlText: string): number | null {
	let reading: number | null = null;
	for (const line of parseLines(jsonlText)) {
		const message = line.message;
		if (!isRecord(message)) continue;
		const usage = message.usage;
		if (!isRecord(usage)) continue;
		reading =
			finiteOrZero(usage.input_tokens) +
			finiteOrZero(usage.cache_creation_input_tokens) +
			finiteOrZero(usage.cache_read_input_tokens) +
			finiteOrZero(usage.output_tokens);
	}
	return reading;
}

/** Current codex context occupancy from a rollout: the newest token_count
 *  line's `last_token_usage` (input+output) — NEVER the cumulative
 *  total_token_usage. Zero-usage tails are skipped (post-compaction echoes).
 *  Null when nothing usable. The rollout's `model_context_window` is
 *  deliberately NOT read (P3 T006c, p2-review-001 note 3): contextMax comes
 *  from the models.json join (AC-09), and a second self-reported max would
 *  need its own precedence ruling before it could honestly be wired. */
export function codexContextFromRollout(jsonlText: string): number | null {
	let reading: number | null = null;
	for (const line of parseLines(jsonlText)) {
		const payload = line.payload;
		if (!isRecord(payload) || payload.type !== "token_count") continue;
		const info = payload.info;
		if (!isRecord(info)) continue;
		const last = info.last_token_usage;
		if (!isRecord(last)) continue;
		const used = finiteOrZero(last.input_tokens) + finiteOrZero(last.output_tokens);
		if (used <= 0) continue;
		reading = used;
	}
	return reading;
}

/** Current pi context occupancy from the node's own events.ndjson: the LAST
 *  assistant usage's `totalTokens` (or the component sum when absent). */
export function piContextFromEvents(ndjsonText: string): number | null {
	let reading: number | null = null;
	for (const line of parseLines(ndjsonText)) {
		const data = line.data;
		if (!isRecord(data)) continue;
		const message = data.message;
		if (!isRecord(message) || message.role !== "assistant") continue;
		const usage = message.usage;
		if (!isRecord(usage)) continue;
		const total = usage.totalTokens;
		reading =
			typeof total === "number" && Number.isFinite(total)
				? total
				: finiteOrZero(usage.input) +
					finiteOrZero(usage.output) +
					finiteOrZero(usage.cacheRead) +
					finiteOrZero(usage.cacheWrite);
	}
	return reading;
}

/** contextMax via the boundModel → models-registry join (exact id). Honest
 *  absence when the model is unset, unknown, or carries no window. */
export function contextMaxFor(
	boundModel: string | undefined,
	models: readonly ModelEntry[],
): number | undefined {
	if (boundModel === undefined) return undefined;
	for (const model of models) {
		if (model.id === boundModel && model.contextWindow !== undefined) return model.contextWindow;
	}
	return undefined;
}
