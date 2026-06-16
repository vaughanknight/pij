/**
 * skill-runner — make pi's loaded skills discoverable AND runnable as
 * first-class agent tools.
 *
 * Pi natively only injects passive skill *descriptions* into the system
 * prompt and relies on the model voluntarily reading SKILL.md or the user
 * typing /skill:name. This extension closes that gap:
 *
 *   - skills_list  → enumerate every loaded skill (name + description).
 *   - skills_run   → fuzzy-match an intent ("validate") to one skill and
 *                    return its full SKILL.md content for the agent to apply.
 *
 * Mechanism (harvested from tungthedev/pi-extensions `skill` tool): skills
 * surface in pi's slash-command registry as `source === "skill"` commands
 * named `skill:<name>`, with `sourceInfo.path` pointing at SKILL.md.
 */
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
	ExtensionAPI,
	ExtensionCommandContext,
	SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { extractSkills, matchSkill, type Skill } from "./store.js";

function loadSkills(pi: ExtensionAPI): Skill[] {
	// SlashCommandInfo is structurally compatible with SkillCommandLike.
	return extractSkills(pi.getCommands() as SlashCommandInfo[]);
}

function formatSkillLine(skill: Skill): string {
	const desc = skill.description?.trim();
	return desc ? `- ${skill.name} — ${desc}` : `- ${skill.name}`;
}

export default function (pi: ExtensionAPI) {
	// ── /skills : human-facing list in the TUI ──────────────────────────
	pi.registerCommand("skills", {
		description: "List the skills pi has loaded for this session",
		handler: async (_args: string, ctx: ExtensionCommandContext): Promise<void> => {
			const skills = loadSkills(pi);
			if (skills.length === 0) {
				ctx.ui.notify("No skills loaded in this session.", "warning");
				return;
			}
			const lines = skills.map(formatSkillLine).join("\n");
			ctx.ui.notify(`${skills.length} skill(s) loaded:\n${lines}`, "info");
		},
	});

	// ── skills_list : agent-callable enumeration ────────────────────────
	pi.registerTool({
		name: "skills_list",
		label: "List skills",
		description:
			"List every skill pi has loaded for this session (name + description). " +
			"Call this to discover available skills before running one.",
		parameters: Type.Object({}),
		async execute(_id, _params, _signal, _onUpdate, _ctx) {
			const skills = loadSkills(pi);
			if (skills.length === 0) {
				return {
					content: [
						{
							type: "text" as const,
							text: "No skills loaded in this session.",
						},
					],
					details: { count: 0 },
				};
			}
			const text = [`${skills.length} skill(s) loaded:`, ...skills.map(formatSkillLine)].join("\n");
			return {
				content: [{ type: "text" as const, text }],
				details: {
					count: skills.length,
					skills: skills.map((s) => ({ name: s.name, path: s.path })),
				},
			};
		},
	});

	// ── skills_run : fuzzy-match + load a skill's instructions ──────────
	pi.registerTool({
		name: "skills_run",
		label: "Run skill",
		description:
			'Find a loaded skill by name or intent (e.g. "validate") and return ' +
			"its full instructions for you to follow. Fuzzy-matches against skill " +
			"names and descriptions; reports candidates when ambiguous.",
		parameters: Type.Object({
			query: Type.String({
				description: "Skill name or short intent describing what you want to do.",
			}),
		}),
		async execute(_id, params, _signal, _onUpdate, _ctx) {
			const skills = loadSkills(pi);
			const result = matchSkill(params.query, skills);

			if (!result.ok) {
				let text: string;
				switch (result.reason) {
					case "no_skills":
						text = "No skills are loaded in this session.";
						break;
					case "no_match":
						text =
							`No skill matched "${result.query}". ` +
							(skills.length > 0
								? `Available: ${skills.map((s) => s.name).join(", ")}.`
								: "No skills loaded in this session.");
						break;
					case "ambiguous":
						text =
							`"${result.query}" is ambiguous. Candidates:\n` +
							result.candidates.map(formatSkillLine).join("\n") +
							"\nCall skills_run again with a more specific name.";
						break;
				}
				return {
					content: [{ type: "text" as const, text }],
					details: { matched: false, reason: result.reason },
				};
			}

			const { skill } = result;
			let content: string;
			try {
				content = await readFile(skill.path, "utf8");
			} catch (err) {
				const reason = err instanceof Error ? err.message : String(err);
				return {
					content: [
						{
							type: "text" as const,
							text: `Matched skill "${skill.name}" but could not read its instructions at ${skill.path}: ${reason}`,
						},
					],
					details: { matched: true, name: skill.name, path: skill.path, readError: reason },
				};
			}
			const skillDir = skill.baseDir ?? dirname(skill.path);
			return {
				content: [
					{
						type: "text" as const,
						text: `# Skill: ${skill.name}\n` + `(loaded from ${skill.path})\n\n${content}`,
					},
				],
				details: {
					matched: true,
					name: skill.name,
					skill_dir: skillDir,
					path: skill.path,
				},
			};
		},
	});
}
