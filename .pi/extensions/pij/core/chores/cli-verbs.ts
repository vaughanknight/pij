import { PA_VERB_CLASSIFICATION } from "../orchestration/pa-capability.js";
import {
	ackPending,
	advanceFullCounter,
	fingerprintChoreDefinition,
	reduceProbe,
} from "./reduce.js";
import { renderChoreJson, renderChoreReport } from "./report.js";
import { choreKey, resolveChoreReference, resolveChores, stateKey } from "./resolve.js";
import {
	CHORE_NAME_RE,
	type Chore,
	type ChoreListItem,
	type ChoreProbePort,
	type ChoreProbeResult,
	type ChoreRoster,
	type ChoreRunItem,
	type ChoreScope,
	type ChoreScopeSource,
	type ChoreScopeSummary,
	type ChoreState,
	type ChoreStorePort,
	DEFAULT_CHORE_TIMEOUT_MS,
	isChoreScope,
} from "./types.js";

export interface ChoreVerbResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
}

export interface ChoreVerbDeps {
	readonly cwd: string;
	readonly worktreeRoot: string;
	readonly seatId?: string;
	readonly store: ChoreStorePort;
	readonly probe: ChoreProbePort;
	readonly now: () => string;
}

type ChoreErrorCode = "E-ARG" | "E-NOID" | "E-AMBIG" | "E-EXISTS" | "E-NOREG";

function errorResult(code: ChoreErrorCode, message: string): ChoreVerbResult {
	return {
		stdout: "",
		stderr: `${code}: ${message}`,
		exitCode: code === "E-ARG" ? 64 : code === "E-NOREG" ? 3 : 1,
	};
}

function okResult(stdout: string, stderr = ""): ChoreVerbResult {
	return { stdout, stderr, exitCode: 0 };
}

function emptyRoster(): ChoreRoster {
	return { version: 1, chores: [], removals: [] };
}

function emptyState(): ChoreState {
	return { version: 1, entries: {} };
}

function unavailableReason(scope: ChoreScope, deps: ChoreVerbDeps): string {
	if (scope === "seat" && !deps.seatId) {
		return "seat-scoped chore roster requires a registered seat id";
	}
	if (scope === "repo") return "not in a Git worktree";
	return "roster unavailable";
}

function scopeSources(deps: ChoreVerbDeps): ChoreScopeSource[] {
	return (["seat", "repo", "fleet"] as const).map((scope) => {
		const status = deps.store.rosterStatus(scope);
		const roster = status === "ok" ? deps.store.readRoster(scope) : undefined;
		return {
			scope,
			status,
			chores: roster?.chores ?? [],
			...(status === "unavailable" ? { reason: unavailableReason(scope, deps) } : {}),
		};
	});
}

function scopeSummary(deps: ChoreVerbDeps): ChoreScopeSummary {
	return {
		seat: deps.seatId ?? null,
		repo: deps.store.rosterPath("repo") ?? null,
		fleet: deps.store.rosterPath("fleet") ?? "unavailable",
	};
}

function renderScopeSummary(scopes: ChoreScopeSummary): string {
	return `SCOPES seat: ${scopes.seat ?? "unresolved"} | repo: ${scopes.repo ?? "unavailable"} | fleet: ${scopes.fleet}`;
}

function loadWritableRoster(scope: ChoreScope, deps: ChoreVerbDeps): ChoreRoster | ChoreVerbResult {
	const status = deps.store.rosterStatus(scope);
	if (status === "unavailable") {
		return errorResult(scope === "seat" ? "E-NOID" : "E-NOREG", unavailableReason(scope, deps));
	}
	if (status === "malformed") {
		return errorResult("E-NOREG", `${scope} chore roster is malformed`);
	}
	return status === "ok" ? (deps.store.readRoster(scope) ?? emptyRoster()) : emptyRoster();
}

function loadState(deps: ChoreVerbDeps): ChoreState | ChoreVerbResult {
	if (!deps.seatId) {
		return errorResult("E-NOID", "per-seat chore state requires a registered seat id");
	}
	const status = deps.store.stateStatus();
	if (status === "unavailable") {
		return errorResult("E-NOID", "per-seat chore state is unavailable");
	}
	if (status === "malformed") {
		return errorResult("E-NOREG", "per-seat chore state is malformed");
	}
	return status === "ok" ? (deps.store.readState() ?? emptyState()) : emptyState();
}

function isVerbResult(value: ChoreRoster | ChoreState | ChoreVerbResult): value is ChoreVerbResult {
	return "exitCode" in value;
}

function writeRoster(
	scope: ChoreScope,
	roster: ChoreRoster,
	deps: ChoreVerbDeps,
): ChoreVerbResult | undefined {
	try {
		deps.store.writeRoster(scope, roster);
		return undefined;
	} catch (error) {
		return errorResult("E-NOREG", `cannot write ${scope} chore roster: ${String(error)}`);
	}
}

function writeState(state: ChoreState, deps: ChoreVerbDeps): ChoreVerbResult | undefined {
	try {
		deps.store.writeState(state);
		return undefined;
	} catch (error) {
		return errorResult("E-NOREG", `cannot write per-seat chore state: ${String(error)}`);
	}
}

function flagValue(
	args: readonly string[],
	index: number,
	flag: string,
	allowLeadingDash = false,
): string | ChoreVerbResult {
	const value = args[index + 1];
	return value === undefined || (!allowLeadingDash && value.startsWith("--"))
		? errorResult("E-ARG", `${flag} takes a value`)
		: value;
}

function positiveInteger(value: string, flag: string): number | ChoreVerbResult {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0
		? parsed
		: errorResult("E-ARG", `${flag} takes a positive integer`);
}

interface AddOptions {
	readonly name: string;
	readonly scope: ChoreScope;
	readonly probe: string;
	readonly full?: string;
	readonly fullEvery?: number;
	readonly timeoutMs: number;
	readonly json: boolean;
}

function parseAdd(args: readonly string[]): AddOptions | ChoreVerbResult {
	const name = args[0];
	if (!name || name.startsWith("--") || !CHORE_NAME_RE.test(name)) {
		return errorResult("E-ARG", "add requires a name matching [A-Za-z0-9][A-Za-z0-9._-]*");
	}
	let scope: ChoreScope = "seat";
	let probe: string | undefined;
	let full: string | undefined;
	let fullEvery: number | undefined;
	let timeoutMs = DEFAULT_CHORE_TIMEOUT_MS;
	let json = false;
	for (let index = 1; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--json") {
			json = true;
			continue;
		}
		if (
			arg !== "--scope" &&
			arg !== "--probe" &&
			arg !== "--full" &&
			arg !== "--full-every" &&
			arg !== "--timeout"
		) {
			return errorResult("E-ARG", `unknown add flag '${arg ?? ""}'`);
		}
		const value = flagValue(args, index, arg, arg === "--probe" || arg === "--full");
		if (typeof value !== "string") return value;
		index += 1;
		switch (arg) {
			case "--scope":
				if (!isChoreScope(value)) {
					return errorResult("E-ARG", "--scope must be seat, repo, or fleet");
				}
				scope = value;
				break;
			case "--probe":
				probe = value;
				break;
			case "--full":
				full = value;
				break;
			case "--full-every": {
				const parsed = positiveInteger(value, "--full-every");
				if (typeof parsed !== "number") return parsed;
				fullEvery = parsed;
				break;
			}
			case "--timeout": {
				const parsed = positiveInteger(value, "--timeout");
				if (typeof parsed !== "number") return parsed;
				timeoutMs = parsed;
				break;
			}
		}
	}
	if (!probe?.trim()) return errorResult("E-ARG", "add requires --probe '<cmd>'");
	if (fullEvery !== undefined && !full?.trim()) {
		return errorResult("E-ARG", "--full-every requires --full '<cmd>'");
	}
	return {
		name,
		scope,
		probe,
		...(full ? { full } : {}),
		...(fullEvery !== undefined ? { fullEvery } : {}),
		timeoutMs,
		json,
	};
}

function containsAbsolutePath(command: string): boolean {
	return /(^|[\s"'=])(?:\/(?!\/)|[A-Za-z]:[\\/])/.test(command);
}

function refusedPaProbeVerb(command: string): string | undefined {
	for (const [key, capability] of Object.entries(PA_VERB_CLASSIFICATION)) {
		if (capability.kind !== "refuse") continue;
		const phrase = `pij ${key.replaceAll("-", " ")}`;
		const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll(" ", "\\s+");
		if (new RegExp(`(^|[;&|]\\s*|\\s)${escaped}(?=\\s|$)`).test(command)) return phrase;
	}
	return undefined;
}

function authoringNotices(chore: Chore, deps: ChoreVerbDeps): string[] {
	const notices: string[] = [];
	if (chore.scope !== "seat" && containsAbsolutePath(chore.probe)) {
		notices.push(
			`WARN: ${choreKey(chore)} probe contains an absolute path; shared probes should use a checkout-relative command, resolving the root with 'git rev-parse --show-toplevel' when needed.`,
		);
	}
	if (chore.scope !== "seat") {
		for (const [field, command] of [
			["probe", chore.probe],
			["full", chore.full],
		] as const) {
			if (!command) continue;
			const refused = refusedPaProbeVerb(command);
			if (refused) {
				notices.push(
					`WARN: ${choreKey(chore)} ${field} invokes '${refused}', which PA roles are refused; this shared chore may be permanently NOT-PROBEABLE for less-capable seats.`,
				);
			}
		}
	}
	if (chore.scope === "repo") {
		const path = deps.store.rosterPath("repo");
		notices.push(
			`NOTE: commit ${path ?? ".pij/chores.json"} so repo-scoped chores reach every checkout.`,
		);
	}
	return notices;
}

export function addVerb(args: readonly string[], deps: ChoreVerbDeps): ChoreVerbResult {
	const options = parseAdd(args);
	if ("exitCode" in options) return options;
	const roster = loadWritableRoster(options.scope, deps);
	if (isVerbResult(roster)) return roster;
	if (roster.chores.some((chore) => chore.name === options.name)) {
		return errorResult("E-EXISTS", `chore '${options.scope}:${options.name}' already exists`);
	}
	const chore: Chore = {
		scope: options.scope,
		name: options.name,
		probe: options.probe,
		...(deps.seatId ? { creatorSeatId: deps.seatId } : {}),
		...(options.full ? { full: options.full } : {}),
		...(options.fullEvery !== undefined ? { fullEvery: options.fullEvery } : {}),
		timeoutMs: options.timeoutMs,
	};
	const next: ChoreRoster = {
		...roster,
		chores: [...roster.chores, chore].sort((left, right) => left.name.localeCompare(right.name)),
	};
	const writeError = writeRoster(options.scope, next, deps);
	if (writeError) return writeError;
	return okResult(
		options.json
			? JSON.stringify(chore, null, 2)
			: `added ${choreKey(chore)} — probe '${chore.probe}'`,
		authoringNotices(chore, deps).join("\n"),
	);
}

interface RunOptions {
	readonly dry: boolean;
	readonly json: boolean;
}

function parseRun(args: readonly string[]): RunOptions | ChoreVerbResult {
	let dry = false;
	let json = false;
	for (const arg of args) {
		if (arg === "--dry") dry = true;
		else if (arg === "--json") json = true;
		else return errorResult("E-ARG", `unknown run flag '${arg}'`);
	}
	return { dry, json };
}

function safeProbe(
	probe: ChoreProbePort,
	command: string,
	cwd: string,
	timeoutMs: number,
): ChoreProbeResult {
	try {
		return probe.run(command, cwd, timeoutMs);
	} catch (error) {
		return {
			ok: false,
			reason: `probe threw: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

function safeInstrumentFingerprint(
	probe: ChoreProbePort,
	command: string,
	cwd: string,
): string | null {
	try {
		return probe.instrumentFingerprint?.(command, cwd) ?? null;
	} catch {
		return null;
	}
}

export function runVerb(args: readonly string[], deps: ChoreVerbDeps): ChoreVerbResult {
	const options = parseRun(args);
	if ("exitCode" in options) return options;
	const loadedState = loadState(deps);
	const scopes = scopeSummary(deps);
	if (isVerbResult(loadedState)) {
		return {
			...loadedState,
			stderr: `${renderScopeSummary(scopes)}\n${loadedState.stderr}`,
		};
	}
	const resolved = resolveChores(scopeSources(deps));
	const entries = { ...loadedState.entries };
	const items: ChoreRunItem[] = [];
	const now = deps.now();

	for (const chore of resolved.chores) {
		const key = stateKey(chore, deps.worktreeRoot);
		const previous = entries[key];
		const reduced = reduceProbe(
			previous,
			safeProbe(deps.probe, chore.probe, deps.cwd, chore.timeoutMs),
			now,
			{
				definitionFingerprint: fingerprintChoreDefinition(chore.probe),
				contentFingerprint: safeInstrumentFingerprint(deps.probe, chore.probe, deps.cwd),
			},
		);
		let nextEntry = reduced.state;
		let fullOutput: string | undefined;
		if (
			(reduced.outcome.status === "changed-value" || reduced.outcome.status === "flapped") &&
			chore.full
		) {
			const full = safeProbe(deps.probe, chore.full, deps.cwd, chore.timeoutMs);
			fullOutput = full.ok ? full.output.trim() : `NOT-PROBEABLE: ${full.reason}`;
			nextEntry = { ...nextEntry, runsSinceFull: 0 };
		} else if (reduced.outcome.status === "changed-probe") {
			nextEntry = { ...nextEntry, runsSinceFull: 0 };
		} else {
			const counter = advanceFullCounter(nextEntry, chore.fullEvery);
			nextEntry = counter.state;
			if (counter.due && chore.full) {
				const full = safeProbe(deps.probe, chore.full, deps.cwd, chore.timeoutMs);
				fullOutput = full.ok ? full.output.trim() : `NOT-PROBEABLE: ${full.reason}`;
			}
		}
		if (!options.dry) entries[key] = nextEntry;
		const outcome = reduced.outcome;
		items.push({
			scope: chore.scope,
			name: chore.name,
			status: outcome.status,
			old: "old" in outcome ? outcome.old : null,
			new: "new" in outcome ? outcome.new : null,
			oldFingerprint: "oldFingerprint" in outcome ? outcome.oldFingerprint : null,
			newFingerprint: "newFingerprint" in outcome ? outcome.newFingerprint : null,
			...("reason" in outcome ? { reason: outcome.reason } : {}),
			...("preservedValueDelta" in outcome && outcome.preservedValueDelta !== undefined
				? { preservedValueDelta: outcome.preservedValueDelta }
				: {}),
			fullConfigured: chore.full !== undefined,
			...(fullOutput !== undefined ? { fullOutput } : {}),
		});
	}

	for (const issue of resolved.issues) {
		items.push({
			scope: issue.scope,
			name: issue.name,
			status: "not-probeable",
			old: null,
			new: null,
			oldFingerprint: null,
			newFingerprint: null,
			reason: issue.reason,
		});
	}

	if (!options.dry) {
		const nextState: ChoreState = { version: 1, entries };
		if (JSON.stringify(nextState) !== JSON.stringify(loadedState)) {
			const writeError = writeState(nextState, deps);
			if (writeError) return writeError;
		}
	}

	const report = {
		probed: resolved.chores.length,
		moved: items.filter(
			(item) =>
				item.status === "changed-value" ||
				item.status === "changed-probe" ||
				item.status === "flapped",
		).length,
		chores: items,
	};
	return okResult(
		options.json
			? renderChoreJson(report, scopes)
			: `${renderScopeSummary(scopes)}\n${renderChoreReport(report)}`,
	);
}

interface ListOptions {
	readonly verbose: boolean;
	readonly json: boolean;
}

function parseList(args: readonly string[]): ListOptions | ChoreVerbResult {
	let verbose = false;
	let json = false;
	for (const arg of args) {
		if (arg === "--verbose") verbose = true;
		else if (arg === "--json") json = true;
		else return errorResult("E-ARG", `unknown list flag '${arg}'`);
	}
	return { verbose, json };
}

export function listVerb(args: readonly string[], deps: ChoreVerbDeps): ChoreVerbResult {
	const options = parseList(args);
	if ("exitCode" in options) return options;
	const resolved = resolveChores(scopeSources(deps));
	const state = deps.store.stateStatus() === "ok" ? deps.store.readState() : undefined;
	const rows: ChoreListItem[] = resolved.chores.map((chore) => {
		const entry = state?.entries[stateKey(chore, deps.worktreeRoot)];
		return {
			...chore,
			key: choreKey(chore),
			...(entry?.lastRunAt ? { lastRunAt: entry.lastRunAt } : {}),
			...(entry?.lastStatus ? { lastStatus: entry.lastStatus } : {}),
			...(entry?.pending ? { pending: entry.pending } : {}),
			...(entry?.baseline ? { baseline: entry.baseline } : {}),
		};
	});
	const scopes = scopeSummary(deps);
	if (options.json) {
		return okResult(
			JSON.stringify(
				{
					scopes,
					chores: rows.map((row) => ({
						...row,
						creatorSeatId: row.creatorSeatId ?? null,
					})),
				},
				null,
				2,
			),
		);
	}
	if (rows.length === 0 && resolved.issues.length === 0) {
		return okResult(`${renderScopeSummary(scopes)}\nNo chores registered.`);
	}
	const lines = rows.map((row) =>
		options.verbose
			? `${row.key} scope=${row.scope} creator=${row.creatorSeatId ?? "unknown"} probe=${JSON.stringify(row.probe)} full=${JSON.stringify(row.full ?? null)} full-every=${row.fullEvery ?? "none"} timeout=${row.timeoutMs} last-run=${row.lastRunAt ?? "never"} last-delta=${row.pending ? `${row.pending.old ?? "none"}→${row.pending.new}` : "none"}`
			: row.key,
	);
	for (const issue of resolved.issues) {
		lines.push(`NOT-PROBEABLE ${issue.scope}:<roster>: ${issue.reason}`);
	}
	return okResult(`${renderScopeSummary(scopes)}\n${lines.join("\n")}`);
}

interface ReferenceOptions {
	readonly reference: string;
	readonly json: boolean;
}

function parseReference(
	args: readonly string[],
	verb: "ack" | "remove",
): ReferenceOptions | ChoreVerbResult {
	const reference = args[0];
	if (!reference || reference.startsWith("--")) {
		return errorResult("E-ARG", `${verb} requires <name|scope:name>`);
	}
	let json = false;
	for (let index = 1; index < args.length; index += 1) {
		if (args[index] === "--json") json = true;
		else if (verb === "remove" && args[index] === "--reason") {
			index += 1;
		} else {
			return errorResult("E-ARG", `unknown ${verb} flag '${args[index] ?? ""}'`);
		}
	}
	return { reference, json };
}

function resolveReference(reference: string, deps: ChoreVerbDeps): Chore | ChoreVerbResult {
	const resolved = resolveChores(scopeSources(deps));
	const match = resolveChoreReference(reference, resolved.chores);
	return match.ok ? match.chore : errorResult(match.code, match.message);
}

interface UpdateOptions {
	readonly reference: string;
	readonly probe?: string;
	readonly full?: string;
	readonly fullEvery?: number;
	readonly timeoutMs?: number;
	readonly json: boolean;
}

function parseUpdate(args: readonly string[]): UpdateOptions | ChoreVerbResult {
	const reference = args[0];
	if (!reference || reference.startsWith("--")) {
		return errorResult("E-ARG", "update requires <name|scope:name>");
	}
	let probe: string | undefined;
	let full: string | undefined;
	let fullEvery: number | undefined;
	let timeoutMs: number | undefined;
	let json = false;
	let changed = false;
	for (let index = 1; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--json") {
			json = true;
			continue;
		}
		if (arg !== "--probe" && arg !== "--full" && arg !== "--full-every" && arg !== "--timeout") {
			return errorResult("E-ARG", `unknown update flag '${arg ?? ""}'`);
		}
		const value = flagValue(args, index, arg, arg === "--probe" || arg === "--full");
		if (typeof value !== "string") return value;
		index += 1;
		changed = true;
		switch (arg) {
			case "--probe":
				if (!value.trim()) return errorResult("E-ARG", "--probe takes a non-empty command");
				probe = value;
				break;
			case "--full":
				if (!value.trim()) return errorResult("E-ARG", "--full takes a non-empty command");
				full = value;
				break;
			case "--full-every": {
				const parsed = positiveInteger(value, "--full-every");
				if (typeof parsed !== "number") return parsed;
				fullEvery = parsed;
				break;
			}
			case "--timeout": {
				const parsed = positiveInteger(value, "--timeout");
				if (typeof parsed !== "number") return parsed;
				timeoutMs = parsed;
				break;
			}
		}
	}
	if (!changed) {
		return errorResult(
			"E-ARG",
			"update requires at least one of --probe, --full, --full-every, or --timeout",
		);
	}
	return {
		reference,
		...(probe !== undefined ? { probe } : {}),
		...(full !== undefined ? { full } : {}),
		...(fullEvery !== undefined ? { fullEvery } : {}),
		...(timeoutMs !== undefined ? { timeoutMs } : {}),
		json,
	};
}

export function updateVerb(args: readonly string[], deps: ChoreVerbDeps): ChoreVerbResult {
	const options = parseUpdate(args);
	if ("exitCode" in options) return options;
	const chore = resolveReference(options.reference, deps);
	if ("exitCode" in chore) return chore;
	const roster = loadWritableRoster(chore.scope, deps);
	if (isVerbResult(roster)) return roster;
	const full = options.full ?? chore.full;
	const fullEvery = options.fullEvery ?? chore.fullEvery;
	if (fullEvery !== undefined && full === undefined) {
		return errorResult("E-ARG", "--full-every requires a configured --full command");
	}
	const updated: Chore = {
		...chore,
		probe: options.probe ?? chore.probe,
		...(full !== undefined ? { full } : {}),
		...(fullEvery !== undefined ? { fullEvery } : {}),
		timeoutMs: options.timeoutMs ?? chore.timeoutMs,
	};
	const next: ChoreRoster = {
		...roster,
		chores: roster.chores.map((entry) => (entry.name === chore.name ? updated : entry)),
	};
	const writeError = writeRoster(chore.scope, next, deps);
	if (writeError) return writeError;
	return okResult(
		options.json
			? JSON.stringify(updated, null, 2)
			: `updated ${choreKey(updated)} — probe '${updated.probe}'`,
		authoringNotices(updated, deps).join("\n"),
	);
}

export function ackVerb(args: readonly string[], deps: ChoreVerbDeps): ChoreVerbResult {
	const options = parseReference(args, "ack");
	if ("exitCode" in options) return options;
	const chore = resolveReference(options.reference, deps);
	if ("exitCode" in chore) return chore;
	const state = loadState(deps);
	if (isVerbResult(state)) return state;
	const key = stateKey(chore, deps.worktreeRoot);
	const entry = state.entries[key];
	if (!entry?.pending && !entry?.pendingInstrumentChange) {
		return errorResult("E-ARG", `chore '${choreKey(chore)}' has no pending delta`);
	}
	const acked = ackPending(entry);
	const next: ChoreState = {
		version: 1,
		entries: { ...state.entries, [key]: acked },
	};
	const writeError = writeState(next, deps);
	if (writeError) return writeError;
	return okResult(
		options.json
			? JSON.stringify({ acked: choreKey(chore), baseline: acked.baseline }, null, 2)
			: `acked ${choreKey(chore)} at ${acked.baseline}`,
	);
}

interface RemoveOptions extends ReferenceOptions {
	readonly reason: string;
}

function parseRemove(args: readonly string[]): RemoveOptions | ChoreVerbResult {
	const base = parseReference(args, "remove");
	if ("exitCode" in base) return base;
	const reasonIndex = args.indexOf("--reason");
	if (reasonIndex === -1) return errorResult("E-ARG", "remove requires --reason '<why>'");
	const reason = args[reasonIndex + 1];
	if (reason === undefined) {
		return errorResult("E-ARG", "--reason takes a value");
	}
	return { ...base, reason };
}

export function removeVerb(args: readonly string[], deps: ChoreVerbDeps): ChoreVerbResult {
	const options = parseRemove(args);
	if ("exitCode" in options) return options;
	const chore = resolveReference(options.reference, deps);
	if ("exitCode" in chore) return chore;
	const roster = loadWritableRoster(chore.scope, deps);
	if (isVerbResult(roster)) return roster;
	const stateStatus = deps.store.stateStatus();
	if (stateStatus === "malformed") {
		return errorResult("E-NOREG", "per-seat chore state is malformed");
	}
	const state = stateStatus === "ok" ? deps.store.readState() : undefined;
	const record = {
		scope: chore.scope,
		name: chore.name,
		reason: options.reason,
		removedAt: deps.now(),
	} as const;
	const recorded: ChoreRoster = {
		...roster,
		removals: [...roster.removals, record],
	};
	const recordError = writeRoster(chore.scope, recorded, deps);
	if (recordError) return recordError;

	if (state) {
		const key = stateKey(chore, deps.worktreeRoot);
		if (Object.hasOwn(state.entries, key)) {
			const entries = { ...state.entries };
			delete entries[key];
			const stateError = writeState({ version: 1, entries }, deps);
			if (stateError) return stateError;
		}
	}

	const removed: ChoreRoster = {
		...recorded,
		chores: recorded.chores.filter((entry) => entry.name !== chore.name),
	};
	const removeError = writeRoster(chore.scope, removed, deps);
	if (removeError) return removeError;

	return okResult(
		options.json
			? JSON.stringify(
					{
						removed: choreKey(chore),
						reason: record.reason,
						removedAt: record.removedAt,
					},
					null,
					2,
				)
			: `removed ${choreKey(chore)} — ${record.reason}`,
	);
}

export function dispatchChore(args: readonly string[], deps: ChoreVerbDeps): ChoreVerbResult {
	const subverb = args[0];
	const rest = args.slice(1);
	switch (subverb) {
		case "add":
			return addVerb(rest, deps);
		case "update":
			return updateVerb(rest, deps);
		case "run":
			return runVerb(rest, deps);
		case "list":
			return listVerb(rest, deps);
		case "ack":
			return ackVerb(rest, deps);
		case "remove":
			return removeVerb(rest, deps);
		default:
			return errorResult("E-ARG", `unknown chore subverb '${subverb ?? ""}'`);
	}
}
