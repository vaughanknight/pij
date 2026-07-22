// pij-telegram — media pure-unit specs (Plan Phase 5 / AC-11·12·13; the Dim-0 anchors).
//
// Every assertion here is written to flip RED under a plausible mutation of media.ts:
// flip a classification, widen/narrow a `<=` cap boundary, drop the basename/sanitise
// step, or omit a notice field — the matching test fails. The cross-model reviewer
// mutates this code to check; these are the pre-emption.

import { describe, expect, it } from "vitest";
import {
	ATTACHMENTS_CAP_BYTES,
	type AttachmentEntry,
	buildInboundNotice,
	classifyMedia,
	DOWNLOAD_LIMIT_BYTES,
	isTransientSendError,
	mediaFailureNotice,
	methodOf,
	OTHER_UPLOAD_LIMIT_BYTES,
	PHOTO_UPLOAD_LIMIT_BYTES,
	pruneAttachments,
	safeMediaName,
	withinDownloadLimit,
	withinUploadLimit,
} from "./media.js";

describe("classifyMedia", () => {
	it("maps image extensions to photo", () => {
		for (const p of ["a.jpg", "a.jpeg", "/tmp/b.png", "c.webp"]) {
			expect(classifyMedia(p)).toBe("photo");
		}
	});

	it("maps gif/mp4 to animation", () => {
		expect(classifyMedia("loop.gif")).toBe("animation");
		expect(classifyMedia("clip.mp4")).toBe("animation");
	});

	it("is case-insensitive (UPPERCASE extension still classifies)", () => {
		// Mutation: drop `.toLowerCase()` and this flips to "document".
		expect(classifyMedia("CHART.PNG")).toBe("photo");
		expect(classifyMedia("LOOP.GIF")).toBe("animation");
	});

	it("falls back to document for unknown or extension-less names", () => {
		// Mutation: default to "photo" instead of "document" and each of these flips.
		expect(classifyMedia("report.pdf")).toBe("document");
		expect(classifyMedia("archive.tar.gz")).toBe("document");
		expect(classifyMedia("README")).toBe("document");
		expect(classifyMedia("noext.")).toBe("document");
		expect(classifyMedia(".env")).toBe("document"); // leading-dot name has no real ext
	});

	it("classifies by the FINAL extension, not a mid-path one", () => {
		// `image.png` is a directory here; the real file is a .pdf → document.
		expect(classifyMedia("/var/image.png/report.pdf")).toBe("document");
	});
});

describe("withinUploadLimit", () => {
	it("photo cap is 10 MB: at-limit ok, one-over not", () => {
		// Mutation: `<` instead of `<=` → at-limit flips false; `<` widened → over flips true.
		expect(withinUploadLimit(PHOTO_UPLOAD_LIMIT_BYTES, "photo")).toBe(true);
		expect(withinUploadLimit(PHOTO_UPLOAD_LIMIT_BYTES - 1, "photo")).toBe(true);
		expect(withinUploadLimit(PHOTO_UPLOAD_LIMIT_BYTES + 1, "photo")).toBe(false);
	});

	it("non-photo cap is 50 MB (animation + document share it)", () => {
		for (const kind of ["animation", "document"] as const) {
			expect(withinUploadLimit(OTHER_UPLOAD_LIMIT_BYTES, kind)).toBe(true);
			expect(withinUploadLimit(OTHER_UPLOAD_LIMIT_BYTES + 1, kind)).toBe(false);
		}
	});

	it("a photo over 10 MB but under 50 MB is rejected as a photo (caps are per-kind)", () => {
		// Mutation: collapse to one shared limit and this flips true.
		const between = PHOTO_UPLOAD_LIMIT_BYTES + 1;
		expect(withinUploadLimit(between, "photo")).toBe(false);
		expect(withinUploadLimit(between, "document")).toBe(true);
	});
});

describe("withinDownloadLimit", () => {
	it("download cap is 20 MB: at-limit ok, one-over not", () => {
		expect(withinDownloadLimit(DOWNLOAD_LIMIT_BYTES)).toBe(true);
		expect(withinDownloadLimit(DOWNLOAD_LIMIT_BYTES - 1)).toBe(true);
		expect(withinDownloadLimit(DOWNLOAD_LIMIT_BYTES + 1)).toBe(false);
	});

	it("uses the 20 MB download cap, distinct from the 50 MB upload cap", () => {
		// A 30 MB file is fine to upload-as-document but too big to download.
		const thirtyMB = 30 * 1024 * 1024;
		expect(withinDownloadLimit(thirtyMB)).toBe(false);
		expect(withinUploadLimit(thirtyMB, "document")).toBe(true);
	});
});

describe("safeMediaName", () => {
	it("keeps a normal basename unchanged", () => {
		expect(safeMediaName("chart.png")).toBe("chart.png");
		expect(safeMediaName("my-report_v2.pdf")).toBe("my-report_v2.pdf");
	});

	it("strips any directory prefix to the basename (no path separators survive)", () => {
		// Mutation: skip the basename split → the result keeps a "/" and could escape.
		expect(safeMediaName("/etc/passwd")).toBe("passwd");
		expect(safeMediaName("a/b/c/file.txt")).toBe("file.txt");
		expect(safeMediaName("C:\\Windows\\evil.exe")).toBe("evil.exe");
	});

	it("neutralises traversal so a join cannot escape the store", () => {
		// "../../secret" → basename "secret"; bare ".." → all dots stripped → "file".
		expect(safeMediaName("../../secret.key")).toBe("secret.key");
		expect(safeMediaName("..")).toBe("file");
		expect(safeMediaName("../")).toBe("file");
		expect(safeMediaName("....//")).toBe("file");
		for (const out of [
			safeMediaName("/etc/passwd"),
			safeMediaName("../../secret.key"),
			safeMediaName("a/b/c.txt"),
		]) {
			expect(out).not.toMatch(/[/\\]/); // never a separator
			expect(out.startsWith("..")).toBe(false); // never a traversal token
		}
	});

	it("maps unsafe characters to underscore and strips leading dots", () => {
		expect(safeMediaName("weird name!.png")).toBe("weird_name_.png");
		expect(safeMediaName(".hidden")).toBe("hidden"); // no hidden files in the store
	});

	it("falls back to 'file' for an empty or fully-stripped name", () => {
		// Mutation: drop the fallback → returns "" and a save path ends in a bare dir.
		expect(safeMediaName("")).toBe("file");
		expect(safeMediaName("///")).toBe("file");
	});
});

describe("buildInboundNotice", () => {
	it("contains the path, caption, mime, and size when all are present", () => {
		const notice = buildInboundNotice({
			path: "/home/.pij/pij-osn81b/attachments/chart.png",
			caption: "look at this",
			mime: "image/png",
			size: 2048,
		});
		expect(notice).toContain("/home/.pij/pij-osn81b/attachments/chart.png");
		expect(notice).toContain("look at this");
		expect(notice).toContain("image/png");
		expect(notice).toContain("2048"); // the raw byte count is present
	});

	it("always carries the path even with no caption/mime/size", () => {
		// Mutation: gate the path line behind a field → this flips empty.
		const notice = buildInboundNotice({ path: "/store/a.bin" });
		expect(notice).toContain("/store/a.bin");
	});

	it("omits an empty/whitespace caption line (no dangling 'caption:')", () => {
		// Mutation: drop the trim guard → "caption:" appears for a blank caption.
		const notice = buildInboundNotice({ path: "/store/a.bin", caption: "   " });
		expect(notice).not.toContain("caption:");
	});

	it("renders the size as bytes (distinct from the path)", () => {
		const notice = buildInboundNotice({ path: "/store/a.bin", size: 1048576 });
		expect(notice).toContain("1048576"); // exact byte count, not just a human string
	});
});

describe("pruneAttachments (s113 W1 retention)", () => {
	const entry = (name: string, mtimeMs: number, size: number): AttachmentEntry => ({
		name,
		mtimeMs,
		size,
	});

	it("returns nothing when the dir is at or under the cap", () => {
		// Mutation: `<` instead of `<=` in the stop condition → at-cap starts pruning.
		expect(pruneAttachments([entry("a", 1, 60), entry("b", 2, 40)], 100)).toEqual([]);
		expect(pruneAttachments([], 100)).toEqual([]);
	});

	it("deletes oldest-mtime first, only until the total is back under the cap", () => {
		// 50+50+50 = 150 over a 100 cap → exactly the single oldest goes.
		const doomed = pruneAttachments(
			[entry("newest", 3, 50), entry("oldest", 1, 50), entry("mid", 2, 50)],
			100,
		);
		expect(doomed).toEqual(["oldest"]); // mutation: newest-first → ["newest"]; no stop → all three
	});

	it("returns names in deletion order (oldest → newer) when several must go", () => {
		const doomed = pruneAttachments([entry("c", 3, 80), entry("a", 1, 80), entry("b", 2, 80)], 100);
		expect(doomed).toEqual(["a", "b"]);
	});

	it("NEVER deletes `keep` (the just-saved file), even if the dir stays over cap", () => {
		// The keep file alone exceeds the cap — nothing else exists to delete.
		expect(pruneAttachments([entry("just-saved", 9, 500)], 100, "just-saved")).toEqual([]);
		// keep is the oldest; pruning must skip it and take the next-oldest instead.
		const doomed = pruneAttachments(
			[entry("just-saved", 1, 80), entry("old", 2, 80)],
			100,
			"just-saved",
		);
		expect(doomed).toEqual(["old"]);
	});

	it("breaks an mtime tie deterministically by name", () => {
		const doomed = pruneAttachments([entry("b", 5, 80), entry("a", 5, 80)], 100);
		expect(doomed).toEqual(["a"]);
	});

	it("the production cap is 200 MB", () => {
		expect(ATTACHMENTS_CAP_BYTES).toBe(200 * 1024 * 1024);
	});
});

describe("methodOf", () => {
	it("names the real bot API method for each kind", () => {
		// Mutation: swap any mapping and the failure-echo names the wrong method.
		expect(methodOf("photo")).toBe("sendPhoto");
		expect(methodOf("animation")).toBe("sendAnimation");
		expect(methodOf("document")).toBe("sendDocument");
	});
});

describe("isTransientSendError (s113 W5 retry gate)", () => {
	it("classifies network-shaped failures as transient", () => {
		for (const m of [
			"fetch failed",
			"Network request for 'sendPhoto' failed!",
			"read ECONNRESET",
			"connect ETIMEDOUT 149.154.167.220:443",
			"socket hang up",
			"getaddrinfo EAI_AGAIN api.telegram.org",
			"Call to 'sendPhoto' failed! (429: Too Many Requests: retry after 5)",
			"502 Bad Gateway",
		]) {
			expect(isTransientSendError(m), m).toBe(true);
		}
	});

	it("classifies deterministic rejections as NOT transient (no retry)", () => {
		for (const m of [
			"Call to 'sendPhoto' failed! (400: Bad Request: IMAGE_PROCESS_FAILED)",
			"ENOENT: no such file or directory, stat '/tmp/gone.png'",
			"Call to 'sendDocument' failed! (403: Forbidden: bot was blocked by the user)",
		]) {
			expect(isTransientSendError(m), m).toBe(false);
		}
	});
});

describe("mediaFailureNotice (s113 W5 failure-echo)", () => {
	it("names the method, the network-error class, and the file", () => {
		const notice = mediaFailureNotice("photo", "/tmp/chart.png", "fetch failed");
		expect(notice).toContain("media forward FAILED");
		expect(notice).toContain("sendPhoto network error");
		expect(notice).toContain("/tmp/chart.png");
		expect(notice).toContain("fetch failed"); // raw message rides along for diagnosis
	});

	it("downgrades the class to plain 'error' for a deterministic failure", () => {
		const notice = mediaFailureNotice("document", "/tmp/r.pdf", "400: Bad Request");
		expect(notice).toContain("sendDocument error");
		expect(notice).not.toContain("network error");
	});
});
