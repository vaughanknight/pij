import { Buffer } from "node:buffer";

export const BUSY_WINDOW_MS = 1_000;
export const BUSY_BYTE_THRESHOLD = 256;
export const BUSY_IDLE_AFTER_MS = 1_500;
export const USER_TYPING_IDLE_MS = 60_000;

export interface PaneListing {
	readonly paneId: string;
	readonly dead: boolean;
	readonly cursorX?: number;
	readonly cursorY?: number;
}

export interface PaneSetDiff {
	readonly added: readonly PaneListing[];
	readonly retired: readonly string[];
}

export interface CaretPosition {
	readonly row: number;
	readonly column: number;
}

export type TypingEvent =
	| { readonly kind: "key"; readonly composerLength: number }
	| { readonly kind: "enter"; readonly composerLength: 0 }
	| { readonly kind: "idle-release"; readonly composerLength: 0 };

export interface PaneSignalSnapshot {
	readonly paneId: string;
	readonly busy: boolean;
	readonly userTyping: boolean;
	readonly composerLength: number;
	readonly lastByteAt?: number;
	readonly lastKeyAt?: number;
}

interface ByteSample {
	readonly atMs: number;
	readonly bytes: number;
}

/** Pure id-set diff. Dead panes are retired even if tmux still lists them. */
export function diffPaneListings(
	previousPaneIds: ReadonlySet<string>,
	current: readonly PaneListing[],
): PaneSetDiff {
	const live = current.filter((pane) => !pane.dead);
	const liveIds = new Set(live.map((pane) => pane.paneId));
	return {
		added: live.filter((pane) => !previousPaneIds.has(pane.paneId)),
		retired: [...previousPaneIds].filter((paneId) => !liveIds.has(paneId)),
	};
}

/** Cursor reports emitted by TUIs while redrawing. The final report in a burst
 * is the live composer caret; retaining every report also lets tests prove the
 * ordered key progression in recorded bursts. */
export function parseCaretPositions(bytes: Uint8Array): CaretPosition[] {
	const text = Buffer.from(bytes).toString("latin1");
	const positions: CaretPosition[] = [];
	const cursor = new RegExp(`${String.fromCharCode(27)}\\[(\\d+);(\\d+)[Hf]`, "g");
	for (const match of text.matchAll(cursor)) {
		const row = Number(match[1]);
		const column = Number(match[2]);
		if (Number.isInteger(row) && Number.isInteger(column)) positions.push({ row, column });
	}
	return positions;
}

export class BusyDensityTracker {
	private readonly samples: ByteSample[] = [];
	private busy = false;
	private lastByteAt: number | undefined;

	ingest(byteCount: number, nowMs: number): boolean {
		if (byteCount > 0) {
			this.samples.push({ atMs: nowMs, bytes: byteCount });
			this.lastByteAt = nowMs;
		}
		return this.current(nowMs);
	}

	current(nowMs: number): boolean {
		const cutoff = nowMs - BUSY_WINDOW_MS;
		while ((this.samples[0]?.atMs ?? Number.POSITIVE_INFINITY) < cutoff) this.samples.shift();
		const bytesInWindow = this.samples.reduce((total, sample) => total + sample.bytes, 0);
		if (bytesInWindow >= BUSY_BYTE_THRESHOLD) this.busy = true;
		if (
			this.busy &&
			this.lastByteAt !== undefined &&
			nowMs - this.lastByteAt >= BUSY_IDLE_AFTER_MS
		) {
			this.busy = false;
		}
		return this.busy;
	}

	lastActivityAt(): number | undefined {
		return this.lastByteAt;
	}
}

export class CaretTypingTracker {
	private base: CaretPosition | undefined;
	private composerLength = 0;
	private lastKeyAt: number | undefined;

	seedBase(position: CaretPosition): void {
		if (this.composerLength === 0) this.base = position;
	}

	ingest(bytes: Uint8Array, nowMs: number, allowAcquire: boolean): TypingEvent[] {
		const events: TypingEvent[] = [];
		for (const position of parseCaretPositions(bytes)) {
			if (this.base === undefined) {
				this.base = position;
				continue;
			}
			if (position.row !== this.base.row) continue;
			const nextLength = Math.max(0, position.column - this.base.column);
			if (nextLength === 0 && this.composerLength > 0) {
				this.composerLength = 0;
				this.lastKeyAt = undefined;
				events.push({ kind: "enter", composerLength: 0 });
				continue;
			}
			if (!allowAcquire || nextLength === this.composerLength || nextLength === 0) continue;
			this.composerLength = nextLength;
			this.lastKeyAt = nowMs;
			events.push({ kind: "key", composerLength: nextLength });
		}
		return events;
	}

	expire(nowMs: number): TypingEvent | undefined {
		if (
			this.composerLength === 0 ||
			this.lastKeyAt === undefined ||
			nowMs - this.lastKeyAt < USER_TYPING_IDLE_MS
		) {
			return undefined;
		}
		this.composerLength = 0;
		this.lastKeyAt = undefined;
		return { kind: "idle-release", composerLength: 0 };
	}

	isTyping(): boolean {
		return this.composerLength > 0;
	}

	length(): number {
		return this.composerLength;
	}

	lastKeystrokeAt(): number | undefined {
		return this.lastKeyAt;
	}
}

interface PaneState {
	readonly busy: BusyDensityTracker;
	readonly typing: CaretTypingTracker;
}

/** In-memory, read-only pane signal index. It owns no I/O: the daemon feeds it
 * list-panes snapshots and bytes drained from the adapter's one tap per pane. */
export class PaneSignalMonitor {
	private readonly panes = new Map<string, PaneState>();

	reconcile(listings: readonly PaneListing[]): PaneSetDiff {
		const diff = diffPaneListings(new Set(this.panes.keys()), listings);
		for (const paneId of diff.retired) this.panes.delete(paneId);
		for (const pane of listings) {
			if (pane.dead) continue;
			let state = this.panes.get(pane.paneId);
			if (!state) {
				state = {
					busy: new BusyDensityTracker(),
					typing: new CaretTypingTracker(),
				};
				if (pane.cursorX !== undefined && pane.cursorY !== undefined) {
					state.typing.seedBase({ row: pane.cursorY + 1, column: pane.cursorX + 1 });
				}
			}
			this.panes.set(pane.paneId, state);
		}
		return diff;
	}

	ingest(paneId: string, bytes: Uint8Array, nowMs: number): readonly TypingEvent[] {
		const state = this.panes.get(paneId);
		if (!state) return [];
		const busy = state.busy.ingest(bytes.byteLength, nowMs);
		return state.typing.ingest(bytes, nowMs, !busy);
	}

	tick(nowMs: number): readonly string[] {
		const released: string[] = [];
		for (const [paneId, state] of this.panes) {
			state.busy.current(nowMs);
			if (state.typing.expire(nowMs)) released.push(paneId);
		}
		return released;
	}

	snapshot(paneId: string, nowMs: number): PaneSignalSnapshot | undefined {
		const state = this.panes.get(paneId);
		if (!state) return undefined;
		return {
			paneId,
			busy: state.busy.current(nowMs),
			userTyping: state.typing.isTyping(),
			composerLength: state.typing.length(),
			lastByteAt: state.busy.lastActivityAt(),
			lastKeyAt: state.typing.lastKeystrokeAt(),
		};
	}

	paneIds(): readonly string[] {
		return [...this.panes.keys()];
	}
}
