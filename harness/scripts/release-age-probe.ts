#!/usr/bin/env tsx

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { relative, resolve } from "node:path";
import { npmInvocation } from "./cli-invocation.js";
import {
	MIN_RELEASE_AGE_DAYS,
	ROOT_LOCK_REPLAY_MIN_RELEASE_AGE,
	rootLockReplayNpmArgs,
} from "./release-age-policy.js";

const PIJ_ROOT = resolve(import.meta.dirname, "..", "..");
const TEMP_PARENT = resolve(PIJ_ROOT, ".harness", "temp", "s048");
const REFUSAL_PACKAGE_NAME = "pij-release-age-fixture";
const REFUSAL_PACKAGE_VERSION = "1.0.0";
const REFUSAL_PACKAGE = `${REFUSAL_PACKAGE_NAME}@${REFUSAL_PACKAGE_VERSION}`;
const MINIH_GIT_COMMIT = "a9bc26e8b19c0236d6aa8c10281c86e03c1e6201";

interface CommandEvidence {
	name: string;
	command: string[];
	cwd: string;
	exitCode: number | null;
	stdout: string;
	stderr: string;
}

interface ProbeResult {
	productionMinReleaseAgeDays: number;
	refusalPackage: string;
	fixturePublishedAt: string;
	refusalCutoffAt: string | null;
	commands: CommandEvidence[];
	checks: Record<string, boolean>;
	audit: {
		exitCode: number | null;
		metadata: unknown;
	};
	tempRoot: string;
	tempCleaned: boolean;
}

interface RegistryFixture {
	child: ChildProcess;
	publishedAt: string;
	url: string;
}

function normalizeOutput(output: string): string {
	const home = process.env.HOME;
	const withoutRepo = output.replaceAll(PIJ_ROOT, "<repo>");
	return home ? withoutRepo.replaceAll(home, "~") : withoutRepo;
}

function runNpm(name: string, args: string[], cwd: string): CommandEvidence {
	const invocation = npmInvocation(args);
	const result = spawnSync(invocation.file, invocation.args, {
		cwd,
		encoding: "utf8",
		env: process.env,
		maxBuffer: 20 * 1024 * 1024,
	});
	if (result.error) {
		throw new Error(`${name} failed to start: ${result.error.message}`);
	}
	return {
		name,
		command: [invocation.file, ...invocation.args],
		cwd: relative(PIJ_ROOT, cwd) || ".",
		exitCode: result.status,
		stdout: normalizeOutput(result.stdout),
		stderr: normalizeOutput(result.stderr),
	};
}

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sleep(milliseconds: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function startRegistryFixture(tempRoot: string): RegistryFixture {
	const serverPath = resolve(tempRoot, "registry.cjs");
	const readyPath = resolve(tempRoot, "registry-port.txt");
	const publishedAt = new Date().toISOString();
	writeFileSync(
		serverPath,
		`const fs = require("node:fs");
const http = require("node:http");
const [readyPath, name, version, publishedAt] = process.argv.slice(2);
const server = http.createServer((request, response) => {
  if (request.url !== "/" + name) {
    response.writeHead(404);
    response.end("not found");
    return;
  }
  const port = server.address().port;
  const body = JSON.stringify({
    name,
    "dist-tags": { latest: version },
    versions: {
      [version]: {
        name,
        version,
        dist: {
          shasum: "0000000000000000000000000000000000000000",
          tarball: "http://127.0.0.1:" + port + "/" + name + "/-/" + name + "-" + version + ".tgz"
        }
      }
    },
    time: {
      created: publishedAt,
      modified: publishedAt,
      [version]: publishedAt
    }
  });
  response.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  response.end(body);
});
server.listen(0, "127.0.0.1", () => {
  fs.writeFileSync(readyPath, String(server.address().port));
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
`,
	);
	const child = spawn(
		process.execPath,
		[serverPath, readyPath, REFUSAL_PACKAGE_NAME, REFUSAL_PACKAGE_VERSION, publishedAt],
		{ stdio: "ignore" },
	);
	for (let attempt = 0; attempt < 200; attempt++) {
		if (existsSync(readyPath)) {
			const port = Number(readFileSync(readyPath, "utf8"));
			if (Number.isInteger(port) && port > 0) {
				return { child, publishedAt, url: `http://127.0.0.1:${port}` };
			}
		}
		if (child.exitCode !== null) break;
		sleep(25);
	}
	child.kill("SIGTERM");
	throw new Error("local release-age registry fixture did not become ready");
}

function parseJsonOutput(command: CommandEvidence): unknown {
	try {
		return JSON.parse(command.stdout);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`${command.name} did not emit parseable JSON: ${detail}`);
	}
}

function parseReleaseAgeCutoff(output: string): number | null {
	const match = output.match(/with a date before ([^\r\n]+)/i);
	if (!match?.[1]) return null;
	const parsed = Date.parse(match[1].replace(/\.$/, ""));
	return Number.isFinite(parsed) ? parsed : null;
}

function main(): void {
	mkdirSync(TEMP_PARENT, { recursive: true });
	const tempRoot = mkdtempSync(resolve(TEMP_PARENT, "release-age-probe-"));
	const lockedInstallRoot = resolve(tempRoot, "locked-install");
	const freshResolutionRoot = resolve(tempRoot, "fresh-resolution");
	const packageJsonPath = resolve(PIJ_ROOT, "package.json");
	const packageLockPath = resolve(PIJ_ROOT, "package-lock.json");
	const beforeHashes = {
		packageJson: sha256(packageJsonPath),
		packageLock: sha256(packageLockPath),
	};
	const commands: CommandEvidence[] = [];
	let auditMetadata: unknown = null;
	let tempCleaned = false;
	let registryFixture: RegistryFixture | null = null;

	try {
		mkdirSync(lockedInstallRoot);
		copyFileSync(packageJsonPath, resolve(lockedInstallRoot, "package.json"));
		copyFileSync(packageLockPath, resolve(lockedInstallRoot, "package-lock.json"));
		copyFileSync(resolve(PIJ_ROOT, ".npmrc"), resolve(lockedInstallRoot, ".npmrc"));

		mkdirSync(freshResolutionRoot);
		copyFileSync(resolve(PIJ_ROOT, ".npmrc"), resolve(freshResolutionRoot, ".npmrc"));
		writeFileSync(
			resolve(freshResolutionRoot, "package.json"),
			`${JSON.stringify({ name: "pij-release-age-probe", private: true, version: "0.0.0" }, null, 2)}\n`,
		);

		const config = runNpm(
			"npm release-age config",
			["config", "list", "-l", "--json"],
			freshResolutionRoot,
		);
		commands.push(config);
		const configJson = parseJsonOutput(config) as Record<string, unknown>;

		const lockedInstall = runNpm("locked npm ci", rootLockReplayNpmArgs(), lockedInstallRoot);
		commands.push(lockedInstall);

		registryFixture = startRegistryFixture(tempRoot);
		const refusal = runNpm(
			"fresh resolution refusal",
			[
				"install",
				"--package-lock-only",
				"--ignore-scripts",
				"--audit=false",
				"--fund=false",
				`--registry=${registryFixture.url}`,
				REFUSAL_PACKAGE,
			],
			freshResolutionRoot,
		);
		commands.push(refusal);
		registryFixture.child.kill("SIGTERM");

		const audit = runNpm("root audit", ["audit", "--json"], PIJ_ROOT);
		commands.push(audit);
		const auditJson = parseJsonOutput(audit) as Record<string, unknown>;
		auditMetadata = auditJson.metadata ?? null;

		const afterHashes = {
			packageJson: sha256(packageJsonPath),
			packageLock: sha256(packageLockPath),
		};
		const configuredBeforeMs = Date.parse(String(configJson.before));
		const expectedBeforeMs = Date.now() - MIN_RELEASE_AGE_DAYS * 86_400_000;
		const refusalOutput = `${refusal.stdout}\n${refusal.stderr}`;
		const refusalCutoffMs = parseReleaseAgeCutoff(refusalOutput);
		const checks = {
			npmSupportsMinReleaseAge: Object.hasOwn(configJson, "min-release-age"),
			productionPolicyIsSevenDays:
				MIN_RELEASE_AGE_DAYS === 7 &&
				Number.isFinite(configuredBeforeMs) &&
				Math.abs(configuredBeforeMs - expectedBeforeMs) < 5 * 60_000,
			lockReplayUsesOnlyApprovedOverride:
				lockedInstall.command.at(-1) === `--min-release-age=${ROOT_LOCK_REPLAY_MIN_RELEASE_AGE}` &&
				!lockedInstall.command.includes("install"),
			lockedInstallSucceeded: lockedInstall.exitCode === 0,
			nestedGitPrepareConflictCleared:
				!/--min-release-age cannot be provided when using --before/i.test(
					`${lockedInstall.stdout}\n${lockedInstall.stderr}`,
				),
			freshResolutionWasRefused:
				refusal.exitCode !== 0 &&
				/ETARGET|No matching version/i.test(refusalOutput) &&
				refusalCutoffMs !== null &&
				Number.isFinite(configuredBeforeMs) &&
				Math.abs(refusalCutoffMs - configuredBeforeMs) < 5 * 60_000,
			freshResolutionUsedCommittedPolicy: !refusal.command.some((arg) =>
				arg.startsWith("--min-release-age"),
			),
			auditJsonWasObserved: auditMetadata !== null,
			rootLockRetainsMinihCommit: readFileSync(packageLockPath, "utf8").includes(MINIH_GIT_COMMIT),
			repositoryManifestsUnchanged:
				beforeHashes.packageJson === afterHashes.packageJson &&
				beforeHashes.packageLock === afterHashes.packageLock,
		};

		rmSync(tempRoot, { recursive: true, force: true });
		tempCleaned = !existsSync(tempRoot);
		const result: ProbeResult = {
			productionMinReleaseAgeDays: MIN_RELEASE_AGE_DAYS,
			refusalPackage: REFUSAL_PACKAGE,
			fixturePublishedAt: registryFixture.publishedAt,
			refusalCutoffAt: refusalCutoffMs === null ? null : new Date(refusalCutoffMs).toISOString(),
			commands,
			checks,
			audit: {
				exitCode: audit.exitCode,
				metadata: auditMetadata,
			},
			tempRoot: relative(PIJ_ROOT, tempRoot),
			tempCleaned,
		};
		console.log(JSON.stringify(result, null, 2));
		if (!Object.values(checks).every(Boolean) || !tempCleaned) {
			process.exitCode = 1;
		}
	} finally {
		if (registryFixture?.child.exitCode === null) {
			registryFixture.child.kill("SIGTERM");
		}
		if (existsSync(tempRoot)) {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	}
}

main();
