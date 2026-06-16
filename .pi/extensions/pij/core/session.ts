// pij-messaging — PijSession coordinator (Pattern P2: Pi-free; P3: ports by DI;
// P4: tagged-union returns; P8: the testable backbone).
//
// Holds ALL of the extension's wiring logic — boot/announce, event capture,
// the idle/steer delivery injector, command execution, delivery receipts, and
// shutdown — against the 5 frozen ports + plain data. The pi extension
// (index.ts) is a thin pi-event -> coordinator translator that owns no logic,
// so the behaviour here is proven against fakes before any live-pi smoke.

import { validateCommand } from "./commands.js";
import { announceText, frame, receiptBody } from "./message.js";
import type {
	DeliveryPort,
	EventLogPort,
	PiRuntimePort,
	ProcessPort,
	RegistryPort,
} from "./ports.js";
import {
	classifyOnInject,
	correlateDeliveredAt,
	initialReceipt,
	markDelivered,
} from "./receipts.js";
import { SeqCounter } from "./seq.js";
import { buildEvent } from "./events.js";
import type {
	MessageReceipt,
	PijErrorCode,
	PijMessage,
	Role,
	SessionDescriptor,
	SessionId,
} from "./types.js";

/** The 5 seams the coordinator depends on (constructor-injected). */
export interface PijPorts {
	readonly registry: RegistryPort;
	readonly eventLog: EventLogPort;
	readonly delivery: DeliveryPort;
	readonly pi: PiRuntimePort;
	readonly process: ProcessPort;
}

/** What index.ts hands `boot` once it has minted/derived the session id from
 *  pi's own session identity (NOT resolveSelf — that is the CLI's resolver). */
export interface BootInput {
	readonly id: SessionId;
	readonly role?: Role;
	readonly folder: string;
	readonly dataDir: string;
	readonly eventsPath: string;
}

/** Boot outcome — the (id, role) the wiring exports to PIJ_SESSION_ID/PIJ_ROLE,
 *  plus whether this was a first boot (announce fired) or a reload (it didn't). */
export interface BootResult {
	readonly id: SessionId;
	readonly role?: Role;
	readonly fresh: boolean;
}

export type InboundResult =
	| { readonly kind: "delivered"; readonly state: "queued" | "delivered" }
	| { readonly kind: "command-executed"; readonly command: string }
	| { readonly kind: "command-rejected"; readonly code: PijErrorCode }
	| { readonly kind: "receipt-recorded" };

interface PendingReceipt {
	readonly injectIso: string;
	readonly receipt: MessageReceipt;
}

export class PijSession {
	private self: SessionId = "";
	private role: Role | undefined;
	private seq = new SeqCounter(0);
	private pending: PendingReceipt[] = [];

	constructor(private readonly ports: PijPorts) {}

	/** session_start (all reasons, P10). Mints/persists the descriptor on first
	 *  boot, reuses it on reload (no duplicate, no replay), seeds the seq counter
	 *  from the log, and announces once on a fresh session. */
	boot(input: BootInput): BootResult {
		const existing = this.ports.registry.read(input.id);
		const fresh = existing === null;
		const descriptor: SessionDescriptor = {
			id: input.id,
			role: input.role,
			folder: input.folder,
			dataDir: input.dataDir,
			eventsPath: input.eventsPath,
			pid: this.ports.process.pid(),
			startedAt: existing?.startedAt ?? this.nowIso(),
		};
		this.ports.registry.write(descriptor);
		this.self = input.id;
		this.role = input.role;
		this.seq = new SeqCounter(this.ports.eventLog.lastSeq());
		if (fresh) {
			this.ports.pi.inject(announceText(input.id, input.role), "immediate");
		}
		return { id: input.id, role: input.role, fresh };
	}

	/** Append one captured pi-activity event (monotonic seq + ISO timestamp). */
	capture(type: string, data?: unknown): void {
		this.ports.eventLog.append(buildEvent(this.seq.next(), type, this.ports.process.now(), data));
	}

	/** Handle one inbound channel message: a receipt (record only), a remote
	 *  command (validate -> compact), or free text (frame + idle/steer inject +
	 *  emit a delivery receipt). `messageId` is the channel's delivered id. */
	onInbound(msg: PijMessage, messageId: string): InboundResult {
		// A receipt acknowledges OUR earlier outbound — record it so the sender
		// sees it via tail/state, but NEVER inject it (don't wake/bill the peer).
		if (msg.kind === "receipt") {
			this.capture("receipt", {
				messageId,
				from: msg.from,
				body: msg.body,
				source: "extension",
			});
			return { kind: "receipt-recorded" };
		}

		// Remote command: only the allow-list reaches pi; unknown is rejected
		// before any pi call (finding 05).
		if (msg.command !== undefined) {
			const v = validateCommand(msg.command);
			if (!v.ok) {
				this.capture("receipt", { messageId, command: msg.command, rejected: true, code: v.code });
				return { kind: "command-rejected", code: v.code };
			}
			this.ports.pi.compact();
			this.capture("receipt", { messageId, command: v.value, executed: true });
			return { kind: "command-executed", command: v.value };
		}

		// Free text: classify from the peer's idle state, frame the sender id so a
		// reply needs no lookup (AC-5), inject, and emit the first receipt.
		const idle = this.ports.pi.isIdle();
		this.ports.pi.inject(frame(msg.from, msg.body), idle ? "immediate" : "steer");
		const atIso = this.nowIso();
		const state = classifyOnInject(idle);
		const receipt = initialReceipt(messageId, this.self, msg.from, idle, atIso);
		this.emitReceipt(receipt);
		if (!idle) {
			this.pending.push({ injectIso: atIso, receipt });
		}
		return { kind: "delivered", state };
	}

	/** turn_start (ISO). Resolves any queued receipt whose steered message has
	 *  now been consumed by the live turn (finding 08). */
	onTurnStart(iso: string): void {
		if (this.pending.length === 0) return;
		const still: PendingReceipt[] = [];
		for (const p of this.pending) {
			const at = correlateDeliveredAt(p.injectIso, true, [iso]);
			if (at === null) {
				still.push(p);
			} else {
				this.emitReceipt(markDelivered(p.receipt, at));
			}
		}
		this.pending = still;
	}

	/** session_shutdown: drop this session's descriptor so `pij list` stops
	 *  showing it active. */
	shutdown(): void {
		this.ports.registry.remove(this.self);
	}

	// ─── internals ──────────────────────────────────────────────────────────
	/** Record a receipt as an event AND send it back to its target as a
	 *  kind:receipt message (which the target records but never injects). */
	private emitReceipt(r: MessageReceipt): void {
		this.capture("receipt", { messageId: r.messageId, state: r.state, to: r.to });
		this.ports.delivery.deliver({
			from: this.self,
			to: r.to,
			body: receiptBody(r.messageId, r.state),
			kind: "receipt",
		});
	}

	private nowIso(): string {
		return new Date(this.ports.process.now()).toISOString();
	}
}
