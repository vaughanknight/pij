// pij-messaging — fs EventLogPort adapter.
//
// Appends one JSON line per event to `<pijHome>/<id>/events.ndjson`. The core
// already stamps `seq` + ISO `timestamp` (events.ts); this adapter only does
// I/O. `lastSeq()` is derived from the file on every call so a fresh adapter
// over an existing log recovers the counter after /reload (findings 02/06).
// Read-side filtering reuses the pure core helper (single source of truth).

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { filterEvents } from "../core/events.js";
import type { EventLogPort } from "../core/ports.js";
import type { EventQuery, PijEvent } from "../core/types.js";

export class FsEventLog implements EventLogPort {
	private readonly file: string;

	constructor(pijHome: string, id: string) {
		const dir = join(pijHome, id);
		this.file = join(dir, "events.ndjson");
		mkdirSync(dir, { recursive: true });
	}

	append(event: PijEvent): void {
		appendFileSync(this.file, `${JSON.stringify(event)}\n`);
	}

	read(query?: EventQuery): PijEvent[] {
		return filterEvents(this.readAll(), query);
	}

	lastSeq(): number {
		let max = 0;
		for (const e of this.readAll()) if (e.seq > max) max = e.seq;
		return max;
	}

	count(): number {
		return this.readAll().length;
	}

	private readAll(): PijEvent[] {
		let raw: string;
		try {
			raw = readFileSync(this.file, "utf8");
		} catch {
			return []; // log not created yet
		}
		const out: PijEvent[] = [];
		for (const line of raw.split("\n")) {
			if (!line.trim()) continue;
			try {
				const e = JSON.parse(line) as PijEvent;
				if (typeof e?.seq === "number") out.push(e);
			} catch {
				// skip a partially-written / corrupt trailing line
			}
		}
		return out;
	}
}
