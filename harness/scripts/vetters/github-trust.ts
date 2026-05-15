// GitHub maintainer trust signals via `gh api`. Reads repo age, stars,
// last commit, license presence. Skips quietly for non-GitHub sources.
// Warns on startup if GH_TOKEN unset (rate limit risk).

import { execFileSync } from "node:child_process";
import { parseSource } from "./scorecard.js";
import { deriveLevel, deriveScore, type Finding, type Verdict, type Vetter } from "./types.js";

interface RepoMeta {
	created_at?: string;
	pushed_at?: string;
	stargazers_count?: number;
	license?: { spdx_id?: string } | null;
	archived?: boolean;
	disabled?: boolean;
}

function daysSince(iso: string | undefined): number {
	if (!iso) return Number.POSITIVE_INFINITY;
	return (Date.now() - Date.parse(iso)) / 86_400_000;
}

const AGE_FAIL_DAYS = 30; // <30d old repo → suspicious
const STALE_FAIL_DAYS = 730; // >2y since last push → likely abandoned
const STALE_WARN_DAYS = 365;

function metaToFindings(meta: RepoMeta, slug: string): Finding[] {
	const findings: Finding[] = [];
	const age = daysSince(meta.created_at);
	const stale = daysSince(meta.pushed_at);

	if (age < AGE_FAIL_DAYS) {
		findings.push({
			rule: "github-trust:young-repo",
			msg: `${slug} created ${age.toFixed(0)}d ago (<${AGE_FAIL_DAYS}d) — suspicious for an extension`,
			severity: "fail",
		});
	}
	if (stale > STALE_FAIL_DAYS) {
		findings.push({
			rule: "github-trust:abandoned",
			msg: `${slug} last push ${stale.toFixed(0)}d ago (>${STALE_FAIL_DAYS}d) — likely abandoned`,
			severity: "warn",
		});
	} else if (stale > STALE_WARN_DAYS) {
		findings.push({
			rule: "github-trust:dormant",
			msg: `${slug} last push ${stale.toFixed(0)}d ago — dormant`,
			severity: "info",
		});
	}
	if (!meta.license?.spdx_id) {
		findings.push({
			rule: "github-trust:no-license",
			msg: `${slug} has no detected LICENSE`,
			severity: "warn",
		});
	}
	if (meta.archived) {
		findings.push({
			rule: "github-trust:archived",
			msg: `${slug} is archived`,
			severity: "warn",
		});
	}
	if (meta.disabled) {
		findings.push({
			rule: "github-trust:disabled",
			msg: `${slug} is disabled`,
			severity: "fail",
		});
	}
	if ((meta.stargazers_count ?? 0) < 2) {
		findings.push({
			rule: "github-trust:low-stars",
			msg: `${slug} has ${meta.stargazers_count ?? 0} stars (low signal)`,
			severity: "info",
		});
	}
	return findings;
}

export async function vet(_packagePath: string, source: string): Promise<Verdict> {
	const start = Date.now();
	const target = parseSource(source);

	if (!target || target.platform !== "github.com" || !target.owner) {
		return {
			vetter: "github-trust",
			score: 100,
			level: "ok",
			findings: [
				{
					rule: "github-trust:not-github",
					msg: `source '${source}' is not a GitHub repo — skipping`,
					severity: "info",
				},
			],
			scannedFiles: 0,
			durationMs: Date.now() - start,
		};
	}

	const findings: Finding[] = [];
	if (!process.env.GH_TOKEN) {
		findings.push({
			rule: "github-trust:no-token",
			msg: "GH_TOKEN unset — rate-limit at 60/hr may cause failures",
			severity: "info",
		});
	}

	const slug = `${target.owner}/${target.name}`;
	try {
		const out = execFileSync("gh", ["api", `repos/${slug}`], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		const meta = JSON.parse(out) as RepoMeta;
		findings.push(...metaToFindings(meta, slug));
	} catch (err: unknown) {
		const msg =
			(err as { stderr?: Buffer | string })?.stderr?.toString().split("\n")[0] ?? String(err);
		findings.push({
			rule: "github-trust:api-error",
			msg: `gh api failed for ${slug}: ${msg.slice(0, 160)}`,
			severity: "warn",
		});
	}

	return {
		vetter: "github-trust",
		score: deriveScore(findings),
		level: deriveLevel(findings),
		findings,
		scannedFiles: 0,
		durationMs: Date.now() - start,
	};
}

export const githubTrustVetter: Vetter = { name: "github-trust", vet };
