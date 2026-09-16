// pij-orchestration — holder liveness classification + daemon sweep coordinator.

import {
	type BatonHolderHealth,
	type BatonLease,
	type BatonNoticeSink,
	type BatonResult,
	BatonService,
	type BatonStorePort,
	batonOk,
	type HolderTransitionDecision,
	planHolderTransition,
} from "../orchestration/baton.js";
import type { RegistryPort } from "../ports.js";
import { STALE_AFTER_MS } from "../state.js";
import type { SessionDescriptor } from "../types.js";

export function classifyBatonHolder(
	descriptor: SessionDescriptor | null,
	isAlive: (pid: number) => boolean,
	nowMs: number,
	staleAfterMs: number = STALE_AFTER_MS,
): "healthy" | "dead" | "stalled" | "unknown" {
	if (!descriptor) return "unknown";
	if (descriptor.lifecycle === "dissolved" || !isAlive(descriptor.pid)) return "dead";
	if (descriptor.state !== "working") return "healthy";
	if (!descriptor.lastEventAt) return "stalled";
	const eventMs = Date.parse(descriptor.lastEventAt);
	if (Number.isNaN(eventMs)) return "stalled";
	return nowMs - eventMs > staleAfterMs ? "stalled" : "healthy";
}

export function evaluateBatonSweep(
	lease: BatonLease,
	previous: BatonHolderHealth | undefined,
	descriptor: SessionDescriptor | null,
	isAlive: (pid: number) => boolean,
	nowMs: number,
): HolderTransitionDecision {
	return planHolderTransition(lease, previous, classifyBatonHolder(descriptor, isAlive, nowMs));
}

export interface BatonSweepDeps {
	readonly store: BatonStorePort;
	readonly registry: RegistryPort;
	readonly notices: BatonNoticeSink;
	readonly isAlive: (pid: number) => boolean;
	readonly now: () => number;
}

export class BatonSweep {
	private readonly service: BatonService;

	constructor(private readonly deps: BatonSweepDeps) {
		this.service = new BatonService({
			store: deps.store,
			notices: deps.notices,
			now: deps.now,
			newId: () => "sweep",
		});
	}

	tick(): BatonResult<{ readonly alerts: number }> {
		const definitions = this.deps.store.listDefinitions();
		if (!definitions.ok) return definitions;
		let alerts = 0;
		for (const definition of definitions.value) {
			const lease = this.deps.store.readLease(definition.name);
			if (!lease.ok) return lease;
			if (!lease.value) continue;
			const descriptor = this.deps.registry.read(lease.value.holder);
			const health = classifyBatonHolder(descriptor, this.deps.isAlive, this.deps.now());
			const observed = this.service.observeHolder(definition.name, health);
			if (!observed.ok) return observed;
			if (observed.value.kind === "alert") alerts += 1;
		}
		return batonOk({ alerts });
	}
}
