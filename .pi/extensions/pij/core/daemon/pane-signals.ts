import { Buffer } from "node:buffer";

export const BUSY_WINDOW_MS = 1_000;
export const BUSY_BYTE_THRESHOLD = 256;
export const BUSY_IDLE_AFTER_MS = 1_500;
export const USER_TYPING_IDLE_MS = 60_000;
export const SELF_INJECTION_WINDOW_MS = 2_000;

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

interface ComposerRegionMatch {
	readonly region: string;
	readonly recognized: boolean;
	readonly startRow: number;
	readonly firstColumn: number;
}

function isCopilotFooterLine(line: string): boolean {
	const trimmed = line.trim();
	return (
		/MallocStackLogging:/.test(trimmed) ||
		/\bWorking\s*·.*\besc interrupt\b/i.test(trimmed) ||
		/^\/ commands\s*·\s*\? help/.test(trimmed) ||
		/\b(?:GPT|Claude|Gemini|Opus|Sonnet|Haiku)[^·]*·.*\bcontext\b/i.test(trimmed) ||
		/^[◉◎◒◐◓◑◔◕●○◌◍⋯…⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏\s]+$/u.test(trimmed)
	);
}

function copilotComposerRegion(lines: readonly string[]): ComposerRegionMatch | undefined {
	let prompt = -1;
	for (let index = lines.length - 1; index >= 0; index--) {
		if (/^\s*❯(?:\s| |$)/u.test(lines[index] ?? "")) {
			prompt = index;
			break;
		}
	}
	if (prompt < 0) return undefined;

	const promptLine = lines[prompt] ?? "";
	const payload = promptLine.replace(/^\s*❯(?:\s| )?/u, "");
	const trailing = lines.slice(prompt + 1);
	if (!isCopilotFooterLine(payload) && !trailing.some(isCopilotFooterLine)) return undefined;
	if (isCopilotFooterLine(payload)) {
		return { region: "❯", recognized: true, startRow: prompt, firstColumn: 0 };
	}

	const composer = [promptLine];
	for (const line of trailing) {
		if (isCopilotFooterLine(line)) break;
		composer.push(line);
	}
	return {
		region: composer.join("\n"),
		recognized: true,
		startRow: prompt,
		firstColumn: 0,
	};
}

/** Locate the live composer in a rendered `capture-pane` snapshot. Claude and
 * wide Copilot layouts place it between the final two horizontal rules; narrow
 * Copilot layouts leave a trailing prompt plus status footer. OMP renders input
 * inside its final `╰─ … ─╯` row. Unknown layouts retain the submit-verifier's
 * historical bottom-four-lines fallback but are not authoritative for holds. */
function matchComposerRegion(pane: string): ComposerRegionMatch {
	const lines = pane.split("\n");
	for (let index = lines.length - 1; index >= 0; index--) {
		const line = lines[index] ?? "";
		const omp = line.match(/^(\s*╰─+\s?)(.*?)(\s?─+╯\s*)$/);
		if (omp) {
			return {
				region: omp[2] ?? "",
				recognized: true,
				startRow: index,
				firstColumn: omp[1]?.length ?? 0,
			};
		}
	}
	const rules: number[] = [];
	for (let index = 0; index < lines.length; index++) {
		if (/─{8,}/.test(lines[index] ?? "")) rules.push(index);
	}
	const lower = rules.at(-2);
	const upper = rules.at(-1);
	if (lower !== undefined && upper !== undefined) {
		return {
			region: lines.slice(lower + 1, upper).join("\n"),
			recognized: true,
			startRow: lower + 1,
			firstColumn: 0,
		};
	}
	const copilot = copilotComposerRegion(lines);
	if (copilot !== undefined) return copilot;
	return {
		region: lines.slice(-4).join("\n"),
		recognized: false,
		startRow: Math.max(0, lines.length - 4),
		firstColumn: 0,
	};
}

/** Composer region shared by delivery safety and tmux submit verification. */
export function composerRegion(pane: string): string {
	return matchComposerRegion(pane).region;
}

interface ComposerCursor {
	readonly x?: number;
	readonly y?: number;
}

interface NormalizedComposer {
	readonly payload: string;
	readonly preciseCaret: boolean;
}

function normalizeComposerPayload(
	match: ComposerRegionMatch,
	cursor?: ComposerCursor,
): NormalizedComposer | undefined {
	if (!match.recognized) return undefined;
	const lines = match.region.split("\n");
	const activeLine =
		cursor?.y !== undefined && Number.isInteger(cursor.y) ? cursor.y - match.startRow : undefined;
	const preciseLine =
		activeLine !== undefined && activeLine >= 0 && activeLine < lines.length
			? activeLine
			: undefined;
	let preciseCaret = false;
	if (preciseLine !== undefined && cursor?.x !== undefined && Number.isInteger(cursor.x)) {
		const line = lines[preciseLine] ?? "";
		const column = cursor.x - (preciseLine === 0 ? match.firstColumn : 0);
		if (column >= 0 && column <= line.length) {
			lines[preciseLine] = line.slice(0, column);
			preciseCaret = true;
		} else if (column > line.length) {
			lines[preciseLine] = line.replace(/[ \t ]+$/u, "");
		}
	}
	if (lines[0] !== undefined) lines[0] = lines[0].replace(/^\s*❯(?:[ \t ])?/u, "");
	return { payload: lines.join("\n"), preciseCaret };
}

/** Authoritative composer text. A precise caret clips only its active physical
 * line; absent or ambiguous coordinates preserve whitespace (safe over-hold).
 * A cursor beyond the captured line trims known right-side width padding. */
export function renderedComposerPayload(pane: string, cursor?: ComposerCursor): string | undefined {
	return normalizeComposerPayload(matchComposerRegion(pane), cursor)?.payload;
}

/** Whitespace-insensitive rendered payload length, or `undefined` when the TUI
 * layout is unknown. Unknown never overrides the caret tracker's prior signal. */
export function renderedComposerLength(pane: string): number | undefined {
	const payload = renderedComposerPayload(pane);
	return payload?.replace(/\s/gu, "").length;
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

const MAX_CONTROL_STRING_BYTES = 4_096;

function hasPrintableInput(bytes: Uint8Array): boolean {
	let escapePending = false;
	let csi = false;
	let controlString = false;
	let stringEscape = false;
	let controlStringBytes = 0;
	for (const byte of bytes) {
		if (controlString) {
			if (byte === 7 || byte === 156 || (stringEscape && byte === 92)) {
				controlString = false;
				stringEscape = false;
				controlStringBytes = 0;
				continue;
			}
			stringEscape = byte === 27;
			controlStringBytes += 1;
			if (controlStringBytes > MAX_CONTROL_STRING_BYTES) {
				controlString = false;
				stringEscape = false;
				controlStringBytes = 0;
			}
			continue;
		}
		if (csi) {
			if (byte >= 64 && byte <= 126) csi = false;
			continue;
		}
		if (escapePending) {
			escapePending = false;
			csi = byte === 91;
			controlString = byte === 80 || byte === 88 || byte === 93 || byte === 94 || byte === 95;
			controlStringBytes = 0;
			continue;
		}
		if (byte === 27) {
			escapePending = true;
			continue;
		}
		if (byte === 155) {
			csi = true;
			continue;
		}
		if (byte === 144 || byte === 152 || byte === 157 || byte === 158 || byte === 159) {
			controlString = true;
			controlStringBytes = 0;
			continue;
		}
		if ((byte >= 32 && byte <= 126) || byte >= 160) return true;
	}
	return false;
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
	private renderedPayload: string | undefined;
	private lastKeyAt: number | undefined;
	private renderedCaretPrecise = false;
	private composerRows: { readonly start: number; readonly end: number } | undefined;
	private selfInjection:
		| {
				readonly payload: string;
				readonly baseline: string | undefined;
				readonly expiresAt: number;
		  }
		| undefined;

	seedBase(position: CaretPosition): void {
		if (!this.isTyping()) this.base = position;
	}

	markSelfInjection(payload: string, nowMs: number): void {
		this.selfInjection = {
			payload,
			baseline: this.renderedPayload,
			expiresAt: nowMs + SELF_INJECTION_WINDOW_MS,
		};
		this.lastKeyAt = undefined;
	}

	private pendingSelfInjection(
		nowMs: number,
	): NonNullable<CaretTypingTracker["selfInjection"]> | undefined {
		if (this.selfInjection !== undefined && nowMs > this.selfInjection.expiresAt) {
			this.selfInjection = undefined;
		}
		return this.selfInjection;
	}

	ingest(bytes: Uint8Array, nowMs: number, allowAcquire: boolean): TypingEvent[] {
		const pendingInjection = this.pendingSelfInjection(nowMs);
		if (
			pendingInjection !== undefined &&
			Buffer.from(bytes).toString("utf8").includes(pendingInjection.payload)
		) {
			this.selfInjection = undefined;
			return [];
		}
		const printableInput = hasPrintableInput(bytes);
		const events: TypingEvent[] = [];
		const positions = parseCaretPositions(bytes);
		if (this.renderedPayload !== undefined) {
			const scopedAmbiguousInput =
				allowAcquire &&
				printableInput &&
				!this.renderedCaretPrecise &&
				this.lastKeyAt === undefined &&
				this.composerRows !== undefined &&
				positions.some(
					(position) =>
						this.composerRows !== undefined &&
						position.row >= this.composerRows.start &&
						position.row <= this.composerRows.end,
				);
			if (scopedAmbiguousInput) {
				this.selfInjection = undefined;
				this.lastKeyAt = nowMs;
				events.push({ kind: "key", composerLength: this.composerLength });
			}
			return events;
		}
		for (const position of positions) {
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
			if (
				!allowAcquire ||
				!printableInput ||
				nextLength === this.composerLength ||
				nextLength === 0
			) {
				continue;
			}
			this.selfInjection = undefined;
			this.composerLength = nextLength;
			this.lastKeyAt = nowMs;
			events.push({ kind: "key", composerLength: nextLength });
		}
		return events;
	}

	/** Rendered composer content is authoritative when the layout is known.
	 * The first snapshot establishes a baseline; only later payload changes acquire
	 * a hold. Ambiguous carets retain a composer-row-scoped printable fallback. */
	observeRenderedComposer(
		payload: string | undefined,
		nowMs: number,
		context?: {
			readonly preciseCaret?: boolean;
			readonly rows?: { readonly start: number; readonly end: number };
		},
	): TypingEvent | undefined {
		if (payload === undefined) {
			this.renderedPayload = undefined;
			this.renderedCaretPrecise = false;
			this.composerRows = undefined;
			return undefined;
		}
		this.renderedCaretPrecise = context?.preciseCaret ?? false;
		this.composerRows = context?.rows;
		const wasTyping = this.isTyping();
		const previous = this.renderedPayload;
		const pendingInjection = this.pendingSelfInjection(nowMs);
		const changed = payload !== previous;
		const suppressChange =
			changed &&
			pendingInjection !== undefined &&
			(payload === pendingInjection.payload || payload === pendingInjection.baseline);
		if (changed && pendingInjection !== undefined) this.selfInjection = undefined;
		this.renderedPayload = payload;
		this.composerLength = payload.replace(/\s/gu, "").length;
		if (payload.length === 0) {
			this.lastKeyAt = undefined;
			return wasTyping ? { kind: "enter", composerLength: 0 } : undefined;
		}
		if (suppressChange) return undefined;
		if (previous === undefined || !changed) return undefined;
		this.lastKeyAt = nowMs;
		return { kind: "key", composerLength: this.composerLength };
	}

	expire(nowMs: number): TypingEvent | undefined {
		if (this.lastKeyAt === undefined || nowMs - this.lastKeyAt < USER_TYPING_IDLE_MS) {
			return undefined;
		}
		this.composerLength = 0;
		this.lastKeyAt = undefined;
		return { kind: "idle-release", composerLength: 0 };
	}

	isTyping(): boolean {
		return this.lastKeyAt !== undefined;
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
	cursorX: number | undefined;
	cursorY: number | undefined;
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
					cursorX: pane.cursorX,
					cursorY: pane.cursorY,
				};
				if (pane.cursorX !== undefined && pane.cursorY !== undefined) {
					state.typing.seedBase({ row: pane.cursorY + 1, column: pane.cursorX + 1 });
				}
			}
			state.cursorX = pane.cursorX;
			state.cursorY = pane.cursorY;
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

	markSelfInjection(paneId: string, payload: string, nowMs: number): void {
		this.panes.get(paneId)?.typing.markSelfInjection(payload, nowMs);
	}

	observeRenderedComposer(paneId: string, pane: string, nowMs: number): TypingEvent | undefined {
		const state = this.panes.get(paneId);
		if (!state) return undefined;
		const match = matchComposerRegion(pane);
		const normalized = normalizeComposerPayload(match, { x: state.cursorX, y: state.cursorY });
		return state.typing.observeRenderedComposer(normalized?.payload, nowMs, {
			preciseCaret: normalized?.preciseCaret ?? false,
			...(match.recognized
				? {
						rows: {
							start: match.startRow + 1,
							end: match.startRow + match.region.split("\n").length,
						},
					}
				: {}),
		});
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
