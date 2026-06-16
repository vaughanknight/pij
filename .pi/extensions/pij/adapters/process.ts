// pij-messaging — ProcessPort adapter (real OS seams).
//
// pid + liveness via signal 0 (ESRCH → gone, EPERM → exists but not ours →
// still alive), wall clock, and process env (PIJ_SESSION_ID lookup). Kept
// trivial so the deterministic FakeProcess can stand in for it in tests.

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
