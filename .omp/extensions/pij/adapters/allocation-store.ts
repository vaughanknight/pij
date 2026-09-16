// pij platform — fs AllocationStorePort adapter (plan 061 phase 1).
//
// Layout: `<pijHome>/allocations/<id>.json` — strictly below allocations/.
// Top-level PIJ_HOME/*.json belongs exclusively to FsRegistry live descriptors.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AllocationStorePort } from "../core/platform/ports.js";
import { type Allocation, isAllocation } from "../core/platform/types.js";
import { err, ok, type Result } from "../core/types.js";
import { writeJsonAtomic } from "./atomic-file.js";

const ALLOCATION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class FsAllocationStore implements AllocationStorePort {
	constructor(private readonly pijHome: string) {}

	private allocationsDir(): string {
		return join(this.pijHome, "allocations");
	}

	private pathFor(id: string): string {
		return join(this.allocationsDir(), `${id}.json`);
	}

	write(allocation: Allocation): Result<void> {
		if (!ALLOCATION_ID_RE.test(allocation.id)) {
			return err(
				"E-ARG",
				`invalid allocation id '${allocation.id}' (use letters, digits, dot, underscore, or hyphen)`,
			);
		}
		try {
			const roundTripped: unknown = JSON.parse(JSON.stringify(allocation));
			if (!isAllocation(roundTripped)) {
				return err("E-ARG", `allocation '${allocation.id}' fails the record contract`);
			}
			writeJsonAtomic(this.pathFor(allocation.id), allocation);
			return ok(undefined);
		} catch (error) {
			return err("E-NOREG", `cannot write allocation '${allocation.id}': ${String(error)}`);
		}
	}

	read(id: string): Allocation | null {
		if (!ALLOCATION_ID_RE.test(id)) return null;
		return this.readFile(this.pathFor(id), id);
	}

	list(): Allocation[] {
		let names: string[];
		try {
			names = readdirSync(this.allocationsDir());
		} catch {
			return [];
		}
		const out: Allocation[] = [];
		for (const name of names) {
			if (!name.endsWith(".json")) continue;
			const id = name.slice(0, -".json".length);
			const record = this.readFile(join(this.allocationsDir(), name), id);
			if (record) out.push(record);
		}
		out.sort((left, right) =>
			left.ordinal !== right.ordinal
				? left.ordinal - right.ordinal
				: left.id.localeCompare(right.id),
		);
		return out;
	}

	private readFile(path: string, expectedId: string): Allocation | null {
		try {
			const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
			return isAllocation(parsed) && parsed.id === expectedId ? parsed : null;
		} catch {
			return null;
		}
	}
}
