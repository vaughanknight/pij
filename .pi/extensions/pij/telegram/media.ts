// pij-telegram — media relay pure units (Plan Phase 5; AC-11·12·13).
//
// Reference-passing keeps the pij wire text-only: files live on disk, only paths +
// metadata ride the `body`. These pure helpers are the trust boundary — classification
// (which Telegram method to call), the upload/download size caps (never throw on an
// oversize file, fall back to a text notice), filename sanitisation (an inbound name is
// untrusted operator input — strip any path/traversal so a download can NEVER escape the
// session's own attachments dir), and the inbound text notice. No I/O, no grammY — every
// rule here is exhaustively unit-testable (the Dim-0 anchors).

/** Which Telegram send method a file maps to (by extension, outbound). */
export type MediaKind = "photo" | "animation" | "document";

/** Extensions sent as a photo (`sendPhoto`). */
export const PHOTO_EXTS: ReadonlySet<string> = new Set(["jpg", "jpeg", "png", "webp"]);
/** Extensions sent as an animation (`sendAnimation`). */
export const ANIMATION_EXTS: ReadonlySet<string> = new Set(["gif", "mp4"]);

/** Telegram upload caps (bot API): 10 MB for a photo, 50 MB for anything else. */
export const PHOTO_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;
export const OTHER_UPLOAD_LIMIT_BYTES = 50 * 1024 * 1024;
/** Telegram download cap (bot API `getFile`): 20 MB. */
export const DOWNLOAD_LIMIT_BYTES = 20 * 1024 * 1024;

/** Lower-cased final extension of `path` (no dot); "" when there is none. */
function extensionOf(path: string): string {
	const base = path.split(/[/\\]/).pop() ?? "";
	const dot = base.lastIndexOf(".");
	// A leading-dot-only name ("..", ".env") has no real extension.
	return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/**
 * Classify a local file by its extension into the Telegram send method it needs.
 * jpg/jpeg/png/webp → photo; gif/mp4 → animation; everything else (incl. unknown or
 * no extension) → document. Case-insensitive (a `.PNG` is a photo).
 */
export function classifyMedia(path: string): MediaKind {
	const ext = extensionOf(path);
	if (PHOTO_EXTS.has(ext)) return "photo";
	if (ANIMATION_EXTS.has(ext)) return "animation";
	return "document";
}

/**
 * Is a file within the OUTBOUND upload cap for its kind? Photos cap at 10 MB, all other
 * kinds at 50 MB. Exactly-at-the-limit is allowed (`<=`); one byte over is not. Never
 * throws — the caller turns `false` into a text-notice fallback (AC-11).
 */
export function withinUploadLimit(bytes: number, kind: MediaKind): boolean {
	const limit = kind === "photo" ? PHOTO_UPLOAD_LIMIT_BYTES : OTHER_UPLOAD_LIMIT_BYTES;
	return bytes <= limit;
}

/**
 * Is a file within the INBOUND download cap (20 MB)? Exactly-at-the-limit is allowed;
 * one byte over is not. The bridge pre-checks this before any `getFile`/download so an
 * oversize file is refused with a text reply, never fetched (AC-12).
 */
export function withinDownloadLimit(bytes: number): boolean {
	return bytes <= DOWNLOAD_LIMIT_BYTES;
}

/**
 * Sanitise an untrusted inbound filename into a single safe path segment that can only
 * land INSIDE the session's attachments dir. Takes the basename (drops any directory or
 * traversal prefix — `/`, `\`, `..`), maps every char outside `[A-Za-z0-9._-]` to `_`,
 * and strips leading dots (no hidden/`..` files). Empty/all-stripped names fall back to
 * `"file"`. The result NEVER contains a path separator, so a join with it cannot escape.
 */
export function safeMediaName(raw: string): string {
	const base = raw.split(/[/\\]/).pop() ?? "";
	const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
	return cleaned.length > 0 ? cleaned : "file";
}

/** The metadata a saved inbound file carries into the text notice. */
export interface InboundNotice {
	/** Absolute on-disk path the file was saved to (inside the session's store). */
	readonly path: string;
	/** Operator caption that came with the media (after any address token), if any. */
	readonly caption?: string;
	/** MIME type as reported by Telegram (or synthesised for a photo). */
	readonly mime?: string;
	/** File size in bytes, if Telegram reported it. */
	readonly size?: number;
}

/** Human-readable byte size (B/KB/MB) for the notice — informational only. */
function humanBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Build the text body delivered to a session when an operator sends it media. The pij
 * wire stays text — this notice is the ONLY thing the session receives; it can then
 * choose to open the file at `path`. Always carries the path; the caption, mime, and
 * size are appended when present (so each is independently assertable — Dim-0).
 */
export function buildInboundNotice(n: InboundNotice): string {
	// Fields are joined with a SPACED separator ("  ·  "), not a bare "\n": some control-plane
	// injectors collapse newlines, which ran the fields together ("…jpgtype:image/jpeg…"). The
	// spaced middot stays readable whether or not newlines survive. Each field is still present
	// (path always; caption/type/size when known) so every assertion is independently provable.
	const meta: string[] = [];
	if (n.caption !== undefined && n.caption.trim() !== "") meta.push(`caption: ${n.caption}`);
	if (n.mime !== undefined && n.mime !== "") meta.push(`type: ${n.mime}`);
	if (n.size !== undefined) meta.push(`size: ${humanBytes(n.size)} (${n.size} bytes)`);
	const metaSuffix = meta.length > 0 ? `  ·  ${meta.join("  ·  ")}` : "";
	return `[telegram media] saved to ${n.path}${metaSuffix}  ·  open it if useful, then reply with \`pij send pij-telegram "…"\`.`;
}
