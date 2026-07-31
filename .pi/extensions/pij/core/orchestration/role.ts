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
/** The stored role vocabulary, as DATA.
 *
 * The type is derived FROM this array rather than declared beside it, because a
 * type and a hand-written validator drift silently: `role !== "pm" && role !==
 * "worker"` compares a `string`, so widening a union produces ZERO compile
 * errors at every parser that guards on literals. That is exactly how `pa`
 * became a legal type and an illegal argument. Deriving the type from the array
 * makes the vocabulary single-sourced: a new member is admitted by the guard and
 * named in the usage text by construction, not by remembering.
 */
export const STORED_ORCHESTRATION_ROLES = ["pm", "worker", "pa"] as const;

export type StoredOrchestrationRole = (typeof STORED_ORCHESTRATION_ROLES)[number];

/** Runtime admission for the stored vocabulary — the ONLY parser-side guard. */
export function isStoredOrchestrationRole(value: unknown): value is StoredOrchestrationRole {
	return (
		typeof value === "string" && (STORED_ORCHESTRATION_ROLES as readonly string[]).includes(value)
	);
}

/** `pm|worker|pa` — the vocabulary rendered for usage and error text. */
export const STORED_ROLE_CHOICES = STORED_ORCHESTRATION_ROLES.join("|");

/** The total orchestration role exposed by projections. */
export type OrchestrationRole = "prime" | StoredOrchestrationRole;

type Exact<Left, Right> =
	(<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
		? true
		: false;
type Assert<Condition extends true> = Condition;

/** Compiled invariants: widening either alias collapses store-partial/project-total. */
export type StoredOrchestrationRoleExactnessInvariant = Assert<
	Exact<StoredOrchestrationRole, "pm" | "worker" | "pa">
>;
export type OrchestrationRoleExactnessInvariant = Assert<
	Exact<OrchestrationRole, "prime" | "pm" | "worker" | "pa">
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

type CardSource = RoleProjectionSource & Pick<SessionDescriptor, "statusAt">;

/** Does this seat OWE a status card — i.e. may it be CHASED for one?
 *
 * PM only (Jordan's ruling, 2026-07-30). A card exists so a layer above can see
 * progress without asking; a PM reports up to a prime, so its card is
 * load-bearing. A PRIME reports up to its human in-pane, conversationally — a
 * card there duplicates a richer channel that already exists. A worker's card
 * renders nowhere at all.
 *
 * This drives NUDGING and the never-reported fallback ONLY. It deliberately does
 * NOT drive staleness alerting — see `cardCanMislead`, and do not merge the two:
 * that conflation is exactly what put a card obligation on five primes.
 */
export function owesStatusCard(descriptor: RoleProjectionSource): boolean {
	return projectOrchestrationRole(descriptor) === "pm";
}

/** Can this seat's card MISLEAD a reader if it goes stale?
 *
 * True for ANY rendered seat that actually carries a card, regardless of whether
 * it owed one. The asymmetry with `owesStatusCard` is the whole point: **the
 * consumer cannot tell who was obliged to write it.** A rotten card misinforms
 * identically either way, so a prime that VOLUNTARILY writes one has put itself
 * in the render surface and is held to freshness from then on — writing the card
 * is the act that creates the expectation.
 *
 * Not hypothetical: on 2026-07-30 a prime wrote a real card, let it rot 43min
 * past threshold, and was correctly flagged. A blanket role exclusion would have
 * left that unpoliced on the seat with the widest readership.
 *
 * DESIGNED ASYMMETRY WITH THE RAIL (ruled, spine 25457) — do not "reconcile" it:
 * chainglass renders a prime card's AGE but never applies the stale LABEL, while
 * this predicate keeps `pij anomalies` raising status-stale for the same seat.
 * Both are correct because the consumers differ. A row here is NOT an accusation
 * from above: a prime has no supervisor, so the only party who can act on it is
 * the prime itself running its own unscoped sweep. It is SELF-SERVICE signal —
 * nobody is nudged, nobody is chased, but the seat can see its own rot. The LABEL
 * is what would imply a watchdog obligation, which is why the rail withholds it
 * and this does not.
 *
 * `statusAt === undefined` means nothing renders, so nothing can mislead — that
 * is what makes the never-reported prime a non-event rather than a false positive.
 *
 * Note this is `prime || pm`, NOT `role !== null`. The predicate it replaced used
 * the latter, which let an explicitly-stamped `worker` through even though the
 * comment beside it claimed workers were excluded — a stamped worker's card
 * renders nowhere, exactly like an unstamped seat's, and the watchdog already
 * agrees (its eligibility gate is `pm || prime`).
 */
export function cardCanMislead(descriptor: CardSource): boolean {
	if (descriptor.statusAt === undefined) return false;
	const role = projectOrchestrationRole(descriptor);
	return role === "prime" || role === "pm";
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
