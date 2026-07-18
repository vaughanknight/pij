import { spawnSync } from "node:child_process";

export const NPM_REGISTRY_URL = "https://packagefeedproxy.microsoft.io/npm/";
export const NPM_REPLACE_REGISTRY_HOST = "npmjs";
export const NPM_PREFER_ONLINE = true;
export const MIN_RELEASE_AGE_DAYS = 7;
export const ROOT_LOCK_REPLAY_MIN_RELEASE_AGE = "null";

// ─── quarantine-support preflight (PR#25 adopt, dove ruling: fail-closed) ─────
//
// The `min-release-age` quarantine is enforced by npm NATIVELY, and only npm
// >= 11 does so — npm 10 ACCEPTS the flag but silently installs a too-young
// package, so the 7-day control no-ops. (This gap shipped in #22 too; the
// preflight retroactively closes it.) A security control must never silently do
// nothing: the governed install path probes npm up front and REFUSES on npm <11
// rather than proceeding unprotected. Net posture: governed installs require
// npm >= 11 — enforce, or refuse; never silently skip.
export const MIN_NPM_MAJOR_FOR_QUARANTINE = 11;

/** Parse an npm `--version` string (e.g. "11.10.0") to its major integer.
 *  Returns NaN for anything unparseable (treated as unsupported by the guard). */
export function npmMajor(version: string): number {
	const match = /^\s*v?(\d+)\./.exec(version);
	return match ? Number(match[1]) : Number.NaN;
}

/** Pure guard: the named refusal error when npm cannot enforce the quarantine,
 *  or null when it can. */
export function quarantineSupportError(version: string): string | null {
	const major = npmMajor(version);
	if (Number.isInteger(major) && major >= MIN_NPM_MAJOR_FOR_QUARANTINE) return null;
	return (
		`min-release-age requires npm>=${MIN_NPM_MAJOR_FOR_QUARANTINE}; quarantine cannot be enforced ` +
		`— refusing rather than silently skipping it (found npm ${version.trim() || "unknown"}).`
	);
}

/** Fail-closed preflight for EVERY governed install path (dove ruling: no
 *  governed install may silently skip the quarantine on any npm — unreachability
 *  is a mitigation, not an invariant). Probes the npm version under the governed
 *  environment (so a hostile caller config can't trip the probe) and, on
 *  npm < 11, prints the named refusal and exits nonzero rather than proceeding
 *  unprotected. Injectable for tests. */
export function assertQuarantineEnforceableOrExit(
	deps: {
		probeNpmVersion?: () => { status: number | null; stdout: string };
		fail?: (message: string) => never;
	} = {},
): void {
	const probe =
		deps.probeNpmVersion ??
		(() => {
			const result = spawnSync("npm", ["--version"], {
				encoding: "utf8",
				env: npmResolutionEnvironment(),
			});
			return { status: result.status, stdout: result.stdout ?? "" };
		});
	const fail =
		deps.fail ??
		((message: string): never => {
			console.error(message);
			process.exit(1);
		});
	const { status, stdout } = probe();
	if (status !== 0) {
		fail("quarantine preflight: could not determine npm version");
		return;
	}
	const refusal = quarantineSupportError(stdout);
	if (refusal) fail(refusal);
}

const NPM_REGISTRY_ENV = "npm_config_registry";
const NPM_REPLACE_REGISTRY_HOST_ENV = "npm_config_replace_registry_host";
const NPM_PREFER_ONLINE_ENV = "npm_config_prefer_online";
const NPM_MIN_RELEASE_AGE_ENV = "npm_config_min_release_age";
const CONFLICTING_NPM_ENV_KEYS = new Set([
	NPM_REGISTRY_ENV,
	NPM_REPLACE_REGISTRY_HOST_ENV,
	NPM_PREFER_ONLINE_ENV,
	NPM_MIN_RELEASE_AGE_ENV,
	"npm_config_before",
]);

function withoutNpmResolutionOverrides(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	return Object.fromEntries(
		Object.entries(environment).filter(([key]) => !CONFLICTING_NPM_ENV_KEYS.has(key.toLowerCase())),
	);
}

export function npmResolutionEnvironment(
	environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	return {
		...withoutNpmResolutionOverrides(environment),
		[NPM_REGISTRY_ENV]: NPM_REGISTRY_URL,
		[NPM_REPLACE_REGISTRY_HOST_ENV]: NPM_REPLACE_REGISTRY_HOST,
		[NPM_PREFER_ONLINE_ENV]: String(NPM_PREFER_ONLINE),
		[NPM_MIN_RELEASE_AGE_ENV]: String(MIN_RELEASE_AGE_DAYS),
	};
}

export function rootLockReplayEnvironment(
	environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	return {
		...withoutNpmResolutionOverrides(environment),
		[NPM_REGISTRY_ENV]: NPM_REGISTRY_URL,
		[NPM_REPLACE_REGISTRY_HOST_ENV]: NPM_REPLACE_REGISTRY_HOST,
		[NPM_PREFER_ONLINE_ENV]: String(NPM_PREFER_ONLINE),
	};
}

export function rootLockReplayNpmArgs(): string[] {
	return ["ci", `--min-release-age=${ROOT_LOCK_REPLAY_MIN_RELEASE_AGE}`];
}
