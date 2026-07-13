#!/usr/bin/env tsx

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export const MANAGED_PROVIDER_KEYS = ["github-copilot", "sakana", "openrouter"] as const;

export type ManagedProvider = (typeof MANAGED_PROVIDER_KEYS)[number];
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject {
	[key: string]: JsonValue;
}
export interface ModelRegistry extends JsonObject {
	providers: JsonObject;
}
export type ManagedModelRegistry = ModelRegistry & {
	providers: JsonObject & Record<ManagedProvider, JsonObject>;
};

export interface SyncModelsOptions {
	sourcePath: string;
	targetPath: string;
}

export type SyncModelsResult =
	| {
			ok: true;
			changed: boolean;
			sourcePath: string;
			targetPath: string;
			managedProviders: readonly ManagedProvider[];
	  }
	| {
			ok: false;
			code:
				| "SOURCE_READ_FAILED"
				| "INVALID_SOURCE"
				| "TARGET_READ_FAILED"
				| "INVALID_TARGET"
				| "TARGET_WRITE_FAILED";
			message: string;
			sourcePath: string;
			targetPath: string;
	  };

type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };
type ReadTargetResult = { ok: true; text: string | undefined } | { ok: false; message: string };
type WriteResult = { ok: true } | { ok: false; message: string };
type CliParseResult = { ok: true; options: SyncModelsOptions } | { ok: false; message: string };

const PIJ_ROOT = resolve(import.meta.dirname, "..", "..");
const MANAGED_PROVIDER_SET = new Set<string>(MANAGED_PROVIDER_KEYS);
export const DEFAULT_SOURCE_PATH = join(PIJ_ROOT, ".pi", "models.json");
export const DEFAULT_TARGET_PATH = join(homedir(), ".pi", "agent", "models.json");

function isJsonValue(value: unknown): value is JsonValue {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean" ||
		(typeof value === "number" && Number.isFinite(value))
	) {
		return true;
	}
	if (Array.isArray(value)) return value.every(isJsonValue);
	if (typeof value !== "object") return false;
	return Object.values(value).every(isJsonValue);
}

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value) && isJsonValue(value);
}

function messageFromUnknown(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
	return typeof error.code === "string" ? error.code : undefined;
}

function parseRegistry(text: string, label: string): ParseResult<ModelRegistry> {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (error) {
		return { ok: false, message: `${label} is not valid JSON: ${messageFromUnknown(error)}` };
	}

	if (!isJsonObject(value)) {
		return { ok: false, message: `${label} must be a JSON object` };
	}
	if (!isJsonObject(value.providers)) {
		return { ok: false, message: `${label}.providers must be a JSON object` };
	}
	for (const [provider, config] of Object.entries(value.providers)) {
		if (!isJsonObject(config)) {
			return { ok: false, message: `${label}.providers.${provider} must be a JSON object` };
		}
	}

	return {
		ok: true,
		value: {
			...value,
			providers: value.providers,
		},
	};
}

function parseSourceRegistry(text: string, sourcePath: string): ParseResult<ManagedModelRegistry> {
	const parsed = parseRegistry(text, `source ${sourcePath}`);
	if (!parsed.ok) return parsed;

	const providerKeys = Object.keys(parsed.value.providers);
	const unexpected = providerKeys.filter((provider) => !MANAGED_PROVIDER_SET.has(provider));
	const missing = MANAGED_PROVIDER_KEYS.filter((provider) => !(provider in parsed.value.providers));
	if (unexpected.length > 0 || missing.length > 0) {
		const details = [
			missing.length > 0 ? `missing: ${missing.join(", ")}` : undefined,
			unexpected.length > 0 ? `unexpected: ${unexpected.join(", ")}` : undefined,
		]
			.filter((detail) => detail !== undefined)
			.join("; ");
		return {
			ok: false,
			message: `source ${sourcePath} must contain exactly ${MANAGED_PROVIDER_KEYS.join(", ")} (${details})`,
		};
	}

	const githubCopilot = parsed.value.providers["github-copilot"];
	const sakana = parsed.value.providers.sakana;
	const openrouter = parsed.value.providers.openrouter;
	if (!isJsonObject(githubCopilot) || !isJsonObject(sakana) || !isJsonObject(openrouter)) {
		return {
			ok: false,
			message: `source ${sourcePath} contains an invalid managed provider object`,
		};
	}

	return {
		ok: true,
		value: {
			...parsed.value,
			providers: {
				...parsed.value.providers,
				"github-copilot": githubCopilot,
				sakana,
				openrouter,
			},
		},
	};
}

function readTarget(targetPath: string): ReadTargetResult {
	try {
		return { ok: true, text: readFileSync(targetPath, "utf8") };
	} catch (error) {
		if (errorCode(error) === "ENOENT") return { ok: true, text: undefined };
		return {
			ok: false,
			message: `cannot read target ${targetPath}: ${messageFromUnknown(error)}`,
		};
	}
}

function writeAtomically(targetPath: string, content: string): WriteResult {
	const targetDir = dirname(targetPath);
	const tempPath = join(targetDir, `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`);

	try {
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(tempPath, content, { encoding: "utf8", flag: "wx" });
		renameSync(tempPath, targetPath);
		return { ok: true };
	} catch (error) {
		let cleanupDetail = "";
		try {
			rmSync(tempPath, { force: true });
		} catch (cleanupError) {
			cleanupDetail = `; failed to remove temporary file ${tempPath}: ${messageFromUnknown(cleanupError)}`;
		}
		return {
			ok: false,
			message: `cannot atomically replace target ${targetPath}: ${messageFromUnknown(error)}${cleanupDetail}`,
		};
	}
}

export function mergeModelRegistries(
	source: ManagedModelRegistry,
	target: ModelRegistry,
): ModelRegistry {
	const providers: JsonObject = { ...target.providers };
	for (const provider of MANAGED_PROVIDER_KEYS) {
		providers[provider] = source.providers[provider];
	}
	return {
		...target,
		providers,
	};
}

export function syncModels(options: SyncModelsOptions): SyncModelsResult {
	const sourcePath = resolve(options.sourcePath);
	const targetPath = resolve(options.targetPath);

	let sourceText: string;
	try {
		sourceText = readFileSync(sourcePath, "utf8");
	} catch (error) {
		return {
			ok: false,
			code: "SOURCE_READ_FAILED",
			message: `cannot read source ${sourcePath}: ${messageFromUnknown(error)}`,
			sourcePath,
			targetPath,
		};
	}

	const source = parseSourceRegistry(sourceText, sourcePath);
	if (!source.ok) {
		return {
			ok: false,
			code: "INVALID_SOURCE",
			message: source.message,
			sourcePath,
			targetPath,
		};
	}

	const targetRead = readTarget(targetPath);
	if (!targetRead.ok) {
		return {
			ok: false,
			code: "TARGET_READ_FAILED",
			message: targetRead.message,
			sourcePath,
			targetPath,
		};
	}

	let target: ModelRegistry = { providers: {} };
	if (targetRead.text !== undefined) {
		const parsedTarget = parseRegistry(targetRead.text, `target ${targetPath}`);
		if (!parsedTarget.ok) {
			return {
				ok: false,
				code: "INVALID_TARGET",
				message: parsedTarget.message,
				sourcePath,
				targetPath,
			};
		}
		target = parsedTarget.value;
	}

	const output = `${JSON.stringify(mergeModelRegistries(source.value, target), null, 2)}\n`;
	if (targetRead.text === output) {
		return {
			ok: true,
			changed: false,
			sourcePath,
			targetPath,
			managedProviders: MANAGED_PROVIDER_KEYS,
		};
	}

	const written = writeAtomically(targetPath, output);
	if (!written.ok) {
		return {
			ok: false,
			code: "TARGET_WRITE_FAILED",
			message: written.message,
			sourcePath,
			targetPath,
		};
	}

	return {
		ok: true,
		changed: true,
		sourcePath,
		targetPath,
		managedProviders: MANAGED_PROVIDER_KEYS,
	};
}

function parseCliArgs(args: readonly string[]): CliParseResult {
	let sourcePath = DEFAULT_SOURCE_PATH;
	let targetPath = DEFAULT_TARGET_PATH;

	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (argument === "--") continue;
		if (argument !== "--source" && argument !== "--target") {
			return { ok: false, message: `unknown argument: ${argument}` };
		}
		const value = args[index + 1];
		if (value === undefined || value.startsWith("--")) {
			return { ok: false, message: `${argument} requires a path` };
		}
		if (argument === "--source") sourcePath = value;
		else targetPath = value;
		index++;
	}

	return {
		ok: true,
		options: { sourcePath, targetPath },
	};
}

function usage(): string {
	return [
		"usage: just sync-models [--source <path>] [--target <path>]",
		`default source: ${DEFAULT_SOURCE_PATH}`,
		`default target: ${DEFAULT_TARGET_PATH}`,
	].join("\n");
}

async function runCli(args: readonly string[]): Promise<number> {
	if (args.includes("--help")) {
		console.log(usage());
		return 0;
	}

	const parsed = parseCliArgs(args);
	if (!parsed.ok) {
		console.error(`sync-models: ${parsed.message}`);
		console.error(usage());
		return 2;
	}

	const result = syncModels(parsed.options);
	if (!result.ok) {
		console.error(`sync-models [${result.code}]: ${result.message}`);
		return 1;
	}

	const action = result.changed ? "synchronized" : "already synchronized";
	console.log(`${action}: ${result.managedProviders.join(", ")} → ${result.targetPath}`);
	return 0;
}

const isMainModule =
	process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (isMainModule) {
	process.exitCode = await runCli(process.argv.slice(2));
}
