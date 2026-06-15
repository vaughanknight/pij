// Pi-free store and command contracts for pi-peacock.
// Imports nothing from @earendil-works/* (P2); side effects are injected (P3).

export const PEACOCK_SESSION_CUSTOM_TYPE = "pi-peacock.settings.v1";
export const PEACOCK_SURFACES = ["footer"] as const;

export type PeacockSurface = (typeof PEACOCK_SURFACES)[number];

export interface PeacockPreset {
	readonly id: string;
	readonly label: string;
	readonly hex: string;
	readonly aliases: readonly string[];
}

export const PEACOCK_PRESETS: readonly PeacockPreset[] = [
	{ id: "angularRed", label: "Angular Red", hex: "#dd0531", aliases: ["angular", "red"] },
	{ id: "azureBlue", label: "Azure Blue", hex: "#007fff", aliases: ["azure"] },
	{
		id: "javascriptYellow",
		label: "JavaScript Yellow",
		hex: "#f9e64f",
		aliases: ["javascript", "js", "yellow"],
	},
	{
		id: "mandalorianBlue",
		label: "Mandalorian Blue",
		hex: "#1857a4",
		aliases: ["mandalorian", "mando"],
	},
	{ id: "nodeGreen", label: "Node Green", hex: "#215732", aliases: ["node"] },
	{ id: "reactBlue", label: "React Blue", hex: "#61dafb", aliases: ["react"] },
	{
		id: "somethingDifferent",
		label: "Something Different",
		hex: "#832561",
		aliases: ["different", "purple"],
	},
	{ id: "svelteOrange", label: "Svelte Orange", hex: "#ff3d00", aliases: ["svelte"] },
	{
		id: "vueGreen",
		label: "Vue Green / Peacock Green",
		hex: "#42b883",
		aliases: ["vue", "peacock", "peacockGreen", "green"],
	},
];

export interface PeacockSettings {
	readonly enabled: boolean;
	readonly colorHex?: string;
	readonly presetId?: string;
	readonly surface: PeacockSurface;
	readonly updatedAt?: number;
}

export interface ApplyPeacockInput {
	readonly colorHex: string;
	readonly presetId?: string;
	readonly surface?: PeacockSurface;
}

export type PeacockEntryData =
	| {
			readonly op: "apply";
			readonly colorHex: string;
			readonly presetId?: string;
			readonly surface: PeacockSurface;
			readonly at: number;
	  }
	| { readonly op: "off"; readonly at: number }
	| { readonly op: "reset"; readonly at: number };

export interface ReplayableEntry {
	readonly type: string;
	readonly customType?: string;
	readonly data?: unknown;
}

export type AppendFn = (customType: string, data: PeacockEntryData) => void;

export type StoreResult<T> =
	| { ok: true; value: T; message: string }
	| { ok: false; code: string; message: string };

export type PeacockCommand =
	| { readonly action: "help" }
	| { readonly action: "list" }
	| { readonly action: "status"; readonly json?: boolean }
	| { readonly action: "off" }
	| { readonly action: "reset" }
	| { readonly action: "surface"; readonly surface: PeacockSurface }
	| { readonly action: "apply"; readonly colorHex: string; readonly presetId?: string };

export type CommandResult =
	| { ok: true; command: PeacockCommand }
	| { ok: false; code: string; message: string };

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;
const DEFAULT_SETTINGS: PeacockSettings = { enabled: false, surface: "footer" };

function ok<T>(value: T, message: string): StoreResult<T> {
	return { ok: true, value, message };
}

function error<T>(code: string, message: string): StoreResult<T> {
	return { ok: false, code, message };
}

function commandError(code: string, message: string): CommandResult {
	return { ok: false, code, message };
}

function key(value: string): string {
	return value.replaceAll(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function normalizeHex(value: string): StoreResult<string> {
	const trimmed = value.trim();
	if (!HEX_RE.test(trimmed)) {
		return error("PEACOCK_BAD_COLOR", `pi-peacock: unsupported color ${value}`);
	}
	const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
	return ok(withHash.toLowerCase(), `pi-peacock: normalized ${withHash.toLowerCase()}`);
}

export function findPreset(value: string): PeacockPreset | undefined {
	const wanted = key(value);
	return PEACOCK_PRESETS.find(
		(preset) => key(preset.id) === wanted || preset.aliases.some((alias) => key(alias) === wanted),
	);
}

export function formatPeacockList(): string {
	return [
		"pi-peacock presets:",
		...PEACOCK_PRESETS.map((preset) => `${preset.id} — ${preset.label}: ${preset.hex}`),
	].join("\n");
}

export function peacockHelpText(): string {
	return [
		"pi-peacock commands:",
		"/peacock list",
		"/peacock <preset|#rrggbb>",
		"/peacock status [--json]",
		"/peacock surface footer",
		"/peacock off",
		"/peacock reset",
	].join("\n");
}

export function parsePeacockCommand(args: string): CommandResult {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return { ok: true, command: { action: "status" } };
	const [head, second] = tokens;
	if (head === undefined) return { ok: true, command: { action: "status" } };
	const lower = head.toLowerCase();
	if (lower === "help" || lower === "--help" || lower === "-h") {
		return { ok: true, command: { action: "help" } };
	}
	if (lower === "list") return { ok: true, command: { action: "list" } };
	if (lower === "status")
		return { ok: true, command: { action: "status", json: second === "--json" } };
	if (lower === "off") return { ok: true, command: { action: "off" } };
	if (lower === "reset") return { ok: true, command: { action: "reset" } };
	if (lower === "surface") {
		if (second === "footer") return { ok: true, command: { action: "surface", surface: "footer" } };
		return commandError("PEACOCK_BAD_SURFACE", "pi-peacock: v1 only supports surface footer");
	}
	const preset = findPreset(head);
	if (preset) {
		return { ok: true, command: { action: "apply", colorHex: preset.hex, presetId: preset.id } };
	}
	const hex = normalizeHex(head);
	if (hex.ok) return { ok: true, command: { action: "apply", colorHex: hex.value } };
	return commandError("PEACOCK_BAD_COMMAND", `pi-peacock: unknown color or command ${head}`);
}

function isSurface(value: unknown): value is PeacockSurface {
	return value === "footer";
}

function isEntryData(value: unknown): value is PeacockEntryData {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as {
		op?: unknown;
		colorHex?: unknown;
		presetId?: unknown;
		surface?: unknown;
		at?: unknown;
	};
	if (candidate.op === "off" || candidate.op === "reset") return typeof candidate.at === "number";
	if (candidate.op !== "apply") return false;
	if (typeof candidate.colorHex !== "string" || !normalizeHex(candidate.colorHex).ok) return false;
	if (!isSurface(candidate.surface)) return false;
	if (candidate.presetId !== undefined && typeof candidate.presetId !== "string") return false;
	return typeof candidate.at === "number";
}

function applyEntry(settings: PeacockSettings, entry: PeacockEntryData): PeacockSettings {
	switch (entry.op) {
		case "apply": {
			const normalized = normalizeHex(entry.colorHex);
			return {
				enabled: true,
				colorHex: normalized.ok ? normalized.value : entry.colorHex,
				presetId: entry.presetId,
				surface: entry.surface,
				updatedAt: entry.at,
			};
		}
		case "off":
			return { ...settings, enabled: false, updatedAt: entry.at };
		case "reset":
			return DEFAULT_SETTINGS;
	}
}

export function replayPeacockSettings(entries: Iterable<ReplayableEntry>): PeacockSettings {
	let settings = DEFAULT_SETTINGS;
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== PEACOCK_SESSION_CUSTOM_TYPE) continue;
		if (!isEntryData(entry.data)) continue;
		settings = applyEntry(settings, entry.data);
	}
	return settings;
}

export class PiPeacockStore {
	private settings: PeacockSettings = DEFAULT_SETTINGS;

	constructor(
		private readonly append: AppendFn,
		private readonly now: () => number = Date.now,
	) {}

	rehydrate(entries: Iterable<ReplayableEntry>): void {
		this.settings = replayPeacockSettings(entries);
	}

	snapshot(): PeacockSettings {
		return this.settings;
	}

	applyColor(input: ApplyPeacockInput): StoreResult<PeacockSettings> {
		const normalized = normalizeHex(input.colorHex);
		if (!normalized.ok) return normalized;
		const entry: PeacockEntryData = {
			op: "apply",
			colorHex: normalized.value,
			presetId: input.presetId,
			surface: input.surface ?? "footer",
			at: this.now(),
		};
		this.append(PEACOCK_SESSION_CUSTOM_TYPE, entry);
		this.settings = applyEntry(this.settings, entry);
		return ok(this.settings, `pi-peacock: applied ${normalized.value}`);
	}

	setSurface(surface: PeacockSurface): StoreResult<PeacockSettings> {
		if (!this.settings.enabled || !this.settings.colorHex) {
			this.settings = { ...this.settings, surface };
			return ok(this.settings, `pi-peacock: surface ${surface}`);
		}
		return this.applyColor({
			colorHex: this.settings.colorHex,
			presetId: this.settings.presetId,
			surface,
		});
	}

	off(): StoreResult<PeacockSettings> {
		const entry: PeacockEntryData = { op: "off", at: this.now() };
		this.append(PEACOCK_SESSION_CUSTOM_TYPE, entry);
		this.settings = applyEntry(this.settings, entry);
		return ok(this.settings, "pi-peacock: off");
	}

	reset(): StoreResult<PeacockSettings> {
		const entry: PeacockEntryData = { op: "reset", at: this.now() };
		this.append(PEACOCK_SESSION_CUSTOM_TYPE, entry);
		this.settings = applyEntry(this.settings, entry);
		return ok(this.settings, "pi-peacock: reset");
	}
}
