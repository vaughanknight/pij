import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PIJ_ROOT = resolve(import.meta.dirname, "..", "..");
const justfile = readFileSync(resolve(PIJ_ROOT, "justfile"), "utf8");

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

/**
 * Body of a single recipe. Matches the header with or without parameters
 * (`_omp-binary-install *REF:`), and never an assignment (`name := value`).
 */
function recipeBody(name: string): string {
	const lines = justfile.split("\n");
	const header = new RegExp(`^${escapeRegExp(name)}(\\s+[^:]*?)?\\s*:(?!=)`);
	const start = lines.findIndex((line) => header.test(line));
	if (start < 0) throw new Error(`missing just recipe: ${name}`);
	const body: string[] = [];
	for (const line of lines.slice(start + 1)) {
		// Indented lines belong to the recipe; a blank line inside one is legal.
		// Anything else at column 0 (next recipe, comment, setting) ends it.
		if (line.trim() !== "" && !line.startsWith(" ") && !line.startsWith("\t")) break;
		body.push(line);
	}
	return body.join("\n");
}

function recipeExists(name: string): boolean {
	try {
		recipeBody(name);
		return true;
	} catch {
		return false;
	}
}

/**
 * A recipe's body plus the bodies of every recipe it delegates to, transitively.
 *
 * The OMP install/update logic is shared through `just _omp-*` helpers, so the
 * supply-chain assertions below must see through that delegation — otherwise
 * extracting a helper would silently retire the guard rather than move it.
 */
function resolvedRecipeBody(name: string, seen = new Set<string>()): string {
	if (seen.has(name)) return "";
	seen.add(name);
	const body = recipeBody(name);
	const parts = [body];
	// Not line-anchored: delegations also appear inside command substitutions,
	// e.g. `latest=$(just _omp-latest-release || true)`.
	for (const [, dep] of body.matchAll(/\bjust\s+([A-Za-z_][\w-]*)/g)) {
		if (recipeExists(dep)) parts.push(resolvedRecipeBody(dep, seen));
	}
	return parts.join("\n");
}

function hostsIn(body: string): string[] {
	const hosts = [...body.matchAll(/https:\/\/([^/\s"')]+)/g)].map(([, host]) => host);
	return [...new Set(hosts)].sort();
}

describe("OMP management recipes", () => {
	it("installs the official prebuilt binary when omp is absent", () => {
		const body = recipeBody("omp-install");
		const resolved = resolvedRecipeBody("omp-install");
		expect(body).toContain("command -v omp");
		// The install itself is delegated; the guard follows it through.
		expect(body).toContain("just _omp-binary-install");
		expect(resolved).toContain("https://omp.sh/install");
		expect(resolved).toContain("--binary");
		expect(body).toContain("just link");
		expect(body).toContain("just omp-doctor");
	});

	it("only ever fetches the installer from the official host", () => {
		// The teeth of this guard: repointing the installer at any other host —
		// in `omp-install` or in any helper it delegates to — fails here.
		expect(hostsIn(resolvedRecipeBody("omp-install"))).toEqual(["omp.sh"]);

		const helper = recipeBody("_omp-binary-install");
		expect(helper).toContain("https://omp.sh/install");

		// Every invocation of the downloaded installer must ask for the official
		// prebuilt binary. Asserting the flag merely appears somewhere would still
		// pass if one call site quietly dropped it and fell back to a source build.
		const invocations = [...helper.matchAll(/^\s*sh\s+"\$tmp".*$/gm)].map(([line]) => line);
		expect(invocations.length).toBeGreaterThan(0);
		for (const invocation of invocations) {
			expect(invocation).toContain("--binary");
		}
	});

	it("updates through omp's built-in updater and restores managed links", () => {
		const body = recipeBody("update-omp");
		expect(body).toContain("omp update");
		expect(body).toContain("just link");
		expect(body).toContain("just omp-doctor");
	});

	it("keeps the update path on the official installer and read-only probes", () => {
		// `update-omp` reaches two more hosts than the install path: the GitHub
		// releases feed the installer already uses, and registry.npmjs.org, which is
		// probed to diagnose a blocked registry and never installed from. Any host
		// beyond these three is a new supply-chain surface and must be reviewed.
		expect(hostsIn(resolvedRecipeBody("update-omp"))).toEqual([
			"api.github.com",
			"omp.sh",
			"registry.npmjs.org",
		]);
	});

	it("proves an installed omp actually runs before reporting success", () => {
		// A version delta alone is not proof of a good install: a byte-complete,
		// correctly signed binary can still be killed on launch. Both entry points
		// must reach the smoke check, or a broken install reports success.
		expect(recipeBody("_omp-binary-install")).toContain("just _omp-smoke-check");
		expect(resolvedRecipeBody("omp-install")).toContain("omp --version");
		expect(resolvedRecipeBody("update-omp")).toContain("just _omp-smoke-check");
	});

	it("does not relax npm supply-chain policy to complete an update", () => {
		const resolved = resolvedRecipeBody("update-omp");
		expect(resolved).not.toMatch(/min-release-age/);
		expect(resolved).not.toMatch(/--ignore-scripts/);
		expect(resolved).not.toMatch(/\baudit\s*=\s*false\b/);
	});

	it("doctor checks version, pij-only extension inventory, and shared MCP config", () => {
		const body = recipeBody("omp-doctor");
		expect(body).toContain("omp --version");
		expect(body).toContain("--doctor-omp");
	});
});
