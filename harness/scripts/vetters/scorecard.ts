// Fetches OpenSSF Scorecard via api.scorecard.dev. 404s are common for
// small pi extensions — fail-soft to `info`. Network errors → `warn`.
//
// Source-to-Scorecard mapping:
//   npm:<name>                       → npm:<name>
//   github:<owner>/<repo>            → github.com/<owner>/<repo>
//   https://github.com/<o>/<r>(.git) → github.com/<o>/<r>
//   git:[https://]github.com/<o>/<r>[@ref] → github.com/<o>/<r>

import { deriveLevel, deriveScore, type Finding, type Verdict, type Vetter } from "./types.js";

interface ScorecardCheck {
	name: string;
	score: number; // -1 .. 10
	reason?: string;
}

interface ScorecardResponse {
	score?: number;
	checks?: ScorecardCheck[];
}

export interface ScorecardTarget {
	platform: "github.com" | "npm";
	owner?: string;
	name: string;
}

export function parseSource(source: string): ScorecardTarget | null {
	// strip leading "git:" if present
	let s = source.replace(/^git:/, "");

	// npm:<name>[@version]
	const npmMatch = s.match(/^npm:(@?[^@]+)(?:@[^@]+)?$/);
	if (npmMatch?.[1]) return { platform: "npm", name: npmMatch[1] };

	// github URL forms
	// https://github.com/<o>/<r>.git, https://github.com/<o>/<r>, github.com/<o>/<r>[@ref]
	if (!s.startsWith("http")) s = `https://${s.replace(/^\/+/, "")}`;
	try {
		const url = new URL(s);
		if (url.hostname.endsWith("github.com")) {
			const parts = url.pathname.replace(/^\/+/, "").split("/");
			const owner = parts[0];
			let name = parts[1] ?? "";
			name = name.replace(/\.git$/, "").replace(/@.+$/, "");
			if (owner && name) return { platform: "github.com", owner, name };
		}
	} catch {
		// not a parseable URL → fall through
	}
	return null;
}

const FAIL_BELOW = 3.0;
const WARN_BELOW = 5.0;

function scorecardToFindings(card: ScorecardResponse, target: ScorecardTarget): Finding[] {
	const findings: Finding[] = [];
	const overall = card.score ?? 0;
	let severity: Finding["severity"] = "info";
	if (overall < FAIL_BELOW) severity = "fail";
	else if (overall < WARN_BELOW) severity = "warn";
	findings.push({
		rule: "scorecard:overall",
		msg: `OpenSSF Scorecard ${overall}/10 for ${target.platform}/${target.owner ? `${target.owner}/` : ""}${target.name}`,
		severity,
	});
	for (const check of card.checks ?? []) {
		if (check.score < 0) continue;
		if (check.score <= 2) {
			findings.push({
				rule: `scorecard:check:${check.name}`,
				msg: `${check.name}: ${check.score}/10${check.reason ? ` — ${check.reason}` : ""}`.slice(
					0,
					200,
				),
				severity: "warn",
			});
		}
	}
	return findings;
}

export async function vet(_packagePath: string, source: string): Promise<Verdict> {
	const start = Date.now();
	const target = parseSource(source);
	if (!target) {
		return {
			vetter: "scorecard",
			score: 100,
			level: "ok",
			findings: [
				{
					rule: "scorecard:source-unparseable",
					msg: `cannot map source '${source}' to a Scorecard target`,
					severity: "info",
				},
			],
			scannedFiles: 0,
			durationMs: Date.now() - start,
		};
	}

	const path =
		target.platform === "npm"
			? `npm/${encodeURIComponent(target.name)}`
			: `github.com/${target.owner}/${target.name}`;
	const url = `https://api.scorecard.dev/projects/${path}`;

	const findings: Finding[] = [];
	try {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), 5000);
		const resp = await fetch(url, { signal: ctrl.signal });
		clearTimeout(timer);
		if (resp.status === 404) {
			findings.push({
				rule: "scorecard:not-found",
				msg: `no Scorecard data for ${path} (404)`,
				severity: "info",
			});
		} else if (!resp.ok) {
			findings.push({
				rule: "scorecard:http-error",
				msg: `Scorecard fetch ${resp.status} for ${path}`,
				severity: "warn",
			});
		} else {
			const card = (await resp.json()) as ScorecardResponse;
			findings.push(...scorecardToFindings(card, target));
		}
	} catch (err: unknown) {
		const msg = (err as Error)?.message ?? String(err);
		findings.push({
			rule: "scorecard:fetch-failed",
			msg: `Scorecard fetch failed: ${msg.slice(0, 120)}`,
			severity: "warn",
		});
	}

	return {
		vetter: "scorecard",
		score: deriveScore(findings),
		level: deriveLevel(findings),
		findings,
		scannedFiles: 0,
		durationMs: Date.now() - start,
	};
}

export const scorecardVetter: Vetter = { name: "scorecard", vet };
