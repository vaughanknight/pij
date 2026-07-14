import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

interface Stage {
	readonly name: string;
	readonly npmArgs: readonly string[];
}

const STAGES: readonly Stage[] = [
	{ name: "typecheck", npmArgs: ["run", "typecheck"] },
	{ name: "lint", npmArgs: ["run", "lint"] },
	{
		name: "focused-tests",
		npmArgs: [
			"run",
			"test",
			"--",
			".pi/extensions/pij/adapters/channel.test.ts",
			".pi/extensions/pij/adapters/fakes.test.ts",
			".pi/extensions/pij/adapters/fs-registry.test.ts",
			".pi/extensions/pij/cli.inbox.integration.test.ts",
		],
	},
];

function resolveNpmCli(): string | null {
	const npmCli = process.env.npm_execpath;
	return npmCli && existsSync(npmCli) ? npmCli : null;
}

function runStage(npmCli: string, stage: Stage): number {
	process.stdout.write(`\n=== windows-compat: ${stage.name} ===\n`);
	const result = spawnSync(process.execPath, [npmCli, ...stage.npmArgs], {
		cwd: process.cwd(),
		env: process.env,
		stdio: "inherit",
		shell: false,
	});
	if (result.error) {
		process.stderr.write(
			`windows-compat: ${stage.name} could not start: ${result.error.message}\n`,
		);
		return 1;
	}
	return result.status ?? 1;
}

const npmCli = resolveNpmCli();
if (!npmCli) {
	process.stderr.write(
		"windows-compat: cannot resolve the npm CLI; run this command through `npm run windows:check`.\n",
	);
	process.exitCode = 1;
} else {
	for (const stage of STAGES) {
		const code = runStage(npmCli, stage);
		if (code !== 0) {
			process.stderr.write(`windows-compat: ${stage.name} failed with exit code ${code}.\n`);
			process.exitCode = code;
			break;
		}
	}
	if (process.exitCode === undefined) {
		process.stdout.write("\nwindows-compat: all portable stages passed.\n");
	}
}
