// pij-telegram — message chunker (Plan Finding 07; AC-05).
//
// Telegram rejects any message longer than 4096 characters. When a relayed body
// exceeds the limit we split it into numbered parts (`(i/n) <slice>`); the prefix
// itself counts against the cap, so each emitted part — prefix included — stays at
// or under `limit` (default 4000, comfortably below Telegram's 4096 hard cap).

/** Length of the `(i/n) ` prefix for a given part count. */
function prefixWidth(n: number): number {
	return `(${n}/${n}) `.length;
}

/**
 * Split `text` greedily into slices no longer than `budget`, preferring a newline
 * (then a space) boundary in the back portion of the window so we break between
 * lines/words rather than mid-token when reasonable. Always contiguous — the slices
 * concatenate back to the original text exactly.
 */
function splitOnBoundary(text: string, budget: number): string[] {
	const parts: string[] = [];
	let rest = text;
	const floor = Math.max(1, Math.floor(budget * 0.6));
	while (rest.length > budget) {
		const window = rest.slice(0, budget);
		const nl = window.lastIndexOf("\n");
		const sp = window.lastIndexOf(" ");
		// Prefer a newline boundary; else a space; only if it lands in the back 40%
		// of the window (otherwise we'd waste too much of the budget). Either way the
		// boundary char stays with the leading part, so the slices are exactly contiguous
		// and concatenate back to the original text with no characters lost (AC-05).
		let cut = budget;
		if (nl >= floor)
			cut = nl + 1; // keep the newline with the leading part
		else if (sp >= floor) cut = sp + 1; // keep the space with the leading part
		parts.push(rest.slice(0, cut));
		rest = rest.slice(cut);
	}
	parts.push(rest);
	return parts;
}

/**
 * Chunk `text` for Telegram delivery.
 *
 * @param text  the message body
 * @param limit max length of any single emitted part, prefix included (default 4000)
 * @returns one part (unprefixed) when `text` fits; otherwise `(i/n) `-prefixed parts
 */
export function chunk(text: string, limit = 4000): string[] {
	if (text.length <= limit) return [text];

	// The prefix width depends on the part count, which depends on the budget, which
	// depends on the prefix width. Converge: each pass can only grow n (more digits →
	// wider prefix → smaller budget → more parts), and digit growth is logarithmic, so
	// this stabilizes in a couple of passes. The cap is a safety bound, never reached
	// for realistic sizes.
	// `budget` is clamped to ≥1 so a pathologically small `limit` (smaller than the
	// prefix itself) still terminates — parts become 1 char each rather than looping
	// forever. Telegram's real 4096 cap never triggers this.
	let width = prefixWidth(1);
	let parts = splitOnBoundary(text, Math.max(1, limit - width));
	for (let pass = 0; pass < 8; pass++) {
		const next = prefixWidth(parts.length);
		if (next === width) break;
		width = next;
		parts = splitOnBoundary(text, Math.max(1, limit - width));
	}

	const n = parts.length;
	return parts.map((p, i) => `(${i + 1}/${n}) ${p}`);
}
