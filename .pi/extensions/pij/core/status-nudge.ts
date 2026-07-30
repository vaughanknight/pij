// pij-control-plane — the stale-card nudge every pij command carries.
//
// PURE. Decides whether this invocation should remind the caller that its own
// `now`/`next` card has gone stale, and renders the one-line reminder.
//
// Why HERE and not in the watchdog or the anomaly sweep — all three were tried,
// and the other two cannot reach this failure:
//
//  - The WATCHDOG fires on SILENCE. A seat that forgets to report is the
//    opposite of silent: it is working hard and emitting constantly, so the
//    nudge never fires.
//  - The ANOMALY sweep delivers to a node's effective PARENT, because for every
//    other anomaly kind somebody else must act. Here the actor who must act is
//    the seat itself, and it is the one party the alert never reaches.
//
// A reminder attached to the CLI lands in the right context (the caller's own),
// at the right moment (while it is actively working), with no polling and no
// delivery hop. The cost of being wrong is one short stderr line.
//
// STDERR, never stdout: `--json` output is parsed by callers, and a warning on
// stdout would corrupt it.

import { projectOrchestrationRole } from "./orchestration/role.js";
import type { SessionDescriptor } from "./types.js";

/** How stale a card may be before any pij command mentions it.
 *
 *  10min, measured rather than guessed: the seat that motivated this had real
 *  reporting gaps of 12–20min across three merges, so 10 catches every genuine
 *  miss. Tighter (5) fires mid-task when there is nothing new to say, and a
 *  reminder that interrupts work it cannot improve is one you learn to ignore. */
export const STATUS_NUDGE_AFTER_MS = 10 * 60_000;

/** Verbs that must never carry the nudge.
 *
 *  `report` is the obvious one — nagging somebody for not reporting *while they
 *  report* is absurd, and the check runs before the write lands anyway. The
 *  rest are the machine-readable surfaces (`whoami --env` is eval'd; inbox and
 *  spine output is parsed), where an extra stderr line is a real hazard rather
 *  than a nudge. */
const SILENT_VERBS: ReadonlySet<string> = new Set(["report", "inbox", "whoami", "spine"]);

/** Minutes since the card last moved, or since the seat started when it has
 *  never reported at all. Undefined when nothing parses — no evidence is not
 *  evidence of staleness. */
function cardAgeMs(descriptor: SessionDescriptor, nowMs: number): number | undefined {
	const stamp = descriptor.statusAt ?? descriptor.startedAt;
	const parsed = Date.parse(stamp);
	if (Number.isNaN(parsed)) return undefined;
	const age = nowMs - parsed;
	return age < 0 ? undefined : age;
}

export interface StatusNudgeInput {
	readonly descriptor: SessionDescriptor | undefined;
	readonly verb: string;
	readonly nowMs: number;
	readonly thresholdMs?: number;
}

/** The one-line reminder, or undefined when this invocation should stay quiet. */
export function statusNudgeLine(input: StatusNudgeInput): string | undefined {
	const descriptor = input.descriptor;
	if (descriptor === undefined) return undefined;
	if (SILENT_VERBS.has(input.verb.split(" ")[0] ?? input.verb)) return undefined;
	// Scoped to seats whose card is CONSUMED (prime/PM — status renders for PM
	// seats, JC-1 OQ-7). A worker's now/next surfaces in no card, so reminding
	// it is pure noise, and a noisy reminder is one nobody reads.
	if (projectOrchestrationRole(descriptor) === null) return undefined;
	// A seat that PARKED itself is exempt: waiting/hold/blocked/question are
	// deliberate declarations. Nudging them punishes the correct behaviour.
	if (descriptor.semanticState !== undefined && descriptor.semanticState !== "ready") {
		return undefined;
	}
	const ageMs = cardAgeMs(descriptor, input.nowMs);
	if (ageMs === undefined) return undefined;
	if (ageMs <= (input.thresholdMs ?? STATUS_NUDGE_AFTER_MS)) return undefined;
	const minutes = Math.floor(ageMs / 60_000);
	const never = descriptor.statusAt === undefined ? ", never reported" : "";
	// Deliberately ONE short line: this rides on every command, so its cost is
	// paid over and over. It states the fact and the exact fix, nothing else.
	return `⚠ pij: your now/next card is ${minutes}m old${never} — pij report now "<did>" "<next>"`;
}
