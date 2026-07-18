import { spawnSync } from "node:child_process";
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MIN_NPM_MAJOR_FOR_QUARANTINE, npmMajor } from "./release-age-policy.js";

const PIJ_ROOT = resolve(import.meta.dirname, "..", "..");
const RUNNING_NPM_MAJOR = npmMajor(
	spawnSync("npm", ["--version"], { encoding: "utf8" }).stdout ?? "",
);
// On npm < 11 the fail-closed quarantine preflight refuses every governed
// install up front (dove ruling), so the bootstrap exits before running pi. The
// per-test assertions branch on this: npm >= 11 exercises the install flow;
// npm < 11 asserts the refusal. Node 24 covers the first, node 22 the second.
const QUARANTINE_ENFORCEABLE = RUNNING_NPM_MAJOR >= MIN_NPM_MAJOR_FOR_QUARANTINE;

function expectQuarantineRefusal(result: {
	status: number | null;
	stdout: string;
	stderr: string;
}) {
	expect(result.status).not.toBe(0);
	expect(`${result.stdout}\n${result.stderr}`).toContain("min-release-age requires npm>=11");
}
const temporaryRoots: string[] = [];

interface CopiedCli {
	bin: string;
	root: string;
	settings: string;
	tsx: string;
}

function createCopiedCli(manifest: string): CopiedCli {
	const root = mkdtempSync(join(tmpdir(), "pij-packages-bootstrap-"));
	temporaryRoots.push(root);
	const scripts = join(root, "harness", "scripts");
	const bin = join(root, "bin");
	mkdirSync(join(root, ".pi"), { recursive: true });
	mkdirSync(join(root, "harness"), { recursive: true });
	mkdirSync(bin);
	cpSync(resolve(PIJ_ROOT, "harness", "scripts"), scripts, { recursive: true });
	symlinkSync(resolve(PIJ_ROOT, "node_modules"), join(root, "node_modules"), "dir");
	writeFileSync(join(root, ".pi", "packages.yaml"), manifest);
	const settings = join(root, ".pi", "settings.json");
	writeFileSync(settings, '{\n\t"sentinel": true\n}\n');
	return {
		bin,
		root,
		settings,
		tsx: join(root, "node_modules", ".bin", "tsx"),
	};
}

function writeExecutable(path: string, source: string): void {
	writeFileSync(path, source);
	chmodSync(path, 0o755);
}

function fakePiScript(): string {
	return `#!/bin/sh
set -eu
case "\${1:-}" in
  install)
    printf '%s\\n' "\${2:-}" >> "$PIJ_FAKE_PI_LOG"
    if [ "\${2:-}" = "\${PIJ_FAKE_FAIL_SOURCE:-}" ]; then
      exit 17
    fi
    ;;
  remove)
    exit 0
    ;;
  list)
    if [ -n "\${PIJ_FAKE_LIST_SOURCE:-}" ]; then
      printf 'Project packages:\\n  %s\\n    %s\\n' "$PIJ_FAKE_LIST_SOURCE" "$PIJ_FAKE_PACKAGE_PATH"
    else
      printf 'Project packages:\\n'
    fi
    ;;
esac
`;
}

function runBootstrap(
	fixture: CopiedCli,
	environment: Record<string, string | undefined>,
): ReturnType<typeof spawnSync> {
	return spawnSync(
		fixture.tsx,
		[join(fixture.root, "harness", "scripts", "packages.ts"), "bootstrap"],
		{
			cwd: fixture.root,
			encoding: "utf8",
			env: {
				...process.env,
				...environment,
				PATH: `${fixture.bin}${delimiter}${process.env.PATH ?? ""}`,
			},
		},
	);
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe.skipIf(process.platform === "win32")("Unix package bootstrap status", () => {
	it("attempts every install and exits nonzero after execution failures", () => {
		const fresh = new Date().toISOString();
		const fixture = createCopiedCli(`packages:
  - source: npm:first
    enabled: true
    vetted: { date: "${fresh}", score: 100 }
  - source: npm:fails
    enabled: true
    vetted: { date: "${fresh}", score: 100 }
  - source: npm:last
    enabled: true
    vetted: { date: "${fresh}", score: 100 }
`);
		const originalSettings = readFileSync(resolve(PIJ_ROOT, ".pi", "settings.json"), "utf8");
		const log = join(fixture.root, "pi-install.log");
		writeExecutable(join(fixture.bin, "pi"), fakePiScript());

		const result = runBootstrap(fixture, {
			PIJ_FAKE_FAIL_SOURCE: "npm:fails",
			PIJ_FAKE_PI_LOG: log,
		});

		if (!QUARANTINE_ENFORCEABLE) {
			// Fail-closed: the bootstrap refuses at the first governed install; pi
			// never runs, so the install log is never created.
			expectQuarantineRefusal(result);
			expect(existsSync(log)).toBe(false);
			return;
		}
		expect(result.status).toBe(1);
		expect(readFileSync(log, "utf8").trim().split("\n")).toEqual([
			"npm:first",
			"npm:fails",
			"npm:last",
		]);
		expect(result.stdout).not.toMatch(/✓ installed/);
		expect(result.stderr).toContain("✗ bootstrap installation failed for 1/3 package(s)");
		expect(result.stderr).toContain("✗ failed package installs: npm:fails");
		expect(JSON.parse(readFileSync(fixture.settings, "utf8"))).toMatchObject({
			sentinel: true,
			packages: ["npm:first", "npm:fails", "npm:last"],
		});
		expect(readFileSync(resolve(PIJ_ROOT, ".pi", "settings.json"), "utf8")).toBe(originalSettings);
	});

	it("keeps stale fail vet verdicts report-only when installs succeed", () => {
		const source = "git:github.com/example/flagged";
		const fixture = createCopiedCli(`packages:
  - source: ${source}
    enabled: true
    vetted: { date: "2020-01-01T00:00:00.000Z", score: 100 }
`);
		const packagePath = join(fixture.root, "installed", "flagged");
		const log = join(fixture.root, "pi-install.log");
		mkdirSync(packagePath, { recursive: true });
		writeExecutable(join(fixture.bin, "pi"), fakePiScript());
		writeExecutable(
			join(fixture.bin, "gh"),
			'#!/bin/sh\nprintf \'%s\\n\' \'{"created_at":"2099-01-01T00:00:00.000Z","pushed_at":"2099-01-01T00:00:00.000Z","stargazers_count":0,"license":null}\'\n',
		);

		const result = runBootstrap(fixture, {
			PIJ_FAKE_LIST_SOURCE: source,
			PIJ_FAKE_PACKAGE_PATH: packagePath,
			PIJ_FAKE_PI_LOG: log,
		});

		if (!QUARANTINE_ENFORCEABLE) {
			expectQuarantineRefusal(result);
			expect(existsSync(log)).toBe(false);
			return;
		}
		expect(result.status).toBe(0);
		expect(readFileSync(log, "utf8").trim()).toBe(source);
		expect(result.stdout).toContain("✓ installed 1/1");
		expect(result.stdout).toContain("REVIEW: 1 package(s) have findings");
		expect(result.stdout).toContain(`${source}: fail`);
		expect(result.stderr).not.toContain("bootstrap installation failed");
	});
});
