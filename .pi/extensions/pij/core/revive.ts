import type { SpawnCommand, SpawnLayout } from "./spawn.js";
import { err, ok, type Result, type SessionDescriptor, type SessionId } from "./types.js";

export const REVIVE_REFRAME =
	"You are a REVIVED session. Your prior conversation is context only, NOT a task to resume. " +
	"Do NOT continue the old work, spawn peers, or message anyone. Wait for new instructions.";

export interface ReviveRequest {
	readonly id: SessionId;
	readonly layout?: SpawnLayout;
	readonly json: boolean;
}

export interface ReviveArtifacts {
	readonly claudePath?: string;
	readonly copilotPath?: string;
	readonly codexPaths: readonly string[];
	readonly piPaths: readonly string[];
	readonly ompPaths: readonly string[];
}

export interface RevivePlanInput {
	readonly spawnId: string;
	readonly parentId?: SessionId;
	/** True only when the old pane/process incarnation is still demonstrably live. */
	readonly priorAttachmentAlive?: boolean;
}

export interface RevivePlan {
	readonly id: SessionId;
	readonly runtime: "claude" | "copilot" | "codex" | "pi" | "omp";
	readonly artifactPath: string;
	readonly command: SpawnCommand;
	readonly descriptor: SessionDescriptor;
}

export interface RevivedAttachment {
	readonly paneId: string;
	readonly windowId?: string;
	readonly pid: number;
	readonly spawnId: string;
	readonly nowIso: string;
	readonly reviverId?: SessionId;
}

export function parseReviveArgs(argv: readonly string[]): Result<ReviveRequest> {
	let id: string | undefined;
	let layout: SpawnLayout | undefined;
	let json = false;
	for (let index = 0; index < argv.length; index++) {
		const token = argv[index];
		if (token === "--json") {
			json = true;
			continue;
		}
		if (token === "--layout" || token?.startsWith("--layout=")) {
			const value = token.includes("=") ? token.slice(token.indexOf("=") + 1) : argv[++index];
			if (value !== "stack" && value !== "right" && value !== "below" && value !== "window") {
				return err("E-ARG", `--layout must be stack|right|below|window (got '${value ?? ""}')`);
			}
			layout = value;
			continue;
		}
		if (token?.startsWith("-")) return err("E-ARG", `unknown revive flag '${token}'`);
		if (token !== undefined && id === undefined) {
			id = token;
			continue;
		}
		return err("E-ARG", "usage: pij revive <pij-id> [--layout stack|right|below|window] [--json]");
	}
	if (!id)
		return err("E-ARG", "usage: pij revive <pij-id> [--layout stack|right|below|window] [--json]");
	return ok({ id, ...(layout === undefined ? {} : { layout }), json });
}

function exactlyOne(paths: readonly string[], label: string): Result<string> {
	const unique = [...new Set(paths)];
	if (unique.length === 0) return err("E-NOREG", `${label} native session artifact is missing`);
	if (unique.length > 1) {
		return err(
			"E-AMBIG",
			`${label} native session resolves to multiple artifacts: ${unique.join(", ")}`,
		);
	}
	const path = unique[0];
	return path === undefined
		? err("E-NOREG", `${label} native session artifact is missing`)
		: ok(path);
}

function modelArgs(model?: string): string[] {
	return model === undefined ? [] : ["--model", model];
}

function effortArgs(effort?: string): string[] {
	return effort === undefined ? [] : ["--effort", effort];
}

function controlEnv(descriptor: SessionDescriptor, input: RevivePlanInput): Record<string, string> {
	return {
		PIJ_SESSION_ID: descriptor.id,
		PIJ_HARNESS: descriptor.harness ?? "pi",
		PIJ_SPAWN_ID: input.spawnId,
		...(input.parentId ? { PIJ_PARENT_ID: input.parentId } : {}),
	};
}

function piEnv(
	descriptor: SessionDescriptor,
	input: RevivePlanInput,
	runtime: "pi" | "omp",
): Record<string, string> {
	const parentId = input.parentId ?? "";
	return {
		PIJ_ANNOUNCE_TO: parentId,
		PIJ_PARENT_ID: parentId,
		PIJ_SPAWN_ID: input.spawnId,
		PIJ_ROLE: descriptor.role ?? "worker",
		PIJ_SPAWN_TASK: REVIVE_REFRAME,
		PIJ_PI_BIN: runtime,
		...(descriptor.boundModel ? { PIJ_SPAWN_MODEL: descriptor.boundModel } : {}),
		...(descriptor.boundProvider ? { PIJ_SPAWN_PROVIDER: descriptor.boundProvider } : {}),
		...(descriptor.effort ? { PIJ_SPAWN_EFFORT: descriptor.effort } : {}),
	};
}

function buildCommand(
	descriptor: SessionDescriptor,
	runtime: RevivePlan["runtime"],
	artifactPath: string,
	input: RevivePlanInput,
): SpawnCommand {
	const nativeId = descriptor.harnessSessionId ?? "";
	if (runtime === "claude") {
		return {
			cmd: "claude",
			args: [
				"--dangerously-skip-permissions",
				"--resume",
				nativeId,
				...modelArgs(descriptor.boundModel),
				...effortArgs(descriptor.effort),
			],
			env: controlEnv(descriptor, input),
		};
	}
	if (runtime === "copilot") {
		return {
			cmd: "copilot",
			args: [
				"--yolo",
				`--resume=${nativeId}`,
				...modelArgs(descriptor.boundModel),
				...effortArgs(descriptor.effort),
			],
			env: controlEnv(descriptor, input),
		};
	}
	if (runtime === "codex") {
		return {
			cmd: "codex",
			args: [
				"--dangerously-bypass-approvals-and-sandbox",
				...modelArgs(descriptor.boundModel),
				...(descriptor.effort ? ["-c", `model_reasoning_effort=${descriptor.effort}`] : []),
				"resume",
				nativeId,
			],
			env: controlEnv(descriptor, input),
		};
	}
	if (runtime === "pi") {
		const model =
			descriptor.boundModel && descriptor.effort
				? `${descriptor.boundModel}:${descriptor.effort}`
				: descriptor.boundModel;
		return {
			cmd: "pi",
			args: ["--session", artifactPath, ...(model ? ["--model", model] : [])],
			env: piEnv(descriptor, input, runtime),
		};
	}
	return {
		cmd: "omp",
		args: [
			"--auto-approve",
			`--resume=${artifactPath}`,
			...modelArgs(descriptor.boundModel),
			...(descriptor.effort ? ["--thinking", descriptor.effort] : []),
		],
		env: piEnv(descriptor, input, runtime),
	};
}

export function planRevive(
	descriptor: SessionDescriptor | null,
	artifacts: ReviveArtifacts,
	input: RevivePlanInput,
): Result<RevivePlan> {
	if (!descriptor) return err("E-NOID", "no session with that pij id");
	if (input.priorAttachmentAlive) {
		return err(
			"E-ARG",
			`session '${descriptor.id}' still has a live prior attachment; close it before reviving`,
		);
	}
	if (
		descriptor.lifecycle !== "dissolved" &&
		descriptor.terminal === undefined &&
		input.priorAttachmentAlive !== false
	) {
		return err(
			"E-ARG",
			`session '${descriptor.id}' has no terminal observation and its prior attachment was not proven dead`,
		);
	}
	if (!descriptor.harness || !descriptor.harnessSessionId?.trim()) {
		return err("E-NOREG", `session '${descriptor.id}' has no bound native session identity`);
	}

	let runtime: RevivePlan["runtime"];
	let artifact: Result<string>;
	if (descriptor.harness === "claude") {
		runtime = "claude";
		artifact = artifacts.claudePath
			? ok(artifacts.claudePath)
			: err("E-NOREG", "claude native session artifact is missing");
	} else if (descriptor.harness === "copilot") {
		runtime = "copilot";
		artifact = artifacts.copilotPath
			? ok(artifacts.copilotPath)
			: err("E-NOREG", "copilot native session artifact is missing");
	} else if (descriptor.harness === "codex") {
		runtime = "codex";
		artifact = exactlyOne(artifacts.codexPaths, "codex");
	} else {
		const pi = [...new Set(artifacts.piPaths)];
		const omp = [...new Set(artifacts.ompPaths)];
		if (descriptor.runtimeBin === "pi") {
			runtime = "pi";
			artifact = exactlyOne(pi, "pi");
		} else if (descriptor.runtimeBin === "omp") {
			runtime = "omp";
			artifact = exactlyOne(omp, "omp");
		} else if (pi.length === 1 && omp.length === 0) {
			runtime = "pi";
			artifact = ok(pi[0] ?? "");
		} else if (omp.length === 1 && pi.length === 0) {
			runtime = "omp";
			artifact = ok(omp[0] ?? "");
		} else if (pi.length === 0 && omp.length === 0) {
			return err(
				"E-NOREG",
				`pi-family session '${descriptor.harnessSessionId}' is absent from both Pi and OMP stores`,
			);
		} else {
			return err(
				"E-AMBIG",
				`legacy pi-family session '${descriptor.harnessSessionId}' matches both/multiple native stores`,
			);
		}
	}
	if (!artifact.ok) return artifact;
	return ok({
		id: descriptor.id,
		runtime,
		artifactPath: artifact.value,
		command: buildCommand(descriptor, runtime, artifact.value, input),
		descriptor,
	});
}

export function buildRevivedDescriptor(
	existing: SessionDescriptor,
	attachment: RevivedAttachment,
): SessionDescriptor {
	const {
		closeIntent: _closeIntent,
		terminal: _terminal,
		deathNoticeLatchedAt: _deathNoticeLatchedAt,
		failureReason: _failureReason,
		initInjectedAt: _initInjectedAt,
		lastTickAt: _lastTickAt,
		lastInboxScanAt: _lastInboxScanAt,
		compactingAt: _compactingAt,
		lastWatchdogFireAt: _lastWatchdogFireAt,
		transcriptsAtSpawn: _transcriptsAtSpawn,
		plannedHarnessSessionId: _plannedHarnessSessionId,
		windowId: _windowId,
		...durable
	} = existing;
	return {
		...durable,
		pid: attachment.pid,
		paneId: attachment.paneId,
		...(attachment.windowId ? { windowId: attachment.windowId } : {}),
		...(attachment.reviverId
			? { spawnedBy: attachment.reviverId, parentId: attachment.reviverId }
			: { spawnedBy: undefined, parentId: undefined }),
		state: "idle",
		systemState: "starting",
		lifecycle: "pending",
		spawnId: attachment.spawnId,
		plannedHarnessSessionId: existing.harnessSessionId,
		revivePendingAt: attachment.nowIso,
	};
}
