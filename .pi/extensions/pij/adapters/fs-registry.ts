// pij-messaging — fs RegistryPort adapter.
//
// One live descriptor per session at `<pijHome>/<id>.json`; durable native
// identity records live below `<pijHome>/identities/` so presence can disappear
// without losing the harness-native ↔ pij-id join.

import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	fsyncSync,
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
import { memorablePijIdCandidates } from "../core/memorable-id.js";
import type { RegistryPort } from "../core/ports.js";
import {
	err,
	type HarnessKind,
	ok,
	type Result,
	type SessionDescriptor,
	type SessionId,
} from "../core/types.js";

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

	read(id: SessionId): SessionDescriptor | null {
		return this.readFile(this.pathFor(id));
	}

	write(descriptor: SessionDescriptor): void {
		const existing = this.read(descriptor.id);
		if (
			existing?.lifecycle === "dissolved" &&
			descriptor.lifecycle !== undefined &&
			descriptor.lifecycle !== "dissolved" &&
			descriptor.pid === existing.pid
		) {
			return;
		}
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
		const existing = this.read(id);
		if (!existing || existing.lifecycle === "dissolved") return;
		this.write({ ...existing, lifecycle: "dissolved", state: "idle" });
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
			fsyncSync(fd);
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
		mkdirSync(dirname(path), { recursive: true });
		const tmpPath = `${path}.tmp-${process.pid}`;
		writeFileSync(tmpPath, JSON.stringify(value));
		renameSync(tmpPath, path);
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
