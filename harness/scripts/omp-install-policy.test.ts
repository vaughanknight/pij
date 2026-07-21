import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PIJ_ROOT = resolve(import.meta.dirname, "..", "..");
const justfile = readFileSync(resolve(PIJ_ROOT, "justfile"), "utf8");

function recipeBody(name: string): string {
	const lines = justfile.split("\n");
	const start = lines.indexOf(`${name}:`);
	if (start < 0) throw new Error(`missing just recipe: ${name}`);
	const body: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (!line.startsWith(" ") && !line.startsWith("\t")) break;
		body.push(line);
	}
	return body.join("\n");
}

describe("OMP management recipes", () => {
	it("installs the official prebuilt binary when omp is absent", () => {
		const body = recipeBody("omp-install");
		expect(body).toContain("command -v omp");
		expect(body).toContain("https://omp.sh/install");
		expect(body).toContain("--binary");
		expect(body).toContain("just link");
		expect(body).toContain("just omp-doctor");
	});

	it("updates through omp's built-in updater and restores managed links", () => {
		const body = recipeBody("update-omp");
		expect(body).toContain("omp update");
		expect(body).toContain("just link");
		expect(body).toContain("just omp-doctor");
	});

	it("doctor checks version, pij-only extension inventory, and shared MCP config", () => {
		const body = recipeBody("omp-doctor");
		expect(body).toContain("omp --version");
		expect(body).toContain("--doctor-omp");
	});
});
