import { describe, expect, it } from "vitest";
import { FakeBatonNoticeSink, FakeBatonStore } from "../../adapters/fakes.js";
import {
	type BatonDefinition,
	type BatonLease,
	type BatonResult,
	BatonService,
	blockedTimeMs,
	createBaton,
	planGrant,
	planHolderTransition,
	planRelease,
	planRequest,
} from "./baton.js";
import { dispatchOrchestration, parseOrchestrationArgs } from "./cli.js";

const T0 = "2026-07-11T09:00:00.000Z";
const T1 = "2026-07-11T09:05:00.000Z";

function baton(overrides: Partial<BatonDefinition> = {}): BatonDefinition {
	return {
		name: "git-index",
		resource: "shared git index and commit slot",
		repo: "/repo",
		createdBy: "pij-prime",
		createdAt: T0,
		queue: [],
		...overrides,
	};
}

function lease(overrides: Partial<BatonLease> = {}): BatonLease {
	return {
		leaseId: "lease-1",
		holder: "pij-worker",
		purpose: "land phase 1",
		grantedBy: "pij-prime",
		requestedAt: T0,
		grantedAt: T1,
		...overrides,
	};
}

class InterleavingBatonStore extends FakeBatonStore {
	beforeFirstClaim?: () => void;
	private claimStarted = false;

	override claimLease(name: string, activeLease: BatonLease): BatonResult<"claimed" | "held"> {
		if (!this.claimStarted) {
			this.claimStarted = true;
			this.beforeFirstClaim?.();
		}
		return super.claimLease(name, activeLease);
	}
}

describe("baton lifecycle decisions", () => {
	it("creates a definition and queues a purpose-carrying request", () => {
		const definition = createBaton(
			{
				name: "dotnet",
				resource: "one repo-wide build/test window",
				probe: "pgrep dotnet",
				repo: "/repo",
				createdBy: "pij-prime",
			},
			T0,
		);
		const result = planRequest(
			definition,
			{
				requester: "pij-worker",
				purpose: "run integration tests",
				pin: "abc123",
				declaredEvidence: "just test output",
			},
			"request-1",
			T1,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.definition.queue).toEqual([
			{
				id: "request-1",
				requester: "pij-worker",
				purpose: "run integration tests",
				pin: "abc123",
				declaredEvidence: "just test output",
				requestedAt: T1,
			},
		]);
		expect(result.value.log).toMatchObject({
			baton: "dotnet",
			actor: "pij-worker",
			verb: "request",
			purpose: "run integration tests",
		});
	});

	function service(
		store: FakeBatonStore,
		notices: FakeBatonNoticeSink,
		at = Date.parse(T1),
		id = "test-id",
	): BatonService {
		return new BatonService({
			store,
			notices,
			now: () => at,
			newId: () => id,
		});
	}

	describe("BatonService notices and receipts", () => {
		it("pushes request notices to the definition creator and surfaces queued", () => {
			const store = new FakeBatonStore([baton()]);
			const notices = new FakeBatonNoticeSink("queued");
			const result = service(store, notices).request({
				name: "git-index",
				requester: "pij-worker",
				purpose: "stage the commit",
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.value.receipt.state).toBe("queued");
			expect(notices.outbox).toEqual([
				expect.objectContaining({
					kind: "request",
					from: "pij-worker",
					to: "pij-prime",
					baton: "git-index",
				}),
			]);
			expect(store.logs.map((entry) => entry.verb)).toEqual(["request"]);
		});

		it("pushes grants to the selected holder and renders the receipt state", () => {
			const store = new FakeBatonStore([
				baton({
					queue: [
						{
							id: "request-b",
							requester: "pij-b",
							purpose: "land dependency-ready work",
							requestedAt: T0,
						},
					],
				}),
			]);
			const notices = new FakeBatonNoticeSink("delivered");
			const parsed = parseOrchestrationArgs(["baton", "grant", "git-index", "--to", "request-b"]);
			if (!parsed.ok) throw new Error(parsed.message);

			const result = dispatchOrchestration(parsed.command, {
				service: service(store, notices),
				actor: "pij-prime",
				currentHead: () => "head-sha",
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("receipt=delivered");
			expect(notices.outbox).toEqual([
				expect.objectContaining({
					kind: "grant",
					from: "pij-prime",
					to: "pij-b",
				}),
			]);
		});

		it("returns successfully with an honest unverified receipt when delivery is unavailable", () => {
			const store = new FakeBatonStore([baton()]);
			const notices = new FakeBatonNoticeSink("unverified");
			const parsed = parseOrchestrationArgs([
				"baton",
				"request",
				"git-index",
				"--purpose",
				"prepare changes",
				"--json",
			]);
			if (!parsed.ok) throw new Error(parsed.message);

			const result = dispatchOrchestration(parsed.command, {
				service: service(store, notices),
				actor: "pij-worker",
				currentHead: () => null,
			});

			expect(result.exitCode).toBe(0);
			expect(JSON.parse(result.stdout)).toMatchObject({ receipt: { state: "unverified" } });
			expect(store.definitions.get("git-index")?.queue).toHaveLength(1);
		});

		it("pushes returns to the granter and preserves evidence in the machine log", () => {
			const active = lease();
			const store = new FakeBatonStore([baton({ lastLease: active })], [["git-index", active]]);
			const notices = new FakeBatonNoticeSink("delivered");
			const result = service(store, notices).return({
				name: "git-index",
				actor: "pij-worker",
				evidence: "commit abc123",
			});

			expect(result.ok).toBe(true);
			expect(notices.outbox).toEqual([
				expect.objectContaining({
					kind: "return",
					to: "pij-prime",
					evidence: "commit abc123",
				}),
			]);
			expect(store.logs).toEqual([
				expect.objectContaining({ verb: "return", evidence: "commit abc123" }),
			]);
		});

		it("pushes one alert per transition and leaves the lease held", () => {
			const active = lease();
			const store = new FakeBatonStore(
				[
					baton({
						lastLease: active,
						holderHealth: { leaseId: active.leaseId, status: "healthy" },
					}),
				],
				[["git-index", active]],
			);
			const notices = new FakeBatonNoticeSink("queued");
			const coordinator = service(store, notices);

			expect(coordinator.observeHolder("git-index", "stalled")).toMatchObject({
				ok: true,
				value: { kind: "alert", transition: "stalled", receipt: { state: "queued" } },
			});
			expect(coordinator.observeHolder("git-index", "stalled")).toEqual({
				ok: true,
				value: { kind: "none" },
			});
			expect(notices.outbox).toHaveLength(1);
			expect(notices.outbox[0]).toMatchObject({
				kind: "alert",
				to: "pij-prime",
				transition: "stalled",
			});
			expect(store.leases.get("git-index")).toEqual(active);
		});

		it("shows requested, granted, and blocked timing in JSON", () => {
			const active = lease();
			const store = new FakeBatonStore([baton({ lastLease: active })], [["git-index", active]]);
			const parsed = parseOrchestrationArgs(["baton", "show", "git-index", "--json"]);
			if (!parsed.ok) throw new Error(parsed.message);

			const result = dispatchOrchestration(parsed.command, {
				service: service(store, new FakeBatonNoticeSink()),
				actor: "pij-prime",
				currentHead: () => null,
			});

			expect(result.exitCode).toBe(0);
			expect(JSON.parse(result.stdout)).toMatchObject({
				lease: {
					requestedAt: T0,
					grantedAt: T1,
				},
				blockedTimeMs: 5 * 60 * 1000,
			});
		});

		it("renders queued purposes without FIFO or positional labels", () => {
			const store = new FakeBatonStore([
				baton({
					queue: [
						{
							id: "request-z",
							requester: "pij-z",
							purpose: "run the Linux gate",
							requestedAt: T0,
						},
						{
							id: "request-a",
							requester: "pij-a",
							purpose: "land the dependency update",
							requestedAt: T1,
						},
					],
				}),
			]);
			const parsed = parseOrchestrationArgs(["baton", "show", "git-index"]);
			if (!parsed.ok) throw new Error(parsed.message);

			const result = dispatchOrchestration(parsed.command, {
				service: service(store, new FakeBatonNoticeSink()),
				actor: "pij-prime",
				currentHead: () => null,
			});

			expect(result.stdout).toContain("request-z · pij-z · run the Linux gate");
			expect(result.stdout).toContain("request-a · pij-a · land the dependency update");
			expect(result.stdout).not.toMatch(/\b(?:fifo|first|next|position|#[0-9]+)\b/i);
		});
	});

	it("grants any selected queued request and leaves the others queued", () => {
		const withRequests = baton({
			queue: [
				{
					id: "request-a",
					requester: "pij-a",
					purpose: "first in time, not selected",
					requestedAt: T0,
				},
				{
					id: "request-b",
					requester: "pij-b",
					purpose: "dependency-ready work",
					declaredEvidence: "green gate",
					requestedAt: T1,
				},
			],
		});

		const result = planGrant(
			withRequests,
			null,
			{ requestId: "request-b", grantedBy: "pij-prime", currentHead: "def456" },
			"lease-b",
			"2026-07-11T09:10:00.000Z",
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.lease).toMatchObject({
			leaseId: "lease-b",
			holder: "pij-b",
			purpose: "dependency-ready work",
			grantedBy: "pij-prime",
		});
		expect(result.value.definition.queue.map((request) => request.id)).toEqual(["request-a"]);
		expect(result.value.blockedTimeMs).toBe(5 * 60 * 1000);
	});

	it("keeps the losing request queued when concurrent contenders request and immediately grant", () => {
		const store = new InterleavingBatonStore([baton()]);
		const notices = new FakeBatonNoticeSink();
		const contenderA = service(store, notices, Date.parse(T0), "a");
		const contenderB = service(store, notices, Date.parse(T0), "b");
		const requestA = contenderA.request({
			name: "git-index",
			requester: "pij-a",
			purpose: "land branch a",
		});
		expect(requestA.ok).toBe(true);
		if (!requestA.ok) return;

		let competingResult: ReturnType<BatonService["grant"]> | undefined;
		store.beforeFirstClaim = () => {
			const requestB = contenderB.request({
				name: "git-index",
				requester: "pij-b",
				purpose: "land branch b",
			});
			expect(requestB.ok).toBe(true);
			if (!requestB.ok) return;
			competingResult = contenderB.grant({
				name: "git-index",
				requestId: requestB.value.request.id,
				grantedBy: "pij-prime",
				currentHead: "head-sha",
			});
		};

		const firstResult = contenderA.grant({
			name: "git-index",
			requestId: requestA.value.request.id,
			grantedBy: "pij-prime",
			currentHead: "head-sha",
		});

		expect(firstResult).toMatchObject({ ok: false, code: "E-HELD" });
		expect(competingResult).toMatchObject({ ok: true });
		expect(store.leases.size).toBe(1);
		expect(store.leases.get("git-index")).toMatchObject({ holder: "pij-b" });
		expect(store.definitions.get("git-index")?.queue.map((request) => request.id)).toEqual([
			"request-a",
		]);
	});

	it("refuses a second holder while a lease exists", () => {
		const result = planGrant(
			baton({
				queue: [{ id: "request-2", requester: "pij-next", purpose: "next", requestedAt: T1 }],
			}),
			lease(),
			{ requestId: "request-2", grantedBy: "pij-prime", currentHead: null },
			"lease-2",
			T1,
		);

		expect(result).toMatchObject({ ok: false, code: "E-HELD" });
	});

	it("requires an explicit repin when the repo HEAD moved", () => {
		const definition = baton({
			queue: [
				{
					id: "request-pin",
					requester: "pij-worker",
					purpose: "commit prepared changes",
					pin: "old-sha",
					requestedAt: T0,
				},
			],
		});

		const mismatch = planGrant(
			definition,
			null,
			{ requestId: "request-pin", grantedBy: "pij-prime", currentHead: "new-sha" },
			"lease-pin",
			T1,
		);
		expect(mismatch).toMatchObject({
			ok: false,
			code: "E-PIN",
		});

		const repinned = planGrant(
			definition,
			null,
			{
				requestId: "request-pin",
				grantedBy: "pij-prime",
				currentHead: "new-sha",
				repin: true,
			},
			"lease-pin",
			T1,
		);
		expect(repinned.ok).toBe(true);
		if (!repinned.ok) return;
		expect(repinned.value.lease.pin).toBe("new-sha");
		expect(repinned.value.repin).toEqual({ from: "old-sha", to: "new-sha" });
		expect(repinned.value.log).toMatchObject({ pin: "new-sha", previousPin: "old-sha" });
	});

	it("requires explicit acknowledgement when a pinned request HEAD is unavailable", () => {
		const definition = baton({
			queue: [
				{
					id: "request-pin",
					requester: "pij-worker",
					purpose: "commit prepared changes",
					pin: "old-sha",
					requestedAt: T0,
				},
			],
		});

		const unverifiable = planGrant(
			definition,
			null,
			{ requestId: "request-pin", grantedBy: "pij-prime", currentHead: null },
			"lease-pin",
			T1,
		);
		expect(unverifiable).toMatchObject({
			ok: false,
			code: "E-PIN",
			message: expect.stringContaining("HEAD unavailable"),
		});

		const acknowledged = planGrant(
			definition,
			null,
			{
				requestId: "request-pin",
				grantedBy: "pij-prime",
				currentHead: null,
				repin: true,
			},
			"lease-pin",
			T1,
		);
		expect(acknowledged.ok).toBe(true);
		if (!acknowledged.ok) return;
		expect(acknowledged.value.lease).toMatchObject({
			pin: "old-sha",
			repinAck: true,
		});
		expect(acknowledged.value.log).toMatchObject({
			pin: "old-sha",
			repinAck: true,
		});
		expect(acknowledged.value.repin).toBeUndefined();
	});

	describe("BatonService persist-before-mutate ordering", () => {
		it("does not define when the machine log append fails", () => {
			const store = new FakeBatonStore();
			store.failNext("appendLog");

			expect(
				service(store, new FakeBatonNoticeSink()).define({
					name: "git-index",
					resource: "shared git index",
					actor: "pij-prime",
				}),
			).toMatchObject({ ok: false, code: "E-STORE" });
			expect(store.definitions.size).toBe(0);
			expect(store.logs).toEqual([]);
		});

		it("does not queue a request when the machine log append fails", () => {
			const initial = baton();
			const store = new FakeBatonStore([initial]);
			store.failNext("appendLog");

			expect(
				service(store, new FakeBatonNoticeSink()).request({
					name: "git-index",
					requester: "pij-worker",
					purpose: "stage the commit",
				}),
			).toMatchObject({ ok: false, code: "E-STORE" });
			expect(store.definitions.get("git-index")).toEqual(initial);
			expect(store.logs).toEqual([]);
		});

		it("does not claim or dequeue when the grant log append fails", () => {
			const initial = baton({
				queue: [
					{
						id: "request-a",
						requester: "pij-a",
						purpose: "land branch a",
						requestedAt: T0,
					},
				],
			});
			const store = new FakeBatonStore([initial]);
			store.failNext("appendLog");

			expect(
				service(store, new FakeBatonNoticeSink()).grant({
					name: "git-index",
					requestId: "request-a",
					grantedBy: "pij-prime",
					currentHead: "head-sha",
				}),
			).toMatchObject({ ok: false, code: "E-STORE" });
			expect(store.leases.size).toBe(0);
			expect(store.definitions.get("git-index")).toEqual(initial);
		});

		it.each([
			"return",
			"reclaim",
		] as const)("does not %s a lease when the machine log append fails", (kind) => {
			const active = lease();
			const initial = baton({ lastLease: active });
			const store = new FakeBatonStore([initial], [["git-index", active]]);
			store.failNext("appendLog");
			const coordinator = service(store, new FakeBatonNoticeSink());

			const result =
				kind === "return"
					? coordinator.return({ name: "git-index", actor: "pij-worker" })
					: coordinator.reclaim({
							name: "git-index",
							actor: "pij-prime",
							evidence: "holder dead",
						});

			expect(result).toMatchObject({ ok: false, code: "E-STORE" });
			expect(store.leases.get("git-index")).toEqual(active);
			expect(store.definitions.get("git-index")).toEqual(initial);
		});

		it("keeps a reconstructible define log when the definition write fails", () => {
			const store = new FakeBatonStore();
			store.failNext("writeDefinition");

			expect(
				service(store, new FakeBatonNoticeSink()).define({
					name: "git-index",
					resource: "shared git index",
					actor: "pij-prime",
				}),
			).toMatchObject({ ok: false, code: "E-STORE" });
			expect(store.definitions.size).toBe(0);
			expect(store.logs.map((entry) => entry.verb)).toEqual(["define"]);
		});

		it("keeps a reconstructible request log when the definition write fails", () => {
			const initial = baton();
			const store = new FakeBatonStore([initial]);
			store.failNext("writeDefinition");

			expect(
				service(store, new FakeBatonNoticeSink()).request({
					name: "git-index",
					requester: "pij-worker",
					purpose: "stage the commit",
				}),
			).toMatchObject({ ok: false, code: "E-STORE" });
			expect(store.definitions.get("git-index")).toEqual(initial);
			expect(store.logs.map((entry) => entry.verb)).toEqual(["request"]);
		});

		it("keeps a reconstructible grant log when lease publication fails", () => {
			const initial = baton({
				queue: [
					{
						id: "request-a",
						requester: "pij-a",
						purpose: "land branch a",
						requestedAt: T0,
					},
				],
			});
			const store = new FakeBatonStore([initial]);
			store.failNext("claimLease");

			expect(
				service(store, new FakeBatonNoticeSink()).grant({
					name: "git-index",
					requestId: "request-a",
					grantedBy: "pij-prime",
					currentHead: "head-sha",
				}),
			).toMatchObject({ ok: false, code: "E-STORE" });
			expect(store.leases.size).toBe(0);
			expect(store.definitions.get("git-index")).toEqual(initial);
			expect(store.logs.map((entry) => entry.verb)).toEqual(["grant"]);
		});

		it.each([
			"return",
			"reclaim",
		] as const)("keeps a reconstructible %s log when lease release fails", (kind) => {
			const active = lease();
			const store = new FakeBatonStore([baton({ lastLease: active })], [["git-index", active]]);
			store.failNext("releaseLease");
			const coordinator = service(store, new FakeBatonNoticeSink());

			const result =
				kind === "return"
					? coordinator.return({ name: "git-index", actor: "pij-worker" })
					: coordinator.reclaim({
							name: "git-index",
							actor: "pij-prime",
							evidence: "holder dead",
						});

			expect(result).toMatchObject({ ok: false, code: "E-STORE" });
			expect(store.leases.get("git-index")).toEqual(active);
			expect(store.logs.map((entry) => entry.verb)).toEqual([kind]);
		});
	});

	it("logs every appending verb with its exact identity through the service", () => {
		const notices = new FakeBatonNoticeSink();

		const defineStore = new FakeBatonStore();
		expect(
			service(defineStore, notices).define({
				name: "git-index",
				resource: "shared git index",
				actor: "pij-prime",
			}).ok,
		).toBe(true);
		expect(defineStore.logs.map((entry) => entry.verb)).toEqual(["define"]);

		const listStore = new FakeBatonStore([baton()]);
		expect(service(listStore, notices).list("pij-prime").ok).toBe(true);
		expect(listStore.logs.map((entry) => entry.verb)).toEqual(["list"]);

		const showStore = new FakeBatonStore([baton()]);
		expect(service(showStore, notices).show("git-index", "pij-prime").ok).toBe(true);
		expect(showStore.logs.map((entry) => entry.verb)).toEqual(["show"]);

		const requestStore = new FakeBatonStore([baton()]);
		expect(
			service(requestStore, notices).request({
				name: "git-index",
				requester: "pij-worker",
				purpose: "stage the commit",
			}).ok,
		).toBe(true);
		expect(requestStore.logs.map((entry) => entry.verb)).toEqual(["request"]);

		const queued = baton({
			queue: [
				{
					id: "request-a",
					requester: "pij-a",
					purpose: "land branch a",
					requestedAt: T0,
				},
			],
		});
		const grantStore = new FakeBatonStore([queued]);
		expect(
			service(grantStore, notices).grant({
				name: "git-index",
				requestId: "request-a",
				grantedBy: "pij-prime",
				currentHead: "head-sha",
			}).ok,
		).toBe(true);
		expect(grantStore.logs.map((entry) => entry.verb)).toEqual(["grant"]);

		for (const kind of ["return", "reclaim"] as const) {
			const active = lease();
			const releaseStore = new FakeBatonStore(
				[baton({ lastLease: active })],
				[["git-index", active]],
			);
			const coordinator = service(releaseStore, notices);
			const result =
				kind === "return"
					? coordinator.return({ name: "git-index", actor: "pij-worker" })
					: coordinator.reclaim({
							name: "git-index",
							actor: "pij-prime",
							evidence: "holder dead",
						});
			expect(result.ok).toBe(true);
			expect(releaseStore.logs.map((entry) => entry.verb)).toEqual([kind]);
		}

		const active = lease();
		const alertStore = new FakeBatonStore(
			[
				baton({
					lastLease: active,
					holderHealth: { leaseId: active.leaseId, status: "healthy" },
				}),
			],
			[["git-index", active]],
		);
		expect(service(alertStore, notices).observeHolder("git-index", "stalled").ok).toBe(true);
		expect(alertStore.logs.map((entry) => entry.verb)).toEqual(["alert"]);
	});

	it("replays request and grant log timestamps to recover the lease blocked time", () => {
		const store = new FakeBatonStore([baton()]);
		const notices = new FakeBatonNoticeSink();
		const requested = service(store, notices, Date.parse(T0), "history").request({
			name: "git-index",
			requester: "pij-worker",
			purpose: "land the historical change",
		});
		expect(requested.ok).toBe(true);
		if (!requested.ok) return;

		const granted = service(store, notices, Date.parse(T1), "history").grant({
			name: "git-index",
			requestId: requested.value.request.id,
			grantedBy: "pij-prime",
			currentHead: "head-sha",
		});
		expect(granted.ok).toBe(true);
		if (!granted.ok) return;

		expect(store.logs).toEqual([
			expect.objectContaining({
				verb: "request",
				requestId: requested.value.request.id,
				timestamp: T0,
			}),
			expect.objectContaining({
				verb: "grant",
				requestId: requested.value.request.id,
				timestamp: T1,
				blockedTimeMs: 5 * 60 * 1000,
			}),
		]);
		let requestedAt: string | undefined;
		let grantedAt: string | undefined;
		for (const entry of store.logs) {
			if (entry.requestId !== requested.value.request.id) continue;
			if (entry.verb === "request") requestedAt = entry.timestamp;
			if (entry.verb === "grant") grantedAt = entry.timestamp;
		}
		expect(requestedAt).toBe(T0);
		expect(grantedAt).toBe(T1);
		if (requestedAt === undefined || grantedAt === undefined) return;
		const replayedBlockedTimeMs = Date.parse(grantedAt) - Date.parse(requestedAt);
		expect(replayedBlockedTimeMs).toBe(granted.value.blockedTimeMs);
		expect(replayedBlockedTimeMs).toBe(blockedTimeMs(granted.value.lease));
	});

	it("plans return and reclaim as explicit releases with evidence", () => {
		const active = lease();
		const returned = planRelease(
			baton({ lastLease: active }),
			active,
			{ kind: "return", actor: "pij-worker", evidence: "just test: green" },
			"2026-07-11T09:15:00.000Z",
		);
		expect(returned.definition.lastLease).toMatchObject({
			leaseId: "lease-1",
			endedAt: "2026-07-11T09:15:00.000Z",
			endKind: "return",
			evidence: "just test: green",
		});
		expect(returned.noticeTo).toBe("pij-prime");

		const reclaimed = planRelease(
			baton({ lastLease: active }),
			active,
			{ kind: "reclaim", actor: "pij-prime", evidence: "holder pid dead; work not landed" },
			"2026-07-11T09:16:00.000Z",
		);
		expect(reclaimed.definition.lastLease).toMatchObject({
			endKind: "reclaim",
			evidence: "holder pid dead; work not landed",
		});
		expect(reclaimed.noticeTo).toBe("pij-worker");
	});

	it("calculates blocked time from request to grant", () => {
		expect(blockedTimeMs(lease())).toBe(5 * 60 * 1000);
		expect(
			blockedTimeMs(lease({ requestedAt: "bad", grantedAt: "2026-07-11T09:05:00.000Z" })),
		).toBeNull();
	});

	it("alerts once per dead/stalled transition and records recovery without reclaiming", () => {
		const active = lease();
		expect(planHolderTransition(active, undefined, "healthy")).toEqual({
			kind: "record",
			health: { leaseId: "lease-1", status: "healthy" },
		});
		expect(
			planHolderTransition(active, { leaseId: "lease-1", status: "healthy" }, "stalled"),
		).toEqual({
			kind: "alert",
			transition: "stalled",
			health: { leaseId: "lease-1", status: "stalled" },
		});
		expect(
			planHolderTransition(active, { leaseId: "lease-1", status: "stalled" }, "stalled"),
		).toEqual({ kind: "none" });
		expect(
			planHolderTransition(active, { leaseId: "lease-1", status: "stalled" }, "healthy"),
		).toEqual({
			kind: "record",
			health: { leaseId: "lease-1", status: "healthy" },
		});
		expect(
			planHolderTransition(active, { leaseId: "lease-1", status: "healthy" }, "dead"),
		).toMatchObject({ kind: "alert", transition: "dead" });
	});
});
