import type { PijMessage } from "./types.js";

export const HOLD_TICK_MS = 1_000;

export interface HeldRow {
	readonly jobId: number;
	readonly message: PijMessage & { readonly messageId: string; readonly urgent?: boolean };
}

/** Volatile notes only, never ownership. The daemon's pending queue owns durability and release order. */
export class HoldQueue {
	private lastEditAt: number;
	private readonly rows = new Map<string, HeldRow>();

	constructor(
		clock: () => number,
		private readonly graceMs: number,
	) {
		// No observed edit starts outside the grace, including clocks starting at zero.
		this.lastEditAt = clock() - graceMs;
	}

	noteEdit(at: number): void {
		this.lastEditAt = at;
	}

	shouldHold(at: number): boolean {
		return at - this.lastEditAt < this.graceMs;
	}

	push(row: HeldRow): void {
		if (!this.rows.has(row.message.messageId)) this.rows.set(row.message.messageId, row);
	}

	drain(at: number): HeldRow[] {
		if (this.shouldHold(at) || this.rows.size === 0) return [];
		const ready = [...this.rows.values()];
		this.rows.clear();
		return ready;
	}

	size(): number {
		return this.rows.size;
	}
}
