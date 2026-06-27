// pij-control-plane — the daemon's in-memory index over ~/.pij/ (pure, Plan 019).
//
// The daemon keeps a live index of every session so it can: find `pending`
// spawns to drive, resolve a discovered transcript / pane back to its pij-id,
// and — critically — know which sessions ALREADY had their init injected so a
// daemon restart never re-injects (init-exactly-once, AC-02/12). All of that is
// reconstructible from the descriptors on disk: `rebuild()` is pure and total,
// so killing + restarting the daemon loses no binding and duplicates no init.

import { shouldInjectInit } from "../binding.js";
import type { SessionDescriptor, SessionId } from "../types.js";

export class IndexState {
	private readonly byId = new Map<SessionId, SessionDescriptor>();
	private readonly byHarnessSession = new Map<string, SessionId>();
	private readonly byPane = new Map<string, SessionId>();

	/** Build a fresh index from a descriptor snapshot (e.g. `registry.list()`). */
	static from(descriptors: readonly SessionDescriptor[]): IndexState {
		const s = new IndexState();
		s.rebuild(descriptors);
		return s;
	}

	/** Replace the whole index from the current on-disk snapshot (AC-12). */
	rebuild(descriptors: readonly SessionDescriptor[]): void {
		this.byId.clear();
		this.byHarnessSession.clear();
		this.byPane.clear();
		for (const d of descriptors) {
			this.byId.set(d.id, d);
			if (d.harnessSessionId) this.byHarnessSession.set(d.harnessSessionId, d.id);
			if (d.paneId) this.byPane.set(d.paneId, d.id);
		}
	}

	/** The descriptor for a pij-id (or undefined). */
	get(id: SessionId): SessionDescriptor | undefined {
		return this.byId.get(id);
	}

	/** Every indexed descriptor. */
	all(): SessionDescriptor[] {
		return [...this.byId.values()];
	}

	/** Reverse-resolve a harness-native session id (a discovered transcript stem)
	 *  back to its pij-id (AC-03 binding lookup). */
	resolveHarnessSession(harnessSessionId: string): SessionId | undefined {
		return this.byHarnessSession.get(harnessSessionId);
	}

	/** Reverse-resolve a tmux pane id back to its pij-id. */
	resolvePane(paneId: string): SessionId | undefined {
		return this.byPane.get(paneId);
	}

	/** Sessions the daemon must still drive to readiness (lifecycle `pending`). */
	pending(): SessionDescriptor[] {
		return this.all().filter((d) => d.lifecycle === "pending");
	}

	/** Init-exactly-once gate from the persisted marker (AC-02/12): false once
	 *  `initInjectedAt` is set, so a restart re-reads it and skips injection.
	 *  Unknown id ⇒ false (nothing to inject for a session we don't track). */
	needsInit(id: SessionId): boolean {
		const d = this.byId.get(id);
		return d ? shouldInjectInit(d) : false;
	}
}
