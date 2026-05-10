// scratch — pi-free data layer (Pattern P2).
//
// Imports nothing from @earendil-works/*. Pure logic over plain data.
// Tests run against this in plain Node — no pi runtime, no TUI.

// ─── entry tags (Pattern P5: live with the data they tag) ────────────────
export const ENTRY_NOTE = "scratch:note";
export const ENTRY_DELETE = "scratch:delete";
export const ENTRY_CLEAR = "scratch:clear";

// ─── limits ──────────────────────────────────────────────────────────────
export const MAX_NOTE_BYTES = 2048;
export const MAX_LIST_BYTES = 8192;
export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;

// ─── domain ──────────────────────────────────────────────────────────────
export interface Note {
	id: string;
	content: string;
	tag?: string;
	createdAt: number;
}

// Pattern P6: structural entry type at the boundary. Pi's SessionEntry
// assigns to this without a cast (TS structural typing).
export interface ReplayableEntry {
	readonly type: string;
	readonly customType?: string;
	readonly data?: unknown;
}

// Pattern P3: side effect injected via constructor.
export type AppendFn = (customType: string, data: unknown) => void;

// Pattern P4: tagged-union returns over throws.
type AddResult = { ok: true; note: Note } | { ok: false; reason: "too_long" };
type DeleteResult = { ok: true; note: Note } | { ok: false; reason: "out_of_range" };

export function newId(now: number = Date.now(), random: () => number = Math.random): string {
	return `${now.toString(36)}-${random().toString(36).slice(2, 8)}`;
}

export class ScratchStore {
	private notes: Note[] = [];

	constructor(private readonly append: AppendFn) {}

	// Pattern P6 guards — narrow `unknown` data structurally rather than
	// asserting it. Malformed replay entries are silently ignored.
	private isNoteData(data: unknown): data is Note {
		return (
			typeof data === "object" &&
			data !== null &&
			typeof (data as { id?: unknown }).id === "string" &&
			typeof (data as { content?: unknown }).content === "string" &&
			typeof (data as { createdAt?: unknown }).createdAt === "number"
		);
	}

	private isDeleteData(data: unknown): data is { id: string } {
		return (
			typeof data === "object" && data !== null && typeof (data as { id?: unknown }).id === "string"
		);
	}

	private isClearData(data: unknown): data is { at: number } {
		return (
			typeof data === "object" && data !== null && typeof (data as { at?: unknown }).at === "number"
		);
	}

	rehydrate(entries: Iterable<ReplayableEntry>): void {
		this.notes = [];
		for (const entry of entries) {
			if (entry.type !== "custom") continue;
			switch (entry.customType) {
				case ENTRY_CLEAR:
					if (this.isClearData(entry.data)) this.notes = [];
					break;
				case ENTRY_NOTE:
					if (this.isNoteData(entry.data)) this.notes.push(entry.data);
					break;
				case ENTRY_DELETE: {
					if (!this.isDeleteData(entry.data)) break;
					const { id } = entry.data;
					this.notes = this.notes.filter((n) => n.id !== id);
					break;
				}
			}
		}
	}

	count(): number {
		return this.notes.length;
	}

	list(opts?: { tag?: string; limit?: number }): Note[] {
		const limit = Math.min(Math.max(opts?.limit ?? DEFAULT_LIST_LIMIT, 0), MAX_LIST_LIMIT);
		// JS quirk: view.slice(-0) returns the whole array (since -0 === 0),
		// so a literal 0 limit must short-circuit. Workshop 003 § Edge cases
		// promises limit<1 → "(no notes)"; this is the guard that makes good
		// on that promise.
		if (limit === 0) return [];
		let view = this.notes;
		if (opts?.tag) view = view.filter((n) => n.tag === opts.tag);
		return view.slice(-limit);
	}

	// Pattern P9: persist BEFORE updating memory. A crash between the two
	// leaves us consistent (replay finds the note); the other order would
	// show a phantom note that vanishes on /reload.
	add(content: string, tag?: string): AddResult {
		if (content.length > MAX_NOTE_BYTES) {
			return { ok: false, reason: "too_long" };
		}
		const note: Note = { id: newId(), content, tag, createdAt: Date.now() };
		this.append(ENTRY_NOTE, note);
		this.notes.push(note);
		return { ok: true, note };
	}

	deleteAt(index1Based: number): DeleteResult {
		const idx = index1Based - 1;
		if (idx < 0 || idx >= this.notes.length) {
			return { ok: false, reason: "out_of_range" };
		}
		const note = this.notes[idx];
		if (!note) return { ok: false, reason: "out_of_range" };
		this.append(ENTRY_DELETE, { id: note.id });
		this.notes.splice(idx, 1);
		return { ok: true, note };
	}

	clear(): number {
		const count = this.notes.length;
		this.append(ENTRY_CLEAR, { at: Date.now() });
		this.notes = [];
		return count;
	}

	// Render the list as numbered text, capped at MAX_LIST_BYTES.
	format(opts?: { tag?: string; limit?: number }): string {
		const view = this.list(opts);
		if (view.length === 0) return "(no notes)";

		const lines: string[] = [];
		let total = 0;
		for (let i = view.length - 1; i >= 0; i--) {
			const n = view[i];
			if (!n) continue;
			const tag = n.tag ? ` [${n.tag}]` : "";
			const line = `${i + 1}.${tag} ${n.content}`;
			if (total + line.length > MAX_LIST_BYTES) break;
			total += line.length;
			lines.unshift(line);
		}
		if (lines.length < view.length) {
			lines.unshift(
				`(showing ${lines.length} of ${view.length} — output capped at ${MAX_LIST_BYTES} bytes)`,
			);
		}
		return lines.join("\n");
	}
}
