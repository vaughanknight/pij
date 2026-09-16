// pij platform — fs DispatchStorePort adapter (plan 061 phase 2).
//
// Layout: `<pijHome>/dispatches/<id>.json` — strictly below dispatches/.
// Top-level PIJ_HOME/*.json belongs exclusively to FsRegistry live descriptors.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DispatchStorePort } from "../core/platform/ports.js";
import { type Dispatch, isDispatch } from "../core/platform/types.js";
import { err, ok, type Result } from "../core/types.js";
import { writeJsonAtomic } from "./atomic-file.js";

const DISPATCH_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class FsDispatchStore implements DispatchStorePort {
	constructor(private readonly pijHome: string) {}

	private dispatchesDir(): string {
		return join(this.pijHome, "dispatches");
	}

	private pathFor(id: string): string {
		return join(this.dispatchesDir(), `${id}.json`);
	}

	write(dispatch: Dispatch): Result<void> {
		if (!DISPATCH_ID_RE.test(dispatch.id)) {
			return err(
				"E-ARG",
				`invalid dispatch id '${dispatch.id}' (use letters, digits, dot, underscore, or hyphen)`,
			);
		}
		try {
			const roundTripped: unknown = JSON.parse(JSON.stringify(dispatch));
			if (!isDispatch(roundTripped)) {
				return err("E-ARG", `dispatch '${dispatch.id}' fails the record contract`);
			}
			writeJsonAtomic(this.pathFor(dispatch.id), dispatch);
			return ok(undefined);
		} catch (error) {
			return err("E-NOREG", `cannot write dispatch '${dispatch.id}': ${String(error)}`);
		}
	}

	read(id: string): Dispatch | null {
		if (!DISPATCH_ID_RE.test(id)) return null;
		return this.readFile(this.pathFor(id), id);
	}

	list(): Dispatch[] {
		let names: string[];
		try {
			names = readdirSync(this.dispatchesDir());
		} catch {
			return [];
		}
		const out: Dispatch[] = [];
		for (const name of names) {
			if (!name.endsWith(".json")) continue;
			const id = name.slice(0, -".json".length);
			const record = this.readFile(join(this.dispatchesDir(), name), id);
			if (record) out.push(record);
		}
		out.sort((left, right) => left.id.localeCompare(right.id));
		return out;
	}

	private readFile(path: string, expectedId: string): Dispatch | null {
		try {
			const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
			return isDispatch(parsed) && parsed.id === expectedId ? parsed : null;
		} catch {
			return null;
		}
	}
}
