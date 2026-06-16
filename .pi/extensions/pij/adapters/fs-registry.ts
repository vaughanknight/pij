// pij-messaging — fs RegistryPort adapter.
//
// One descriptor file per session at `<pijHome>/<id>.json`. `pijHome`
// (default ~/.pij) is constructor-injected so tests run on a tmp dir.
// A missing or malformed descriptor is skipped, never thrown (Pattern P4).

import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RegistryPort } from "../core/ports.js";
import type { SessionDescriptor, SessionId } from "../core/types.js";

export class FsRegistry implements RegistryPort {
	constructor(private readonly pijHome: string) {}

	private pathFor(id: SessionId): string {
		return join(this.pijHome, `${id}.json`);
	}

	list(): SessionDescriptor[] {
		let names: string[];
		try {
			names = readdirSync(this.pijHome);
		} catch {
			return []; // no registry yet
		}
		const out: SessionDescriptor[] = [];
		for (const name of names) {
			if (!name.endsWith(".json")) continue; // skip <id>/ dirs + .tmp files
			const d = this.readFile(join(this.pijHome, name));
			if (d) out.push(d);
		}
		return out;
	}

	read(id: SessionId): SessionDescriptor | null {
		return this.readFile(this.pathFor(id));
	}

	write(descriptor: SessionDescriptor): void {
		mkdirSync(this.pijHome, { recursive: true });
		const finalPath = this.pathFor(descriptor.id);
		const tmpPath = join(this.pijHome, `.${descriptor.id}.tmp-${process.pid}`);
		writeFileSync(tmpPath, JSON.stringify(descriptor));
		renameSync(tmpPath, finalPath); // atomic within the same dir
	}

	remove(id: SessionId): void {
		try {
			rmSync(this.pathFor(id));
		} catch {
			// already gone — idempotent
		}
	}

	private readFile(path: string): SessionDescriptor | null {
		try {
			const parsed = JSON.parse(readFileSync(path, "utf8")) as SessionDescriptor;
			return typeof parsed?.id === "string" ? parsed : null;
		} catch {
			return null; // missing or malformed → skip
		}
	}
}
