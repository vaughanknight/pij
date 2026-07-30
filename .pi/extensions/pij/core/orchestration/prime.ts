// pij-orchestration — pure prime designation over the shared registry port.

import type { RegistryPort } from "../ports.js";
import { err, ok, type Result, type SessionId } from "../types.js";

export interface PrimeChange {
	readonly id: SessionId;
	readonly prime: boolean;
	readonly oldPrime: boolean;
	readonly changed: boolean;
	readonly previousDesignation?: PrimeDesignation;
	readonly designation?: PrimeDesignation;
}

export type PrimeDesignation = "prime" | "old-prime";

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
		const previousDesignation =
			descriptor.prime === true ? "prime" : descriptor.oldPrime === true ? "old-prime" : undefined;
		const designation = prime ? "prime" : oldPrime ? "old-prime" : undefined;
		// Declares "cli": PrimeService OWNS prime/oldPrime, so its computed values must
		// win. Without the declaration the write law would take both from disk and the
		// verb would silently no-op — the inversion the law's own header warns about.
		if (changed) this.registry.write({ ...descriptor, prime, oldPrime }, "cli");
		return ok({
			id,
			prime,
			oldPrime,
			changed,
			...(previousDesignation === undefined ? {} : { previousDesignation }),
			...(designation === undefined ? {} : { designation }),
		});
	}
}
