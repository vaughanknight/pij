// pij-control-plane — pure model-registry read (T002).
//
// Pi-first: parseModelsJson covers the live ~/.pi/agent/models.json shape.
// copilotSeedFromPi seeds from pi's github-copilot provider section.
// claudeAliases + codexSnapshot are honest best-effort/unverified fallbacks.
// The pure parsers take already-read text/JSON; `loadModels()` is the single
// impure composition root that reads pi's models.json + codex's config.toml off
// disk and merges every source (moved here from the bin in plan 029 T002 so the
// `pij agent` CLI surface can reuse the exact same registry without importing the
// bin). All parsing stays pure and separately testable.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { normalizeModelQuery } from "./match.js";

export interface CopilotInstability {
	readonly cli: string;
	/** UTC observation from the instrumented isolation matrix. */
	readonly observedFailAt: string;
	/** UTC observation relayed by the o-prime, not instrumented in this run. */
	readonly observedPassAt: string;
	/** Evidence provenance needed to interpret the two observations honestly. */
	readonly note: string;
}

export interface ModelEntry {
	readonly id: string;
	readonly name: string;
	/** Source provider key or harness name. */
	readonly provider: string;
	/** false = best-effort alias list (claude/codex) — not confirmed by a live registry. */
	readonly verified: boolean;
	/** Does the model support a thinking/reasoning effort level? (#1 — from pi's
	 *  per-model `reasoning` flag, or a curated codex table). Optional so existing
	 *  ModelEntry literals stay valid; readers default to `false`. */
	readonly reasoning?: boolean;
	/** The canonical effort levels this model honors — a subset of
	 *  `off · minimal · low · medium · high · xhigh · max` (#1). Derived from the
	 *  NON-NULL keys of pi's `thinkingLevelMap` (null = unsupported), or a curated
	 *  codex table. Empty / absent = no level data (cannot validate `--effort`). */
	readonly levels?: readonly string[];
	/** Context-window capacity in tokens (plan 054 P2 T007, AC-09) — read off
	 *  pi's per-model `contextWindow`. Absent when the source has none: the
	 *  contextMax join reports honest absence, never a guess. */
	readonly contextWindow?: number;
	/** false = known to reject `--context long_context`; absent = unknown, so
	 *  Copilot preserves the existing behavior and emits the flag. */
	readonly longContext?: boolean;
	/** A measured upstream Copilot instability for this model. This is not an
	 *  interactive-only capability: the record preserves both passing and
	 *  failing observations across request paths. */
	readonly copilotInstability?: CopilotInstability;
}

interface PiModel {
	readonly id?: unknown;
	readonly name?: unknown;
	readonly reasoning?: unknown;
	readonly thinkingLevelMap?: unknown;
	readonly contextWindow?: unknown;
}

/** A usable window is a finite POSITIVE token count; anything else is honest
 *  absence (T007 — the gauge law tolerates no bogus capacities). */
function usableContextWindow(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

interface PiProvider {
	readonly models?: ReadonlyArray<PiModel>;
	readonly modelOverrides?: Readonly<Record<string, unknown>>;
}

interface PiModelsJson {
	readonly providers?: Readonly<Record<string, PiProvider>>;
}

function isObj(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null;
}

/** Canonical effort levels a model honors = the NON-NULL keys of pi's
 *  `thinkingLevelMap` ({canonical → native|null}; null = unsupported for that
 *  model, so it drops out). Returns [] when there's no usable map (#1). */
function levelsFromThinkingMap(map: unknown): string[] {
	if (!isObj(map)) return [];
	return Object.entries(map)
		.filter(([, v]) => v !== null && v !== undefined)
		.map(([k]) => k);
}

const COPILOT_GPT56_LEVELS = ["none", "low", "medium", "high", "xhigh", "max"];
const COPILOT_GPT56_IDS = new Set(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);

/** Normalized bare Copilot ids known to reject `--context long_context`. */
export const COPILOT_NO_LONG_CONTEXT: ReadonlySet<string> = new Set(["gemini-3.6-flash"]);

/** Normalized bare Copilot ids with time-varying upstream request failures. */
export const COPILOT_UNSTABLE_MODELS: ReadonlyMap<string, CopilotInstability> = new Map([
	[
		"gemini-3.6-flash",
		{
			cli: "1.0.81-14",
			observedFailAt: "2026-08-27 ~16:0xZ",
			observedPassAt: "2026-08-27 ~07:33Z",
			note: "Failure instrumented by the dlg-0012 isolation matrix; pass relayed by the o-prime, not instrumented here.",
		},
	],
]);

/** Apply curated Copilot capability data after all registry sources are merged. */
export function annotateLongContext(entries: readonly ModelEntry[]): ModelEntry[] {
	return entries.map((entry) => {
		const isCopilot = entry.provider === "github-copilot" || entry.provider === "copilot";
		if (
			isCopilot &&
			entry.longContext === undefined &&
			COPILOT_NO_LONG_CONTEXT.has(normalizeModelQuery(entry.id))
		) {
			return { ...entry, longContext: false };
		}
		return entry;
	});
}

/** Attach measured upstream instability records to every Copilot projection. */
export function annotateCopilotInstability(entries: readonly ModelEntry[]): ModelEntry[] {
	return entries.map((entry) => {
		const isCopilot = entry.provider === "github-copilot" || entry.provider === "copilot";
		const instability = COPILOT_UNSTABLE_MODELS.get(normalizeModelQuery(entry.id));
		if (isCopilot && entry.copilotInstability === undefined && instability !== undefined) {
			return { ...entry, copilotInstability: instability };
		}
		return entry;
	});
}

function isCopilotGpt56(id: string): boolean {
	return COPILOT_GPT56_IDS.has(id);
}

function piModelLevels(provider: string, id: string, thinkingLevelMap: unknown): string[] {
	if (provider === "github-copilot" && isCopilotGpt56(id)) {
		return [...COPILOT_GPT56_LEVELS];
	}
	return levelsFromThinkingMap(thinkingLevelMap);
}

/**
 * Parse `~/.pi/agent/models.json` (the live pi model registry). Returns one
 * `ModelEntry` per model/override across all providers. Pure: the caller reads
 * the file and passes the parsed JSON.
 *
 * Each provider's `models[]` is primary; `modelOverrides` (provider-level
 * renames / additions) are included unless the id is already in `models[]`.
 */
export function parseModelsJson(raw: unknown): ModelEntry[] {
	if (!isObj(raw)) return [];
	const json = raw as PiModelsJson;
	if (!isObj(json.providers)) return [];
	const entries: ModelEntry[] = [];
	for (const [provider, data] of Object.entries(json.providers)) {
		if (!isObj(data)) continue;
		const seenIds = new Set<string>();
		if (Array.isArray(data.models)) {
			for (const m of data.models) {
				if (!isObj(m) || typeof m.id !== "string") continue;
				const id: string = m.id;
				seenIds.add(id);
				const window = usableContextWindow(m.contextWindow);
				entries.push({
					id,
					name: typeof m.name === "string" ? m.name : id,
					provider,
					verified: true,
					reasoning:
						isCopilotGpt56(id) && provider === "github-copilot" ? true : m.reasoning === true,
					levels: piModelLevels(provider, id, m.thinkingLevelMap),
					...(window === undefined ? {} : { contextWindow: window }),
				});
			}
		}
		if (isObj(data.modelOverrides)) {
			for (const [id, override] of Object.entries(data.modelOverrides as Record<string, unknown>)) {
				if (seenIds.has(id)) continue; // don't duplicate
				const ov = isObj(override) ? override : {};
				const name = typeof ov.name === "string" ? ov.name : id;
				const window = usableContextWindow(ov.contextWindow);
				entries.push({
					id,
					name,
					provider,
					verified: true,
					reasoning:
						isCopilotGpt56(id) && provider === "github-copilot" ? true : ov.reasoning === true,
					levels: piModelLevels(provider, id, ov.thinkingLevelMap),
					...(window === undefined ? {} : { contextWindow: window }),
				});
			}
		}
	}
	return entries;
}

/**
 * Seed copilot models from pi's `github-copilot` provider section. Returns the
 * same structural entries but with `provider: "copilot"` so callers can filter
 * by harness name cleanly.
 */
export function copilotSeedFromPi(raw: unknown): ModelEntry[] {
	if (!isObj(raw)) return [];
	const json = raw as PiModelsJson;
	if (!isObj(json.providers)) return [];
	const section = (json.providers as Record<string, unknown>)["github-copilot"];
	if (!isObj(section)) return [];
	const parsed = parseModelsJson({ providers: { "github-copilot": section } });
	return parsed.map((e) => ({ ...e, provider: "copilot" }));
}

/** Known Claude CLI model aliases (best-effort, unverified — not from a live API). */
export function claudeAliases(): ModelEntry[] {
	return [
		{ id: "claude-opus-5", name: "Claude Opus 5", provider: "claude", verified: false },
		{ id: "claude-fable-5", name: "Claude Fable 5", provider: "claude", verified: false },
		{ id: "claude-sonnet-5", name: "Claude Sonnet 5", provider: "claude", verified: false },
		{ id: "claude-opus-4-8", name: "Claude Opus 4.8", provider: "claude", verified: false },
		{ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "claude", verified: false },
		{
			id: "claude-haiku-4-5-20251001",
			name: "Claude Haiku 4.5",
			provider: "claude",
			verified: false,
		},
		{ id: "claude-opus-4-5", name: "Claude Opus 4.5", provider: "claude", verified: false },
		{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", provider: "claude", verified: false },
		{
			id: "claude-haiku-4-5",
			name: "Claude Haiku 4.5 (legacy)",
			provider: "claude",
			verified: false,
		},
	];
}

// ── codex thinking levels (#2 — curated; not CLI-discoverable) ────────────────
// Codex has NO `--effort` flag and silently ignores bogus reasoning values, so the
// per-model honored levels can only come from a curated table (memory:
// thinking-level-discovery). gpt-5 family honors minimal→xhigh; o-series stops at high.
const CODEX_GPT5_LEVELS = ["minimal", "low", "medium", "high", "xhigh"];
const CODEX_OSERIES_LEVELS = ["minimal", "low", "medium", "high"];

/** Curated reasoning levels for a codex model id (empty when unknown). */
function codexLevelsFor(id: string): string[] {
	if (/^gpt-5/i.test(id)) return [...CODEX_GPT5_LEVELS];
	if (/^o\d/i.test(id)) return [...CODEX_OSERIES_LEVELS];
	return [];
}

/** Build a codex ModelEntry (best-effort/unverified) with curated levels. */
function codexEntry(id: string, name?: string): ModelEntry {
	const levels = codexLevelsFor(id);
	return {
		id,
		name: name ?? id,
		provider: "codex",
		verified: false,
		reasoning: levels.length > 0,
		levels,
	};
}

/** Thin fallback of known Codex model ids (best-effort, unverified). The PRIMARY
 *  source is now the user's `~/.codex/config.toml` default model (see
 *  {@link codexConfigModels} / cli.ts loadModels); this just keeps `pij models`
 *  non-empty for codex when no config is readable. */
export function codexSnapshot(): ModelEntry[] {
	return [
		// gpt-5.6 trio (sol/terra/luna) — served by the codex client but not
		// CLI-enumerable, so they only appear here as best-effort aliases (the
		// config default still wins via loadModels dedup when set).
		codexEntry("gpt-5.6-sol"),
		codexEntry("gpt-5.6-terra"),
		codexEntry("gpt-5.6-luna"),
		codexEntry("gpt-5.5"),
		codexEntry("o3"),
	];
}

/** Build a copilot ModelEntry (best-effort/unverified alias). Copilot's CLI takes a
 *  freeform `--model` and does NOT enumerate, so newer ids won't be in pi's models.json
 *  seed yet. The GPT-5.6 trio carries curated capability data independently of whether
 *  the alias has been verified through a live registry. */
function copilotEntry(id: string, name?: string): ModelEntry {
	const levels = isCopilotGpt56(id) ? [...COPILOT_GPT56_LEVELS] : [];
	return {
		id,
		name: name ?? id,
		provider: "copilot",
		verified: false,
		reasoning: levels.length > 0,
		levels,
	};
}

/** Thin fallback of newer copilot model ids not yet in pi's `models.json` seed
 *  (best-effort, unverified — e.g. the gpt-5.6 trio). Deduped against the pi seed in
 *  {@link loadModels}, so a later VERIFIED pi entry always wins over these aliases. */
export function copilotSnapshot(): ModelEntry[] {
	return [copilotEntry("gpt-5.6-sol"), copilotEntry("gpt-5.6-terra"), copilotEntry("gpt-5.6-luna")];
}

/**
 * Parse the codex default model out of a `~/.codex/config.toml` text (#2). Codex
 * stores its active model as a TOP-LEVEL `model = "<id>"` key; a `model =` inside a
 * `[section]` (e.g. `[notice]`, `[projects.…]`) is unrelated and ignored. Returns a
 * single-entry list for that model (with curated levels), or [] when none/unreadable.
 * Pure — the caller reads the file. Minimal hand-parser (no TOML dependency).
 */
export function codexConfigModels(tomlText: string): ModelEntry[] {
	if (typeof tomlText !== "string") return [];
	let topLevel = true;
	for (const raw of tomlText.split("\n")) {
		const line = raw.trim();
		if (line === "" || line.startsWith("#")) continue;
		if (line.startsWith("[")) {
			topLevel = false; // entered a [section] — top-level keys are done
			continue;
		}
		if (!topLevel) continue;
		const m = line.match(/^model\s*=\s*["']([^"']+)["']/);
		if (m?.[1]) return [codexEntry(m[1])];
	}
	return [];
}

/**
 * Load + merge the full pij model registry from `~/.pi/agent/models.json` (pi +
 * copilot seed), claude aliases, and the codex default (`~/.codex/config.toml`)
 * plus its snapshot fallback. Best-effort: any I/O error degrades to the alias
 * lists so `pij models` / `pij agent` stay usable in CI / offline. Moved here
 * from the bin (plan 029 T002) — the composition is byte-for-byte the same, this
 * is the ONLY impure function in the module.
 */
export function loadModels(): ModelEntry[] {
	const piModelsPath = join(homedir(), ".pi", "agent", "models.json");
	let piRaw: unknown = null;
	try {
		piRaw = JSON.parse(readFileSync(piModelsPath, "utf8"));
	} catch {
		/* no pi install or no models.json → fall back to aliases only */
	}
	const piModels = parseModelsJson(piRaw);
	const copilotSeed = copilotSeedFromPi(piRaw);
	// Merge in the best-effort copilot snapshot (newer ids absent from pi's seed),
	// deduped by id so a VERIFIED pi entry always wins over an unverified alias.
	const copilotSeedIds = new Set(copilotSeed.map((m) => m.id));
	const copilotModels = [
		...copilotSeed,
		...copilotSnapshot().filter((m) => !copilotSeedIds.has(m.id)),
	];
	// claude, like codex below, is a DISTINCT harness target, so its aliases are NOT
	// deduped against pi/copilot: `claude-opus-5` on a Copilot subscription is a
	// different spawn path, auth and entitlement from the same id in Claude Code.
	// Cross-provider dedupe silently HID every shared id from the claude harness — an
	// operator reading `pij models` could not see that the model was launchable there.
	const claude = claudeAliases();
	// Codex (#2): prefer the user's configured default model from ~/.codex/config.toml
	// (best-effort; empty on any read/parse error), ahead of the thin static snapshot.
	let codexToml = "";
	try {
		codexToml = readFileSync(join(homedir(), ".codex", "config.toml"), "utf8");
	} catch {
		/* no codex install / unreadable config → snapshot-only fallback */
	}
	const codexConfig = codexConfigModels(codexToml);
	const codexCfgIds = new Set(codexConfig.map((m) => m.id));
	// codex is a DISTINCT harness target, so its entries are NOT deduped against
	// pi/copilot (a `gpt-5.5` under copilot ≠ the codex one — different harness,
	// different reasoning table). Dedup only WITHIN codex: the config default wins
	// over the thin snapshot fallback. (claude aliases stay seenIds-deduped above.)
	const codexFallback = codexSnapshot().filter((m) => !codexCfgIds.has(m.id));
	const codex = [...codexConfig, ...codexFallback];
	return annotateCopilotInstability(
		annotateLongContext([...piModels, ...copilotModels, ...claude, ...codex]),
	);
}
