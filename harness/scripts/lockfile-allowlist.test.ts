import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	ALLOWED_GIT_SOURCES,
	ALLOWED_REGISTRY_HOSTS,
	findDisallowedResolved,
	formatViolations,
} from "./lockfile-allowlist.js";

const PIJ_ROOT = resolve(import.meta.dirname, "..", "..");

describe("lockfile-allowlist (compensating control for npmjs-scoping)", () => {
	it("POSITIVE: the real committed package-lock.json is clean", () => {
		// The whole point of the allowlist: the shipped lockfile must pass. If this
		// fails, either a dependency added a new source (needs review + allowlist
		// update) or the lockfile was tampered with.
		const lock = JSON.parse(readFileSync(resolve(PIJ_ROOT, "package-lock.json"), "utf8"));
		expect(findDisallowedResolved(lock)).toEqual([]);
	});

	it("POSITIVE: allows npmjs registry tarballs and the sanctioned minih git source", () => {
		const lock = {
			packages: {
				"": { name: "root" }, // no resolved — skipped
				"node_modules/left-pad": {
					resolved: "https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz",
				},
				"node_modules/minih": {
					resolved: `${ALLOWED_GIT_SOURCES[0]}#a9bc26e8b19c0236d6aa8c10281c86e03c1e6201`,
				},
			},
		};
		expect(findDisallowedResolved(lock)).toEqual([]);
	});

	it("NEGATIVE: flags a tarball from a non-npmjs registry host", () => {
		const lock = {
			packages: {
				"node_modules/evil": {
					resolved: "https://evil-registry.example.com/evil/-/evil-9.9.9.tgz",
				},
			},
		};
		const violations = findDisallowedResolved(lock);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toMatchObject({
			packagePath: "node_modules/evil",
			host: "evil-registry.example.com",
		});
		// The failure names the offender loudly (tamper-detection).
		expect(formatViolations(violations)).toContain("evil-registry.example.com");
	});

	it("NEGATIVE: flags a git source other than the sanctioned minih repo", () => {
		const lock = {
			packages: {
				"node_modules/rogue": {
					resolved: "git+ssh://git@github.com/attacker/rogue.git#deadbeef",
				},
			},
		};
		const violations = findDisallowedResolved(lock);
		expect(violations).toHaveLength(1);
		expect(violations[0]?.host).toBe("git+ssh://git@github.com/attacker/rogue.git");
	});

	it("NEGATIVE: flags a proxy-hosted git URL (the exact always→npmjs breakage class)", () => {
		// This is what `replace-registry-host=always` produced for minih — a git URL
		// rewritten onto the proxy host. The allowlist rejects it: the sanctioned
		// git source is github, not the proxy.
		const lock = {
			packages: {
				"node_modules/minih": {
					resolved: "git+ssh://git@packagefeedproxy.microsoft.io/npm/AI-Substrate/minih.git",
				},
			},
		};
		expect(findDisallowedResolved(lock)).toHaveLength(1);
	});

	it("the allowlist constants are the two-layer model's expected sources", () => {
		expect(ALLOWED_REGISTRY_HOSTS).toContain("registry.npmjs.org");
		expect(ALLOWED_GIT_SOURCES).toContain("git+ssh://git@github.com/AI-Substrate/minih.git");
	});
});
