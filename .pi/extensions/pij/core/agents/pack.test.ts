import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverAgents, discoverInDir, isPack, parsePackMeta } from "./pack.js";

let root: string;

/** Write a pack: `<root>/<sourceDir>/<slug>/prompt.md` with the given body. */
function writePack(sourceDir: string, slug: string, promptBody: string): string {
	const dir = join(root, sourceDir, slug);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "prompt.md"), promptBody);
	return dir;
}

function fm(fields: Record<string, string>, body = "Do the thing."): string {
	const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
	return `---\n${lines.join("\n")}\n---\n${body}`;
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "pij-pack-"));
});
afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("pack — detection", () => {
	it("a dir is a pack iff it contains prompt.md", () => {
		const dir = writePack("agents", "alpha", "hello");
		expect(isPack(dir)).toBe(true);
		expect(isPack(join(root, "agents", "does-not-exist"))).toBe(false);
	});
});

describe("pack — frontmatter meta", () => {
	it("parses description/tags/model/reasoning + the pij-only harness hint", () => {
		const meta = parsePackMeta(
			fm({
				description: "Alpha pack",
				tags: "[x, y]",
				model: "sonnet",
				reasoning: "low",
				harness: "claude",
			}),
		);
		expect(meta).toEqual({
			description: "Alpha pack",
			tags: ["x", "y"],
			model: "sonnet",
			reasoning: "low",
			harness: "claude",
		});
	});

	it("accepts a frontmatter-less pack (hello-world shape: prompt.md alone)", () => {
		const meta = parsePackMeta("Just a prompt, no frontmatter.\n");
		expect(meta.description).toBe("");
		expect(meta.tags).toEqual([]);
		expect(meta.model).toBeUndefined();
		expect(meta.harness).toBeUndefined();
	});

	it("handles quoted harness values", () => {
		expect(parsePackMeta(fm({ harness: '"codex"' })).harness).toBe("codex");
	});
});

describe("pack — single-dir discovery", () => {
	it("finds every prompt.md pack and skips underscore/dot dirs and non-packs", () => {
		writePack("agents", "alpha", fm({ description: "A" }));
		writePack("agents", "beta", fm({ description: "B" }));
		writePack("agents", "_shared", "not an agent");
		writePack("agents", ".hidden", "not an agent");
		// a plain dir with no prompt.md is not a pack
		mkdirSync(join(root, "agents", "empty-dir"), { recursive: true });

		const found = discoverInDir(join(root, "agents"), "project");
		expect(found.map((a) => a.slug).sort()).toEqual(["alpha", "beta"]);
		expect(found.every((a) => a.source === "project")).toBe(true);
		expect(found.every((a) => a.shadowed === false)).toBe(true);
	});

	it("returns [] for a missing source dir (no throw)", () => {
		expect(discoverInDir(join(root, "nope"), "user")).toEqual([]);
	});
});

describe("pack — 3-tier precedence + shadowing (AC-01 logic)", () => {
	it("project shadows user shadows built-in; shadowed entries are marked, not dropped", () => {
		// `shared` exists in all three; `proj-only`/`user-only`/`builtin-only` are unique.
		writePack("project", "shared", fm({ description: "project shared", model: "opus" }));
		writePack("project", "proj-only", fm({ description: "P" }));
		writePack("user", "shared", fm({ description: "user shared" }));
		writePack("user", "user-only", fm({ description: "U" }));
		writePack("builtin", "shared", fm({ description: "builtin shared" }));
		writePack("builtin", "builtin-only", fm({ description: "B" }));

		const merged = discoverAgents([
			{ dir: join(root, "project"), source: "project" },
			{ dir: join(root, "user"), source: "user" },
			{ dir: join(root, "builtin"), source: "builtin" },
		]);

		// The winning `shared` is the project one, not shadowed.
		const winner = merged.find((a) => a.slug === "shared" && !a.shadowed);
		expect(winner?.source).toBe("project");
		expect(winner?.description).toBe("project shared");
		expect(winner?.model).toBe("opus");

		// The user + builtin `shared` entries are present but marked shadowed.
		const shadows = merged.filter((a) => a.slug === "shared" && a.shadowed);
		expect(shadows.map((a) => a.source).sort()).toEqual(["builtin", "user"]);

		// Unique slugs are never shadowed.
		for (const slug of ["proj-only", "user-only", "builtin-only"]) {
			expect(merged.find((a) => a.slug === slug)?.shadowed).toBe(false);
		}
	});

	it("respects the array order as the precedence order", () => {
		writePack("a", "dup", fm({ description: "from-a" }));
		writePack("b", "dup", fm({ description: "from-b" }));

		// user before project → the user copy wins here (order is authoritative).
		const merged = discoverAgents([
			{ dir: join(root, "b"), source: "user" },
			{ dir: join(root, "a"), source: "project" },
		]);
		const winner = merged.find((a) => !a.shadowed && a.slug === "dup");
		expect(winner?.source).toBe("user");
		expect(winner?.description).toBe("from-b");
	});
});
