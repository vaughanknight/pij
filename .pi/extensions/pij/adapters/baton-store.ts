import { randomUUID } from "node:crypto";
import {
	appendFileSync,
	closeSync,
	linkSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
	type BatonDefinition,
	type BatonLease,
	type BatonLeaseHistory,
	type BatonLogEntry,
	type BatonRequest,
	type BatonResult,
	type BatonStorePort,
	batonErr,
	batonOk,
} from "../core/orchestration/baton.js";
import { maybeFsyncSync, writeJsonAtomic } from "./atomic-file.js";

const BATON_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isRequest(value: unknown): value is BatonRequest {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === "string" &&
		typeof value.requester === "string" &&
		typeof value.purpose === "string" &&
		(value.pin === undefined || typeof value.pin === "string") &&
		(value.declaredEvidence === undefined || typeof value.declaredEvidence === "string") &&
		typeof value.requestedAt === "string"
	);
}

function isLease(value: unknown): value is BatonLease {
	if (!isRecord(value)) return false;
	return (
		typeof value.leaseId === "string" &&
		typeof value.holder === "string" &&
		typeof value.purpose === "string" &&
		(value.pin === undefined || typeof value.pin === "string") &&
		(value.declaredEvidence === undefined || typeof value.declaredEvidence === "string") &&
		typeof value.grantedBy === "string" &&
		typeof value.requestedAt === "string" &&
		typeof value.grantedAt === "string"
	);
}

function isLeaseHistory(value: unknown): value is BatonLeaseHistory {
	if (!isLease(value) || !isRecord(value)) return false;
	return (
		(value.endedAt === undefined || typeof value.endedAt === "string") &&
		(value.endKind === undefined || value.endKind === "return" || value.endKind === "reclaim") &&
		(value.evidence === undefined || typeof value.evidence === "string")
	);
}

function isDefinition(value: unknown): value is BatonDefinition {
	if (!isRecord(value) || !Array.isArray(value.queue)) return false;
	const lastLease = value.lastLease;
	const holderHealth = value.holderHealth;
	return (
		typeof value.name === "string" &&
		typeof value.resource === "string" &&
		(value.probe === undefined || typeof value.probe === "string") &&
		(value.repo === undefined || typeof value.repo === "string") &&
		typeof value.createdBy === "string" &&
		typeof value.createdAt === "string" &&
		value.queue.every(isRequest) &&
		(lastLease === undefined || isLeaseHistory(lastLease)) &&
		(holderHealth === undefined ||
			(isRecord(holderHealth) &&
				typeof holderHealth.leaseId === "string" &&
				(holderHealth.status === "healthy" ||
					holderHealth.status === "dead" ||
					holderHealth.status === "stalled" ||
					holderHealth.status === "unknown")))
	);
}

export class FsBatonStore implements BatonStorePort {
	constructor(private readonly pijHome: string) {}

	private orchestrationDir(): string {
		return join(this.pijHome, "orchestration");
	}

	private batonsDir(): string {
		return join(this.orchestrationDir(), "batons");
	}

	definitionPath(name: string): string {
		return join(this.batonsDir(), `${encodeURIComponent(name)}.json`);
	}

	leasePath(name: string): string {
		return join(this.batonsDir(), `${encodeURIComponent(name)}.lease`);
	}

	listDefinitions(): BatonResult<readonly BatonDefinition[]> {
		try {
			const definitions: BatonDefinition[] = [];
			for (const file of readdirSync(this.batonsDir()).sort()) {
				if (!file.endsWith(".json")) continue;
				const parsed = this.readJson(join(this.batonsDir(), file));
				if (isDefinition(parsed)) definitions.push(parsed);
			}
			return batonOk(definitions);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return batonOk([]);
			return batonErr("E-STORE", `cannot list baton definitions: ${String(error)}`);
		}
	}

	readDefinition(name: string): BatonResult<BatonDefinition | null> {
		const valid = this.validateName(name);
		if (!valid.ok) return valid;
		const parsed = this.readJson(this.definitionPath(name));
		return batonOk(isDefinition(parsed) ? parsed : null);
	}

	writeDefinition(definition: BatonDefinition): BatonResult<void> {
		const valid = this.validateName(definition.name);
		if (!valid.ok) return valid;
		const path = this.definitionPath(definition.name);
		try {
			writeJsonAtomic(path, definition);
			return batonOk(undefined);
		} catch (error) {
			return batonErr("E-STORE", `cannot write baton '${definition.name}': ${String(error)}`);
		}
	}

	readLease(name: string): BatonResult<BatonLease | null> {
		const valid = this.validateName(name);
		if (!valid.ok) return valid;
		const parsed = this.readJson(this.leasePath(name));
		return batonOk(isLease(parsed) ? parsed : null);
	}

	claimLease(name: string, lease: BatonLease): BatonResult<"claimed" | "held"> {
		const valid = this.validateName(name);
		if (!valid.ok) return valid;
		const path = this.leasePath(name);
		const tmpPath = `${path}.claim-${process.pid}-${randomUUID()}`;
		let fd: number | undefined;
		try {
			mkdirSync(dirname(path), { recursive: true });
			fd = openSync(tmpPath, "wx");
			writeFileSync(fd, JSON.stringify(lease));
			maybeFsyncSync(fd);
			closeSync(fd);
			fd = undefined;
			try {
				linkSync(tmpPath, path);
				return batonOk("claimed");
			} catch (error) {
				return (error as NodeJS.ErrnoException).code === "EEXIST"
					? batonOk("held")
					: batonErr("E-STORE", `cannot publish baton lease '${name}': ${String(error)}`);
			}
		} catch (error) {
			return batonErr("E-STORE", `cannot stage baton lease '${name}': ${String(error)}`);
		} finally {
			if (fd !== undefined) closeSync(fd);
			rmSync(tmpPath, { force: true });
		}
	}

	releaseLease(name: string, leaseId: string): BatonResult<"released" | "missing" | "mismatch"> {
		const current = this.readLease(name);
		if (!current.ok) return current;
		if (!current.value) return batonOk("missing");
		if (current.value.leaseId !== leaseId) return batonOk("mismatch");
		try {
			rmSync(this.leasePath(name));
			return batonOk("released");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return batonOk("missing");
			return batonErr("E-STORE", `cannot release baton lease '${name}': ${String(error)}`);
		}
	}

	appendLog(entry: BatonLogEntry): BatonResult<void> {
		const path = join(this.orchestrationDir(), "log.ndjson");
		try {
			mkdirSync(dirname(path), { recursive: true });
			appendFileSync(path, `${JSON.stringify(entry)}\n`);
			return batonOk(undefined);
		} catch (error) {
			return batonErr("E-STORE", `cannot append baton log: ${String(error)}`);
		}
	}

	private readJson(path: string): unknown {
		try {
			return JSON.parse(readFileSync(path, "utf8"));
		} catch {
			return null;
		}
	}

	private validateName(name: string): BatonResult<string> {
		return BATON_NAME_RE.test(name)
			? batonOk(name)
			: batonErr(
					"E-ARG",
					`invalid baton name '${name}' (use letters, digits, dot, underscore, or hyphen)`,
				);
	}
}
