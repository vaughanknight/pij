// pij platform — project pure-logic specs (plan 054, T003, module: project).
// Pins the ./project.js surface: createProject / setProject with the
// write→event coupling living in pure logic (EXACTLY ONE SpineEvent per
// verb), E-ARG paths, input immutability, and optional-field absence
// (absent = undefined, never null). Types/guards come from the frozen
// ./types.js contract; Result from ../types.js (Pattern P4: no throws).

import { describe, expect, it } from "vitest";
import type { Result } from "../types.js";
import { canonicalProjectJson, createProject, setProject } from "./project.js";
import {
	type ActorProvenance,
	isProject,
	isSpineEvent,
	kebabSlug,
	PROJECT_SLUG_MAX_LENGTH,
	type Project,
	SPINE_KIND_PROJECT_CREATED,
	SPINE_KIND_PROJECT_SET,
} from "./types.js";

const T = Date.parse("2026-06-16T12:00:00.000Z");
const TS = new Date(T).toISOString();
const T2 = T + 60_000;
const TS2 = new Date(T2).toISOString();
const ACTOR = "pij-primary-carp";
const SETTER = "pij-reasonable-dove";
const NO_SLUGS: ReadonlySet<string> = new Set();

function unwrap<V>(result: Result<V>): V {
	if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
	return result.value;
}

interface CreateOverrides {
	readonly description?: string;
	readonly existingSlugs?: ReadonlySet<string>;
	readonly slug?: string;
	readonly actorProvenance?: ActorProvenance;
	readonly repo?: string;
	readonly planPath?: string;
	readonly primeId?: string;
}

function create(over: CreateOverrides = {}) {
	return createProject({
		description: "Fix the CLI!",
		actor: ACTOR,
		nowMs: T,
		existingSlugs: NO_SLUGS,
		...over,
	});
}

/** A pre-existing project record for setProject specs (hand-built so these
 *  specs do not depend on createProject being correct). */
const BASE: Project = {
	schema_version: 1,
	slug: "fix-the-cli",
	description: "Fix the CLI!",
	repo: "jakkaj/pij",
	planPath: "docs/plans/054/plan.md",
	created: { actor: ACTOR, ts: TS },
};

describe("createProject", () => {
	it("kebab-slugs the description and stamps the project record", () => {
		const { project } = unwrap(create());
		expect(project.slug).toBe("fix-the-cli");
		expect(project.schema_version).toBe(1);
		expect(project.description).toBe("Fix the CLI!");
		expect(project.created).toEqual({ actor: ACTOR, ts: TS });
		expect(isProject(project)).toBe(true);
	});

	it("couples the write to EXACTLY ONE project-created spine event draft", () => {
		const value = unwrap(create());
		// One project, one event — nothing else rides the result.
		expect(Object.keys(value).sort()).toEqual(["event", "project"]);
		const { project, event } = value;
		expect(event).toMatchObject({
			schema_version: 1,
			kind: SPINE_KIND_PROJECT_CREATED,
			actor: ACTOR,
			ts: TS,
			project: "fix-the-cli",
		});
		expect(event.refs).toEqual(["project:fix-the-cli"]);
		// A draft: the log port allocates seq on append, never the caller.
		expect("seq" in event).toBe(false);
		// Same clock stamps both sides of the coupling.
		expect(event.ts).toBe(project.created.ts);
		expect(isSpineEvent({ ...event, seq: 7 })).toBe(true);
	});

	it("resolves a taken base slug to base-2", () => {
		const { project, event } = unwrap(create({ existingSlugs: new Set(["fix-the-cli"]) }));
		expect(project.slug).toBe("fix-the-cli-2");
		expect(event.project).toBe("fix-the-cli-2");
		expect(event.refs).toEqual(["project:fix-the-cli-2"]);
	});

	it("resolves a taken base and base-2 to base-3", () => {
		const { project } = unwrap(
			create({ existingSlugs: new Set(["fix-the-cli", "fix-the-cli-2"]) }),
		);
		expect(project.slug).toBe("fix-the-cli-3");
	});

	it("leaves the base slug unchanged when only unrelated slugs are taken", () => {
		// Membership, not set cardinality, decides collisions.
		const { project } = unwrap(create({ existingSlugs: new Set(["other-project"]) }));
		expect(project.slug).toBe("fix-the-cli");
	});

	it("rejects an empty description with E-ARG naming description", () => {
		const result = create({ description: "" });
		expect(result).toMatchObject({ ok: false, code: "E-ARG" });
		if (!result.ok) expect(result.message).toContain("description");
	});

	it("rejects a symbol-only description (kebab '') with E-ARG naming description", () => {
		const result = create({ description: "?!* ~~~" });
		expect(result).toMatchObject({ ok: false, code: "E-ARG" });
		if (!result.ok) expect(result.message).toContain("description");
	});

	it("leaves repo/planPath/primeId absent when not given — undefined, never null", () => {
		const { project, event } = unwrap(create());
		expect(project.repo).toBeUndefined();
		expect(project.planPath).toBeUndefined();
		expect(project.primeId).toBeUndefined();
		expect(event.repo).toBeUndefined();
		expect(event.actorProvenance).toBeUndefined();
	});

	it("passes repo/planPath/primeId through to the record and repo through to the event", () => {
		const { project, event } = unwrap(
			create({
				repo: "jakkaj/pij",
				planPath: "docs/plans/054/plan.md",
				primeId: "prime-054",
			}),
		);
		expect(project.repo).toBe("jakkaj/pij");
		expect(project.planPath).toBe("docs/plans/054/plan.md");
		expect(project.primeId).toBe("prime-054");
		expect(event.repo).toBe("jakkaj/pij");
		expect(isProject(project)).toBe(true);
		expect(isSpineEvent({ ...event, seq: 7 })).toBe(true);
	});

	it("passes actorProvenance through to the event", () => {
		const { event } = unwrap(create({ actorProvenance: "asserted" }));
		expect(event.actorProvenance).toBe("asserted");
		expect(isSpineEvent({ ...event, seq: 7 })).toBe(true);
	});

	it("uses an explicit slug VERBATIM in the record and the event refs (s057)", () => {
		const { project, event } = unwrap(create({ slug: "chosen-name" }));
		expect(project.slug).toBe("chosen-name");
		expect(project.description).toBe("Fix the CLI!"); // description untouched
		expect(event.project).toBe("chosen-name");
		expect(event.refs).toEqual(["project:chosen-name"]);
		expect(isProject(project)).toBe(true);
	});

	it("rejects an invalid explicit slug with E-ARG (uppercase, spaces, '', over-max)", () => {
		for (const slug of [
			"Chosen-Name",
			"chosen name",
			"",
			"a".repeat(PROJECT_SLUG_MAX_LENGTH + 1),
		]) {
			const result = create({ slug });
			expect(result, slug).toMatchObject({ ok: false, code: "E-ARG" });
			if (!result.ok) expect(result.message).toContain("slug");
		}
	});

	it("rejects an explicit-slug collision with E-ARG — a chosen identity is never renamed", () => {
		const result = create({ slug: "chosen-name", existingSlugs: new Set(["chosen-name"]) });
		expect(result).toMatchObject({ ok: false, code: "E-ARG" });
		if (!result.ok) expect(result.message).toContain("chosen-name");
	});

	it("caps a long-description auto-slug at PROJECT_SLUG_MAX_LENGTH with no trailing hyphen", () => {
		const description =
			"Reusable fresh prime dogfood brief with the known open findings table attached for review";
		const { project } = unwrap(create({ description }));
		expect(project.slug.length).toBeLessThanOrEqual(PROJECT_SLUG_MAX_LENGTH);
		expect(project.slug.endsWith("-")).toBe(false);
		expect(project.slug).toBe(
			kebabSlug(description).slice(0, PROJECT_SLUG_MAX_LENGTH).replace(/-+$/, ""),
		);
		// The FULL description survives on the record — only the slug is capped.
		expect(project.description).toBe(description);
	});

	it("a capped auto-slug still collision-resolves to -2", () => {
		const description =
			"Reusable fresh prime dogfood brief with the known open findings table attached for review";
		const capped = kebabSlug(description).slice(0, PROJECT_SLUG_MAX_LENGTH).replace(/-+$/, "");
		const { project } = unwrap(create({ description, existingSlugs: new Set([capped]) }));
		expect(project.slug).toBe(`${capped}-2`);
	});
});

describe("setProject", () => {
	it("rejects E-ARG when neither planPath nor primeId is given", () => {
		const result = setProject(BASE, { actor: SETTER, nowMs: T2 });
		expect(result).toMatchObject({ ok: false, code: "E-ARG" });
	});

	it("returns a NEW project with planPath updated — input record untouched", () => {
		const before = structuredClone(BASE);
		const { project } = unwrap(
			setProject(BASE, {
				actor: SETTER,
				nowMs: T2,
				planPath: "docs/plans/055/plan.md",
			}),
		);
		expect(project).not.toBe(BASE);
		expect(BASE).toEqual(before);
		expect(project.planPath).toBe("docs/plans/055/plan.md");
		// slug / description / created preserved verbatim.
		expect(project.slug).toBe("fix-the-cli");
		expect(project.description).toBe("Fix the CLI!");
		expect(project.created).toEqual({ actor: ACTOR, ts: TS });
		expect(isProject(project)).toBe(true);
	});

	it("couples the update to EXACTLY ONE project-set spine event draft", () => {
		const value = unwrap(
			setProject(BASE, {
				actor: SETTER,
				nowMs: T2,
				planPath: "docs/plans/055/plan.md",
			}),
		);
		expect(Object.keys(value).sort()).toEqual(["event", "project"]);
		expect(value.event).toMatchObject({
			schema_version: 1,
			kind: SPINE_KIND_PROJECT_SET,
			actor: SETTER,
			ts: TS2,
			project: "fix-the-cli",
		});
		expect(value.event.refs).toEqual(["project:fix-the-cli"]);
		// A draft: the log port allocates seq on append, never the caller.
		expect("seq" in value.event).toBe(false);
		expect(isSpineEvent({ ...value.event, seq: 8 })).toBe(true);
	});

	it("updates primeId alone, preserving existing planPath and repo", () => {
		const { project } = unwrap(
			setProject(BASE, { actor: SETTER, nowMs: T2, primeId: "prime-055" }),
		);
		expect(project.primeId).toBe("prime-055");
		expect(project.planPath).toBe("docs/plans/054/plan.md");
		expect(project.repo).toBe("jakkaj/pij");
	});

	it("updates planPath and primeId together", () => {
		const { project } = unwrap(
			setProject(BASE, {
				actor: SETTER,
				nowMs: T2,
				planPath: "docs/plans/056/plan.md",
				primeId: "prime-056",
			}),
		);
		expect(project.planPath).toBe("docs/plans/056/plan.md");
		expect(project.primeId).toBe("prime-056");
		expect(isProject(project)).toBe(true);
	});

	it("passes actorProvenance through to the set event", () => {
		const { event } = unwrap(
			setProject(BASE, {
				actor: SETTER,
				nowMs: T2,
				primeId: "prime-057",
				actorProvenance: "resolved",
			}),
		);
		expect(event.actorProvenance).toBe("resolved");
	});
});

// ─── review 001 F3 — prev/next audit payload ────────────────────────────────
// AC-03/WS-5: the append-only history alone must answer "who changed what,
// from what, to what". Canonical values ride the envelope's prev/next string
// fields as compact single-line JSON in CONTRACT field order — deterministic
// no matter what key order a disk-parsed record arrives with.

describe("canonicalProjectJson", () => {
	it("serializes the CONTRACT field order as compact single-line JSON", () => {
		expect(canonicalProjectJson(BASE)).toBe(
			`{"schema_version":1,"slug":"fix-the-cli","description":"Fix the CLI!",` +
				`"repo":"jakkaj/pij","planPath":"docs/plans/054/plan.md",` +
				`"created":{"actor":"${ACTOR}","ts":"${TS}"}}`,
		);
	});

	it("is deterministic regardless of disk key order (a set input is disk-parsed JSON)", () => {
		const scrambled = JSON.parse(
			`{"created":{"ts":"${TS}","actor":"${ACTOR}"},"planPath":"docs/plans/054/plan.md",` +
				`"description":"Fix the CLI!","repo":"jakkaj/pij","slug":"fix-the-cli","schema_version":1}`,
		) as Project;
		expect(canonicalProjectJson(scrambled)).toBe(canonicalProjectJson(BASE));
	});

	it("omits absent optionals entirely — no null, no undefined-valued keys", () => {
		const minimal: Project = {
			schema_version: 1,
			slug: "bare",
			description: "Bare",
			created: { actor: ACTOR, ts: TS },
		};
		expect(canonicalProjectJson(minimal)).toBe(
			`{"schema_version":1,"slug":"bare","description":"Bare",` +
				`"created":{"actor":"${ACTOR}","ts":"${TS}"}}`,
		);
	});

	it("carries primeId between planPath and created when present", () => {
		const full: Project = { ...BASE, primeId: "prime-054" };
		expect(canonicalProjectJson(full)).toContain(
			`"planPath":"docs/plans/054/plan.md","primeId":"prime-054","created"`,
		);
	});

	// ─── review 002 G4 — the COMPLETE own record, additive fields included ──
	// The public guards deliberately tolerate unknown fields and setProject
	// preserves them through {...project}, so the store round-trips data this
	// snapshot must not silently erase: known fields in contract order, then
	// unknown OWN fields in stable sorted order, nested records included.

	it("preserves unknown top-level and nested created fields — the reviewer's futureField probe (review 002 G4)", () => {
		const future = JSON.parse(
			`{"futureField":{"z":1,"a":2},"created":{"futureStamp":"s-1","ts":"${TS}","actor":"${ACTOR}"},` +
				`"description":"Fix the CLI!","slug":"fix-the-cli","schema_version":1}`,
		) as Project;
		const canonical = canonicalProjectJson(future);
		// Nothing the store preserves may be dropped from the snapshot.
		expect(JSON.parse(canonical)).toEqual(future);
		// Known fields first in contract order, then unknown own fields sorted;
		// created keeps actor/ts first, then its unknown fields; unknown OBJECT
		// values are deep-key-sorted for determinism.
		expect(canonical).toBe(
			`{"schema_version":1,"slug":"fix-the-cli","description":"Fix the CLI!",` +
				`"created":{"actor":"${ACTOR}","ts":"${TS}","futureStamp":"s-1"},` +
				`"futureField":{"a":2,"z":1}}`,
		);
	});

	it("unknown own fields sort stably among themselves, after every known field", () => {
		const withExtras = JSON.parse(
			`{"zebra":true,"alpha":[3,{"b":1,"a":2}],"primeId":"prime-054",` +
				`"created":{"actor":"${ACTOR}","ts":"${TS}"},"description":"Fix the CLI!",` +
				`"slug":"fix-the-cli","schema_version":1}`,
		) as Project;
		expect(canonicalProjectJson(withExtras)).toBe(
			`{"schema_version":1,"slug":"fix-the-cli","description":"Fix the CLI!",` +
				`"primeId":"prime-054","created":{"actor":"${ACTOR}","ts":"${TS}"},` +
				`"alpha":[3,{"a":2,"b":1}],"zebra":true}`,
		);
	});

	it("stays deterministic across disk key order even WITH unknown fields", () => {
		const one = JSON.parse(
			`{"futureField":1,"slug":"bare","schema_version":1,"description":"Bare",` +
				`"created":{"ts":"${TS}","actor":"${ACTOR}"}}`,
		) as Project;
		const two = JSON.parse(
			`{"schema_version":1,"description":"Bare","created":{"actor":"${ACTOR}","ts":"${TS}"},` +
				`"slug":"bare","futureField":1}`,
		) as Project;
		expect(canonicalProjectJson(one)).toBe(canonicalProjectJson(two));
	});

	// ─── review 003 M4 — a valid JSON own key named __proto__ ───────────────
	// JSON.parse creates "__proto__" as an ORDINARY own property, the guards
	// tolerate it, and the store/spread paths preserve it — but assigning
	// `out[key] = value` on a plain {} object invokes the legacy prototype
	// setter for that one key and silently drops it from the snapshot.

	it("preserves a top-level own __proto__ field — the reviewer's hostile-key probe (review 003 M4)", () => {
		const hostile = JSON.parse(
			`{"schema_version":1,"slug":"bare","description":"Bare",` +
				`"created":{"actor":"${ACTOR}","ts":"${TS}"},"__proto__":{"polluted":true}}`,
		) as Project;
		// The input really carries it as an own key (JSON.parse semantics)…
		expect(Object.keys(hostile)).toContain("__proto__");
		// …so the canonical snapshot must too — byte-exact, sorted among unknowns.
		expect(canonicalProjectJson(hostile)).toBe(
			`{"schema_version":1,"slug":"bare","description":"Bare",` +
				`"created":{"actor":"${ACTOR}","ts":"${TS}"},"__proto__":{"polluted":true}}`,
		);
	});

	it("preserves created.__proto__ and __proto__ inside unknown nested objects (review 003 M4)", () => {
		const hostile = JSON.parse(
			`{"schema_version":1,"slug":"bare","description":"Bare",` +
				`"created":{"actor":"${ACTOR}","ts":"${TS}","__proto__":"stamped"},` +
				`"futureField":{"z":1,"__proto__":{"x":2}}}`,
		) as Project;
		expect(canonicalProjectJson(hostile)).toBe(
			`{"schema_version":1,"slug":"bare","description":"Bare",` +
				`"created":{"actor":"${ACTOR}","ts":"${TS}","__proto__":"stamped"},` +
				`"futureField":{"__proto__":{"x":2},"z":1}}`,
		);
	});

	it("setProject's prev/next carry an own __proto__ exactly as the store spread does (review 003 M4)", () => {
		const hostile = JSON.parse(
			`{"schema_version":1,"slug":"fix-the-cli","description":"Fix the CLI!",` +
				`"created":{"actor":"${ACTOR}","ts":"${TS}"},"__proto__":{"kept":true}}`,
		) as Project;
		const write = setProject(hostile, { actor: ACTOR, nowMs: T2, planPath: "docs/p.md" });
		if (!write.ok) throw new Error(`${write.code}: ${write.message}`);
		// The spread path preserves the own key on the persisted record…
		expect(Object.keys(write.value.project)).toContain("__proto__");
		// …so the audit chain must carry it on BOTH sides, no silent gap.
		expect(write.value.event.prev as string).toContain('"__proto__":{"kept":true}');
		expect(write.value.event.next as string).toContain('"__proto__":{"kept":true}');
	});

	it("setProject's prev/next carry preserved unknown fields through the audit chain (review 002 G4)", () => {
		const withFuture = JSON.parse(
			`{"schema_version":1,"slug":"fix-the-cli","description":"Fix the CLI!",` +
				`"futureField":"kept","created":{"actor":"${ACTOR}","ts":"${TS}","futureStamp":"s-1"}}`,
		) as Project;
		const write = setProject(withFuture, { actor: ACTOR, nowMs: T2, planPath: "docs/p.md" });
		if (!write.ok) throw new Error(`${write.code}: ${write.message}`);
		// The store persists the unknown fields (spread-preserved)…
		expect((write.value.project as Record<string, unknown>).futureField).toBe("kept");
		// …so prev AND next must both carry them — no silent audit-chain gap.
		expect(JSON.parse(write.value.event.prev as string)).toEqual(withFuture);
		expect(JSON.parse(write.value.event.next as string)).toEqual(write.value.project);
	});
});

describe("prev/next on project events (review 001 F3)", () => {
	it("project-created carries next = canonical new record and NO prev key", () => {
		const { project, event } = unwrap(create({ repo: "jakkaj/pij" }));
		expect(event.next).toBe(canonicalProjectJson(project));
		expect("prev" in event).toBe(false);
		expect(isSpineEvent({ ...event, seq: 7 })).toBe(true);
	});

	it("project-created next parses back to the exact persisted record", () => {
		const { project, event } = unwrap(create({ planPath: "docs/plans/054/plan.md" }));
		expect(JSON.parse(event.next as string)).toEqual(project);
	});

	it("project-set carries prev = canonical old and next = canonical new", () => {
		const { project, event } = unwrap(
			setProject(BASE, { actor: SETTER, nowMs: T2, primeId: "prime-055" }),
		);
		expect(event.prev).toBe(canonicalProjectJson(BASE));
		expect(event.next).toBe(canonicalProjectJson(project));
		expect(event.prev).not.toBe(event.next);
		// The history alone answers WHAT changed: parse both sides, diff the field.
		const prev = JSON.parse(event.prev as string) as Project;
		const next = JSON.parse(event.next as string) as Project;
		expect(prev.primeId).toBeUndefined();
		expect(next.primeId).toBe("prime-055");
		expect(isSpineEvent({ ...event, seq: 8 })).toBe(true);
	});

	it("project-set prev is canonical even when the input record is disk-parsed in foreign key order", () => {
		const scrambled = JSON.parse(
			`{"planPath":"docs/plans/054/plan.md","slug":"fix-the-cli","schema_version":1,` +
				`"created":{"ts":"${TS}","actor":"${ACTOR}"},"repo":"jakkaj/pij","description":"Fix the CLI!"}`,
		) as Project;
		const { event } = unwrap(
			setProject(scrambled, { actor: SETTER, nowMs: T2, primeId: "prime-055" }),
		);
		expect(event.prev).toBe(canonicalProjectJson(BASE));
	});

	it("no-op set still couples: event carries IDENTICAL prev/next (ruled — audited intent beats delta-skip)", () => {
		const { project, event } = unwrap(
			setProject(BASE, { actor: SETTER, nowMs: T2, planPath: BASE.planPath }),
		);
		expect(project).toEqual(BASE);
		expect(event.prev).toBe(event.next);
		expect(event.prev).toBe(canonicalProjectJson(BASE));
	});
});

// ─── review 001 F7 — invalid clocks are E-ARG through the project verbs ────

describe("project verbs reject invalid clocks (review 001 F7)", () => {
	it.each([
		["NaN", Number.NaN],
		["one past TimeClip", 8.64e15 + 1],
	])("createProject with nowMs %s is E-ARG naming nowMs — never a RangeError", (_label, bad) => {
		const result = createProject({
			description: "Fix the CLI!",
			actor: ACTOR,
			nowMs: bad,
			existingSlugs: NO_SLUGS,
		});
		expect(result).toMatchObject({ ok: false, code: "E-ARG" });
		if (!result.ok) expect(result.message).toContain("nowMs");
	});

	it.each([
		["NaN", Number.NaN],
		["one past TimeClip", 8.64e15 + 1],
	])("setProject with nowMs %s is E-ARG naming nowMs — never a RangeError", (_label, bad) => {
		const result = setProject(BASE, { actor: SETTER, nowMs: bad, primeId: "prime-055" });
		expect(result).toMatchObject({ ok: false, code: "E-ARG" });
		if (!result.ok) expect(result.message).toContain("nowMs");
	});
});
