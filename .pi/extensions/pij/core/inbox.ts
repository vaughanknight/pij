// pij-messaging — grouped inbox grammar, claim processing, and rendering (pi-free).

import { type BriefAckReceipt, parseBriefAckBody, parseReceiptBody } from "./message.js";
import type { EventLogPort, InboxPort } from "./ports.js";
import {
	type DeliveryMode,
	err,
	type HarnessKind,
	ok,
	type PijErrorCode,
	type ReceiptState,
	type Result,
	type SessionId,
} from "./types.js";

export type InboxCommand =
	| {
			readonly verb: "check";
			readonly wait: boolean;
			readonly waitMs?: number;
			readonly json: boolean;
	  }
	| { readonly verb: "register"; readonly json: boolean };

export interface InboxMessageView {
	readonly messageId: string;
	readonly from: SessionId;
	readonly body: string;
	readonly command: string | null;
	readonly attachments: ReadonlyArray<{ readonly path: string; readonly caption?: string }>;
	readonly readAt: string;
}

export interface PersistReceiptEnvelopeAction {
	readonly kind: "persist-receipt-envelope";
	readonly envelopeMessageId: string;
	readonly from: SessionId;
	readonly body: string;
	readonly receipt: {
		readonly messageId: string;
		readonly state: ReceiptState;
	};
	readonly readAt: string;
	readonly reader: SessionId;
}

export interface PersistBriefAckEnvelopeAction {
	readonly kind: "persist-brief-ack-envelope";
	readonly envelopeMessageId: string;
	readonly from: SessionId;
	readonly body: string;
	readonly ack: BriefAckReceipt;
	readonly readAt: string;
	readonly reader: SessionId;
}

export interface SendDeliveredReceiptAction {
	readonly kind: "send-delivered-receipt";
	readonly to: SessionId;
	readonly messageId: string;
}

export type PersistedReceiptEnvelopeAction =
	| PersistReceiptEnvelopeAction
	| PersistBriefAckEnvelopeAction;

export type InboxAction = PersistedReceiptEnvelopeAction | SendDeliveredReceiptAction;

export interface InboxFailure {
	readonly code: PijErrorCode;
	readonly message: string;
}

export interface InboxResult {
	readonly self: SessionId;
	readonly messages: readonly InboxMessageView[];
	readonly timedOut: boolean;
	readonly actions: readonly InboxAction[];
	readonly failure?: InboxFailure;
}

export interface InboxRegistrationResult {
	readonly id: SessionId;
	readonly harness: Exclude<HarnessKind, "pi">;
	readonly harnessSessionId: string;
	readonly deliveryMode: DeliveryMode;
	readonly existing: boolean;
}

export interface ConsumeInboxInput {
	readonly inbox: InboxPort;
	readonly self: SessionId;
	readonly readAt: string;
}

function parseWait(value: string | undefined): Result<number | undefined> {
	if (value === undefined) return ok(undefined);
	return /^\d+$/.test(value)
		? ok(Number(value))
		: err("E-ARG", "--wait takes an optional milliseconds value");
}

export function parseInboxArgs(argv: readonly string[]): Result<InboxCommand> {
	let verb: "check" | "register" = "check";
	let offset = 0;
	const first = argv[0];
	if (first && !first.startsWith("--")) {
		if (first !== "check" && first !== "register") {
			return err("E-ARG", `unknown inbox subcommand '${first}' (check|register)`);
		}
		verb = first;
		offset = 1;
	}

	let json = false;
	let wait = false;
	let waitMs: number | undefined;
	for (let i = offset; i < argv.length; i++) {
		const token = argv[i];
		if (token === "--json") {
			if (json) return err("E-ARG", "duplicate flag --json");
			json = true;
			continue;
		}
		if (token?.startsWith("--json=")) return err("E-ARG", "--json does not take a value");
		if (token === "--wait") {
			if (wait) return err("E-ARG", "duplicate flag --wait");
			wait = true;
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith("--")) {
				const parsed = parseWait(next);
				if (!parsed.ok) return parsed;
				waitMs = parsed.value;
				i++;
			}
			continue;
		}
		if (token?.startsWith("--wait=")) {
			if (wait) return err("E-ARG", "duplicate flag --wait");
			const parsed = parseWait(token.slice("--wait=".length));
			if (!parsed.ok) return parsed;
			wait = true;
			waitMs = parsed.value;
			continue;
		}
		if (token?.startsWith("--")) return err("E-ARG", `unknown inbox flag '${token}'`);
		return err("E-ARG", `unexpected inbox argument '${token ?? ""}'`);
	}

	if (verb === "register") {
		return wait ? err("E-ARG", "pij inbox register does not accept --wait") : ok({ verb, json });
	}
	return ok({
		verb,
		wait,
		...(waitMs !== undefined ? { waitMs } : {}),
		json,
	});
}

function appendReceiptAction(
	message: {
		readonly messageId: string;
		readonly from: SessionId;
		readonly body: string;
	},
	readAt: string,
	reader: SessionId,
): Result<PersistedReceiptEnvelopeAction> {
	const receipt = parseReceiptBody(message.body);
	if (receipt) {
		return ok({
			kind: "persist-receipt-envelope",
			envelopeMessageId: message.messageId,
			from: message.from,
			body: message.body,
			receipt,
			readAt,
			reader,
		});
	}
	const ack = parseBriefAckBody(message.body);
	if (!ack) return err("E-NOREG", `malformed receipt inbox message ${message.messageId}`);
	return ok({
		kind: "persist-brief-ack-envelope",
		envelopeMessageId: message.messageId,
		from: message.from,
		body: message.body,
		ack,
		readAt,
		reader,
	});
}

export function consumeInbox(input: ConsumeInboxInput): Result<InboxResult> {
	const listed = input.inbox.listUnread(input.self);
	if (!listed.ok) return listed;
	const receiptActions = new Map<string, PersistedReceiptEnvelopeAction>();
	for (const message of listed.value) {
		if (message.kind !== "receipt") continue;
		const action = appendReceiptAction(message, input.readAt, input.self);
		if (!action.ok) return action;
		receiptActions.set(message.messageId, action.value);
	}
	const messages: InboxMessageView[] = [];
	const actions: InboxAction[] = [];
	for (const listedMessage of listed.value) {
		const receiptAction = receiptActions.get(listedMessage.messageId);
		if (receiptAction) {
			actions.push(receiptAction);
			continue;
		}
		const claimed = input.inbox.claimUnread(input.self, listedMessage.messageId, {
			messageId: listedMessage.messageId,
			readAt: input.readAt,
			reader: input.self,
		});
		if (!claimed.ok) {
			return ok({
				self: input.self,
				messages,
				timedOut: false,
				actions,
				failure: { code: claimed.code, message: claimed.message },
			});
		}
		if (claimed.value.kind === "already-read") continue;
		const message = claimed.value.message;
		messages.push({
			messageId: message.messageId,
			from: message.from,
			body: message.body,
			command: message.command ?? null,
			attachments: message.attachments ? [...message.attachments] : [],
			readAt: input.readAt,
		});
		actions.push({
			kind: "send-delivered-receipt",
			to: message.from,
			messageId: message.messageId,
		});
	}
	return ok({ self: input.self, messages, timedOut: false, actions, failure: undefined });
}

export function prepareReceiptEnvelopes(
	input: ConsumeInboxInput,
): Result<readonly PersistedReceiptEnvelopeAction[]> {
	const listed = input.inbox.listUnread(input.self);
	if (!listed.ok) return listed;
	const actions: PersistedReceiptEnvelopeAction[] = [];
	for (const listedMessage of listed.value) {
		if (listedMessage.kind !== "receipt") continue;
		const action = appendReceiptAction(listedMessage, input.readAt, input.self);
		if (!action.ok) return action;
		actions.push(action.value);
	}
	return ok(actions);
}

export interface PersistReceiptEnvelopeInput {
	readonly inbox: InboxPort;
	readonly eventLog: EventLogPort;
	readonly self: SessionId;
	readonly action: PersistedReceiptEnvelopeAction;
	readonly nowMs: number;
}

function hasEquivalentReceiptEvent(
	eventLog: EventLogPort,
	action: PersistedReceiptEnvelopeAction,
): boolean {
	return eventLog.read({ type: "receipt" }).some((event) => {
		const body = (event.data as { body?: string } | undefined)?.body;
		if (!body) return false;
		if (action.kind === "persist-receipt-envelope") {
			const receipt = parseReceiptBody(body);
			return (
				receipt?.messageId === action.receipt.messageId && receipt.state === action.receipt.state
			);
		}
		const ack = parseBriefAckBody(body);
		return (
			ack?.messageId === action.ack.messageId &&
			ack.packetId === action.ack.packetId &&
			ack.packetSha256 === action.ack.packetSha256 &&
			ack.seat === action.ack.seat
		);
	});
}

export function persistReceiptEnvelope(input: PersistReceiptEnvelopeInput): Result<{
	readonly event: "appended" | "existing";
	readonly marker: "marked" | "already-read";
}> {
	let event: "appended" | "existing";
	try {
		if (hasEquivalentReceiptEvent(input.eventLog, input.action)) {
			event = "existing";
		} else {
			const appendOnce = input.eventLog.appendOnce;
			if (!appendOnce) {
				return err("E-NOREG", "receipt event log does not support atomic appendOnce");
			}
			event = appendOnce.call(
				input.eventLog,
				`receipt-envelope:${input.action.envelopeMessageId}`,
				{
					seq: input.eventLog.lastSeq() + 1,
					timestamp: new Date(input.nowMs).toISOString(),
					type: "receipt",
					data: {
						messageId: input.action.envelopeMessageId,
						from: input.action.from,
						body: input.action.body,
						source: "inbox",
					},
				},
			);
		}
	} catch (error) {
		return err(
			"E-NOREG",
			`cannot persist receipt event ${input.action.envelopeMessageId}: ${String(error)}`,
		);
	}
	const marked = input.inbox.markRead(input.self, input.action.envelopeMessageId, {
		messageId: input.action.envelopeMessageId,
		readAt: input.action.readAt,
		reader: input.action.reader,
	});
	if (!marked.ok) return marked;
	return ok({
		event,
		marker: marked.value.kind === "marked" ? "marked" : "already-read",
	});
}

export function inboxTimeoutResult(self: SessionId): InboxResult {
	return { self, messages: [], timedOut: true, actions: [], failure: undefined };
}

export function renderInboxResult(result: InboxResult, json: boolean): string {
	if (json) {
		return JSON.stringify({
			self: result.self,
			messages: result.messages,
			timedOut: result.timedOut,
		});
	}
	if (result.messages.length === 0) {
		return result.timedOut ? "(timeout; no unread messages)" : "(no unread messages)";
	}
	const lines: string[] = [];
	for (const message of result.messages) {
		const command = message.command ? `(command: /${message.command})` : "";
		const content = message.body ? `${message.body}${command ? ` ${command}` : ""}` : command;
		lines.push(`[pij from ${message.from}] ${content}`);
		for (const attachment of message.attachments) {
			lines.push(
				`  attachment: ${attachment.path}${attachment.caption ? ` (${attachment.caption})` : ""}`,
			);
		}
	}
	lines.push(`${result.messages.length} message${result.messages.length === 1 ? "" : "s"} read`);
	return lines.join("\n");
}

export function renderInboxWaiting(waitMs: number | undefined): string {
	return waitMs === undefined
		? "waiting for pij inbox messages…"
		: `waiting for pij inbox messages (timeout ${waitMs}ms)…`;
}

export function renderInboxRegistration(result: InboxRegistrationResult, json: boolean): string {
	if (json) return JSON.stringify(result);
	return `registered ${result.id} ↔ ${result.harness} session ${result.harnessSessionId} (pull${result.existing ? "; existing" : ""})`;
}
