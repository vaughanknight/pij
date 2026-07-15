import {
	chmodSync,
	closeSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { FocusManifest, HarnessKind } from "../core/types.js";
import { writeJsonAtomic } from "./atomic-file.js";

const FOCUS_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function assertFocusName(name: string): void {
	if (!FOCUS_NAME_PATTERN.test(name)) {
		throw new Error(
			`invalid focus name '${name}' — use letters, numbers, dot, dash, or underscore`,
		);
	}
}

function isHarnessKind(value: unknown): value is HarnessKind {
	return value === "pi" || value === "claude" || value === "copilot" || value === "codex";
}

function isFocusManifest(value: unknown): value is FocusManifest {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	const lineage = record.lineage;
	return (
		record.version === 1 &&
		typeof record.name === "string" &&
		isHarnessKind(record.harness) &&
		typeof record.harnessSessionId === "string" &&
		(record.model === undefined || typeof record.model === "string") &&
		(record.effort === undefined || typeof record.effort === "string") &&
		typeof record.originCwd === "string" &&
		typeof record.sha256 === "string" &&
		typeof record.createdAt === "string" &&
		typeof lineage === "object" &&
		lineage !== null &&
		typeof (lineage as Record<string, unknown>).sourcePijId === "string" &&
		typeof (lineage as Record<string, unknown>).sourceHarnessSessionId === "string"
	);
}

export class FsFocusStore {
	private readonly root: string;

	constructor(pijHome = process.env.PIJ_HOME ?? join(homedir(), ".pij")) {
		this.root = join(pijHome, "focus");
	}

	manifestPath(name: string): string {
		// Keep focus JSON below `focus/`; top-level PIJ_HOME/*.json belongs exclusively
		// to FsRegistry and would otherwise be interpreted as a live peer descriptor.
		assertFocusName(name);
		return join(this.root, name, "manifest.json");
	}

	snapshotPath(name: string): string {
		assertFocusName(name);
		return join(this.root, name, "snapshot.jsonl");
	}

	write(manifest: FocusManifest): void {
		writeJsonAtomic(this.manifestPath(manifest.name), manifest);
	}

	writeSnapshot(name: string, contents: string): void {
		const path = this.snapshotPath(name);
		mkdirSync(dirname(path), { recursive: true });
		const fd = openSync(path, "wx", 0o600);
		try {
			writeFileSync(fd, contents);
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		chmodSync(path, 0o400);
	}

	readSnapshot(name: string): string {
		return readFileSync(this.snapshotPath(name), "utf8");
	}

	read(name: string): FocusManifest | null {
		try {
			const parsed: unknown = JSON.parse(readFileSync(this.manifestPath(name), "utf8"));
			return isFocusManifest(parsed) ? parsed : null;
		} catch {
			return null;
		}
	}

	list(): FocusManifest[] {
		let names: string[];
		try {
			names = readdirSync(this.root);
		} catch {
			return [];
		}
		return names
			.sort((left, right) => left.localeCompare(right))
			.map((name) => this.read(name))
			.filter((manifest): manifest is FocusManifest => manifest !== null);
	}
}
