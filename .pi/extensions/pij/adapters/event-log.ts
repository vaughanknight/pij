// pij-messaging — fs EventLogPort adapter.
//
// Appends one JSON line per event to `<pijHome>/<id>/events.ndjson`. The core
// already stamps `seq` + ISO `timestamp` (events.ts); this adapter only does
// I/O. `lastSeq()` is derived from the file on every call so a fresh adapter
// over an existing log recovers the counter after /reload (findings 02/06).
// Read-side filtering reuses the pure core helper (single source of truth).

import { createHash, randomUUID } from "node:crypto";
import {
	appendFileSync,
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
import { join } from "node:path";
import { filterEvents } from "../core/events.js";
import type { EventLogPort } from "../core/ports.js";
import type { EventQuery, PijEvent } from "../core/types.js";

export class FsEventLog implements EventLogPort {
	private readonly file: string;
	private readonly dir: string;

	constructor(pijHome: string, id: string) {
		this.dir = join(pijHome, id);
		this.file = join(this.dir, "events.ndjson");
		mkdirSync(this.dir, { recursive: true });
	}

	append(event: PijEvent): void {
		appendFileSync(this.file, `${JSON.stringify(event)}\n`);
	}

	appendOnce(key: string, event: PijEvent): "appended" | "existing" {
		const digest = createHash("sha256").update(key).digest("hex");
		const finalPath = join(this.dir, `event-once-${digest}.json`);
		const tempPath = join(this.dir, `.event-once-${digest}.${process.pid}.${randomUUID()}.tmp`);
		let fd: number | undefined;
		try {
			fd = openSync(tempPath, "wx");
			writeFileSync(fd, JSON.stringify(event));
			fsyncSync(fd);
			closeSync(fd);
			fd = undefined;
			try {
				linkSync(tempPath, finalPath);
				return "appended";
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "EEXIST") return "existing";
				throw error;
			}
		} finally {
			if (fd !== undefined) closeSync(fd);
			rmSync(tempPath, { force: true });
		}
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
		const ndjson = this.readNdjson();
		const atomic = this.readAtomic();
		if (atomic.length === 0) return ndjson;
		const out = [...ndjson, ...atomic];
		out.sort((left, right) => left.seq - right.seq);
		return out;
	}

	private readNdjson(): PijEvent[] {
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

	private readAtomic(): PijEvent[] {
		let names: string[];
		try {
			names = readdirSync(this.dir)
				.filter((name) => name.startsWith("event-once-") && name.endsWith(".json"))
				.sort();
		} catch {
			return [];
		}
		const out: PijEvent[] = [];
		for (const name of names) {
			try {
				const event = JSON.parse(readFileSync(join(this.dir, name), "utf8")) as PijEvent;
				if (typeof event?.seq === "number") out.push(event);
			} catch {
				// A corrupt atomic event is ignored like a corrupt NDJSON tail.
			}
		}
		return out;
	}
}
