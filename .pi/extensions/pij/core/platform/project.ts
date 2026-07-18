// pij platform — project pure logic (plan 054, T004, module: project).
// createProject / setProject couple every record write to EXACTLY ONE
// SpineEvent (WS-5); one injected nowMs stamps both sides (Pattern P3).
// Pattern P4: fallible verbs return Result, never throw. Absent optionals
// stay absent — spread-conditional, never undefined-valued keys.

import { err, ok, type Result } from "../types.js";
import { buildSpineEvent } from "./spine.js";
import { isoTimestamp } from "./time.js";
import {
	type ActorProvenance,
	isValidProjectSlug,
	kebabSlug,
	PROJECT_SLUG_MAX_LENGTH,
	type Project,
	resolveSlugCollision,
	SPINE_KIND_PROJECT_CREATED,
	SPINE_KIND_PROJECT_SET,
	type SpineEventDraft,
} from "./types.js";

export interface CreateProjectInput {
	readonly description: string;
	readonly actor: string;
	readonly nowMs: number;
	readonly existingSlugs: ReadonlySet<string>;
	/** Explicitly chosen slug (s057 dogfood): used VERBATIM — E-ARG on shape,
	 *  length, or collision; a chosen identity is never silently renamed. */
	readonly slug?: string;
	readonly actorProvenance?: ActorProvenance;
	readonly repo?: string;
	readonly planPath?: string;
	readonly primeId?: string;
}

export interface SetProjectOptions {
	readonly actor: string;
	readonly nowMs: number;
	readonly planPath?: string;
	readonly primeId?: string;
	readonly actorProvenance?: ActorProvenance;
}

/** One coupled write: the record plus its single spine event draft — nothing
 *  else. The log port stamps `seq` when the draft is appended. */
export interface ProjectWrite {
	readonly project: Project;
	readonly event: SpineEventDraft;
}

/** Known top-level fields in CONTRACT order; everything else on a record is
 *  an additive (unknown-but-preserved) field the guards tolerate (WS-4). */
const PROJECT_FIELD_ORDER = [
	"schema_version",
	"slug",
	"description",
	"repo",
	"planPath",
	"primeId",
	"created",
] as const;

/** Known `created` stamp fields in CONTRACT order. */
const STAMP_FIELD_ORDER = ["actor", "ts"] as const;

/** Deep-canonicalize a JSON value: objects get their OWN keys in sorted
 *  order (recursively), arrays keep position. Determinism for values the
 *  contract does not know — a disk-parsed record must canonicalize the same
 *  bytes no matter what key order it arrived with. Rebuilt objects are
 *  null-prototype (review 003 M4): a JSON-parsed own key named "__proto__"
 *  is a valid additive field, and assigning it on a plain {} would invoke
 *  the legacy prototype setter and silently drop it from the snapshot.
 *  Exported (plan 054 P2 T005) so canonicalAssignmentJson applies the SAME
 *  law — one canonicalization, two record shapes. */
export function canonicalJsonValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalJsonValue);
	if (typeof value === "object" && value !== null) {
		const record = value as Record<string, unknown>;
		const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
		for (const key of Object.keys(record).sort()) out[key] = canonicalJsonValue(record[key]);
		return out;
	}
	return value;
}

/** Rebuild one record level: known fields first in contract order (present
 *  own fields only — absent optionals stay omitted entirely, WS-4), then
 *  every unknown OWN field in stable sorted order, deep-canonicalized.
 *  Null-prototype for the same M4 reason as canonicalJsonValue.
 *  Exported (plan 054 P2 T005) for canonicalAssignmentJson — same law. */
export function canonicalRecordLevel(
	record: Record<string, unknown>,
	known: readonly string[],
): Record<string, unknown> {
	const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
	for (const key of known) {
		if (Object.hasOwn(record, key) && record[key] !== undefined) out[key] = record[key];
	}
	for (const key of Object.keys(record).sort()) {
		if (known.includes(key) || record[key] === undefined) continue;
		out[key] = canonicalJsonValue(record[key]);
	}
	return out;
}

/** Canonical single-line JSON for the COMPLETE OWN project record: contract
 *  fields in order (schema_version, slug, description, repo?, planPath?,
 *  primeId?, created{actor, ts}), then unknown own fields in stable sorted
 *  order — nested `created` included (review 002 G4: the guards tolerate
 *  additive fields and the store preserves them, so prev/next must never
 *  silently omit data the persisted record carries). Deterministic no matter
 *  what key order a disk-parsed input arrived with, so event prev/next
 *  values are byte-comparable (review 001 F3). */
export function canonicalProjectJson(project: Project): string {
	const record = project as unknown as Record<string, unknown>;
	const canonical = canonicalRecordLevel(record, PROJECT_FIELD_ORDER);
	canonical.created = canonicalRecordLevel(
		project.created as unknown as Record<string, unknown>,
		STAMP_FIELD_ORDER,
	);
	return JSON.stringify(canonical);
}

/** Slug: explicit `input.slug` used verbatim (E-ARG on shape/collision — a
 *  chosen identity is never silently renamed), else kebabSlug(description)
 *  capped at PROJECT_SLUG_MAX_LENGTH + resolveSlugCollision (AC-01); E-ARG
 *  when the description kebabs to '' or a given repo/planPath/primeId is ''. */
export function createProject(input: CreateProjectInput): Result<ProjectWrite> {
	let slug: string;
	if (input.slug !== undefined) {
		if (!isValidProjectSlug(input.slug)) {
			return err(
				"E-ARG",
				`invalid project slug '${input.slug}' (kebab: lowercase alnum runs joined by '-', max ${PROJECT_SLUG_MAX_LENGTH} chars)`,
			);
		}
		// Honest "already exists" posture: an explicit slug never auto-suffixes.
		if (input.existingSlugs.has(input.slug)) {
			return err("E-ARG", `project slug '${input.slug}' already exists — pick another`);
		}
		slug = input.slug;
	} else {
		const kebab = kebabSlug(input.description);
		if (kebab === "") {
			return err("E-ARG", `description must kebab to a non-empty slug (got '${input.description}')`);
		}
		// Cap the derived base (a whole-description slug is a filename, not
		// prose); trim any hyphen fragment the cut left behind. A -N collision
		// suffix may exceed the cap by a few chars — uniqueness wins.
		const base = kebab.slice(0, PROJECT_SLUG_MAX_LENGTH).replace(/-+$/, "");
		slug = resolveSlugCollision(base, input.existingSlugs);
	}
	if (input.repo === "") return err("E-ARG", "project repo must not be empty");
	if (input.planPath === "") return err("E-ARG", "project planPath must not be empty");
	if (input.primeId === "") return err("E-ARG", "project primeId must not be empty");
	// F7: ONE checked clock stamps both sides of the coupling (Pattern P3).
	const ts = isoTimestamp(input.nowMs);
	if (!ts.ok) return ts;
	const project: Project = {
		schema_version: 1,
		slug,
		description: input.description,
		...(input.repo === undefined ? {} : { repo: input.repo }),
		...(input.planPath === undefined ? {} : { planPath: input.planPath }),
		...(input.primeId === undefined ? {} : { primeId: input.primeId }),
		created: { actor: input.actor, ts: ts.value },
	};
	const event = buildSpineEvent({
		nowMs: input.nowMs,
		actor: input.actor,
		kind: SPINE_KIND_PROJECT_CREATED,
		refs: [`project:${slug}`],
		project: slug,
		repo: input.repo,
		// F3: creation has no prior state — next only, prev stays ABSENT.
		next: canonicalProjectJson(project),
		actorProvenance: input.actorProvenance,
	});
	if (!event.ok) return event;
	return ok({ project, event: event.value });
}

/** Immutable update — the input record is never mutated. E-ARG when neither
 *  planPath nor primeId is given, or a given one is ''. */
export function setProject(project: Project, options: SetProjectOptions): Result<ProjectWrite> {
	if (options.planPath === undefined && options.primeId === undefined) {
		return err("E-ARG", "project update requires planPath and/or primeId");
	}
	if (options.planPath === "") return err("E-ARG", "project planPath must not be empty");
	if (options.primeId === "") return err("E-ARG", "project primeId must not be empty");
	const next: Project = {
		...project,
		...(options.planPath === undefined ? {} : { planPath: options.planPath }),
		...(options.primeId === undefined ? {} : { primeId: options.primeId }),
	};
	// Carries repo like project-created does — consumers filter sets and creates alike.
	// F3: canonical before/after — a no-op set still couples, with prev === next
	// (ruled: audited intent beats a read-compare-skip race; no delta short-circuit).
	const event = buildSpineEvent({
		nowMs: options.nowMs,
		actor: options.actor,
		kind: SPINE_KIND_PROJECT_SET,
		refs: [`project:${project.slug}`],
		project: project.slug,
		repo: project.repo,
		prev: canonicalProjectJson(project),
		next: canonicalProjectJson(next),
		actorProvenance: options.actorProvenance,
	});
	if (!event.ok) return event;
	return ok({ project: next, event: event.value });
}
