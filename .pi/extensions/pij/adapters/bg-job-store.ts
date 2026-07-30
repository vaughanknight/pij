// pij-control-plane — durable bg job records (adapter for BgJobStorePort).
//
// One JSON file per job, beside its log in the owning seat's data dir. Flat
// files rather than an index: a job's record and its output are written by two
// different processes (the CLI at launch, the wrapper at completion), and
// per-job files make that a write to two distinct paths instead of a
// read-modify-write race on a shared index.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BgJobRecord } from "../core/bg.js";
import type { BgJobStorePort } from "../core/ports.js";
import { writeTextAtomic } from "./atomic-file.js";

export class FsBgJobStore implements BgJobStorePort {
	constructor(private readonly dataDir: string) {}

	private pathFor(jobId: string): string {
		return join(this.dataDir, `${jobId}.json`);
	}

	write(record: BgJobRecord): void {
		writeTextAtomic(this.pathFor(record.jobId), `${JSON.stringify(record)}\n`);
	}

	read(jobId: string): BgJobRecord | undefined {
		// Never trust the id as a path component — it reaches us from argv.
		if (!/^bg-[0-9a-z]+-[0-9a-z]+$/.test(jobId)) return undefined;
		try {
			return JSON.parse(readFileSync(this.pathFor(jobId), "utf8")) as BgJobRecord;
		} catch {
			return undefined;
		}
	}

	list(): readonly BgJobRecord[] {
		let names: string[] = [];
		try {
			names = readdirSync(this.dataDir);
		} catch {
			return [];
		}
		const out: BgJobRecord[] = [];
		for (const name of names) {
			if (!name.startsWith("bg-") || !name.endsWith(".json")) continue;
			const record = this.read(name.slice(0, -".json".length));
			if (record !== undefined) out.push(record);
		}
		return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
	}
}
