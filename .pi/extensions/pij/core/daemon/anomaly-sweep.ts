// pij-control-plane — daemon anomaly alerts (plan 054 P2 T010, AC-07).
//
// BatonSweep-pattern composition: per tick, run the pure anomaly queries
// over registry + assignment store + spine and push ONE alert per anomaly
// TRANSITION to the node's effectiveParent (parentId ?? spawnedBy). The
// latch keys on kind + assignment + evidence seqs, so a quiet tick never
// re-alerts and fresh evidence (a new unverified done after a verify) alerts
// again. Alert once, act NEVER — remediation is a human/prime decision.

import { type Anomaly, detectAnomalies } from "../anomalies.js";
import type { AssignmentStorePort, SpineLogPort } from "../platform/ports.js";
import type { DeliveryPort, RegistryPort } from "../ports.js";
import { effectiveParent } from "../tree.js";

export interface AnomalySweepDeps {
	readonly registry: RegistryPort;
	readonly assignmentStore: AssignmentStorePort;
	readonly spineLog: SpineLogPort;
	readonly delivery: DeliveryPort;
	readonly now: () => number;
	readonly idleThresholdMs?: number;
}

export interface AnomalySweepSummary {
	/** Alerts actually delivered this tick (latched-out repeats excluded). */
	readonly alerts: number;
	/** Anomalies currently detected, delivered or not. */
	readonly anomalies: number;
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
		const anomalies = detectAnomalies({
			descriptors,
			assignments: d.assignmentStore.list(),
			events: d.spineLog.read(),
			nowMs: d.now(),
			...(d.idleThresholdMs === undefined ? {} : { idleThresholdMs: d.idleThresholdMs }),
		});
		const byId = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));
		let alerts = 0;
		for (const anomaly of anomalies) {
			const key = latchKeyOf(anomaly);
			if (this.alerted.has(key)) continue;
			const node = byId.get(anomaly.nodeId);
			const parent = node === undefined ? null : effectiveParent(node);
			// A parentless root has nobody to alert; latch anyway so a later
			// link doesn't replay stale alerts.
			this.alerted.add(key);
			if (parent === null || node === undefined) continue;
			d.delivery.deliver({
				from: anomaly.nodeId,
				to: parent,
				body: `⚠️ anomaly ${anomaly.kind} on ${anomaly.nodeId}${anomaly.assignmentId ? ` (assignment ${anomaly.assignmentId})` : ""}: ${anomaly.detail} — evidence: spine ${anomaly.evidence.join(", ") || "(none)"}`,
			});
			alerts += 1;
		}
		return { alerts, anomalies: anomalies.length };
	}
}
