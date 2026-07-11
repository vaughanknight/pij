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
	readonly harness: HarnessKind;
	readonly harnessSessionId: string;
	readonly pijId: SessionId;
	/** Presence-independent metadata used to hydrate a removed live descriptor. */
	readonly snapshot?: SessionDescriptor;
}

interface DetailedIdentityClaim {
	readonly kind: "claimed" | "exists";
	readonly id: SessionId;
	readonly createdPaths: readonly string[];
}

function isHarnessKind(value: unknown): value is HarnessKind {
	return value === "pi" || value === "claude" || value === "copilot" || value === "codex";
}

function isIdentityRecord(value: unknown): value is IdentityRecord {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	const snapshot = record.snapshot;
	return (
		isHarnessKind(record.harness) &&
		typeof record.harnessSessionId === "string" &&
		typeof record.pijId === "string" &&
		(snapshot === undefined ||
			(typeof snapshot === "object" &&
				snapshot !== null &&
				typeof (snapshot as Record<string, unknown>).id === "string"))
	);
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

	private claimDescriptorIdentity(
		descriptor: SessionDescriptor,
	): Result<DetailedIdentityClaim | undefined> {
		if (!descriptor.harness || !descriptor.harnessSessionId) return ok(undefined);
		return this.claimIdentityDetailed(
			descriptor.harness,
			descriptor.harnessSessionId,
			descriptor.id,
		);
	}

	private claimIdentityDetailed(
		harness: HarnessKind,
		harnessSessionId: string,
		pijId: SessionId,
	): Result<DetailedIdentityClaim> {
		const record: IdentityRecord = { harness, harnessSessionId, pijId };
		const createdPaths: string[] = [];
		const ownerPath = this.identityOwnerPath(pijId);
		const owner = this.claimIdentityRecord(ownerPath, record);
		if (!owner.ok) return owner;
		if (owner.value.kind === "claimed") createdPaths.push(ownerPath);
		if (!sameIdentity(owner.value.record, record)) {
			this.rollbackIdentity(createdPaths);
			return err(
				"E-AMBIG",
				`pij id ${pijId} is already owned by ${owner.value.record.harness}:${owner.value.record.harnessSessionId}`,
			);
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
	if (!proposed.harness || !proposed.harnessSessionId) return existing.id === proposed.id;
	return (
		existing.id === proposed.id &&
		existing.harness === proposed.harness &&
		existing.harnessSessionId === proposed.harnessSessionId
	);
}
