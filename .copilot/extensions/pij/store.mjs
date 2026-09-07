import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export const INITIAL_RETRY_MS = 250;
export const MAX_RETRY_MS = 5000;
const ERROR_BODY_LIMIT = 4096;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
const sameProcess = (seat, host) =>
	seat.proc?.pid === host.pid && seat.proc?.proc_start === host.proc_start;
const samePane = (seat, host) => (seat.pane ?? undefined) === (host.pane ?? undefined);
const nativeAttested = (seat) =>
	seat.harness === "copilot" &&
	seat.native_extension_delivery === true &&
	seat.tombstoned_at == null &&
	nonempty(seat.session) &&
	positiveInteger(seat.proc?.pid) &&
	positiveInteger(seat.proc?.proc_start);

export class NativeError extends Error {
	constructor(message, retryable = false) {
		super(message);
		this.name = "NativeError";
		this.retryable = retryable;
	}
}

/** The daemon packs C-locale, local-time ps lstart as YYYYMMDDhhmmss. */
export function parseProcessStart(row) {
	const match =
		/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) ([A-Z][a-z]{2})\s+(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(
			row.trim(),
		);
	if (!match) throw new NativeError("Could not parse host process start");
	const month =
		["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(
			match[1],
		) + 1;
	const [day, hour, minute, second, year] = match.slice(2).map(Number);
	if (
		!month ||
		year < 1970 ||
		day < 1 ||
		day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
		hour > 23 ||
		minute > 59 ||
		second > 59
	)
		throw new NativeError("Invalid host process start calendar fields");
	return (
		year * 10000000000 + month * 100000000 + day * 1000000 + hour * 10000 + minute * 100 + second
	);
}

/** Native runtime identity is authoritative; launch environment is only corroborated intent. */
export function chooseRegistration({ sessionId, host, folder, seats, env }) {
	if (
		!nonempty(sessionId) ||
		!positiveInteger(host.pid) ||
		!positiveInteger(host.proc_start) ||
		!nonempty(folder) ||
		!Array.isArray(seats)
	)
		throw new NativeError("Invalid native host identity or roster");
	const live = seats.filter(
		(seat) => seat.tombstoned_at == null && !["dead", "tombstoned"].includes(seat.state),
	);
	const requestedId = env.PIJ_SESSION_ID?.trim();
	const requestedSpawn = env.PIJ_SPAWN_ID?.trim();
	const prebind =
		requestedId && requestedSpawn && host.pane
			? live.find(
					(seat) =>
						seat.id === requestedId &&
						seat.harness === "copilot" &&
						seat.proc == null &&
						samePane(seat, host) &&
						seat.spawn_id === requestedSpawn,
				)
			: undefined;
	const exact = live.filter((seat) => sameProcess(seat, host));
	if (exact.length > 1 || exact.some((seat) => seat.harness !== "copilot" || !samePane(seat, host)))
		throw new NativeError("Native process identity has conflicting seats or pane");
	if (
		host.pane &&
		live.some(
			(seat) =>
				seat !== prebind &&
				seat.pane === host.pane &&
				!sameProcess(seat, host) &&
				!nativeAttested(seat),
		)
	)
		throw new NativeError("Pane belongs to a different process identity");
	// Roster rows only nominate identity; the daemon proves death and authorizes rebind/retirement.
	let prior = exact[0] ?? prebind;
	if (!prior) {
		const candidates = seats.filter((seat) => nativeAttested(seat) && seat.session === sessionId);
		if (candidates.length > 1)
			throw new NativeError(
				"Native session has multiple candidate Pij addresses; refreshing roster",
				true,
			);
		prior = candidates[0];
	}
	const correlatedSuccessor =
		prior?.native_extension_delivery === true &&
		requestedSpawn &&
		prior.spawn_id === requestedSpawn &&
		(sameProcess(prior, host) || prior.session === sessionId);
	if (requestedId && (!prior || prior.id !== requestedId) && !correlatedSuccessor)
		throw new NativeError("Spawn prebind identity is not corroborated by the host process", !prior);
	if (requestedSpawn && (!prior || prior.spawn_id !== requestedSpawn))
		throw new NativeError("Spawn correlation does not match observed process identity");
	const replacing = prior && nonempty(prior.session) && prior.session !== sessionId;
	// New identities are allocated by the daemon's normal memorable-name allocator.
	// Existing addresses, including older hash names, remain stable on resume.
	const id = !replacing && prior ? prior.id : "";
	return Object.freeze({
		id,
		harness: "copilot",
		harness_session: sessionId,
		folder,
		pid: host.pid,
		proc_start: host.proc_start,
		relay: false,
		native_extension_delivery: true,
		...(host.pane ? { pane: host.pane } : {}),
		...(replacing ? { supersedes: prior.id } : {}),
		...(prior?.spawn_id ? { spawn_id: prior.spawn_id } : {}),
		...(prior?.parent ? { parent: prior.parent } : {}),
	});
}

function verifyRegisteredSeat(seat, registration) {
	if (
		!nonempty(seat?.id) ||
		(registration.id !== "" && seat.id !== registration.id) ||
		seat.harness !== "copilot" ||
		seat.session !== registration.harness_session ||
		!sameProcess(seat, registration) ||
		!samePane(seat, registration) ||
		seat.native_extension_delivery !== true
	)
		throw new NativeError(
			"Daemon registration identity/capability readback mismatch; native receiving refused",
		);
}

/** Resolve a new address before creating its durable journal namespace. */
export async function resolveRegistration(client, registration, signal) {
	if (registration.id !== "") return registration;
	const seat = await client.request("/v1/register", registration, signal);
	throwIfStopped(signal);
	verifyRegisteredSeat(seat, registration);
	const bound = { ...registration, id: seat.id };
	delete bound.supersedes;
	return Object.freeze(bound);
}

class InboxWaitDeadline extends Error {}

export class DaemonClient {
	constructor({
		addr,
		stateDir,
		fetch: fetcher = globalThis.fetch,
		readKey = () => readFile(join(stateDir, "daemon.key"), "utf8"),
		requestTimeoutMs = 65000,
	}) {
		if (!/^(?:[a-zA-Z0-9_.-]+|\[[a-fA-F0-9:]+\]):\d+$/.test(addr))
			throw new NativeError("PIJ_RS_ADDR must be host:port, without a URL path");
		const url = new URL(`http://${addr}`);
		const port = Number(addr.slice(addr.lastIndexOf(":") + 1));
		if (!Number.isInteger(port) || port < 1 || port > 65535)
			throw new NativeError("PIJ_RS_ADDR requires a valid explicit port");
		this.url = url.origin;
		this.fetch = fetcher;
		this.readKey = readKey;
		this.requestTimeoutMs = requestTimeoutMs;
	}

	async request(path, body, signal) {
		return (await this.#requestEnvelope(path, body, signal)).data;
	}

	/** @returns {Promise<{claims: unknown[], hold: {kind: "consent" | "native-target", reason: string} | null}>} */
	async claimInbox(tuple, signal) {
		const query = new URLSearchParams({ ...tuple, wait: "true" });
		const envelope = await this.#requestEnvelope(`/v1/inbox?${query}`, undefined, signal, true);
		if (envelope.meta != null && typeof envelope.meta !== "string")
			throw new NativeError(
				"Malformed native inbox hold metadata; receiving held without acknowledgement",
			);
		const prefix = "native-consumer-held:";
		const reason = envelope.meta?.startsWith(prefix) ? envelope.meta.slice(prefix.length) : null;
		return {
			claims: envelope.data,
			hold:
				reason === null
					? null
					: {
							kind: reason.startsWith("native-target-session:") ? "native-target" : "consent",
							reason,
						},
		};
	}

	async consentSnapshot(tuple, signal) {
		const query = new URLSearchParams(tuple);
		// The shared observation endpoint also carries operator Hold; typing data is informational.
		const snapshot = await this.request(`/v1/inbox/typing?${query}`, undefined, signal);
		const proof = snapshot?.native_consumer;
		if (
			!proof ||
			proof.native_session !== tuple.native_session ||
			proof.pid !== tuple.pid ||
			proof.proc_start !== tuple.proc_start ||
			typeof snapshot.semantic_hold !== "boolean"
		)
			throw new NativeError(
				"Native consent observation unavailable or invalid; receiving stopped without injection",
			);
		return snapshot;
	}

	async #requestEnvelope(path, body, signal, inboxWait = false) {
		let key;
		try {
			key = (await this.readKey()).trim();
		} catch {
			throw new NativeError(
				"Pij daemon.key unavailable; check PIJ_RS_STATE_DIR and daemon readiness",
				true,
			);
		}
		if (!key) throw new NativeError("Pij daemon.key is empty", true);
		const timeout = AbortSignal.timeout(this.requestTimeoutMs);
		const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
		let response;
		let raw;
		try {
			response = await this.fetch(`${this.url}${path}`, {
				method: body === undefined ? "GET" : "POST",
				headers: {
					Authorization: `Bearer ${key}`,
					...(body === undefined ? {} : { "Content-Type": "application/json" }),
				},
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
				signal: requestSignal,
			});
			raw = await response.text();
		} catch (error) {
			if (signal?.aborted) throw signal.reason;
			// Only our unanswered long-poll deadline renews; body/read and foreign errors still fail.
			if (inboxWait && !response && timeout.aborted && error === timeout.reason)
				throw new InboxWaitDeadline();
			throw new NativeError(
				`Pij transport unavailable (${error?.name ?? "network error"}); retrying with refreshed credentials`,
				true,
			);
		}
		let envelope;
		try {
			envelope = JSON.parse(raw);
		} catch {
			/* Preserve the real HTTP diagnostic below. */
		}
		if (!response.ok || envelope?.ok !== true || envelope.v !== 2 || !("data" in envelope)) {
			const diagnostic = raw.replaceAll(key, "[redacted]").slice(0, ERROR_BODY_LIMIT);
			const nativeUnavailable =
				(path.startsWith("/v1/inbox?") ||
					path.startsWith("/v1/inbox/typing?") ||
					path === "/v1/inbox/ack") &&
				response.status === 400 &&
				envelope?.ok === false &&
				envelope.v === 2 &&
				envelope.command === "pij inbox" &&
				envelope.error === "refused" &&
				envelope.meta ===
					"daemon/native-inbox: native-extension-unavailable: Copilot requires current native registration";
			throw new NativeError(
				`Pij HTTP ${response.status}: ${diagnostic}`,
				nativeUnavailable ||
					response.status === 401 ||
					response.status === 429 ||
					response.status >= 500,
			);
		}
		return envelope;
	}
}

async function privateDirectory(path) {
	await mkdir(path, { recursive: true, mode: 0o700 });
	const info = await lstat(path);
	if (
		!info.isDirectory() ||
		info.isSymbolicLink() ||
		(process.getuid && info.uid !== process.getuid())
	)
		throw new NativeError(
			"Acceptance directory must be owned by the current user and not a symlink",
		);
	await chmod(path, 0o700);
}

async function syncDirectory(path) {
	const handle = await open(path, "r");
	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}

function validRecord(record, msgId) {
	return (
		record?.message?.msg_id === msgId &&
		nonempty(record.message.from) &&
		nonempty(record.message.to) &&
		typeof record.message.body === "string" &&
		(record.state === "pending" || (record.state === "accepted" && nonempty(record.nativeId)))
	);
}

/** Each exclusive intent file is also an inter-process duplicate barrier. Nothing is evicted. */
export class FileJournal {
	constructor(stateDir, registration) {
		this.root = join(stateDir, "native-extensions");
		this.base = join(this.root, "copilot");
		// Acceptance belongs to the conversation, not the live process resuming it.
		this.directory = join(
			this.base,
			hash(JSON.stringify([registration.id, registration.harness_session])),
		);
	}
	path(msgId) {
		return join(this.directory, `${hash(msgId)}.json`);
	}
	async prepare() {
		await privateDirectory(this.root);
		await privateDirectory(this.base);
		await privateDirectory(this.directory);
	}
	async load(msgId) {
		await this.prepare();
		const path = this.path(msgId);
		try {
			const info = await lstat(path);
			if (
				!info.isFile() ||
				info.isSymbolicLink() ||
				(info.mode & 0o077) !== 0 ||
				(process.getuid && info.uid !== process.getuid())
			)
				throw new NativeError("Unsafe acceptance record permissions or file type");
			const record = JSON.parse(await readFile(path, "utf8"));
			if (!validRecord(record, msgId))
				throw new NativeError("Malformed acceptance record; receive held for recovery");
			return record;
		} catch (error) {
			if (error.code === "ENOENT") return undefined;
			throw error;
		}
	}
	async begin(message) {
		await this.prepare();
		let handle;
		try {
			handle = await open(this.path(message.msg_id), "wx", 0o600);
		} catch (error) {
			if (error.code === "EEXIST") return false;
			throw error;
		}
		try {
			await handle.writeFile(JSON.stringify({ state: "pending", message }));
			await handle.sync();
		} finally {
			await handle.close();
		}
		await syncDirectory(this.directory);
		return true;
	}
	async rearm(message, nativeId) {
		const record = await this.load(message.msg_id);
		if (
			record?.state !== "accepted" ||
			record.nativeId !== nativeId ||
			!sameMessage(record.message, message)
		)
			return false;
		// A lease can expire while the old consumer is still alive. Only one may retire this acceptance.
		let handle;
		try {
			handle = await open(`${this.path(message.msg_id)}.${hash(nativeId)}.retry`, "wx", 0o600);
		} catch (error) {
			if (error.code === "EEXIST") return false;
			throw error;
		}
		try {
			await handle.writeFile(JSON.stringify({ message, nativeId }));
			await handle.sync();
		} finally {
			await handle.close();
		}
		await syncDirectory(this.directory);
		const current = await this.load(message.msg_id);
		if (
			current?.state !== "accepted" ||
			current.nativeId !== nativeId ||
			!sameMessage(current.message, message)
		)
			return false;
		await this.#replace({ state: "pending", message });
		return true;
	}
	async accept(message, nativeId) {
		if (!nonempty(nativeId)) throw new NativeError("Native acceptance did not supply a message ID");
		await this.#replace({ state: "accepted", message, nativeId });
	}
	async #replace(record) {
		const target = this.path(record.message.msg_id);
		const temporary = `${target}.${randomUUID()}.tmp`;
		const handle = await open(temporary, "wx", 0o600);
		try {
			await handle.writeFile(JSON.stringify(record));
			await handle.sync();
		} finally {
			await handle.close();
		}
		try {
			await rename(temporary, target);
			await syncDirectory(this.directory);
		} finally {
			await unlink(temporary).catch((error) => {
				if (error.code !== "ENOENT") throw error;
			});
		}
	}
}

function throwIfStopped(signal) {
	signal.throwIfAborted();
}

/** Cancel the wait, not an already-issued native send. Its durable intent remains ambiguous. */
export function abortable(promise, signal) {
	throwIfStopped(signal);
	return new Promise((resolve, reject) => {
		const abort = () => reject(signal.reason);
		signal.addEventListener("abort", abort, { once: true });
		Promise.resolve(promise)
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", abort));
	});
}

function messageFromClaim(claim, seat) {
	const message = claim?.message;
	if (
		!positiveInteger(claim?.job_id) ||
		!nonempty(message?.msg_id) ||
		!nonempty(message.from) ||
		message.to !== seat ||
		typeof message.body !== "string" ||
		message.command != null ||
		claim.command != null
	)
		throw new NativeError(
			"Malformed, unsupported command or wrong-recipient claim; receiving held without acknowledgement",
		);
	return { msg_id: message.msg_id, from: message.from, to: message.to, body: message.body };
}

function sameMessage(left, right) {
	return (
		left?.msg_id === right.msg_id &&
		left.from === right.from &&
		left.to === right.to &&
		left.body === right.body
	);
}

/** Consumption and completion belong to one accepted native message, including after restart. */
class NativeCompletion {
	constructor(msgId, recoveredNativeId) {
		this.msgId = msgId;
		this.nativeId = recoveredNativeId;
		this.live = recoveredNativeId === undefined;
		this.pending = [];
		this.descendants = new Set();
		this.finalMessages = new Set();
		this.consumed = new Promise((resolve) => {
			this.resolveConsumed = resolve;
		});
		this.done = new Promise((resolve) => {
			this.resolve = resolve;
		});
	}
	trackBoundaries(events) {
		this.boundaries = new Set(
			events
				.filter(
					(event) =>
						!event.agentId &&
						nonempty(event.id) &&
						["assistant.turn_end", "session.idle"].includes(event.type),
				)
				.map((event) => event.id),
		);
	}
	bind(nativeId) {
		this.nativeId = nativeId;
		for (const { event, finalMessage } of this.pending) this.observe(event, finalMessage);
		this.pending = undefined;
	}
	observe(
		event,
		finalMessage = event.type === "assistant.message" &&
			(event.data?.toolRequests === undefined ||
				(Array.isArray(event.data.toolRequests) && event.data.toolRequests.length === 0)),
	) {
		if (this.terminal) return;
		if (
			this.boundaries &&
			!this.consumption &&
			!event.agentId &&
			nonempty(event.id) &&
			["assistant.turn_end", "session.idle"].includes(event.type) &&
			!this.boundaries.has(event.id)
		) {
			this.boundaries.add(event.id);
			this.boundary = event.id;
		}
		if (!this.nativeId) {
			// Keep correlation metadata only, never buffered prompts, tool arguments or model text.
			this.pending.push({
				event: {
					type: event.type,
					id: event.id,
					parentId: event.parentId,
					agentId: event.agentId,
					data: { messageId: event.data?.messageId, interactionId: event.data?.interactionId },
				},
				finalMessage,
			});
			return;
		}
		if (!nonempty(event.id) || this.descendants.has(event.id)) return;
		if (event.type === "user.message") {
			if (!event.agentId && event.data?.messageId === this.nativeId) {
				this.descendants.add(event.id);
				if (nonempty(event.data.interactionId)) this.interactionId ??= event.data.interactionId;
				if (!this.consumption) {
					this.consumption = { eventId: event.id };
					this.resolveConsumed(this.consumption);
				}
			}
			return;
		}
		// Native callbacks can omit permission ancestors; only the matched user's foreground turn can re-anchor.
		const sameInteraction =
			!event.agentId &&
			this.interactionId !== undefined &&
			event.data?.interactionId === this.interactionId &&
			(event.type === "assistant.turn_start" ||
				event.type === "assistant.message" ||
				event.type === "tool.execution_complete");
		if (!sameInteraction && !this.descendants.has(event.parentId)) return;
		this.descendants.add(event.id);
		if (!event.agentId && finalMessage) this.finalMessages.add(event.id);
		if (
			!event.agentId &&
			(["session.idle", "session.error"].includes(event.type) ||
				(event.type === "assistant.turn_end" && this.finalMessages.has(event.parentId)))
		) {
			this.terminal = { type: event.type, eventId: event.id };
			this.descendants.clear();
			this.finalMessages.clear();
			this.resolve(this.terminal);
		}
	}
}

export class NativeBridge {
	constructor({
		registration,
		native,
		client,
		journal,
		report,
		delay = (ms, signal) => sleep(ms, undefined, { signal }),
	}) {
		this.registration = Object.freeze({ ...registration });
		this.native = native;
		this.client = client;
		this.journal = journal;
		this.report = report;
		this.delay = delay;
		this.controller = new AbortController();
		this.registered = false;
		this.running = undefined;
		this.unsubscribe = undefined;
		this.completion = undefined;
	}
	emit(kind, details = {}) {
		this.report({
			kind,
			seat: this.registration.id,
			nativeSession: this.registration.harness_session,
			...details,
		});
	}
	stop() {
		this.registered = false;
		this.controller.abort();
		this.unsubscribe?.();
		this.unsubscribe = undefined;
	}
	run() {
		if (!this.running) this.running = this.consume();
		return this.running;
	}
	async register() {
		const signal = this.controller.signal;
		const registration = this.registration;
		const seat = await this.client.request(
			"/v1/register",
			this.reconnectRegistration ?? registration,
			signal,
		);
		throwIfStopped(signal);
		verifyRegisteredSeat(seat, registration);
		this.registered = true;
		if (!this.reconnectRegistration) {
			this.reconnectRegistration = { ...registration };
			delete this.reconnectRegistration.supersedes;
			this.emit("registered", {
				pid: registration.pid,
				procStart: registration.proc_start,
				pane: registration.pane ?? null,
			});
		}
	}
	tuple() {
		const r = this.registration;
		return { seat: r.id, native_session: r.harness_session, pid: r.pid, proc_start: r.proc_start };
	}
	async consume() {
		const signal = this.controller.signal;
		let retry = INITIAL_RETRY_MS;
		let failureEpisode = false;
		try {
			throwIfStopped(signal);
			if (typeof this.native.getEvents !== "function")
				throw new NativeError(
					"Native history API getEvents is unavailable; receiving held without acknowledgement",
				);
			this.unsubscribe = this.native.on((event) => {
				if (signal.aborted) return;
				const completion = this.completion;
				// Successful terminal observation clears ancestry; capture its pre-state, not the aftermath.
				const metadata = [
					"user.message",
					"assistant.message",
					"session.idle",
					"session.error",
				].includes(event.type)
					? {
							completionNativeId: completion?.nativeId ?? null,
							completionLive: completion?.live ?? false,
							parentKnown: completion?.descendants.has(event.parentId) ?? false,
							descendantCount: completion?.descendants.size ?? 0,
						}
					: undefined;
				completion?.observe(event);
				if (metadata)
					this.emit("native-event", {
						type: event.type,
						eventId: typeof event.id === "string" ? event.id : null,
						nativeMessageId:
							typeof event.data?.messageId === "string" ? event.data.messageId : null,
						parentId: typeof event.parentId === "string" ? event.parentId : null,
						agentId: typeof event.agentId === "string" ? event.agentId : null,
						interactionId:
							typeof event.data?.interactionId === "string" ? event.data.interactionId : null,
						...metadata,
						terminal: completion?.terminal
							? { type: completion.terminal.type, eventId: completion.terminal.eventId }
							: null,
						grade: "native-event-not-pij-ack",
					});
				if (event.type === "session.shutdown") this.stop();
			});
			while (!signal.aborted) {
				try {
					if (!this.registered) await this.register();
					if (this.completion) await this.waitForCompletion();
					throwIfStopped(signal);
					const { claims, hold } = await this.client.claimInbox(this.tuple(), signal);
					throwIfStopped(signal);
					if (!Array.isArray(claims) || claims.length > 1)
						throw new NativeError("Expected zero or one native claim; receiving held");
					if (failureEpisode) this.emit("connection-ready");
					failureEpisode = false;
					if (hold?.kind === "native-target") {
						this.emit("receive-held", {
							holdKind: hold.kind,
							diagnostic: hold.reason,
							action:
								"Resume the targeted native session or use a new seat and intentionally reissue the message; no acknowledgement was sent.",
						});
						return;
					}
					if (hold || claims.length === 0) {
						if (hold) this.emit("consent-held", { reason: hold.reason, retryMs: retry });
						await this.delay(retry, signal);
						retry = Math.min(retry * 2, MAX_RETRY_MS);
						continue;
					}
					await this.deliver(claims[0]);
					retry = INITIAL_RETRY_MS;
				} catch (error) {
					if (signal.aborted) return;
					if (!(error instanceof InboxWaitDeadline)) {
						if (!error.retryable) throw error;
						this.registered = false;
						if (!failureEpisode)
							this.emit("reconnecting", { diagnostic: error.message, retryMs: retry });
						failureEpisode = true;
					}
					await this.delay(retry, signal);
					retry = Math.min(retry * 2, MAX_RETRY_MS);
				}
			}
		} catch (error) {
			if (!signal.aborted)
				this.emit("receive-held", {
					diagnostic: error.message,
					action:
						"Inspect native history and durable acceptance before recovery; do not blindly resend or acknowledge.",
				});
		} finally {
			this.unsubscribe?.();
			this.unsubscribe = undefined;
			this.completion = undefined;
		}
	}
	async waitForCompletion() {
		const completion = this.completion;
		if (completion.reported) return;
		this.emit("completion-wait", { msgId: completion.msgId, nativeMessageId: completion.nativeId });
		await this.waitForObservation(completion, true);
		const terminal = completion.terminal;
		throwIfStopped(this.controller.signal);
		completion.reported = true;
		this.emit("native-completed", {
			msgId: completion.msgId,
			nativeMessageId: completion.nativeId,
			...terminal,
			grade: "observed-native-terminal-not-model-success",
		});
	}
	async waitForObservation(completion, terminal = false, message) {
		const signal = this.controller.signal;
		const observed = terminal ? completion.done : completion.consumed;
		let retry = INITIAL_RETRY_MS;
		while (!(terminal ? completion.terminal : completion.consumption)) {
			throwIfStopped(signal);
			let events;
			try {
				events = await abortable(
					Promise.race([this.native.getEvents(), observed.then(() => undefined)]),
					signal,
				);
			} catch (error) {
				if (signal.aborted) throw error;
				throw new NativeError(
					"Native history could not be read; accepted delivery held without reinjection or unproven acknowledgement",
				);
			}
			throwIfStopped(signal);
			if (events === undefined && (terminal ? completion.terminal : completion.consumption)) return;
			if (!Array.isArray(events))
				throw new NativeError(
					"Native history returned malformed events; receiving held for recovery",
				);
			for (const event of events) completion.observe(event);
			if (terminal ? completion.terminal : completion.consumption) return;
			if (message && completion.boundary && (await this.canRetryDiscarded(completion, message)))
				return true;
			await abortable(Promise.race([this.delay(retry, signal), observed]), signal);
			retry = Math.min(retry * 2, MAX_RETRY_MS);
		}
	}
	async canRetryDiscarded(completion, message) {
		const signal = this.controller.signal;
		const queue = this.native.rpc?.queue;
		const metadata = this.native.rpc?.metadata;
		if (typeof queue?.pendingItems !== "function" || typeof metadata?.isProcessing !== "function")
			throw new NativeError(
				"Native discard recovery requires supported queue and processing APIs; receiving held",
			);
		try {
			const pending = await abortable(queue.pendingItems(), signal);
			throwIfStopped(signal);
			if (
				!Array.isArray(pending?.items) ||
				!pending.items.every(
					(item) => nonempty(item?.id) && typeof item.displayText === "string",
				) ||
				!Array.isArray(pending.steeringMessages) ||
				!pending.steeringMessages.every((item) => typeof item === "string") ||
				(pending.inFlightSteeringCount !== undefined &&
					(!Number.isSafeInteger(pending.inFlightSteeringCount) ||
						pending.inFlightSteeringCount < 0))
			)
				throw new NativeError(
					"Native discard recovery received malformed queue snapshot; receiving held",
				);
			const prefix = `[pij from ${JSON.stringify(message.from)}; msg_id=${JSON.stringify(message.msg_id)}]\n`;
			if (
				pending.items.some(
					(item) => item.id === completion.nativeId || item.displayText.startsWith(prefix),
				) ||
				pending.steeringMessages.some((item) => item.startsWith(prefix)) ||
				pending.inFlightSteeringCount > 0
			)
				return false;
			const state = await abortable(metadata.isProcessing(), signal);
			throwIfStopped(signal);
			if (typeof state?.processing !== "boolean")
				throw new NativeError(
					"Native discard recovery received malformed processing snapshot; receiving held",
				);
			if (state.processing) return false;
			// Queue and processing snapshots precede a fresh history read so a just-consumed item wins.
			const events = await abortable(this.native.getEvents(), signal);
			throwIfStopped(signal);
			if (!Array.isArray(events))
				throw new NativeError("Native discard recovery received malformed history; receiving held");
			for (const event of events) completion.observe(event);
			return !completion.consumption;
		} catch (error) {
			if (signal.aborted || error instanceof NativeError) throw error;
			throw new NativeError(
				"Native discard recovery queue, processing or history snapshot failed; receiving held without reinjection",
			);
		}
	}
	async newCompletion(msgId) {
		const completion = new NativeCompletion(msgId);
		let events;
		try {
			events = await abortable(this.native.getEvents(), this.controller.signal);
		} catch (error) {
			if (this.controller.signal.aborted) throw error;
			throw new NativeError(
				"Native history baseline is unavailable; receiving held without injection",
			);
		}
		throwIfStopped(this.controller.signal);
		if (!Array.isArray(events))
			throw new NativeError(
				"Native discard recovery history baseline is malformed; receiving held",
			);
		completion.trackBoundaries(events);
		return completion;
	}
	async enqueue(message, completion) {
		const signal = this.controller.signal;
		throwIfStopped(signal);
		const prompt = `[pij from ${JSON.stringify(message.from)}; msg_id=${JSON.stringify(message.msg_id)}]\n${message.body}`;
		this.completion = completion;
		let nativeId;
		try {
			nativeId = await abortable(this.native.send({ prompt, mode: "enqueue" }), signal);
		} catch (error) {
			if (signal.aborted) throw error;
			throw new NativeError(
				"Native send outcome is ambiguous; intent preserved without ack or reinjection",
			);
		}
		throwIfStopped(signal);
		if (!nonempty(nativeId))
			throw new NativeError("Native send returned no message ID; acceptance ambiguous");
		completion.bind(nativeId);
		await this.journal.accept(message, nativeId);
		throwIfStopped(signal);
		this.emit("native-accepted", {
			msgId: message.msg_id,
			nativeMessageId: nativeId,
			grade: "native-accepted-not-model-complete",
		});
		return { state: "accepted", message, nativeId };
	}
	async #prepareNewSend() {
		const signal = this.controller.signal;
		throwIfStopped(signal);
		const snapshot = await abortable(this.client.consentSnapshot(this.tuple(), signal), signal);
		throwIfStopped(signal);
		if (!snapshot.semantic_hold) return true;
		this.emit("consent-held", { reason: "semantic-hold", retryMs: INITIAL_RETRY_MS });
		await abortable(this.delay(INITIAL_RETRY_MS, signal), signal);
		throwIfStopped(signal);
		// Operator Hold can race a claim. Do not clear it or reuse that delayed claim.
		return false;
	}
	async deliver(claim) {
		const signal = this.controller.signal;
		const proof = claim?.native_consumer;
		const expected = this.tuple();
		if (
			!proof ||
			proof.native_session !== expected.native_session ||
			proof.pid !== expected.pid ||
			proof.proc_start !== expected.proc_start
		)
			throw new NativeError(
				"Native consumer proof absent or mismatched; no injection or acknowledgement",
			);
		const message = messageFromClaim(claim, this.registration.id);
		let record = await this.journal.load(message.msg_id);
		throwIfStopped(signal);
		if (!record) {
			if (!(await this.#prepareNewSend())) return;
			throwIfStopped(signal);
			const completion = await this.newCompletion(message.msg_id);
			throwIfStopped(signal);
			if (await this.journal.begin(message)) {
				record = await this.enqueue(message, completion);
			} else record = await this.journal.load(message.msg_id);
		}
		throwIfStopped(signal);
		if (!record || !sameMessage(record.message, message))
			throw new NativeError("Duplicate message ID has conflicting content; receive held");
		if (record.state !== "accepted" || !nonempty(record.nativeId))
			throw new NativeError(
				"Previous native send is ambiguous; held without reinjection or acknowledgement",
			);
		if (this.completion?.msgId !== message.msg_id || this.completion.nativeId !== record.nativeId) {
			this.completion = await this.newCompletion(message.msg_id);
			this.completion.live = false;
			this.completion.bind(record.nativeId);
		}
		while (await this.waitForObservation(this.completion, false, message)) {
			throwIfStopped(signal);
			if (!(await this.#prepareNewSend())) {
				this.completion = undefined;
				return;
			}
			if (this.completion.consumption) break;
			const completion = await this.newCompletion(message.msg_id);
			if (!(await this.canRetryDiscarded(this.completion, message))) continue;
			if (this.completion.consumption) break;
			if (!(await this.journal.rearm(message, record.nativeId)))
				throw new NativeError(
					"Native discard retry intent is already owned or ambiguous; receiving held without reinjection",
				);
			throwIfStopped(signal);
			if (this.completion.consumption) {
				await this.journal.accept(message, record.nativeId);
				break;
			}
			const discarded = this.completion;
			record = await this.enqueue(message, completion);
			this.emit("native-requeued", {
				msgId: message.msg_id,
				nativeMessageId: record.nativeId,
				discardedNativeId: discarded.nativeId,
				boundaryId: discarded.boundary,
			});
		}
		throwIfStopped(signal);
		const acknowledged = await this.client.request(
			"/v1/inbox/ack",
			{ ...this.tuple(), job_id: claim.job_id },
			signal,
		);
		throwIfStopped(signal);
		if (acknowledged !== claim.job_id)
			throw new NativeError("Daemon ack did not confirm this job ID");
		this.emit("inbox-acknowledged", {
			jobId: claim.job_id,
			msgId: message.msg_id,
			nativeMessageId: record.nativeId,
			grade: "native-consumed-not-model-complete",
		});
	}
	async send(input) {
		if (!this.registered || this.controller.signal.aborted)
			return { ok: false, error: "Pij native session is not registered; no message sent" };
		if (!nonempty(input?.to) || !nonempty(input?.message))
			return { ok: false, error: "pij_send requires nonempty to and message strings" };
		const msgId = randomUUID();
		try {
			const receipt = await this.client.request(
				"/v1/send",
				{ from: this.registration.id, to: { seat: input.to }, body: input.message, msg_id: msgId },
				this.controller.signal,
			);
			throwIfStopped(this.controller.signal);
			if (receipt?.msg_id !== msgId)
				throw new NativeError("Daemon send receipt has a different message ID");
			return { ok: true, receipt, grade: "pij-receipt-not-model-complete" };
		} catch (error) {
			return { ok: false, msg_id: msgId, error: error.message, grade: "send-outcome-unconfirmed" };
		}
	}
}

/** Follow OS parent links; neither the extension child nor pane shell is the host. */
export async function resolveNativeHost({ parentPid, inspectProcess, pane, paneProcess }) {
	if (pane !== undefined && (!/^%\d+$/.test(pane) || !positiveInteger(paneProcess)))
		throw new NativeError("Native pane identity could not be observed");
	const seen = new Set();
	let pid = parentPid;
	let host;
	let inPane = pane === undefined;
	while (positiveInteger(pid) && pid > 1 && seen.size < 64 && !seen.has(pid)) {
		seen.add(pid);
		const observed = await inspectProcess(pid);
		if (observed.pid !== pid || !positiveInteger(observed.proc_start))
			throw new NativeError("Native ancestor identity changed during observation");
		if (!host && /(?:^|[/\\])copilot(?:\.exe)?$/.test(observed.command)) host = observed;
		if (pid === paneProcess) inPane = true;
		if (host && inPane) break;
		pid = observed.ppid;
	}
	if (!host || !inPane)
		throw new NativeError(
			"Cannot verify a Copilot host ancestor in the exact pane; native registration refused",
		);
	const confirmed = await inspectProcess(host.pid);
	if (
		confirmed.proc_start !== host.proc_start ||
		confirmed.ppid !== host.ppid ||
		confirmed.command !== host.command
	)
		throw new NativeError("Native host incarnation changed during observation");
	return Object.freeze({
		pid: host.pid,
		proc_start: host.proc_start,
		...(pane === undefined ? {} : { pane }),
	});
}

/** Native timeline diagnostics share an episode across bootstrap and receive reconnects. */
export function createNativeReporter({ log, capture }) {
	let unavailable = false;
	return (event) => {
		if (event.kind === "registered" || event.kind === "connection-ready") unavailable = false;
		if (event.kind === "connection-ready") return;
		if (event.kind === "native-requeued") {
			capture(event);
			return Promise.resolve()
				.then(() => log("📨 re-queued 1 pij messages after interrupt", { level: "info" }))
				.catch(() => capture({ kind: "native-diagnostic-unavailable", failureKind: event.kind }));
		}
		if (
			["registration-wait", "reconnecting", "receive-held", "extension-unavailable"].includes(
				event.kind,
			)
		) {
			if (unavailable && event.kind !== "receive-held") return;
			unavailable = true;
			const advice =
				event.kind === "receive-held"
					? event.holdKind === "native-target"
						? "queued work targets another native session; resume that native session or use a new seat and intentionally reissue the message; receiving stopped without acknowledgement; outgoing pij_send remains available"
						: "receiving held; inspect native history and acceptance before recovery, do not blindly resend or acknowledge"
					: "check the Pij daemon and PIJ_RS_ADDR/PIJ_RS_STATE_DIR; retrying when available; ordinary Copilot remains usable";
			// Never project a remote error body (or credential) into the native timeline.
			return Promise.resolve()
				.then(() => log(`[pij native] unavailable: ${event.kind}; ${advice}`, { level: "info" }))
				.catch(() => capture({ kind: "native-diagnostic-unavailable", failureKind: event.kind }));
		}
		capture(event);
	};
}
