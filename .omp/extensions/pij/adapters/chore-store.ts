import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type ChoreRoster,
	type ChoreRosterStatus,
	type ChoreScope,
	type ChoreState,
	type ChoreStorePort,
	parseChoreRoster,
	parseChoreState,
} from "../core/chores/types.js";
import { writeFormattedJsonAtomic, writeJsonAtomic } from "./atomic-file.js";

const FLEET_CHORE_DIR = "pij-chores";

export interface FsChoreStoreOptions {
	readonly pijHome: string;
	readonly seatId?: string;
	readonly repoRoot?: string;
}

export class FsChoreStore implements ChoreStorePort {
	constructor(private readonly options: FsChoreStoreOptions) {}

	rosterPath(scope: ChoreScope): string | undefined {
		switch (scope) {
			case "seat":
				return this.options.seatId
					? join(this.options.pijHome, this.options.seatId, "chores.json")
					: undefined;
			case "repo":
				return this.options.repoRoot
					? join(this.options.repoRoot, ".pij", "chores.json")
					: undefined;
			case "fleet":
				return join(this.options.pijHome, FLEET_CHORE_DIR, "chores.json");
		}
	}

	rosterStatus(scope: ChoreScope): ChoreRosterStatus {
		const path = this.rosterPath(scope);
		if (!path) return "unavailable";
		if (!existsSync(path)) return "missing";
		return this.readRoster(scope) ? "ok" : "malformed";
	}

	readRoster(scope: ChoreScope): ChoreRoster | undefined {
		const path = this.rosterPath(scope);
		if (!path) return undefined;
		try {
			const parsed = parseChoreRoster(JSON.parse(readFileSync(path, "utf8")) as unknown);
			if (!parsed) return undefined;
			if (parsed.chores.some((chore) => chore.scope !== scope)) return undefined;
			if (parsed.removals.some((record) => record.scope !== scope)) return undefined;
			return parsed;
		} catch {
			return undefined;
		}
	}

	writeRoster(scope: ChoreScope, roster: ChoreRoster): void {
		const path = this.rosterPath(scope);
		if (!path) throw new Error(`${scope} chore roster is unavailable`);
		const parsed = parseChoreRoster(roster);
		if (
			!parsed ||
			parsed.chores.some((chore) => chore.scope !== scope) ||
			parsed.removals.some((record) => record.scope !== scope)
		) {
			throw new Error(`invalid ${scope} chore roster`);
		}
		if (scope === "repo") {
			writeFormattedJsonAtomic(path, parsed);
		} else {
			writeJsonAtomic(path, parsed);
		}
	}

	statePath(): string | undefined {
		return this.options.seatId
			? join(this.options.pijHome, this.options.seatId, "chore-state.json")
			: undefined;
	}

	stateStatus(): ChoreRosterStatus {
		const path = this.statePath();
		if (!path) return "unavailable";
		if (!existsSync(path)) return "missing";
		return this.readState() ? "ok" : "malformed";
	}

	readState(): ChoreState | undefined {
		const path = this.statePath();
		if (!path) return undefined;
		try {
			return parseChoreState(JSON.parse(readFileSync(path, "utf8")) as unknown);
		} catch {
			return undefined;
		}
	}

	writeState(state: ChoreState): void {
		const path = this.statePath();
		if (!path) throw new Error("per-seat chore state is unavailable");
		const parsed = parseChoreState(state);
		if (!parsed) throw new Error("invalid chore state");
		writeJsonAtomic(path, parsed);
	}
}
