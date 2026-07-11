// pij-orchestration — pure prime designation over the shared registry port.

import type { RegistryPort } from "../ports.js";
import { err, ok, type Result, type SessionId } from "../types.js";

export interface PrimeChange {
	readonly id: SessionId;
	readonly prime: boolean;
	readonly changed: boolean;
}

export class PrimeService {
	constructor(private readonly registry: RegistryPort) {}

	set(id: SessionId): Result<PrimeChange> {
		return this.update(id, true);
	}

	unset(id: SessionId): Result<PrimeChange> {
		return this.update(id, false);
	}

	private update(id: SessionId, prime: boolean): Result<PrimeChange> {
		const descriptor = this.registry.read(id);
		if (!descriptor) return err("E-NOID", `no session '${id}' in registry`);
		const changed = descriptor.prime !== prime;
		if (changed) this.registry.write({ ...descriptor, prime });
		return ok({ id, prime, changed });
	}
}
