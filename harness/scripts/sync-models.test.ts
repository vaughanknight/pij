import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	MANAGED_PROVIDER_KEYS,
	type ManagedModelRegistry,
	type ModelRegistry,
	mergeModelRegistries,
	syncModels,
} from "./sync-models.js";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const PORTABLE_SOURCE = join(REPO_ROOT, ".pi", "models.json");
const SYNC_MODELS_IMPLEMENTATION = join(import.meta.dirname, "sync-models.ts");
const cleanupPaths: string[] = [];

function assertJsonObject(value: unknown): asserts value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("expected a JSON object");
	}
}

function sourceFixture(): ManagedModelRegistry {
	return {
		providers: {
			"github-copilot": {
				modelOverrides: {
					current: { contextWindow: 100 },
				},
				models: [{ id: "new-copilot" }],
			},
			sakana: {
				models: [{ id: "new-sakana" }],
			},
			openrouter: {
				models: [{ id: "new-openrouter" }],
			},
		},
	};
}

async function makeTempDir(): Promise<string> {
	const path = await mkdtemp(join(tmpdir(), "pij-sync-models-"));
	cleanupPaths.push(path);
	return path;
}

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

afterEach(async () => {
	await Promise.all(
		cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
	);
});

describe("portable models source", () => {
	it("contains only the three managed providers and no machine-local or resolved credential", async () => {
		const sourceText = await readFile(PORTABLE_SOURCE, "utf8");
		const parsed: unknown = JSON.parse(sourceText);
		assertJsonObject(parsed);
		assertJsonObject(parsed.providers);

		expect(Object.keys(parsed.providers)).toEqual(MANAGED_PROVIDER_KEYS);
		expect(sourceText).not.toContain("192.168.");
		expect(sourceText).not.toContain('"local"');

		const copilot = parsed.providers["github-copilot"];
		const sakana = parsed.providers.sakana;
		const openrouter = parsed.providers.openrouter;
		assertJsonObject(copilot);
		assertJsonObject(copilot.modelOverrides);
		expect(Object.keys(copilot.modelOverrides)).toHaveLength(2);
		expect(copilot.models).toHaveLength(5);
		assertJsonObject(sakana);
		expect(sakana.models).toHaveLength(2);
		expect(sakana.apiKey).toBe(
			"!python3 -c \"import json,os;print(json.load(open(os.path.expanduser('~/.pi/agent/auth.json')))['sakana']['key'])\"",
		);
		assertJsonObject(openrouter);
		expect(openrouter.models).toHaveLength(5);
		expect(openrouter.models).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "moonshotai/kimi-k3",
					reasoning: true,
					thinkingLevelMap: {
						off: null,
						minimal: null,
						low: null,
						medium: null,
						high: null,
						xhigh: "max",
					},
					input: ["text", "image"],
					contextWindow: 1048576,
					maxTokens: 1048576,
					compat: { thinkingFormat: "openrouter" },
				}),
			]),
		);
	});
});

describe("mergeModelRegistries", () => {
	it("replaces managed providers wholesale while preserving unmanaged providers", () => {
		const source = sourceFixture();
		const localProvider = {
			name: "Local",
			baseUrl: "http://host.invalid/v1",
			models: [{ id: "local-only" }],
		};
		const unknownProvider = {
			name: "Future provider",
			nested: { preserved: true },
		};
		const target: ModelRegistry = {
			version: 7,
			providers: {
				"github-copilot": {
					modelOverrides: {
						current: { contextWindow: 1 },
						stale: { contextWindow: 2 },
					},
					models: [{ id: "stale-copilot" }],
				},
				sakana: {
					models: [{ id: "stale-sakana" }, { id: "removed-sakana" }],
				},
				openrouter: {
					models: [{ id: "stale-openrouter" }],
				},
				local: localProvider,
				future: unknownProvider,
			},
		};

		const merged = mergeModelRegistries(source, target);

		expect(merged.version).toBe(7);
		expect(merged.providers.local).toEqual(localProvider);
		expect(merged.providers.future).toEqual(unknownProvider);
		for (const provider of MANAGED_PROVIDER_KEYS) {
			expect(merged.providers[provider]).toEqual(source.providers[provider]);
		}
		expect(JSON.stringify(merged)).not.toContain("stale");
		expect(JSON.stringify(merged)).not.toContain("removed-sakana");
	});
});

describe("syncModels", () => {
	it("guards same-directory temporary writes followed by atomic rename", async () => {
		const implementation = await readFile(SYNC_MODELS_IMPLEMENTATION, "utf8");

		expect(implementation).toContain("const targetDir = dirname(targetPath);");
		expect(implementation).toContain("const tempPath = join(targetDir,");
		expect(implementation).toContain(
			'writeFileSync(tempPath, content, { encoding: "utf8", flag: "wx" });',
		);
		expect(implementation).toContain("renameSync(tempPath, targetPath);");
		expect(implementation).not.toMatch(/writeFileSync\(\s*targetPath\s*,/);
	});

	it("creates a missing target and parent directory", async () => {
		const dir = await makeTempDir();
		const sourcePath = join(dir, "source.json");
		const targetPath = join(dir, "missing", "parent", "models.json");
		await writeJson(sourcePath, sourceFixture());

		const result = syncModels({ sourcePath, targetPath });

		expect(result).toMatchObject({ ok: true, changed: true });
		const installed: unknown = JSON.parse(await readFile(targetPath, "utf8"));
		expect(installed).toEqual(sourceFixture());
	});

	it("leaves the target byte-identical when the source is malformed", async () => {
		const dir = await makeTempDir();
		const sourcePath = join(dir, "source.json");
		const targetPath = join(dir, "models.json");
		const original = '{\n  "providers": {\n    "local": {"name": "keep me"}\n  }\n}\n';
		await writeFile(sourcePath, '{"providers":', "utf8");
		await writeFile(targetPath, original, "utf8");

		const result = syncModels({ sourcePath, targetPath });

		expect(result).toMatchObject({ ok: false, code: "INVALID_SOURCE" });
		expect(await readFile(targetPath, "utf8")).toBe(original);
	});

	it("leaves a malformed target byte-identical", async () => {
		const dir = await makeTempDir();
		const sourcePath = join(dir, "source.json");
		const targetPath = join(dir, "models.json");
		const original = '{"providers":';
		await writeJson(sourcePath, sourceFixture());
		await writeFile(targetPath, original, "utf8");

		const result = syncModels({ sourcePath, targetPath });

		expect(result).toMatchObject({ ok: false, code: "INVALID_TARGET" });
		expect(await readFile(targetPath, "utf8")).toBe(original);
	});

	it("rejects source files that cross the managed-provider boundary", async () => {
		const dir = await makeTempDir();
		const sourcePath = join(dir, "source.json");
		const targetPath = join(dir, "models.json");
		const invalidSource = sourceFixture();
		invalidSource.providers.local = { models: [{ id: "must-not-ship" }] };
		await writeJson(sourcePath, invalidSource);

		const result = syncModels({ sourcePath, targetPath });

		expect(result).toMatchObject({ ok: false, code: "INVALID_SOURCE" });
		await expect(access(targetPath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("uses a same-directory atomic replacement and is byte-stable on rerun", async () => {
		const dir = await makeTempDir();
		const sourcePath = join(dir, "source.json");
		const targetPath = join(dir, "target", "models.json");
		await writeJson(sourcePath, sourceFixture());

		const first = syncModels({ sourcePath, targetPath });
		const firstBytes = await readFile(targetPath, "utf8");
		const second = syncModels({ sourcePath, targetPath });
		const secondBytes = await readFile(targetPath, "utf8");

		expect(first).toMatchObject({ ok: true, changed: true });
		expect(second).toMatchObject({ ok: true, changed: false });
		expect(secondBytes).toBe(firstBytes);
		expect(await readdir(dirname(targetPath))).toEqual(["models.json"]);
	});
});
