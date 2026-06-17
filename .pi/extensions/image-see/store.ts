// image-see — pi-free core (Pattern P2).
//
// Imports nothing from @earendil-works/*. Pure helpers that decide WHICH
// vision model to use, build the child-pi argv, and validate the request.
// The actual shell-out + fs check live in index.ts; everything here is pure
// so it can be unit-tested in plain Node.
//
// Why a child pi at all: pi's interactive TUI only attaches images via
// clipboard paste (Ctrl+V / app.clipboard.pasteImage) — useless over a remote
// xterm.js→tmux terminal with no local clipboard. `@path` is a *file
// reference* (path text), never image bytes. But `pi -p @img` DOES attach the
// image (cli/file-processor.ts), so we shell a one-shot child on a
// vision-capable model and return its description. See docs/difficulties.md
// D-043.

// ─── constants (Pattern P5: live with the data they constrain) ───────────

/** Default vision model. Available via the Copilot integrator + input:["text","image"]. */
export const DEFAULT_SEE_MODEL = "github-copilot/claude-opus-4.8";

/** Env override for the model, so other machines can pick their own vision model. */
export const SEE_MODEL_ENV = "PI_SEE_MODEL";

export const DEFAULT_SEE_PROMPT =
	"Describe exactly what you see in this image. Report only — do not run any tools or workarounds.";

/** pi accepts image/{png,jpeg,webp,gif}; .jpg maps to jpeg. Anything else is dropped to text. */
export const SUPPORTED_IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"] as const;

/** Hard ceiling on the child run so a hung provider can't wedge the tool. */
export const SEE_TIMEOUT_MS = 120_000;

/** Cap captured child stdout (descriptions are short; guards against a runaway). */
export const SEE_MAX_OUTPUT_BYTES = 64_000;

// ─── env guards ──────────────────────────────────────────────────────────

/**
 * A pi process spawned as our own vision-child (or any pi-subagents child)
 * must NOT register the tool again — otherwise a child could recurse. We set
 * PI_SUBAGENT_CHILD on the child we spawn; pi-subagents sets PI_SUBAGENT_*.
 */
export function isSubagentChild(env: NodeJS.ProcessEnv): boolean {
	return Boolean(env.PI_SUBAGENT_CHILD || env.PI_SUBAGENT_DEPTH);
}

// ─── pure path / arg helpers ─────────────────────────────────────────────

/** Lowercased file extension incl. dot, or "" when none. */
export function imageExt(path: string): string {
	const base = path.split(/[\\/]/).pop() ?? path;
	const dot = base.lastIndexOf(".");
	return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

export function isSupportedImage(path: string): boolean {
	return (SUPPORTED_IMAGE_EXTS as readonly string[]).includes(imageExt(path));
}

/** Expand a leading ~ and resolve relative paths against cwd. Pure (deps injected). */
export function expandPath(path: string, home: string, cwd: string): string {
	let p = path.trim();
	if (p === "~") p = home;
	else if (p.startsWith("~/")) p = `${home}/${p.slice(2)}`;
	if (p.startsWith("/")) return p;
	return `${cwd.replace(/\/$/, "")}/${p}`;
}

export function resolveSeeModel(env: NodeJS.ProcessEnv, override?: string): string {
	const ov = override?.trim();
	if (ov) return ov;
	const fromEnv = env[SEE_MODEL_ENV]?.trim();
	return fromEnv || DEFAULT_SEE_MODEL;
}

export function resolveSeePrompt(override?: string): string {
	const ov = override?.trim();
	return ov || DEFAULT_SEE_PROMPT;
}

/** Build the child-pi argv. Pure — index.ts feeds the result to execFile("pi", …). */
export function buildSeeArgs(input: { absPath: string; model: string; prompt: string }): string[] {
	return ["--no-tools", "--model", input.model, "-p", `@${input.absPath}`, input.prompt];
}

/** Env for the spawned child: inherit, but force the subagent guard on. */
export function seeChildEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	return { ...base, PI_SUBAGENT_CHILD: "1" };
}

// ─── request validation (Pattern P4: tagged-union returns) ───────────────

export type SeeValidation =
	| { ok: true; ext: string }
	| { ok: false; reason: "empty" | "unsupported"; message: string };

export function validateSeeRequest(path: string): SeeValidation {
	const trimmed = path.trim();
	if (!trimmed) {
		return { ok: false, reason: "empty", message: "see_image: path is required" };
	}
	if (!isSupportedImage(trimmed)) {
		const ext = imageExt(trimmed) || "(none)";
		return {
			ok: false,
			reason: "unsupported",
			message: `see_image: unsupported image type ${ext} — pi vision accepts ${SUPPORTED_IMAGE_EXTS.join(", ")}. Convert first (e.g. \`sips -s format png in.heic --out out.png\`).`,
		};
	}
	return { ok: true, ext: imageExt(trimmed) };
}

/** Trim oversized child output to the cap, marking truncation. */
export function clampOutput(text: string, max: number = SEE_MAX_OUTPUT_BYTES): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max)}\n… [truncated]`;
}
