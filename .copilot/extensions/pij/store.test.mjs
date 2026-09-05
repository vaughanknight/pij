import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
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
	assert.deepEqual(f.trace.slice(0, 7), [
		"subscribe",
		"register",
		"claim",
		"intent",
		"send",
		"persist",
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

function nativeUser(f, nativeId, id = `user-${nativeId}`) {
	f.event({
		type: "user.message",
		id,
		parentId: "previous",
		data: { messageId: nativeId, turnId: `turn-${nativeId}` },
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
	nativeTerminal(f, nativeUser(f, "native-1"));
	await flush();
	assert.equal(sends, 2);
	assert.equal(claims, 2);
	const currentUser = nativeUser(f, "native-2");
	nativeTerminal(f, "user-native-1");
	f.event({
		type: "user.message",
		id: "user-native-1",
		parentId: currentUser,
		data: { messageId: "native-1" },
	});
	nativeTerminal(f, "user-native-1");
	await flush();
	assert.equal(claims, 2);
	nativeTerminal(f, currentUser);
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
	for (const [label, path, status, envelope, expected] of [
		["claim", inbox, 400, unavailableRefusal, true],
		["ack", "/v1/inbox/ack", 400, unavailableRefusal, true],
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
