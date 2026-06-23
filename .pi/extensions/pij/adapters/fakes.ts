// pij-messaging — in-memory fake adapters (Pattern P8: tests target these,
// not the wiring). Mock-free: real small implementations of every port.

import { filterEvents } from "../core/events.js";
import type {
	DeliveryPort,
	EventLogPort,
	NewWindowOpts,
	PiRuntimePort,
	ProcessPort,
	RegistryPort,
	TmuxPort,
} from "../core/ports.js";
import {
	type EventQuery,
	err,
	ok,
	type PijEvent,
	type PijMessage,
	type Result,
	type SessionDescriptor,
	type SessionId,
} from "../core/types.js";

export class FakeRegistry implements RegistryPort {
	private readonly map = new Map<SessionId, SessionDescriptor>();

	constructor(initial: readonly SessionDescriptor[] = []) {
		for (const d of initial) this.map.set(d.id, d);
	}

	list(): SessionDescriptor[] {
		return [...this.map.values()];
	}
	read(id: SessionId): SessionDescriptor | null {
		return this.map.get(id) ?? null;
	}
	write(descriptor: SessionDescriptor): void {
		this.map.set(descriptor.id, descriptor);
	}
	remove(id: SessionId): void {
		this.map.delete(id);
	}
}

export class FakeEventLog implements EventLogPort {
	private readonly events: PijEvent[] = [];

	constructor(initial: readonly PijEvent[] = []) {
		this.events.push(...initial);
	}

	append(event: PijEvent): void {
		this.events.push(event);
	}
	read(query?: EventQuery): PijEvent[] {
		return filterEvents(this.events, query);
	}
	lastSeq(): number {
		let max = 0;
		for (const e of this.events) if (e.seq > max) max = e.seq;
		return max;
	}
	count(): number {
		return this.events.length;
	}
}

export class FakeDelivery implements DeliveryPort {
	/** Everything delivered, in order — assert against this in tests. */
	readonly outbox: Array<{ messageId: string; message: PijMessage }> = [];
	private seq = 0;

	/** Known target ids; empty set means "accept all". */
	constructor(private readonly knownIds: ReadonlySet<SessionId> = new Set()) {}

	deliver(message: PijMessage): Result<{ messageId: string }> {
		if (this.knownIds.size > 0 && !this.knownIds.has(message.to)) {
			return err("E-NOID", `no such session '${message.to}'`);
		}
		this.seq += 1;
		const messageId = `fake-${this.seq}`;
		this.outbox.push({ messageId, message });
		return ok({ messageId });
	}
}

export class FakePiRuntime implements PiRuntimePort {
	readonly injects: Array<{ text: string; mode: "immediate" | "steer" }> = [];
	compactCount = 0;
	/** Control ops that fired (only when armed). Assert against this in tests. */
	readonly controlCalls: Array<"new" | "reload"> = [];

	constructor(
		private idle = true,
		/** When false, control() returns false (no command context armed). */
		private armed = true,
	) {}

	setIdle(idle: boolean): void {
		this.idle = idle;
	}
	setArmed(armed: boolean): void {
		this.armed = armed;
	}
	isIdle(): boolean {
		return this.idle;
	}
	inject(text: string, mode: "immediate" | "steer"): void {
		this.injects.push({ text, mode });
	}
	compact(): void {
		this.compactCount += 1;
	}
	control(command: "new" | "reload"): boolean {
		if (!this.armed) return false;
		this.controlCalls.push(command);
		return true;
	}
}

export class FakeProcess implements ProcessPort {
	private readonly alive = new Set<number>();

	constructor(
		private readonly selfPid = 1000,
		private nowMs = 0,
		private readonly vars: Record<string, string> = {},
		alivePids: readonly number[] = [1000],
	) {
		for (const p of alivePids) this.alive.add(p);
	}

	pid(): number {
		return this.selfPid;
	}
	isAlive(pid: number): boolean {
		return this.alive.has(pid);
	}
	now(): number {
		return this.nowMs;
	}
	env(key: string): string | undefined {
		return this.vars[key];
	}

	// ─── test helpers ───────────────────────────────────────────────
	advance(ms: number): void {
		this.nowMs += ms;
	}
	kill(pid: number): void {
		this.alive.delete(pid);
	}
}

export class FakeTmux implements TmuxPort {
	/** Recorded newWindow calls, in order. Assert against this in tests. */
	readonly windows: Array<{ opts: NewWindowOpts; paneId: string }> = [];
	/** Recorded killWindow pane ids, in order. */
	readonly killed: string[] = [];
	/** Synthetic session name returned by currentSession(). */
	readonly sessionName: string;

	private paneCounter: number;

	constructor({
		paneStart = 900,
		sessionName = "fake-session",
	}: { paneStart?: number; sessionName?: string } = {}) {
		this.paneCounter = paneStart;
		this.sessionName = sessionName;
	}

	newWindow(opts: NewWindowOpts): Result<{ paneId: string }> {
		const paneId = `%${this.paneCounter++}`;
		this.windows.push({ opts, paneId });
		return ok({ paneId });
	}

	killWindow(paneId: string): Result<void> {
		this.killed.push(paneId);
		return ok(undefined);
	}

	currentSession(): string | null {
		return this.sessionName;
	}
}
