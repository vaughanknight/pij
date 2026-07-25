// pij-control-plane — daemon runtime-axis tracker (plan 054 P2 T008).
//
// The daemon-side owner of the WS-6 mechanical axis (AC-04): per tick, per
// node, derive `systemStateOf` from REAL probes (pid, pane suspension,
// descriptor working/idle telemetry, event age), persist a changed verdict
// through the merge-law write, and append a `system-state` spine event with
// `actor: daemon` for every TRANSITION (V-05) — anomaly evidence chains to
// these events.
//
// Discipline (the folded critic finding):
//  • The descriptor write NEVER waits on the spine — mechanical truth first.
//  • The transition latch flips ONLY after a successful append: an append,
//    lock, or recovery failure skips honestly and the next tick retries, so
//    a transient fault never loses a V-05 event and a quiet tick never spams.
//    (A daemon crash BETWEEN descriptor write and append can drop one
//    telemetry event — documented: the axis truth is the descriptor, and
//    the restart latch seeds from disk so no phantom re-append occurs.)
//  • The append is UNCOUPLED (no state rides on it → no journal entry of its
//    own) but runs under the platform write lock AFTER the recovery gate,
//    exactly like `spine append`: it must not causally overtake a pending
//    predecessor. A contended lock or blocked recovery SKIPS the append for
//    this tick — logged once per outage, never a stalled delivery loop (the
//    lock is synchronous and never waited on here).

import { recoverPendingOps } from "../platform/journal.js";
import type {
	AllocationStorePort,
	AssignmentStorePort,
	DispatchStorePort,
	FenceStorePort,
	OpJournalPort,
	PlatformWriteLockPort,
	ProjectStorePort,
	SpineLogPort,
} from "../platform/ports.js";
import { buildSpineEvent } from "../platform/spine.js";
import { SPINE_KIND_SYSTEM_STATE } from "../platform/types.js";
import type { RegistryPort } from "../ports.js";
import { persistDaemonWrite } from "../registry-write.js";
import { STALE_AFTER_MS, systemStateOf } from "../state.js";
import type { SessionDescriptor, SystemState } from "../types.js";
import { err, ok, type Result } from "../types.js";

export interface RuntimeAxisDeps {
	readonly registry: RegistryPort;
	readonly spineLog: SpineLogPort;
	readonly opJournal: OpJournalPort;
	readonly projectStore: ProjectStorePort;
	readonly assignmentStore: AssignmentStorePort;
	readonly allocationStore: AllocationStorePort;
	readonly fenceStore: FenceStorePort;
	readonly dispatchStore: DispatchStorePort;
	readonly platformWriteLock: PlatformWriteLockPort;
	readonly now: () => number;
	readonly isAlive: (pid: number) => boolean;
	/** Pane-process suspension probe (SIGSTOP'd → stopped). `null` = probe
	 *  unavailable — honest missing telemetry, never coerced to false. */
	readonly isSuspended: (pid: number) => boolean | null;
	readonly log: (line: string) => void;
	readonly staleAfterMs?: number;
}

export class RuntimeAxisTracker {
	/** Per-session LAST APPENDED verdict — the V-05 latch. Seeded on first
	 *  observation from the persisted descriptor, so a daemon restart never
	 *  re-appends the current state. */
	private readonly appended = new Map<string, SystemState | undefined>();
	/** One skip log per append outage per session (reset on success). */
	private readonly skipLogged = new Set<string>();

	constructor(private readonly deps: RuntimeAxisDeps) {}

	tick(descriptors: readonly SessionDescriptor[]): void {
		for (const descriptor of descriptors) {
			try {
				this.drive(descriptor);
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				this.deps.log(`runtime-axis ${descriptor.id}: error ${detail}`);
			}
		}
	}

	private drive(descriptor: SessionDescriptor): void {
		const inputs = this.inputsFor(descriptor);
		const verdict = systemStateOf(inputs);
		// Latch seeds from disk BEFORE this tick's write: only genuine
		// transitions (including ones missed while the daemon was down) append.
		if (!this.appended.has(descriptor.id)) {
			this.appended.set(descriptor.id, descriptor.systemState);
		}
		// Mechanical truth first — never gated on the spine.
		if (descriptor.systemState !== verdict) {
			persistDaemonWrite(this.deps.registry, { ...descriptor, systemState: verdict });
		}
		const latched = this.appended.get(descriptor.id);
		if (latched === verdict) return;
		const appended = this.appendTransition(descriptor, latched, verdict, inputs);
		if (appended.ok) {
			this.appended.set(descriptor.id, verdict);
			this.skipLogged.delete(descriptor.id);
		} else if (!this.skipLogged.has(descriptor.id)) {
			this.skipLogged.add(descriptor.id);
			this.deps.log(
				`runtime-axis ${descriptor.id}: ${latched ?? "(none)"}→${verdict} event skipped (${appended.message}) — retrying next tick`,
			);
		}
	}

	private inputsFor(descriptor: SessionDescriptor): Parameters<typeof systemStateOf>[0] {
		const lastEventMs =
			descriptor.lastEventAt === undefined ? Number.NaN : Date.parse(descriptor.lastEventAt);
		return {
			lifecycle: descriptor.lifecycle,
			pidAlive: this.deps.isAlive(descriptor.pid),
			paneSuspended: descriptor.paneId === undefined ? null : this.deps.isSuspended(descriptor.pid),
			state: descriptor.state,
			latestEventAgeMs: Number.isNaN(lastEventMs) ? null : this.deps.now() - lastEventMs,
			staleAfterMs: this.deps.staleAfterMs ?? STALE_AFTER_MS,
		};
	}

	/** Uncoupled append under lock + recovery gate (the spine-append shape). */
	private appendTransition(
		descriptor: SessionDescriptor,
		prev: SystemState | undefined,
		next: SystemState,
		inputs: Parameters<typeof systemStateOf>[0],
	): Result<void> {
		const d = this.deps;
		const locked = d.platformWriteLock.withPlatformWriteLock((): Result<void> => {
			const recovered = recoverPendingOps(
				d.opJournal,
				d.spineLog,
				d.projectStore,
				d.assignmentStore,
				d.allocationStore,
				d.fenceStore,
				d.dispatchStore,
			);
			if (!recovered.ok) return recovered;
			const draft = buildSpineEvent({
				nowMs: d.now(),
				actor: "daemon",
				kind: SPINE_KIND_SYSTEM_STATE,
				refs: [
					`node:${descriptor.id}`,
					// Honest-unknown provenance (AC-04): say WHY the axis is unknown.
					...(next === "unknown"
						? [inputs.pidAlive === null ? "reason:missing-pid-probe" : "reason:missing-telemetry"]
						: []),
				],
				peer: descriptor.id,
				prev,
				next,
				actorProvenance: "resolved",
			});
			if (!draft.ok) return draft;
			const appendedEvent = d.spineLog.append(draft.value);
			if (!appendedEvent.ok) return appendedEvent;
			return ok(undefined);
		});
		if (!locked.ok) return err(locked.code, locked.message);
		return locked.value;
	}
}
