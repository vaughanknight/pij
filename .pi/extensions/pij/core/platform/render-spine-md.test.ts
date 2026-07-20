// renderSpineMd — pure spine → markdown (plan 054 P4 T001, AC-10).
//
// Behavior contract only: the render is a PURE function of its input —
// byte-stable for identical input (double-render + deep-clone pins), tolerant
// of unknown kinds and additive fields (rendered honestly, never dropped),
// and a valid header-only document for an empty spine. No fs, no clock —
// the platform purity sensor covers this module automatically.

import { describe, expect, it } from "vitest";
import { renderSpineMd } from "./render-spine-md.js";
import type { SpineEvent } from "./types.js";

function ev(seq: number, kind: string, extra: Partial<SpineEvent> = {}): SpineEvent {
	return {
		schema_version: 1,
		seq,
		ts: `2026-07-17T0${seq % 10}:00:00.000Z`,
		actor: "pij-tester",
		kind,
		refs: [],
		...extra,
	};
}

describe("renderSpineMd — empty spine", () => {
	it("renders a valid header-only document", () => {
		const doc = renderSpineMd([]);
		expect(doc.startsWith("# pij spine")).toBe(true);
		expect(doc).toContain("pij spine render"); // regeneration pointer
		expect(doc).toContain("_No events._");
		expect(doc.endsWith("\n")).toBe(true);
	});

	it("is byte-stable", () => {
		expect(renderSpineMd([])).toBe(renderSpineMd([]));
	});
});

describe("renderSpineMd — current kinds render with full attribution", () => {
	const events: SpineEvent[] = [
		ev(1, "project-created", { project: "alpha", actorProvenance: "resolved" }),
		ev(2, "project-set", { project: "alpha", prev: "{}", next: '{"planPath":"p.md"}' }),
		ev(3, "task-set", {
			peer: "pij-node",
			project: "alpha",
			refs: ["assignment:asg-general-pij-node"],
			next: '{"task":"build"}',
		}),
		ev(4, "state-set", {
			peer: "pij-node",
			refs: ["assignment:asg-general-pij-node", "state:ready"],
			prev: '{"task":"build"}',
			next: '{"task":"build"}',
		}),
		ev(5, "state-verified", { peer: "pij-node", verifiedBy: "pij-parent" }),
		ev(6, "state-cleared", {
			peer: "pij-node",
			refs: ["assignment:asg-general-pij-node", "transition:clear"],
			prev: '{"task":"build"}',
			next: '{"task":"build"}',
		}),
		ev(7, "system-state", { actor: "daemon", peer: "pij-node", prev: "working", next: "idle" }),
		ev(8, "node-linked", {
			peer: "pij-child",
			refs: ["node:pij-child", "parent:pij-new"],
			prev: "pij-old",
			next: "pij-new",
			actorProvenance: "asserted",
		}),
	];

	const doc = renderSpineMd(events);

	it("renders every event's seq + kind", () => {
		for (const e of events) {
			expect(doc).toContain(`### ${e.seq} · ${e.kind}`);
		}
	});

	it("renders attribution: actor, ts, provenance when present", () => {
		expect(doc).toContain("actor: pij-tester (resolved)"); // seq 1
		expect(doc).toContain("actor: daemon"); // seq 6, no provenance suffix
		expect(doc).toContain("actor: pij-tester (asserted)"); // seq 7
		expect(doc).toContain("2026-07-17T01:00:00.000Z");
	});

	it("renders prev/next transitions and refs", () => {
		expect(doc).toContain("prev: pij-old");
		expect(doc).toContain("next: pij-new");
		expect(doc).toContain("prev: working");
		expect(doc).toContain("refs: node:pij-child, parent:pij-new");
	});

	it("renders a project-set's record blobs FIELD-LEVEL, changed keys only (s057)", () => {
		// seq 2: prev {} → next {"planPath":"p.md"} — one changed field, no raw blob.
		expect(doc).toContain('- planPath: ∅ → "p.md"');
		expect(doc).not.toContain("- prev: {}");
		expect(doc).not.toContain('- next: {"planPath":"p.md"}');
	});

	it("renders peer/project scoping and verifiedBy", () => {
		expect(doc).toContain("peer: pij-node");
		expect(doc).toContain("project: alpha");
		expect(doc).toContain("verifiedBy: pij-parent");
	});

	it("renders state-cleared's coupled no-op record canonically", () => {
		const section = doc.slice(doc.indexOf("### 6 · state-cleared"), doc.indexOf("### 7 ·"));
		expect(section).toContain("- (no field changes)");
		expect(section).toContain("transition:clear");
		expect(section).not.toContain('- prev: {"task":"build"}');
	});

	it("summarises the log (count + last seq) in the header", () => {
		expect(doc).toContain("8 events");
		expect(doc).toContain("seq 1–8");
	});

	it("renders events in log order and leaves the input untouched", () => {
		const copy = events.map((e) => ({ ...e, refs: [...e.refs] }));
		renderSpineMd(events);
		expect(events).toEqual(copy);
		expect(doc.indexOf("### 1 ·")).toBeLessThan(doc.indexOf("### 8 ·"));
	});
});

describe("renderSpineMd — honesty under openness", () => {
	it("renders unknown kinds rather than dropping them (WS-5 open vocabulary)", () => {
		const doc = renderSpineMd([ev(9, "custom-external-kind")]);
		expect(doc).toContain("### 9 · custom-external-kind");
	});

	it("renders a root-link honestly: prev without inventing a next", () => {
		const doc = renderSpineMd([
			ev(4, "node-linked", { peer: "pij-c", refs: ["node:pij-c"], prev: "pij-stray" }),
		]);
		expect(doc).toContain("prev: pij-stray");
		expect(doc).not.toContain("next:");
	});

	it("renders additive/unknown fields honestly, never silently drops them", () => {
		const withExtra = { ...ev(2, "state-set"), annotation: { source: "external" } };
		const doc = renderSpineMd([withExtra as SpineEvent]);
		expect(doc).toContain("annotation");
		expect(doc).toContain('{"source":"external"}');
	});

	it("renders a project-created's next record field-level, keys sorted (s057)", () => {
		const doc = renderSpineMd([
			ev(5, "project-created", {
				project: "alpha",
				next: '{"schema_version":1,"slug":"alpha","description":"Alpha!"}',
			}),
		]);
		expect(doc).toContain('- description: "Alpha!"');
		expect(doc).toContain("- schema_version: 1");
		expect(doc).toContain('- slug: "alpha"');
		expect(doc).not.toContain("- next: {");
		// determinism: sorted keys, description before schema_version before slug.
		expect(doc.indexOf("- description:")).toBeLessThan(doc.indexOf("- schema_version:"));
		expect(doc.indexOf("- schema_version:")).toBeLessThan(doc.indexOf("- slug:"));
	});

	it("compresses a no-op project-set (prev === next) to one honest line", () => {
		const blob = '{"slug":"alpha","planPath":"p.md"}';
		const doc = renderSpineMd([ev(6, "project-set", { project: "alpha", prev: blob, next: blob })]);
		expect(doc).toContain("- (no field changes)");
		expect(doc).not.toContain("- prev:");
		expect(doc).not.toContain("- next:");
	});

	it("falls back to the RAW prev/next lines when a project blob is not JSON (WS-5 honesty)", () => {
		const doc = renderSpineMd([
			ev(7, "project-set", { project: "alpha", prev: "not-json", next: '{"slug":"alpha"}' }),
		]);
		expect(doc).toContain("- prev: not-json");
		expect(doc).toContain('- next: {"slug":"alpha"}');
	});

	it("falls back raw for a project-created that carries a contract-breaking prev", () => {
		const doc = renderSpineMd([
			ev(8, "project-created", { project: "alpha", prev: "{}", next: '{"slug":"alpha"}' }),
		]);
		expect(doc).toContain("- prev: {}");
		expect(doc).toContain('- next: {"slug":"alpha"}');
	});

	it("skips no known envelope field when present (nothing dropped)", () => {
		const full = ev(3, "task-set", {
			peer: "p",
			project: "q",
			repo: "r",
			refs: ["a:b"],
			prev: "x",
			next: "y",
			verifiedBy: "v",
			actorProvenance: "resolved",
		});
		const doc = renderSpineMd([full]);
		for (const needle of [
			"peer: p",
			"project: q",
			"repo: r",
			"refs: a:b",
			"prev: x",
			"next: y",
			"verifiedBy: v",
		]) {
			expect(doc).toContain(needle);
		}
	});
});

describe("renderSpineMd — byte stability (AC-10)", () => {
	const events = [
		ev(1, "project-created", { project: "alpha", actorProvenance: "resolved" }),
		ev(2, "node-linked", { peer: "pij-c", refs: ["node:pij-c", "parent:pij-p"], next: "pij-p" }),
		ev(3, "project-set", {
			project: "alpha",
			prev: '{"slug":"alpha","planPath":"old.md"}',
			next: '{"slug":"alpha","planPath":"new.md"}',
		}),
	];

	it("double render is byte-identical", () => {
		expect(renderSpineMd(events)).toBe(renderSpineMd(events));
	});

	it("a JSON round-tripped clone renders byte-identically", () => {
		const clone = JSON.parse(JSON.stringify(events)) as SpineEvent[];
		expect(renderSpineMd(clone)).toBe(renderSpineMd(events));
	});

	it("pins the exact document for a small fixture", () => {
		const doc = renderSpineMd(events);
		expect(doc).toBe(
			[
				"# pij spine",
				"",
				"Machine-generated from `spine/events.ndjson` — do not hand-edit. Regenerate with `pij spine render`.",
				"",
				"3 events · seq 1–3",
				"",
				"## Events",
				"",
				"### 1 · project-created",
				"",
				"- ts: 2026-07-17T01:00:00.000Z",
				"- actor: pij-tester (resolved)",
				"- project: alpha",
				"",
				"### 2 · node-linked",
				"",
				"- ts: 2026-07-17T02:00:00.000Z",
				"- actor: pij-tester",
				"- peer: pij-c",
				"- next: pij-p",
				"- refs: node:pij-c, parent:pij-p",
				"",
				"### 3 · project-set",
				"",
				"- ts: 2026-07-17T03:00:00.000Z",
				"- actor: pij-tester",
				"- project: alpha",
				'- planPath: "old.md" → "new.md"',
				"",
			].join("\n"),
		);
	});
});
