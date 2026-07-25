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

/** Box-drawing junctions/corners/verticals. A composer rule is a PLAIN run of
 * `─`; a markdown table or dialog border carries these. Real captures render
 * `┌───────────┬──────────┐` inside assistant output, which `/─{8,}/` alone
 * matches — treating one as a composer rule slides the region onto table data. */
const BOX_DRAWING = /[┌┐└┘├┤┬┴┼╭╮╰╯╠╣╦╩╬│┃║╔╗╚╝]/u;

function isComposerRule(line: string): boolean {
	return /─{8,}/.test(line) && !BOX_DRAWING.test(line);
}

/** The composer's own prompt marker. Verified present on every live claude and
 * copilot capture, empty composers included (they render a bare `❯`). */
const PROMPT_MARKER = /^\s*❯/u;

/** Locate the live composer in a rendered `capture-pane` snapshot. OMP renders
 * input inside its final `╰─ … ─╯` row. Claude and wide Copilot layouts place it
 * between a pair of horizontal rules — scanned bottom-up and accepted only when
 * the bracketed text is POSITIVELY a composer, never merely "the last two rules"
 * (a rule drawn below the composer slid that window onto the status line, which
 * both false-held on non-empty status and false-RELEASED mid-keystroke on blank).
 * Narrow Copilot layouts leave a trailing prompt plus status footer. An
 * unrecognised layout keeps the submit-verifier's historical bottom-four-lines
 * text but reports `recognized: false`, so holds fall back to the caret tracker:
 * measuring the WRONG region is far worse than measuring nothing. */
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
		if (isComposerRule(lines[index] ?? "")) rules.push(index);
	}
	const bracket = (lower: number, upper: number): ComposerRegionMatch => ({
		region: lines.slice(lower + 1, upper).join("\n"),
		recognized: true,
		startRow: lower + 1,
		firstColumn: 0,
	});
	const interiorOf = (pairIndex: number): string[] => {
		const lower = rules[pairIndex - 1];
		const upper = rules[pairIndex];
		if (lower === undefined || upper === undefined) return [];
		return lines.slice(lower + 1, upper);
	};
	// Prefer the lowest pair that actually brackets a prompt marker.
	for (let pair = rules.length - 1; pair >= 1; pair--) {
		if (PROMPT_MARKER.test(interiorOf(pair)[0] ?? "")) {
			return bracket(rules[pair - 1] as number, rules[pair] as number);
		}
	}
	// No marker anywhere: only the bottom-most pair may stand in, and only when it
	// brackets a visibly blank composer. Any other text down there is not ours.
	const lower = rules.at(-2);
	const upper = rules.at(-1);
	if (lower !== undefined && upper !== undefined) {
		const interior = lines.slice(lower + 1, upper);
		if (interior.length > 0 && interior.every((line) => line.trim() === "")) {
			return bracket(lower, upper);
		}
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

/** THE definition of an empty composer — whitespace-insensitive, used by every
 * release path. `capture-pane -J` PRESERVES trailing spaces, so a visibly blank
 * composer is almost never the empty string: measured on live panes, copilot
 * rendered 145 spaces and omp/pi 74–144. The previous raw `=== ""` and
 * `.length === 0` tests therefore never fired on those harnesses, which is why
 * "press Enter → sends" had never worked outside claude. */
export function isBlankComposer(content: string | undefined): boolean {
	return content !== undefined && content.replace(/\s/gu, "").length === 0;
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

/** Printable characters in a raw frame, with every escape/control string
 * skipped. Used both to detect human input and to prove that a frame contains
 * NOTHING beyond pij's own echo. */
function printableInput(bytes: Uint8Array): string {
	const out: number[] = [];
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
		if ((byte >= 32 && byte <= 126) || byte >= 160) out.push(byte);
	}
	return Buffer.from(Uint8Array.from(out)).toString("utf8");
}

function hasPrintableInput(bytes: Uint8Array): boolean {
	return printableInput(bytes).length > 0;
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

/** Whitespace-free view: terminals re-wrap and pad, so only the character
 * sequence is stable enough to match an echo against. */
function dense(text: string): string {
	return text.replace(/\s/gu, "");
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
				/** Whitespace-free payload and how much of it the tap has echoed back. */
				readonly expected: string;
				echoed: number;
				readonly baseline: string | undefined;
				readonly expiresAt: number;
		  }
		| undefined;

	seedBase(position: CaretPosition): void {
		if (!this.isTyping()) this.base = position;
	}

	/** Record that pij is about to type into this pane, so its own echo is not
	 * mistaken for a human keystroke. It EXEMPTS; it must never CLEAR — dropping
	 * `lastKeyAt` here destroyed an ACTIVE human hold, so one step-on released the
	 * guard and the rest of the queue landed on the same half-typed line. */
	markSelfInjection(payload: string, nowMs: number): void {
		this.selfInjection = {
			payload,
			expected: dense(payload),
			echoed: 0,
			baseline: this.renderedPayload,
			expiresAt: nowMs + SELF_INJECTION_WINDOW_MS,
		};
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
		// Certify a frame as OUR echo only by cumulative PROGRESS through the
		// payload, and only once the whole payload is accounted for.
		//
		// Containment fails in both directions: `frame.includes(payload)` excused
		// echo-plus-human-keystroke, and `payload.includes(frame)` excused any
		// human character that happened to appear somewhere in the payload. Even a
		// cursor alone is not enough — a lone keystroke equal to the NEXT expected
		// character is byte-identical to the echo. So a partial match is treated as
		// AMBIGUOUS and falls through to typing detection (it holds); only a frame
		// sequence that completes the payload is certified as ours.
		const pendingInjection = this.pendingSelfInjection(nowMs);
		if (pendingInjection !== undefined) {
			const frame = dense(printableInput(bytes));
			if (frame.length > 0) {
				if (pendingInjection.expected.startsWith(frame, pendingInjection.echoed)) {
					pendingInjection.echoed += frame.length;
					if (pendingInjection.echoed >= pendingInjection.expected.length) {
						this.selfInjection = undefined;
						return [];
					}
					// Partial echo: ambiguous, NOT certified. Fall through.
				} else {
					// Diverged from what we typed ⇒ human input. Spend the exemption
					// so it cannot excuse anything later.
					this.selfInjection = undefined;
				}
			}
		}
		const hasPrintable = hasPrintableInput(bytes);
		const events: TypingEvent[] = [];
		const positions = parseCaretPositions(bytes);
		if (this.renderedPayload !== undefined) {
			const scopedAmbiguousInput =
				allowAcquire &&
				hasPrintable &&
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
				!hasPrintable ||
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
		if (isBlankComposer(payload)) {
			this.lastKeyAt = undefined;
			this.selfInjection = undefined;
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

export type ComposerHoldReason =
	| "unknown-layout"
	| "blank"
	| "baseline"
	| "typing"
	| "idle-expired";

export interface ComposerHoldVerdict {
	readonly hold: boolean;
	/** Layout unrecognised — the caller must fall back to the caret tracker
	 * rather than act on a guess. `hold` is meaningless when this is true. */
	readonly deferred: boolean;
	readonly reason: ComposerHoldReason;
	/** When the held content last changed — mirrored into the SendBuffer so the
	 * 60s window is measured from the real keystroke, not from each poll. */
	readonly lastChangeAt?: number;
}

interface ComposerHoldState {
	content: string | undefined;
	lastChangeAt: number | undefined;
	injection:
		| {
				readonly payload: string;
				readonly baseline: string | undefined;
				readonly expiresAt: number;
		  }
		| undefined;
}

function collapse(text: string): string {
	return text.replace(/\s+/gu, " ").trim();
}

/** Delivery gate on composer CONTENT (a state), not on render diffs (an event).
 *
 * The previous guard inferred typing from a difference between two renders but
 * gated delivery on a flag refreshed once per 600ms daemon tick. Acquisition was
 * therefore tick-quantised while release was instant and re-checked immediately
 * before each send — a one-way valve toward delivery. The pre-send capture SAW
 * the human's half-typed line and discarded it, because "static non-empty text
 * never acquires a hold". That was the step-on.
 *
 * Here the same capture may ACQUIRE, so there is no blind window. This maps
 * directly onto the stated contract: "Enter has not been pressed" ≡ the composer
 * is non-blank; "recent typing" ≡ that content is fresh. */
export class ComposerHoldTracker {
	private readonly panes = new Map<string, ComposerHoldState>();

	/** Exempt pij's own echo. Like the caret tracker's, this must never clear
	 * `lastChangeAt`: an active human hold has to survive our own delivery. */
	markSelfInjection(paneId: string, payload: string, nowMs: number): void {
		const state = this.state(paneId);
		state.injection = {
			payload,
			baseline: state.content,
			expiresAt: nowMs + SELF_INJECTION_WINDOW_MS,
		};
	}

	observe(paneId: string, content: string | undefined, nowMs: number): ComposerHoldVerdict {
		const state = this.state(paneId);
		// Unknown layout: PRESERVE whatever we knew and defer. Clearing here would
		// drop a live hold the moment a dialog or menu covered the composer.
		if (content === undefined) return { hold: false, deferred: true, reason: "unknown-layout" };

		if (state.injection !== undefined && nowMs > state.injection.expiresAt) {
			state.injection = undefined;
		}
		if (isBlankComposer(content)) {
			state.content = content;
			state.lastChangeAt = undefined;
			// NOTE: a pending self-injection is deliberately NOT cleared here. The
			// gate re-observes between marking an injection and its echo appearing,
			// and the composer is still blank at that moment — clearing would drop
			// the exemption and make our own echo look like human typing. The
			// exemption is bounded by SELF_INJECTION_WINDOW_MS instead.
			return { hold: false, deferred: false, reason: "blank" };
		}
		const previous = state.content;
		if (previous === undefined) {
			// First sight of this pane with text already in it. It is EITHER a parked
			// draft OR a human typing through a daemon restart (the daemon is
			// machine-wide and restarts routinely), and ONE capture cannot tell them
			// apart. A static-content probation does not help: pausing mid-thought is
			// ordinary, so a parked-looking draft may be a live one. So treat first
			// sight as RECENT TYPING and let the existing 60s idle rule expire it —
			// no new constant, no cross-restart persistence, and the over-hold is
			// bounded at 60s so s064's forever-block cannot return.
			state.content = content;
			state.lastChangeAt = nowMs;
			return { hold: true, deferred: false, reason: "typing", lastChangeAt: nowMs };
		}
		if (content !== previous) {
			const echo = state.injection;
			// EXACT normalised echo only. A substring test excused a first capture of
			// `<echo><human text>`, which released and stepped on the human — the
			// exemption must not be able to absorb text adjacent to our own.
			const explained =
				echo !== undefined &&
				collapse(echo.payload).length > 0 &&
				(collapse(content) === collapse(echo.payload) ||
					collapse(content) === collapse(echo.baseline ?? ""));
			state.content = content;
			// One-shot: consuming the exemption anchors this exact content, so the
			// NEXT change — a human typing after our echo — holds normally.
			state.injection = undefined;
			if (!explained) {
				state.lastChangeAt = nowMs;
				return { hold: true, deferred: false, reason: "typing", lastChangeAt: nowMs };
			}
			// Our own echo: adopt it silently, leaving any human hold untouched.
		}
		if (state.lastChangeAt === undefined) {
			return { hold: false, deferred: false, reason: "baseline" };
		}
		if (nowMs - state.lastChangeAt < USER_TYPING_IDLE_MS) {
			return { hold: true, deferred: false, reason: "typing", lastChangeAt: state.lastChangeAt };
		}
		// Timed out with no Enter: send, and stay released until content changes
		// again — "after that, unless I type again, it chains off".
		state.lastChangeAt = undefined;
		return { hold: false, deferred: false, reason: "idle-expired" };
	}

	forget(paneId: string): void {
		this.panes.delete(paneId);
	}

	private state(paneId: string): ComposerHoldState {
		let state = this.panes.get(paneId);
		if (state === undefined) {
			state = { content: undefined, lastChangeAt: undefined, injection: undefined };
			this.panes.set(paneId, state);
		}
		return state;
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
