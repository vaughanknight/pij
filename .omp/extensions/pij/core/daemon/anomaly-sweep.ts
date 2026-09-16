// pij-control-plane — daemon anomaly alerts (plan 054 P2 T010, AC-07).
//
// BatonSweep-pattern composition: per tick, run the pure anomaly queries
// over registry + assignment store + spine and push ONE alert per anomaly
// TRANSITION to the node's effectiveParent (parentId ?? spawnedBy), falling
// back to the assignment's project prime for a parentless node (s057
// dogfood); a recipient-less transition is COUNTED and logged, never silent.
// The latch keys on kind + assignment + evidence seqs, so a quiet tick never
// re-alerts and fresh evidence (a new unverified done after a verify) alerts
// again. Alert once, act NEVER — remediation is a human/prime decision.

import {
	type ActivityCredibility,
	type ActivityCredibilityInput,
	type Anomaly,
	detectAnomalies,
	type WatchdogSubscriptionInputs,
} from "../anomalies.js";
import type { AssignmentStorePort, ProjectStorePort, SpineLogPort } from "../platform/ports.js";
import type { DeliveryPort, RegistryPort } from "../ports.js";
import { effectiveParent } from "../tree.js";

export interface AnomalySweepDeps {
	readonly registry: RegistryPort;
	readonly assignmentStore: AssignmentStorePort;
	readonly spineLog: SpineLogPort;
	readonly delivery: DeliveryPort;
	readonly now: () => number;
	readonly idleThresholdMs?: number;
	/** Recipient fallback (s057 dogfood): a parentless node's alert goes to
	 *  its assignment's project prime when one is on record. Optional —
	 *  absent keeps the parent-only behavior. */
	readonly projectStore?: ProjectStorePort;
	/** Honest-drop surface: one line per recipient-less transition. */
	readonly log?: (line: string) => void;
	/** Watchdog wiring as a PLAIN PROJECTION, supplied per tick.
	 *
	 *  Without this the sweep called `detectAnomalies` with no `watchdog` at all,
	 *  so `inert-subscription` had NEVER fired in the daemon in any of its forms
	 *  — it surfaced only when a human ran `pij anomalies`. A detector that only
	 *  runs when someone already suspects a problem is not an alarm.
	 *
	 *  A SUPPLIER rather than a value because the projection changes every tick,
	 *  and a projection rather than a store handle so the sweep stays as free of
	 *  I/O plumbing as it is today (the `cli.ts` precedent builds the same shape
	 *  at the I/O edge). Optional: absent ⇒ behaviour byte-identical to today. */
	readonly watchdog?: () => WatchdogSubscriptionInputs | undefined;
	/** `s095`'s activity-credibility predicate, injected rather than imported —
	 *  `core/state.ts` is another stream's file. Optional by construction, and
	 *  absent means the dead-recipient row CANNOT fire: "wiring absent" and "no
	 *  row" are deliberately the same observable, so a half-wired call site is
	 *  detectable rather than a silent half-detector. */
	readonly activityCredibility?: (input: ActivityCredibilityInput) => ActivityCredibility;
}

export interface AnomalySweepSummary {
	/** Alerts actually delivered this tick (latched-out repeats excluded). */
	readonly alerts: number;
	/** Anomalies currently detected, delivered or not. */
	readonly anomalies: number;
	/** Recipient-less anomalies this tick (no effective parent, no project
	 *  prime) — latched like any transition, surfaced instead of silent. */
	readonly dropped: number;
}

function latchKeyOf(anomaly: Anomaly): string {
	return `${anomaly.kind}:${anomaly.assignmentId ?? anomaly.nodeId}:${anomaly.evidence.join(",")}`;
}

export class AnomalySweep {
	/** Evidence-keyed once-per-transition latch. */
	private readonly alerted = new Set<string>();

	constructor(private readonly deps: AnomalySweepDeps) {}

	tick(): AnomalySweepSummary {
		const d = this.deps;
		const descriptors = d.registry.list();
		const assignments = d.assignmentStore.list();
		const watchdog = d.watchdog?.();
		const anomalies = detectAnomalies({
			descriptors,
			assignments,
			events: d.spineLog.read(),
			nowMs: d.now(),
			// Resolves the watchers `list()` cannot: a `lifecycle: "dissolved"`
			// seat is deliberately omitted from the hot tier, so #154's own
			// motivating case — `pij-continuing-ermine` watched only by the
			// dissolved `pij-respectable-starfish` — bucketed as `unknown` and
			// produced no row. `read()` is hot-first then ONE direct archive path
			// (`adapters/fs-registry.ts`), never a glob, and the detector asks only
			// for the watcher ids it already holds and only on a hot-tier miss.
			//
			// Supplied here rather than injected as another optional dep ON PURPOSE:
			// the sweep already owns this registry, and an optional wire is one more
			// thing a future call site can forget — which is the exact class of
			// defect this stream exists to remove.
			resolveRetired: (id) => d.registry.read(id) ?? undefined,
			...(d.idleThresholdMs === undefined ? {} : { idleThresholdMs: d.idleThresholdMs }),
			...(watchdog === undefined ? {} : { watchdog }),
			...(d.activityCredibility === undefined
				? {}
				: { activityCredibility: d.activityCredibility }),
		});
		const byId = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));
		const byAssignment = new Map(assignments.map((assignment) => [assignment.id, assignment]));
		let alerts = 0;
		let dropped = 0;
		for (const anomaly of anomalies) {
			const key = latchKeyOf(anomaly);
			if (this.alerted.has(key)) continue;
			const node = byId.get(anomaly.nodeId);
			// Latch BEFORE any delivery decision — once per transition covers
			// push AND drop, and a later link doesn't replay stale alerts.
			this.alerted.add(key);
			let target = node === undefined ? null : effectiveParent(node);
			// Recipient fallback (s057 dogfood): a parentless node's anomaly
			// goes to its assignment's project prime, when one is on record.
			if (target === null && anomaly.assignmentId !== undefined) {
				const slug = byAssignment.get(anomaly.assignmentId)?.projectSlug;
				if (slug !== undefined) target = d.projectStore?.read(slug)?.primeId ?? null;
			}
			if (target === null) {
				// Nobody to alert — surface the drop (count + one log line per
				// transition, the latch already fired), never act on it.
				dropped += 1;
				d.log?.(`anomaly alert dropped (no effective parent, no project prime): ${key}`);
				continue;
			}
			d.delivery.deliver({
				from: anomaly.nodeId,
				to: target,
				body: `⚠️ anomaly ${anomaly.kind} on ${anomaly.nodeId}${anomaly.assignmentId ? ` (assignment ${anomaly.assignmentId})` : ""}: ${anomaly.detail} — evidence: spine ${anomaly.evidence.join(", ") || "(none)"}`,
			});
			alerts += 1;
		}
		return { alerts, anomalies: anomalies.length, dropped };
	}
}
