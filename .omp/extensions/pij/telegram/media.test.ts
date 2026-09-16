// pij-telegram — media pure-unit specs (Plan Phase 5 / AC-11·12·13; the Dim-0 anchors).
//
// Every assertion here is written to flip RED under a plausible mutation of media.ts:
// flip a classification, widen/narrow a `<=` cap boundary, drop the basename/sanitise
// step, or omit a notice field — the matching test fails. The cross-model reviewer
// mutates this code to check; these are the pre-emption.

import { describe, expect, it } from "vitest";
import {
	buildInboundNotice,
	classifyMedia,
	DOWNLOAD_LIMIT_BYTES,
	OTHER_UPLOAD_LIMIT_BYTES,
	PHOTO_UPLOAD_LIMIT_BYTES,
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
