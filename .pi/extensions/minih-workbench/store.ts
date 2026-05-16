// MinihWorkbenchStore — pi-free data layer (Pattern P2).
//
// Imports nothing from @earendil-works/*. Pure logic over plain data.
// Tests run against this in plain Node — no pi runtime, no TUI.

// ─── entry tags ──────────────────────────────────────────────────────────
export const ENTRY_PREFIX = "minih-workbench:";
export const ENTRY_ITEM = `${ENTRY_PREFIX}item`;
export const ENTRY_DELETE = `${ENTRY_PREFIX}delete`;
export const ENTRY_CLEAR = `${ENTRY_PREFIX}clear`;

// ─── limits (Pattern P5: live with the data they constrain) ──────────────
export const MAX_ITEM_BYTES = 2048;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

// ─── domain ──────────────────────────────────────────────────────────────
export interface Item {
	id: string;
	// TODO: add fields
	createdAt: number;
}

// Pattern P6: structural entry type at the boundary.
export interface ReplayableEntry {
	readonly type: string;
	readonly customType?: string;
	readonly data?: unknown;
}

// Pattern P3: side effect injected via constructor.
export type AppendFn = (customType: string, data: unknown) => void;

// Pattern P4: tagged-union returns over throws.
type AddResult = { ok: true; item: Item } | { ok: false; reason: "too_long" };

export function newId(now: number = Date.now(), random: () => number = Math.random): string {
	return `${now.toString(36)}-${random().toString(36).slice(2, 8)}`;
}

export class MinihWorkbenchStore {
	private items: Item[] = [];

	constructor(private readonly append: AppendFn) {}

	// Pattern P7 guards — narrow `unknown` data structurally instead of
	// asserting it. Malformed replay entries are silently ignored.
	private isItemData(data: unknown): data is Item {
		return (
			typeof data === "object" &&
			data !== null &&
			typeof (data as { id?: unknown }).id === "string" &&
			typeof (data as { createdAt?: unknown }).createdAt === "number"
		);
	}

	private isDeleteData(data: unknown): data is { id: string } {
		return (
			typeof data === "object" && data !== null && typeof (data as { id?: unknown }).id === "string"
		);
	}

	rehydrate(entries: Iterable<ReplayableEntry>): void {
		this.items = [];
		for (const entry of entries) {
			if (entry.type !== "custom") continue;
			switch (entry.customType) {
				case ENTRY_CLEAR:
					this.items = [];
					break;
				case ENTRY_ITEM:
					if (this.isItemData(entry.data)) this.items.push(entry.data);
					break;
				case ENTRY_DELETE: {
					if (!this.isDeleteData(entry.data)) break;
					const { id } = entry.data;
					this.items = this.items.filter((n) => n.id !== id);
					break;
				}
			}
		}
	}

	count(): number {
		return this.items.length;
	}

	// Pattern P9: persist BEFORE updating memory.
	add(): AddResult {
		// TODO
		const item: Item = { id: newId(), createdAt: Date.now() };
		this.append(ENTRY_ITEM, item);
		this.items.push(item);
		return { ok: true, item };
	}
}
