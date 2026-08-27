// pij platform — fs SpineLogPort adapter (plan 054, WS-3/WS-5 + review 001 F1).
//
// ONE unified machine-wide log at `<pijHome>/spine/events.ndjson`; every write
// stays below `spine/` (subdir law, Finding 01 — top-level PIJ_HOME/*.json is
// FsRegistry's namespace and would read back as a phantom peer). Sequence
// numbers are allocated INSIDE append/appendOnce (review 001 F1: caller-side
// `lastSeq() + 1` let two processes mint the same seq and lose an event behind
// an advanced `read({since})` cursor): callers hand over a SpineEventDraft and
// get back the stamped event. Cross-process mutual exclusion is an
// exclusive-create lock file (`spine/events.lock`) held across allocate+write,
// so allocation is serialized WITH durability — a reader can never observe
// seq n before every seq < n is on disk. The spine is a MULTI-writer log, so
// `append` carries the ratified NEWLINE-GUARD: when the file's last byte is
// not `\n` (a torn tail from a crashed writer), a `\n` lands first so the next
// event is never swallowed — the fragment stays inert on disk and is skipped
// on read (deliberate deviation from the single-writer FsEventLog blind
// append). `appendOnce` is DURABLE key-dedupe (AC-03): a sha256(key)-named
// once-file holding the ORIGINALLY stamped event, published via atomic
// no-replace hard-link and merged seq-ascending on read (event-log.ts:37-73
// precedent), keeping events.ndjson strictly byte-append-only.

import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	fstatSync,
	linkSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { SpineAppendOnceOutcome, SpineLogPort } from "../core/platform/ports.js";
import { filterSpineEvents, type SpineEventQuery } from "../core/platform/spine.js";
import { isSpineEvent, type SpineEvent, type SpineEventDraft } from "../core/platform/types.js";
import { err, ok, type Result } from "../core/types.js";
import { fsyncDirBestEffort, maybeFsyncSync } from "./atomic-file.js";
import {
	type LockReclaimNote,
	reclaimIfDead,
	releaseOwnedLock,
	trackHeldLock,
} from "./lock-reclaim.js";

const NEWLINE_BYTE = 0x0a;
/** Total lock-acquisition budget before a write gives up with E-NOREG. */
const LOCK_BUDGET_MS = 2000;
/** Pause between lock-acquisition retries. */
const LOCK_RETRY_MS = 5;

/** Synchronous sleep with no busy loop: Atomics.wait on a throwaway buffer. */
function sleepMs(ms: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

interface SpineLogOptions {
	readonly lockBudgetMs?: number;
	readonly isAlive?: (pid: number) => boolean;
	readonly processStartedAtMs?: (pid: number) => number | undefined;
	readonly onReclaim?: (note: LockReclaimNote) => void;
}

/** Stamp `seq` into a draft, materializing the canonical SpineEvent field
 *  order (schema_version, seq, ts, actor, kind, refs, then optionals) so the
 *  ndjson line matches buildSpineEvent's shape. `refs` is copied, never
 *  aliased — a caller-held draft must not rewrite the returned event. */
function stampSpineEvent(draft: SpineEventDraft, seq: number): SpineEvent {
	// Omit<> only narrows the TYPE: a full SpineEvent is width-assignable to
	// SpineEventDraft, so a caller can hand over a value carrying an own `seq`
	// (e.g. re-appending an event read back from the log) with no cast. Strip
	// it BEFORE the rest-spread — the port-allocated seq always wins.
	const { seq: _smuggled, ...rest } = draft as SpineEvent;
	const { schema_version, ts, actor, kind, refs, ...optionals } = rest;
	return { schema_version, seq, ts, actor, kind, refs: [...refs], ...optionals };
}

export class FsSpineLog implements SpineLogPort {
	private readonly dir: string;
	private readonly file: string;
	private readonly lockFile: string;

	private readonly lockBudgetMs: number;
	private readonly options: SpineLogOptions;

	constructor(pijHome: string, options: SpineLogOptions = {}) {
		this.dir = join(pijHome, "spine");
		this.file = join(this.dir, "events.ndjson");
		this.lockFile = join(this.dir, "events.lock");
		this.lockBudgetMs = options.lockBudgetMs ?? LOCK_BUDGET_MS;
		this.options = options;
		mkdirSync(this.dir, { recursive: true });
	}

	append(draft: SpineEventDraft): Result<SpineEvent> {
		return this.withLock<SpineEvent>(() => {
			// NEWLINE-GUARD (coder ruling): heal a torn tail before this event so a
			// crashed writer's fragment never swallows it. One write call so
			// guard + line land together.
			const guard = this.tailNeedsNewline() ? "\n" : "";
			// Allocation under the lock: max over ndjson AND once-files, plus one.
			const stamped = stampSpineEvent(draft, this.lastSeq() + 1);
			// fsync BEFORE release (publishOnce parity): a seq acknowledged from
			// page cache only can vanish on power loss and be re-minted for a
			// different event, dangling any durable seq-ref (Assignment.states,
			// fsynced once-files) that already captured it.
			const fd = openSync(this.file, "a");
			try {
				writeFileSync(fd, `${guard}${JSON.stringify(stamped)}\n`);
				maybeFsyncSync(fd);
			} finally {
				closeSync(fd);
			}
			return ok(stamped);
		});
	}

	appendOnce(key: string, draft: SpineEventDraft): Result<SpineAppendOnceOutcome> {
		const digest = createHash("sha256").update(key).digest("hex");
		const finalPath = join(this.dir, `event-once-${digest}.json`);
		return this.withLock<SpineAppendOnceOutcome>(() => {
			// Replay check first: the once-file holds the ORIGINALLY stamped event.
			let raw: string | null = null;
			try {
				raw = readFileSync(finalPath, "utf8");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
					return err("E-NOREG", `cannot read spine once-file ${finalPath}: ${String(error)}`);
				}
			}
			if (raw !== null) {
				const event = parseSpineEvent(raw);
				return event === null
					? err("E-NOREG", `corrupt spine once-file ${finalPath}`)
					: ok({ outcome: "existing", event });
			}
			const stamped = stampSpineEvent(draft, this.lastSeq() + 1);
			return this.publishOnce(finalPath, digest, stamped);
		});
	}

	hasOnce(key: string): boolean {
		// Recovery corroboration (review 003 H1): existence of the durable
		// once-record, nothing else — no lock needed, publication is atomic
		// (linkSync) so the file either fully exists or does not.
		const digest = createHash("sha256").update(key).digest("hex");
		return existsSync(join(this.dir, `event-once-${digest}.json`));
	}

	lastSeq(): number {
		let max = 0;
		for (const e of this.readAll()) if (e.seq > max) max = e.seq;
		return max;
	}

	read(query?: SpineEventQuery): SpineEvent[] {
		return filterSpineEvents(this.readAll(), query);
	}

	/** CONSTRAINT: publishNoReplace staging discipline (fs-registry.ts:751-776
	 *  is private, so the temp+linkSync pattern is replicated here rather than
	 *  editing the frozen file): fully write + fsync a sibling temp, then
	 *  atomic no-replace hard-link publish. EEXIST means the key was claimed
	 *  between the existence check and the link (belt + braces even under the
	 *  lock — e.g. after a manual lock removal) and is answered by reading the
	 *  winner back. Throws escape to withLock's catch → E-NOREG. */
	private publishOnce(
		finalPath: string,
		digest: string,
		stamped: SpineEvent,
	): Result<SpineAppendOnceOutcome> {
		const tempPath = join(this.dir, `.event-once-${digest}.${process.pid}.${randomUUID()}.tmp`);
		let fd: number | undefined;
		try {
			fd = openSync(tempPath, "wx");
			writeFileSync(fd, JSON.stringify(stamped));
			maybeFsyncSync(fd);
			closeSync(fd);
			fd = undefined;
			try {
				linkSync(tempPath, finalPath);
				// Durability of the LINK itself, not just the bytes (audit F2).
				fsyncDirBestEffort(this.dir);
				return ok({ outcome: "appended", event: stamped });
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
				const winner = parseSpineEvent(readFileSync(finalPath, "utf8"));
				return winner === null
					? err("E-NOREG", `corrupt spine once-file ${finalPath}`)
					: ok({ outcome: "existing", event: winner });
			}
		} finally {
			if (fd !== undefined) closeSync(fd);
			rmSync(tempPath, { force: true });
		}
	}

	/** Run `operation` holding the cross-process spine lock. The lock is only
	 *  removed when WE acquired it (a failed acquisition must not delete a
	 *  live holder's lock) and released in finally once held — but ONLY while
	 *  the file still carries our ownership token: after a manual unwedge a
	 *  new writer's LIVE lock may sit at this path, and deleting it would
	 *  cascade another writer into the critical section. Throws from
	 *  `operation` become E-NOREG Results, never escape. */
	private withLock<T>(operation: () => Result<T>): Result<T> {
		const acquired = this.acquireLock();
		if (!acquired.ok) return acquired;
		try {
			for (const note of acquired.value.reclaims) {
				this.appendReclaimNote(note);
			}
			return operation();
		} catch (error) {
			return err("E-NOREG", `spine write under ${this.dir} failed: ${String(error)}`);
		} finally {
			this.releaseLock(acquired.value.token);
		}
	}

	private appendReclaimNote(note: LockReclaimNote): void {
		const stamped = stampSpineEvent(
			{
				schema_version: 1,
				ts: new Date().toISOString(),
				actor: "pij",
				kind: "note",
				refs: [`lock:${note.layer}`, `pid:${note.pid}`],
				prev: note.reason,
				next: note.message,
			},
			this.lastSeq() + 1,
		);
		const guard = this.tailNeedsNewline() ? "\n" : "";
		const fd = openSync(this.file, "a");
		try {
			writeFileSync(fd, `${guard}${JSON.stringify(stamped)}\n`);
			maybeFsyncSync(fd);
		} finally {
			closeSync(fd);
		}
	}

	/** Remove `events.lock` ONLY while it still carries OUR token. A skipped
	 *  release means the path no longer holds our lock (e.g. a human removed a
	 *  wedged lock and a new writer acquired) — nothing here is safely ours. */
	private releaseLock(token: string): void {
		releaseOwnedLock(this.lockFile, token);
	}

	/** Acquire `events.lock` via exclusive create (openSync "wx"). EEXIST first
	 *  runs the shared pid/start-time decision: a dead holder or a pid reused by
	 *  a newer process is reclaimed; a live original holder is never stolen.
	 *  Unresolved holders retry until the budget, then fail with E-NOREG. Returns
	 *  the ownership token release checks plus any reclaim notes to append under
	 *  the newly acquired lock. */
	private acquireLock(): Result<{
		readonly token: string;
		readonly reclaims: readonly LockReclaimNote[];
	}> {
		const deadline = Date.now() + this.lockBudgetMs;
		const reclaims: LockReclaimNote[] = [];
		for (;;) {
			let fd: number | undefined;
			try {
				fd = openSync(this.lockFile, "wx");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
					return err("E-NOREG", `cannot create spine lock ${this.lockFile}: ${String(error)}`);
				}
				const reclaimed = reclaimIfDead(this.lockFile, "events.lock", this.options);
				if (reclaimed !== null) {
					reclaims.push(reclaimed);
					this.options.onReclaim?.(reclaimed);
					if (Date.now() >= deadline) {
						return err(
							"E-NOREG",
							`spine lock ${this.lockFile} held for over ${this.lockBudgetMs}ms — locks are never stolen; if its writer is dead, remove the file manually`,
						);
					}
					continue;
				}
			}
			if (fd !== undefined) {
				// Held. The token is OWNERSHIP, not diagnostics: release removes
				// the lock only while the file still carries it, so a holder never
				// deletes a successor's live lock after a manual unwedge.
				const token = `${process.pid}:${randomUUID()}\n`;
				try {
					writeFileSync(fd, token);
				} catch (error) {
					// Without the token on disk this lock could never be released
					// safely — back out rather than wedge every writer.
					try {
						closeSync(fd);
					} catch {
						// fd is abandoned either way
					}
					try {
						rmSync(this.lockFile, { force: true });
					} catch {
						// our own just-created lock; leaving it wedges until manual removal
					}
					return err("E-NOREG", `cannot stamp spine lock ${this.lockFile}: ${String(error)}`);
				}
				try {
					closeSync(fd);
				} catch {
					// fd is abandoned either way
				}
				trackHeldLock(this.lockFile, token);
				return ok({ token, reclaims });
			}
			if (Date.now() >= deadline) {
				return err(
					"E-NOREG",
					`spine lock ${this.lockFile} held for over ${this.lockBudgetMs}ms — locks are never stolen; if its writer is dead, remove the file manually`,
				);
			}
			sleepMs(LOCK_RETRY_MS);
		}
	}

	/** True when events.ndjson ends in a torn (newline-less) tail. */
	private tailNeedsNewline(): boolean {
		let fd: number;
		try {
			fd = openSync(this.file, "r");
		} catch {
			return false; // log not created yet
		}
		try {
			const { size } = fstatSync(fd);
			if (size === 0) return false;
			const tail = Buffer.alloc(1);
			readSync(fd, tail, 0, 1, size - 1);
			return tail[0] !== NEWLINE_BYTE;
		} finally {
			closeSync(fd);
		}
	}

	/** Guard-valid events from ndjson + once-files, seq-ascending. */
	private readAll(): SpineEvent[] {
		const out = [...this.readNdjson(), ...this.readOnce()];
		out.sort((left, right) => left.seq - right.seq);
		return out;
	}

	private readNdjson(): SpineEvent[] {
		let raw: string;
		try {
			raw = readFileSync(this.file, "utf8");
		} catch {
			return []; // log not created yet
		}
		const out: SpineEvent[] = [];
		for (const line of raw.split("\n")) {
			if (!line.trim()) continue;
			const event = parseSpineEvent(line);
			if (event !== null) out.push(event);
		}
		return out;
	}

	private readOnce(): SpineEvent[] {
		let names: string[];
		try {
			names = readdirSync(this.dir)
				.filter((name) => name.startsWith("event-once-") && name.endsWith(".json"))
				.sort();
		} catch {
			return [];
		}
		const out: SpineEvent[] = [];
		for (const name of names) {
			let raw: string;
			try {
				raw = readFileSync(join(this.dir, name), "utf8");
			} catch {
				continue; // once-file vanished mid-scan
			}
			const event = parseSpineEvent(raw);
			if (event !== null) out.push(event);
		}
		return out;
	}
}

/** One guarded parse: torn/corrupt text and valid-JSON foreign records (e.g.
 *  a Project line) both stay inert — null, never a throw. */
function parseSpineEvent(text: string): SpineEvent | null {
	try {
		const value: unknown = JSON.parse(text);
		return isSpineEvent(value) ? value : null;
	} catch {
		return null;
	}
}
