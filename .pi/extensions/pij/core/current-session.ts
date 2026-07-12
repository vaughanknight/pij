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
	currentPane: string | undefined,
): Result<SessionId> {
	const pane = currentPane && currentPane.trim() !== "" ? currentPane : undefined;
	const action = pane
		? `run pij adopt "$TMUX_PANE" --harness ${identity.harness} from this exact pane`
		: "run pij inbox register";
	const reject = (code: "E-AMBIG" | "E-NOID", message: string): Result<SessionId> =>
		err(code, `${message}; ${action}`);
	const exact = descriptors.filter(
		(descriptor) =>
			descriptor.harness === identity.harness &&
			descriptor.harnessSessionId === identity.harnessSessionId,
	);
	if (exact.length > 1) {
		return reject(
			"E-AMBIG",
			`identity ${identity.harness}:${identity.harnessSessionId} maps to multiple pij ids: ${exact
				.map(({ id }) => id)
				.join(", ")}`,
		);
	}
	const live = exact[0];
	if (durableId && live && live.id !== durableId) {
		return reject(
			"E-AMBIG",
			`durable identity ${identity.harness}:${identity.harnessSessionId} is ${durableId}, but live descriptor is ${live.id}`,
		);
	}
	const durableDescriptor = durableId
		? descriptors.find((descriptor) => descriptor.id === durableId)
		: undefined;
	if (
		durableDescriptor &&
		(durableDescriptor.harness !== identity.harness ||
			durableDescriptor.harnessSessionId !== identity.harnessSessionId)
	) {
		return reject(
			"E-AMBIG",
			`durable identity ${identity.harness}:${identity.harnessSessionId} points to contradictory descriptor ${durableId}`,
		);
	}
	if (!durableId) {
		return reject("E-NOID", `current ${identity.harness} session is not registered`);
	}
	if (!live) {
		return reject(
			"E-NOID",
			`current ${identity.harness} session has no live descriptor for ${durableId}`,
		);
	}
	if (pane) {
		if (live.paneId !== pane || live.deliveryMode === "pull") {
			return reject(
				"E-NOID",
				`current ${identity.harness} session is not push-attached to the current process pane ${pane}`,
			);
		}
	} else if (live.paneId !== undefined || live.deliveryMode !== "pull") {
		return reject(
			"E-NOID",
			`current ${identity.harness} session is not registered as a paneless pull peer`,
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

/** Build the descriptor shape used by external ambient registration. Pane/push
 * runtime is scrubbed while durable identity metadata and history stay. */
export function planCurrentSessionDescriptor(
	input: CurrentSessionDescriptorInput,
): SessionDescriptor {
	const {
		agentOnce: _agentOnce,
		deliveryMode: _deliveryMode,
		failureReason: _failureReason,
		initInjectedAt: _initInjectedAt,
		lastTickAt: _lastTickAt,
		paneId: _paneId,
		plannedHarnessSessionId: _plannedHarnessSessionId,
		transcriptPath: _transcriptPath,
		transcriptsAtSpawn: _transcriptsAtSpawn,
		...durable
	} = input.existing ?? {
		id: input.id,
		folder: input.folder,
		dataDir: join(input.pijHome, input.id),
		eventsPath: join(input.pijHome, input.id, "events.ndjson"),
		pid: input.pid,
		startedAt: input.startedAt,
	};
	return {
		...durable,
		id: input.id,
		folder: input.folder,
		dataDir: input.existing?.dataDir ?? join(input.pijHome, input.id),
		eventsPath: input.existing?.eventsPath ?? join(input.pijHome, input.id, "events.ndjson"),
		pid: input.pid,
		startedAt: input.existing?.startedAt ?? input.startedAt,
		state: "idle",
		harness: input.identity.harness,
		harnessSessionId: input.identity.harnessSessionId,
		lifecycle: "bound",
		deliveryMode: "pull",
		...(input.identity.transcriptPath ? { transcriptPath: input.identity.transcriptPath } : {}),
	};
}
