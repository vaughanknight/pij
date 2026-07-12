import type {
	HarnessVerb,
	VerbContext,
	VerbResult,
} from "@ai-substrate/engineering-harness/contract";

/**
 * A single deterministic sensor — wraps a REAL repo command (P8 "wrap, don't
 * rebuild"). The set below mirrors pij's `just self-check` composite, so
 * `harness checks` IS the signal inventory made runnable. Add a sensor here when
 * the engineering harness adopts a new backpressure/check.
 */
interface Sensor {
	name: string;
	cmd: string;
	args: string[];
	/** Skipped under --quick (slow and/or environment-bound, e.g. tmux smoke). */
	heavy?: boolean;
	/** Extra env for this sensor (merged into process.env for the child). */
	env?: Record<string, string>;
	/** One-line description of what it proves. */
	proves: string;
}

const SENSORS: Sensor[] = [
	{
		name: "typecheck",
		cmd: "just",
		args: ["typecheck"],
		proves: "the TypeScript surface compiles",
	},
	{ name: "lint", cmd: "just", args: ["lint"], proves: "Biome (errors + warnings) is clean" },
	{ name: "test", cmd: "just", args: ["test"], proves: "the vitest suite passes" },
	{
		name: "windows-compat",
		cmd: "just",
		args: ["windows-compat"],
		proves: "portable typecheck, lint, inbox, fake, and no-tmux CLI checks pass",
	},
	{
		name: "smoke",
		cmd: "just",
		args: ["smoke"],
		heavy: true,
		proves: "the tmux-driven end-to-end driver scenarios pass",
	},
	{
		name: "pkg-audit",
		cmd: "just",
		args: ["pkg", "audit"],
		env: { PIJ_VET_SKIP_AGENT: "1" },
		proves: "third-party package vetting surfaces no new findings",
	},
	{
		name: "snapshots",
		cmd: "just",
		args: ["snapshots-check"],
		proves: "agent-pack snapshots have not drifted",
	},
];

interface SensorResult {
	name: string;
	status: "pass" | "fail" | "skipped";
	code: number;
	proves: string;
}

/** Last N non-empty lines of a failing sensor's output. */
function tail(text: string, n = 25): string {
	const lines = text.trimEnd().split("\n");
	return lines.slice(-n).join("\n");
}

const checks: HarnessVerb = {
	name: "checks",
	summary:
		"Run pij's full deterministic gate (the signal inventory) and report a ship/done verdict.",
	description:
		'The single "are we done?" gate. Runs every sensor in the engineering-harness signal inventory ' +
		"(mirrors `just self-check`: typecheck, lint, test, windows-compat, smoke, pkg-audit, snapshots) as individual " +
		"stages, reports a per-sensor verdict, and — unlike self-check — runs ALL of them so you see every " +
		"failure in one pass. Run it before ship and before declaring any non-trivial task done. " +
		"`--quick` skips heavy sensors (smoke) for a fast static+unit gate.",
	options: [
		{ flags: "--quick", description: "skip heavy sensors (smoke) — fast static + unit gate" },
	],
	async run(ctx: VerbContext): Promise<VerbResult> {
		const quick = ctx.options.quick === true;
		const results: SensorResult[] = [];
		const failureLogs: Array<{ name: string; output: string }> = [];

		for (const s of SENSORS) {
			if (quick && s.heavy) {
				results.push({ name: s.name, status: "skipped", code: 0, proves: s.proves });
				continue;
			}
			// Apply per-sensor env (spawn inherits process.env), restore afterwards.
			const saved: Array<[string, string | undefined]> = [];
			if (s.env) {
				for (const [k, v] of Object.entries(s.env)) {
					saved.push([k, process.env[k]]);
					process.env[k] = v;
				}
			}
			let res: { ok: boolean; code: number; stdout: string; stderr: string };
			try {
				res = await ctx.exec(s.cmd, s.args);
			} finally {
				for (const [k, v] of saved) {
					if (v === undefined) delete process.env[k];
					else process.env[k] = v;
				}
			}
			results.push({
				name: s.name,
				status: res.ok ? "pass" : "fail",
				code: res.code,
				proves: s.proves,
			});
			if (!res.ok) failureLogs.push({ name: s.name, output: tail(res.stderr || res.stdout) });
		}

		const failed = results.filter((r) => r.status === "fail");
		const skipped = results.filter((r) => r.status === "skipped").map((r) => r.name);

		if (failed.length > 0) {
			const names = failed.map((r) => r.name).join(", ");
			return ctx.error("checks-failed", `${failed.length} check(s) failed: ${names}.`, {
				details: { results, failures: failureLogs, skipped },
				next_action: `Fix the failing check(s) above (${names}), then re-run \`harness checks\`. Not ship/done-ready until this is green.`,
			});
		}

		const ran = results.filter((r) => r.status === "pass").map((r) => r.name);
		return ctx.ok(
			{ ok: true, ran, skipped, results },
			{
				next_action: quick
					? "Quick checks green. Run the full `harness checks` (incl. smoke) before ship / declaring done."
					: "All checks green — safe to ship / declare this task done.",
			},
		);
	},
};

export default checks;
