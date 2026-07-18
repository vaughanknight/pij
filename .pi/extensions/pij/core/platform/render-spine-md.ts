// pij platform — pure spine → markdown render (plan 054 P4 T001, AC-10).
//
// The JSON spine's human face: one deterministic markdown document from a
// list of SpineEvents. PURE (peer-packet.ts precedent: sections[] → join) —
// no fs, no clock, no process; byte-stable for identical input, so the only
// thing that ever changes the output is the log itself. The kind vocabulary
// is OPEN (WS-5): unknown kinds render like any other, and additive fields
// an external writer put on a line are rendered honestly (JSON-encoded),
// never silently dropped — the render is a VIEW of the log, not a filter.
// Project events (project-created/project-set) render their prev/next record
// blobs FIELD-LEVEL when they parse as JSON objects (s057 dogfood); anything
// that does not parse keeps the raw lines — compressed view, never a drop.
// Writing the result to `~/.pij/spine/spine.md` is the bin's job (the port
// has no markdown-write method by design).

import {
	SPINE_KIND_PROJECT_CREATED,
	SPINE_KIND_PROJECT_SET,
	type SpineEvent,
} from "./types.js";

/** Render options — reserved so the signature stays stable as the document
 *  grows (peer-packet RenderPacketOptions precedent). */
export interface RenderSpineMdOptions {
	/** Document H1; defaults to `pij spine`. */
	readonly title?: string;
}

/** Envelope + record keys the renderer formats explicitly; anything else on
 *  a line is an external writer's additive field, rendered under its own key. */
const KNOWN_KEYS = new Set([
	"schema_version",
	"seq",
	"ts",
	"actor",
	"kind",
	"refs",
	"prev",
	"next",
	"verifiedBy",
	"actorProvenance",
	"peer",
	"project",
	"repo",
]);

/** Parse a prev/next blob to a plain object, or null (absent / invalid JSON /
 *  non-object) — null sends the caller down the raw-line fallback. */
function parseRecord(raw: string | undefined): Record<string, unknown> | null {
	if (raw === undefined) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// fall through to null — honesty via the raw fallback, never a drop.
	}
	return null;
}

/** Field-level view of a project event's prev/next record blobs (s057
 *  dogfood: the canonical JSON is the log's face, not a human's). Sorted
 *  keys keep the render byte-stable. Null → the caller falls back to the
 *  raw `- prev:`/`- next:` lines (WS-5: rendered, never dropped). */
function projectRecordLines(event: SpineEvent): string[] | null {
	if (event.kind === SPINE_KIND_PROJECT_CREATED) {
		// Creation carries next only by contract; a prev here is an external
		// writer's shape — render it raw rather than guess.
		if (event.prev !== undefined) return null;
		const next = parseRecord(event.next);
		if (next === null) return null;
		return Object.keys(next)
			.sort()
			.map((key) => `- ${key}: ${JSON.stringify(next[key])}`);
	}
	const prev = parseRecord(event.prev);
	const next = parseRecord(event.next);
	if (prev === null || next === null) return null;
	const keys = [...new Set([...Object.keys(prev), ...Object.keys(next)])].sort();
	const lines: string[] = [];
	for (const key of keys) {
		const before = Object.hasOwn(prev, key) ? JSON.stringify(prev[key]) : "∅";
		const after = Object.hasOwn(next, key) ? JSON.stringify(next[key]) : "∅";
		if (before === after) continue;
		lines.push(`- ${key}: ${before} → ${after}`);
	}
	// The legal no-op set (prev === next couples deliberately): compressed in
	// the human view; the audited blobs stay intact in events.ndjson.
	return lines.length === 0 ? ["- (no field changes)"] : lines;
}

function renderEvent(event: SpineEvent): string {
	const lines: string[] = [`### ${event.seq} · ${event.kind}`, ""];
	lines.push(`- ts: ${event.ts}`);
	const provenance = event.actorProvenance === undefined ? "" : ` (${event.actorProvenance})`;
	lines.push(`- actor: ${event.actor}${provenance}`);
	if (event.peer !== undefined) lines.push(`- peer: ${event.peer}`);
	if (event.project !== undefined) lines.push(`- project: ${event.project}`);
	if (event.repo !== undefined) lines.push(`- repo: ${event.repo}`);
	// Project events carry whole canonical record blobs as prev/next — render
	// them field-level when they parse; anything else keeps the raw lines.
	const fieldLines =
		event.kind === SPINE_KIND_PROJECT_CREATED || event.kind === SPINE_KIND_PROJECT_SET
			? projectRecordLines(event)
			: null;
	if (fieldLines !== null) {
		lines.push(...fieldLines);
	} else {
		if (event.prev !== undefined) lines.push(`- prev: ${event.prev}`);
		if (event.next !== undefined) lines.push(`- next: ${event.next}`);
	}
	if (event.refs.length > 0) lines.push(`- refs: ${event.refs.join(", ")}`);
	if (event.verifiedBy !== undefined) lines.push(`- verifiedBy: ${event.verifiedBy}`);
	// Additive fields: sorted for determinism, JSON-encoded for honesty.
	const record = event as unknown as Record<string, unknown>;
	const extras = Object.keys(record)
		.filter((k) => !KNOWN_KEYS.has(k))
		.sort();
	for (const key of extras) {
		lines.push(`- ${key}: ${JSON.stringify(record[key])}`);
	}
	return lines.join("\n");
}

/** Render the whole spine as one markdown document. Events render in the
 *  order given (log/append order); the input is never mutated. */
export function renderSpineMd(
	events: readonly SpineEvent[],
	opts: RenderSpineMdOptions = {},
): string {
	const sections: string[] = [`# ${opts.title ?? "pij spine"}`];
	sections.push(
		"Machine-generated from `spine/events.ndjson` — do not hand-edit. " +
			"Regenerate with `pij spine render`.",
	);
	const first = events[0];
	const last = events[events.length - 1];
	if (first === undefined || last === undefined) {
		sections.push("_No events._");
		return `${sections.join("\n\n")}\n`;
	}
	const noun = events.length === 1 ? "event" : "events";
	sections.push(`${events.length} ${noun} · seq ${first.seq}–${last.seq}`);
	sections.push("## Events");
	for (const event of events) sections.push(renderEvent(event));
	return `${sections.join("\n\n")}\n`;
}
