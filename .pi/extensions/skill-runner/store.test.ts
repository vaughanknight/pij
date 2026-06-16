import { describe, expect, it } from "vitest";

import { extractSkills, matchSkill, type SkillCommandLike, scoreSkill } from "./store.js";

function skillCmd(
	name: string,
	opts: { description?: string; path?: string; baseDir?: string; source?: string } = {},
): SkillCommandLike {
	return {
		name: `skill:${name}`,
		description: opts.description,
		source: opts.source ?? "skill",
		sourceInfo: {
			path: opts.path ?? `/skills/${name}/SKILL.md`,
			baseDir: opts.baseDir,
		},
	};
}

describe("extractSkills", () => {
	it("returns nothing when no commands are skills", () => {
		const cmds: SkillCommandLike[] = [
			{ name: "skill:foo", source: "prompt", sourceInfo: { path: "/x" } },
			{ name: "reload", source: "extension", sourceInfo: { path: "/y" } },
		];
		expect(extractSkills(cmds)).toEqual([]);
	});

	it("strips the skill: prefix and sorts by name", () => {
		const skills = extractSkills([skillCmd("validate"), skillCmd("brainstorm")]);
		expect(skills.map((s) => s.name)).toEqual(["brainstorm", "validate"]);
	});

	it("drops skill commands missing a usable path", () => {
		const cmds: SkillCommandLike[] = [
			{ name: "skill:nopath", source: "skill", sourceInfo: { path: "" } },
			{ name: "skill:", source: "skill", sourceInfo: { path: "/p" } },
		];
		expect(extractSkills(cmds)).toEqual([]);
	});

	it("carries description and baseDir through", () => {
		const [s] = extractSkills([
			skillCmd("pdf", { description: "work with PDFs", baseDir: "/skills/pdf" }),
		]);
		expect(s).toMatchObject({
			name: "pdf",
			description: "work with PDFs",
			baseDir: "/skills/pdf",
		});
	});
});

describe("matchSkill", () => {
	const skills = extractSkills([
		skillCmd("validate", { description: "run validation checks on the project" }),
		skillCmd("brainstorm", { description: "generate ideas" }),
		skillCmd("pdf-tools", { description: "extract text from PDF documents" }),
	]);

	it("reports no_skills on empty registry", () => {
		expect(matchSkill("anything", [])).toEqual({ ok: false, reason: "no_skills" });
	});

	it("matches an exact name", () => {
		const r = matchSkill("validate", skills);
		expect(r).toEqual({ ok: true, skill: expect.objectContaining({ name: "validate" }) });
	});

	it("matches a fuzzy intent against the description", () => {
		const r = matchSkill("validation", skills);
		expect(r.ok && r.skill.name).toBe("validate");
	});

	it("matches a prefix", () => {
		const r = matchSkill("brain", skills);
		expect(r.ok && r.skill.name).toBe("brainstorm");
	});

	it("normalizes spaces/underscores to hyphens", () => {
		const r = matchSkill("pdf tools", skills);
		expect(r.ok && r.skill.name).toBe("pdf-tools");
	});

	it("returns no_match when nothing scores", () => {
		const r = matchSkill("zzz-nonexistent", skills);
		expect(r).toMatchObject({ ok: false, reason: "no_match" });
	});

	it("reports ambiguous when weak matches tie", () => {
		const ambiguous = extractSkills([
			skillCmd("alpha", { description: "shared keyword report" }),
			skillCmd("beta", { description: "shared keyword report" }),
		]);
		const r = matchSkill("report", ambiguous);
		expect(r).toMatchObject({ ok: false, reason: "ambiguous" });
		if (!r.ok && r.reason === "ambiguous") {
			expect(r.candidates.map((c) => c.name).sort()).toEqual(["alpha", "beta"]);
		}
	});

	it("a decisive exact hit beats a tie band", () => {
		const r = matchSkill(
			"alpha",
			extractSkills([
				skillCmd("alpha", { description: "x" }),
				skillCmd("alphabet", { description: "x" }),
			]),
		);
		expect(r.ok && r.skill.name).toBe("alpha");
	});
});

describe("scoreSkill", () => {
	const [s] = extractSkills([skillCmd("validate", { description: "checks things" })]);
	it("scores exact name highest", () => {
		expect(scoreSkill("validate", s)).toBeGreaterThan(scoreSkill("valid", s));
	});
	it("scores empty query zero", () => {
		expect(scoreSkill("", s)).toBe(0);
	});
});
