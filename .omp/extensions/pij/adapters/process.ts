// pij-messaging — ProcessPort adapter (real OS seams).
//
// pid + liveness via signal 0 (ESRCH → gone, EPERM → exists but not ours →
// still alive), wall clock, and process env (PIJ_SESSION_ID lookup). Kept
// trivial so the deterministic FakeProcess can stand in for it in tests.
//
// SUBPROCESS-FREE ON PURPOSE, enforced by `core/liveness-cost.test.ts`: this is
// the adapter the `pij list` / `pij state` READ PATH leans on, so a `ps` here
// would be N forks per listing. The once-per-sweep process-table capture the
// death sweep needs therefore lives in `adapters/process-snapshot.ts`, which
// nothing on the read path imports.

import type { ProcessPort } from "../core/ports.js";

export class NodeProcess implements ProcessPort {
	pid(): number {
		return process.pid;
	}

	isAlive(pid: number): boolean {
		try {
			process.kill(pid, 0); // signal 0 = existence probe, no actual signal
			return true;
		} catch (e) {
			return (e as NodeJS.ErrnoException).code === "EPERM"; // exists, not permitted
		}
	}

	now(): number {
		return Date.now();
	}

	env(key: string): string | undefined {
		return process.env[key];
	}
}
