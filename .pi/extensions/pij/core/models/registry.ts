// pij-control-plane — pure model-registry read (T002).
//
// Pi-first: parseModelsJson covers the live ~/.pi/agent/models.json shape.
// copilotSeedFromPi seeds from pi's github-copilot provider section.
// claudeAliases + codexSnapshot are honest best-effort/unverified fallbacks.
// All impure I/O (reading the file) lives in the caller (cli.ts / tests).

export interface ModelEntry {
	readonly id: string;
	readonly name: string;
	/** Source provider key or harness name. */
	readonly provider: string;
	/** false = best-effort alias list (claude/codex) — not confirmed by a live registry. */
	readonly verified: boolean;
}

interface PiProvider {
	readonly models?: ReadonlyArray<{ id?: unknown; name?: unknown }>;
	readonly modelOverrides?: Readonly<Record<string, { name?: unknown }>>;
}

interface PiModelsJson {
	readonly providers?: Readonly<Record<string, PiProvider>>;
}

function isObj(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null;
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
				entries.push({
					id,
					name: typeof m.name === "string" ? m.name : id,
					provider,
					verified: true,
				});
			}
		}
		if (isObj(data.modelOverrides)) {
			for (const [id, override] of Object.entries(data.modelOverrides as Record<string, unknown>)) {
				if (seenIds.has(id)) continue; // don't duplicate
				const name =
					isObj(override) && typeof (override as { name?: unknown }).name === "string"
						? (override as { name: string }).name
						: id;
				entries.push({ id, name, provider, verified: true });
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

/** Snapshot of known Codex / OpenAI model ids (best-effort, unverified). */
export function codexSnapshot(): ModelEntry[] {
	return [
		{ id: "gpt-4o", name: "GPT-4o", provider: "codex", verified: false },
		{ id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "codex", verified: false },
		{ id: "o1", name: "o1", provider: "codex", verified: false },
		{ id: "o1-mini", name: "o1 Mini", provider: "codex", verified: false },
		{ id: "o3", name: "o3", provider: "codex", verified: false },
		{ id: "o3-mini", name: "o3 Mini", provider: "codex", verified: false },
	];
}
