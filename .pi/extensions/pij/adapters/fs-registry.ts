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
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
	type ArchiveIndexEntry,
	buildArchiveIndexEntry,
	classifyRegistryRecord,
	parseArchiveIndexLine,
} from "../core/archive.js";
import { memorablePijIdCandidates } from "../core/memorable-id.js";
import type { ArchiveOutcome, RegistryPort } from "../core/ports.js";
import { applyWriteLaw, type DescriptorWriter } from "../core/registry-write.js";
import {
	err,
	type HarnessKind,
	ok,
	type Result,
	type SessionDescriptor,
	type SessionId,
} from "../core/types.js";
import { maybeFsyncSync, writeJsonAtomic } from "./atomic-file.js";

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
	constructor(private readonly pijHome: string) {}

	private pathFor(id: SessionId): string {
		return join(this.pijHome, `${id}.json`);
	}

	list(): SessionDescriptor[] {
		let names: string[];
		try {
			names = readdirSync(this.pijHome);
		} catch {
			return [];
		}
		const out: SessionDescriptor[] = [];
		for (const name of names) {
			if (!name.endsWith(".json")) continue;
			const descriptor = this.readFile(join(this.pijHome, name));
			if (descriptor && descriptor.lifecycle !== "dissolved") out.push(descriptor);
		}
		return out;
	}

	/** Hot-first, then the archive by DIRECT path (plan 071 D1). The archive is
	 *  never globbed or listed here: `<pijHome>/archive/<id>.json` is one stat,
	 *  so a keyed lookup stays O(1) no matter how many corpses are archived. */
	read(id: SessionId): SessionDescriptor | null {
		return this.readFile(this.pathFor(id)) ?? this.readFile(this.archivePathFor(id));
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
		this.publish(descriptor, writer, false);
	}

	/** Exact last-write-wins, NO merge — see `RegistryPort.writeExact`. The only
	 *  correct use is deliberately CLEARING a contested field. */
	writeExact(descriptor: SessionDescriptor): void {
		this.publish(descriptor, undefined, true);
	}

	private publish(
		descriptor: SessionDescriptor,
		writer: DescriptorWriter | undefined,
		exact: boolean,
	): void {
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
		const existing = this.read(descriptor.id);
		if (
			existing?.lifecycle === "dissolved" &&
			descriptor.lifecycle !== undefined &&
			descriptor.lifecycle !== "dissolved"
		) {
			return;
		}
		// Reuses the `existing` the tombstone guard just read — the merge is free.
		const proposed = exact ? descriptor : applyWriteLaw(descriptor, existing, writer);
		descriptor = proposed;
		const identity = this.claimDescriptorIdentity(descriptor);
		if (!identity.ok) throw new Error(identity.message);
		try {
			this.writeAtomic(this.pathFor(descriptor.id), descriptor);
		} catch (error) {
			if (identity.value) this.rollbackIdentity(identity.value.createdPaths);
			throw error;
		}
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
			this.writeAtomic(this.pathFor(revived.id), revived);
			this.syncIdentitySnapshot(revived);
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
		const published = this.publishNoReplace(finalPath, descriptor);
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
			this.writeAtomic(this.archivePathFor(id), archived);
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
		this.writeAtomic(this.pathFor(id), revived);
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
		const record: IdentityRecord = { ...tuple.value, snapshot: descriptor };
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
