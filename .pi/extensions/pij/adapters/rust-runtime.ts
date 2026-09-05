import { randomUUID } from "node:crypto";
import type { Registration, RustSeatDescriptor } from "../core/daemon-wire.js";
import { memorableIdentitySeed } from "../core/discovery.js";
import { type HeldRow, HOLD_TICK_MS, HoldQueue } from "../core/hold-queue.js";
import { memorablePijIdCandidates } from "../core/memorable-id.js";
import type { ModelEntry } from "../core/models/registry.js";
import type {
	DeliveryPort,
	EventLogPort,
	PiRuntimePort,
	RegistryPort,
	TmuxPort,
} from "../core/ports.js";
import {
	type BootInput,
	PijSession,
	type SessionShutdownReason,
	type SpawnOpts,
} from "../core/session.js";
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
import type { PijDaemonClient } from "./daemon-http.js";

interface RustBootInput extends Omit<BootInput, "id"> {
	readonly runtimeBin: "pi" | "omp";
	readonly piSessionId?: string;
	readonly actualModel?: string | null;
	readonly reason: SessionShutdownReason | "startup";
	readonly notice?: (text: string) => void;
}

interface TypingRuntimePort extends PiRuntimePort {
	onEditorChange?(cb: (at: number) => void): () => void;
	setStatus?(text: string | undefined): void;
}

/**
 * Snap-in recipe (composition owner: PM, index.ts unchanged):
 *
 * In the ONE session_start handler, for startup/reload/new/resume/fork:
 *   rustRuntime ??= new RustRuntimeSession(generation.client, new TmuxAdapter(), loadModels());
 *   rustRuntime.setClient(generation.client);
 *   rustRuntime.setPi(new PiRuntimeAdapter(pi, ctx, () => commandControl));
 *   const boot = await rustRuntime.boot({ ...existingBootInput, reason: event.reason });
 *   session = rustRuntime;
 *
 * boot arms the 1s held-message ticker; no external timer is needed. setPi binds
 * onTerminalInput through PiRuntimeAdapter.onEditorChange. Its status method
 * calls ctx.ui.setStatus("pij-held", text), separate from the seat-name status.
 * Existing session_shutdown wiring is exactly: session?.shutdown(event.reason).
 * That cancels the ticker, event stream, and input subscription; setPi rebinds
 * the fresh context on the next session_start, before boot can consume pushes.
 *
 * ASSUMPTIONS at the composition seam:
 * - The daemon persists a job before message.pushed and serializes ordinary
 *   claims per seat in job-id order, skipping pending rows whose not_before is future.
 * - hold returns a claim to pending and defers it; release makes it eligible
 *   immediately. Both requests carry job_id; repeated holds are idempotent per job.
 *   Release also declares cleared hold evidence even when its queue mutation is
 *   a typed no-op. Every ack is preceded by this declaration; RUNNING claims
 *   must remain owned when the daemon returns not-deferred (contract 2fe71151).
 * - Local notes are not ownership. Only a fresh normal claim permits inject
 *   and ack; all event and ticker work shares pushedChain.
 * - Boot discards local notes, then recovers the oldest LIVE row after
 *   registration and before the stream/ticker can claim ordinarily. This loop
 *   restores ORDER, not forced delivery: current grace may re-hold the head,
 *   ending recovery rather than spinning or injecting into active typing.
 *   The daemon still owns migration to successor seats on new/fork.
 * - The caller supplies current pi/OMP UI context before each boot. Raw input
 *   includes cursor/menu keys; direct inject/setEditorText is not terminal input.
 */
export class RustRuntimeSession {
	private readonly registry = new MemoryRegistry();
	private readonly eventLog = new MemoryEventLog();
	private readonly delivery = new BufferedDelivery();
	private readonly pi: MutablePiRuntime;
	private readonly session: PijSession;
	private client: PijDaemonClient;
	private self = "";
	private stopEvents: (() => void) | undefined;
	private flushChain: Promise<void> = Promise.resolve();
	private pushedChain: Promise<void> = Promise.resolve();
	private readonly lastInbound = new Map<string, string>();
	private holdQueue: HoldQueue | undefined;
	private readonly heldIds = new Map<string, number>();
	private lastEditAt: number | undefined;
	private stopEdits: (() => void) | undefined;
	private holdTicker: ReturnType<typeof setInterval> | undefined;
	private lifecycle = 0;

	constructor(
		client: PijDaemonClient,
		tmux: TmuxPort,
		models: readonly ModelEntry[],
		private readonly clock: () => number = () => Date.now(),
	) {
		this.client = client;
		this.pi = new MutablePiRuntime();
		this.session = new PijSession({
			registry: this.registry,
			eventLog: this.eventLog,
			delivery: this.delivery,
			pi: this.pi,
			process: {
				pid: () => process.pid,
				isAlive: (pid) => {
					try {
						process.kill(pid, 0);
						return true;
					} catch {
						return false;
					}
				},
				now: clock,
				env: (key) => process.env[key],
			},
			tmux,
			models,
		});
	}

	setClient(client: PijDaemonClient): void {
		this.client = client;
	}

	setPi(pi: TypingRuntimePort): void {
		this.stopEdits?.();
		this.pi.set(pi);
		this.stopEdits = pi.onEditorChange?.((at) => {
			this.lastEditAt = at;
			this.holdQueue?.noteEdit(at);
		});
	}

	async boot(input: RustBootInput): Promise<{ readonly id: string; readonly role?: string }> {
		const lifecycle = ++this.lifecycle;
		clearInterval(this.holdTicker);
		this.holdTicker = undefined;
		this.stopEvents?.();
		const previousSelf = this.self || undefined;
		const replacing =
			previousSelf !== undefined && (input.reason === "new" || input.reason === "fork");
		const procStart = this.client.processStart(process.pid);
		const seats = await this.client.seats();
		const id = this.chooseIdentity(input, procStart, seats, replacing);
		const registration = registrationFor(
			id,
			procStart,
			input,
			replacing ? previousSelf : undefined,
		);
		const accepted = await this.client.register(registration);
		const acceptedId = accepted.id;
		this.holdQueue = new HoldQueue(this.clock, accepted.typing_grace_ms ?? 60000);
		this.heldIds.clear();
		if (this.lastEditAt !== undefined) this.holdQueue.noteEdit(this.lastEditAt);
		this.pi.setStatus(undefined);
		const continuityRegistration = registrationFor(acceptedId, procStart, input);
		for (const seat of seats) this.registry.seed(fromRustDescriptor(seat));
		if (replacing && previousSelf) this.registry.dissolve(previousSelf);
		const boot = this.session.boot({ ...input, id: acceptedId });
		this.registry.seed(fromRustDescriptor(accepted));
		this.self = acceptedId;
		process.env.PIJ_SESSION_ID = acceptedId;
		await this.flush();
		await this.recoverInbox(acceptedId, this.client, lifecycle);
		this.stopEvents?.();
		this.stopEvents = await this.client.watchEvents(
			(frame) => {
				const seat = this.self;
				const client = this.client;
				if (frame.event.kind !== "message.pushed" || frame.event.seat !== seat) {
					this.session.capture("daemon_event", frame);
					return;
				}
				const consumed = this.pushedChain.then(() =>
					this.consumePushed(frame.event.payload, seat, client, lifecycle),
				);
				this.pushedChain = consumed.catch(() => undefined);
				return consumed;
			},
			(error) => this.session.capture("daemon_event_error", { message: error.message }),
			(notice) => {
				input.notice?.(notice);
				if (!notice.startsWith("pij: re-attached")) return;
				const seat = this.self;
				const client = this.client;
				this.pushedChain = this.pushedChain
					.then(() => this.ensureRegistration(seat, client, continuityRegistration))
					.catch((error: unknown) => {
						this.session.capture("daemon_event_error", {
							message: error instanceof Error ? error.message : String(error),
							stage: "reattach-registration",
						});
					});
			},
		);
		this.holdTicker = setInterval(() => {
			const client = this.client;
			const seat = this.self;
			this.pushedChain = this.pushedChain
				.then(() => this.pollHeld(seat, client, lifecycle))
				.catch((error: unknown) =>
					this.session.capture("daemon_event_release_error", {
						message: error instanceof Error ? error.message : String(error),
					}),
				);
		}, HOLD_TICK_MS);
		this.holdTicker.unref?.();
		return { id: boot.id, role: boot.role };
	}

	async send(to: string, body: string): Promise<string> {
		const msgId = randomUUID();
		const inReplyTo = this.lastInbound.get(to);
		await this.client.send({
			from: this.self,
			to: { seat: to },
			body,
			msg_id: msgId,
			...(inReplyTo === undefined ? {} : { in_reply_to: inReplyTo }),
		});
		if (inReplyTo !== undefined) this.lastInbound.delete(to);
		return msgId;
	}

	spawn(opts: SpawnOpts): ReturnType<PijSession["spawn"]> {
		const result = this.session.spawn(opts);
		void this.flush();
		return result;
	}

	close(id: SessionId): ReturnType<PijSession["close"]> {
		return this.session.close(id);
	}

	capture(type: string, data?: unknown): void {
		this.session.capture(type, data);
	}

	onTurnStart(iso: string): void {
		this.session.onTurnStart(iso);
		void this.flush();
	}

	onTurnEnd(): void {
		this.session.onTurnEnd();
	}

	shutdown(reason: SessionShutdownReason): void {
		++this.lifecycle;
		clearInterval(this.holdTicker);
		this.holdTicker = undefined;
		this.stopEdits?.();
		this.stopEdits = undefined;
		this.pi.setStatus(undefined);
		this.stopEvents?.();
		this.stopEvents = undefined;
		this.session.shutdown(reason);
	}

	applyPendingControl(): ReturnType<PijSession["applyPendingControl"]> {
		return this.session.applyPendingControl();
	}

	readSelf(): SessionDescriptor | null {
		return this.registry.read(this.self);
	}

	peerCount(): number {
		return this.registry.list().filter((seat) => seat.id !== this.self).length;
	}

	eventCount(type?: string): number {
		return type === undefined ? this.eventLog.count() : this.eventLog.read({ type }).length;
	}

	private async ensureRegistration(
		seat: string,
		client: PijDaemonClient,
		registration: Registration,
	): Promise<void> {
		if (this.self !== seat) return;
		const seats = await client.seats();
		if (this.self !== seat || seats.some((candidate) => candidate.id === seat)) return;
		const accepted = await client.register(registration);
		if (this.self === seat) this.registry.writeExact(fromRustDescriptor(accepted));
	}

	/** Startup only. Oldest LIVE order includes deferred rows; ordinary claims
	 * alone would allow a newer eligible row to overtake a re-held older one.
	 * Recovery restores ORDER, not immediacy: routeClaim retains active grace. */
	private async recoverInbox(
		seat: string,
		client: PijDaemonClient,
		lifecycle: number,
	): Promise<void> {
		while (this.self === seat && this.lifecycle === lifecycle) {
			const oldest = pushedInboxClaim(await client.peekInbox(seat), seat);
			if (!oldest || this.self !== seat || this.lifecycle !== lifecycle) return;
			await client.release({
				seat,
				job_id: oldest.jobId,
				msg_id: oldest.message.messageId,
				at_ms: this.clock(),
			});
			if (this.self !== seat || this.lifecycle !== lifecycle) return;
			const claim = pushedInboxClaim(await client.claimInbox(seat), seat);
			if (!claim) return; // A running reader still owns the oldest live row.
			await this.routeClaim(claim, seat, client, lifecycle);
			if (this.heldIds.has(claim.message.messageId)) return;
		}
	}

	private async consumePushed(
		payload: string,
		seat: string,
		client: PijDaemonClient,
		lifecycle: number,
	): Promise<void> {
		const announced = pushedMessage(payload, seat);
		if (this.self !== seat || this.lifecycle !== lifecycle) {
			this.session.capture("daemon_event_claim_stale", {
				currentSeat: this.self,
				messageId: announced.messageId,
				seat,
				stage: "before-claim",
			});
			return;
		}
		const heldJobId = this.heldIds.get(announced.messageId);
		if (
			heldJobId !== undefined &&
			this.holdQueue?.shouldHold(this.clock()) &&
			this.lastEditAt !== undefined
		) {
			await client.hold({
				seat,
				job_id: heldJobId,
				msg_id: announced.messageId,
				reason: "human-typing",
				since_ms: this.lastEditAt,
			});
			return;
		}
		// Un-defer known holds before taking any new ordinary claim, so the
		// daemon's id-ordered queue, not local notes, determines delivery order.
		if (announced.command === undefined && announced.urgent !== true) {
			await this.releaseHeld(seat, client, lifecycle);
		}
		const response = await client.claimInbox(seat);
		if (this.self !== seat || this.lifecycle !== lifecycle) {
			this.session.capture("daemon_event_claim_stale", {
				currentSeat: this.self,
				messageId: announced.messageId,
				seat,
				stage: "after-claim",
			});
			return;
		}
		const claim = pushedInboxClaim(response, seat);
		if (claim === undefined) {
			this.session.capture("daemon_event_claim_unavailable", {
				messageId: announced.messageId,
			});
			return;
		}
		if (claim.message.messageId !== announced.messageId) {
			this.session.capture("daemon_event_claim_mismatch", {
				announcedMessageId: announced.messageId,
				claimedMessageId: claim.message.messageId,
			});
		}
		await this.routeClaim(claim, seat, client, lifecycle);
	}

	private async routeClaim(
		claim: HeldRow,
		seat: string,
		client: PijDaemonClient,
		lifecycle: number,
	): Promise<void> {
		if (this.self !== seat || this.lifecycle !== lifecycle) return;
		const bypass = claim.message.command !== undefined || claim.message.urgent === true;
		if (!bypass && this.holdQueue?.shouldHold(this.clock()) && this.lastEditAt !== undefined) {
			await client.hold({
				seat,
				job_id: claim.jobId,
				msg_id: claim.message.messageId,
				reason: "human-typing",
				since_ms: this.lastEditAt,
			});
			if (this.self !== seat || this.lifecycle !== lifecycle) return;
			this.holdQueue.push(claim);
			this.heldIds.set(claim.message.messageId, claim.jobId);
			this.showHeld();
			return;
		}
		await this.injectAndAck(claim, seat, client, lifecycle);
	}

	private async injectAndAck(
		claim: HeldRow,
		seat: string,
		client: PijDaemonClient,
		lifecycle: number,
	): Promise<void> {
		if (this.self !== seat || this.lifecycle !== lifecycle) return;
		this.lastInbound.set(claim.message.from, claim.message.messageId);
		this.session.onInbound(claim.message, claim.message.messageId);
		this.heldIds.delete(claim.message.messageId);
		if (this.self !== seat || this.lifecycle !== lifecycle) {
			this.session.capture("daemon_event_claim_stale", {
				currentSeat: this.self,
				messageId: claim.message.messageId,
				seat,
				stage: "before-ack",
			});
			return;
		}
		try {
			// A restarted reader has no local note for a formerly held job.
			// Declare release regardless; the daemon clears evidence even when
			// un-deferral is a no-op and preserves this running claim.
			await client.release({
				seat,
				job_id: claim.jobId,
				msg_id: claim.message.messageId,
				at_ms: this.clock(),
			});
			if (this.self !== seat || this.lifecycle !== lifecycle) return;
			await client.ackInbox(seat, claim.jobId);
		} catch (error) {
			this.session.capture("daemon_event_ack_error", {
				jobId: claim.jobId,
				messageId: claim.message.messageId,
				message: error instanceof Error ? error.message : String(error),
			});
		}
		if (this.self === seat) await this.flush();
	}

	private showHeld(): void {
		const count = this.heldIds.size;
		this.pi.setStatus(count === 0 ? undefined : `⏸ ${count} held · typing`);
	}

	private async releaseHeld(
		seat: string,
		client: PijDaemonClient,
		lifecycle: number,
	): Promise<void> {
		if (this.self !== seat || this.lifecycle !== lifecycle) return;
		const queue = this.holdQueue;
		if (!queue || this.heldIds.size === 0) return;
		const ready = queue.drain(this.clock());
		try {
			// Clear every eligible note's deferral first; claiming one-by-one
			// while releasing would accidentally impose the note's order.
			for (const row of ready) {
				if (this.self !== seat || this.lifecycle !== lifecycle) return;
				if (!this.heldIds.has(row.message.messageId)) continue;
				await client.release({
					seat,
					job_id: row.jobId,
					msg_id: row.message.messageId,
					at_ms: this.clock(),
				});
			}
			for (let remaining = ready.length; remaining > 0; remaining--) {
				if (this.self !== seat || this.lifecycle !== lifecycle) return;
				const claim = pushedInboxClaim(await client.claimInbox(seat), seat);
				if (!claim) break; // Another claimant won; notes are not ownership.
				await this.routeClaim(claim, seat, client, lifecycle);
			}
		} finally {
			if (this.self === seat && this.lifecycle === lifecycle) {
				for (const row of ready) if (this.heldIds.has(row.message.messageId)) queue.push(row);
				this.showHeld();
			}
		}
	}

	private async pollHeld(seat: string, client: PijDaemonClient, lifecycle: number): Promise<void> {
		if (this.self !== seat || this.lifecycle !== lifecycle || this.heldIds.size === 0) return;
		await this.releaseHeld(seat, client, lifecycle);
		if (this.self !== seat || this.lifecycle !== lifecycle || this.heldIds.size === 0) return;
		const claim = pushedInboxClaim(await client.claimInbox(seat), seat);
		if (claim) await this.routeClaim(claim, seat, client, lifecycle);
	}

	private chooseIdentity(
		input: RustBootInput,
		procStart: number,
		seats: readonly RustSeatDescriptor[],
		replacing: boolean,
	): string {
		if (this.self !== "" && !replacing) return this.self;
		if (!replacing) {
			const samePane =
				input.paneId === undefined ? undefined : seats.find((seat) => seat.pane === input.paneId);
			if (samePane) return samePane.id;
			const sameProcess = seats.find(
				(seat) => seat.proc?.pid === process.pid && seat.proc.proc_start === procStart,
			);
			if (sameProcess) return sameProcess.id;
			const spawnedId = process.env.PIJ_SESSION_ID?.trim();
			if (spawnedId) return spawnedId;
		}
		const used = new Set(seats.map((seat) => seat.id));
		if (replacing && this.self !== "") used.add(this.self);
		const seed = memorableIdentitySeed(
			"pi",
			input.piSessionId ?? `pid:${process.pid}:${procStart}`,
		);
		for (const candidate of memorablePijIdCandidates(seed)) {
			if (!used.has(candidate)) return candidate;
		}
		throw new Error("pij memorable id space is exhausted");
	}

	private flush(): Promise<void> {
		const outgoing = this.delivery.take();
		this.flushChain = this.flushChain.then(async () => {
			for (const item of outgoing) {
				if (item.message.kind === "receipt") continue;
				await this.client.send({
					from: item.message.from,
					to: { seat: item.message.to },
					body: item.message.body,
					msg_id: item.messageId,
				});
			}
		});
		return this.flushChain;
	}
}

function registrationFor(
	id: string,
	procStart: number,
	input: RustBootInput,
	supersedes?: string,
): Registration {
	const effort = process.env.PIJ_SPAWN_EFFORT;
	const requestedModel = process.env.PIJ_SPAWN_MODEL;
	const effortSuffix = effort ? `:${effort}` : "";
	const model =
		effortSuffix && requestedModel?.endsWith(effortSuffix)
			? requestedModel.slice(0, -effortSuffix.length)
			: requestedModel;
	return {
		...(supersedes === undefined ? {} : { supersedes }),
		id,
		harness: input.runtimeBin,
		...(input.piSessionId === undefined ? {} : { harness_session: input.piSessionId }),
		folder: input.folder,
		...(input.paneId === undefined ? {} : { pane: input.paneId }),
		pid: process.pid,
		proc_start: procStart,
		...(process.env.PIJ_SPAWN_ID ? { spawn_id: process.env.PIJ_SPAWN_ID } : {}),
		...(model ? { model } : {}),
		...(input.actualModel === undefined
			? {}
			: {
					actual_model_observed: true,
					...(input.actualModel === null ? {} : { actual_model: input.actualModel }),
				}),
		...(process.env.PIJ_SPAWN_PROVIDER ? { provider: process.env.PIJ_SPAWN_PROVIDER } : {}),
		...(effort ? { effort } : {}),
		...(input.parentId === undefined || input.parentId === null ? {} : { parent: input.parentId }),
		relay: false,
	};
}

function fromRustDescriptor(seat: RustSeatDescriptor): SessionDescriptor {
	return {
		id: seat.id,
		folder: seat.folder,
		dataDir: "",
		eventsPath: "",
		pid: seat.proc?.pid ?? 0,
		startedAt: new Date().toISOString(),
		state: seat.state === "working" ? "working" : "idle",
		harness:
			seat.harness === "claude" || seat.harness === "copilot" || seat.harness === "codex"
				? seat.harness
				: "pi",
		runtimeBin: seat.harness === "omp" ? "omp" : seat.harness === "pi" ? "pi" : undefined,
		...(seat.pane === undefined || seat.pane === null ? {} : { paneId: seat.pane }),
		...(seat.parent === undefined || seat.parent === null ? {} : { spawnedBy: seat.parent }),
		...(seat.spawn_id === undefined ? {} : { spawnId: seat.spawn_id }),
	};
}

function pushedMessage(payload: string, to: string): HeldRow["message"] {
	return pushedMessageValue(JSON.parse(payload) as unknown, to, "message.pushed payload");
}

function pushedInboxClaim(value: unknown, to: string): HeldRow | undefined {
	if (!Array.isArray(value) || value.length > 1) {
		throw new Error("pij inbox response must be an array with at most one claim");
	}
	if (value.length === 0) return undefined;
	const claim: unknown = value[0];
	if (typeof claim !== "object" || claim === null || Array.isArray(claim)) {
		throw new Error("pij inbox claim must be an object");
	}
	const record = claim as Record<string, unknown>;
	if (
		typeof record.job_id !== "number" ||
		!Number.isSafeInteger(record.job_id) ||
		record.job_id <= 0
	) {
		throw new Error("pij inbox claim job_id must be a positive safe integer");
	}
	return {
		jobId: record.job_id,
		message: pushedMessageValue(record.message, to, "pij inbox claim message"),
	};
}

function pushedMessageValue(value: unknown, to: string, label: string): HeldRow["message"] {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
	const record = value as Record<string, unknown>;
	if (
		typeof record.msg_id !== "string" ||
		typeof record.from !== "string" ||
		typeof record.body !== "string"
	) {
		throw new Error(`${label} needs string msg_id, from, and body`);
	}
	return {
		messageId: record.msg_id,
		from: record.from,
		to,
		body: record.body,
		...(typeof record.command === "string" ? { command: record.command } : {}),
		...(record.urgent === true ? { urgent: true } : {}),
	};
}

class MutablePiRuntime implements PiRuntimePort {
	private current: TypingRuntimePort | undefined;
	setStatus(text: string | undefined): void {
		this.current?.setStatus?.(text);
	}

	set(pi: TypingRuntimePort): void {
		this.current = pi;
	}

	isIdle(): boolean {
		return this.need().isIdle();
	}

	inject(text: string, mode: "immediate" | "steer"): void {
		this.need().inject(text, mode);
	}

	compact(): void {
		this.need().compact();
	}

	control(command: "new" | "reload"): boolean {
		return this.need().control(command);
	}

	private need(): PiRuntimePort {
		if (!this.current) throw new Error("pij Rust runtime has no active Pi context");
		return this.current;
	}
}

class MemoryRegistry implements RegistryPort {
	private readonly seats = new Map<string, SessionDescriptor>();

	seed(descriptor: SessionDescriptor): void {
		if (!this.seats.has(descriptor.id)) this.seats.set(descriptor.id, descriptor);
	}

	list(): SessionDescriptor[] {
		return [...this.seats.values()].filter((seat) => seat.lifecycle !== "dissolved");
	}

	read(id: SessionId): SessionDescriptor | null {
		return this.seats.get(id) ?? null;
	}

	write(descriptor: SessionDescriptor): void {
		this.seats.set(descriptor.id, descriptor);
	}

	writeExact(descriptor: SessionDescriptor): void {
		this.write(descriptor);
	}

	revive(descriptor: SessionDescriptor): Result<void> {
		this.write(descriptor);
		return ok(undefined);
	}

	remove(id: SessionId): void {
		this.seats.delete(id);
	}

	dissolve(id: SessionId): void {
		const seat = this.seats.get(id);
		if (seat) this.seats.set(id, { ...seat, lifecycle: "dissolved" });
	}
}

class MemoryEventLog implements EventLogPort {
	private readonly events: PijEvent[] = [];

	append(event: PijEvent): void {
		this.events.push(event);
	}

	read(query: EventQuery = {}): PijEvent[] {
		let selected = this.events.filter(
			(event) =>
				(query.since === undefined || event.seq > query.since) &&
				(query.type === undefined || event.type === query.type),
		);
		if (query.last !== undefined) selected = selected.slice(-query.last);
		return selected;
	}

	lastSeq(): number {
		return this.events.at(-1)?.seq ?? 0;
	}

	count(): number {
		return this.events.length;
	}
}

class BufferedDelivery implements DeliveryPort {
	private readonly outgoing: Array<{ messageId: string; message: PijMessage }> = [];

	deliver(message: PijMessage): Result<{ messageId: string }> {
		if (!message.to) return err("E-NOID", "pij-rs delivery needs a recipient");
		const messageId = randomUUID();
		this.outgoing.push({ messageId, message });
		return ok({ messageId });
	}

	take(): Array<{ messageId: string; message: PijMessage }> {
		return this.outgoing.splice(0);
	}
}
