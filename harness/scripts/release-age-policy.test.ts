import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	assertQuarantineEnforceableOrExit,
	MIN_NPM_MAJOR_FOR_QUARANTINE,
	MIN_RELEASE_AGE_DAYS,
	NPM_PREFER_ONLINE,
	NPM_REGISTRY_URL,
	NPM_REPLACE_REGISTRY_HOST,
	npmMajor,
	npmResolutionEnvironment,
	quarantineSupportError,
	ROOT_LOCK_REPLAY_MIN_RELEASE_AGE,
	rootLockReplayEnvironment,
	rootLockReplayNpmArgs,
} from "./release-age-policy.js";

const PIJ_ROOT = resolve(import.meta.dirname, "..", "..");
const RUNNING_NPM_MAJOR = npmMajor(
	spawnSync("npm", ["--version"], { encoding: "utf8" }).stdout ?? "",
);
function isPowerShellUnavailable(error: Error | undefined): boolean {
	return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

const POWERSHELL_LOOKUP = spawnSync(
	"pwsh",
	["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "exit 0"],
	{ stdio: "ignore" },
);
const POWERSHELL_UNAVAILABLE = isPowerShellUnavailable(POWERSHELL_LOOKUP.error);
// 60s. The pwsh spawn is heavyweight and this file runs in parallel with the whole
// suite: ~4.5s isolated (s055's measurement), ~10s isolated on a loaded machine
// (s054's), and past 15s under full-suite contention (vitest workers + pkg audit) —
// which produced 7 recorded false reds, each green on an isolated re-run, one of
// them red-lighting `harness boot` at a phase seam. The probe is correctness-, not
// latency-sensitive, so the budget is a HANG detector rather than a performance
// assertion: keep it far above the worst honest run, so a red here always means the
// probe genuinely wedged. (s054 and s055 diagnosed this independently and landed on
// the same ceiling; this comment merges both records.)
const POWERSHELL_PROBE_TIMEOUT_MS = 60_000;
const POWERSHELL_TEST_TIMEOUT_MS = POWERSHELL_PROBE_TIMEOUT_MS + 5_000;
const temporaryRoots: string[] = [];

interface PowerShellEnvironmentProbe {
	insideRegistry: string;
	insideReplaceRegistryHost: string;
	insidePreferOnline: string;
	insideMinReleaseAge: string;
	insideBeforeCleared: boolean;
	restoredRegistry: string;
	restoredReplaceRegistryHost: string;
	restoredPreferOnline: string;
	restoredMinReleaseAge: string;
	restoredBefore: string;
	rootInsideRegistry: string;
	rootInsideReplaceRegistryHost: string;
	rootInsidePreferOnline: string;
	rootInsideMinReleaseAgeCleared: boolean;
	rootInsideBeforeCleared: boolean;
	rootRestoredAll: boolean;
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
$functionNames = @(
	"Invoke-WithNpmEnvironment",
	"Invoke-WithNpmResolutionEnvironment",
	"Invoke-WithRootLockNpmResolutionEnvironment"
)
foreach ($functionName in $functionNames) {
	$functionAst = $ast.Find({
		param($node)
		$node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
			$node.Name -eq $functionName
	}, $true)
	if ($null -eq $functionAst) {
		throw "$functionName was not found"
	}
	Invoke-Expression $functionAst.Extent.Text
}
$script:NpmRegistryUrl = "${NPM_REGISTRY_URL}"
$script:NpmReplaceRegistryHost = "${NPM_REPLACE_REGISTRY_HOST}"
$script:NpmPreferOnline = "${String(NPM_PREFER_ONLINE)}"
$script:ReleaseAgeDays = ${MIN_RELEASE_AGE_DAYS}
$script:insideRegistry = $null
$script:insideReplaceRegistryHost = $null
$script:insidePreferOnline = $null
$script:insideMinReleaseAge = $null
$script:insideBefore = "unexpected"
$errorPropagated = $false
try {
	Invoke-WithNpmResolutionEnvironment {
		$script:insideRegistry = [Environment]::GetEnvironmentVariable("npm_config_registry", "Process")
		$script:insideReplaceRegistryHost = [Environment]::GetEnvironmentVariable(
			"npm_config_replace_registry_host",
			"Process"
		)
		$script:insidePreferOnline = [Environment]::GetEnvironmentVariable(
			"npm_config_prefer_online",
			"Process"
		)
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
$restoredRegistry = [Environment]::GetEnvironmentVariable("npm_config_registry", "Process")
$restoredReplaceRegistryHost = [Environment]::GetEnvironmentVariable(
	"npm_config_replace_registry_host",
	"Process"
)
$restoredPreferOnline = [Environment]::GetEnvironmentVariable(
	"npm_config_prefer_online",
	"Process"
)
$restoredMinReleaseAge = [Environment]::GetEnvironmentVariable(
	"npm_config_min_release_age",
	"Process"
)
$restoredBefore = [Environment]::GetEnvironmentVariable("npm_config_before", "Process")
$script:rootInsideRegistry = $null
$script:rootInsideReplaceRegistryHost = $null
$script:rootInsidePreferOnline = $null
$script:rootInsideMinReleaseAge = "unexpected"
$script:rootInsideBefore = "unexpected"
Invoke-WithRootLockNpmResolutionEnvironment {
	$script:rootInsideRegistry = [Environment]::GetEnvironmentVariable(
		"npm_config_registry",
		"Process"
	)
	$script:rootInsideReplaceRegistryHost = [Environment]::GetEnvironmentVariable(
		"npm_config_replace_registry_host",
		"Process"
	)
	$script:rootInsidePreferOnline = [Environment]::GetEnvironmentVariable(
		"npm_config_prefer_online",
		"Process"
	)
	$script:rootInsideMinReleaseAge = [Environment]::GetEnvironmentVariable(
		"npm_config_min_release_age",
		"Process"
	)
	$script:rootInsideBefore = [Environment]::GetEnvironmentVariable(
		"npm_config_before",
		"Process"
	)
}
$rootRestoredAll =
	[Environment]::GetEnvironmentVariable("npm_config_registry", "Process") -eq $restoredRegistry -and
	[Environment]::GetEnvironmentVariable("npm_config_replace_registry_host", "Process") -eq $restoredReplaceRegistryHost -and
	[Environment]::GetEnvironmentVariable("npm_config_prefer_online", "Process") -eq $restoredPreferOnline -and
	[Environment]::GetEnvironmentVariable("npm_config_min_release_age", "Process") -eq $restoredMinReleaseAge -and
	[Environment]::GetEnvironmentVariable("npm_config_before", "Process") -eq $restoredBefore
[pscustomobject]@{
	insideRegistry = $script:insideRegistry
	insideReplaceRegistryHost = $script:insideReplaceRegistryHost
	insidePreferOnline = $script:insidePreferOnline
	insideMinReleaseAge = $script:insideMinReleaseAge
	insideBeforeCleared = [string]::IsNullOrEmpty($script:insideBefore)
	restoredRegistry = $restoredRegistry
	restoredReplaceRegistryHost = $restoredReplaceRegistryHost
	restoredPreferOnline = $restoredPreferOnline
	restoredMinReleaseAge = $restoredMinReleaseAge
	restoredBefore = $restoredBefore
	rootInsideRegistry = $script:rootInsideRegistry
	rootInsideReplaceRegistryHost = $script:rootInsideReplaceRegistryHost
	rootInsidePreferOnline = $script:rootInsidePreferOnline
	rootInsideMinReleaseAgeCleared = [string]::IsNullOrEmpty($script:rootInsideMinReleaseAge)
	rootInsideBeforeCleared = [string]::IsNullOrEmpty($script:rootInsideBefore)
	rootRestoredAll = $rootRestoredAll
	errorPropagated = $errorPropagated
} | ConvertTo-Json -Compress
`;
	const result = spawnSync(
		"pwsh",
		["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
		{
			encoding: "utf8",
			env: {
				...process.env,
				PIJ_INSTALLER_PATH: installerPath,
				npm_config_registry: "https://caller.invalid/",
				npm_config_replace_registry_host: "never",
				npm_config_prefer_online: "false",
				npm_config_min_release_age: "2",
				npm_config_before: "2000-01-01T00:00:00.000Z",
			},
			timeout: POWERSHELL_PROBE_TIMEOUT_MS,
		},
	);
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

describe("npm resolution policy", () => {
	it("classifies only a missing pwsh executable as unavailable", () => {
		expect(isPowerShellUnavailable(Object.assign(new Error("missing"), { code: "ENOENT" }))).toBe(
			true,
		);
		expect(isPowerShellUnavailable(Object.assign(new Error("denied"), { code: "EACCES" }))).toBe(
			false,
		);
		expect(isPowerShellUnavailable(undefined)).toBe(false);
	});

	it("freezes proxy authority, lock-host replacement, online revalidation, age, and audit", () => {
		expect(NPM_REGISTRY_URL).toBe("https://packagefeedproxy.microsoft.io/npm/");
		// npmjs-scoped host replacement (PR#25 adopt, dove ruling s052-npm-hardening-pr25).
		// npm's `replace-registry-host=always` rewrites the host of EVERY resolved URL —
		// including the `minih` git+ssh github.com dependency, which the proxy cannot serve
		// (npm ci then dies 128/E404 on every platform). `npmjs` scopes the rewrite to the
		// default npmjs registry host only, so registry reads still route through the proxy
		// while git deps resolve from their origin. A registry proxy can't serve git, so
		// `always` bought zero security on git deps — only breakage.
		expect(NPM_REPLACE_REGISTRY_HOST).toBe("npmjs");
		expect(NPM_PREFER_ONLINE).toBe(true);
		expect(MIN_RELEASE_AGE_DAYS).toBe(7);
		expect(readFileSync(resolve(PIJ_ROOT, ".npmrc"), "utf8")).toBe(
			"registry=https://packagefeedproxy.microsoft.io/npm/\n" +
				"replace-registry-host=npmjs\n" +
				"prefer-online=true\n" +
				"min-release-age=7\n" +
				"audit=true\n",
		);
	});

	it("fails closed: the quarantine preflight refuses npm <11 and allows npm >=11 (dove ruling)", () => {
		// npm-native min-release-age is only enforced by npm >= 11. npm 10 accepts
		// the flag but silently installs a too-young package — so the governed path
		// must REFUSE on npm <11 rather than proceed unprotected. A security control
		// never silently no-ops: it enforces, or it refuses.
		expect(MIN_NPM_MAJOR_FOR_QUARANTINE).toBe(11);
		expect(npmMajor("11.10.0")).toBe(11);
		expect(npmMajor("v10.9.2")).toBe(10);
		expect(npmMajor("garbage")).toBeNaN();

		// >= 11 → enforceable, no refusal.
		expect(quarantineSupportError("11.10.0")).toBeNull();
		expect(quarantineSupportError("12.0.0")).toBeNull();

		// < 11 (or unparseable) → the named, loud refusal.
		for (const bad of ["10.9.2", "9.0.0", "garbage"]) {
			const err = quarantineSupportError(bad);
			expect(err).not.toBeNull();
			expect(err).toContain("min-release-age requires npm>=11");
			expect(err).toContain("refusing rather than silently skipping");
		}
	});

	it("the shared preflight refuses on npm<11 and passes on npm>=11 (injected, deterministic)", () => {
		// The shared assert is what BOTH governed install paths (npm-resolution-run
		// and packages.ts) call, so the fail-closed guarantee is comprehensive.
		let failed: string | null = null;
		const failing: never = undefined as never;
		const fail = (m: string): never => {
			failed = m;
			return failing;
		};

		// npm >= 11 → no refusal, fail never called.
		assertQuarantineEnforceableOrExit({
			probeNpmVersion: () => ({ status: 0, stdout: "11.10.0\n" }),
			fail,
		});
		expect(failed).toBeNull();

		// npm < 11 → the named refusal.
		assertQuarantineEnforceableOrExit({
			probeNpmVersion: () => ({ status: 0, stdout: "10.9.2\n" }),
			fail,
		});
		expect(failed).toContain("min-release-age requires npm>=11");

		// npm probe itself fails → refuse (can't prove enforceability).
		failed = null;
		assertQuarantineEnforceableOrExit({
			probeNpmVersion: () => ({ status: 1, stdout: "" }),
			fail,
		});
		expect(failed).toContain("could not determine npm version");
	});

	it("scopes host replacement to npmjs so git deps (minih) resolve from github, not the proxy", () => {
		// Positive semantics assertion (dove condition 1): the contract must ROUTE
		// npmjs registry reads through the proxy AND leave github.com git deps alone —
		// not merely be "loosened" from always. `npmjs` is npm's mode for exactly that.
		expect(NPM_REPLACE_REGISTRY_HOST).toBe("npmjs");
		expect(NPM_REPLACE_REGISTRY_HOST).not.toBe("always"); // over-broad: rewrites git hosts too

		// The probe/daemon resolution environment inherits the scoped mode, so no code
		// path re-broadens it to `always` and re-breaks the git dependency.
		for (const env of [npmResolutionEnvironment({}), rootLockReplayEnvironment({})]) {
			expect(env.npm_config_replace_registry_host).toBe("npmjs");
			// Registry authority is preserved: npmjs reads still go through the proxy.
			expect(env.npm_config_registry).toBe(NPM_REGISTRY_URL);
		}
	});

	it("strips mixed-case caller policy overrides without mutating the caller", () => {
		const callerEnvironment = {
			PATH: process.env.PATH,
			NPM_CONFIG_REGISTRY: "https://caller.invalid/",
			Npm_Config_Replace_Registry_Host: "never",
			Npm_Config_Prefer_Online: "false",
			NPM_CONFIG_MIN_RELEASE_AGE: "0",
			Npm_Config_Before: "2000-01-01T00:00:00.000Z",
		};

		const childEnvironment = npmResolutionEnvironment(callerEnvironment);

		expect(childEnvironment).toMatchObject({
			npm_config_registry: NPM_REGISTRY_URL,
			npm_config_replace_registry_host: NPM_REPLACE_REGISTRY_HOST,
			npm_config_prefer_online: "true",
			npm_config_min_release_age: "7",
		});
		expect(childEnvironment.NPM_CONFIG_REGISTRY).toBeUndefined();
		expect(childEnvironment.Npm_Config_Replace_Registry_Host).toBeUndefined();
		expect(childEnvironment.Npm_Config_Prefer_Online).toBeUndefined();
		expect(childEnvironment.NPM_CONFIG_MIN_RELEASE_AGE).toBeUndefined();
		expect(childEnvironment.Npm_Config_Before).toBeUndefined();
		expect(childEnvironment.npm_config_before).toBeUndefined();
		expect(callerEnvironment).toEqual({
			PATH: process.env.PATH,
			NPM_CONFIG_REGISTRY: "https://caller.invalid/",
			Npm_Config_Replace_Registry_Host: "never",
			Npm_Config_Prefer_Online: "false",
			NPM_CONFIG_MIN_RELEASE_AGE: "0",
			Npm_Config_Before: "2000-01-01T00:00:00.000Z",
		});
	});

	it("keeps proxy, lock-host replacement, and online policy while clearing root age", () => {
		const childEnvironment = rootLockReplayEnvironment({
			PATH: process.env.PATH,
			NPM_CONFIG_REGISTRY: "https://caller.invalid/",
			NPM_CONFIG_REPLACE_REGISTRY_HOST: "never",
			npm_config_prefer_online: "false",
			Npm_Config_Min_Release_Age: "1",
			NPM_CONFIG_BEFORE: "2000-01-01T00:00:00.000Z",
		});

		expect(childEnvironment).toMatchObject({
			npm_config_registry: NPM_REGISTRY_URL,
			npm_config_replace_registry_host: NPM_REPLACE_REGISTRY_HOST,
			npm_config_prefer_online: "true",
		});
		expect(childEnvironment.npm_config_min_release_age).toBeUndefined();
		expect(childEnvironment.npm_config_before).toBeUndefined();
		expect(rootLockReplayNpmArgs()).toEqual(["ci", "--min-release-age=null"]);
		expect(ROOT_LOCK_REPLAY_MIN_RELEASE_AGE).toBe("null");
		expect(rootLockReplayNpmArgs()).not.toContain("install");
	});

	it("propagates governed values through the fail-closed runner and preserves child status", () => {
		const root = mkdtempSync(join(tmpdir(), "pij-npm-resolution-runner-"));
		temporaryRoots.push(root);
		const recorder = join(root, "record.cjs");
		const output = join(root, "environment.json");
		writeFileSync(
			recorder,
			[
				'const fs = require("node:fs");',
				"fs.writeFileSync(process.argv[2], JSON.stringify({",
				"  registry: process.env.npm_config_registry,",
				"  replaceRegistryHost: process.env.npm_config_replace_registry_host,",
				"  online: process.env.npm_config_prefer_online,",
				"  age: process.env.npm_config_min_release_age,",
				"  before: process.env.npm_config_before,",
				"}));",
				"process.exit(7);",
				"",
			].join("\n"),
		);
		const result = spawnSync(
			resolve(PIJ_ROOT, "node_modules", ".bin", "tsx"),
			[
				resolve(PIJ_ROOT, "harness", "scripts", "npm-resolution-run.ts"),
				process.execPath,
				recorder,
				output,
			],
			{
				cwd: PIJ_ROOT,
				encoding: "utf8",
				env: {
					...process.env,
					NPM_CONFIG_REGISTRY: "https://caller.invalid/",
					NPM_CONFIG_REPLACE_REGISTRY_HOST: "never",
					NPM_CONFIG_PREFER_ONLINE: "false",
					NPM_CONFIG_MIN_RELEASE_AGE: "0",
					NPM_CONFIG_BEFORE: "2000-01-01T00:00:00.000Z",
				},
			},
		);

		// Fail-closed preflight (dove ruling): on npm >= 11 the runner propagates
		// the governed env and runs the command (recorder exits 7). On npm < 11 it
		// REFUSES up front — the recorder never runs — so the governed-env
		// propagation cannot be observed; the refusal is the correct behaviour.
		if (RUNNING_NPM_MAJOR >= MIN_NPM_MAJOR_FOR_QUARANTINE) {
			expect(result.status).toBe(7);
			expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({
				registry: NPM_REGISTRY_URL,
				replaceRegistryHost: NPM_REPLACE_REGISTRY_HOST,
				online: "true",
				age: "7",
			});
		} else {
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("min-release-age requires npm>=11");
		}

		const missing = spawnSync(
			resolve(PIJ_ROOT, "node_modules", ".bin", "tsx"),
			[
				resolve(PIJ_ROOT, "harness", "scripts", "npm-resolution-run.ts"),
				"pij-command-that-does-not-exist",
			],
			{ cwd: PIJ_ROOT, encoding: "utf8" },
		);
		expect(missing.status).toBe(1);
		expect(missing.stderr).toContain("npm-resolution-run:");
	});

	it("wires every pij-owned resolver through the shared policy", () => {
		const packagesSource = readFileSync(resolve(PIJ_ROOT, "harness/scripts/packages.ts"), "utf8");
		const auditSource = readFileSync(
			resolve(PIJ_ROOT, "harness/scripts/vetters/npm-audit.ts"),
			"utf8",
		);
		const lockfileSource = readFileSync(
			resolve(PIJ_ROOT, "harness/scripts/vetters/lockfile-lint.ts"),
			"utf8",
		);
		const justfile = readFileSync(resolve(PIJ_ROOT, "justfile"), "utf8");
		const ciWorkflow = readFileSync(resolve(PIJ_ROOT, ".github/workflows/ci.yml"), "utf8");
		const windowsInstaller = readFileSync(resolve(PIJ_ROOT, "install-windows.ps1"), "utf8");

		expect(packagesSource).toMatch(
			/import \{[^}]*npmResolutionEnvironment[^}]*\} from "\.\/release-age-policy\.js";/s,
		);
		// Every governed install in packages.ts must be preceded by the fail-closed
		// preflight (dove ruling — no governed install silently skips the quarantine).
		expect(packagesSource).toContain("assertQuarantineEnforceableOrExit");
		expect(packagesSource.match(/piInvocation\(\["install",/g)).toHaveLength(1);
		expect(packagesSource.match(/installPiPackage\(/g)).toHaveLength(3);
		expect(packagesSource).toContain(
			'execSync(install, { env: npmResolutionEnvironment(), stdio: "inherit" })',
		);
		expect(packagesSource).toContain("env: npmResolutionEnvironment()");
		expect(auditSource).toContain("env: npmResolutionEnvironment()");
		expect(lockfileSource).toContain('"lockfile-lint@4.14.0"');
		expect(lockfileSource).toContain("env: npmResolutionEnvironment()");

		expect(justfile).toContain("just _root-lock-npm-ci");
		expect(justfile).toContain("npm ci --min-release-age=null");
		expect(justfile).toContain('npm_config_registry="https://packagefeedproxy.microsoft.io/npm/"');
		expect(justfile).toContain('npm_config_replace_registry_host="npmjs"');
		expect(justfile).toContain('npm_config_prefer_online="true"');
		expect(justfile.match(/pi update --extensions/g)).toHaveLength(2);
		expect(justfile).toContain("just _npm-resolution pi update --extensions");
		const updatePiRecipe = justfile.slice(
			justfile.indexOf("\nupdate-pi:"),
			justfile.indexOf("\n# Backwards-compatible alias", justfile.indexOf("\nupdate-pi:")),
		);
		expect(updatePiRecipe.indexOf("just pkg bootstrap")).toBeGreaterThanOrEqual(0);
		expect(updatePiRecipe.indexOf("just _npm-resolution pi update --extensions")).toBeGreaterThan(
			updatePiRecipe.indexOf("just pkg bootstrap"),
		);
		expect(updatePiRecipe.indexOf("just pi-doctor")).toBeGreaterThan(
			updatePiRecipe.indexOf("just _npm-resolution pi update --extensions"),
		);
		expect(updatePiRecipe).not.toMatch(/just pkg bootstrap\s*(?:\|\||;)/);
		expect(justfile).toContain(
			'harness/scripts/npm-resolution-run.ts" npm install -g --ignore-scripts "$package"',
		);
		expect(justfile).toContain("node harness/scripts/pij-cli.cjs");
		expect(
			readFileSync(resolve(PIJ_ROOT, "harness/scripts/npm-resolution-run.ts"), "utf8"),
		).not.toMatch(/^#!.*tsx/m);
		expect(
			readFileSync(resolve(PIJ_ROOT, "harness/scripts/npm-resolution-diagnostic.ts"), "utf8"),
		).not.toMatch(/^#!.*tsx/m);
		expect(justfile).not.toMatch(/^\s+npx\s/m);
		expect(justfile).not.toMatch(
			/npm_config_min_release_age=.*(?:npm install|pi update --extensions)/,
		);

		expect(ciWorkflow.match(/run: npm ci --min-release-age=null/g)).toHaveLength(2);
		expect(windowsInstaller).toContain(
			'Invoke-WithRootLockNpmResolutionEnvironment {\n\t\tInvoke-Native $Npm @("ci", "--min-release-age=null")',
		);
		expect(windowsInstaller).toMatch(
			/Invoke-WithNpmResolutionEnvironment \{\s+Invoke-Native \$NpmCommand @\("install", "-g", "lean-ctx-bin"\)\s+\}/,
		);
		expect(windowsInstaller).toMatch(
			/Invoke-WithNpmResolutionEnvironment \{\s+Invoke-Native \$PiCommand @\("install", \$source\)\s+\}/,
		);
		expect(windowsInstaller).toMatch(
			/Invoke-WithNpmResolutionEnvironment \{\s+Invoke-Native \$Npm @\("install", "-g", "--ignore-scripts", "@earendil-works\/pi-coding-agent@latest"\)\s+\}/,
		);
		expect(windowsInstaller).toMatch(
			/Invoke-WithNpmResolutionEnvironment \{\s+Invoke-Native \$Pi @\("update", "--extensions"\)\s+\}/,
		);
		expect(`${justfile}\n${ciWorkflow}\n${windowsInstaller}`).not.toMatch(
			/npm install[^\n]*--min-release-age=(?:0|null)/,
		);
	});

	it("rejects a stale global pij bin while accepting the wrapper target", () => {
		const root = mkdtempSync(join(tmpdir(), "pij-bin-shape-"));
		temporaryRoots.push(root);
		const globalRoot = join(root, "lib", "node_modules");
		const binDir = join(root, "bin");
		const expected = join(globalRoot, "pij", "harness", "scripts", "pij-cli.cjs");
		const stale = join(globalRoot, "pij", ".pi", "extensions", "pij", "cli.ts");
		const bin = join(binDir, "pij");
		mkdirSync(resolve(expected, ".."), { recursive: true });
		mkdirSync(resolve(stale, ".."), { recursive: true });
		mkdirSync(binDir, { recursive: true });
		writeFileSync(expected, "#!/usr/bin/env node\n");
		writeFileSync(stale, "#!/usr/bin/env -S npx tsx\n");
		symlinkSync(relative(binDir, expected), bin);

		const valid = spawnSync("just", ["_pij-bin-shape-check", globalRoot, bin], {
			cwd: PIJ_ROOT,
			encoding: "utf8",
		});
		expect(valid.status).toBe(0);
		expect(valid.stdout).toContain(expected);

		unlinkSync(bin);
		symlinkSync(relative(binDir, stale), bin);
		const invalid = spawnSync("just", ["_pij-bin-shape-check", globalRoot, bin], {
			cwd: PIJ_ROOT,
			encoding: "utf8",
		});
		expect(invalid.status).toBe(1);
		expect(invalid.stdout).toContain("stale global pij bin");
		expect(invalid.stdout).toContain("run npm link from the local main checkout");
	});

	const powerShellEnvironmentRestorationTest = (): void => {
		const evidence = probePowerShellEnvironmentRestoration(
			resolve(PIJ_ROOT, "install-windows.ps1"),
		);

		expect(evidence).toEqual({
			insideRegistry: NPM_REGISTRY_URL,
			insideReplaceRegistryHost: NPM_REPLACE_REGISTRY_HOST,
			insidePreferOnline: "true",
			insideMinReleaseAge: "7",
			insideBeforeCleared: true,
			restoredRegistry: "https://caller.invalid/",
			restoredReplaceRegistryHost: "never",
			restoredPreferOnline: "false",
			restoredMinReleaseAge: "2",
			restoredBefore: "2000-01-01T00:00:00.000Z",
			rootInsideRegistry: NPM_REGISTRY_URL,
			rootInsideReplaceRegistryHost: NPM_REPLACE_REGISTRY_HOST,
			rootInsidePreferOnline: "true",
			rootInsideMinReleaseAgeCleared: true,
			rootInsideBeforeCleared: true,
			rootRestoredAll: true,
			errorPropagated: true,
		});
	};
	if (POWERSHELL_UNAVAILABLE) {
		it.skip(
			"restores the Windows caller environment even when a governed command fails (skipped: pwsh unavailable on PATH)",
			powerShellEnvironmentRestorationTest,
		);
	} else {
		it(
			"restores the Windows caller environment even when a governed command fails",
			powerShellEnvironmentRestorationTest,
			POWERSHELL_TEST_TIMEOUT_MS,
		);
	}
});
