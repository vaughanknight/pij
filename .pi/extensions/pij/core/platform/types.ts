// pij platform — schema-versioned PUBLIC on-disk contract (plan 054, WS-4).
//
// Imports NOTHING. Project / Assignment / SpineEvent are records external
// tools read and write: every record carries `schema_version: 1` (WS-4 —
// the field is `schema_version`, never "version"); unknown extra fields are
// tolerated (additive / migration-safe, AC-11); absent optionals are
// `undefined` — JSON `null` is never "absent". SpineEvent `kind` is an OPEN
// vocabulary (WS-5); the kinds pij itself emits live here as SPINE_KIND_*.
// Guards are total boolean predicates (Pattern P4, isFocusManifest precedent).

// ─── attribution (WS-5) ────────────────────────────────────────────────────

/** How a spine line's `actor` was established. */
export const ACTOR_PROVENANCES = ["resolved", "asserted"] as const;

export type ActorProvenance = (typeof ACTOR_PROVENANCES)[number];

/** Attribution fields every spine line carries. `SpineEvent` extends this,
 *  so any SpineEvent is assignable wherever an envelope is expected. */
export interface AttributionEnvelope {
	readonly actor: string;
	readonly ts: string;
	readonly refs: readonly string[];
	readonly prev?: string;
	readonly next?: string;
	readonly verifiedBy?: string;
	readonly actorProvenance?: ActorProvenance;
}

// ─── records (WS-4) ────────────────────────────────────────────────────────

/** One tracked project. */
export interface Project {
	readonly schema_version: 1;
	readonly slug: string;
	readonly description: string;
	readonly repo?: string;
	readonly planPath?: string;
	readonly primeId?: string;
	readonly created: {
		readonly actor: string;
		readonly ts: string;
	};
}

/** Why an assignment closed (closed union — unknown reasons are rejected). */
export const ASSIGNMENT_CLOSE_REASONS = ["done", "cancelled", "failed", "superseded"] as const;

export type AssignmentCloseReason = (typeof ASSIGNMENT_CLOSE_REASONS)[number];

/** One unit of work bound to a node. `states` are spine seq refs. */
export interface Assignment {
	readonly schema_version: 1;
	readonly id: string;
	readonly nodeId: string;
	readonly projectSlug?: string;
	readonly task: string;
	readonly states: readonly number[];
	readonly opened: {
		readonly actor: string;
		readonly ts: string;
	};
	readonly closed?: {
		readonly actor: string;
		readonly ts: string;
		readonly reason: AssignmentCloseReason;
	};
}

// ─── spine events (WS-5) ───────────────────────────────────────────────────

/** Kinds pij itself emits. `kind` stays an open string for external writers;
 *  the guard does not enforce this list. */
export const SPINE_KIND_PROJECT_CREATED = "project-created";
export const SPINE_KIND_PROJECT_SET = "project-set";
// Assignment coupled-write kinds (plan 054 P2 T005). prev/next on these carry
// canonicalAssignmentJson (states[] excluded — a log-derived index); the
// semantic transition rides in structured refs (`state:<word>`).
export const SPINE_KIND_TASK_SET = "task-set";
export const SPINE_KIND_STATE_SET = "state-set";
export const SPINE_KIND_STATE_VERIFIED = "state-verified";
/** Mechanical-axis transition, appended by the DAEMON with `actor: daemon`
 *  (plan 054 P2 T008, V-05). prev/next carry WS-6 SystemState words; s055
 *  consumes this kind by exact name. Uncoupled (telemetry — the axis TRUTH
 *  is the descriptor), so it appends plain, never journaled. */
export const SPINE_KIND_SYSTEM_STATE = "system-state";
/** Re-parent audit event (plan 054 P3 T004, AC-08): `pij link` appends one
 *  per hop with prev=old effective parent, next=new parent, peer=child.
 *  A `--root` link OMITS `next` (the envelope's `next?` is string-typed —
 *  never null/sentinel) and refs `[node:<child>]` only. Uncoupled (V-05:
 *  descriptor is tree truth, the event is history), so it appends plain,
 *  never journaled — under the write lock + recovery gate like any
 *  platform append. */
export const SPINE_KIND_NODE_LINKED = "node-linked";

/** One spine log line. */
export interface SpineEvent extends AttributionEnvelope {
	readonly schema_version: 1;
	readonly seq: number;
	readonly kind: string;
	readonly peer?: string;
	readonly project?: string;
	readonly repo?: string;
}

/** A spine event BEFORE the log stamps its `seq`. Sequence numbers are
 *  allocated inside `SpineLogPort.append`/`appendOnce` (cross-process atomic
 *  — review 001 F1): no caller may mint one from `lastSeq() + 1`. */
export type SpineEventDraft = Omit<SpineEvent, "seq">;

// ─── guards (total, never throw) ───────────────────────────────────────────
// Each exported guard is wrapped in try/catch: throwing accessors / revoked
// proxies (never produced by JSON.parse) return false instead of escaping.

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Own-property law (review 001 F6): these guards are trust boundaries for
// non-JSON callers too, so a required field must be an OWN property —
// `Object.create(validRecord)` has none — and a known optional supplied only
// by the prototype chain is a forgery, not an absence. JSON.parse output
// (own data properties throughout, even a literal "__proto__" key) is
// untouched by either rule.

/** Required-field law: own property AND passing the value check. */
function ownField(
	record: Record<string, unknown>,
	key: string,
	isValue: (value: unknown) => boolean,
): boolean {
	return Object.hasOwn(record, key) && isValue(record[key]);
}

/** Known-optional law: absent everywhere, or own and passing the value
 *  check — present on the prototype chain but not own is rejected. */
function ownOptional(
	record: Record<string, unknown>,
	key: string,
	isValue: (value: unknown) => boolean,
): boolean {
	if (!(key in record)) return true;
	return Object.hasOwn(record, key) && isValue(record[key]);
}

/** Optional field law: absent means `undefined`; JSON `null` is rejected. */
function isOptionalString(value: unknown): boolean {
	return value === undefined || typeof value === "string";
}

const isString = (value: unknown): boolean => typeof value === "string";

function isActorStamp(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return ownField(value, "actor", isString) && ownField(value, "ts", isString);
}

/** Spine seq refs are integer-minded log positions, but the V-01 contract
 *  types them as plain `number` — only finiteness is enforced here (NaN and
 *  Infinity are corrupted refs; the tests pin NaN). */
function isSeqRef(value: unknown): boolean {
	return typeof value === "number" && Number.isFinite(value);
}

/** Dense real-Array check. `Array.isArray` gates out TypedArrays; the index
 *  loop (never `.every`, which skips holes) surfaces sparse-array holes as
 *  `undefined` so they fail the item check. */
function isDenseArrayOf(value: unknown, isItem: (item: unknown) => boolean): boolean {
	if (!Array.isArray(value)) return false;
	for (let i = 0; i < value.length; i++) {
		if (!isItem(value[i])) return false;
	}
	return true;
}

function isActorProvenance(value: unknown): value is ActorProvenance {
	return typeof value === "string" && (ACTOR_PROVENANCES as readonly string[]).includes(value);
}

function isAssignmentClosed(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return (
		ownField(value, "actor", isString) &&
		ownField(value, "ts", isString) &&
		ownField(
			value,
			"reason",
			(reason) =>
				typeof reason === "string" &&
				(ASSIGNMENT_CLOSE_REASONS as readonly string[]).includes(reason),
		)
	);
}

export function isProject(value: unknown): value is Project {
	try {
		if (!isRecord(value)) return false;
		return (
			ownField(value, "schema_version", (v) => v === 1) &&
			ownField(value, "slug", isString) &&
			ownField(value, "description", isString) &&
			ownOptional(value, "repo", isOptionalString) &&
			ownOptional(value, "planPath", isOptionalString) &&
			ownOptional(value, "primeId", isOptionalString) &&
			ownField(value, "created", isActorStamp)
		);
	} catch {
		return false;
	}
}

export function isAssignment(value: unknown): value is Assignment {
	try {
		if (!isRecord(value)) return false;
		return (
			ownField(value, "schema_version", (v) => v === 1) &&
			ownField(value, "id", isString) &&
			ownField(value, "nodeId", isString) &&
			ownOptional(value, "projectSlug", isOptionalString) &&
			ownField(value, "task", isString) &&
			ownField(value, "states", (v) => isDenseArrayOf(v, isSeqRef)) &&
			ownField(value, "opened", isActorStamp) &&
			ownOptional(value, "closed", (v) => v === undefined || isAssignmentClosed(v))
		);
	} catch {
		return false;
	}
}

export function isSpineEvent(value: unknown): value is SpineEvent {
	try {
		if (!isRecord(value)) return false;
		return (
			ownField(value, "schema_version", (v) => v === 1) &&
			ownField(value, "seq", isSeqRef) &&
			ownField(value, "ts", isString) &&
			ownField(value, "actor", isString) &&
			ownField(value, "kind", isString) &&
			ownField(value, "refs", (v) => isDenseArrayOf(v, (item) => typeof item === "string")) &&
			ownOptional(value, "peer", isOptionalString) &&
			ownOptional(value, "project", isOptionalString) &&
			ownOptional(value, "repo", isOptionalString) &&
			ownOptional(value, "prev", isOptionalString) &&
			ownOptional(value, "next", isOptionalString) &&
			ownOptional(value, "verifiedBy", isOptionalString) &&
			ownOptional(value, "actorProvenance", (v) => v === undefined || isActorProvenance(v))
		);
	} catch {
		return false;
	}
}

// ─── id + slug helpers (AC-01) ─────────────────────────────────────────────

/** The one general assignment every node holds: `asg-general-<nodeId>`. */
export function generalAssignmentId(nodeId: string): string {
	return `asg-general-${nodeId}`;
}

/** Lowercase kebab slug: alnum runs joined by single '-', edges trimmed. */
export function kebabSlug(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** First free slug: base, then base-2, base-3, … (AC-01). */
export function resolveSlugCollision(base: string, taken: ReadonlySet<string>): string {
	if (!taken.has(base)) return base;
	for (let n = 2; ; n++) {
		const candidate = `${base}-${n}`;
		if (!taken.has(candidate)) return candidate;
	}
}
