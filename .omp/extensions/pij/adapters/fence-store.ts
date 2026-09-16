// pij platform — fs FenceStorePort adapter (plan 061 phase 1).
//
// Layout: `<pijHome>/fences/<id>.json` — strictly below fences/. Top-level
// PIJ_HOME/*.json belongs exclusively to FsRegistry live descriptors.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FenceStorePort } from "../core/platform/ports.js";
import { type Fence, isFence } from "../core/platform/types.js";
import { err, ok, type Result } from "../core/types.js";
import { writeJsonAtomic } from "./atomic-file.js";

const FENCE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class FsFenceStore implements FenceStorePort {
	constructor(private readonly pijHome: string) {}

	private fencesDir(): string {
		return join(this.pijHome, "fences");
	}

	private pathFor(id: string): string {
		return join(this.fencesDir(), `${id}.json`);
	}

	write(fence: Fence): Result<void> {
		if (!FENCE_ID_RE.test(fence.id)) {
			return err(
				"E-ARG",
				`invalid fence id '${fence.id}' (use letters, digits, dot, underscore, or hyphen)`,
			);
		}
		try {
			const roundTripped: unknown = JSON.parse(JSON.stringify(fence));
			if (!isFence(roundTripped)) {
				return err("E-ARG", `fence '${fence.id}' fails the record contract`);
			}
			writeJsonAtomic(this.pathFor(fence.id), fence);
			return ok(undefined);
		} catch (error) {
			return err("E-NOREG", `cannot write fence '${fence.id}': ${String(error)}`);
		}
	}

	read(id: string): Fence | null {
		if (!FENCE_ID_RE.test(id)) return null;
		return this.readFile(this.pathFor(id), id);
	}

	list(): Fence[] {
		let names: string[];
		try {
			names = readdirSync(this.fencesDir());
		} catch {
			return [];
		}
		const out: Fence[] = [];
		for (const name of names) {
			if (!name.endsWith(".json")) continue;
			const id = name.slice(0, -".json".length);
			const record = this.readFile(join(this.fencesDir(), name), id);
			if (record) out.push(record);
		}
		out.sort((left, right) => left.id.localeCompare(right.id));
		return out;
	}

	private readFile(path: string, expectedId: string): Fence | null {
		try {
			const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
			return isFence(parsed) && parsed.id === expectedId ? parsed : null;
		} catch {
			return null;
		}
	}
}
