// Pure cross-harness terminal-absence reconciliation. It does not infer cause:
// `unrequested-by-pij` means only that an observed absence lacked close intent.

import {
	applyTerminalObservation,
	DEFAULT_SPAWN_EXPECTATION_TTL_MS,
	latchTerminalNotice,
} from "../spawn-expectation.js";
import type { DeathReason, SessionDescriptor, SpawnExpectation } from "../types.js";

export interface DeathNotice {
	readonly to: string;
	readonly from: string;
	readonly text: string;
	/** False for this tick's live observation; historical evidence is never relabelled. */
	readonly historical: boolean;
}

export interface DeathReconcileInput {
	readonly descriptors: readonly SessionDescriptor[];
	readonly expectations: readonly SpawnExpectation[];
	readonly nowIso: string;
	readonly isAlive: (pid: number) => boolean;
	/** Optional because a PID observation is enough for registered descriptors. */
	readonly paneExists?: (paneId: string) => boolean;
	/** Compatibility projection for existing diagnostics; never changes disposition. */
	readonly failureReasonFor?: (descriptor: SessionDescriptor) => DeathReason;
	/** First sweep after daemon construction reconciles durable history, not a live event. */
	readonly historical?: boolean;
}

export interface DeathReconcileResult {
	readonly descriptorUpdates: readonly SessionDescriptor[];
	readonly expectationUpdates: readonly SpawnExpectation[];
	readonly notices: readonly DeathNotice[];
	/** Notices withheld because the RECIPIENT is dead too. Counted, never silent:
	 *  a host reboot kills every seat in one event, so each corpse would otherwise
	 *  address an obituary to another corpse. The caller logs one summary line. */
	readonly noticesSuppressed: number;
}

function noticeText(
	id: string,
	disposition: string,
	observedAt: string,
	historical: boolean,
	lastSeenAt?: string,
): string {
	const origin = historical ? "historical boot reconciliation" : "live observation";
	const lastSeen = lastSeenAt === undefined ? "" : `; last seen ${lastSeenAt}`;
	return `⚠️ ${id} has exited; terminal absence: ${origin} at ${observedAt}${lastSeen} (${disposition}).`;
}

function unavailableReason(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

type ExpiryAssessment =
	| { readonly kind: "pending" }
	| { readonly kind: "expired" }
	| { readonly kind: "unavailable"; readonly reason: string };

function expectationExpiry(expectation: SpawnExpectation, nowIso: string): ExpiryAssessment {
	const requestedAtMs = Date.parse(expectation.requestedAt);
	if (!Number.isFinite(requestedAtMs)) {
		return { kind: "unavailable", reason: `unparseable requestedAt '${expectation.requestedAt}'` };
	}
	const nowMs = Date.parse(nowIso);
	if (!Number.isFinite(nowMs)) {
		return { kind: "unavailable", reason: `unparseable observation time '${nowIso}'` };
	}
	const deadlineAtMs =
		expectation.deadlineAt === undefined
			? requestedAtMs + DEFAULT_SPAWN_EXPECTATION_TTL_MS
			: Date.parse(expectation.deadlineAt);
	if (!Number.isFinite(deadlineAtMs)) {
		return {
			kind: "unavailable",
			reason: `unparseable deadlineAt '${expectation.deadlineAt ?? "(derived)"}'`,
		};
	}
	return nowMs >= deadlineAtMs ? { kind: "expired" } : { kind: "pending" };
}

export function reconcileDeaths(input: DeathReconcileInput): DeathReconcileResult {
	const descriptorUpdates: SessionDescriptor[] = [];
	const expectationUpdates: SpawnExpectation[] = [];
	const notices: DeathNotice[] = [];
	const descriptorBySpawnId = new Set(
		input.descriptors.flatMap((descriptor) =>
			descriptor.spawnId === undefined ? [] : [descriptor.spawnId],
		),
	);

	// A death notice is worth generating only if someone is ALIVE to read it.
	// Seeded with the seats that were already gone before this sweep; the loops
	// below add each seat they bury. Filtering happens after both loops so a
	// notice addressed to a seat that dies LATER in the same sweep is still
	// suppressed — on a reboot the order of the array is meaningless.
	const dead = new Set<string>(
		input.descriptors.flatMap((descriptor) =>
			descriptor.lifecycle === "dissolved" || descriptor.terminal !== undefined
				? [descriptor.id]
				: [],
		),
	);

	for (const descriptor of input.descriptors) {
		if (descriptor.lifecycle === "dissolved" || descriptor.terminal !== undefined) continue;
		let observation: Parameters<typeof applyTerminalObservation>[1] | undefined;
		try {
			if (input.isAlive(descriptor.pid)) continue;
			observation = {
				kind: "absent",
				observedAt: input.nowIso,
				evidence: "pid-missing",
				...(descriptor.lastEventAt !== undefined ? { lastSeenAt: descriptor.lastEventAt } : {}),
			};
		} catch (error) {
			observation = {
				kind: "unavailable",
				observedAt: input.nowIso,
				evidence: "observation-unavailable",
				reason: unavailableReason(error),
				...(descriptor.lastEventAt !== undefined ? { lastSeenAt: descriptor.lastEventAt } : {}),
			};
		}
		const terminal = applyTerminalObservation(
			{
				spawnId: descriptor.spawnId ?? descriptor.id,
				requestedHarness: descriptor.harness ?? "pi",
				requestedAt: descriptor.startedAt,
				...(descriptor.spawnedBy !== undefined ? { creatorId: descriptor.spawnedBy } : {}),
				...(descriptor.closeIntent !== undefined ? { closeIntent: descriptor.closeIntent } : {}),
				...(descriptor.paneId !== undefined ? { paneId: descriptor.paneId } : {}),
				sessionId: descriptor.id,
				...(descriptor.harness !== undefined ? { runtimeHarness: descriptor.harness } : {}),
			},
			observation,
		);
		const latched = latchTerminalNotice(terminal, input.nowIso);
		let failureReason: DeathReason | undefined;
		if (input.failureReasonFor) {
			try {
				failureReason = input.failureReasonFor(descriptor);
			} catch {
				// PID absence is already observed. A compatibility pane capture must
				// never erase that terminal truth; omit the optional reason instead.
			}
		}
		descriptorUpdates.push({
			...descriptor,
			...(failureReason !== undefined ? { failureReason } : {}),
			terminal: latched.terminal,
			deathNoticeLatchedAt: latched.deathNoticeLatchedAt,
		});
		dead.add(descriptor.id);
		if (descriptor.spawnedBy && latched.terminal) {
			notices.push({
				to: descriptor.spawnedBy,
				from: descriptor.id,
				text: noticeText(
					descriptor.id,
					latched.terminal.disposition,
					latched.terminal.observedAt,
					input.historical === true,
					latched.terminal.lastSeenAt,
				),
				historical: input.historical === true,
			});
		}
	}

	for (const expectation of input.expectations) {
		if (
			expectation.terminal !== undefined ||
			expectation.sessionId !== undefined ||
			descriptorBySpawnId.has(expectation.spawnId)
		)
			continue;
		let observation: Parameters<typeof applyTerminalObservation>[1] | undefined;
		const expiry = expectationExpiry(expectation, input.nowIso);
		if (expiry.kind === "unavailable") {
			observation = {
				kind: "unavailable",
				observedAt: input.nowIso,
				evidence: "observation-unavailable",
				reason: expiry.reason,
			};
		} else if (expiry.kind === "expired") {
			observation = {
				kind: "absent",
				observedAt: input.nowIso,
				evidence: "expectation-expired",
			};
		} else if (expectation.paneId !== undefined && input.paneExists !== undefined) {
			try {
				if (input.paneExists(expectation.paneId)) continue;
				observation = { kind: "absent", observedAt: input.nowIso, evidence: "pane-missing" };
			} catch (error) {
				observation = {
					kind: "unavailable",
					observedAt: input.nowIso,
					evidence: "observation-unavailable",
					reason: unavailableReason(error),
				};
			}
		}
		if (!observation) continue;
		const next = latchTerminalNotice(
			applyTerminalObservation(expectation, observation),
			input.nowIso,
		);
		expectationUpdates.push(next);
		if (next.sessionId !== undefined) dead.add(next.sessionId);
		if (next.creatorId && next.terminal) {
			notices.push({
				to: next.creatorId,
				from: next.sessionId ?? next.spawnId,
				text: noticeText(
					next.sessionId ?? next.spawnId,
					next.terminal.disposition,
					next.terminal.observedAt,
					input.historical === true,
					next.terminal.lastSeenAt,
				),
				historical: input.historical === true,
			});
		}
	}

	// Deliverable only. A recipient this same sweep just buried cannot read
	// anything, and the message does not simply sit harmlessly in its mailbox: the
	// daemon keeps pushing it at that seat's recorded pane, which after a reboot
	// belongs to a tmux server that no longer exists. Terminal truth is already
	// recorded on every descriptor above — suppressing the notice drops the
	// ANNOUNCEMENT, never the observation.
	const deliverable = notices.filter((notice) => !dead.has(notice.to));
	return {
		descriptorUpdates,
		expectationUpdates,
		notices: deliverable,
		noticesSuppressed: notices.length - deliverable.length,
	};
}
