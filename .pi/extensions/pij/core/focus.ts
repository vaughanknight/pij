import { createHash } from "node:crypto";
import { join } from "node:path";
import { transcriptDir } from "./harness/claude.js";
import {
	findTranscriptPath,
	type TranscriptListing,
	transcriptLayout,
} from "./harness/transcript.js";
import type { RegistryPort, SpawnExpectationStore, TmuxPort } from "./ports.js";
import {
	buildControlSpawnCommand,
	buildPendingDescriptor,
	buildPiFocusSpawnCommand,
	livePeerPanes,
	planControlSplit,
	type SpawnCommand,
	spawnIdentitySeed,
} from "./spawn.js";
import {
	bindSpawnExpectation,
	createSpawnExpectation,
	spawnExpectationDeadline,
} from "./spawn-expectation.js";
import {
	err,
	type FocusManifest,
	type HarnessKind,
	ok,
	type Result,
	type SessionDescriptor,
	type SessionId,
} from "./types.js";

export interface FocusStorePort {
	write(manifest: FocusManifest): void;
	read(name: string): FocusManifest | null;
	list(): FocusManifest[];
	snapshotPath(name: string): string;
	writeSnapshot(name: string, contents: string): void;
	readSnapshot(name: string): string;
}

export interface FocusTranscriptPort extends TranscriptListing {
	read(path: string): string;
}

export interface FocusSaveDeps {
	readonly registry: Pick<RegistryPort, "read">;
	readonly store: FocusStorePort;
	readonly home: string;
	readonly piSessionDir?: string;
	readonly transcripts: FocusTranscriptPort;
	readonly nowIso: () => string;
}

export interface SaveFocusInput {
	readonly name: string;
	readonly sourcePijId: SessionId;
}

export interface FocusLaunchRegistryPort {
	list(): SessionDescriptor[];
	reserveMemorableId(
		seed: string,
		ownerToken: string,
		ownerPid: number,
	): Result<{ readonly kind: "claimed" | "exists"; readonly id: SessionId }>;
	releaseReservation(id: SessionId, ownerToken: string): Result<boolean>;
	promoteReservation(
		descriptor: SessionDescriptor,
		ownerToken: string,
	): Result<{
		readonly kind: "claimed" | "exists";
		readonly descriptor: SessionDescriptor;
	}>;
}

export interface FocusLaunchDeps {
	readonly registry: FocusLaunchRegistryPort;
	readonly store: FocusStorePort;
	readonly tmux: TmuxPort;
	/** Durable pre-launch intent, shared with daemon no-show reconciliation. */
	readonly expectations: SpawnExpectationStore;
	readonly home: string;
	readonly pijHome: string;
	readonly nowIso: () => string;
	readonly randomUuid: () => string;
	readonly spawnToken: () => string;
	readonly ownerToken: () => string;
	readonly pid: () => number;
	readonly panePid: (paneId: string) => number;
	readonly cwdExists: (cwd: string) => boolean;
	readonly isGitWorktree: (cwd: string) => boolean;
	readonly gitCommonDir: (cwd: string) => string | null;
	readonly ensureDir: (path: string) => void;
	readonly writeMaterialized: (path: string, contents: string) => void;
	readonly waitForPiRegistration: (paneId: string, spawnId: string) => Result<SessionDescriptor>;
}

export interface LaunchFocusInput {
	readonly name: string;
	readonly launchCwd: string;
	readonly parentId?: SessionId;
}

export interface FocusLaunch {
	readonly id: SessionId;
	readonly paneId: string;
	readonly forkSessionId: string;
	readonly command: SpawnCommand;
	readonly descriptor: SessionDescriptor;
	readonly state: "pending-canary";
	readonly branchedFrom: string;
}

export interface ListFocusInput {
	readonly cwd: string;
	readonly global: boolean;
}

export interface FocusListDeps {
	readonly store: Pick<FocusStorePort, "list">;
	readonly gitCommonDir: (cwd: string) => string | null;
}

function adapterUnavailable(harness: HarnessKind): Result<never> {
	return err("E-ARG", `focus adapter not yet available in v1 for ${harness}`);
}

const CREDENTIAL_KEY_PATTERN =
	/^(?:api[-_]?key|access[-_]?token|refresh[-_]?token|authorization|password|secret|credential)$/i;
const CREDENTIAL_VALUE_PATTERN =
	/(?:\bBearer\s+[A-Za-z0-9._~+/-]+=*|sk-ant-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]+)/;

function containsCredential(value: unknown): boolean {
	if (typeof value === "string") return CREDENTIAL_VALUE_PATTERN.test(value);
	if (Array.isArray(value)) return value.some(containsCredential);
	if (typeof value !== "object" || value === null) return false;
	for (const [key, nested] of Object.entries(value)) {
		if (CREDENTIAL_KEY_PATTERN.test(key) || containsCredential(nested)) return true;
	}
	return false;
}

/** Apply the harness-specific privacy transform, then reject credential-shaped
 * fields or values before any snapshot becomes durable. */
export function redactSnapshot(harness: HarnessKind, jsonl: string): Result<string> {
	const lines = jsonl.split("\n");
	const transformed: string[] = [];
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (line === undefined || line.trim() === "") {
			transformed.push(line ?? "");
			continue;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			return err("E-ARG", `cannot save malformed ${harness} transcript JSONL at line ${index + 1}`);
		}
		if (containsCredential(parsed)) {
			return err(
				"E-ARG",
				`refusing to save ${harness} transcript: credential-shaped data found at line ${index + 1}`,
			);
		}
		if (harness === "claude" && typeof parsed === "object" && parsed !== null) {
			delete (parsed as Record<string, unknown>).gitBranch;
		}
		transformed.push(harness === "claude" ? JSON.stringify(parsed) : line);
	}
	return ok(harness === "claude" ? transformed.join("\n") : jsonl);
}

export function saveFocus(input: SaveFocusInput, deps: FocusSaveDeps): Result<FocusManifest> {
	const descriptor = deps.registry.read(input.sourcePijId);
	if (!descriptor) return err("E-NOID", `no pij session '${input.sourcePijId}'`);
	const harness = descriptor.harness ?? "pi";
	if (harness === "copilot" || harness === "codex") return adapterUnavailable(harness);
	if (!descriptor.harnessSessionId?.trim()) {
		return err(
			"E-ARG",
			`cannot save focus '${input.name}': pij session '${input.sourcePijId}' is not bound to a native ${harness} session`,
		);
	}

	const layout = transcriptLayout(harness, { piSessionDir: deps.piSessionDir });
	const sourceDir = layout.dir(deps.home, descriptor.folder);
	let sourcePath: string | null;
	try {
		sourcePath = findTranscriptPath(
			layout,
			deps.transcripts,
			sourceDir,
			descriptor.harnessSessionId,
		);
	} catch (error) {
		return err(
			"E-NOREG",
			`cannot inspect ${harness} transcripts in ${sourceDir}: ${String(error)}`,
		);
	}
	if (!sourcePath) {
		return err(
			"E-NOREG",
			`cannot find ${harness} transcript '${descriptor.harnessSessionId}' in ${sourceDir}`,
		);
	}

	let source: string;
	try {
		source = deps.transcripts.read(sourcePath);
	} catch (error) {
		return err("E-NOREG", `cannot read ${harness} transcript ${sourcePath}: ${String(error)}`);
	}
	const redacted = redactSnapshot(harness, source);
	if (!redacted.ok) return redacted;
	const sha256 = createHash("sha256").update(redacted.value).digest("hex");
	const manifest: FocusManifest = {
		version: 1,
		name: input.name,
		harness,
		harnessSessionId: descriptor.harnessSessionId,
		...(descriptor.boundModel !== undefined ? { model: descriptor.boundModel } : {}),
		...(descriptor.effort !== undefined ? { effort: descriptor.effort } : {}),
		originCwd: descriptor.folder,
		sha256,
		createdAt: deps.nowIso(),
		lineage: {
			sourcePijId: descriptor.id,
			sourceHarnessSessionId: descriptor.harnessSessionId,
		},
	};

	try {
		deps.store.writeSnapshot(input.name, redacted.value);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		return code === "EEXIST"
			? err("E-ARG", `focus '${input.name}' already exists and snapshots are immutable`)
			: err("E-NOREG", `cannot write focus snapshot '${input.name}': ${String(error)}`);
	}
	try {
		deps.store.write(manifest);
	} catch (error) {
		return err("E-NOREG", `cannot write focus manifest '${input.name}': ${String(error)}`);
	}
	return ok(manifest);
}

export function launchFocus(input: LaunchFocusInput, deps: FocusLaunchDeps): Result<FocusLaunch> {
	const manifest = deps.store.read(input.name);
	if (!manifest) return err("E-NOID", `no saved focus '${input.name}'`);
	if (manifest.harness === "copilot" || manifest.harness === "codex") {
		return adapterUnavailable(manifest.harness);
	}
	if (!deps.cwdExists(input.launchCwd)) {
		return err("E-ARG", `cannot resolve focus launch cwd '${input.launchCwd}'`);
	}
	if (manifest.harness === "pi" && deps.isGitWorktree(input.launchCwd)) {
		return err(
			"E-ARG",
			`pi focus launch cannot boot from git worktree '${input.launchCwd}' (#21) — launch from the main checkout`,
		);
	}

	let snapshot: string;
	try {
		snapshot = deps.store.readSnapshot(input.name);
	} catch (error) {
		return err("E-NOREG", `cannot read focus snapshot '${input.name}': ${String(error)}`);
	}
	if (createHash("sha256").update(snapshot).digest("hex") !== manifest.sha256) {
		return err("E-NOREG", `focus snapshot '${input.name}' failed its immutability hash check`);
	}

	const ownPane = deps.tmux.currentPane();
	if (!ownPane || !deps.tmux.currentSession()) {
		return err("E-NOTMUX", "pij focus launch needs an active tmux session");
	}
	const token = deps.spawnToken();
	const materializedSessionId = manifest.harness === "claude" ? deps.randomUuid() : undefined;
	const forkSessionId = deps.randomUuid();
	let pijId: SessionId | undefined;
	let ownerToken: string | undefined;
	let branchFrom: string;
	let piSessionDir: string | undefined;
	try {
		if (manifest.harness === "pi") {
			branchFrom = deps.store.snapshotPath(input.name);
			piSessionDir = join(deps.pijHome, "focus-launches", forkSessionId, "pi-sessions");
			deps.ensureDir(piSessionDir);
		} else {
			branchFrom = materializedSessionId ?? forkSessionId;
			const materializedPath = join(
				transcriptDir(deps.home, input.launchCwd),
				`${branchFrom}.jsonl`,
			);
			deps.writeMaterialized(materializedPath, snapshot);
		}
	} catch (error) {
		return err("E-NOREG", `cannot materialize focus '${input.name}': ${String(error)}`);
	}

	let command: SpawnCommand;
	if (manifest.harness === "pi") {
		command = buildPiFocusSpawnCommand({
			spawnId: token,
			announceTo: input.parentId ?? "",
			cwd: input.launchCwd,
			role: "worker",
			model: manifest.model,
			effort: manifest.effort,
			snapshotPath: branchFrom,
			forkSessionId,
			sessionDir: piSessionDir ?? "",
		});
	} else {
		ownerToken = deps.ownerToken();
		const ownerPid = deps.pid();
		const reserved = deps.registry.reserveMemorableId(
			spawnIdentitySeed(token, ownerPid),
			ownerToken,
			ownerPid,
		);
		if (!reserved.ok) return reserved;
		pijId = reserved.value.id;
		command = buildControlSpawnCommand({
			harness: manifest.harness,
			pijId,
			cwd: input.launchCwd,
			model: manifest.model,
			effort: manifest.effort,
			parentId: input.parentId,
			branchFrom,
			forkSessionId,
		});
	}
	const peerPanes = livePeerPanes(deps.registry.list(), deps.tmux.currentWindowPanes(), ownPane);
	const placement = planControlSplit(ownPane, peerPanes);
	if (!placement.ok) {
		if (pijId !== undefined && ownerToken !== undefined) {
			deps.registry.releaseReservation(pijId, ownerToken);
		}
		return placement;
	}
	const requestedAt = deps.nowIso();
	const expectation = createSpawnExpectation({
		spawnId: token,
		creatorId: input.parentId,
		requestedHarness: manifest.harness,
		requestedAt,
		deadlineAt: spawnExpectationDeadline(requestedAt),
	});
	// Intent is durable before tmux has an opportunity to launch and disappear.
	deps.expectations.write(expectation);
	const split = deps.tmux.splitWindow({
		cmd: command.cmd,
		args: command.args,
		env: command.env,
		cwd: input.launchCwd,
		target: placement.target,
		direction: placement.direction,
		percent: placement.percent,
		evenOut: placement.evenOut,
		columnPercent: placement.columnPercent,
		detached: true,
	});
	if (!split.ok) {
		deps.expectations.remove(token);
		if (pijId !== undefined && ownerToken !== undefined) {
			deps.registry.releaseReservation(pijId, ownerToken);
		}
		return split;
	}

	const paneId = split.value.paneId;
	deps.expectations.write({ ...expectation, paneId });
	let postSpawnSnapshot: string;
	try {
		postSpawnSnapshot = deps.store.readSnapshot(input.name);
	} catch (error) {
		deps.tmux.killPane(paneId);
		deps.expectations.remove(token);
		if (pijId !== undefined && ownerToken !== undefined) {
			deps.registry.releaseReservation(pijId, ownerToken);
		}
		return err(
			"E-NOREG",
			`cannot re-read focus snapshot '${input.name}' after spawn: ${String(error)}`,
		);
	}
	if (createHash("sha256").update(postSpawnSnapshot).digest("hex") !== manifest.sha256) {
		deps.tmux.killPane(paneId);
		deps.expectations.remove(token);
		if (pijId !== undefined && ownerToken !== undefined) {
			deps.registry.releaseReservation(pijId, ownerToken);
		}
		return err("E-NOREG", `focus snapshot '${input.name}' changed during launch`);
	}

	if (manifest.harness === "pi") {
		const registered = deps.waitForPiRegistration(paneId, token);
		if (!registered.ok) {
			deps.tmux.killPane(paneId);
			deps.expectations.remove(token);
			return registered;
		}
		deps.expectations.write(
			bindSpawnExpectation(expectation, {
				sessionId: registered.value.id,
				paneId,
				runtimeHarness: "pi",
				boundAt: deps.nowIso(),
			}),
		);
		return ok({
			id: registered.value.id,
			paneId,
			forkSessionId,
			command,
			descriptor: registered.value,
			state: "pending-canary",
			branchedFrom: manifest.harnessSessionId,
		});
	}

	if (pijId === undefined || ownerToken === undefined) {
		deps.tmux.killPane(paneId);
		deps.expectations.remove(token);
		return err("E-NOREG", `focus launch identity was not reserved for ${manifest.harness}`);
	}
	const dataDir = join(deps.pijHome, pijId);
	const descriptor = buildPendingDescriptor({
		pijId,
		paneId,
		cwd: input.launchCwd,
		harness: manifest.harness,
		dataDir,
		eventsPath: join(dataDir, "events.ndjson"),
		pid: deps.panePid(paneId),
		startedAtIso: deps.nowIso(),
		spawnedBy: input.parentId,
		parentId: input.parentId,
		gitCommonDir: deps.gitCommonDir(input.launchCwd) ?? undefined,
		plannedHarnessSessionId: forkSessionId,
		branchedFrom: manifest.harnessSessionId,
		spawnId: token,
		model: manifest.model,
		effort: manifest.effort,
	});
	const promoted = deps.registry.promoteReservation(descriptor, ownerToken);
	if (!promoted.ok) {
		deps.tmux.killPane(paneId);
		deps.expectations.remove(token);
		deps.registry.releaseReservation(pijId, ownerToken);
		return promoted;
	}
	deps.expectations.write(
		bindSpawnExpectation(expectation, {
			sessionId: pijId,
			paneId,
			runtimeHarness: manifest.harness,
			boundAt: deps.nowIso(),
		}),
	);
	return ok({
		id: pijId,
		paneId,
		forkSessionId,
		command,
		descriptor: promoted.value.descriptor,
		state: "pending-canary",
		branchedFrom: manifest.harnessSessionId,
	});
}

export function listFocuses(
	input: ListFocusInput,
	deps: FocusListDeps,
): Result<readonly FocusManifest[]> {
	let manifests: FocusManifest[];
	try {
		manifests = deps.store.list();
	} catch (error) {
		return err("E-NOREG", `cannot list saved focuses: ${String(error)}`);
	}
	if (input.global) return ok(manifests);
	const currentRepo = deps.gitCommonDir(input.cwd);
	return ok(
		manifests.filter((manifest) => {
			const originRepo = deps.gitCommonDir(manifest.originCwd);
			return currentRepo !== null && originRepo !== null
				? currentRepo === originRepo
				: manifest.originCwd === input.cwd;
		}),
	);
}

export function formatFocusList(manifests: readonly FocusManifest[], json: boolean): string {
	if (json) return JSON.stringify(manifests);
	if (manifests.length === 0) return "no saved focuses";
	const lines = ["NAME\tHARNESS\tMODEL\tCREATED\tORIGIN"];
	for (const manifest of manifests) {
		lines.push(
			[
				manifest.name,
				manifest.harness,
				manifest.model ?? "default",
				manifest.createdAt,
				manifest.originCwd,
			].join("\t"),
		);
	}
	return lines.join("\n");
}
