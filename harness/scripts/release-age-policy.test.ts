import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	MIN_RELEASE_AGE_DAYS,
	ROOT_LOCK_REPLAY_MIN_RELEASE_AGE,
	releaseAgeEnvironment,
	rootLockReplayNpmArgs,
} from "./release-age-policy.js";

const PIJ_ROOT = resolve(import.meta.dirname, "..", "..");
const POWERSHELL_PROBE_TIMEOUT_MS = 15_000;
const POWERSHELL_TEST_TIMEOUT_MS = POWERSHELL_PROBE_TIMEOUT_MS + 5_000;
const temporaryRoots: string[] = [];

interface PowerShellEnvironmentProbe {
	insideMinReleaseAge: string;
	insideBeforeCleared: boolean;
	restoredMinReleaseAge: string;
	restoredBefore: string;
	errorPropagated: boolean;
}

function probePowerShellEnvironmentRestoration(installerPath: string): PowerShellEnvironmentProbe {
	const script = `
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
	$env:PIJ_INSTALLER_PATH,
	[ref]$tokens,
	[ref]$parseErrors
)
if ($parseErrors.Count -gt 0) {
	throw ($parseErrors | ForEach-Object { $_.Message } | Out-String)
}
$functionAst = $ast.Find({
	param($node)
	$node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
		$node.Name -eq "Invoke-WithReleaseAgeEnvironment"
}, $true)
if ($null -eq $functionAst) {
	throw "Invoke-WithReleaseAgeEnvironment was not found"
}
$script:ReleaseAgeDays = ${MIN_RELEASE_AGE_DAYS}
Invoke-Expression $functionAst.Extent.Text
$script:insideMinReleaseAge = $null
$script:insideBefore = "unexpected"
$errorPropagated = $false
try {
	Invoke-WithReleaseAgeEnvironment {
		$script:insideMinReleaseAge = [Environment]::GetEnvironmentVariable(
			"npm_config_min_release_age",
			"Process"
		)
		$script:insideBefore = [Environment]::GetEnvironmentVariable("npm_config_before", "Process")
		throw "expected probe failure"
	}
}
catch {
	if ($_.Exception.Message -ne "expected probe failure") {
		throw
	}
	$errorPropagated = $true
}
[pscustomobject]@{
	insideMinReleaseAge = $script:insideMinReleaseAge
	insideBeforeCleared = [string]::IsNullOrEmpty($script:insideBefore)
	restoredMinReleaseAge = [Environment]::GetEnvironmentVariable(
		"npm_config_min_release_age",
		"Process"
	)
	restoredBefore = [Environment]::GetEnvironmentVariable("npm_config_before", "Process")
	errorPropagated = $errorPropagated
} | ConvertTo-Json -Compress
`;
	const result = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", script], {
		encoding: "utf8",
		env: {
			...process.env,
			PIJ_INSTALLER_PATH: installerPath,
			npm_config_min_release_age: "2",
			npm_config_before: "2000-01-01T00:00:00.000Z",
		},
		timeout: POWERSHELL_PROBE_TIMEOUT_MS,
	});
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`PowerShell restoration probe failed:\n${result.stderr}`);
	}
	return JSON.parse(result.stdout) as PowerShellEnvironmentProbe;
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("release-age policy", () => {
	it("defines the production policy as exactly seven days", () => {
		expect(MIN_RELEASE_AGE_DAYS).toBe(7);
		expect(readFileSync(resolve(PIJ_ROOT, ".npmrc"), "utf8")).toBe(
			"min-release-age=7\naudit=true\n",
		);
	});

	it("overrides a caller-supplied lower value without mutating the caller environment", () => {
		const callerEnvironment = {
			PATH: process.env.PATH,
			NPM_CONFIG_MIN_RELEASE_AGE: "0",
			npm_config_before: "2000-01-01T00:00:00.000Z",
		};

		const childEnvironment = releaseAgeEnvironment(callerEnvironment);

		expect(childEnvironment.npm_config_min_release_age).toBe("7");
		expect(childEnvironment.NPM_CONFIG_MIN_RELEASE_AGE).toBeUndefined();
		expect(childEnvironment.npm_config_before).toBeUndefined();
		expect(callerEnvironment.NPM_CONFIG_MIN_RELEASE_AGE).toBe("0");
		expect(callerEnvironment.npm_config_before).toBe("2000-01-01T00:00:00.000Z");
	});

	it("propagates seven days to a real child process", () => {
		const root = mkdtempSync(join(tmpdir(), "pij-release-age-"));
		temporaryRoots.push(root);
		const recorder = join(root, "record.cjs");
		const output = join(root, "environment.txt");
		writeFileSync(
			recorder,
			'const fs = require("node:fs"); fs.writeFileSync(process.argv[2], process.env.npm_config_min_release_age ?? "missing");\n',
		);

		execFileSync(process.execPath, [recorder, output], {
			env: releaseAgeEnvironment({ PATH: process.env.PATH }),
		});

		expect(readFileSync(output, "utf8")).toBe("7");
	});

	it("exposes only the approved root lock-replay exception", () => {
		expect(ROOT_LOCK_REPLAY_MIN_RELEASE_AGE).toBe("null");
		expect(rootLockReplayNpmArgs()).toEqual(["ci", "--min-release-age=null"]);
		expect(rootLockReplayNpmArgs()).not.toContain("install");
	});

	it("wires every pij-owned Pi package-resolution command through the policy", () => {
		const packagesSource = readFileSync(resolve(PIJ_ROOT, "harness/scripts/packages.ts"), "utf8");
		const justfile = readFileSync(resolve(PIJ_ROOT, "justfile"), "utf8");
		const ciWorkflow = readFileSync(resolve(PIJ_ROOT, ".github/workflows/ci.yml"), "utf8");
		const windowsInstaller = readFileSync(resolve(PIJ_ROOT, "install-windows.ps1"), "utf8");

		expect(packagesSource).toContain(
			'import { releaseAgeEnvironment } from "./release-age-policy.js";',
		);
		expect(packagesSource.match(/piInvocation\(\["install",/g)).toHaveLength(1);
		expect(packagesSource.match(/installPiPackage\(/g)).toHaveLength(3);
		expect(packagesSource).toContain("env: releaseAgeEnvironment()");

		expect(justfile.match(/pi update --extensions/g)).toHaveLength(2);
		expect(justfile).toContain(
			'npm_config_min_release_age="$release_age" npm install -g --ignore-scripts "$package";',
		);
		expect(justfile).toContain('npm_config_min_release_age="$release_age" pi update --extensions');
		expect(justfile).toContain("npm ci --min-release-age=null");
		expect(ciWorkflow.match(/run: npm ci --min-release-age=null/g)).toHaveLength(2);
		expect(windowsInstaller).toContain('Invoke-Native $Npm @("ci", "--min-release-age=null")');
		expect(windowsInstaller).toContain("$ReleaseAgeDays = 7");
		expect(windowsInstaller).toMatch(
			/Invoke-WithReleaseAgeEnvironment \{\s+Invoke-Native \$NpmCommand @\("install", "-g", "lean-ctx-bin"\)\s+\}/,
		);
		expect(windowsInstaller).toMatch(
			/Invoke-WithReleaseAgeEnvironment \{\s+Invoke-Native \$PiCommand @\("install", \$source\)\s+\}/,
		);
		expect(windowsInstaller).toMatch(
			/Invoke-WithReleaseAgeEnvironment \{\s+Invoke-Native \$Npm @\("install", "-g", "--ignore-scripts", "@earendil-works\/pi-coding-agent@latest"\)\s+\}/,
		);
		expect(windowsInstaller).toMatch(
			/Invoke-WithReleaseAgeEnvironment \{\s+Invoke-Native \$Pi @\("update", "--extensions"\)\s+\}/,
		);
		expect(`${justfile}\n${ciWorkflow}\n${windowsInstaller}`).not.toMatch(
			/npm install[^\n]*--min-release-age=(?:0|null)/,
		);
	});

	it(
		"restores the Windows caller environment even when a governed command fails",
		() => {
			const evidence = probePowerShellEnvironmentRestoration(
				resolve(PIJ_ROOT, "install-windows.ps1"),
			);

			expect(evidence.insideMinReleaseAge).toBe("7");
			expect(evidence.insideBeforeCleared).toBe(true);
			expect(evidence.restoredMinReleaseAge).toBe("2");
			expect(evidence.restoredBefore).toBe("2000-01-01T00:00:00.000Z");
			expect(evidence.errorPropagated).toBe(true);
		},
		POWERSHELL_TEST_TIMEOUT_MS,
	);
});
