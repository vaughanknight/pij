import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setImmediate as flush } from "node:timers/promises";
import {
	chooseRegistration,
	DaemonClient,
	FileJournal,
	NativeBridge,
	parseProcessStart,
} from "./store.mjs";

const registration = Object.freeze({
	id: "pij-test",
	harness: "copilot",
	harness_session: "native-137",
	folder: "/work",
	pid: 137,
	proc_start: 20260905120000,
	pane: "%137",
	relay: false,
	native_extension_delivery: true,
});
const descriptor = {
	id: registration.id,
	harness: "copilot",
	session: registration.harness_session,
	folder: registration.folder,
	pane: registration.pane,
	proc: { pid: registration.pid, proc_start: registration.proc_start },
	native_extension_delivery: true,
	typing_grace_ms: 60000,
};
const claim = {
	job_id: 137,
	message: {
		msg_id: "message-137",
		from: "pij-peer",
		to: registration.id,
		body: "Hello; /new stays data",
	},
	native_consumer: {
		native_session: registration.harness_session,
		pid: registration.pid,
		proc_start: registration.proc_start,
	},
};
const tuple = {
	seat: registration.id,
	native_session: registration.harness_session,
	pid: registration.pid,
	proc_start: registration.proc_start,
};
function observedTyping(overrides = {}, consumer = tuple) {
	return {
		state: "observed",
		native_consumer: {
			native_session: consumer.native_session,
			pid: consumer.pid,
			proc_start: consumer.proc_start,
		},
		typing_grace_ms: 60000,
		observed_at_ms: 100000,
		retry_after_ms: 0,
		semantic_hold: false,
		source: "pane-observed-edit-recency",
		...overrides,
	};
}
function unavailableTyping(overrides = {}) {
	const { retry_after_ms, source, ...snapshot } = observedTyping();
	return {
		...snapshot,
		state: "unavailable",
		reason: "native-typing-sensor-unavailable",
		...overrides,
	};
}
const unavailableRefusal = {
	ok: false,
	v: 2,
	command: "pij inbox",
	error: "refused",
	meta: "daemon/native-inbox: native-extension-unavailable: Copilot requires current native registration",
};
function deferred() {
	let resolve;
	const promise = new Promise((r) => {
		resolve = r;
	});
	return { promise, resolve };
}
function fixture(overrides = {}) {
	const trace = [];
	const records = new Map();
	const accepted = deferred();
	let observer;
	let claims = 0;
	const journal = {
		async load(id) {
			return records.get(id);
		},
		async begin(message) {
			trace.push("intent");
			if (records.has(message.msg_id)) return false;
			records.set(message.msg_id, { state: "pending", message });
			return true;
		},
		async accept(message, nativeId) {
			trace.push("persist");
			records.set(message.msg_id, { state: "accepted", message, nativeId });
		},
	};
	const native = {
		on(fn) {
			trace.push("subscribe");
			observer = fn;
			return () => trace.push("unsubscribe");
		},
		async send(input) {
			trace.push("send");
			assert.equal(input.mode, "enqueue");
			return "native-message-137";
		},
	};
	const client = {
		heldJobs: new Set(),
		async typingSnapshot(consumer, signal) {
			assert.equal(signal.aborted, false);
			trace.push("typing");
			return observedTyping({}, consumer);
		},
		async claimInbox(consumer, signal) {
			const query = new URLSearchParams({ ...consumer, wait: "true" });
			return { claims: await this.request(`/v1/inbox?${query}`, undefined, signal), hold: null };
		},
		async request(path, body, signal) {
			if (path === "/v1/register") {
				trace.push("register");
				return descriptor;
			}
			if (path.startsWith("/v1/inbox?")) {
				trace.push("claim");
				assert.deepEqual(Object.fromEntries(new URLSearchParams(path.split("?")[1])), {
					...Object.fromEntries(Object.entries(tuple).map(([k, v]) => [k, String(v)])),
					wait: "true",
				});
				if (claims++ === 0) return [claim];
				return new Promise((resolve) =>
					signal.addEventListener("abort", () => resolve([]), { once: true }),
				);
			}
			if (path === "/v1/inbox/ack") {
				trace.push("ack");
				assert.deepEqual(body, { ...tuple, job_id: claim.job_id });
				return claim.job_id;
			}
			if (path === "/v1/hold") {
				trace.push("hold");
				client.heldJobs.add(body.job_id);
				return { msg_id: body.msg_id, held: true };
			}
			if (path === "/v1/release") {
				trace.push("release");
				return client.heldJobs.delete(body.job_id)
					? { msg_id: body.msg_id, released: true }
					: { msg_id: body.msg_id, released: false, noop: true, reason: "not-deferred" };
			}
			if (path === "/v1/send") {
				trace.push("outgoing");
				return { msg_id: body.msg_id, outcome: { outcome: "queued" }, at: 137 };
			}
			throw new Error(`Unexpected path ${path}`);
		},
	};
	const reports = [];
	const bridge = new NativeBridge({
		registration,
		journal,
		native,
		client,
		report: (event) => {
			reports.push(event);
			if (event.kind === "inbox-acknowledged") accepted.resolve();
		},
		...overrides,
	});
	return {
		bridge,
		trace,
		records,
		accepted,
		journal,
		native,
		client,
		reports,
		event: (event) => observer(event),
	};
}

test("acceptance is persisted before tuple-bound acknowledgement, not model completion", async () => {
	const f = fixture();
	const run = f.bridge.run();
	await f.accepted.promise;
	f.bridge.stop();
	await run;
	assert.deepEqual(f.trace.slice(0, 9), [
		"subscribe",
		"register",
		"claim",
		"typing",
		"intent",
		"send",
		"persist",
		"release",
		"ack",
	]);
	assert.equal(f.records.get(claim.message.msg_id).nativeId, "native-message-137");
	assert.ok(
		f.reports.some(
			(e) => e.kind === "inbox-acknowledged" && e.grade === "native-accepted-not-model-complete",
		),
	);
});

test("accepted duplicate after restart only acknowledges, never reinjects", async () => {
	const f = fixture();
	f.client.typingSnapshot = async () => {
		assert.fail("Accepted duplicate must not consult the new-injection sensor");
	};
	f.records.set(claim.message.msg_id, {
		state: "accepted",
		message: claim.message,
		nativeId: "already-native",
	});
	const run = f.bridge.run();
	await f.accepted.promise;
	f.bridge.stop();
	await run;
	assert.equal(f.trace.includes("send"), false);
	assert.equal(f.trace.includes("ack"), true);
});

for (const [name, change] of [
	[
		"ambiguous prior send",
		(f) => f.records.set(claim.message.msg_id, { state: "pending", message: claim.message }),
	],
	[
		"recipient mismatch",
		(f) => {
			const request = f.client.request;
			f.client.request = (p, b, s) =>
				p.startsWith("/v1/inbox?")
					? [{ ...claim, message: { ...claim.message, to: "someone-else" } }]
					: request(p, b, s);
		},
	],
	[
		"unsupported command",
		(f) => {
			const request = f.client.request;
			f.client.request = (p, b, s) =>
				p.startsWith("/v1/inbox?")
					? [{ ...claim, message: { ...claim.message, command: "new" } }]
					: request(p, b, s);
		},
	],
	[
		"multiple claims",
		(f) => {
			const request = f.client.request;
			f.client.request = (p, b, s) =>
				p.startsWith("/v1/inbox?") ? [claim, claim] : request(p, b, s);
		},
	],
	[
		"storage failure",
		(f) => {
			f.journal.begin = async () => {
				throw new Error("disk full");
			};
		},
	],
	[
		"duplicate id with changed body",
		(f) =>
			f.records.set(claim.message.msg_id, {
				state: "accepted",
				message: { ...claim.message, body: "other" },
				nativeId: "other-native",
			}),
	],
]) {
	test(`${name} holds without native send or ack; outgoing remains available`, async () => {
		const f = fixture();
		change(f);
		await f.bridge.run();
		assert.equal(f.trace.includes("send"), false);
		assert.equal(f.trace.includes("ack"), false);
		assert.ok(f.reports.some((e) => e.kind === "receive-held"));
		const result = await f.bridge.send({ to: "pij-peer", message: "diagnostic" });
		assert.equal(result.ok, true);
		f.bridge.stop();
	});
}

test("send rejection is ambiguous and never acknowledged or retried", async () => {
	const f = fixture();
	f.native.send = async () => {
		f.trace.push("send");
		throw new Error("connection lost after enqueue");
	};
	await f.bridge.run();
	assert.equal(f.trace.filter((x) => x === "send").length, 1);
	assert.equal(f.trace.includes("ack"), false);
	assert.equal(f.records.get(claim.message.msg_id).state, "pending");
	f.bridge.stop();
});

test("native acceptance followed by failed persistence stays unacknowledged", async () => {
	const f = fixture();
	f.journal.accept = async () => {
		throw new Error("disk full");
	};
	await f.bridge.run();
	assert.equal(f.trace.includes("send"), true);
	assert.equal(f.trace.includes("ack"), false);
	f.bridge.stop();
});

test("late native completion after stop cannot acknowledge another generation", async () => {
	const f = fixture();
	const sending = deferred();
	const completion = deferred();
	f.native.send = () => {
		sending.resolve();
		return completion.promise;
	};
	const run = f.bridge.run();
	await sending.promise;
	f.bridge.stop();
	await run;
	completion.resolve("late-native");
	await Promise.resolve();
	assert.equal(f.trace.includes("ack"), false);
	assert.equal(f.records.get(claim.message.msg_id).state, "pending");
	assert.equal((await f.bridge.send({ to: "pij-peer", message: "late" })).ok, false);
});

test("two run calls share a single consumer; buffered events never forward replies", async () => {
	const f = fixture();
	const first = f.bridge.run();
	assert.equal(first, f.bridge.run());
	await f.accepted.promise;
	for (const type of ["user.message", "assistant.message", "session.idle", "session.error"])
		f.event({ type, data: { messageId: "buffered", content: "reply" } });
	assert.equal(f.trace.includes("outgoing"), false);
	f.bridge.stop();
	await first;
});

test("outgoing tool ignores spoofed from, mints unique ids and returns queue grade", async () => {
	const f = fixture();
	const run = f.bridge.run();
	await f.accepted.promise;
	const sent = [];
	const request = f.client.request;
	f.client.request = (path, body, signal) => {
		if (path === "/v1/send") sent.push(body);
		return request(path, body, signal);
	};
	for (let i = 0; i < 2; i++)
		assert.equal(
			(await f.bridge.send({ to: "pij-peer", message: "reply", from: "forged" })).ok,
			true,
		);
	assert.equal(sent[0].from, registration.id);
	assert.equal(sent[0].body, "reply");
	assert.notEqual(sent[0].msg_id, sent[1].msg_id);
	f.bridge.stop();
	await run;
});

for (const patch of [
	{ native_extension_delivery: false },
	{ harness: "omp" },
	{ id: "another" },
	{ session: "another-native" },
	{ proc: { pid: 138, proc_start: registration.proc_start } },
	{ pane: "%138" },
]) {
	test(`registration readback refuses ${JSON.stringify(patch)}`, async () => {
		const f = fixture();
		f.client.request = async () => ({ ...descriptor, ...patch });
		await f.bridge.run();
		assert.equal(f.trace.includes("claim"), false);
		assert.equal((await f.bridge.send({ to: "pij-peer", message: "not bound" })).ok, false);
		assert.ok(f.reports.some((e) => e.kind === "receive-held"));
		f.bridge.stop();
	});
}

test("registration tolerates additive plan135 binding metadata", async () => {
	const f = fixture();
	const request = f.client.request;
	f.client.request = (p, b, s) =>
		p === "/v1/register"
			? { ...descriptor, binding: { unexpected_future: true } }
			: request(p, b, s);
	const run = f.bridge.run();
	await f.accepted.promise;
	f.bridge.stop();
	await run;
});

test("manual identity stable; exact process native rollover supersedes predecessor", () => {
	const input = {
		sessionId: registration.harness_session,
		host: { pid: registration.pid, proc_start: registration.proc_start, pane: registration.pane },
		folder: registration.folder,
		env: {},
	};
	const fresh = chooseRegistration({ ...input, seats: [] });
	assert.equal(fresh.id, chooseRegistration({ ...input, seats: [] }).id);
	assert.equal(
		fresh.id,
		chooseRegistration({
			...input,
			host: { ...input.host, pid: 999, proc_start: input.host.proc_start + 100 },
			seats: [],
		}).id,
	);
	assert.equal(chooseRegistration({ ...input, seats: [descriptor] }).id, registration.id);
	const rolled = chooseRegistration({ ...input, sessionId: "native-next", seats: [descriptor] });
	assert.equal(rolled.supersedes, registration.id);
	assert.notEqual(rolled.id, registration.id);
	assert.throws(
		() =>
			chooseRegistration({
				...input,
				seats: [
					{
						...descriptor,
						native_extension_delivery: false,
						proc: { ...descriptor.proc, pid: 999 },
					},
				],
			}),
		/identity|pane|process/i,
	);
	assert.throws(
		() => chooseRegistration({ ...input, seats: [], env: { PIJ_SESSION_ID: "unproven" } }),
		/prebind|identity|corroborat/i,
	);
});

test("spawn binding requires exact process, pane and correlation", () => {
	const input = {
		sessionId: registration.harness_session,
		host: { pid: registration.pid, proc_start: registration.proc_start, pane: registration.pane },
		folder: registration.folder,
		env: { PIJ_SESSION_ID: registration.id, PIJ_SPAWN_ID: "spawn-137" },
	};
	assert.equal(
		chooseRegistration({
			...input,
			seats: [
				{
					...descriptor,
					proc: null,
					session: null,
					spawn_id: "spawn-137",
					native_extension_delivery: false,
				},
			],
		}).id,
		registration.id,
	);
	assert.throws(
		() => chooseRegistration({ ...input, seats: [{ ...descriptor, spawn_id: "another" }] }),
		/spawn|identity|corroborat/i,
	);
});

test("cold native resume nominates a unique attested address without trusting roster state", () => {
	const host = {
		...descriptor.proc,
		pid: 999,
		proc_start: descriptor.proc.proc_start + 100,
		pane: "%999",
	};
	for (const state of ["working", "dead"]) {
		const selected = chooseRegistration({
			sessionId: descriptor.session,
			host,
			folder: "/resumed",
			env: {},
			seats: [{ ...descriptor, state }],
		});
		assert.equal(selected.id, descriptor.id);
		assert.equal(selected.pid, host.pid);
		assert.equal(selected.proc_start, host.proc_start);
		assert.equal(selected.pane, host.pane);
		assert.equal(selected.supersedes, undefined);
	}
});

test("ambiguous native addresses and unverified native claims do not authorize resume", () => {
	const input = {
		sessionId: descriptor.session,
		host: { ...descriptor.proc, pid: 999 },
		folder: "/work",
		env: {},
	};
	assert.throws(
		() =>
			chooseRegistration({ ...input, seats: [descriptor, { ...descriptor, id: "other-address" }] }),
		(error) => /multiple candidate/.test(error.message) && error.retryable === true,
	);
	for (const change of [{ native_extension_delivery: false }, { proc: null }, { harness: "pi" }]) {
		assert.notEqual(
			chooseRegistration({ ...input, seats: [{ ...descriptor, ...change }] }).id,
			descriptor.id,
		);
		assert.throws(
			() =>
				chooseRegistration({
					...input,
					host: { ...input.host, pane: descriptor.pane },
					seats: [{ ...descriptor, ...change }],
				}),
			/Pane belongs/,
		);
	}
});

test("explicit retirement reopens as fresh attachment, including same-process A to B to A", async (t) => {
	const home = await mkdtemp(join(tmpdir(), "pij-native-retired-"));
	t.after(() => rm(home, { recursive: true, force: true }));
	const input = {
		sessionId: "native-A",
		host: { ...descriptor.proc, pane: descriptor.pane },
		folder: "/work",
		env: {},
	};
	const first = chooseRegistration({ ...input, seats: [] });
	const firstSeat = { ...descriptor, id: first.id, session: first.harness_session };
	const message = { ...claim.message, to: first.id };
	const oldJournal = new FileJournal(home, first);
	assert.equal(await oldJournal.begin(message), true);
	await oldJournal.accept(message, "old-acceptance");
	const next = chooseRegistration({ ...input, sessionId: "native-B", seats: [firstSeat] });
	assert.equal(next.supersedes, first.id);
	const retired = {
		...firstSeat,
		tombstoned_at: 1,
		native_extension_delivery: false,
		state: "tombstoned",
	};
	const current = { ...descriptor, id: next.id, session: next.harness_session };
	const reopened = chooseRegistration({ ...input, seats: [retired, current] });
	assert.notEqual(reopened.id, first.id);
	assert.notEqual(reopened.id, next.id);
	assert.equal(reopened.supersedes, next.id);
	assert.equal(await new FileJournal(home, reopened).load(message.msg_id), undefined);
	assert.equal((await oldJournal.load(message.msg_id)).nativeId, "old-acceptance");
	const reopenedSeat = { ...firstSeat, id: reopened.id };
	assert.equal(
		chooseRegistration({
			...input,
			host: { ...input.host, pid: 999 },
			seats: [retired, reopenedSeat],
		}).id,
		reopened.id,
	);
	const coldReopen = chooseRegistration({
		...input,
		host: { ...input.host, pid: 999 },
		seats: [retired],
	});
	assert.notEqual(coldReopen.id, retired.id);
	assert.equal(coldReopen.supersedes, undefined);
	assert.throws(
		() =>
			chooseRegistration({
				...input,
				seats: [retired],
				env: { PIJ_SESSION_ID: retired.id, PIJ_SPAWN_ID: "retired-launch" },
			}),
		/prebind|corroborat/,
	);
	assert.notEqual(
		chooseRegistration({ ...input, seats: [{ ...retired, native_extension_delivery: true }] }).id,
		retired.id,
	);
});

test("fresh native conversation nominates new address without retiring old pane owner locally", () => {
	const host = {
		...descriptor.proc,
		pid: 999,
		proc_start: descriptor.proc.proc_start + 100,
		pane: descriptor.pane,
	};
	for (const state of ["working", "dead", "tombstoned"]) {
		const old = {
			...descriptor,
			state,
			native_extension_delivery: state !== "tombstoned",
			tombstoned_at: state === "tombstoned" ? 1 : null,
		};
		const selected = chooseRegistration({
			sessionId: "fresh-native",
			host,
			folder: "/work",
			env: {},
			seats: [old],
		});
		assert.notEqual(selected.id, old.id);
		assert.equal(selected.supersedes, undefined);
		assert.equal(selected.harness_session, "fresh-native");
		assert.equal(old.state, state);
		assert.equal(old.session, descriptor.session);
		assert.deepEqual(old.proc, descriptor.proc);
	}
});

test("valid spawn preallocation precedes resume candidate; cold spawned successor retains correlation", () => {
	const host = { ...descriptor.proc, pid: 999, pane: descriptor.pane };
	const candidate = { ...descriptor, spawn_id: "spawn-137", parent: "pij-parent" };
	const prebind = {
		...candidate,
		id: "pij-preallocated",
		session: null,
		proc: null,
		native_extension_delivery: false,
	};
	const input = {
		sessionId: descriptor.session,
		host,
		folder: "/work",
		seats: [candidate, prebind],
	};
	const selected = chooseRegistration({
		...input,
		env: { PIJ_SESSION_ID: prebind.id, PIJ_SPAWN_ID: candidate.spawn_id },
	});
	assert.equal(selected.id, prebind.id);
	const resumed = chooseRegistration({
		...input,
		seats: [candidate],
		env: { PIJ_SESSION_ID: "old-spawn-address", PIJ_SPAWN_ID: candidate.spawn_id },
	});
	assert.equal(resumed.id, candidate.id);
	assert.equal(resumed.spawn_id, candidate.spawn_id);
	assert.equal(resumed.parent, candidate.parent);
});

test("process start uses daemon local C-locale packed stamp with calendar checks", () => {
	assert.equal(parseProcessStart("Sat Sep  5 12:00:00 2026"), 20260905120000);
	for (const invalid of ["bad", "Mon Feb 30 12:00:00 2026", "Sat Sep 5 25:00:00 2026"])
		assert.throws(() => parseProcessStart(invalid));
});

test("real filesystem journal survives restart and hashes opaque ids with private modes", async (t) => {
	const home = await mkdtemp(join(tmpdir(), "pij-native-journal-"));
	t.after(() => rm(home, { recursive: true, force: true }));
	const journal = new FileJournal(home, registration);
	const message = { ...claim.message, msg_id: "../../opaque/message" };
	const resumed = {
		...registration,
		pid: registration.pid + 1,
		proc_start: registration.proc_start + 100,
	};
	assert.equal(await journal.begin(message), true);
	assert.equal(await new FileJournal(home, resumed).begin(message), false);
	await journal.accept(message, "native-durable");
	const restarted = new FileJournal(home, resumed);
	assert.equal((await restarted.load(message.msg_id)).nativeId, "native-durable");
	assert.equal((await stat(journal.directory)).mode & 0o777, 0o700);
	assert.equal((await stat(journal.path(message.msg_id))).mode & 0o777, 0o600);
	assert.ok(journal.path(message.msg_id).startsWith(journal.directory));
	const next = new FileJournal(home, { ...registration, harness_session: "different" });
	assert.equal(await next.load(message.msg_id), undefined);
	assert.equal(await next.begin(message), true);
	const otherSeat = new FileJournal(home, { ...resumed, id: "different-seat" });
	assert.equal(await otherSeat.load(message.msg_id), undefined);
	assert.match(await readFile(journal.path(message.msg_id), "utf8"), /native-durable/);
});

test("real chooseRegistration and filesystem preserve accepted-before-ack across changed host", {
	timeout: 2000,
}, async (t) => {
	const home = await mkdtemp(join(tmpdir(), "pij-native-restart-"));
	t.after(() => rm(home, { recursive: true, force: true }));
	const input = {
		sessionId: descriptor.session,
		host: { ...descriptor.proc, pane: descriptor.pane },
		folder: "/work",
		env: {},
	};
	const selected = chooseRegistration({ ...input, seats: [] });
	const registered = { ...descriptor, id: selected.id };
	const queued = { ...claim, message: { ...claim.message, to: selected.id } };
	const journal = new FileJournal(home, selected);
	const first = fixture({ registration: selected, journal });
	t.after(() => first.bridge.stop());
	const request = first.client.request;
	let failedAcks = 0;
	first.client.claimInbox = async (consumer) => {
		assert.deepEqual(consumer, { ...tuple, seat: selected.id });
		return { claims: [queued], hold: null };
	};
	first.client.request = async (path, body, signal) => {
		if (path === "/v1/register") {
			assert.deepEqual(body, selected);
			return registered;
		}
		if (path === "/v1/inbox/ack") {
			failedAcks++;
			assert.equal((await journal.load(claim.message.msg_id)).state, "accepted");
			first.bridge.stop();
			throw new Error("Process stopped after durable acceptance before daemon acknowledgement");
		}
		return request(path, body, signal);
	};
	await first.bridge.run();
	assert.equal(failedAcks, 1);
	assert.equal(first.trace.filter((step) => step === "release").length, 1);
	assert.equal(first.trace.filter((step) => step === "send").length, 1);
	assert.equal(
		first.reports.some((event) => event.kind === "inbox-acknowledged"),
		false,
	);

	const resumed = chooseRegistration({
		...input,
		host: { ...input.host, pid: selected.pid + 1, proc_start: selected.proc_start + 100 },
		seats: [registered],
	});
	assert.equal(resumed.id, selected.id);
	assert.notEqual(resumed.pid, selected.pid);
	assert.notEqual(resumed.proc_start, selected.proc_start);
	const live = {
		native_session: resumed.harness_session,
		pid: resumed.pid,
		proc_start: resumed.proc_start,
	};
	const second = fixture({ registration: resumed, journal: new FileJournal(home, resumed) });
	t.after(() => second.bridge.stop());
	let claims = 0;
	let sends = 0;
	const acks = [];
	second.client.claimInbox = async (consumer) => {
		claims++;
		assert.deepEqual(consumer, { seat: resumed.id, ...live });
		return { claims: [{ ...queued, native_consumer: live }], hold: null };
	};
	const resumedRequest = second.client.request;
	second.client.request = async (path, body, signal) => {
		if (path === "/v1/register") {
			assert.deepEqual(body, resumed);
			return { ...registered, proc: { pid: resumed.pid, proc_start: resumed.proc_start } };
		}
		if (path === "/v1/inbox/ack") {
			acks.push(body);
			return claim.job_id;
		}
		return resumedRequest(path, body, signal);
	};
	second.native.send = async () => {
		sends++;
		throw new Error("Duplicate native send after process restart");
	};
	await second.bridge.run();
	assert.equal(claims, 1);
	assert.equal(sends, 0);
	assert.equal(second.trace.filter((step) => step === "release").length, 1);
	assert.deepEqual(acks, [{ seat: resumed.id, ...live, job_id: claim.job_id }]);
	assert.ok(
		second.reports.some(
			(event) =>
				event.kind === "inbox-acknowledged" && event.grade === "native-accepted-not-model-complete",
		),
	);
	assert.ok(
		second.reports.some(
			(event) =>
				event.kind === "receive-held" && /lacks observed native completion/.test(event.diagnostic),
		),
	);
	assert.equal(
		(await second.bridge.send({ to: "pij-peer", message: "restart-held outgoing" })).ok,
		true,
	);
	const fresh = chooseRegistration({
		...input,
		sessionId: "brand-new-native",
		host: { ...input.host, pid: resumed.pid + 1 },
		seats: [registered],
	});
	assert.notEqual(fresh.id, selected.id);
	assert.equal(await new FileJournal(home, fresh).load(queued.message.msg_id), undefined);
});

test("HTTP client reloads key on every request, binds tuple, keeps bounded non-JSON diagnostic", async () => {
	let key = "first-secret";
	const headers = [];
	const client = new DaemonClient({
		addr: "127.0.0.1:13700",
		stateDir: "/isolated",
		readKey: async () => key,
		fetch: async (_url, init) => {
			headers.push(init.headers.Authorization);
			return new Response(JSON.stringify({ ok: true, v: 2, data: [] }));
		},
	});
	await client.claimInbox(tuple);
	key = "rotated-secret";
	await client.claimInbox(tuple);
	assert.deepEqual(headers, ["Bearer first-secret", "Bearer rotated-secret"]);
	const broken = new DaemonClient({
		addr: "127.0.0.1:13700",
		stateDir: "/isolated",
		readKey: async () => key,
		fetch: async () => new Response(`not-json ${"x".repeat(10000)}`, { status: 503 }),
	});
	await assert.rejects(
		broken.claimInbox(tuple),
		(error) =>
			error.message.includes("503") &&
			error.message.includes("not-json") &&
			error.message.length < 5000 &&
			!error.message.includes(key),
	);
});

async function deadlineHttpFixture(t, handler) {
	const requests = [];
	const server = createServer(async (request, response) => {
		let raw = "";
		for await (const chunk of request) raw += chunk;
		const entry = {
			url: new URL(request.url, "http://localhost"),
			method: request.method,
			authorization: request.headers.authorization,
			body: raw ? JSON.parse(raw) : undefined,
		};
		requests.push(entry);
		handler(entry, response);
	});
	t.after(
		() =>
			new Promise((resolve) => {
				server.closeAllConnections();
				server.close(resolve);
			}),
	);
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const client = new DaemonClient({
		addr: `127.0.0.1:${server.address().port}`,
		stateDir: "/isolated",
		readKey: async () => "deadline-key",
		requestTimeoutMs: 150,
	});
	return { client, requests };
}

test("own inbox wait deadlines renew with bounded delay without re-registering or outage logs", async (t) => {
	let polls = 0;
	const { client, requests } = await deadlineHttpFixture(t, ({ url, body }, response) => {
		if (url.pathname === "/v1/register")
			response.end(JSON.stringify({ ok: true, v: 2, data: descriptor }));
		else if (url.pathname === "/v1/inbox") {
			assert.equal(url.searchParams.get("wait"), "true");
			if (++polls === 9) response.end(JSON.stringify({ ok: true, v: 2, data: [claim] }));
		} else if (url.pathname === "/v1/inbox/ack") {
			assert.deepEqual(body, { ...tuple, job_id: claim.job_id });
			response.end(JSON.stringify({ ok: true, v: 2, data: claim.job_id }));
		} else if (url.pathname === "/v1/inbox/typing")
			response.end(JSON.stringify({ ok: true, v: 2, data: observedTyping() }));
		else if (url.pathname === "/v1/release")
			response.end(
				JSON.stringify({
					ok: true,
					v: 2,
					data: { msg_id: body.msg_id, released: false, noop: true, reason: "not-deferred" },
				}),
			);
		else if (url.pathname === "/v1/send")
			response.end(JSON.stringify({ ok: true, v: 2, data: { msg_id: body.msg_id } }));
		else assert.fail(`Unexpected request ${url.pathname}`);
	});
	const waits = [];
	const f = fixture({
		client,
		delay: async (ms) => {
			waits.push(ms);
			assert.equal(f.bridge.registered, true);
			assert.equal(f.trace.includes("send"), false);
			if (waits.length === 4)
				assert.equal(
					(await f.bridge.send({ to: "pij-peer", message: "still available" })).ok,
					true,
				);
		},
	});
	t.after(() => f.bridge.stop());
	const run = f.bridge.run();
	await f.accepted.promise;
	f.bridge.stop();
	await run;
	assert.deepEqual(waits, [250, 500, 1000, 2000, 4000, 5000, 5000, 5000]);
	assert.equal(polls, 9);
	assert.equal(requests.filter(({ url }) => url.pathname === "/v1/register").length, 1);
	assert.equal(requests.filter(({ url }) => url.pathname === "/v1/inbox/ack").length, 1);
	assert.equal(
		requests.every(({ authorization }) => authorization === "Bearer deadline-key"),
		true,
	);
	assert.equal(f.trace.filter((entry) => entry === "send").length, 1);
	assert.equal(
		f.reports.some(({ kind }) =>
			["reconnecting", "connection-ready", "receive-held", "consent-held"].includes(kind),
		),
		false,
	);
	assert.equal(f.trace.at(-1), "unsubscribe");
});

test("inbox wait renewal does not reset an existing outage episode", async (t) => {
	let polls = 0;
	const { client, requests } = await deadlineHttpFixture(t, ({ url, body }, response) => {
		if (url.pathname === "/v1/register")
			response.end(JSON.stringify({ ok: true, v: 2, data: descriptor }));
		else if (url.pathname === "/v1/inbox") {
			polls++;
			if (polls === 1 || polls === 3) {
				response.writeHead(401);
				response.end(JSON.stringify({ ok: false, v: 2, error: "unauthorized" }));
			} else if (polls === 4) response.end(JSON.stringify({ ok: true, v: 2, data: [claim] }));
		} else if (url.pathname === "/v1/inbox/typing")
			response.end(JSON.stringify({ ok: true, v: 2, data: observedTyping() }));
		else if (url.pathname === "/v1/release")
			response.end(
				JSON.stringify({
					ok: true,
					v: 2,
					data: { msg_id: body.msg_id, released: false, noop: true, reason: "not-deferred" },
				}),
			);
		else response.end(JSON.stringify({ ok: true, v: 2, data: claim.job_id }));
	});
	const waits = [];
	const f = fixture({
		client,
		delay: async (ms) => {
			waits.push(ms);
			assert.equal(f.reports.filter(({ kind }) => kind === "connection-ready").length, 0);
		},
	});
	t.after(() => f.bridge.stop());
	const run = f.bridge.run();
	await f.accepted.promise;
	f.bridge.stop();
	await run;
	assert.deepEqual(waits, [250, 500, 1000]);
	assert.equal(requests.filter(({ url }) => url.pathname === "/v1/register").length, 3);
	assert.equal(f.reports.filter(({ kind }) => kind === "reconnecting").length, 1);
	assert.equal(f.reports.filter(({ kind }) => kind === "connection-ready").length, 1);
});

test("HTTP non-wait deadlines, body stalls and connection failures remain retryable", async (t) => {
	let mode = "unanswered";
	const { client } = await deadlineHttpFixture(t, (_entry, response) => {
		if (mode === "disconnect") response.destroy();
		else if (mode === "body") {
			response.writeHead(200, { "Content-Type": "application/json" });
			response.write('{"ok":true,');
		}
	});
	for (const [path, body] of [
		["/v1/register", registration],
		["/v1/send", { to: "pij-peer", body: "test" }],
		["/v1/inbox/ack", { ...tuple, job_id: claim.job_id }],
		["/v1/seats?scope=local", undefined],
		["/v1/inbox?wait=false", undefined],
	])
		await assert.rejects(client.request(path, body), { retryable: true }, path);
	mode = "body";
	await assert.rejects(client.claimInbox(tuple), { retryable: true });
	mode = "disconnect";
	await assert.rejects(client.claimInbox(tuple), { retryable: true });
});

test("foreign TimeoutError remains retryable even after the own inbox deadline", async (t) => {
	const { client } = await deadlineHttpFixture(t, () => {});
	client.fetch = async (url, init) => {
		try {
			return await fetch(url, init);
		} catch {
			throw new DOMException("foreign fetch timeout", "TimeoutError");
		}
	};
	await assert.rejects(client.claimInbox(tuple), { retryable: true });
});

test("external inbox abort is cancellation even with a TimeoutError reason", async (t) => {
	const controller = new AbortController();
	const reason = new DOMException("external cancellation", "TimeoutError");
	const { client, requests } = await deadlineHttpFixture(t, () => controller.abort(reason));
	await assert.rejects(client.claimInbox(tuple, controller.signal), (error) => error === reason);
	assert.equal(requests.length, 1);
});

test("shutdown during inbox renewal delay does not claim or re-register", async (t) => {
	const { client, requests } = await deadlineHttpFixture(t, ({ url }, response) => {
		if (url.pathname === "/v1/register")
			response.end(JSON.stringify({ ok: true, v: 2, data: descriptor }));
	});
	const f = fixture({
		client,
		delay: async (_ms, signal) => {
			f.bridge.stop();
			signal.throwIfAborted();
		},
	});
	await f.bridge.run();
	assert.equal(requests.filter(({ url }) => url.pathname === "/v1/register").length, 1);
	assert.equal(requests.filter(({ url }) => url.pathname === "/v1/inbox").length, 1);
	assert.equal(f.trace.includes("send"), false);
	assert.equal(
		f.reports.some(({ kind }) => ["reconnecting", "receive-held"].includes(kind)),
		false,
	);
	assert.equal(f.trace.at(-1), "unsubscribe");
});

test("accepted-but-unacked reconnect reclaims and acknowledges without second native send", async () => {
	const f = fixture({ delay: async () => undefined });
	const nativeSend = f.native.send;
	f.native.send = async (input) => {
		const nativeId = await nativeSend(input);
		nativeTerminal(f, nativeUser(f, nativeId));
		return nativeId;
	};
	const request = f.client.request;
	let acks = 0;
	let claims = 0;
	f.client.request = async (p, b, s) => {
		if (p.startsWith("/v1/inbox?") && claims++ < 2) return [claim];
		if (p === "/v1/inbox/ack" && acks++ === 0)
			throw Object.assign(new Error("HTTP503 daemon restarted"), { retryable: true });
		return request(p, b, s);
	};
	const run = f.bridge.run();
	await f.accepted.promise;
	f.bridge.stop();
	await run;
	assert.equal(f.trace.filter((x) => x === "send").length, 1);
	assert.equal(f.trace.filter((x) => x === "register").length, 2);
	assert.ok(f.reports.some((e) => e.kind === "reconnecting"));
});

for (const hold of [null, { kind: "consent", reason: "human-typing" }]) {
	test(
		hold
			? "consent inbox holds back off with a ceiling rather than busy-loop"
			: "empty inbox waits back off with a ceiling rather than busy-loop",
		async () => {
			const waits = [];
			const f = fixture({
				delay: async (ms) => {
					waits.push(ms);
					if (waits.length === 8) f.bridge.stop();
				},
			});
			f.client.claimInbox = async () => ({ claims: [], hold });
			await f.bridge.run();
			assert.deepEqual(waits, [250, 500, 1000, 2000, 4000, 5000, 5000, 5000]);
			assert.equal(f.reports.filter((event) => event.kind === "consent-held").length, hold ? 8 : 0);
			assert.equal(f.trace.includes("send"), false);
			assert.equal(f.trace.includes("ack"), false);
		},
	);
}

test("user-driven native shutdown cancels the blocked inbox consumer", async () => {
	const f = fixture();
	const run = f.bridge.run();
	await f.accepted.promise;
	f.event({ type: "session.shutdown", data: {} });
	await run;
	assert.equal(f.bridge.controller.signal.aborted, true);
	assert.equal(f.trace.filter((x) => x === "unsubscribe").length, 1);
});

test("late stale claim after stop cannot reach native send", async () => {
	const f = fixture();
	const pending = deferred();
	const claimed = deferred();
	const request = f.client.request;
	f.client.request = (p, b, s) => {
		if (p.startsWith("/v1/inbox?")) {
			claimed.resolve();
			return pending.promise;
		}
		return request(p, b, s);
	};
	const run = f.bridge.run();
	await claimed.promise;
	f.bridge.stop();
	pending.resolve([claim]);
	await run;
	assert.equal(f.trace.includes("send"), false);
	assert.equal(f.trace.includes("ack"), false);
});

test("native success without native message ID is not accepted", async () => {
	const f = fixture();
	f.native.send = async () => undefined;
	await f.bridge.run();
	assert.equal(f.trace.includes("ack"), false);
	assert.equal(f.records.get(claim.message.msg_id).state, "pending");
	f.bridge.stop();
});

test("daemon stale-incarnation refusal holds without transport fallback", async () => {
	const f = fixture();
	const request = f.client.request;
	f.client.request = (p, b, s) => {
		if (p.startsWith("/v1/inbox?")) throw new Error("HTTP409 stale native incarnation");
		return request(p, b, s);
	};
	await f.bridge.run();
	assert.equal(f.trace.includes("send"), false);
	assert.equal(f.trace.includes("ack"), false);
	assert.ok(f.reports.some((e) => e.kind === "receive-held" && e.diagnostic.includes("409")));
	f.bridge.stop();
});

test("HTTP skew and refused envelopes are never treated as successful claims", async () => {
	for (const response of [
		{ ok: true, v: 1, data: [] },
		{ ok: false, v: 2, error: { kind: "refused" } },
		{ ok: true, v: 2 },
	]) {
		const client = new DaemonClient({
			addr: "127.0.0.1:13700",
			stateDir: "/isolated",
			readKey: async () => "key",
			fetch: async () => new Response(JSON.stringify(response)),
		});
		await assert.rejects(client.claimInbox(tuple));
	}
});

for (const proof of [
	undefined,
	{ ...claim.native_consumer, native_session: "stale-session" },
	{ ...claim.native_consumer, pid: 999 },
	{ ...claim.native_consumer, proc_start: 1 },
]) {
	test(`native consumer proof rejects ${JSON.stringify(proof)} before injection and ack`, async () => {
		const f = fixture();
		const request = f.client.request;
		let claimed = false;
		f.client.request = (p, b, s) => {
			if (p.startsWith("/v1/inbox?")) {
				if (claimed) {
					f.bridge.stop();
					return [];
				}
				claimed = true;
				return [{ ...claim, native_consumer: proof }];
			}
			return request(p, b, s);
		};
		await f.bridge.run();
		assert.equal(f.trace.includes("send"), false);
		assert.equal(f.trace.includes("ack"), false);
		assert.ok(f.reports.some((e) => e.kind === "receive-held"));
		f.bridge.stop();
	});
}

test("spawned native rollover preserves correlation across extension reload", () => {
	const env = { PIJ_SESSION_ID: registration.id, PIJ_SPAWN_ID: "spawn-137" };
	const host = { ...descriptor.proc, pane: descriptor.pane };
	const predecessor = { ...descriptor, spawn_id: "spawn-137" };
	const next = chooseRegistration({
		sessionId: "next-native",
		host,
		folder: "/work",
		seats: [predecessor],
		env,
	});
	assert.equal(next.supersedes, predecessor.id);
	assert.equal(next.spawn_id, "spawn-137");
	const successor = { ...predecessor, id: next.id, session: "next-native" };
	const reloaded = chooseRegistration({
		sessionId: "next-native",
		host,
		folder: "/work",
		seats: [successor],
		env,
	});
	assert.equal(reloaded.id, successor.id);
	assert.equal(reloaded.supersedes, undefined);
});

test("outage emits one actionable reconnect diagnostic per failure episode", async () => {
	let attempts = 0;
	const f = fixture({
		delay: async () => {
			if (attempts >= 5) f.bridge.stop();
		},
	});
	f.client.request = async () => {
		attempts++;
		throw Object.assign(new Error("daemon.key absent: check PIJ_RS_STATE_DIR"), {
			retryable: true,
		});
	};
	await f.bridge.run();
	assert.equal(attempts, 5);
	assert.equal(f.reports.filter((e) => e.kind === "reconnecting").length, 1);
	assert.equal(f.trace.includes("send"), false);
});

test("consent hold release delivers the queued claim without a second message", async () => {
	let held = true;
	let waits = 0;
	const f = fixture({
		delay: async () => {
			waits++;
			held = false;
		},
	});
	const claimInbox = f.client.claimInbox.bind(f.client);
	f.client.claimInbox = (consumer, signal) =>
		held
			? { claims: [], hold: { kind: "consent", reason: "human-typing" } }
			: claimInbox(consumer, signal);
	const run = f.bridge.run();
	await f.accepted.promise;
	f.bridge.stop();
	await run;
	assert.equal(waits, 1);
	assert.ok(
		f.reports.some((event) => event.kind === "consent-held" && event.reason === "human-typing"),
	);
	assert.equal(f.trace.filter((x) => x === "send").length, 1);
});

function nativeUser(f, nativeId, id = `user-${nativeId}`, interactionId) {
	f.event({
		type: "user.message",
		id,
		parentId: "previous",
		data: { messageId: nativeId, turnId: `turn-${nativeId}`, interactionId },
	});
	return id;
}

function nativeTerminal(f, parentId, type = "session.idle", extra = {}) {
	f.event({ type, id: `terminal-${parentId}`, parentId, data: {}, ...extra });
}

test("post-ack barrier blocks next claim until current native completion, not outgoing", async (t) => {
	const f = fixture();
	t.after(() => f.bridge.stop());
	const run = f.bridge.run();
	await f.accepted.promise;
	await flush();
	assert.equal(f.trace.filter((x) => x === "claim").length, 1);
	assert.equal(f.trace.includes("ack"), true);
	assert.equal(
		(await f.bridge.send({ to: "pij-peer", message: "explicit while working" })).ok,
		true,
	);
	nativeTerminal(f, "old-turn");
	const user = nativeUser(f, "native-message-137");
	nativeTerminal(f, "old-turn");
	nativeTerminal(f, user, "session.idle", { agentId: "subagent" });
	f.event({
		type: "assistant.message",
		id: "assistant-current",
		parentId: user,
		data: { content: "not idle" },
	});
	await flush();
	assert.equal(f.trace.filter((x) => x === "claim").length, 1);
	nativeTerminal(f, "assistant-current");
	await flush();
	assert.equal(f.trace.filter((x) => x === "claim").length, 2);
	f.bridge.stop();
	await run;
});

for (const type of ["session.idle", "session.error"]) {
	test(`post-ack barrier retains ${type} before native send resolves`, async (t) => {
		const f = fixture();
		t.after(() => f.bridge.stop());
		const sending = deferred();
		const acceptance = deferred();
		f.native.send = () => {
			f.trace.push("send");
			const user = nativeUser(f, "early-native");
			nativeTerminal(f, user, type);
			sending.resolve();
			return acceptance.promise;
		};
		const run = f.bridge.run();
		await sending.promise;
		assert.equal(f.trace.includes("ack"), false);
		acceptance.resolve("early-native");
		await f.accepted.promise;
		await flush();
		assert.equal(f.trace.filter((x) => x === "claim").length, 2);
		assert.ok(f.reports.some((e) => e.kind === "native-completed" && e.type === type));
		f.bridge.stop();
		await run;
	});
}

test("post-ack barrier captures idle during acknowledgement but cannot overtake ack", async (t) => {
	const f = fixture();
	t.after(() => f.bridge.stop());
	const acknowledging = deferred();
	const ack = deferred();
	const request = f.client.request;
	f.client.request = (p, b, s) => {
		if (p === "/v1/inbox/ack") {
			acknowledging.resolve();
			return ack.promise;
		}
		return request(p, b, s);
	};
	const run = f.bridge.run();
	await acknowledging.promise;
	nativeTerminal(f, nativeUser(f, "native-message-137"));
	await flush();
	assert.equal(f.trace.filter((x) => x === "claim").length, 1);
	ack.resolve(claim.job_id);
	await f.accepted.promise;
	await flush();
	assert.equal(f.trace.filter((x) => x === "claim").length, 2);
	f.bridge.stop();
	await run;
});

test("post-ack barrier cannot release a later send from earlier generation events", async (t) => {
	const f = fixture();
	t.after(() => f.bridge.stop());
	const request = f.client.request;
	let claims = 0;
	let sends = 0;
	f.client.request = (p, b, s) => {
		if (p.startsWith("/v1/inbox?") && ++claims <= 2)
			return [{ ...claim, job_id: claims, message: { ...claim.message, msg_id: `pij-${claims}` } }];
		if (p === "/v1/inbox/ack") return b.job_id;
		if (p.startsWith("/v1/inbox?"))
			return new Promise((resolve) =>
				s.addEventListener("abort", () => resolve([]), { once: true }),
			);
		return request(p, b, s);
	};
	f.native.send = async () => `native-${++sends}`;
	const run = f.bridge.run();
	await f.accepted.promise;
	nativeTerminal(f, nativeUser(f, "native-1", "user-native-1", "interaction-1"));
	await flush();
	assert.equal(sends, 2);
	assert.equal(claims, 2);
	const currentUser = nativeUser(f, "native-2", "user-native-2", "interaction-2");
	nativeTerminal(f, "user-native-1");
	f.event({
		type: "user.message",
		id: "user-native-1",
		parentId: currentUser,
		data: { messageId: "native-1", interactionId: "interaction-1" },
	});
	nativeTerminal(f, "user-native-1");
	f.event({
		type: "assistant.message",
		id: "old-interaction",
		parentId: "omitted-old-parent",
		data: { interactionId: "interaction-1", turnId: "0" },
	});
	nativeTerminal(f, "old-interaction");
	await flush();
	assert.equal(claims, 2);
	f.event({
		type: "assistant.message",
		id: "current-interaction",
		parentId: "omitted-current-parent",
		data: { interactionId: "interaction-2", turnId: "0" },
	});
	nativeTerminal(f, "current-interaction");
	await flush();
	assert.equal(claims, 3);
	f.bridge.stop();
	await run;
});

test("post-ack barrier explicitly holds accepted duplicate without completion evidence", {
	timeout: 1000,
}, async (t) => {
	const f = fixture();
	t.after(() => f.bridge.stop());
	f.records.set(claim.message.msg_id, {
		state: "accepted",
		message: claim.message,
		nativeId: "previous-native",
	});
	const request = f.client.request;
	f.client.request = (path, body, signal) => {
		if (path === "/v1/inbox/ack") {
			nativeUser(f, "previous-native", "recovered-user", "recovered-interaction");
			f.event({
				type: "assistant.message",
				id: "recovered-assistant",
				parentId: "omitted-parent",
				data: { interactionId: "recovered-interaction" },
			});
			nativeTerminal(f, "recovered-assistant");
		}
		return request(path, body, signal);
	};
	await f.bridge.run();
	assert.equal(f.trace.includes("ack"), true);
	assert.equal(f.trace.includes("send"), false);
	assert.equal(f.trace.filter((x) => x === "claim").length, 1);
	assert.ok(f.reports.some((e) => e.kind === "receive-held" && /completion/i.test(e.diagnostic)));
	assert.equal(f.trace.filter((x) => x === "unsubscribe").length, 1);
	assert.equal((await f.bridge.send({ to: "pij-peer", message: "receive is held" })).ok, true);
});

test("post-ack barrier survives failed ack before reclaiming accepted duplicate", async (t) => {
	const f = fixture({ delay: async () => undefined });
	t.after(() => f.bridge.stop());
	const request = f.client.request;
	let claims = 0;
	let acks = 0;
	f.client.request = (p, b, s) => {
		if (p.startsWith("/v1/inbox?")) {
			claims++;
			return [claim];
		}
		if (p === "/v1/inbox/ack" && acks++ === 0)
			throw Object.assign(new Error("lost ack response"), { retryable: true });
		if (p === "/v1/inbox/ack" && acks > 2) f.bridge.stop();
		return request(p, b, s);
	};
	const run = f.bridge.run();
	await flush();
	assert.equal(claims, 1);
	assert.equal(acks, 1);
	nativeTerminal(f, nativeUser(f, "native-message-137"));
	await f.accepted.promise;
	f.bridge.stop();
	await run;
	assert.equal(claims, 2);
	assert.equal(f.trace.filter((x) => x === "send").length, 1);
	assert.equal(f.reports.filter((e) => e.kind === "native-completed").length, 1);
});

test("post-ack barrier shutdown disposes subscription and ignores late completion", async () => {
	const f = fixture();
	const run = f.bridge.run();
	await f.accepted.promise;
	await flush();
	f.event({ type: "session.shutdown", data: {} });
	await run;
	nativeTerminal(f, nativeUser(f, "native-message-137"));
	await flush();
	assert.equal(f.trace.filter((x) => x === "claim").length, 1);
	assert.equal(f.trace.filter((x) => x === "unsubscribe").length, 1);
	assert.equal(
		f.reports.some((e) => e.kind === "native-completed"),
		false,
	);
});

test("post-ack barrier follows real native PoC ancestry with sibling ephemeral idles", async (t) => {
	const f = fixture();
	t.after(() => f.bridge.stop());
	// Native PoC target-events.jsonl:36-54, supplied by PM. Opaque IDs remapped;
	// only the terminal's ancestor chain and sibling assistant.idle retained, no bodies.
	const events = [
		{
			type: "user.message",
			id: "poc-36",
			parentId: "prior-context",
			data: { messageId: "native-poc-second", turnId: "0" },
		},
		{ type: "system.message", id: "poc-37", parentId: "poc-36", data: {} },
		{ type: "assistant.turn_start", id: "poc-39", parentId: "poc-37", data: { turnId: "0" } },
		{ type: "assistant.message", id: "poc-48", parentId: "poc-39", data: {} },
		{ type: "assistant.turn_end", id: "poc-51", parentId: "poc-48", data: { turnId: "0" } },
		{ type: "assistant.idle", id: "poc-53", parentId: "poc-51", ephemeral: true, data: {} },
		{ type: "session.idle", id: "poc-54", parentId: "poc-51", ephemeral: true, data: {} },
	];
	f.native.send = async () => "native-poc-second";
	const run = f.bridge.run();
	await f.accepted.promise;
	for (const event of events.slice(0, -1)) f.event(event);
	await flush();
	assert.equal(f.trace.filter((x) => x === "claim").length, 1);
	f.event(events.at(-1));
	await flush();
	assert.equal(f.trace.filter((x) => x === "claim").length, 2);
	assert.ok(f.reports.some((e) => e.kind === "native-completed" && e.eventId === "poc-54"));
	f.bridge.stop();
	await run;
});

test("post-ack interaction anchor repairs the direct product permission gap without inferring idle", async (t) => {
	const f = fixture();
	t.after(() => f.bridge.stop());
	const run = f.bridge.run();
	await f.accepted.promise;
	// PM pm-native-product-recipient.jsonl seq6-44, opaque IDs remapped.
	// permission.requested is absent; external_tool.requested IS visible to the product.
	nativeUser(f, "native-message-137", "product-6", "product-interaction");
	const events = [
		{ type: "system.message", id: "product-7", parentId: "product-6", data: {} },
		{
			type: "assistant.turn_start",
			id: "product-9",
			parentId: "product-7",
			data: { interactionId: "product-interaction", turnId: "0" },
		},
		{
			type: "assistant.message",
			id: "product-18",
			parentId: "product-9",
			data: { interactionId: "product-interaction" },
		},
		{ type: "tool.execution_start", id: "product-19", parentId: "product-18", data: {} },
		{ type: "permission.completed", id: "product-20", parentId: "omitted-permission", data: {} },
		{ type: "external_tool.requested", id: "product-21", parentId: "product-20", data: {} },
		{ type: "external_tool.completed", id: "product-22", parentId: "product-21", data: {} },
		{
			type: "tool.execution_complete",
			id: "product-24",
			parentId: "product-22",
			data: { interactionId: "product-interaction", turnId: "0" },
		},
		{ type: "assistant.turn_end", id: "product-27", parentId: "product-24", data: { turnId: "0" } },
		{
			type: "assistant.turn_start",
			id: "product-29",
			parentId: "product-27",
			data: { interactionId: "product-interaction", turnId: "1" },
		},
		{
			type: "assistant.message",
			id: "product-38",
			parentId: "product-29",
			data: { interactionId: "product-interaction" },
		},
		{ type: "assistant.turn_end", id: "product-41", parentId: "product-38", data: { turnId: "1" } },
		{ type: "assistant.idle", id: "product-43", parentId: "product-41", ephemeral: true, data: {} },
	];
	for (const event of events) f.event(event);
	await flush();
	assert.equal(f.trace.filter((x) => x === "claim").length, 1);
	assert.equal(f.trace.filter((x) => x === "ack").length, 1);
	assert.equal(
		(await f.bridge.send({ to: "pij-peer", message: "explicit while waiting" })).ok,
		true,
	);
	f.event({
		type: "session.idle",
		id: "product-44",
		parentId: "product-41",
		ephemeral: true,
		data: { mode: "interactive" },
	});
	await flush();
	assert.equal(f.trace.filter((x) => x === "claim").length, 2);
	assert.equal(
		f.reports.filter((e) => e.kind === "native-completed" && e.eventId === "product-44").length,
		1,
	);
	f.bridge.stop();
	await run;
});

for (const type of ["assistant.turn_start", "assistant.message", "tool.execution_complete"]) {
	test(`post-ack interaction anchor accepts only the matched foreground ${type}`, async (t) => {
		const f = fixture();
		t.after(() => f.bridge.stop());
		const run = f.bridge.run();
		await f.accepted.promise;
		const anchor = {
			type,
			id: "unbound",
			parentId: "omitted-parent",
			data: { interactionId: "owned-interaction", turnId: "0" },
		};
		// Neither pre-root metadata nor a foreign/subagent user may establish the binding.
		f.event(anchor);
		nativeTerminal(f, anchor.id);
		nativeUser(f, "foreign-native", "foreign-user", "owned-interaction");
		f.event({
			type: "user.message",
			id: "child-user",
			agentId: "child",
			data: { messageId: "native-message-137", interactionId: "owned-interaction" },
		});
		f.event({ ...anchor, id: "still-unbound" });
		nativeTerminal(f, "still-unbound");
		await flush();
		assert.equal(f.trace.filter((x) => x === "claim").length, 1);
		nativeUser(f, "native-message-137", "owned-user", "owned-interaction");
		for (const terminal of ["session.idle", "session.error"]) {
			f.event({ ...anchor, type: terminal, id: terminal });
		}
		for (const rejected of [
			{ ...anchor, id: "foreign", data: { interactionId: "foreign-interaction", turnId: "0" } },
			{ ...anchor, id: "child", agentId: "child" },
			{ ...anchor, id: "turn-only", data: { turnId: "0" } },
		]) {
			f.event(rejected);
			nativeTerminal(f, rejected.id);
		}
		await flush();
		assert.equal(f.trace.filter((x) => x === "claim").length, 1);
		f.event({ ...anchor, id: "owned-anchor" });
		f.event({
			type: "assistant.turn_end",
			id: "owned-end",
			parentId: "owned-anchor",
			data: { turnId: "0" },
		});
		await flush();
		assert.equal(f.trace.filter((x) => x === "claim").length, 1);
		nativeTerminal(f, "owned-end");
		await flush();
		assert.equal(f.trace.filter((x) => x === "claim").length, 2);
		f.bridge.stop();
		await run;
	});
}

for (const interactionId of [undefined, "", "   "]) {
	test(`post-ack interaction anchor rejects absent or blank binding ${JSON.stringify(interactionId)}`, async (t) => {
		const f = fixture();
		t.after(() => f.bridge.stop());
		const run = f.bridge.run();
		await f.accepted.promise;
		const root = nativeUser(f, "native-message-137", "owned-user", interactionId);
		f.event({
			type: "assistant.message",
			id: "unbound-message",
			parentId: "omitted-parent",
			data: { interactionId },
		});
		nativeTerminal(f, "unbound-message");
		await flush();
		assert.equal(f.trace.filter((x) => x === "claim").length, 1);
		// Existing complete ancestry still works without interaction metadata.
		nativeTerminal(f, root);
		await flush();
		assert.equal(f.trace.filter((x) => x === "claim").length, 2);
		f.bridge.stop();
		await run;
	});
}

test("post-ack interaction anchor retains correlation before send acceptance", async (t) => {
	const f = fixture();
	t.after(() => f.bridge.stop());
	const sending = deferred();
	const acceptance = deferred();
	f.native.send = () => {
		nativeUser(f, "early-native", "early-user", "early-interaction");
		f.event({
			type: "tool.execution_complete",
			id: "early-tool",
			parentId: "omitted-permission",
			data: { interactionId: "early-interaction" },
		});
		nativeTerminal(f, "early-tool");
		sending.resolve();
		return acceptance.promise;
	};
	const run = f.bridge.run();
	await sending.promise;
	assert.equal(f.trace.includes("ack"), false);
	acceptance.resolve("early-native");
	await f.accepted.promise;
	await flush();
	assert.equal(f.trace.filter((x) => x === "claim").length, 2);
	assert.equal(f.reports.filter((e) => e.kind === "native-completed").length, 1);
	f.bridge.stop();
	await run;
});

test("claim page preserves typed target and transient hold metadata without changing request data", async () => {
	const target =
		"native-target-session:original-native; resume that native session or use a new seat and intentionally reissue the message";
	for (const [meta, hold] of [
		[undefined, null],
		[null, null],
		["observation-only note", null],
		...[
			"human-typing",
			"native-pane-changed",
			"semantic-hold",
			"sensor-unavailable:tap missing",
			"human-consent",
			"tap-unowned",
			"composer-busy",
			"unrecognized",
		].map((reason) => [`native-consumer-held:${reason}`, { kind: "consent", reason }]),
		[`native-consumer-held:${target}`, { kind: "native-target", reason: target }],
	]) {
		const client = new DaemonClient({
			addr: "127.0.0.1:13700",
			stateDir: "/isolated",
			readKey: async () => "key",
			fetch: async () =>
				new Response(JSON.stringify({ ok: true, command: "pij inbox", v: 2, data: [], meta })),
		});
		assert.deepEqual(await client.claimInbox(tuple), { claims: [], hold });
		assert.deepEqual(await client.request("/v1/seats"), []);
	}
});

test("malformed claim hold metadata is not silently downgraded to an empty inbox", async () => {
	const client = new DaemonClient({
		addr: "127.0.0.1:13700",
		stateDir: "/isolated",
		readKey: async () => "key",
		fetch: async () =>
			new Response(
				JSON.stringify({
					ok: true,
					v: 2,
					data: [],
					meta: { reason: "native-target-session:original-native" },
				}),
			),
	});
	await assert.rejects(client.claimInbox(tuple), /Malformed native inbox hold metadata/);
});

test("only the exact native-unavailable inbox refusal is retryable", async () => {
	const inbox = `/v1/inbox?${new URLSearchParams(tuple)}`;
	const typing = `/v1/inbox/typing?${new URLSearchParams(tuple)}`;
	for (const [label, path, status, envelope, expected] of [
		["claim", inbox, 400, unavailableRefusal, true],
		["ack", "/v1/inbox/ack", 400, unavailableRefusal, true],
		["typing snapshot", typing, 400, unavailableRefusal, true],
		[
			"typing foreign refusal",
			typing,
			400,
			{ ...unavailableRefusal, meta: "native incarnation mismatch" },
			false,
		],
		[
			"typing wrong command",
			typing,
			400,
			{ ...unavailableRefusal, command: "pij register" },
			false,
		],
		["typing wrong version", typing, 400, { ...unavailableRefusal, v: 1 }, false],
		["unrelated endpoint", "/v1/register", 400, unavailableRefusal, false],
		["different status", inbox, 409, unavailableRefusal, false],
		["skew", inbox, 400, { ...unavailableRefusal, v: 1 }, false],
		["wrong category", inbox, 400, { ...unavailableRefusal, error: "adapter" }, false],
		["wrong command", inbox, 400, { ...unavailableRefusal, command: "pij register" }, false],
		["not refusal", inbox, 400, { ...unavailableRefusal, ok: true }, false],
		["missing category", inbox, 400, { ...unavailableRefusal, error: undefined }, false],
		[
			"wrong adapter",
			inbox,
			400,
			{
				...unavailableRefusal,
				meta: unavailableRefusal.meta.replace("daemon/native-inbox", "unrelated"),
			},
			false,
		],
		[
			"stale tuple",
			inbox,
			400,
			{
				...unavailableRefusal,
				meta: "daemon/native-inbox: native incarnation mismatch: native_session, pid and proc_start must match the current Copilot seat",
			},
			false,
		],
		[
			"missing or non-Copilot shared legacy diagnostic",
			inbox,
			400,
			{
				...unavailableRefusal,
				meta: "daemon/native-inbox: native incarnation no longer belongs to a current Copilot seat",
			},
			false,
		],
		[
			"quoted marker",
			inbox,
			400,
			{ ...unavailableRefusal, meta: `stale tuple; previously ${unavailableRefusal.meta}` },
			false,
		],
		[
			"malformed metadata",
			inbox,
			400,
			{ ...unavailableRefusal, meta: { reason: unavailableRefusal.meta } },
			false,
		],
	]) {
		const client = new DaemonClient({
			addr: "127.0.0.1:13700",
			stateDir: "/isolated",
			readKey: async () => "fixture-key",
			fetch: async () => new Response(JSON.stringify(envelope), { status }),
		});
		await assert.rejects(client.request(path), (error) => {
			assert.equal(error.retryable, expected, label);
			return true;
		});
	}
});

test("native-unavailable retries re-register with bounded backoff and stop cleanly", async () => {
	let registrations = 0;
	let claims = 0;
	const waits = [];
	const client = new DaemonClient({
		addr: "127.0.0.1:13700",
		stateDir: "/isolated",
		readKey: async () => "fixture-key",
		fetch: async (url) => {
			if (new URL(url).pathname === "/v1/register") {
				registrations++;
				return new Response(JSON.stringify({ ok: true, v: 2, data: descriptor }));
			}
			assert.equal(new URL(url).pathname, "/v1/inbox");
			claims++;
			return new Response(JSON.stringify(unavailableRefusal), { status: 400 });
		},
	});
	const f = fixture({
		client,
		delay: async (ms) => {
			waits.push(ms);
			if (waits.length === 8) f.bridge.stop();
		},
	});
	await f.bridge.run();
	assert.deepEqual(waits, [250, 500, 1000, 2000, 4000, 5000, 5000, 5000]);
	assert.equal(registrations, 8);
	assert.equal(claims, 8);
	assert.equal(f.trace.includes("send"), false);
	assert.equal(f.trace.includes("ack"), false);
	assert.equal(f.reports.filter((event) => event.kind === "reconnecting").length, 1);
	assert.equal(f.trace.at(-1), "unsubscribe");
});

test("typing snapshot GET binds exact tuple and current bearer key over real HTTP", async (t) => {
	let snapshot = observedTyping({ retry_after_ms: 1200 });
	const { client, requests } = await deadlineHttpFixture(t, (_entry, response) => {
		response.end(JSON.stringify({ ok: true, command: "pij inbox", v: 2, data: snapshot }));
	});
	assert.deepEqual(await client.typingSnapshot(tuple), snapshot);
	client.readKey = async () => "rotated-typing-key";
	snapshot = unavailableTyping();
	assert.deepEqual(await client.typingSnapshot(tuple), snapshot);
	assert.deepEqual(
		requests.map(({ authorization }) => authorization),
		["Bearer deadline-key", "Bearer rotated-typing-key"],
	);
	for (const request of requests) {
		assert.equal(request.method, "GET");
		assert.equal(request.url.pathname, "/v1/inbox/typing");
		assert.deepEqual(
			[...request.url.searchParams].sort(),
			Object.entries(tuple)
				.map(([key, value]) => [key, String(value)])
				.sort(),
		);
		assert.equal(request.body, undefined);
	}
});

test("typing snapshot rejects malformed state tuple grace time retry and source over HTTP", async (t) => {
	let snapshot;
	const { client, requests } = await deadlineHttpFixture(t, (_entry, response) => {
		response.end(JSON.stringify({ ok: true, command: "pij inbox", v: 2, data: snapshot }));
	});
	for (const [label, invalid] of [
		["null", null],
		["array", []],
		["unknown state", observedTyping({ state: "quiet" })],
		["missing proof", observedTyping({ native_consumer: undefined })],
		[
			"wrong session",
			observedTyping({ native_consumer: { ...claim.native_consumer, native_session: "other" } }),
		],
		["wrong pid", observedTyping({ native_consumer: { ...claim.native_consumer, pid: 138 } })],
		[
			"wrong start",
			observedTyping({ native_consumer: { ...claim.native_consumer, proc_start: 1 } }),
		],
		["string pid", observedTyping({ native_consumer: { ...claim.native_consumer, pid: "137" } })],
		["missing grace", observedTyping({ typing_grace_ms: undefined })],
		["negative grace", observedTyping({ typing_grace_ms: -1 })],
		["fractional grace", observedTyping({ typing_grace_ms: 0.5 })],
		["unsafe grace", observedTyping({ typing_grace_ms: Number.MAX_SAFE_INTEGER + 1 })],
		["missing time", observedTyping({ observed_at_ms: undefined })],
		["negative time", observedTyping({ observed_at_ms: -1 })],
		["fractional time", observedTyping({ observed_at_ms: 1.5 })],
		["unsafe time", observedTyping({ observed_at_ms: Number.MAX_SAFE_INTEGER + 1 })],
		["missing retry", observedTyping({ retry_after_ms: undefined })],
		["negative retry", observedTyping({ retry_after_ms: -1 })],
		["fractional retry", observedTyping({ retry_after_ms: 0.5 })],
		["retry beyond grace", observedTyping({ retry_after_ms: 60001 })],
		["missing semantic hold", observedTyping({ semantic_hold: undefined })],
		["string semantic hold", observedTyping({ semantic_hold: "false" })],
		["missing source", observedTyping({ source: undefined })],
		["output is not typing", observedTyping({ source: "pane-output" })],
		["unavailable wrong reason", unavailableTyping({ reason: "unknown" })],
		[
			"unavailable mismatched proof",
			unavailableTyping({ native_consumer: { ...claim.native_consumer, pid: 138 } }),
		],
		["unavailable malformed grace", unavailableTyping({ typing_grace_ms: "60000" })],
		["unavailable missing time", unavailableTyping({ observed_at_ms: undefined })],
		["unavailable missing semantic hold", unavailableTyping({ semantic_hold: undefined })],
	]) {
		snapshot = invalid;
		await assert.rejects(
			client.typingSnapshot(tuple),
			(error) => {
				assert.notEqual(error.retryable, true, label);
				return true;
			},
			label,
		);
	}
	assert.ok(requests.every(({ url }) => url.pathname === "/v1/inbox/typing"));
});

test("typing snapshot accepts aged draft quiet and explicit zero grace without adding a second grace", async (t) => {
	let snapshot = observedTyping();
	const { client } = await deadlineHttpFixture(t, (_entry, response) => {
		response.end(JSON.stringify({ ok: true, command: "pij inbox", v: 2, data: snapshot }));
	});
	// The daemon has already applied observed-edit recency; no composer content is required.
	assert.deepEqual(await client.typingSnapshot(tuple), snapshot);
	snapshot = observedTyping({ typing_grace_ms: 0 });
	assert.deepEqual(await client.typingSnapshot(tuple), snapshot);
});

test("new native send waits for current typing snapshot before creating durable intent", async (t) => {
	const snapshot = deferred();
	const f = fixture();
	t.after(() => f.bridge.stop());
	let reads = 0;
	f.client.typingSnapshot = (consumer, signal) => {
		reads++;
		assert.deepEqual(consumer, tuple);
		assert.equal(signal.aborted, false);
		return snapshot.promise;
	};
	const run = f.bridge.run();
	await flush();
	assert.equal(reads, 1);
	assert.equal(f.records.size, 0);
	assert.equal(f.trace.includes("send"), false);
	assert.equal(f.trace.includes("ack"), false);
	snapshot.resolve(observedTyping());
	await f.accepted.promise;
	f.bridge.stop();
	await run;
	assert.equal(f.trace.filter((step) => step === "send").length, 1);
});

test("recent typing renews holds then quiet releases with injected now and reclaims instead of sending stale claim", async (t) => {
	const waits = [];
	const bodies = [];
	const snapshots = [
		observedTyping({ retry_after_ms: 1200 }),
		observedTyping({ observed_at_ms: 101000, retry_after_ms: 60000 }),
		observedTyping({ observed_at_ms: 161000 }),
		observedTyping({ observed_at_ms: 161001 }),
	];
	const fresh = {
		...claim,
		job_id: 138,
		message: { ...claim.message, msg_id: "fresh-138", body: "ONLY_FRESH_RECLAIM" },
	};
	const f = fixture({
		now: () => 161137,
		delay: (ms, signal) => {
			const gate = deferred();
			waits.push({ ms, signal, ...gate });
			return gate.promise;
		},
	});
	t.after(() => f.bridge.stop());
	f.client.typingSnapshot = async (consumer) => {
		assert.deepEqual(consumer, tuple);
		f.trace.push("typing");
		assert.ok(snapshots.length, "Unexpected extra sensor read or local second grace");
		return snapshots.shift();
	};
	let claims = 0;
	f.client.claimInbox = async () => {
		f.trace.push("claim");
		if (++claims === 2) assert.equal(f.trace.includes("release"), true);
		return { claims: [claims === 1 ? claim : fresh], hold: null };
	};
	const request = f.client.request;
	f.client.request = async (path, body, signal) => {
		if (path === "/v1/hold" || path === "/v1/release") bodies.push({ path, body });
		if (path === "/v1/inbox/ack") {
			assert.deepEqual(body, { ...tuple, job_id: fresh.job_id });
			f.trace.push("ack");
			return fresh.job_id;
		}
		return request(path, body, signal);
	};
	const nativeSend = f.native.send;
	f.native.send = async (input) => {
		assert.equal(claims, 2);
		assert.match(input.prompt, /ONLY_FRESH_RECLAIM/);
		assert.equal(input.prompt.includes(claim.message.body), false);
		return nativeSend(input);
	};
	const run = f.bridge.run();
	await flush();
	assert.deepEqual(bodies[0], {
		path: "/v1/hold",
		body: {
			job_id: 137,
			seat: tuple.seat,
			msg_id: claim.message.msg_id,
			reason: "human-typing",
			since_ms: 41200,
		},
	});
	assert.equal(f.records.size, 0);
	assert.equal(f.trace.includes("send"), false);
	assert.equal(f.trace.includes("ack"), false);
	assert.equal(
		(await f.bridge.send({ to: "pij-peer", message: "outgoing while typing" })).ok,
		true,
	);
	waits[0].resolve();
	await flush();
	assert.equal(waits.length, 2);
	assert.equal(f.trace.includes("release"), false);
	assert.equal(f.records.size, 0);
	assert.equal(claims, 1);
	assert.ok(waits.every(({ ms, signal }) => ms >= 250 && ms <= 5000 && !signal.aborted));
	waits[1].resolve();
	await f.accepted.promise;
	f.bridge.stop();
	await run;
	assert.deepEqual(
		bodies.find(({ path }) => path === "/v1/release"),
		{
			path: "/v1/release",
			body: { job_id: 137, seat: tuple.seat, msg_id: claim.message.msg_id, at_ms: 161137 },
		},
	);
	assert.equal(f.records.has(claim.message.msg_id), false);
	assert.equal(f.records.get(fresh.message.msg_id).state, "accepted");
	assert.equal(f.trace.filter((step) => step === "send").length, 1);
	assert.equal(snapshots.length, 0);
	assert.ok(f.trace.indexOf("release") < f.trace.lastIndexOf("claim"));
	assert.ok(f.trace.lastIndexOf("typing") < f.trace.indexOf("intent"));
});

test("typing sensor polling backs off within existing 250 to 5000 cadence", async (t) => {
	const waits = [];
	const f = fixture({
		delay: async (ms) => {
			waits.push(ms);
			if (waits.length === 8) f.bridge.stop();
		},
	});
	t.after(() => f.bridge.stop());
	let reads = 0;
	f.client.typingSnapshot = async () => {
		reads++;
		return observedTyping({ observed_at_ms: 100000 + reads * 5000, retry_after_ms: 60000 });
	};
	const run = f.bridge.run();
	await flush();
	assert.equal(f.trace.includes("send"), false);
	await run;
	assert.deepEqual(waits, [250, 500, 1000, 2000, 4000, 5000, 5000, 5000]);
	assert.equal(reads, 8);
	assert.equal(f.records.size, 0);
	assert.equal(f.trace.includes("release"), false);
	assert.equal(f.trace.includes("ack"), false);
});

for (const initiallyTyping of [false, true]) {
	test(`semantic Hold remains authoritative ${initiallyTyping ? "after recent typing becomes quiet" : "on a quiet snapshot"}`, async (t) => {
		const waits = [];
		const f = fixture({
			delay: (ms, signal) => {
				const gate = deferred();
				waits.push({ ms, signal, ...gate });
				return gate.promise;
			},
		});
		t.after(() => f.bridge.stop());
		let reads = 0;
		f.client.typingSnapshot = async () =>
			observedTyping(
				initiallyTyping && reads++ === 0 ? { retry_after_ms: 1200 } : { semantic_hold: true },
			);
		const run = f.bridge.run();
		await flush();
		assert.equal(f.trace.includes("send"), false);
		if (initiallyTyping) {
			assert.equal(f.trace.includes("hold"), true);
			waits[0].resolve();
			await flush();
		}
		assert.equal(f.trace.includes("release"), false);
		assert.equal(f.trace.includes("ack"), false);
		assert.equal(f.records.size, 0);
		assert.equal(
			(await f.bridge.send({ to: "pij-peer", message: "operator Hold outgoing" })).ok,
			true,
		);
		f.bridge.stop();
		for (const wait of waits) wait.resolve();
		await run;
	});
}

for (const [label, snapshot] of [
	["unavailable", unavailableTyping()],
	["malformed", observedTyping({ retry_after_ms: "quiet" })],
	["mismatched", observedTyping({ native_consumer: { ...claim.native_consumer, pid: 138 } })],
]) {
	test(`${label} typing observation visibly holds receiving while outgoing remains usable`, async (t) => {
		const paths = [];
		const client = new DaemonClient({
			addr: "127.0.0.1:13700",
			stateDir: "/isolated",
			readKey: async () => "sensor-secret",
			fetch: async (input, init) => {
				const path = new URL(input).pathname;
				paths.push(path);
				let data;
				if (path === "/v1/register") data = descriptor;
				else if (path === "/v1/inbox") data = [claim];
				else if (path === "/v1/inbox/typing") data = snapshot;
				else if (path === "/v1/send") data = { msg_id: JSON.parse(init.body).msg_id };
				else if (path === "/v1/inbox/ack") data = claim.job_id;
				else assert.fail(`Unexpected typing-held request ${path}`);
				return new Response(JSON.stringify({ ok: true, v: 2, data }));
			},
		});
		const f = fixture({ client });
		t.after(() => f.bridge.stop());
		const run = f.bridge.run();
		await flush();
		assert.equal(f.trace.includes("send"), false);
		await run;
		assert.equal(f.records.size, 0);
		assert.equal(paths.includes("/v1/inbox/ack"), false);
		assert.equal(paths.filter((path) => path === "/v1/inbox").length, 1);
		const notices = f.reports.filter((event) => event.kind === "receive-held");
		assert.equal(notices.length, 1);
		assert.match(notices[0].diagnostic, /typing[- ]sensor/i);
		assert.equal(JSON.stringify(notices).includes("sensor-secret"), false);
		assert.equal(
			(await f.bridge.send({ to: "pij-peer", message: "sensor held outgoing" })).ok,
			true,
		);
	});
}

for (const phase of ["snapshot", "poll delay"]) {
	test(`shutdown during typing ${phase} cancels old-context work without release intent send or ACK`, async (t) => {
		const blocked = deferred();
		let observedSignal;
		const f = fixture({
			delay: (_ms, signal) => {
				observedSignal = signal;
				return new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
			},
		});
		t.after(() => f.bridge.stop());
		f.client.typingSnapshot = (_consumer, signal) => {
			observedSignal = signal;
			return phase === "snapshot" ? blocked.promise : observedTyping({ retry_after_ms: 1200 });
		};
		const run = f.bridge.run();
		await flush();
		assert.ok(observedSignal);
		assert.equal(f.trace.includes("send"), false);
		f.event({ type: "session.shutdown", data: {} });
		assert.equal(observedSignal.aborted, true);
		await run;
		blocked.resolve(observedTyping());
		await flush();
		assert.equal(f.records.size, 0);
		assert.equal(f.trace.includes("release"), false);
		assert.equal(f.trace.includes("ack"), false);
		assert.equal(f.trace.filter((step) => step === "claim").length, 1);
		assert.equal(f.trace.filter((step) => step === "unsubscribe").length, 1);
	});
}

test("deferred claim re-offered after restart rechecks sensor before any new intent", async (t) => {
	const home = await mkdtemp(join(tmpdir(), "pij-native-typing-restart-"));
	t.after(() => rm(home, { recursive: true, force: true }));
	for (let incarnation = 0; incarnation < 2; incarnation++) {
		const journal = new FileJournal(home, registration);
		const f = fixture({ journal, delay: async () => f.bridge.stop() });
		t.after(() => f.bridge.stop());
		let reads = 0;
		f.client.typingSnapshot = async () => {
			reads++;
			return observedTyping({ observed_at_ms: 100000 + incarnation * 1000, retry_after_ms: 60000 });
		};
		const run = f.bridge.run();
		await run;
		assert.equal(reads, 1);
		assert.equal(f.trace.includes("send"), false);
		assert.equal(f.trace.includes("hold"), true);
		assert.equal(f.trace.includes("ack"), false);
		assert.equal(await journal.load(claim.message.msg_id), undefined);
	}
});

for (const [endpoint, reason] of [
	["hold", "absent"],
	["hold", "terminal"],
	["release", "not-deferred"],
	["release", "absent"],
	["release", "terminal"],
]) {
	test(`typing ${endpoint} noop ${reason} discards old claim and reclaims without stale delivery`, async (t) => {
		const f = fixture({ delay: async () => undefined, now: () => 160137 });
		t.after(() => f.bridge.stop());
		let reads = 0;
		let claims = 0;
		const receipts = [];
		f.client.typingSnapshot = async () =>
			observedTyping({ retry_after_ms: reads++ === 0 ? 1200 : 0 });
		f.client.claimInbox = async () => {
			if (++claims === 1) return { claims: [claim], hold: null };
			f.bridge.stop();
			return { claims: [], hold: null };
		};
		const request = f.client.request;
		f.client.request = async (path, body, signal) => {
			if (path === `/v1/${endpoint}`) {
				receipts.push(body);
				return {
					msg_id: body.msg_id,
					[endpoint === "hold" ? "held" : "released"]: false,
					noop: true,
					reason,
				};
			}
			return request(path, body, signal);
		};
		const run = f.bridge.run();
		await flush();
		assert.equal(f.trace.includes("send"), false);
		await run;
		assert.equal(claims, 2);
		assert.equal(reads, endpoint === "hold" ? 1 : 2);
		assert.equal(receipts.length, 1);
		assert.equal(receipts[0].msg_id, claim.message.msg_id);
		assert.equal(f.records.size, 0);
		assert.equal(f.trace.includes("ack"), false);
	});
}

test("typing snapshot HTTP wait is externally abortable and its deadline is not inbox renewal", async (t) => {
	const controller = new AbortController();
	const reason = new DOMException("Typing consumer stopped", "AbortError");
	const { client, requests } = await deadlineHttpFixture(t, () => controller.abort(reason));
	await assert.rejects(
		client.typingSnapshot(tuple, controller.signal),
		(error) => error === reason,
	);
	assert.equal(requests.length, 1);
	const stalled = await deadlineHttpFixture(t, () => undefined);
	await assert.rejects(stalled.client.typingSnapshot(tuple), { retryable: true });
});

for (const duplicate of [false, true]) {
	test(`ACK-stage release declares ${duplicate ? "accepted recovery" : "quiet new acceptance"} on the same claim without reclaim`, async (t) => {
		const receipt = deferred();
		const f = fixture({ now: () => 170137 });
		t.after(() => f.bridge.stop());
		if (duplicate)
			f.records.set(claim.message.msg_id, {
				state: "accepted",
				message: claim.message,
				nativeId: "previous-native",
			});
		let releases = 0;
		const request = f.client.request;
		f.client.request = (path, body, signal) => {
			if (path === "/v1/release") {
				releases++;
				assert.deepEqual(body, {
					job_id: claim.job_id,
					seat: tuple.seat,
					msg_id: claim.message.msg_id,
					at_ms: 170137,
				});
				assert.equal(f.records.get(claim.message.msg_id).state, "accepted");
				assert.equal(f.trace.filter((step) => step === "claim").length, 1);
				return receipt.promise;
			}
			return request(path, body, signal);
		};
		const run = f.bridge.run();
		await flush();
		assert.equal(releases, 1);
		assert.equal(f.trace.includes("ack"), false);
		assert.equal(f.trace.filter((step) => step === "send").length, duplicate ? 0 : 1);
		assert.equal(f.trace.filter((step) => step === "typing").length, duplicate ? 0 : 1);
		receipt.resolve({
			msg_id: claim.message.msg_id,
			released: false,
			noop: true,
			reason: "not-deferred",
		});
		await f.accepted.promise;
		f.bridge.stop();
		await run;
		assert.equal(f.trace.filter((step) => step === "claim").length, 1);
		assert.equal(f.trace.filter((step) => step === "ack").length, 1);
	});
}

test("successful held release is reused before ACK when the same job is freshly reclaimed", async (t) => {
	const f = fixture({ delay: async () => undefined, now: () => 170137 });
	t.after(() => f.bridge.stop());
	let reads = 0;
	let claims = 0;
	let releases = 0;
	f.client.typingSnapshot = async () =>
		observedTyping({ retry_after_ms: reads++ === 0 ? 1200 : 0 });
	f.client.claimInbox = async () => {
		claims++;
		return { claims: [claim], hold: null };
	};
	const request = f.client.request;
	f.client.request = (path, body, signal) => {
		if (path === "/v1/release") {
			releases++;
			assert.equal(f.records.size, 0, "The one release belongs to the held phase, not ACK");
		}
		if (path === "/v1/inbox/ack") assert.equal(claims, 2);
		return request(path, body, signal);
	};
	const run = f.bridge.run();
	await f.accepted.promise;
	f.bridge.stop();
	await run;
	assert.equal(releases, 1);
	assert.equal(reads, 3);
	assert.equal(f.trace.filter((step) => step === "send").length, 1);
	assert.equal(f.trace.filter((step) => step === "ack").length, 1);
});

for (const failure of ["release", "ack"]) {
	test(`ACK-stage ${failure} retry preserves acceptance and reuses only successful release declarations`, async (t) => {
		const f = fixture({ delay: async () => undefined, now: () => 170137 });
		t.after(() => f.bridge.stop());
		const send = f.native.send;
		f.native.send = async (input) => {
			const id = await send(input);
			nativeTerminal(f, nativeUser(f, id));
			return id;
		};
		let claims = 0;
		let releases = 0;
		let acks = 0;
		const claimsAtAck = [];
		f.client.claimInbox = async (_consumer, signal) => {
			if (++claims <= 2) return { claims: [claim], hold: null };
			return new Promise((resolve) =>
				signal.addEventListener("abort", () => resolve({ claims: [], hold: null }), { once: true }),
			);
		};
		const request = f.client.request;
		f.client.request = (path, body, signal) => {
			if (path === "/v1/release") {
				releases++;
				assert.equal(f.records.get(claim.message.msg_id).state, "accepted");
				if (failure === "release" && releases === 1)
					throw Object.assign(
						new Error("Release declaration request failed before remote mutation"),
						{ retryable: true },
					);
			}
			if (path === "/v1/inbox/ack") {
				claimsAtAck.push(claims);
				if (failure === "ack" && ++acks === 1)
					throw Object.assign(new Error("ACK request failed before remote mutation"), {
						retryable: true,
					});
			}
			return request(path, body, signal);
		};
		const run = f.bridge.run();
		await flush();
		assert.equal(releases, failure === "release" ? 2 : 1);
		await f.accepted.promise;
		f.bridge.stop();
		await run;
		assert.deepEqual(claimsAtAck, failure === "release" ? [2] : [1, 2]);
		assert.equal(f.trace.filter((step) => step === "send").length, 1);
		assert.equal(f.trace.filter((step) => step === "typing").length, 1);
		assert.equal(f.trace.filter((step) => step === "persist").length, 1);
		assert.equal(f.trace.filter((step) => step === "ack").length, 1);
	});
}

test("renewed typing on a reclaimed job invalidates its earlier release declaration", async (t) => {
	const f = fixture({ delay: async () => undefined, now: () => 170137 });
	t.after(() => f.bridge.stop());
	const retries = [1200, 0, 60000, 0, 0];
	let claims = 0;
	let holds = 0;
	let releases = 0;
	f.client.typingSnapshot = async () => {
		assert.ok(retries.length);
		return observedTyping({ retry_after_ms: retries.shift() });
	};
	f.client.claimInbox = async () => {
		claims++;
		return { claims: [claim], hold: null };
	};
	const request = f.client.request;
	f.client.request = (path, body, signal) => {
		if (path === "/v1/hold") holds++;
		if (path === "/v1/release") {
			releases++;
			assert.equal(f.records.size, 0);
			assert.equal(releases, holds, "Every new hold needs a fresh release declaration");
		}
		if (path === "/v1/inbox/ack") assert.equal(claims, 3);
		return request(path, body, signal);
	};
	const run = f.bridge.run();
	await f.accepted.promise;
	f.bridge.stop();
	await run;
	assert.equal(holds, 2);
	assert.equal(releases, 2);
	assert.equal(retries.length, 0);
	assert.equal(f.trace.filter((step) => step === "send").length, 1);
	assert.equal(f.trace.filter((step) => step === "ack").length, 1);
});

test("initial quiet semantic Hold clearance discards the old claim and gates freshly reclaimed work", async (t) => {
	const clearance = deferred();
	const fresh = {
		...claim,
		job_id: 138,
		message: {
			...claim.message,
			msg_id: "operator-cleared-138",
			body: "FRESH_AFTER_OPERATOR_CLEARANCE",
		},
	};
	let waits = 0;
	const f = fixture({
		now: () => 170137,
		delay: (ms, signal) => {
			waits++;
			assert.ok(ms >= 250 && ms <= 5000);
			assert.equal(signal.aborted, false);
			return clearance.promise;
		},
	});
	t.after(() => f.bridge.stop());
	let claims = 0;
	let reads = 0;
	const releases = [];
	f.client.claimInbox = async (consumer) => {
		assert.deepEqual(consumer, tuple);
		f.trace.push("claim");
		return { claims: [++claims === 1 ? claim : fresh], hold: null };
	};
	f.client.typingSnapshot = async (consumer) => {
		assert.deepEqual(consumer, tuple);
		f.trace.push("typing");
		reads++;
		assert.equal(reads, claims, "The next sensor check must follow a fresh claim");
		return observedTyping({ semantic_hold: reads === 1 });
	};
	const request = f.client.request;
	f.client.request = (path, body, signal) => {
		if (path === "/v1/release") {
			releases.push(body);
			assert.equal(f.records.get(fresh.message.msg_id).state, "accepted");
		}
		if (path === "/v1/inbox/ack") {
			assert.deepEqual(body, { ...tuple, job_id: fresh.job_id });
			f.trace.push("ack");
			return fresh.job_id;
		}
		return request(path, body, signal);
	};
	const send = f.native.send;
	f.native.send = (input) => {
		assert.equal(claims, 2);
		assert.equal(reads, 2);
		assert.match(input.prompt, /FRESH_AFTER_OPERATOR_CLEARANCE/);
		assert.equal(input.prompt.includes(claim.message.body), false);
		return send(input);
	};
	const run = f.bridge.run();
	await flush();
	assert.equal(waits, 1);
	assert.equal(claims, 1);
	assert.equal(reads, 1);
	assert.equal(f.records.size, 0);
	assert.equal(f.trace.includes("hold"), false);
	assert.equal(f.trace.includes("release"), false);
	assert.equal(f.trace.includes("send"), false);
	assert.equal(f.trace.includes("ack"), false);
	clearance.resolve();
	await f.accepted.promise;
	f.bridge.stop();
	await run;
	assert.equal(waits, 1);
	assert.equal(claims, 2);
	assert.equal(reads, 2);
	assert.equal(f.trace.includes("hold"), false);
	assert.equal(f.records.has(claim.message.msg_id), false);
	assert.deepEqual(releases, [
		{ job_id: 138, seat: tuple.seat, msg_id: fresh.message.msg_id, at_ms: 170137 },
	]);
	assert.deepEqual(
		f.trace.filter((step) =>
			["claim", "typing", "intent", "send", "persist", "release", "ack"].includes(step),
		),
		["claim", "typing", "claim", "typing", "intent", "send", "persist", "release", "ack"],
	);
});
