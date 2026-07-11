// pij-messaging — in-memory fake adapters (Pattern P8: tests target these,
// not the wiring). Mock-free: real small implementations of every port.

import { filterEvents } from "../core/events.js";
import {
	type BatonDefinition,
	type BatonLease,
	type BatonLogEntry,
	type BatonNotice,
	type BatonNoticeReceipt,
	type BatonNoticeSink,
	type BatonResult,
	type BatonStorePort,
	batonErr,
	batonOk,
} from "../core/orchestration/baton.js";
import type {
	DeliveryPort,
	EventLogPort,
	NewWindowOpts,
	PiRuntimePort,
	ProcessPort,
	RegistryPort,
	SplitWindowOpts,
	TmuxPort,
} from "../core/ports.js";
import {
	type EventQuery,
	err,
	ok,
	type PijEvent,
	type PijMessage,
	type ReceiptState,
	type Result,
	type SessionDescriptor,
	type SessionId,
} from "../core/types.js";

export class FakeBatonStore implements BatonStorePort {
	readonly definitions = new Map<string, BatonDefinition>();
	readonly leases = new Map<string, BatonLease>();
	readonly logs: BatonLogEntry[] = [];
	private readonly failures = new Map<
		"appendLog" | "writeDefinition" | "claimLease" | "releaseLease",
		number
	>();

	constructor(
		definitions: readonly BatonDefinition[] = [],
		leases: readonly (readonly [string, BatonLease])[] = [],
	) {
		for (const definition of definitions) this.definitions.set(definition.name, definition);
		for (const [name, lease] of leases) this.leases.set(name, lease);
	}

	failNext(operation: "appendLog" | "writeDefinition" | "claimLease" | "releaseLease"): void {
		this.failures.set(operation, (this.failures.get(operation) ?? 0) + 1);
	}

	private shouldFail(
		operation: "appendLog" | "writeDefinition" | "claimLease" | "releaseLease",
	): boolean {
		const remaining = this.failures.get(operation) ?? 0;
		if (remaining === 0) return false;
		if (remaining === 1) this.failures.delete(operation);
		else this.failures.set(operation, remaining - 1);
		return true;
	}

	listDefinitions(): BatonResult<readonly BatonDefinition[]> {
		return batonOk([...this.definitions.values()]);
	}

	readDefinition(name: string): BatonResult<BatonDefinition | null> {
		return batonOk(this.definitions.get(name) ?? null);
	}

	writeDefinition(definition: BatonDefinition): BatonResult<void> {
		if (this.shouldFail("writeDefinition")) {
			return batonErr("E-STORE", "injected fake definition write failure");
		}
		this.definitions.set(definition.name, definition);
		return batonOk(undefined);
	}

	readLease(name: string): BatonResult<BatonLease | null> {
		return batonOk(this.leases.get(name) ?? null);
	}

	claimLease(name: string, lease: BatonLease): BatonResult<"claimed" | "held"> {
		if (this.shouldFail("claimLease")) {
			return batonErr("E-STORE", "injected fake lease claim failure");
		}
		if (this.leases.has(name)) return batonOk("held");
		this.leases.set(name, lease);
		return batonOk("claimed");
	}

	releaseLease(name: string, leaseId: string): BatonResult<"released" | "missing" | "mismatch"> {
		if (this.shouldFail("releaseLease")) {
			return batonErr("E-STORE", "injected fake lease release failure");
		}
		const lease = this.leases.get(name);
		if (!lease) return batonOk("missing");
		if (lease.leaseId !== leaseId) return batonOk("mismatch");
		this.leases.delete(name);
		return batonOk("released");
	}

	appendLog(entry: BatonLogEntry): BatonResult<void> {
		if (this.shouldFail("appendLog")) {
			return batonErr("E-STORE", "injected fake log append failure");
		}
		this.logs.push(entry);
		return batonOk(undefined);
	}
}

export class FakeBatonNoticeSink implements BatonNoticeSink {
	readonly outbox: BatonNotice[] = [];
	private sequence = 0;

	constructor(private readonly state: ReceiptState = "delivered") {}

	push(notice: BatonNotice): BatonNoticeReceipt {
		this.sequence += 1;
		this.outbox.push(notice);
		return { state: this.state, messageId: `baton-fake-${this.sequence}` };
	}
}

export class FakeRegistry implements RegistryPort {
	private readonly map = new Map<SessionId, SessionDescriptor>();

	constructor(initial: readonly SessionDescriptor[] = []) {
		for (const d of initial) this.map.set(d.id, d);
	}

	list(): SessionDescriptor[] {
		return [...this.map.values()].filter((d) => d.lifecycle !== "dissolved");
	}
	read(id: SessionId): SessionDescriptor | null {
		return this.map.get(id) ?? null;
	}
	write(descriptor: SessionDescriptor): void {
		const existing = this.map.get(descriptor.id);
		if (
			existing?.lifecycle === "dissolved" &&
			descriptor.lifecycle !== undefined &&
			descriptor.lifecycle !== "dissolved" &&
			descriptor.pid === existing.pid
		) {
			return;
		}
		this.map.set(descriptor.id, descriptor);
	}
	remove(id: SessionId): void {
		this.map.delete(id);
	}
	dissolve(id: SessionId): void {
		const existing = this.map.get(id);
		if (!existing || existing.lifecycle === "dissolved") return;
		this.map.set(id, { ...existing, lifecycle: "dissolved", state: "idle" });
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
	/** Recorded splitWindow calls, in order. */
	readonly splits: Array<{ opts: SplitWindowOpts; paneId: string }> = [];
	/** Recorded killWindow pane ids, in order. */
	readonly killed: string[] = [];
	/** Recorded killPane pane ids, in order (close() uses killPane). */
	readonly killedPanes: string[] = [];
	/** Synthetic session name returned by currentSession().
	 *  null = not inside tmux (enables E-NOTMUX unit tests — F004). */
	readonly sessionName: string | null;

	private paneCounter: number;
	private readonly curPane: string;
	/** Panes "in the current window": orchestrator pane + live split children. */
	private readonly windowPanes: Set<string>;

	constructor({
		paneStart = 900,
		sessionName = "fake-session",
		currentPane = "%500",
		windowPanes = [],
	}: {
		paneStart?: number;
		sessionName?: string | null;
		currentPane?: string;
		windowPanes?: readonly string[];
	} = {}) {
		this.paneCounter = paneStart;
		this.sessionName = sessionName;
		this.curPane = currentPane;
		this.windowPanes = new Set([currentPane, ...windowPanes]);
	}

	newWindow(opts: NewWindowOpts): Result<{ paneId: string }> {
		const paneId = `%${this.paneCounter++}`;
		this.windows.push({ opts, paneId });
		return ok({ paneId });
	}

	splitWindow(opts: SplitWindowOpts): Result<{ paneId: string }> {
		const paneId = `%${this.paneCounter++}`;
		this.splits.push({ opts, paneId });
		this.windowPanes.add(paneId);
		return ok({ paneId });
	}

	killWindow(paneId: string): Result<void> {
		this.killed.push(paneId);
		return ok(undefined);
	}

	killPane(paneId: string): Result<void> {
		this.killedPanes.push(paneId);
		this.windowPanes.delete(paneId);
		return ok(undefined);
	}

	currentSession(): string | null {
		return this.sessionName;
	}

	currentPane(): string | null {
		return this.sessionName === null ? null : this.curPane;
	}

	currentWindowPanes(): string[] {
		return [...this.windowPanes];
	}
}
