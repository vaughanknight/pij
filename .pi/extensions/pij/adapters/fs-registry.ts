// pij-messaging — fs RegistryPort adapter.
//
// One live descriptor per session at `<pijHome>/<id>.json`; durable native
// identity records live below `<pijHome>/identities/` so presence can disappear
// without losing the harness-native ↔ pij-id join.

import { createHash, randomUUID } from "node:crypto";
import {
	appendFileSync,
	closeSync,
	existsSync,
	linkSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
	type ArchiveIndexEntry,
	buildArchiveIndexEntry,
	classifyRegistryRecord,
	isPrunableArchiveRecord,
	isTerminalRecord,
	parseArchiveIndexLine,
} from "../core/archive.js";
import {
	FsTickHeartbeatStore,
	lastTickFor,
	type TickStampPort,
	type TickStamps,
} from "../core/daemon/tick-heartbeat.js";
import { memorablePijIdCandidates } from "../core/memorable-id.js";
import type { ArchiveOutcome, RegistryPort, RegistryWriteExactOptions } from "../core/ports.js";
import {
	applyWriteLaw,
	DESCRIPTOR_FIELD_OWNER,
	type DescriptorWriter,
} from "../core/registry-write.js";
import {
	err,
	type HarnessKind,
	ok,
	type Result,
	type SessionDescriptor,
	type SessionId,
} from "../core/types.js";
import { maybeFsyncSync, writeJsonAtomic } from "./atomic-file.js";
import {
	type LockReclaimNote,
	reclaimIfDead,
	releaseOwnedLock,
	trackHeldLock,
} from "./lock-reclaim.js";

interface IdentityRecord {
	readonly kind?: "identity";
	readonly harness: HarnessKind;
	readonly harnessSessionId: string;
	readonly pijId: SessionId;
	/** Presence-independent metadata used to hydrate a removed live descriptor. */
	readonly snapshot?: SessionDescriptor;
}

interface ReservationRecord {
	readonly kind: "reservation";
	readonly pijId: SessionId;
	readonly ownerToken: string;
	readonly ownerPid: number;
	readonly createdAt: string;
}

interface DescriptorOwnerRecord {
	readonly kind: "descriptor";
	readonly pijId: SessionId;
	readonly ownerToken: string;
	readonly ownerPid: number;
	readonly createdAt: string;
}

type OwnerRecord = IdentityRecord | ReservationRecord | DescriptorOwnerRecord;

interface DetailedIdentityClaim {
	readonly kind: "claimed" | "exists";
	readonly id: SessionId;
	readonly createdPaths: readonly string[];
}

interface FsRegistryOptions {
	/** Test-only seam for deterministically interleaving another registry writer
	 * after this publish has sampled disk but before it writes. */
	readonly beforeWrite?: () => void;
	/** Test-only observation point inside the descriptor write lock, after the
	 * authoritative fresh read and before the atomic file replacement. */
	readonly afterLockRead?: () => void;
	readonly lockBudgetMs?: number;
	readonly lockRetryMs?: number;
	readonly isAlive?: (pid: number) => boolean;
	readonly processStartedAtMs?: (pid: number) => number | undefined;
	readonly onReclaim?: (note: LockReclaimNote) => void;
}

type DescriptorField = keyof SessionDescriptor;

const DESCRIPTOR_LOCK_RETRY_MS = 5;
const DESCRIPTOR_LOCK_BUDGET_MS = 5_000;
const DESCRIPTOR_LOCK_SLEEP = new Int32Array(new SharedArrayBuffer(4));
const CLI_OWNED_DESCRIPTOR_FIELDS: ReadonlySet<DescriptorField> = new Set(
	(Object.keys(DESCRIPTOR_FIELD_OWNER) as DescriptorField[]).filter(
		(field) => DESCRIPTOR_FIELD_OWNER[field as keyof typeof DESCRIPTOR_FIELD_OWNER] === "cli",
	),
);

function sleepDescriptorLockRetry(retryMs: number): void {
	Atomics.wait(DESCRIPTOR_LOCK_SLEEP, 0, 0, retryMs);
}

function descriptorFields(descriptor: SessionDescriptor | null): DescriptorField[] {
	return descriptor === null ? [] : (Object.keys(descriptor) as DescriptorField[]);
}

/** Three-way merge for writeExact: fresh disk is the base; fields the caller
 * changed since its sampled read are replayed, including deletions. CLI-owned
 * denorm fields remain exact by contract even when their value is unchanged. */
function mergeExactDescriptor(
	proposed: SessionDescriptor,
	sampled: SessionDescriptor | null,
	latest: SessionDescriptor | null,
): SessionDescriptor {
	if (latest === null) return proposed;
	const merged = { ...latest };
	const fields = new Set<DescriptorField>([
		...descriptorFields(sampled),
		...descriptorFields(proposed),
		...CLI_OWNED_DESCRIPTOR_FIELDS,
	]);
	for (const field of fields) {
		const sampledHas = sampled !== null && Object.hasOwn(sampled, field);
		const proposedHas = Object.hasOwn(proposed, field);
		const callerChanged =
			sampled === null ||
			sampledHas !== proposedHas ||
			(sampledHas && proposedHas && !isDeepStrictEqual(sampled[field], proposed[field]));
		if (!callerChanged && !CLI_OWNED_DESCRIPTOR_FIELDS.has(field)) continue;
		if (proposedHas) Reflect.set(merged, field, proposed[field]);
		else Reflect.deleteProperty(merged, field);
	}
	return merged;
}

type CandidateAllocation =
	| {
			readonly kind: "claimed" | "reuse";
			readonly id: SessionId;
			readonly descriptor?: SessionDescriptor;
	  }
	| { readonly kind: "occupied" };

function isHarnessKind(value: unknown): value is HarnessKind {
	return value === "pi" || value === "claude" || value === "copilot" || value === "codex";
}

function isIdentityRecord(value: unknown): value is IdentityRecord {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	const snapshot = record.snapshot;
	return (
		(record.kind === undefined || record.kind === "identity") &&
		isHarnessKind(record.harness) &&
		typeof record.harnessSessionId === "string" &&
		typeof record.pijId === "string" &&
		(snapshot === undefined ||
			(typeof snapshot === "object" &&
				snapshot !== null &&
				typeof (snapshot as Record<string, unknown>).id === "string"))
	);
}

function isReservationRecord(value: unknown): value is ReservationRecord {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		record.kind === "reservation" &&
		typeof record.pijId === "string" &&
		typeof record.ownerToken === "string" &&
		typeof record.ownerPid === "number" &&
		typeof record.createdAt === "string"
	);
}

function isDescriptorOwnerRecord(value: unknown): value is DescriptorOwnerRecord {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		record.kind === "descriptor" &&
		typeof record.pijId === "string" &&
		typeof record.ownerToken === "string" &&
		typeof record.ownerPid === "number" &&
		typeof record.createdAt === "string"
	);
}

function isOwnerRecord(value: unknown): value is OwnerRecord {
	return isIdentityRecord(value) || isReservationRecord(value) || isDescriptorOwnerRecord(value);
}

export class FsRegistry implements RegistryPort {
	/** `ticks` is a parameter property with a DEFAULT, so every existing
	 *  `new FsRegistry(pijHome)` call site compiles and behaves unchanged while
	 *  tests can still inject a stub. (Parameter defaults may reference an
	 *  earlier parameter, which is what keeps this to one line.)
	 *
	 *  READ-ONLY by type: `TickStampPort` has exactly one method. The registry
	 *  never writes the map and, since fix round 3, never prunes it either. */
	constructor(
		private readonly pijHome: string,
		private readonly ticks: TickStampPort = new FsTickHeartbeatStore(pijHome),
		private readonly options: FsRegistryOptions = {},
	) {}

	private pathFor(id: SessionId): string {
		return join(this.pijHome, `${id}.json`);
	}

	private descriptorLockPath(id: SessionId): string {
		return `${this.pathFor(id)}.lock`;
	}

	private withDescriptorWriteLock<T>(id: SessionId, operation: () => T): T {
		mkdirSync(this.pijHome, { recursive: true });
		const lockPath = this.descriptorLockPath(id);
		const lockBudgetMs = this.options.lockBudgetMs ?? DESCRIPTOR_LOCK_BUDGET_MS;
		const lockRetryMs = this.options.lockRetryMs ?? DESCRIPTOR_LOCK_RETRY_MS;
		const deadline = Date.now() + lockBudgetMs;
		for (;;) {
			const lock = { pid: process.pid, token: randomUUID() };
			const body = JSON.stringify(lock);
			const claim = this.publishNoReplace(lockPath, lock);
			if (!claim.ok) throw new Error(claim.message);
			if (claim.value === "exists") {
				const reclaimed = reclaimIfDead(lockPath, "descriptor.lock", this.options);
				if (reclaimed !== null) {
					this.options.onReclaim?.(reclaimed);
					continue;
				}
				if (Date.now() >= deadline) {
					throw new Error(
						`descriptor write lock ${lockPath} held for over ${lockBudgetMs}ms — locks are never stolen; if its writer is dead, remove the file manually: ${lockPath}`,
					);
				}
				// The retry budget is a brake: it can only stop this writer from
				// waiting longer. Lock age is deliberately not a reclaim policy.
				sleepDescriptorLockRetry(lockRetryMs);
				continue;
			}
			trackHeldLock(lockPath, body);
			try {
				return operation();
			} finally {
				releaseOwnedLock(lockPath, body);
			}
		}
	}

	/** THE OVERLAY (plan 100 Phase 2).
	 *
	 *  `lastTickAt` no longer lives on the descriptor — the daemon writes ONE
	 *  heartbeat file per tick instead of stamping 132 descriptors (pij#180). It
	 *  is re-attached here so that every existing reader keeps working unchanged.
	 *
	 *  ACCESS-PATH DIVERGENCE — READ THIS BEFORE ADDING A CALLER.
	 *  A descriptor's shape now depends on HOW it was read:
	 *    · via `read()` / `list()`  → carries `lastTickAt` (this overlay)
	 *    · via `readFile()`         → does NOT (see the note at `readFile`)
	 *  That is deliberate and load-bearing, not an oversight: `sweepArchivable`
	 *  reads through `readFile`, and the ruling for this plan is that archive
	 *  ageing must NOT be held open by the tick axis. See the mirror note on
	 *  `readFile` — a divergence documented only where it is created is invisible
	 *  to everyone who meets it where it matters.
	 *
	 *  The value is synthetic and must never round-trip to disk; `scrubTick`
	 *  below is what guarantees that.
	 *
	 *  WHY THE OVERLAY ALONE IS NOT ENOUGH, and where the rest of the answer is
	 *  (fix rounds 4 and 5). This map is keyed by ID, and an id OUTLIVES an
	 *  incarnation. Four separate strip-lists exist to stop `lastTickAt` surviving
	 *  one — `core/revive.ts:667`, `cli.ts:2658` (adopt), `core/session.ts:167`,
	 *  `core/current-session.ts:189` — and `cli.ts:2646` states the rule they
	 *  encode: *"fields not named here are durable by default and survive
	 *  process-incarnation revival."* A map is not a descriptor field, so no
	 *  strip-list reaches it, and moving the stamp here defeated all four at once.
	 *
	 *  That is closed in THREE places rather than here, because the cases are
	 *  genuinely different:
	 *    · TERMINAL seats (dissolved, archived) — the lifecycle gate and scrub in
	 *      `read()` below. They are not alive, so no stamp is legitimate.
	 *    · REVIVED seats — `revive()` drops the id from the map. They ARE alive, so
	 *      a gate cannot help; only removing the stale entry can.
	 *    · REINCARNATED seats — a write in `publish()` that does not land on the
	 *      SAME LIVE INCARNATION the stamp was taken of. Three ways that happens:
	 *      nothing was hot (a clean shutdown removed the descriptor and boot
	 *      restored it from the durable identity snapshot, never going near
	 *      `revive()`); what was hot was a CORPSE (a public `unarchive()` can leave
	 *      a `failed` record hot, and adopting it writes a live descriptor through
	 *      `write()`); or the ATTACHMENT changed (`pij adopt --id` re-binds a hot
	 *      LEGACY record — non-terminal, so the first two miss it — to a brand-new
	 *      native session).
	 *
	 *  NOTE FOR ANYONE ADDING A NEW WAY TO BRING AN ID BACK TO LIFE: the third case
	 *  is the structural one and it is why there is no list to keep current. Every
	 *  durable write goes through `publish()`, and a write that does not land on the
	 *  same live incarnation is by construction the first write of a new one.
	 *
	 *  THREE ARGUMENTS HAVE ALREADY BEEN FALSIFIED HERE BY REVIEWER PROBES, and all
	 *  three had the same shape — a true statement about SOME cases, used as a
	 *  statement about ALL of them:
	 *    · round 5 enumerated METHODS ("everything routes through `revive()`",
	 *      justified by the tombstone guard). The guard seals TERMINAL, not ABSENT.
	 *    · round 6 enumerated WRITERS ("every hot write is `publish`/`revive`/
	 *      `unarchive`, so covering them covers everything"). True, and it does not
	 *      prove each writer's PRECONDITION means what it thinks: `unarchive()`
	 *      changed the state a later `publish()` observed. ENUMERATING WRITERS DOES
	 *      NOT ENUMERATE THE STATES A WRITER CAN OBSERVE.
	 *    · round 7 equated NON-TERMINAL with PRESENT. `isTerminalRecord` answers
	 *      false for a lifecycle-ABSENT record, correctly — but a legacy record can
	 *      be re-attached to a new native session while staying non-terminal.
	 *  Do not replace the transition test with a fourth enumeration. */
	private overlayTick(descriptor: SessionDescriptor, stamps: TickStamps): SessionDescriptor {
		const stamp = lastTickFor(stamps, descriptor.id);
		return stamp === undefined ? descriptor : { ...descriptor, lastTickAt: stamp };
	}

	/** THE SCRUB (plan 100 Phase 2) — the counterpart to `overlayTick`, and the
	 *  single most load-bearing line in this file's half of pij#180.
	 *
	 *  `publish()` takes `existing` from `this.read()`, and real callers spread a
	 *  read result straight into a write — `core/cli.ts`'s `stampSenderActivity`
	 *  does exactly that on EVERY `pij send`, in a short-lived CLI process. Without
	 *  this strip, the overlaid stamp is persisted back and the removed fsync cost
	 *  returns on the most latency-sensitive path in the system: the fix would have
	 *  RELOCATED the cost rather than removed it.
	 *
	 *  Applied at the durable-write boundary, so it covers every caller regardless
	 *  of what that caller spread, with zero caller changes.
	 *
	 *  ALSO APPLIED TO TERMINAL READS (fix round 4, P1e). The lifecycle gate in
	 *  `read()` skips the OVERLAY, but a pre-migration descriptor carries its own
	 *  `lastTickAt` in its JSON — 588 of them on the machine this was found on — so
	 *  skipping the overlay left a real stamp on a dissolved seat and AC-13' was
	 *  false exactly on the migration data this change deliberately supports. The
	 *  same strip closes it, because "terminal result" and "durable write" want the
	 *  identical operation. LIVE legacy descriptors are untouched: `read()` still
	 *  honours their own stamp until a rewrite, which the spec asserts.
	 *
	 *  REJECTED alternative: making the overlaid property non-enumerable so spread
	 *  and `JSON.stringify` drop it. It defeats persistence and every JSON output
	 *  surface equally — trading a write defect for a display defect. */
	private scrubTick(descriptor: SessionDescriptor): SessionDescriptor {
		if (descriptor.lastTickAt === undefined) return descriptor;
		const { lastTickAt: _synthetic, ...rest } = descriptor;
		return rest;
	}

	/** THE REINCARNATION DROP's seams. Two callers, both in this file, both
	 *  documented at the call site: `revive()` (terminal -> live) and `publish()`
	 *  (no LIVE incarnation present -> live). Kept as a named method so a reader
	 *  grepping `ticks.forget` finds the reasons, not five scattered call sites. */
	private forgetTick(id: SessionId): void {
		this.ticks.forget(id);
	}

	list(): SessionDescriptor[] {
		let names: string[];
		try {
			names = readdirSync(this.pijHome);
		} catch {
			return [];
		}
		// Read the map ONCE per list(), not once per descriptor — the whole point
		// of this change is that a fleet-sized listing costs one extra file read.
		const stamps = this.ticks.read();
		const out: SessionDescriptor[] = [];
		for (const name of names) {
			if (!name.endsWith(".json")) continue;
			const descriptor = this.readFile(join(this.pijHome, name));
			if (descriptor && descriptor.lifecycle !== "dissolved")
				out.push(this.overlayTick(descriptor, stamps));
		}
		return out;
	}

	listTerminal(): SessionDescriptor[] {
		const byId = new Map<SessionId, SessionDescriptor>();
		let hotNames: string[] = [];
		try {
			hotNames = readdirSync(this.pijHome);
		} catch {
			// Missing hot tier is an empty tier, not a failed registry.
		}
		for (const name of hotNames) {
			if (!name.endsWith(".json")) continue;
			const descriptor = this.readFile(join(this.pijHome, name));
			if (descriptor && isTerminalRecord(descriptor)) {
				byId.set(descriptor.id, this.scrubTick(descriptor));
			}
		}

		let archivedNames: string[] = [];
		try {
			archivedNames = readdirSync(this.archiveDir());
		} catch {
			// Missing archive tier is an empty tier.
		}
		for (const name of archivedNames) {
			if (!name.endsWith(".json")) continue;
			const descriptor = this.readFile(join(this.archiveDir(), name));
			if (descriptor && isTerminalRecord(descriptor) && !byId.has(descriptor.id)) {
				byId.set(descriptor.id, this.scrubTick(descriptor));
			}
		}
		return [...byId.values()];
	}

	/** Hot-first, then the archive by DIRECT path (plan 071 D1). The archive is
	 *  never globbed or listed here: `<pijHome>/archive/<id>.json` is one stat,
	 *  so a keyed lookup stays O(1) no matter how many corpses are archived.
	 *
	 *  THE LIFECYCLE GATE (plan 100 Phase 2, fix round 3) — and it is the whole of
	 *  what an incremental prune used to attempt.
	 *
	 *  A DISSOLVED record gets no overlay, and is SCRUBBED (fix round 4, P1e):
	 *  skipping the overlay is not enough, because a pre-migration descriptor
	 *  carries its own persisted `lastTickAt` and would be handed back as live.
	 *  Before this change `list()` gated and `read()` did not, so a keyed lookup
	 *  could hand a departed seat a live stamp — and the pre-Phase-1 code never
	 *  could, because the tick's per-descriptor write went through `publish()`'s
	 *  tombstone guard below. The gate restores that, and restores it where the
	 *  descriptor and the decision are read TOGETHER, in one process: no clock, no
	 *  marker, no cross-process ordering.
	 *
	 *  It gates on `dissolved` ONLY, matching `list()` exactly. `failed` is not
	 *  excluded by `list()` and was stamped by the pre-change tick, so tightening
	 *  here would be a silent behaviour change riding along with a fix.
	 *
	 *  An ARCHIVED record is scrubbed for the same reason, on the fall-through
	 *  below. Terminal by construction, so a fresh stamp on it would be a lie about
	 *  a corpse — and a legacy archived descriptor really does carry one.
	 *
	 *  THE RESIDUAL (fix rounds 5, 6 and 7). A reincarnated seat gets no inherited
	 *  stamp at all: `revive()` drops the id for the terminal -> live transition and
	 *  `publish()` drops it whenever no LIVE incarnation was present, so even a
	 *  STOPPED daemon leaves nothing behind. What remains is the sanctioned residual recorded on
	 *  the store's `forget()` — two concurrent drops of different ids can lose one
	 *  removal, and the store's writes are best-effort so a drop may not persist at
	 *  all — leaving a stale stamp bounded by the next heartbeat write, and in its
	 *  absence by the staleness grace. That is AC-13' as restated, not a defect
	 *  awaiting a fourth mechanism. */
	read(id: SessionId): SessionDescriptor | null {
		const hot = this.readFile(this.pathFor(id));
		if (hot) {
			return hot.lifecycle === "dissolved"
				? this.scrubTick(hot)
				: this.overlayTick(hot, this.ticks.read());
		}
		const archived = this.readFile(this.archivePathFor(id));
		return archived === null ? null : this.scrubTick(archived);
	}

	/** Hot tier only — for the paths where falling through to the archive would be
	 *  wrong (publishing/claiming a fresh descriptor at this id). */
	private readHot(id: SessionId): SessionDescriptor | null {
		return this.readFile(this.pathFor(id));
	}

	/** THE default write. Applies the ownership law (`core/registry-write.ts`)
	 *  before publishing — at ZERO extra I/O, because the tombstone guard below
	 *  already re-reads the latest record. Five lost-updates say the merge has to
	 *  be the default rather than something each writer must remember. */
	write(descriptor: SessionDescriptor, writer?: DescriptorWriter): void {
		this.publish(descriptor, writer, false, undefined);
	}

	/** Exact for caller changes and CLI-owned denorm fields, rebased onto fresh
	 *  disk under the descriptor lock. A supplied baseline also covers the
	 *  caller's pre-publish object-construction window. */
	writeExact(descriptor: SessionDescriptor, options?: RegistryWriteExactOptions): void {
		this.publish(descriptor, undefined, true, options?.baseline);
	}

	private publish(
		descriptor: SessionDescriptor,
		writer: DescriptorWriter | undefined,
		exact: boolean,
		callerBaseline: SessionDescriptor | undefined,
	): void {
		// THE REHYDRATION DROP's precondition, and it MUST be sampled here — before
		// `unarchive()` below, and against the HOT tier only. See the drop itself at
		// the foot of this method.
		//
		//  · before `unarchive()`, because that call MOVES an archived record into
		//    the hot tier. Sampling after it would see the record it just created and
		//    conclude a descriptor was already present, so an archive -> live write
		//    would skip the drop — which is precisely the transition that most needs
		//    it (`unarchive` handles `failed` records too, and the tombstone guard
		//    below only refuses `dissolved`).
		//  · hot-only, because `read()` falls through to the archive. An archived
		//    record is NOT a present incarnation; treating it as one is the same
		//    mistake with a different spelling.
		//  · NON-TERMINAL-only, because a `dissolved`/`failed` record is not a
		//    present incarnation either — see round 7 at the foot of this method.
		//
		// Costs one extra small `readFileSync`. `writeAtomic` below carries two
		// fsync barriers (file + directory), so this is well under 1% of a publish
		// and is not worth trading for an `existsSync` — a stat cannot tell an
		// unparseable descriptor from a present one, and would leave the stale stamp
		// standing on exactly the corrupt-then-rewritten record nobody would check.
		//
		// `isTerminalRecord` is IMPORTED from `core/archive.ts` rather than
		// re-spelled here: it is the codebase's one definition of "has no future",
		// and a second copy would drift the first time a lifecycle is added.
		const priorHot = this.readHot(descriptor.id);
		// Any write that brings a record back to life pulls it out of the archive
		// first (review §2.2) — otherwise the id exists in BOTH tiers, the live
		// descriptor's dataDir points into `archive/`, and `pij list --archived`
		// keeps listing a seat that is running.
		if (descriptor.lifecycle !== undefined && descriptor.lifecycle !== "dissolved") {
			this.unarchive(descriptor.id);
		}
		// Review round 2 §3.1 — the REGISTRY owns the tier, therefore it owns the
		// paths. `unarchive()` above corrects dataDir/eventsPath on disk, but the
		// caller's descriptor was read BEFORE that and still names `archive/<id>`;
		// those fields are uncontested, so the stale copy would win and overwrite the
		// correction — leaving a live seat pointing at a directory that no longer
		// exists. That is worse than the original split, because `pij path`/`pij tail`
		// then name nothing at all. pi/omp happened to self-heal (session.ts computes
		// its own dataDir); s066's buildRevivedDescriptor does not, so claude/copilot/
		// codex — the harnesses whose revive is live-proven — kept the broken path.
		//
		// No caller gets to state which tier it is in.
		descriptor = this.withHotPaths(descriptor);
		const sampled = this.read(descriptor.id);
		if (
			sampled?.lifecycle === "dissolved" &&
			descriptor.lifecycle !== undefined &&
			descriptor.lifecycle !== "dissolved"
		) {
			return;
		}
		this.options.beforeWrite?.();
		const published = this.withDescriptorWriteLock(descriptor.id, () => {
			const latest = this.read(descriptor.id);
			this.options.afterLockRead?.();
			if (
				latest?.lifecycle === "dissolved" &&
				descriptor.lifecycle !== undefined &&
				descriptor.lifecycle !== "dissolved"
			) {
				return null;
			}
			const proposed = exact
				? mergeExactDescriptor(descriptor, callerBaseline ?? sampled, latest)
				: applyWriteLaw(descriptor, latest, writer);
			const identity = this.claimDescriptorIdentity(proposed);
			if (!identity.ok) throw new Error(identity.message);
			try {
				this.writeAtomic(this.pathFor(proposed.id), this.scrubTick(proposed));
			} catch (error) {
				if (identity.value) this.rollbackIdentity(identity.value.createdPaths);
				throw error;
			}
			return proposed;
		});
		if (published === null) return;
		descriptor = published;
		// THE REINCARNATION DROP (plan 100 Phase 2, fix rounds 6, 7 and 8).
		//
		// ONE PREDICATE: keep the map stamp only when the write lands on the SAME
		// LIVE INCARNATION that the stamp was taken of. Three conjuncts, each added
		// by a review round that falsified the previous one's sufficiency:
		//
		//   priorHot !== null           — round 6: absent means the stamp predates it
		//   && !isTerminalRecord(prior) — round 7: a corpse is not a present incarnation
		//   && same harnessSessionId    — round 8: nor is a different ATTACHMENT
		//
		//   prior hot        | incoming              | drop | why
		//   -----------------|-----------------------|------|-------------------------
		//   absent           | anything              | yes  | rehydration (round 6)
		//   terminal         | anything              | yes  | a corpse is not present
		//   live, sid X      | sid Y                 | yes  | re-attached (round 8)
		//   live, no sid     | no sid                | NO   | legacy state update
		//   live, sid X      | sid X                 | NO   | the assignment swap
		//   live             | terminal, same sid    | NO   | `failed` overlay parity
		//
		// WHY IT IS A TRANSITION AND NOT A METHOD. Fix round 5 put the drop in
		// `revive()` on the claim that `revive()` is the only door from terminal OR
		// ABSENT back to live, justified by the tombstone guard above. The guard
		// covers TERMINAL -> live. It cannot cover ABSENT -> live, because there is
		// no tombstone to guard: a clean shutdown REMOVES the descriptor, the durable
		// identity snapshot (`resolveIdentitySnapshot`) restores it, and
		// `PijSession.boot()` sees no hot record, so `wasDissolved` is false and it
		// takes its else branch to `writeExact()` — never `revive()`. The old map
		// entry survived and overlaid the NEW incarnation. Putting the drop in
		// `writeExact()` instead would be an enumeration wearing a different hat, and
		// a wrong one: `core/cli.ts`'s node-truth denorm update is a `writeExact` on
		// a LIVE seat, so a method-shaped drop would make a healthy seat read stale
		// on every state report. This condition cannot fire there — that path has a
		// live hot descriptor.
		//
		// THE METHOD CORRECTION, WHICH IS THE PART WORTH KEEPING. Round 6 argued
		// completeness from a DESTINATION SEARCH: every hot-descriptor write passes
		// through `publish()`, `revive()`, or `unarchive()`, therefore the three are
		// covered, therefore done. A reviewer falsified it with a probe. The missed
		// case was not a fourth writer — it was `unarchive()` changing the
		// PRECONDITION of a later `publish()`: `runRevive()` unarchives BEFORE it
		// validates its plan, so a failed plan leaves a `failed` record hot; `list()`
		// deliberately includes `failed` so the daemon stamps it; `runAdopt()` treats
		// only `dissolved` as a revive, so it reattaches through `write()` — and the
		// round-6 predicate saw a hot descriptor and skipped the drop.
		//
		//   ENUMERATING WRITERS DOES NOT ENUMERATE THE STATES A WRITER CAN OBSERVE.
		//
		// If you are here to simplify this, you will re-derive the three-writer
		// argument and reach the same wrong conclusion. The argument is sound and
		// answers a different question than the one that matters.
		//
		// THE PREDICATE IS DELIBERATELY BLIND TO THE INCOMING LIFECYCLE. For the
		// ABSENT row that is exact rather than merely safe: a stamp can only be in
		// the map because a tick saw this id in `list()`, which reads HOT
		// descriptors, so if nothing was hot a moment ago any stamp necessarily
		// predates this descriptor's presence. For the TERMINAL row it is an
		// over-drop in one sub-case — terminal -> terminal, a write to a corpse that
		// stays a corpse, keeps no stamp it was entitled to keep.
		//
		// PRICED, NOT REPAIRED. A later heartbeat write ends the inheritance; with no
		// daemon running there is no such write, and the seat reads `unverified`
		// until one runs. That is conservative and accepted — `bind-failed` sends are
		// refused anyway, so nothing depends on that stamp being fresh.
		//
		// AN EARLIER VERSION OF THIS COMMENT CLAIMED THE REPAIR, AND REVIEW
		// FALSIFIED IT. It said the writes reaching this row are all the daemon's own
		// latched transition writes, so the daemon is running by construction and
		// `list()` re-stamps within one 600ms tick. The counter-example is
		// `executeAgentReport()` (`core/agent-peer.ts`), which admits `failed` and
		// stamps `reportedAt` through `registry.write()` from the PEER's process —
		// a production failed -> failed write with no daemon involved at all. The
		// claim is recorded here as DELETED rather than removed silently, because a
		// justification that vanishes without trace gets re-derived by the next
		// reader.
		//
		// What the row actually rests on is the ASYMMETRY, which needs no mechanism:
		// over-dropping costs one `unverified` read; under-dropping is a false-fresh
		// lie about a seat the daemon never ticked, and with a stopped daemon it
		// stands for the whole staleness grace.
		//
		// A first-ever spawn takes this branch too, harmlessly: `forget()` skips its
		// write entirely when the id is not in the map, so it costs one read.
		//
		// THE THIRD CONJUNCT — THE ATTACHMENT (round 8). "Non-terminal" is still not
		// "the same incarnation". `isTerminalRecord` answers FALSE for a
		// LIFECYCLE-ABSENT record, by design and correctly — an ordinary legacy state
		// update is not a new incarnation, and classifying every legacy descriptor as
		// terminal would false-positive on all of them. But `pij adopt --id` may
		// re-attach that same hot legacy record to a brand-new native session,
		// writing a new `harnessSessionId` with `lifecycle: "bound"` through
		// `write()`, and the round-7 predicate saw non-terminal and kept the stamp.
		//
		// `harnessSessionId` IS the incarnation identity for the harnesses this map
		// holds: `applyBinding` (`core/binding.ts`) defines the binding as
		// `pij-id ↔ harnessSessionId ↔ pane ↔ cwd`, so when it changes, the thing the
		// stamp was a receipt FOR is gone. Compared against the POST-MERGE
		// descriptor, not the caller's proposal — `harnessSessionId` is uncontested
		// in the write law today, so the two are identical, but a future owner entry
		// would make the merged value the truthful one and the raw proposal a
		// spurious drop.
		//
		// TWO EARLIER IDENTITY CANDIDATES FAILED HERE AND ARE RECORDED SO THEY ARE
		// NOT RETRIED: `revivePendingAt` (round 4) exists on the revive path ONLY, so
		// it would have fixed one boundary of four; `pid` (round 5) is the PANE
		// SHELL's, identical across a relaunch, so it cannot see a re-attach at all.
		//
		// KNOWN OVER-DROP, and it is not the one the reviewer warned about: the
		// daemon's own spawn-bind (`core/daemon/loop.ts`) sets `harnessSessionId` on
		// a LIVE `pending` seat that is the same incarnation, so that one-time
		// pending -> bound write drops a stamp it could have kept. The reviewer's
		// warned-about false positive is legacy -> legacy (`undefined` ->
		// `undefined`), which compares EQUAL and is kept; there is a criterion for it.
		//
		// PRICED, NOT REPAIRED — the same words as the terminal row above, and for
		// the same reason. A later heartbeat write ends the inheritance; with no
		// daemon running there is no such write, and the seat reads `unverified`
		// until one runs.
		//
		// THIS ONE ALSO CLAIMED A REPAIR, AND THE CLAIM WAS FALSIFIED BY REVIEW. It
		// argued that because the write is performed BY the daemon, a tick is ≤600ms
		// away by construction. A WRITE HAPPENING INSIDE THE DAEMON DOES NOT MAKE
		// ANOTHER TICK HAPPEN, and the ordering makes it worse rather than neutral:
		// `Daemon.tick()` writes the heartbeat at its BEGINNING, before it drives and
		// binds pending sessions — so the bind below removes the very entry that the
		// SAME tick just wrote. The next tick is a `setInterval` callback, not a
		// guarantee; a stop or crash after this one leaves the bound seat unverified
		// until some daemon runs again.
		//
		// It is recorded rather than deleted because it is not a weaker form of the
		// terminal row's falsified argument — it is THE SAME ARGUMENT, and the next
		// reader who notices the writer and the repairer are the same process will
		// reach for it again.
		const sameLiveIncarnation =
			priorHot !== null &&
			!isTerminalRecord(priorHot) &&
			priorHot.harnessSessionId === descriptor.harnessSessionId;
		if (!sameLiveIncarnation) this.forgetTick(descriptor.id);
		// Once the live descriptor is durable, never roll its identity claim back;
		// a snapshot failure is repairable, an unowned bound descriptor is not.
		this.syncIdentitySnapshot(descriptor);
	}

	revive(descriptor: SessionDescriptor): Result<void> {
		// Review round 1 §2.2 — pull the tier back HERE, not in one CLI verb. The
		// seat's own boot path (`session.ts` wasDissolved → revive()) runs in the
		// SEAT's process, where no `pij revive` ever executed, so a CLI-only
		// unarchive left a live seat writing events into `~/.pij/archive/` while
		// `pij list --archived` still listed it.
		this.unarchive(descriptor.id);
		const existing = this.read(descriptor.id);
		if (!existing) return err("E-NOID", `no terminal session '${descriptor.id}' to revive`);
		const explicitRevive =
			descriptor.revivePendingAt !== undefined && descriptor.pid !== existing.pid;
		if (existing.lifecycle !== "dissolved" && existing.terminal === undefined && !explicitRevive) {
			return err("E-ARG", `session '${descriptor.id}' has no terminal incarnation to replace`);
		}
		if (
			existing.harness !== descriptor.harness ||
			existing.harnessSessionId !== descriptor.harnessSessionId
		) {
			return err("E-AMBIG", `revive identity mismatch for '${descriptor.id}'`);
		}
		try {
			// Same tier-truth guarantee as publish() (review §3.1): s066's
			// `buildRevivedDescriptor` carries the prior incarnation's dataDir
			// verbatim, which for an archived seat points into `archive/`.
			const revived = this.withHotPaths(descriptor);
			this.writeAtomic(this.pathFor(revived.id), this.scrubTick(revived));
			this.syncIdentitySnapshot(revived);
			// THE REINCARNATION DROP (plan 100 Phase 2, fix round 5). A revived seat
			// is genuinely ALIVE, so the lifecycle gate in `read()` cannot help: it
			// passes, and the map would hand it the PREVIOUS incarnation's stamp.
			// `core/revive.ts:667` strips `lastTickAt` from the descriptor for exactly
			// this reason; without this line the map re-attaches what revive
			// deliberately removed, and with a stopped daemon there is no next
			// heartbeat write to end it — a real `send` reported `queued` /
			// `daemonTickStale: false` for a seat the daemon had never ticked.
			//
			// It covers the TERMINAL -> live transition, which reaches here from four
			// call sites (`cli.ts:1880`, `:1984`, `:3078`, `core/session.ts:248`).
			// Round 5 also claimed it covered ABSENT -> live, on the strength of
			// `publish()`'s tombstone guard; that was FALSE — there is no tombstone
			// when the descriptor is simply gone — and the absent case is now handled
			// structurally in `publish()`, on the transition rather than the method.
			//
			// The accepted cost is recorded on `forget()` in the store, in the terms
			// it was ruled.
			this.forgetTick(revived.id);
			return ok(undefined);
		} catch (error) {
			return err("E-NOREG", `cannot revive '${descriptor.id}': ${String(error)}`);
		}
	}

	/** Atomically create a deterministic live descriptor without replacing an
	 * existing claim. */
	claim(
		descriptor: SessionDescriptor,
	): Result<
		| { readonly kind: "claimed"; readonly descriptor: SessionDescriptor }
		| { readonly kind: "exists"; readonly descriptor: SessionDescriptor }
	> {
		const identity = this.claimDescriptorIdentity(descriptor);
		if (!identity.ok) return err(identity.code, identity.message);
		const finalPath = this.pathFor(descriptor.id);
		const published = this.publishNoReplace(finalPath, this.scrubTick(descriptor));
		if (!published.ok) {
			if (identity.value) this.rollbackIdentity(identity.value.createdPaths);
			return published;
		}
		if (published.value === "claimed") {
			this.syncIdentitySnapshot(descriptor);
			return ok({ kind: "claimed", descriptor });
		}
		const existing = this.read(descriptor.id);
		if (!existing) {
			if (identity.value) this.rollbackIdentity(identity.value.createdPaths);
			return err("E-NOREG", `pij identity ${descriptor.id} exists but is unreadable`);
		}
		if (!sameDescriptorIdentity(existing, descriptor)) {
			if (identity.value) this.rollbackIdentity(identity.value.createdPaths);
			return err(
				"E-AMBIG",
				`pij identity ${descriptor.id} is already attached to an incompatible descriptor`,
			);
		}
		return ok({ kind: "exists", descriptor: existing });
	}

	/** Durable exact native-identity lookup, independent of live presence. */
	resolveIdentity(harness: HarnessKind, harnessSessionId: string): Result<SessionId | undefined> {
		const record = this.readIdentityRecord(this.identityPath(harness, harnessSessionId));
		if (!record.ok || !record.value) return record.ok ? ok(undefined) : record;
		if (record.value.harness !== harness || record.value.harnessSessionId !== harnessSessionId) {
			return err("E-AMBIG", `durable identity hash collision for ${harness}:${harnessSessionId}`);
		}
		return ok(record.value.pijId);
	}

	/** Snapshot used when a clean shutdown removed the live descriptor. The caller
	 * must scrub/replace runtime fields before writing it back. */
	resolveIdentitySnapshot(
		harness: HarnessKind,
		harnessSessionId: string,
	): Result<SessionDescriptor | undefined> {
		const record = this.readIdentityRecord(this.identityPath(harness, harnessSessionId));
		if (!record.ok || !record.value) return record.ok ? ok(undefined) : record;
		if (record.value.harness !== harness || record.value.harnessSessionId !== harnessSessionId) {
			return err("E-AMBIG", `durable identity hash collision for ${harness}:${harnessSessionId}`);
		}
		return ok(record.value.snapshot);
	}

	/** First-writer-wins two-way identity claim.
	 *
	 * The reverse pij-id owner record is claimed first, preventing distinct native
	 * tuples from sharing one id/dataDir. The tuple record is then claimed; if a
	 * competing explicit id already owns that tuple, the provisional reverse claim
	 * is rolled back. */
	claimIdentity(
		harness: HarnessKind,
		harnessSessionId: string,
		pijId: SessionId,
	): Result<
		| { readonly kind: "claimed"; readonly id: SessionId }
		| { readonly kind: "exists"; readonly id: SessionId }
	> {
		const detailed = this.claimIdentityDetailed(harness, harnessSessionId, pijId);
		if (!detailed.ok) return detailed;
		return ok({ kind: detailed.value.kind, id: detailed.value.id });
	}

	/** Resolve an existing exact/legacy identity or atomically claim the first free
	 * memorable candidate. Exact native identity always wins over candidate order. */
	allocateIdentity(
		harness: HarnessKind,
		harnessSessionId: string,
		seed: string,
		legacyId?: SessionId,
	): Result<{
		readonly kind: "claimed" | "reuse";
		readonly id: SessionId;
		readonly descriptor?: SessionDescriptor;
	}> {
		const durable = this.resolveIdentity(harness, harnessSessionId);
		if (!durable.ok) return durable;
		const exact = this.list().filter(
			(descriptor) =>
				descriptor.harness === harness && descriptor.harnessSessionId === harnessSessionId,
		);
		if (exact.length > 1) {
			return err(
				"E-AMBIG",
				`identity ${harness}:${harnessSessionId} maps to multiple pij ids: ${exact
					.map((descriptor) => descriptor.id)
					.join(", ")}`,
			);
		}
		const exactDescriptor = exact[0];
		if (durable.value) {
			if (exactDescriptor && exactDescriptor.id !== durable.value) {
				return err(
					"E-AMBIG",
					`durable identity ${harness}:${harnessSessionId} is ${durable.value}, but live descriptor is ${exactDescriptor.id}`,
				);
			}
			const resolved = this.validateResolvedIdentity(
				harness,
				harnessSessionId,
				durable.value,
				legacyId === durable.value,
			);
			if (!resolved.ok) return resolved;
			if (resolved.value.kind !== "occupied") {
				return ok({
					kind: "reuse",
					id: durable.value,
					...(resolved.value.descriptor ? { descriptor: resolved.value.descriptor } : {}),
				});
			}
		}
		if (exactDescriptor) {
			const claimed = this.claimIdentityDetailed(
				harness,
				harnessSessionId,
				exactDescriptor.id,
				true,
			);
			if (!claimed.ok) return claimed;
			return ok({ kind: "reuse", id: exactDescriptor.id, descriptor: exactDescriptor });
		}

		if (legacyId) {
			const legacy = this.read(legacyId);
			if (legacy && legacy.harness === undefined && legacy.harnessSessionId === undefined) {
				const allocated = this.allocateCandidate(harness, harnessSessionId, legacy.id, true);
				if (!allocated.ok) return allocated;
				if (allocated.value.kind !== "occupied") return ok(allocated.value);
			}
		}

		for (const id of memorablePijIdCandidates(seed)) {
			const allocated = this.allocateCandidate(harness, harnessSessionId, id, false);
			if (!allocated.ok) return allocated;
			if (allocated.value.kind !== "occupied") return ok(allocated.value);
		}
		return err("E-FULL", "memorable pij id space exhausted");
	}

	/** Atomically reserve the first free memorable id for a pre-bind launch owner. */
	reserveMemorableId(
		seed: string,
		ownerToken: string,
		ownerPid: number,
	): Result<{ readonly kind: "claimed" | "exists"; readonly id: SessionId }> {
		if (!ownerToken.trim()) return err("E-ARG", "reservation owner token must be non-empty");
		for (const id of memorablePijIdCandidates(seed)) {
			const record: ReservationRecord = {
				kind: "reservation",
				pijId: id,
				ownerToken,
				ownerPid,
				createdAt: new Date().toISOString(),
			};
			const path = this.identityOwnerPath(id);
			const owner = this.claimOwnerRecord(path, record);
			if (!owner.ok) return owner;
			if (owner.value.kind === "exists") {
				const existing = owner.value.record;
				if (
					isReservationRecord(existing) &&
					existing.pijId === id &&
					existing.ownerToken === ownerToken
				) {
					return ok({ kind: "exists", id });
				}
				continue;
			}
			if (this.read(id)) {
				rmSync(path, { force: true });
				continue;
			}
			return ok({ kind: "claimed", id });
		}
		return err("E-FULL", "memorable pij id space exhausted");
	}

	/** Release only an unconsumed reservation owned by the caller. */
	releaseReservation(id: SessionId, ownerToken: string): Result<boolean> {
		const path = this.identityOwnerPath(id);
		const owner = this.readOwnerRecord(path);
		if (!owner.ok) return owner;
		if (!owner.value || isIdentityRecord(owner.value) || isDescriptorOwnerRecord(owner.value)) {
			return ok(false);
		}
		if (owner.value.ownerToken !== ownerToken) {
			return err("E-OWN", `reservation ${id} belongs to another launch owner`);
		}
		const descriptor = this.read(id);
		if (descriptor) {
			this.writeAtomic(path, descriptorOwner(owner.value));
			return ok(false);
		}
		rmSync(path, { force: true });
		return ok(true);
	}

	hasReservation(id: SessionId): Result<boolean> {
		const owner = this.readOwnerRecord(this.identityOwnerPath(id));
		return owner.ok ? ok(isReservationRecord(owner.value)) : owner;
	}

	/** Publish the pending descriptor while retaining atomic by-id ownership. */
	promoteReservation(
		descriptor: SessionDescriptor,
		ownerToken: string,
	): Result<
		| { readonly kind: "claimed"; readonly descriptor: SessionDescriptor }
		| { readonly kind: "exists"; readonly descriptor: SessionDescriptor }
	> {
		const ownerPath = this.identityOwnerPath(descriptor.id);
		const owner = this.readOwnerRecord(ownerPath);
		if (!owner.ok) return owner;
		if (!owner.value || isIdentityRecord(owner.value)) {
			return err("E-NOID", `no pre-bind reservation exists for ${descriptor.id}`);
		}
		if (owner.value.ownerToken !== ownerToken) {
			return err("E-OWN", `reservation ${descriptor.id} belongs to another launch owner`);
		}
		const published = this.publishNoReplace(this.pathFor(descriptor.id), descriptor);
		if (!published.ok) return published;
		let persisted = descriptor;
		if (published.value === "exists") {
			const existing = this.read(descriptor.id);
			if (!existing) return err("E-NOREG", `pij identity ${descriptor.id} is unreadable`);
			if (!sameDescriptorIdentity(existing, descriptor)) {
				return err(
					"E-AMBIG",
					`pij identity ${descriptor.id} is already attached to an incompatible descriptor`,
				);
			}
			persisted = existing;
		}
		this.writeAtomic(ownerPath, descriptorOwner(owner.value));
		return ok({ kind: published.value, descriptor: persisted });
	}

	/** Mark a reservation consumed after another writer published its descriptor. */
	consumeReservation(id: SessionId, ownerToken: string): Result<boolean> {
		const ownerPath = this.identityOwnerPath(id);
		const owner = this.readOwnerRecord(ownerPath);
		if (!owner.ok) return owner;
		if (!owner.value || isIdentityRecord(owner.value) || isDescriptorOwnerRecord(owner.value)) {
			return ok(false);
		}
		if (owner.value.ownerToken !== ownerToken) {
			return err("E-OWN", `reservation ${id} belongs to another launch owner`);
		}
		if (!this.read(id)) return err("E-NOID", `cannot consume reservation ${id}: descriptor absent`);
		this.writeAtomic(ownerPath, descriptorOwner(owner.value));
		return ok(true);
	}

	/** Explicit operator recovery for an orphaned reservation. Never called automatically. */
	recoverReservation(
		descriptor: SessionDescriptor,
	): Result<{ readonly descriptor: SessionDescriptor }> {
		const ownerPath = this.identityOwnerPath(descriptor.id);
		const owner = this.readOwnerRecord(ownerPath);
		if (!owner.ok) return owner;
		if (!owner.value || isIdentityRecord(owner.value)) {
			return err("E-NOID", `no recoverable reservation exists for ${descriptor.id}`);
		}
		const promoted = this.promoteReservation(descriptor, owner.value.ownerToken);
		if (!promoted.ok) return promoted;
		return ok({ descriptor: promoted.value.descriptor });
	}

	remove(id: SessionId): void {
		try {
			rmSync(this.pathFor(id));
		} catch {
			// already gone — durable identity and snapshot intentionally remain.
		}
	}

	dissolve(id: SessionId): void {
		// Hot-only: an already-archived record is terminal by construction, and
		// re-publishing it into the hot tier would undo the archival.
		const existing = this.readHot(id);
		if (!existing || existing.lifecycle === "dissolved") return;
		this.write({ ...existing, lifecycle: "dissolved", state: "idle" });
	}

	// ─── two-tier archive (plan 071 D1) ──────────────────────────────────────

	/** Move one record out of the hot tier. DAEMON-ONLY (single-writer).
	 *
	 *  Ordering is chosen so a crash never makes a record unfindable: the session
	 *  dir moves first, then the archived descriptor is published, then the index
	 *  line is appended, and only then is the hot descriptor unlinked. Until that
	 *  last unlink the hot copy is still authoritative, and after it the archive
	 *  copy is — `read()` covers both, so there is no window where a keyed lookup
	 *  returns null for a record that exists.
	 *
	 *  Re-running over a half-finished move is a no-op-and-continue at every step,
	 *  which is what makes the sweep idempotent. The one case it refuses is a
	 *  genuine conflict — a session dir present in BOTH tiers — because merging
	 *  two histories could lose events; that returns `skipped` and leaves
	 *  everything where it is. */
	archive(id: SessionId, nowMs: number): ArchiveOutcome {
		const hot = this.readFile(this.pathFor(id));
		if (!hot) {
			return this.readFile(this.archivePathFor(id)) ? "already-archived" : "skipped";
		}
		mkdirSync(this.archiveDir(), { recursive: true });

		const hotDir = join(this.pijHome, id);
		const archivedDir = join(this.archiveDir(), id);
		const hotDirExists = existsSync(hotDir);
		const archivedDirExists = existsSync(archivedDir);
		if (hotDirExists && archivedDirExists) {
			// Two session dirs for one id: a prior interrupted move plus fresh
			// activity. Refuse rather than merge or clobber.
			return "skipped";
		}
		if (hotDirExists) {
			try {
				renameSync(hotDir, archivedDir);
			} catch {
				return "skipped"; // cross-device or permissions — leave the record hot
			}
		}

		// The archived copy's paths point at the archived location, so
		// `pij path`/`pij tail` on a revived-or-archived id stay truthful.
		const archived: SessionDescriptor = {
			...hot,
			dataDir: archivedDir,
			eventsPath: join(archivedDir, "events.ndjson"),
		};
		try {
			this.writeAtomic(this.archivePathFor(id), this.scrubTick(archived));
			appendFileSync(
				this.archiveIndexPath(),
				`${JSON.stringify(buildArchiveIndexEntry(hot, nowMs))}\n`,
			);
		} catch {
			return "skipped";
		}
		rmSync(this.pathFor(id), { force: true });
		return "archived";
	}

	/** Archive every hot record the policy calls archivable, and report the tally.
	 *  DAEMON-ONLY (single-writer).
	 *
	 *  This scans the hot directory DIRECTLY rather than going through `list()`,
	 *  because `list()` hides `dissolved` records — and dissolved records are the
	 *  overwhelming majority of the corpses this sweep exists to clear (1,945 of
	 *  the 2,000 in the 2026-07-25 incident). A sweep built on `list()` would have
	 *  looked correct and moved almost nothing. */
	sweepArchivable(nowMs: number): { readonly archived: number; readonly skipped: number } {
		let names: string[];
		try {
			names = readdirSync(this.pijHome);
		} catch {
			return { archived: 0, skipped: 0 };
		}
		let archived = 0;
		let skipped = 0;
		for (const name of names) {
			if (!name.endsWith(".json")) continue;
			const descriptor = this.readFile(join(this.pijHome, name));
			if (!descriptor) continue;
			if (classifyRegistryRecord(descriptor, nowMs) !== "archivable") continue;
			if (this.archive(descriptor.id, nowMs) === "archived") archived += 1;
			else skipped += 1;
		}
		return { archived, skipped };
	}

	/** Newest-archived first. Rows whose archived descriptor is gone (revived, or
	 *  hand-removed) are dropped, so the listing reflects the archive as it IS
	 *  rather than as the append-only index once recorded it. */
	listArchived(): readonly ArchiveIndexEntry[] {
		let raw: string;
		try {
			raw = readFileSync(this.archiveIndexPath(), "utf8");
		} catch {
			return [];
		}
		const newestById = new Map<string, ArchiveIndexEntry>();
		for (const line of raw.split("\n")) {
			const entry = parseArchiveIndexLine(line);
			if (!entry) continue;
			newestById.set(entry.id, entry); // later line wins (re-archived after revive)
		}
		return [...newestById.values()]
			.filter((entry) => existsSync(this.archivePathFor(entry.id)))
			.sort((left, right) => right.archivedAt.localeCompare(left.archivedAt));
	}

	/** Pull an ARCHIVED record back into the hot tier. Mirror of `archive`, same
	 *  refuse-on-conflict rule. Returns the hot descriptor, or null if not archived.
	 *
	 *  Named `unarchive`, not `revive`: `revive(descriptor)` is s066's relaunch verb.
	 *  This moves storage tiers and starts no process. */
	/** Delete the wreckage of archived records older than
	 *  {@link ARCHIVE_PRUNE_AFTER_MS}, KEEPING their `index.jsonl` tombstone.
	 *
	 *  The index is deliberately not rewritten — it is append-only, one line per
	 *  record, and it is the thing that makes a pruned seat still ANSWERABLE ("did
	 *  it exist, when did it die, how did it end") for near-zero disk. What goes is
	 *  the descriptor file and the session directory, which are the gigabyte.
	 *
	 *  Reports bytes as well as counts because a count alone cannot distinguish
	 *  "pruned 2,000 empty stubs" from "pruned the 94 MB seat somebody wanted". */
	prunePrunableArchive(nowMs: number): { readonly pruned: number; readonly bytes: number } {
		let names: string[];
		try {
			names = readdirSync(this.archiveDir());
		} catch {
			return { pruned: 0, bytes: 0 };
		}
		let pruned = 0;
		let bytes = 0;
		for (const name of names) {
			if (!name.endsWith(".json")) continue;
			if (name === "index.jsonl") continue; // the tombstone ledger — never pruned
			const recordPath = join(this.archiveDir(), name);
			const descriptor = this.readFile(recordPath);
			if (!descriptor) continue;
			if (!isPrunableArchiveRecord(descriptor, nowMs)) continue;
			const dir = join(this.archiveDir(), descriptor.id);
			bytes += directoryBytes(dir) + fileBytes(recordPath);
			try {
				rmSync(dir, { recursive: true, force: true });
				rmSync(recordPath, { force: true });
				pruned += 1;
			} catch {
				// A record we cannot remove stays; the next sweep retries it.
			}
		}
		return { pruned, bytes };
	}

	unarchive(id: SessionId): SessionDescriptor | null {
		const archived = this.readFile(this.archivePathFor(id));
		if (!archived) return null;
		if (this.readFile(this.pathFor(id))) return null; // already hot — nothing to revive

		const hotDir = join(this.pijHome, id);
		const archivedDir = join(this.archiveDir(), id);
		const revived: SessionDescriptor = {
			...archived,
			dataDir: hotDir,
			eventsPath: join(hotDir, "events.ndjson"),
		};
		// Ordering mirrors `archive()` (review §2.4): move the DATA first, then
		// publish the descriptor that points at it. The reverse order left a window
		// where `read()` returned a descriptor whose dataDir did not exist yet, and
		// nothing re-ran the heal automatically.
		if (existsSync(archivedDir) && !existsSync(hotDir)) {
			try {
				renameSync(archivedDir, hotDir);
			} catch {
				return null;
			}
		}
		this.writeAtomic(this.pathFor(id), this.scrubTick(revived));
		rmSync(this.archivePathFor(id), { force: true });
		return revived;
	}

	/** Release this pij id's native-identity claim WITHOUT tearing anything down
	 *  (plan 071 D4, defect C).
	 *
	 *  Recovering the 2026-07-25 wedge required hand-deleting three files under
	 *  `~/.pij/identities/` with the operator watching, because the only verb that
	 *  could free a claim was `pij close` — and closing the duplicate would have
	 *  killed the peer's own pane. Recovery must never require reaching into the
	 *  registry by hand.
	 *
	 *  Removes only the two identity records (by-native tuple + by-pij owner) and
	 *  scrubs the binding fields from the live descriptor. The descriptor, its
	 *  session dir, and the pane all survive — the seat simply becomes re-bindable
	 *  by `pij phonehome` or `pij adopt`. */
	releaseIdentity(
		id: SessionId,
	): Result<{ readonly released: boolean; readonly removedPaths: readonly string[] }> {
		// Review round 1 §2.3 — read BOTH tiers. `runIdentity` checks existence with
		// `read()`, so an archived id passed the CLI gate and then hit a `readHot()`
		// null here: both identity records were unlinked while the archived
		// descriptor kept claiming its `harnessSessionId`, and the verb reported
		// `released: true`. A dishonest report is the one bug this branch cannot ship.
		const descriptor = this.read(id);
		// Review round 1 §1.1 — the FIFTH lost-update, and a recovery verb creating an
		// unreconcilable zombie. Releasing a terminal record used to resurrect it:
		// `writeAtomic` bypassed `write()`'s dissolved-tombstone guard and stamped
		// `lifecycle: "pending"` unconditionally while LEAVING `terminal`/`closeIntent`
		// in place. Nothing can then resolve the row — `reconcileDeaths` skips
		// `terminal !== undefined` and the watchdog's `eligible()` excludes `pending` —
		// and it is back in `list()`.
		//
		// A terminal seat's pane is gone, so there is nothing to re-bind and no reason
		// to touch its descriptor. Refuse, and say which state blocked it.
		if (descriptor) {
			const blocking =
				descriptor.lifecycle === "dissolved"
					? "dissolved"
					: descriptor.terminal !== undefined
						? "terminal"
						: descriptor.closeIntent !== undefined
							? "closing"
							: undefined;
			if (blocking !== undefined) {
				return err(
					"E-DEAD",
					`${id} is ${blocking} — its pane is gone, so there is no identity to re-bind. ` +
						"Releasing it would resurrect the tombstone as an unreconcilable 'pending' row.",
				);
			}
		}
		const owner = this.readOwnerRecord(this.identityOwnerPath(id));
		if (!owner.ok) return owner;
		const ownerRecord = owner.value;
		const claimed = ownerRecord !== undefined && isIdentityRecord(ownerRecord);
		const harness = descriptor?.harness ?? (claimed ? ownerRecord.harness : undefined);
		const harnessSessionId =
			descriptor?.harnessSessionId ?? (claimed ? ownerRecord.harnessSessionId : undefined);
		// Nothing claimed and nothing bound — releasing is a no-op, reported honestly
		// rather than as a success that did nothing.
		if (!claimed && harnessSessionId === undefined) {
			return ok({ released: false, removedPaths: [] });
		}
		const removed: string[] = [];
		if (harness && harnessSessionId) {
			const tuplePath = this.identityPath(harness, harnessSessionId);
			// Only ever unlink a record that names THIS id — never another seat's.
			const tuple = this.readIdentityRecord(tuplePath);
			if (tuple.ok && tuple.value?.pijId === id) {
				rmSync(tuplePath, { force: true });
				removed.push(tuplePath);
			}
		}
		const ownerPath = this.identityOwnerPath(id);
		if (claimed) {
			rmSync(ownerPath, { force: true });
			removed.push(ownerPath);
		}
		if (descriptor) {
			const {
				harnessSessionId: _harnessSessionId,
				plannedHarnessSessionId: _planned,
				transcriptPath: _transcriptPath,
				...scrubbed
			} = descriptor;
			// Through the LAW, not `writeAtomic` (review §1.1). Two `rmSync` unlinks sit
			// between the read above and this write — the widest RMW window in the
			// registry — so anything the daemon stamped meanwhile (a bind, a
			// failureReason, initInjectedAt) would otherwise be replayed away.
			this.write({ ...scrubbed, lifecycle: "pending" });
		}
		return ok({ released: removed.length > 0, removedPaths: removed });
	}

	/** Force a descriptor's storage paths to the HOT tier. The tier is registry
	 *  truth, never something a caller carries in a stale snapshot (review §3.1). */
	private withHotPaths(descriptor: SessionDescriptor): SessionDescriptor {
		const dataDir = join(this.pijHome, descriptor.id);
		const eventsPath = join(dataDir, "events.ndjson");
		if (descriptor.dataDir === dataDir && descriptor.eventsPath === eventsPath) return descriptor;
		return { ...descriptor, dataDir, eventsPath };
	}

	private archiveDir(): string {
		return join(this.pijHome, "archive");
	}

	private archivePathFor(id: SessionId): string {
		return join(this.archiveDir(), `${id}.json`);
	}

	private archiveIndexPath(): string {
		return join(this.archiveDir(), "index.jsonl");
	}

	private allocateCandidate(
		harness: HarnessKind,
		harnessSessionId: string,
		pijId: SessionId,
		allowLegacyDescriptor: boolean,
	): Result<CandidateAllocation> {
		const record: IdentityRecord = { kind: "identity", harness, harnessSessionId, pijId };
		const ownerPath = this.identityOwnerPath(pijId);
		const owner = this.claimOwnerRecord(ownerPath, record);
		if (!owner.ok) {
			return owner.code === "E-NOREG" && owner.message.includes("disappeared")
				? ok({ kind: "occupied" })
				: owner;
		}
		const ownerCreated = owner.value.kind === "claimed";
		if (!isIdentityRecord(owner.value.record) || !sameIdentity(owner.value.record, record)) {
			return ok({ kind: "occupied" });
		}

		const descriptor = this.read(pijId);
		if (descriptor) {
			const exact =
				descriptor.harness === harness && descriptor.harnessSessionId === harnessSessionId;
			const legacy =
				allowLegacyDescriptor &&
				descriptor.harness === undefined &&
				descriptor.harnessSessionId === undefined;
			if (!exact && !legacy) {
				this.releaseProvisionalOwner(ownerPath, record, ownerCreated);
				return ok({ kind: "occupied" });
			}
		}

		const tuple = this.claimIdentityRecord(this.identityPath(harness, harnessSessionId), record);
		if (!tuple.ok) {
			this.releaseProvisionalOwner(ownerPath, record, ownerCreated);
			return tuple;
		}
		if (sameIdentity(tuple.value.record, record)) {
			return ok({
				kind: descriptor ? "reuse" : tuple.value.kind === "claimed" ? "claimed" : "reuse",
				id: pijId,
				...(descriptor ? { descriptor } : {}),
			});
		}

		this.releaseProvisionalOwner(ownerPath, record, ownerCreated);
		return this.validateResolvedIdentity(
			harness,
			harnessSessionId,
			tuple.value.record.pijId,
			false,
		);
	}

	private validateResolvedIdentity(
		harness: HarnessKind,
		harnessSessionId: string,
		pijId: SessionId,
		allowLegacyDescriptor: boolean,
	): Result<CandidateAllocation> {
		const snapshot = this.resolveIdentitySnapshot(harness, harnessSessionId);
		if (!snapshot.ok) return snapshot;
		const descriptor = this.read(pijId) ?? snapshot.value;
		if (!descriptor) return ok({ kind: "reuse", id: pijId });
		if (descriptor.id !== pijId) {
			return err(
				"E-AMBIG",
				`durable identity ${harness}:${harnessSessionId} points to ${pijId}, but metadata belongs to ${descriptor.id}`,
			);
		}
		if (descriptor.harness === harness && descriptor.harnessSessionId === harnessSessionId) {
			return ok({ kind: "reuse", id: pijId, descriptor });
		}
		if (descriptor.harness === undefined && descriptor.harnessSessionId === undefined) {
			return allowLegacyDescriptor
				? ok({ kind: "reuse", id: pijId, descriptor })
				: ok({ kind: "occupied" });
		}
		return err(
			"E-AMBIG",
			`identity ${harness}:${harnessSessionId} resolves to incompatible descriptor ${pijId} (${descriptor.harness ?? "legacy"}:${descriptor.harnessSessionId ?? "unknown"})`,
		);
	}

	private releaseProvisionalOwner(
		ownerPath: string,
		record: IdentityRecord,
		ownerCreated: boolean,
	): void {
		if (!ownerCreated) return;
		const committed = this.resolveIdentity(record.harness, record.harnessSessionId);
		if (!committed.ok || committed.value === record.pijId) return;
		const current = this.readOwnerRecord(ownerPath);
		if (current.ok && current.value && isIdentityRecord(current.value)) {
			if (sameIdentity(current.value, record)) rmSync(ownerPath, { force: true });
		}
	}

	private claimDescriptorIdentity(
		descriptor: SessionDescriptor,
	): Result<DetailedIdentityClaim | undefined> {
		if (!descriptor.harness || !descriptor.harnessSessionId) return ok(undefined);
		return this.claimIdentityDetailed(
			descriptor.harness,
			descriptor.harnessSessionId,
			descriptor.id,
			true,
		);
	}

	private claimIdentityDetailed(
		harness: HarnessKind,
		harnessSessionId: string,
		pijId: SessionId,
		allowDescriptorOwner = false,
	): Result<DetailedIdentityClaim> {
		const record: IdentityRecord = { kind: "identity", harness, harnessSessionId, pijId };
		const createdPaths: string[] = [];
		const ownerPath = this.identityOwnerPath(pijId);
		const owner = this.claimOwnerRecord(ownerPath, record);
		if (!owner.ok) return owner;
		if (owner.value.kind === "claimed") createdPaths.push(ownerPath);
		const existingOwner = owner.value.record;
		let upgradeOwner = false;
		if (isIdentityRecord(existingOwner)) {
			if (!sameIdentity(existingOwner, record)) {
				this.rollbackIdentity(createdPaths);
				return err(
					"E-AMBIG",
					`pij id ${pijId} is already owned by ${existingOwner.harness}:${existingOwner.harnessSessionId}`,
				);
			}
		} else {
			if (!allowDescriptorOwner) {
				this.rollbackIdentity(createdPaths);
				return err("E-AMBIG", `pij id ${pijId} is reserved by another launch owner`);
			}
			const descriptor = this.read(pijId);
			const compatible =
				descriptor?.id === pijId &&
				descriptor.harness === harness &&
				(descriptor.harnessSessionId === undefined ||
					descriptor.harnessSessionId === harnessSessionId) &&
				(descriptor.plannedHarnessSessionId === undefined ||
					descriptor.plannedHarnessSessionId === harnessSessionId);
			if (!compatible) {
				this.rollbackIdentity(createdPaths);
				return err("E-AMBIG", `pij id ${pijId} is reserved by another launch owner`);
			}
			upgradeOwner = true;
		}

		const tuplePath = this.identityPath(harness, harnessSessionId);
		const tuple = this.claimIdentityRecord(tuplePath, record);
		if (!tuple.ok) {
			this.rollbackIdentity(createdPaths);
			return tuple;
		}
		if (tuple.value.kind === "claimed") createdPaths.push(tuplePath);
		if (!sameIdentity(tuple.value.record, record)) {
			this.rollbackIdentity(createdPaths);
			return err(
				"E-AMBIG",
				`identity ${harness}:${harnessSessionId} is already mapped to ${tuple.value.record.pijId}`,
			);
		}
		if (upgradeOwner) {
			try {
				this.writeAtomic(ownerPath, record);
			} catch (error) {
				this.rollbackIdentity(createdPaths);
				return err("E-NOREG", `cannot promote pij owner ${pijId}: ${String(error)}`);
			}
		}
		return ok({
			kind: tuple.value.kind === "claimed" ? "claimed" : "exists",
			id: tuple.value.record.pijId,
			createdPaths,
		});
	}

	private rollbackIdentity(paths: readonly string[]): void {
		for (const path of paths) rmSync(path, { force: true });
	}

	private claimIdentityRecord(
		path: string,
		record: IdentityRecord,
	): Result<
		| { readonly kind: "claimed"; readonly record: IdentityRecord }
		| { readonly kind: "exists"; readonly record: IdentityRecord }
	> {
		const published = this.publishNoReplace(path, record);
		if (!published.ok) return published;
		if (published.value === "claimed") return ok({ kind: "claimed", record });
		const existing = this.readIdentityRecord(path);
		if (!existing.ok) return existing;
		return existing.value
			? ok({ kind: "exists", record: existing.value })
			: err("E-NOREG", `durable identity record ${path} disappeared`);
	}

	private claimOwnerRecord(
		path: string,
		record: OwnerRecord,
	): Result<
		| { readonly kind: "claimed"; readonly record: OwnerRecord }
		| { readonly kind: "exists"; readonly record: OwnerRecord }
	> {
		const published = this.publishNoReplace(path, record);
		if (!published.ok) return published;
		if (published.value === "claimed") return ok({ kind: "claimed", record });
		const existing = this.readOwnerRecord(path);
		if (!existing.ok) return existing;
		return existing.value
			? ok({ kind: "exists", record: existing.value })
			: err("E-NOREG", `durable owner record ${path} disappeared`);
	}

	private syncIdentitySnapshot(descriptor: SessionDescriptor): void {
		if (!descriptor.harness || !descriptor.harnessSessionId) return;
		const tuplePath = this.identityPath(descriptor.harness, descriptor.harnessSessionId);
		const tuple = this.readIdentityRecord(tuplePath);
		if (!tuple.ok) throw new Error(tuple.message);
		if (!tuple.value) return; // binding not claimed yet (e.g. pre-T029 daemon bind)
		if (tuple.value.pijId !== descriptor.id) {
			throw new Error(
				`identity ${descriptor.harness}:${descriptor.harnessSessionId} belongs to ${tuple.value.pijId}, not ${descriptor.id}`,
			);
		}
		const record: IdentityRecord = { ...tuple.value, snapshot: this.scrubTick(descriptor) };
		const owner = this.claimIdentityRecord(this.identityOwnerPath(descriptor.id), record);
		if (!owner.ok) throw new Error(owner.message);
		if (!sameIdentity(owner.value.record, record)) {
			throw new Error(
				`pij id ${descriptor.id} is owned by ${owner.value.record.harness}:${owner.value.record.harnessSessionId}`,
			);
		}
		this.writeAtomic(tuplePath, record);
		this.writeAtomic(this.identityOwnerPath(descriptor.id), record);
	}

	private identityPath(harness: HarnessKind, harnessSessionId: string): string {
		return join(
			this.pijHome,
			"identities",
			"by-native",
			`${digest(`${harness}\0${harnessSessionId}`)}.json`,
		);
	}

	private identityOwnerPath(pijId: SessionId): string {
		return join(this.pijHome, "identities", "by-pij", `${digest(pijId)}.json`);
	}

	private readIdentityRecord(path: string): Result<IdentityRecord | undefined> {
		let parsed: unknown;
		try {
			parsed = JSON.parse(readFileSync(path, "utf8"));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return ok(undefined);
			return err("E-NOREG", `cannot read durable identity record ${path}`);
		}
		return isIdentityRecord(parsed)
			? ok(parsed)
			: err("E-NOREG", `malformed durable identity record ${path}`);
	}

	private readOwnerRecord(path: string): Result<OwnerRecord | undefined> {
		let parsed: unknown;
		try {
			parsed = JSON.parse(readFileSync(path, "utf8"));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return ok(undefined);
			return err("E-NOREG", `cannot read durable owner record ${path}`);
		}
		return isOwnerRecord(parsed)
			? ok(parsed)
			: err("E-NOREG", `malformed durable owner record ${path}`);
	}

	private publishNoReplace(path: string, value: unknown): Result<"claimed" | "exists"> {
		mkdirSync(dirname(path), { recursive: true });
		const tmpPath = `${path}.claim-${process.pid}-${randomUUID()}`;
		let fd: number | undefined;
		try {
			// Fully write + fsync the temp before atomic no-replace hard-link publish.
			fd = openSync(tmpPath, "wx");
			writeFileSync(fd, JSON.stringify(value));
			maybeFsyncSync(fd);
			closeSync(fd);
			fd = undefined;
			try {
				linkSync(tmpPath, path);
				return ok("claimed");
			} catch (error) {
				return (error as NodeJS.ErrnoException).code === "EEXIST"
					? ok("exists")
					: err("E-NOREG", `cannot publish claim ${path}: ${String(error)}`);
			}
		} catch (error) {
			return err("E-NOREG", `cannot stage claim ${path}: ${String(error)}`);
		} finally {
			if (fd !== undefined) closeSync(fd);
			rmSync(tmpPath, { force: true });
		}
	}

	private writeAtomic(path: string, value: unknown): void {
		writeJsonAtomic(path, value);
	}

	/** Raw descriptor read — NO tick overlay. THIS IS THE OTHER END OF THE
	 *  ACCESS-PATH DIVERGENCE documented on `overlayTick`.
	 *
	 *  A descriptor obtained here has `lastTickAt === undefined` even when the
	 *  heartbeat map holds a fresh stamp for its id. If you are debugging a
	 *  "the tick stamp vanished" symptom, this is almost certainly why: use
	 *  `read()`/`list()` when you want the reader-facing shape.
	 *
	 *  It is load-bearing that `sweepArchivable` reads through here (plan 100,
	 *  ruling (a)): archive ageing must anchor on the REAL activity axis, so a
	 *  control-plane peer's 600ms tick can no longer hold a 60-hour-dead record
	 *  in the hot tier forever. Moving the overlay into this method would silently
	 *  reinstate that — and would look like a tidy-up.
	 *
	 *  A file is admitted as a descriptor only when it has a string `id`, which is
	 *  also what keeps `tick-heartbeat.json` (deliberately shaped without one)
	 *  invisible to `list()`. */
	private readFile(path: string): SessionDescriptor | null {
		try {
			const parsed = JSON.parse(readFileSync(path, "utf8")) as SessionDescriptor;
			return typeof parsed?.id === "string" ? parsed : null;
		} catch {
			return null;
		}
	}
}

function digest(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function sameIdentity(left: IdentityRecord, right: IdentityRecord): boolean {
	return (
		left.harness === right.harness &&
		left.harnessSessionId === right.harnessSessionId &&
		left.pijId === right.pijId
	);
}

function sameDescriptorIdentity(existing: SessionDescriptor, proposed: SessionDescriptor): boolean {
	if (!proposed.harness) return existing.id === proposed.id;
	if (!proposed.harnessSessionId) {
		return (
			existing.id === proposed.id &&
			existing.harness === proposed.harness &&
			existing.harnessSessionId === undefined
		);
	}
	return (
		existing.id === proposed.id &&
		existing.harness === proposed.harness &&
		existing.harnessSessionId === proposed.harnessSessionId
	);
}

function descriptorOwner(record: ReservationRecord | DescriptorOwnerRecord): DescriptorOwnerRecord {
	return {
		kind: "descriptor",
		pijId: record.pijId,
		ownerToken: record.ownerToken,
		ownerPid: record.ownerPid,
		createdAt: record.createdAt,
	};
}

/** Bytes on disk under `dir`, best-effort. Reported so a prune log can say WHAT
 *  it reclaimed rather than only how many records it touched — 2,000 empty stubs
 *  and one 94 MB seat are the same count and very different events. */
function directoryBytes(dir: string): number {
	let total = 0;
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return 0;
	}
	for (const entry of entries) {
		const full = join(dir, entry);
		try {
			const stat = statSync(full);
			total += stat.isDirectory() ? directoryBytes(full) : stat.size;
		} catch {
			// Unreadable entry contributes nothing rather than failing the sweep.
		}
	}
	return total;
}

function fileBytes(path: string): number {
	try {
		return statSync(path).size;
	} catch {
		return 0;
	}
}
