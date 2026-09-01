export interface SessionNamePublisherDeps {
	setSessionName(name: string): Promise<unknown>;
	getSessionName?(): string | undefined;
	setStatus(key: string, text: string): void;
	notice(text: string): void;
	sleep(ms: number): Promise<void>;
}

export const PIJ_STATUS_KEY = "pij";

export const DEFAULT_SESSION_NAME_SCHEDULE_MS = [0, 250, 1_000, 3_000, 10_000] as const;

export async function publishSeatName(
	deps: SessionNamePublisherDeps,
	self: string,
	schedule: readonly number[] = DEFAULT_SESSION_NAME_SCHEDULE_MS,
): Promise<{ took: boolean; attempts: number }> {
	deps.setStatus(PIJ_STATUS_KEY, self);

	let attempts = 0;
	let previousAt = 0;
	for (const scheduledAt of schedule) {
		const waitMs = Math.max(0, scheduledAt - previousAt);
		previousAt = scheduledAt;
		if (waitMs > 0) await deps.sleep(waitMs);

		attempts += 1;
		try {
			await deps.setSessionName(self);
		} catch {
			continue;
		}

		if (deps.getSessionName) {
			try {
				if (deps.getSessionName() === self) return { took: true, attempts };
			} catch {
				// A stale session manager is equivalent to a failed readback; retry.
			}
		}
	}

	deps.notice(`pij: could not set omp session name — id is ${self}`);
	return { took: false, attempts };
}
