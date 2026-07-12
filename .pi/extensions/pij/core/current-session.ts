// pij-control-plane — ambient native-session identity (pure).

import { join } from "node:path";
import { isCopilotSessionId } from "./harness/copilot.js";
import {
	err,
	type HarnessKind,
	ok,
	type Result,
	type SessionDescriptor,
	type SessionId,
} from "./types.js";

export interface AmbientNativeIdentity {
	readonly harness: Exclude<HarnessKind, "pi">;
	readonly harnessSessionId: string;
	readonly transcriptPath?: string;
}

export interface AmbientNativeIdentityInput {
	readonly claudeCodeSessionId?: string;
	/** Validated against matching Copilot session-state metadata by the bin. */
	readonly copilotCurrentSessionId?: string | null;
	/** Validated against the exact date-nested rollout path by the bin. */
	readonly codexCurrentSession?: {
		readonly threadId: string;
		readonly transcriptPath: string;
	} | null;
}

/** Resolve exactly one ambient harness-native identity. Invalid/empty candidate
 * signals are absent; multiple valid harness signals fail rather than guessing. */
export function resolveAmbientNativeIdentity(
	input: AmbientNativeIdentityInput,
): Result<AmbientNativeIdentity | null> {
	const candidates: AmbientNativeIdentity[] = [];
	const claude = input.claudeCodeSessionId?.trim();
	if (claude) {
		candidates.push({ harness: "claude", harnessSessionId: claude });
	}
	const copilot = input.copilotCurrentSessionId?.trim();
	if (isCopilotSessionId(copilot)) {
		candidates.push({ harness: "copilot", harnessSessionId: copilot.toLowerCase() });
	}
	const codexId = input.codexCurrentSession?.threadId.trim();
	const codexPath = input.codexCurrentSession?.transcriptPath.trim();
	if (isCopilotSessionId(codexId) && codexPath) {
		candidates.push({
			harness: "codex",
			harnessSessionId: codexId.toLowerCase(),
			transcriptPath: codexPath,
		});
	}
	if (candidates.length > 1) {
		return err(
			"E-AMBIG",
			`multiple ambient native identities: ${candidates
				.map(({ harness, harnessSessionId }) => `${harness}:${harnessSessionId}`)
				.join(", ")}`,
		);
	}
	return ok(candidates[0] ?? null);
}

/** Validate the durable reverse join against live descriptor metadata. */
export function resolveRegisteredAmbientSelf(
	identity: AmbientNativeIdentity,
	descriptors: readonly SessionDescriptor[],
	durableId: SessionId | undefined,
): Result<SessionId> {
	const exact = descriptors.filter(
		(descriptor) =>
			descriptor.harness === identity.harness &&
			descriptor.harnessSessionId === identity.harnessSessionId,
	);
	if (exact.length > 1) {
		return err(
			"E-AMBIG",
			`identity ${identity.harness}:${identity.harnessSessionId} maps to multiple pij ids: ${exact
				.map(({ id }) => id)
				.join(", ")}`,
		);
	}
	const live = exact[0];
	if (durableId && live && live.id !== durableId) {
		return err(
			"E-AMBIG",
			`durable identity ${identity.harness}:${identity.harnessSessionId} is ${durableId}, but live descriptor is ${live.id}`,
		);
	}
	if (!durableId) {
		return err(
			"E-NOID",
			`current ${identity.harness} session is not registered; run pij inbox register`,
		);
	}
	return ok(durableId);
}

export interface CurrentSessionDescriptorInput {
	readonly id: SessionId;
	readonly identity: AmbientNativeIdentity;
	readonly pijHome: string;
	readonly folder: string;
	readonly pid: number;
	readonly startedAt: string;
	readonly existing?: SessionDescriptor;
}

/** Build the descriptor shape used by first-use ambient registration. Runtime
 * attachment fields are refreshed; durable identity metadata and history stay. */
export function planCurrentSessionDescriptor(
	input: CurrentSessionDescriptorInput,
): SessionDescriptor {
	const {
		deliveryMode: _deliveryMode,
		failureReason: _failureReason,
		lastTickAt: _lastTickAt,
		paneId: _paneId,
		transcriptPath: _transcriptPath,
		...durable
	} = input.existing ?? {
		id: input.id,
		folder: input.folder,
		dataDir: join(input.pijHome, input.id),
		eventsPath: join(input.pijHome, input.id, "events.ndjson"),
		pid: input.pid,
		startedAt: input.startedAt,
	};
	const paneBound = input.existing?.paneId !== undefined;
	return {
		...durable,
		id: input.id,
		folder: paneBound ? input.existing.folder : input.folder,
		dataDir: input.existing?.dataDir ?? join(input.pijHome, input.id),
		eventsPath: input.existing?.eventsPath ?? join(input.pijHome, input.id, "events.ndjson"),
		pid: paneBound ? input.existing.pid : input.pid,
		startedAt: input.existing?.startedAt ?? input.startedAt,
		state: paneBound ? (input.existing.state ?? "idle") : "idle",
		harness: input.identity.harness,
		harnessSessionId: input.identity.harnessSessionId,
		lifecycle: "bound",
		...(paneBound
			? {
					paneId: input.existing.paneId,
					...(input.existing.deliveryMode !== undefined
						? { deliveryMode: input.existing.deliveryMode }
						: {}),
					...(input.existing.lastTickAt !== undefined
						? { lastTickAt: input.existing.lastTickAt }
						: {}),
				}
			: { deliveryMode: "pull" as const }),
		...(input.identity.transcriptPath ? { transcriptPath: input.identity.transcriptPath } : {}),
	};
}
