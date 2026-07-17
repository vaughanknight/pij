// pij platform — pure spine → markdown render (plan 054 P4 T001, AC-10).
//
// The JSON spine's human face: one deterministic markdown document from a
// list of SpineEvents. PURE (peer-packet.ts precedent: sections[] → join) —
// no fs, no clock, no process; byte-stable for identical input, so the only
// thing that ever changes the output is the log itself. The kind vocabulary
// is OPEN (WS-5): unknown kinds render like any other, and additive fields
// an external writer put on a line are rendered honestly (JSON-encoded),
// never silently dropped — the render is a VIEW of the log, not a filter.
// Writing the result to `~/.pij/spine/spine.md` is the bin's job (the port
// has no markdown-write method by design).

import type { SpineEvent } from "./types.js";

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

function renderEvent(event: SpineEvent): string {
	const lines: string[] = [`### ${event.seq} · ${event.kind}`, ""];
	lines.push(`- ts: ${event.ts}`);
	const provenance = event.actorProvenance === undefined ? "" : ` (${event.actorProvenance})`;
	lines.push(`- actor: ${event.actor}${provenance}`);
	if (event.peer !== undefined) lines.push(`- peer: ${event.peer}`);
	if (event.project !== undefined) lines.push(`- project: ${event.project}`);
	if (event.repo !== undefined) lines.push(`- repo: ${event.repo}`);
	if (event.prev !== undefined) lines.push(`- prev: ${event.prev}`);
	if (event.next !== undefined) lines.push(`- next: ${event.next}`);
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
