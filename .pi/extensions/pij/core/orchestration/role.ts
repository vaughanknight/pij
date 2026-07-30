// pij-orchestration — stored role designation, total projection, and audit append.

import type { PlatformWriteLockPort, SpineLogPort } from "../platform/ports.js";
import { buildSpineEvent } from "../platform/spine.js";
import type { SPINE_KIND_PRIME_SET, SPINE_KIND_ROLE_SET } from "../platform/types.js";
import type { RegistryPort } from "../ports.js";
import { err, ok, type Result, type SessionDescriptor, type SessionId } from "../types.js";

/** The orchestration role persisted on a session descriptor.
 *
 * Stored and projected roles are intentionally different: `"prime"` is NEVER
 * stored here. Prime-ness remains `SessionDescriptor.prime?: boolean`, owned by
 * PrimeService; projections join that flag with this stored partial role.
 */
export type StoredOrchestrationRole = "pm" | "worker";

/** The total orchestration role exposed by projections. */
export type OrchestrationRole = "prime" | StoredOrchestrationRole;

type Exact<Left, Right> =
	(<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
		? true
		: false;
type Assert<Condition extends true> = Condition;

/** Compiled invariants: widening either alias collapses store-partial/project-total. */
export type StoredOrchestrationRoleExactnessInvariant = Assert<
	Exact<StoredOrchestrationRole, "pm" | "worker">
>;
export type OrchestrationRoleExactnessInvariant = Assert<
	Exact<OrchestrationRole, "prime" | "pm" | "worker">
>;

type RoleProjectionSource = Pick<SessionDescriptor, "prime" | "orchestrationRole">;

export function projectOrchestrationRole(
	descriptor: RoleProjectionSource,
): OrchestrationRole | null {
	return descriptor.prime === true ? "prime" : (descriptor.orchestrationRole ?? null);
}

export function hasRoleConflict(descriptor: RoleProjectionSource): boolean {
	return descriptor.prime === true && descriptor.orchestrationRole !== undefined;
}

export interface RoleChange {
	readonly id: SessionId;
	readonly previousRole: StoredOrchestrationRole | undefined;
	readonly role: StoredOrchestrationRole | undefined;
	readonly changed: boolean;
}

export class RoleService {
	constructor(private readonly registry: RegistryPort) {}

	set(id: SessionId, role: StoredOrchestrationRole): Result<RoleChange> {
		return this.update(id, role);
	}

	unset(id: SessionId): Result<RoleChange> {
		return this.update(id, undefined);
	}

	private update(id: SessionId, role: StoredOrchestrationRole | undefined): Result<RoleChange> {
		const descriptor = this.registry.read(id);
		if (!descriptor) return err("E-NOID", `no session '${id}' in registry`);
		const previousRole = descriptor.orchestrationRole;
		const changed = previousRole !== role;
		// Declares "cli": RoleService OWNS orchestrationRole, so its computed value
		// must win. Without the declaration the write law would restore disk and
		// the verb would silently no-op.
		if (changed) {
			const updated = { ...descriptor, orchestrationRole: role };
			if (role === undefined) delete updated.orchestrationRole;
			this.registry.write(updated, "cli");
		}
		return ok({ id, previousRole, role, changed });
	}
}

export type DesignationAuditKind = typeof SPINE_KIND_ROLE_SET | typeof SPINE_KIND_PRIME_SET;
export type DesignationWord = OrchestrationRole | "old-prime";

export interface DesignationAuditInput {
	readonly kind: DesignationAuditKind;
	readonly id: SessionId;
	readonly prev?: DesignationWord;
	readonly next?: DesignationWord;
}

export interface DesignationAuditPort {
	append(input: DesignationAuditInput): Result<number>;
}

export interface DesignationAuditDeps {
	readonly spineLog: SpineLogPort;
	readonly platformWriteLock: PlatformWriteLockPort;
	readonly recover: () => Result<unknown>;
	readonly now: () => number;
	readonly actor: string;
}

/** Uncoupled designation history: descriptor truth lands first; this append is audit only. */
export class DesignationAuditService implements DesignationAuditPort {
	constructor(private readonly deps: DesignationAuditDeps) {}

	append(input: DesignationAuditInput): Result<number> {
		const locked = this.deps.platformWriteLock.withPlatformWriteLock((): Result<number> => {
			const recovered = this.deps.recover();
			if (!recovered.ok) return recovered;
			const draft = buildSpineEvent({
				nowMs: this.deps.now(),
				actor: this.deps.actor,
				kind: input.kind,
				refs: [`node:${input.id}`],
				peer: input.id,
				...(input.prev === undefined ? {} : { prev: input.prev }),
				...(input.next === undefined ? {} : { next: input.next }),
			});
			if (!draft.ok) return draft;
			const event = this.deps.spineLog.append(draft.value);
			return event.ok ? ok(event.value.seq) : event;
		});
		return locked.ok ? locked.value : locked;
	}
}
