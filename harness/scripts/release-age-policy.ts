export const MIN_RELEASE_AGE_DAYS = 7;
export const ROOT_LOCK_REPLAY_MIN_RELEASE_AGE = "null";

const NPM_MIN_RELEASE_AGE_ENV = "npm_config_min_release_age";
const CONFLICTING_NPM_ENV_KEYS = new Set([NPM_MIN_RELEASE_AGE_ENV, "npm_config_before"]);

function withoutReleaseAgeOverrides(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	return Object.fromEntries(
		Object.entries(environment).filter(([key]) => !CONFLICTING_NPM_ENV_KEYS.has(key.toLowerCase())),
	);
}

export function releaseAgeEnvironment(
	environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	return {
		...withoutReleaseAgeOverrides(environment),
		[NPM_MIN_RELEASE_AGE_ENV]: String(MIN_RELEASE_AGE_DAYS),
	};
}

export function rootLockReplayNpmArgs(): string[] {
	return ["ci", `--min-release-age=${ROOT_LOCK_REPLAY_MIN_RELEASE_AGE}`];
}
