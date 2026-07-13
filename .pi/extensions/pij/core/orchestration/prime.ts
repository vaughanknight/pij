// pij-orchestration — pure prime designation over the shared registry port.

import type { RegistryPort } from "../ports.js";
import { err, ok, type Result, type SessionId } from "../types.js";

export interface PrimeChange {
	readonly id: SessionId;
	readonly prime: boolean;
	readonly oldPrime: boolean;
	readonly changed: boolean;
}

export class PrimeService {
	constructor(private readonly registry: RegistryPort) {}

	set(id: SessionId): Result<PrimeChange> {
		return this.update(id, true, false);
	}

	retire(id: SessionId): Result<PrimeChange> {
		return this.update(id, false, true);
	}

	unset(id: SessionId): Result<PrimeChange> {
		return this.update(id, false, false);
	}

	private update(id: SessionId, prime: boolean, oldPrime: boolean): Result<PrimeChange> {
		const descriptor = this.registry.read(id);
		if (!descriptor) return err("E-NOID", `no session '${id}' in registry`);
		const changed = descriptor.prime !== prime || descriptor.oldPrime !== oldPrime;
		if (changed) this.registry.write({ ...descriptor, prime, oldPrime });
		return ok({ id, prime, oldPrime, changed });
	}
}
