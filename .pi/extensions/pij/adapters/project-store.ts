// pij platform — fs ProjectStorePort adapter (plan 054, T006).
//
// Layout: `<pijHome>/projects/<slug>/project.json` — never at the pijHome top
// level, so FsRegistry.list()'s `*.json` glob can never mistake a project for
// a live peer descriptor (Finding 01). `create` is a first-writer-wins claim
// (publishNoReplace semantics); `update` atomically replaces an EXISTING
// record (writeJsonAtomic, E-NOREG when it never existed); reads are
// guard-validated null-on-fail (focus-store precedent).

import { randomUUID } from "node:crypto";
import {
	closeSync,
	fsyncSync,
	linkSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { ProjectStorePort } from "../core/platform/ports.js";
import { isProject, type Project } from "../core/platform/types.js";
import { err, ok, type Result } from "../core/types.js";
import { fsyncDirBestEffort, writeJsonAtomic } from "./atomic-file.js";

// Keep every path below `projects/<slug>/`: a malformed slug (`..`, `/`,
// empty) could otherwise escape into the pijHome top level, which belongs
// exclusively to FsRegistry live-peer descriptors (Finding 01). Same alphabet
// as focus-store.ts's FOCUS_NAME_PATTERN.
const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * CONSTRAINT: local replica of `FsRegistry#publishNoReplace`
 * (fs-registry.ts:751-776). That method is `private` and fs-registry.ts is
 * frozen, so the temp+linkSync first-writer-wins pattern is replicated here
 * verbatim instead of imported. Keep the two in lockstep.
 *
 * Stages a fully written + fsynced temp BESIDE the target (inside the slug
 * dir, never at the pijHome top level), then publishes via hard-link, which
 * never replaces: EEXIST means another writer already claimed the path. The
 * temp is always removed in `finally`, on both the claimed and exists paths.
 */
function publishNoReplace(path: string, value: unknown): Result<"claimed" | "exists"> {
	mkdirSync(dirname(path), { recursive: true });
	const tmpPath = `${path}.claim-${process.pid}-${randomUUID()}`;
	let fd: number | undefined;
	try {
		// Fully write + fsync the temp before atomic no-replace hard-link publish.
		fd = openSync(tmpPath, "wx");
		writeFileSync(fd, JSON.stringify(value));
		fsyncSync(fd);
		closeSync(fd);
		fd = undefined;
		try {
			linkSync(tmpPath, path);
			// Durability of the LINK itself, not just the bytes (audit F2).
			fsyncDirBestEffort(dirname(path));
			return ok("claimed");
		} catch (error) {
			return (error as NodeJS.ErrnoException).code === "EEXIST"
				? ok("exists")
				: err("E-NOREG", `cannot publish claim ${path}: ${String(error)}`);
		}
	} catch (error) {
		return err("E-NOREG", `cannot stage claim ${path}: ${String(error)}`);
	} finally {
		if (fd !== undefined) closeSync(fd);
		rmSync(tmpPath, { force: true });
	}
}

export class FsProjectStore implements ProjectStorePort {
	// FsRegistry precedent: home is injected, never self-resolved; directories
	// are created lazily at write time, so reads tolerate an absent home.
	constructor(private readonly pijHome: string) {}

	private projectsDir(): string {
		return join(this.pijHome, "projects");
	}

	private pathFor(slug: string): string {
		return join(this.projectsDir(), slug, "project.json");
	}

	create(project: Project): Result<"claimed" | "exists"> {
		if (!SLUG_PATTERN.test(project.slug)) {
			return err(
				"E-ARG",
				`invalid project slug '${project.slug}' (use letters, digits, dot, underscore, or hyphen)`,
			);
		}
		return publishNoReplace(this.pathFor(project.slug), project);
	}

	update(project: Project): Result<void> {
		if (!SLUG_PATTERN.test(project.slug)) {
			return err(
				"E-ARG",
				`invalid project slug '${project.slug}' (use letters, digits, dot, underscore, or hyphen)`,
			);
		}
		const path = this.pathFor(project.slug);
		// Existence probe: open the current record immediately before the write.
		// RESIDUAL RACE (accepted): probe-then-rename is check-then-act — POSIX
		// has no rename-only-if-exists, so an EXTERNAL rm of project.json inside
		// this window turns update into a silent re-create. No schedule composed
		// of this port's own operations can hit it (the port has no delete, and
		// rename-replace never leaves the path absent).
		let probeFd: number;
		try {
			probeFd = openSync(path, "r");
		} catch {
			return err("E-NOREG", `no project '${project.slug}' — create it first`);
		}
		closeSync(probeFd);
		try {
			writeJsonAtomic(path, project);
			return ok(undefined);
		} catch (error) {
			return err("E-NOREG", `cannot update project ${path}: ${String(error)}`);
		}
	}

	read(slug: string): Project | null {
		if (!SLUG_PATTERN.test(slug)) return null;
		try {
			const parsed: unknown = JSON.parse(readFileSync(this.pathFor(slug), "utf8"));
			// Path is the identity authority: a hand-planted record whose internal
			// slug disagrees with its directory name is foreign, not this project.
			// Also keeps list()'s slug sort total (no duplicate content slugs).
			return isProject(parsed) && parsed.slug === slug ? parsed : null;
		} catch {
			return null;
		}
	}

	list(): Project[] {
		let names: string[];
		try {
			names = readdirSync(this.projectsDir());
		} catch {
			return [];
		}
		const out: Project[] = [];
		for (const name of names) {
			const project = this.read(name);
			if (project) out.push(project);
		}
		out.sort((left, right) => left.slug.localeCompare(right.slug));
		return out;
	}
}
