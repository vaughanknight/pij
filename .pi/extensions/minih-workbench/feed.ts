import {
	diagnostic,
	type MinihAdapterResult,
	type MinihDiagnostic,
	type MinihInventorySnapshot,
	type MinihViewSnapshot,
} from "./store.js";

export interface MinihFeedSubscription {
	dispose(): void;
}

export interface MinihFeedTimers {
	setTimeout(callback: () => void, delayMs: number): unknown;
	clearTimeout(handle: unknown): void;
}

export interface MinihReadOnlyFeedOptions<TSnapshot> {
	read(): Promise<MinihAdapterResult<TSnapshot>>;
	onSnapshot(snapshot: TSnapshot): void;
	onDiagnostics(diagnostics: MinihDiagnostic[]): void;
	startWatcher?: (refresh: () => void) => MinihFeedSubscription;
	timers?: MinihFeedTimers;
	fallbackPollMs?: number;
	maxFallbackPolls?: number;
}

export interface MinihReadOnlyFeedHandle {
	start(): void;
	refresh(): void;
	dispose(): void;
	isDisposed(): boolean;
}

const DEFAULT_FALLBACK_POLL_MS = 2_000;
const DEFAULT_MAX_FALLBACK_POLLS = 3;

function defaultTimers(): MinihFeedTimers {
	return {
		setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
		clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export class MinihReadOnlyFeed<TSnapshot> implements MinihReadOnlyFeedHandle {
	private readonly timers: MinihFeedTimers;
	private disposed = false;
	private started = false;
	private refreshInFlight = false;
	private refreshQueued = false;
	private fallbackRemaining: number;
	private fallbackTimer: unknown;
	private subscription: MinihFeedSubscription | undefined;

	constructor(private readonly options: MinihReadOnlyFeedOptions<TSnapshot>) {
		this.timers = options.timers ?? defaultTimers();
		this.fallbackRemaining = options.maxFallbackPolls ?? DEFAULT_MAX_FALLBACK_POLLS;
	}

	start(): void {
		if (this.started || this.disposed) return;
		this.started = true;
		this.tryStartWatcher();
		this.refresh();
	}

	refresh(): void {
		if (this.disposed) return;
		if (this.refreshInFlight) {
			this.refreshQueued = true;
			return;
		}
		this.refreshInFlight = true;
		void this.options
			.read()
			.then((result) => {
				if (this.disposed) return;
				if (result.ok) this.options.onSnapshot(result.value);
				else {
					this.options.onDiagnostics([
						...result.diagnostics,
						diagnostic("warning", "MINIH_FEED_READ_FAILED", result.message, "adapter"),
					]);
				}
			})
			.catch((error: unknown) => {
				if (this.disposed) return;
				this.options.onDiagnostics([
					diagnostic(
						"warning",
						"MINIH_FEED_READ_THROWN",
						`feed read failed: ${errorMessage(error)}`,
						"adapter",
					),
				]);
			})
			.finally(() => {
				this.refreshInFlight = false;
				if (this.disposed) return;
				if (this.refreshQueued) {
					this.refreshQueued = false;
					this.refresh();
				}
			});
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.refreshQueued = false;
		if (this.fallbackTimer !== undefined) {
			this.timers.clearTimeout(this.fallbackTimer);
			this.fallbackTimer = undefined;
		}
		this.subscription?.dispose();
		this.subscription = undefined;
	}

	isDisposed(): boolean {
		return this.disposed;
	}

	private tryStartWatcher(): void {
		if (!this.options.startWatcher) return;
		try {
			this.subscription = this.options.startWatcher(() => this.refresh());
		} catch (error) {
			if (this.disposed) return;
			this.options.onDiagnostics([
				diagnostic(
					"warning",
					"MINIH_FEED_WATCHER_FAILED",
					`watcher failed; falling back to bounded polling: ${errorMessage(error)}`,
					"adapter",
				),
			]);
			this.scheduleFallbackPoll();
		}
	}

	private scheduleFallbackPoll(): void {
		if (this.disposed || this.fallbackRemaining <= 0 || this.fallbackTimer !== undefined) return;
		this.fallbackTimer = this.timers.setTimeout(() => {
			this.fallbackTimer = undefined;
			if (this.disposed) return;
			this.fallbackRemaining -= 1;
			this.refresh();
			this.scheduleFallbackPoll();
		}, this.options.fallbackPollMs ?? DEFAULT_FALLBACK_POLL_MS);
	}
}

export function createInventoryFeed(
	options: MinihReadOnlyFeedOptions<MinihInventorySnapshot>,
): MinihReadOnlyFeedHandle {
	return new MinihReadOnlyFeed(options);
}

export function createRunFeed(
	options: MinihReadOnlyFeedOptions<MinihViewSnapshot>,
): MinihReadOnlyFeedHandle {
	return new MinihReadOnlyFeed(options);
}
