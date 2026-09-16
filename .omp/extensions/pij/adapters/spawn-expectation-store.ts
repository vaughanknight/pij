// Filesystem implementation of the pre-launch expectation store. Expectations
// deliberately live outside descriptors so no-show evidence survives no register.

import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { SpawnExpectationStore } from "../core/ports.js";
import type { SpawnExpectation } from "../core/types.js";
import { writeJsonAtomic } from "./atomic-file.js";

function isExpectation(value: unknown): value is SpawnExpectation {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.spawnId === "string" &&
		typeof record.requestedHarness === "string" &&
		typeof record.requestedAt === "string"
	);
}

export class FsSpawnExpectationStore implements SpawnExpectationStore {
	constructor(private readonly pijHome: string) {}

	list(): SpawnExpectation[] {
		try {
			return readdirSync(this.dir())
				.filter((name) => name.endsWith(".json"))
				.flatMap((name) => {
					const expectation = this.read(name.slice(0, -".json".length));
					return expectation ? [expectation] : [];
				});
		} catch {
			return [];
		}
	}

	read(spawnId: string): SpawnExpectation | null {
		if (!safeSpawnId(spawnId)) return null;
		try {
			const value: unknown = JSON.parse(readFileSync(this.pathFor(spawnId), "utf8"));
			return isExpectation(value) && value.spawnId === spawnId ? value : null;
		} catch {
			return null;
		}
	}

	write(expectation: SpawnExpectation): void {
		if (!safeSpawnId(expectation.spawnId)) {
			throw new Error(`invalid spawn expectation id '${expectation.spawnId}'`);
		}
		mkdirSync(this.dir(), { recursive: true });
		writeJsonAtomic(this.pathFor(expectation.spawnId), expectation);
	}

	remove(spawnId: string): void {
		if (!safeSpawnId(spawnId)) return;
		rmSync(this.pathFor(spawnId), { force: true });
	}

	private dir(): string {
		return join(this.pijHome, "spawn-expectations");
	}

	private pathFor(spawnId: string): string {
		return join(this.dir(), `${spawnId}.json`);
	}
}

function safeSpawnId(value: string): boolean {
	return /^[A-Za-z0-9._-]+$/.test(value);
}
