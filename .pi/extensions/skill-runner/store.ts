// SkillRunnerStore — pi-free data layer (Pattern P2).
//
// Imports nothing from @earendil-works/*. Pure logic over plain data:
// turn the slash-command registry into a skill list, and fuzzy-match an
// intent string ("validate") to a single skill. Tested in plain Node.

// ─── limits (Pattern P5: live with the data they constrain) ──────────────
export const MAX_CANDIDATES = 5;

// ─── domain ──────────────────────────────────────────────────────────────

// Pattern P6: structural entry type at the boundary. We accept anything
// shaped like a pi SlashCommandInfo without importing pi's type, so the
// store stays pi-free and trivially testable.
export interface SkillCommandLike {
	readonly name: string;
	readonly description?: string;
	readonly source: string;
	readonly sourceInfo?: { readonly path?: string; readonly baseDir?: string };
}

export interface Skill {
	/** Bare skill name, e.g. "validate" (the "skill:" prefix is stripped). */
	readonly name: string;
	readonly description?: string;
	/** Absolute path to SKILL.md (or the skill's .md file). */
	readonly path: string;
	readonly baseDir?: string;
}

// Pattern P4: tagged-union returns over throws.
export type MatchResult =
	| { ok: true; skill: Skill }
	| { ok: false; reason: "no_skills" }
	| { ok: false; reason: "no_match"; query: string }
	| { ok: false; reason: "ambiguous"; query: string; candidates: Skill[] };

const SKILL_PREFIX = "skill:";

/**
 * Extract the loaded skills from pi's slash-command registry. Skills surface
 * as commands with `source === "skill"` and `name === "skill:<bare>"`.
 * Pattern P7: narrow structurally; drop anything missing a usable path.
 */
export function extractSkills(commands: Iterable<SkillCommandLike>): Skill[] {
	const skills: Skill[] = [];
	for (const cmd of commands) {
		if (cmd.source !== "skill") continue;
		if (typeof cmd.name !== "string" || !cmd.name.startsWith(SKILL_PREFIX)) {
			continue;
		}
		const path = cmd.sourceInfo?.path;
		if (typeof path !== "string" || path.length === 0) continue;
		const name = cmd.name.slice(SKILL_PREFIX.length).trim();
		if (name.length === 0) continue;
		skills.push({
			name,
			description: cmd.description,
			path,
			baseDir: cmd.sourceInfo?.baseDir,
		});
	}
	// Stable, predictable ordering for listing + ambiguity reporting.
	skills.sort((a, b) => a.name.localeCompare(b.name));
	return skills;
}

function normalize(value: string): string {
	return value
		.toLowerCase()
		.replace(/[_\s]+/g, "-")
		.trim();
}

function tokenize(value: string): string[] {
	return normalize(value)
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length > 0);
}

/**
 * Score how well a skill answers `query`. Higher is better; 0 = no signal.
 * Layered heuristics: exact name > name substring > token overlap on
 * name+description.
 */
export function scoreSkill(query: string, skill: Skill): number {
	const q = normalize(query);
	if (q.length === 0) return 0;
	const name = normalize(skill.name);

	if (name === q) return 1000;
	if (name.startsWith(q)) return 500 + q.length;
	if (name.includes(q)) return 300 + q.length;

	const qTokens = new Set(tokenize(query));
	if (qTokens.size === 0) return 0;
	const nameTokens = new Set(tokenize(skill.name));
	const descTokens = new Set(tokenize(skill.description ?? ""));

	let score = 0;
	for (const t of qTokens) {
		if (nameTokens.has(t)) score += 40;
		else if (descTokens.has(t)) score += 10;
	}
	return score;
}

/**
 * Resolve an intent string to a single skill. Ties within `tieBand` of the
 * top score are reported as ambiguous rather than guessed (Pattern P4).
 */
export function matchSkill(query: string, skills: Skill[]): MatchResult {
	if (skills.length === 0) return { ok: false, reason: "no_skills" };
	const trimmed = query.trim();
	if (trimmed.length === 0) {
		return { ok: false, reason: "no_match", query };
	}

	const scored = skills
		.map((skill) => ({ skill, score: scoreSkill(trimmed, skill) }))
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score);

	if (scored.length === 0) return { ok: false, reason: "no_match", query };

	const top = scored[0];
	if (!top) return { ok: false, reason: "no_match", query };
	// A decisive exact/prefix/substring hit (score >= 300) wins outright.
	const tieBand = top.score >= 300 ? 0 : 20;
	const tied = scored.filter((s) => top.score - s.score <= tieBand);
	if (tied.length > 1) {
		return {
			ok: false,
			reason: "ambiguous",
			query,
			candidates: tied.slice(0, MAX_CANDIDATES).map((s) => s.skill),
		};
	}
	return { ok: true, skill: top.skill };
}
